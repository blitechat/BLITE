/**
 * Voice/Video E2EE using WebRTC Insertable Streams
 *
 * Encrypts encoded media frames with AES-128-GCM between the encoder
 * and RTP packetizer. The mediasoup SFU only sees ciphertext payloads.
 *
 * Frame format:
 *   [header (1 byte)][AES-GCM ciphertext + 16-byte tag][IV (12 bytes)][keyId (1 byte)]
 *
 * Key exchange uses nacl.box (existing identity keys) via socket relay.
 */
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { getSocket } from '../socket'
import { useAuthStore } from '../../stores/authStore'
import { useVoiceStore } from '../../stores/voiceStore'

const { encodeBase64, decodeBase64 } = naclUtil

// ─── Constants ───────────────────────────────────────────────────────────────

const AES_KEY_LENGTH = 128
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEY_ROTATION_GRACE_MS = 2000

// ─── State ───────────────────────────────────────────────────────────────────

interface LocalKeyState {
  key: CryptoKey
  rawKey: Uint8Array
  keyId: number
}

interface PeerKeyState {
  key: CryptoKey
  keyId: number
}

let localKey: LocalKeyState | null = null
let nextKeyId = 0

// Current peer keys indexed by userId
const peerKeys = new Map<string, PeerKeyState>()
// Previous peer keys kept during rotation grace period, indexed by `${userId}:${keyId}`
const previousPeerKeys = new Map<string, { key: CryptoKey; expiry: number }>()

// Incoming keys buffered when our private key was not yet available
interface BufferedKey {
  fromUserId: string
  encrypted: string
  nonce: string
  senderPublicKey: string
  keyId: number
}
const pendingIncomingKeys: BufferedKey[] = []

export function bufferIncomingKey(
  fromUserId: string,
  encrypted: string,
  nonce: string,
  senderPublicKey: string,
  keyId: number
): void {
  // Keep only the latest key per user — no need to accumulate rotations
  const idx = pendingIncomingKeys.findIndex(k => k.fromUserId === fromUserId)
  if (idx >= 0) {
    pendingIncomingKeys[idx] = { fromUserId, encrypted, nonce, senderPublicKey, keyId }
  } else {
    pendingIncomingKeys.push({ fromUserId, encrypted, nonce, senderPublicKey, keyId })
  }
  console.log(`[VoiceE2EE] Buffered incoming key from ${fromUserId} (pending: ${pendingIncomingKeys.length})`)
}

export async function flushPendingIncomingKeys(privateKey: Uint8Array): Promise<void> {
  if (pendingIncomingKeys.length === 0) return
  console.log(`[VoiceE2EE] Flushing ${pendingIncomingKeys.length} buffered peer keys`)
  const keys = pendingIncomingKeys.splice(0)
  for (const k of keys) {
    try {
      await handlePeerVoiceKey(k.fromUserId, k.encrypted, k.nonce, k.senderPublicKey, privateKey, k.keyId)
    } catch (err) {
      console.error(`[VoiceE2EE] Failed to process buffered key from ${k.fromUserId}:`, err)
    }
  }
}

// ─── Feature Detection ───────────────────────────────────────────────────────

// Cache the result of the insertable streams check
let _insertableStreamsSupported: boolean | null = null

export function isInsertableStreamsSupported(): boolean {
  if (_insertableStreamsSupported !== null) return _insertableStreamsSupported

  try {
    // Check for RTCRtpSender.prototype.createEncodedStreams (Chromium-based)
    // AND verify the transport supports encodedInsertableStreams
    if (
      typeof RTCRtpSender === 'undefined' ||
      !('createEncodedStreams' in RTCRtpSender.prototype)
    ) {
      _insertableStreamsSupported = false
      return false
    }

    // Actually test that the API works by creating a temporary PeerConnection
    // with encodedInsertableStreams enabled
    const testPc = new RTCPeerConnection({
      encodedInsertableStreams: true,
    } as any)
    testPc.close()
    _insertableStreamsSupported = true
    console.log('[VoiceE2EE] Insertable Streams API supported')
  } catch {
    _insertableStreamsSupported = false
    console.log('[VoiceE2EE] Insertable Streams API not supported')
  }

  return _insertableStreamsSupported
}

// ─── Key Generation ──────────────────────────────────────────────────────────

export async function generateVoiceKey(): Promise<{ key: CryptoKey; rawKey: Uint8Array; keyId: number }> {
  const rawKey = crypto.getRandomValues(new Uint8Array(AES_KEY_LENGTH / 8))
  const key = await crypto.subtle.importKey(
    'raw',
    rawKey.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
  const keyId = (nextKeyId++) & 0xff
  return { key, rawKey, keyId }
}

// ─── Key Distribution ────────────────────────────────────────────────────────

/**
 * Encrypt our AES voice key for a single peer using nacl.box.
 */
export function encryptVoiceKeyForPeer(
  rawKey: Uint8Array,
  peerPublicKey: string,
  mySecretKey: Uint8Array
): { encrypted: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const pubKey = decodeBase64(peerPublicKey)
  const ciphertext = nacl.box(rawKey, nonce, pubKey, mySecretKey)
  if (!ciphertext) throw new Error('Failed to encrypt voice key for peer')
  return {
    encrypted: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
  }
}

/**
 * Distribute our current voice key to all peers in the channel via socket relay.
 */
export async function distributeKeyToAllPeers(channelId: string): Promise<void> {
  if (!localKey) return

  const socket = getSocket()
  if (!socket) return

  const authState = useAuthStore.getState()
  const privateKey = authState.privateKey
  if (!privateKey) {
    console.warn('[VoiceE2EE] No private key available, cannot distribute voice key')
    return
  }

  const voiceStore = useVoiceStore.getState()
  const peers = voiceStore.peers

  const promises: Promise<void>[] = []
  for (const userId of Object.keys(peers)) {
    promises.push(distributeKeyToPeer(channelId, userId))
  }

  // Wait for all key distributions in parallel
  await Promise.all(promises)
  console.log(`[VoiceE2EE] Distributed key to ${promises.length} peers`)
}

/**
 * Send our voice key to a specific peer.
 */
export async function distributeKeyToPeer(channelId: string, targetUserId: string): Promise<void> {
  console.log(`[VoiceE2EE] distributeKeyToPeer called for ${targetUserId}`)

  if (!localKey) {
    console.log('[VoiceE2EE] No local key yet, cannot distribute')
    return
  }

  const socket = getSocket()
  if (!socket) {
    console.log('[VoiceE2EE] No socket, cannot distribute')
    return
  }

  const authState = useAuthStore.getState()
  const privateKey = authState.privateKey
  if (!privateKey) {
    console.log('[VoiceE2EE] No private key, cannot distribute')
    return
  }

  // We need the peer's public key. Request it from the server via the API.
  // For now we send the encrypted key; the server attaches our publicKey.
  try {
    const { userAPI } = await import('../api')
    const profile = await userAPI.getProfile(targetUserId)
    if (!profile.publicKey) {
      console.warn(`[VoiceE2EE] Peer ${targetUserId} has no public key, skipping E2EE key distribution`)
      return
    }

    const { encrypted, nonce } = encryptVoiceKeyForPeer(
      localKey.rawKey,
      profile.publicKey,
      privateKey
    )

    // Derive our own current public key from the private key so the recipient
    // gets the authoritative key — not a stale value cached in socket.user.
    const myPublicKey = encodeBase64(nacl.box.keyPair.fromSecretKey(privateKey).publicKey)

    console.log(`[VoiceE2EE] Sending voice key to ${targetUserId} (keyId: ${localKey.keyId})`)
    socket.emit('voice:e2ee-key', {
      channelId,
      targetUserId,
      encrypted,
      nonce,
      keyId: localKey.keyId,
      senderPublicKey: myPublicKey,
    })
  } catch (err) {
    console.error(`[VoiceE2EE] Failed to distribute key to ${targetUserId}:`, err)
  }
}

/**
 * Handle receiving a peer's encrypted AES voice key.
 */
export async function handlePeerVoiceKey(
  fromUserId: string,
  encrypted: string,
  nonce: string,
  senderPublicKey: string,
  mySecretKey: Uint8Array,
  keyId: number
): Promise<void> {
  console.log(`[VoiceE2EE] Receiving voice key from ${fromUserId} (keyId: ${keyId})`)

  const encBytes = decodeBase64(encrypted)
  const nonceBytes = decodeBase64(nonce)
  const pubKey = decodeBase64(senderPublicKey)

  const rawKey = nacl.box.open(encBytes, nonceBytes, pubKey, mySecretKey)
  if (!rawKey) {
    console.error(`[VoiceE2EE] Failed to decrypt voice key from ${fromUserId}`)
    return
  }

  console.log(`[VoiceE2EE] Successfully decrypted voice key from ${fromUserId}, rawKey length: ${rawKey.length}`)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['decrypt']
  )

  // Move existing key to grace period if present
  const existing = peerKeys.get(fromUserId)
  if (existing) {
    const graceKey = `${fromUserId}:${existing.keyId}`
    previousPeerKeys.set(graceKey, {
      key: existing.key,
      expiry: Date.now() + KEY_ROTATION_GRACE_MS,
    })
    setTimeout(() => previousPeerKeys.delete(graceKey), KEY_ROTATION_GRACE_MS)
  }

  peerKeys.set(fromUserId, { key: cryptoKey, keyId })
  console.log(`[VoiceE2EE] Received voice key from ${fromUserId} (keyId: ${keyId})`)
}

/**
 * Remove a peer's keys when they leave.
 */
export function handlePeerLeft(userId: string): void {
  peerKeys.delete(userId)
  // Also clean up any grace-period keys
  for (const key of previousPeerKeys.keys()) {
    if (key.startsWith(`${userId}:`)) {
      previousPeerKeys.delete(key)
    }
  }
}

/**
 * Check if we have a decryption key for a peer.
 */
export function hasPeerKey(userId: string): boolean {
  return peerKeys.has(userId)
}

/**
 * Wait for a peer's key to arrive, with timeout.
 * Returns true if key is available, false if timeout.
 */
export async function waitForPeerKey(userId: string, timeoutMs: number = 5000): Promise<boolean> {
  // Check if we already have it
  if (peerKeys.has(userId)) {
    console.log(`[VoiceE2EE] Already have key for user ${userId}`)
    return true
  }

  console.log(`[VoiceE2EE] Waiting for key from user ${userId} (timeout: ${timeoutMs}ms)`)

  const startTime = Date.now()

  // Poll for the key with exponential backoff
  let checkInterval = 100 // Start with 100ms

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, checkInterval))

    if (peerKeys.has(userId)) {
      const elapsed = Date.now() - startTime
      console.log(`[VoiceE2EE] ✓ Key received from user ${userId} after ${elapsed}ms`)
      return true
    }

    // Exponential backoff, max 500ms
    checkInterval = Math.min(checkInterval * 1.5, 500)
  }

  console.warn(`[VoiceE2EE] ⚠ Timeout waiting for key from user ${userId} after ${timeoutMs}ms`)
  return false
}

/**
 * Request a peer's key explicitly (sends a request via socket).
 */
export async function requestPeerKey(channelId: string, userId: string): Promise<void> {
  console.log(`[VoiceE2EE] Requesting key from user ${userId}`)

  const socket = getSocket()
  if (!socket) {
    console.warn('[VoiceE2EE] No socket connection, cannot request key')
    return
  }

  try {
    socket.emit('voice:request-e2ee-key', { channelId, targetUserId: userId })
  } catch (err) {
    console.error(`[VoiceE2EE] Failed to request key from ${userId}:`, err)
  }
}

// ─── Frame Encryption Transform ──────────────────────────────────────────────

/**
 * Create a TransformStream that encrypts encoded frames with our local AES key.
 *
 * Frame format: [header (1 byte)][ciphertext + tag (N + 16 bytes)][IV (12 bytes)][keyId (1 byte)]
 */
export function createEncryptTransform(): TransformStream {
  let frameCount = 0
  return new TransformStream({
    async transform(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller) {
      frameCount++
      if (frameCount === 1 || frameCount % 100 === 0) {
        console.log(`[VoiceE2EE] Encrypt: processed ${frameCount} frames, hasKey: ${!!localKey}`)
      }

      if (!localKey) {
        // No key yet, pass frame through unencrypted
        controller.enqueue(frame)
        return
      }

      try {
        const data = new Uint8Array(frame.data)
        if (data.length === 0) {
          controller.enqueue(frame)
          return
        }

        // Keep first byte unencrypted for SFU keyframe detection
        const header = data.slice(0, 1)
        const payload = data.slice(1)

        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData: header },
          localKey.key,
          payload
        )

        // Assemble: [header (1)][ciphertext + tag][iv (12)][keyId (1)]
        const ciphertextArray = new Uint8Array(ciphertext)
        const output = new Uint8Array(1 + ciphertextArray.length + IV_LENGTH + 1)
        output[0] = header[0]
        output.set(ciphertextArray, 1)
        output.set(iv, 1 + ciphertextArray.length)
        output[output.length - 1] = localKey.keyId

        frame.data = output.buffer
        controller.enqueue(frame)
      } catch (err) {
        // On encryption failure, drop the frame to avoid sending unencrypted data
        console.error('[VoiceE2EE] Frame encryption failed, DROPPING frame:', err)
      }
    },
  })
}

// ─── Frame Decryption Transform ──────────────────────────────────────────────

/**
 * Create a TransformStream that decrypts encoded frames from a specific peer.
 */
export function createDecryptTransform(producerUserId: string, channelId: string): TransformStream {
  let frameCount = 0
  let lastKeyWarning = 0
  let lastKeyRequest = 0
  let decryptSuccessCount = 0
  let decryptFailureCount = 0
  // Track whether we've ever successfully decrypted from this peer.
  // If true, we know E2EE is active and should drop undecryptable frames.
  // If false, frames may be unencrypted and should pass through.
  let e2eeConfirmed = false
  let keyRequested = false

  console.log(`[VoiceE2EE] Creating decrypt transform for user ${producerUserId} in channel ${channelId}`)

  return new TransformStream({
    async transform(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller) {
      frameCount++
      if (frameCount === 1) {
        console.log(`[VoiceE2EE] 🎬 First frame received in decrypt transform for user ${producerUserId}`)
      }
      if (frameCount % 50 === 0) {
        console.log(`[VoiceE2EE] Decrypt: processed ${frameCount} frames for user ${producerUserId} (successes: ${decryptSuccessCount}, failures: ${decryptFailureCount})`)
      }
      const data = new Uint8Array(frame.data)

      // Minimum frame size: 1 (header) + 16 (tag) + 12 (iv) + 1 (keyId) = 30
      if (data.length < 30) {
        // Too small to be encrypted, pass through (may be a non-E2EE frame or unencrypted)
        controller.enqueue(frame)
        return
      }

      // If we've never confirmed E2EE and have no peer key, drop frames for now
      // (key might be in transit - better to drop than pass through encrypted frames)
      if (!e2eeConfirmed && !peerKeys.has(producerUserId)) {
        const now = Date.now()

        // Request the key if we haven't yet (after giving some time for it to arrive naturally)
        if (!keyRequested && frameCount > 30 && now - lastKeyRequest > 3000) {
          console.warn(`[VoiceE2EE] No key after ${frameCount} frames, requesting key from user ${producerUserId}`)
          requestPeerKey(channelId, producerUserId).catch(err => {
            console.error('[VoiceE2EE] Failed to request peer key:', err)
          })
          keyRequested = true
          lastKeyRequest = now
        }

        // Periodic warnings and re-requests
        if (frameCount <= 10 || now - lastKeyWarning > 5000) {
          console.warn(`[VoiceE2EE] No key yet for user ${producerUserId} (frame ${frameCount}) - dropping frame, waiting for key`)
          lastKeyWarning = now

          // Re-request every 10 seconds if still no key
          if (keyRequested && now - lastKeyRequest > 10000) {
            console.warn(`[VoiceE2EE] Re-requesting key from user ${producerUserId} after 10s`)
            requestPeerKey(channelId, producerUserId).catch(() => {})
            lastKeyRequest = now
          }
        }
        // Drop the frame - don't pass encrypted data through as plaintext
        return
      }

      try {
        // Parse frame format
        const header = data.slice(0, 1)
        const keyId = data[data.length - 1]
        const iv = data.slice(data.length - 1 - IV_LENGTH, data.length - 1)
        const ciphertext = data.slice(1, data.length - 1 - IV_LENGTH)

        // Find the right key
        let cryptoKey: CryptoKey | null = null

        const currentPeerKey = peerKeys.get(producerUserId)
        if (currentPeerKey && currentPeerKey.keyId === keyId) {
          cryptoKey = currentPeerKey.key
        } else {
          // Check grace-period keys
          const graceEntry = previousPeerKeys.get(`${producerUserId}:${keyId}`)
          if (graceEntry && Date.now() < graceEntry.expiry) {
            cryptoKey = graceEntry.key
          }
        }

        if (!cryptoKey) {
          // No matching key found
          if (e2eeConfirmed && decryptSuccessCount > 10) {
            // E2EE was confirmed and working, now key changed - drop encrypted frames
            const now = Date.now()
            if (now - lastKeyWarning > 5000) {
              console.warn(`[VoiceE2EE] No key for peer ${producerUserId}, keyId ${keyId} (frame ${frameCount}) - dropping encrypted frame`)
              lastKeyWarning = now
            }
            return
          }
          // Not confirmed or very early - pass through (might be unencrypted or key not yet received)
          controller.enqueue(frame)
          return
        }

        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv, additionalData: header },
          cryptoKey,
          ciphertext
        )

        // Successfully decrypted - E2EE is confirmed active for this peer
        if (!e2eeConfirmed) {
          e2eeConfirmed = true
          console.log(`[VoiceE2EE] E2EE confirmed active for peer ${producerUserId}`)
        }

        decryptSuccessCount++
        if (decryptSuccessCount === 1 || decryptSuccessCount % 100 === 0) {
          console.log(`[VoiceE2EE] ✓ Decrypted ${decryptSuccessCount} frames from ${producerUserId}`)
        }

        // Reconstruct original frame: [header][plaintext]
        const plaintextArray = new Uint8Array(plaintext)
        const output = new Uint8Array(1 + plaintextArray.length)
        output[0] = header[0]
        output.set(plaintextArray, 1)

        frame.data = output.buffer
        controller.enqueue(frame)
      } catch (err) {
        decryptFailureCount++
        if (e2eeConfirmed && decryptSuccessCount > 10) {
          // E2EE was confirmed and working - drop corrupted frames
          if (decryptFailureCount <= 5 || decryptFailureCount % 100 === 0) {
            console.warn(`[VoiceE2EE] Decryption failed (${decryptFailureCount} failures) - dropping frame:`, err)
          }
        } else {
          // Not confirmed E2EE or very early - pass through (might be unencrypted frame)
          controller.enqueue(frame)
        }
      }
    },
  })
}

// ─── Attach Transforms to Producers/Consumers ────────────────────────────────

/**
 * Get the RTCRtpSender from a mediasoup producer.
 * Handles different mediasoup-client versions.
 */
function getRtpSender(producer: any): RTCRtpSender | null {
  // Try internal property first (mediasoup-client <= 3.6)
  if (producer._rtpSender) return producer._rtpSender
  // Try track-based lookup from the transport (mediasoup-client 3.7+)
  try {
    const transport = producer._transport
    if (transport?._handler?._pc) {
      const pc = transport._handler._pc as RTCPeerConnection
      for (const sender of pc.getSenders()) {
        if (sender.track === producer.track) return sender
      }
    }
  } catch { /* ignore */ }
  return null
}

/**
 * Get the RTCRtpReceiver from a mediasoup consumer.
 * Handles different mediasoup-client versions.
 */
function getRtpReceiver(consumer: any): RTCRtpReceiver | null {
  console.log('[VoiceE2EE] getRtpReceiver: looking for receiver for consumer', consumer.id)

  // Try internal property first (mediasoup-client <= 3.6)
  if (consumer._rtpReceiver) {
    console.log('[VoiceE2EE] Found receiver via _rtpReceiver property')
    return consumer._rtpReceiver
  }

  // Try public property (mediasoup-client 3.7+)
  if (consumer.rtpReceiver) {
    console.log('[VoiceE2EE] Found receiver via rtpReceiver property')
    return consumer.rtpReceiver
  }

  // Try track-based lookup from the transport (mediasoup-client 3.7+)
  try {
    const transport = consumer._transport
    if (transport?._handler?._pc) {
      const pc = transport._handler._pc as RTCPeerConnection
      const receivers = pc.getReceivers()
      console.log(`[VoiceE2EE] PeerConnection has ${receivers.length} receivers`)
      for (const receiver of receivers) {
        if (receiver.track === consumer.track) {
          console.log('[VoiceE2EE] Found receiver via track matching')
          return receiver
        }
      }
      console.warn('[VoiceE2EE] Could not find matching receiver by track')
    } else {
      console.warn('[VoiceE2EE] Cannot access PeerConnection from transport')
    }
  } catch (err) {
    console.warn('[VoiceE2EE] Error in track-based receiver lookup:', err)
  }

  console.warn('[VoiceE2EE] getRtpReceiver failed - no receiver found')
  return null
}

/**
 * Attach encryption transform to a mediasoup producer's sender.
 * Uses the Insertable Streams API (createEncodedStreams).
 * Safe: if anything fails, audio/video continues to work without E2EE.
 */
export function attachEncryptTransform(producer: any): void {
  if (!isInsertableStreamsSupported()) return

  try {
    const sender = getRtpSender(producer)
    if (!sender) {
      console.warn('[VoiceE2EE] Cannot access RTCRtpSender - audio/video will work without E2EE')
      return
    }

    if (typeof (sender as any).createEncodedStreams !== 'function') {
      console.warn('[VoiceE2EE] createEncodedStreams not available on sender - skipping E2EE')
      return
    }

    const streams = (sender as any).createEncodedStreams()
    const encryptTransform = createEncryptTransform()

    streams.readable
      .pipeThrough(encryptTransform)
      .pipeTo(streams.writable)
      .catch((err: any) => {
        // Pipeline broke - this is non-fatal, frames will stop being encrypted
        console.warn('[VoiceE2EE] Encrypt pipeline broke:', err)
      })

    console.log(`[VoiceE2EE] Encrypt transform attached to producer ${producer.id}`)
  } catch (err) {
    console.warn('[VoiceE2EE] Failed to attach encrypt transform - audio/video continues without E2EE:', err)
  }
}

/**
 * Attach decryption transform to a mediasoup consumer's receiver.
 * Safe: if anything fails, audio/video continues to work without E2EE.
 */
export function attachDecryptTransform(consumer: any, producerUserId: string, channelId: string): void {
  console.log(`[VoiceE2EE] attachDecryptTransform called for consumer ${consumer.id}, kind: ${consumer.kind}, userId: ${producerUserId}`)
  console.log(`[VoiceE2EE] Current state: hasPeerKey=${peerKeys.has(producerUserId)}, totalPeerKeys=${peerKeys.size}`)

  if (!isInsertableStreamsSupported()) {
    console.log('[VoiceE2EE] Insertable streams not supported, skipping')
    return
  }

  try {
    const receiver = getRtpReceiver(consumer)
    if (!receiver) {
      console.warn('[VoiceE2EE] Cannot access RTCRtpReceiver - audio/video will work without E2EE')
      return
    }

    console.log('[VoiceE2EE] Receiver found, checking for createEncodedStreams...')
    if (typeof (receiver as any).createEncodedStreams !== 'function') {
      console.warn('[VoiceE2EE] createEncodedStreams not available on receiver - skipping E2EE')
      return
    }

    console.log('[VoiceE2EE] Creating encoded streams...')
    const streams = (receiver as any).createEncodedStreams()
    console.log('[VoiceE2EE] Encoded streams created:', {
      hasReadable: !!streams?.readable,
      hasWritable: !!streams?.writable,
    })

    const decryptTransform = createDecryptTransform(producerUserId, channelId)
    console.log('[VoiceE2EE] Decrypt transform created, setting up pipeline...')

    streams.readable
      .pipeThrough(decryptTransform)
      .pipeTo(streams.writable)
      .then(() => {
        console.log(`[VoiceE2EE] Decrypt pipeline completed for consumer ${consumer.id}`)
      })
      .catch((err: any) => {
        // Pipeline broke - this is non-fatal
        console.warn('[VoiceE2EE] Decrypt pipeline broke:', err)
      })

    console.log(`[VoiceE2EE] ✓ Decrypt transform attached to consumer ${consumer.id} for user ${producerUserId}`)
  } catch (err) {
    console.warn('[VoiceE2EE] Failed to attach decrypt transform - audio/video continues without E2EE:', err)
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Initialize voice E2EE for a channel: generate key and distribute to peers.
 */
export async function initVoiceE2EE(channelId: string): Promise<void> {
  if (!isInsertableStreamsSupported()) {
    console.warn('[VoiceE2EE] Insertable Streams not supported, voice E2EE disabled')
    useVoiceStore.getState().setVoiceE2EE(false)
    return
  }

  try {
    const { key, rawKey, keyId } = await generateVoiceKey()
    localKey = { key, rawKey, keyId }

    console.log(`[VoiceE2EE] Generated local voice key (keyId: ${keyId})`)

    // If private key isn't available yet, defer distribution — the socket.ts
    // privateKey subscriber will call distributeKeyToAllPeers once it lands.
    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      console.warn('[VoiceE2EE] No private key at init — key distribution deferred until private key is available')
      useVoiceStore.getState().setVoiceE2EE(false)
      console.log('[VoiceE2EE] Voice E2EE initialized (distribution pending)')
      return
    }

    // Distribute to all current peers in the channel
    await distributeKeyToAllPeers(channelId)

    useVoiceStore.getState().setVoiceE2EE(true)
    console.log('[VoiceE2EE] Voice E2EE initialized')
  } catch (err) {
    console.error('[VoiceE2EE] Failed to initialize:', err)
    useVoiceStore.getState().setVoiceE2EE(false)
  }
}

/**
 * Clean up all voice E2EE state.
 */
export function cleanupVoiceE2EE(): void {
  localKey = null
  peerKeys.clear()
  previousPeerKeys.clear()
  pendingIncomingKeys.splice(0)
  useVoiceStore.getState().setVoiceE2EE(false)
  console.log('[VoiceE2EE] Cleaned up')
}

/**
 * Rotate voice key (e.g., when a peer leaves). Generates new key,
 * keeps old key available briefly for in-flight frames.
 */
export async function rotateVoiceKey(channelId: string): Promise<void> {
  if (!localKey) return

  console.log('[VoiceE2EE] Rotating voice key...')

  const { key, rawKey, keyId } = await generateVoiceKey()
  localKey = { key, rawKey, keyId }

  await distributeKeyToAllPeers(channelId)
  console.log(`[VoiceE2EE] Key rotated (new keyId: ${keyId})`)
}
