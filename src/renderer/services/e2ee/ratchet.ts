/**
 * Double Ratchet Implementation
 *
 * Combines:
 * 1. DH Ratchet: Periodic Diffie-Hellman key exchanges for post-compromise security
 * 2. Symmetric Ratchet: Per-message key derivation using HMAC-SHA256 chains
 *
 * The DH ratchet provides "healing" - if keys are compromised, new DH operations
 * restore forward secrecy. The symmetric ratchet provides efficient per-message keys.
 *
 * Protocol:
 * - Each party maintains a DH ratchet key pair
 * - When receiving a message with a new DH public key, perform a DH ratchet step
 * - Each DH step derives a new root key and resets the sending chain
 * - Messages include the sender's current DH public key
 *
 * Symmetric chain:
 *   chain_key_new = HMAC-SHA256(chain_key, 0x01)
 *   message_key   = HMAC-SHA256(chain_key, 0x02)
 */
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { hmacSHA256, hkdf, secureZero, secureZeroAll } from './crypto-utils'

const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil

const CHAIN_KEY_CONSTANT = new Uint8Array([0x01])
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x02])
const MAX_SKIP = 100
const MAX_DH_RATCHET_SKIP = 5 // Max DH ratchet steps to skip (prevents DoS)

/**
 * Create a canonical session ID that's the same regardless of who initiates.
 * Uses lexicographically sorted user IDs to ensure both parties use the same ID.
 */
export function createCanonicalSessionId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort()
  return `${sorted[0]}:${sorted[1]}`
}

/**
 * Determine if a user is the initiator based on the canonical session ID.
 * The user whose ID comes first lexicographically is always the initiator.
 * This ensures both parties agree on who is the initiator.
 */
export function isCanonicalInitiator(myUserId: string, otherUserId: string): boolean {
  return myUserId < otherUserId
}

export interface RatchetSession {
  sessionId: string
  peerId: string
  rootKey?: string         // DEPRECATED: No longer stored for forward secrecy. Kept optional for backward compat with old sessions.
  sendChainKey: string     // base64
  recvChainKey: string     // base64
  sendCounter: number
  recvCounter: number
  skippedKeys: Record<string, string>  // `${counter}` -> base64 message key
  createdAt: string
  updatedAt: string

  // DH Ratchet state (v2 - optional for backward compat with v1 sessions)
  dhRatchetPublicKey?: string   // base64 - our current DH ratchet public key
  dhRatchetSecretKey?: string   // base64 - our current DH ratchet secret key
  peerDHRatchetKey?: string     // base64 - peer's last known DH ratchet public key
  dhRatchetGeneration?: number  // Incremented each DH ratchet step (for skipped key indexing)
  // Skipped keys from previous DH ratchet generations: `${generation}:${counter}` -> base64 message key
  skippedDHKeys?: Record<string, string>
}

export interface AdvanceResult {
  messageKey: Uint8Array
  session: RatchetSession
  dhRatchetPublicKey?: string  // base64 - include in message for DH ratchet
}

/**
 * Initialize a new ratchet session from a shared secret (from X3DH)
 * SECURITY: The shared secret is zeroed after deriving chain keys (forward secrecy)
 *
 * This initializes both the symmetric ratchet chains and the DH ratchet key pair.
 */
export async function initSession(
  sessionId: string,
  peerId: string,
  sharedSecret: Uint8Array,
  isInitiator: boolean
): Promise<RatchetSession> {
  // Derive separate send/recv chain keys from root
  const sendSeed = new Uint8Array([...sharedSecret, isInitiator ? 0x01 : 0x02])
  const recvSeed = new Uint8Array([...sharedSecret, isInitiator ? 0x02 : 0x01])

  const sendChainKey = await hmacSHA256(sharedSecret, sendSeed)
  const recvChainKey = await hmacSHA256(sharedSecret, recvSeed)

  // Generate initial DH ratchet key pair for Double Ratchet
  const dhRatchetKeyPair = nacl.box.keyPair()

  // SECURITY: Zero the intermediate seeds after deriving chain keys
  // Note: sharedSecret is NOT zeroed here because caller may need it
  // (callers should zero it themselves when done)
  secureZero(sendSeed)
  secureZero(recvSeed)

  const now = new Date().toISOString()

  // NOTE: rootKey is intentionally NOT stored for forward secrecy
  return {
    sessionId,
    peerId,
    sendChainKey: encodeBase64(sendChainKey),
    recvChainKey: encodeBase64(recvChainKey),
    sendCounter: 0,
    recvCounter: 0,
    skippedKeys: {},
    createdAt: now,
    updatedAt: now,
    // DH ratchet state
    dhRatchetPublicKey: encodeBase64(dhRatchetKeyPair.publicKey),
    dhRatchetSecretKey: encodeBase64(dhRatchetKeyPair.secretKey),
    dhRatchetGeneration: 0,
    skippedDHKeys: {},
  }
}

/**
 * Advance the send chain and derive a message key
 * Returns the current DH ratchet public key to include in the message
 */
export async function advanceSendChain(session: RatchetSession): Promise<AdvanceResult> {
  const chainKey = decodeBase64(session.sendChainKey)

  // Derive message key
  const messageKey = await hmacSHA256(chainKey, MESSAGE_KEY_CONSTANT)

  // Advance chain key
  const newChainKey = await hmacSHA256(chainKey, CHAIN_KEY_CONSTANT)

  return {
    messageKey,
    dhRatchetPublicKey: session.dhRatchetPublicKey, // Include for DH ratchet
    session: {
      ...session,
      sendChainKey: encodeBase64(newChainKey),
      sendCounter: session.sendCounter + 1,
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Advance the receive chain to the given counter, caching any skipped keys
 */
export async function advanceRecvChain(
  session: RatchetSession,
  messageCounter: number
): Promise<AdvanceResult> {
  // If we already have a skipped key for this counter, use it
  const skippedKey = session.skippedKeys[String(messageCounter)]
  if (skippedKey) {
    const newSkipped = { ...session.skippedKeys }
    delete newSkipped[String(messageCounter)]
    return {
      messageKey: decodeBase64(skippedKey),
      session: {
        ...session,
        skippedKeys: newSkipped,
        updatedAt: new Date().toISOString(),
      },
    }
  }

  // How many keys to skip
  const skip = messageCounter - session.recvCounter
  if (skip < 0) {
    throw new Error(`Message counter ${messageCounter} is behind current ${session.recvCounter}`)
  }
  if (skip > MAX_SKIP) {
    throw new Error(`Too many skipped messages (${skip}), max is ${MAX_SKIP}`)
  }

  let chainKey = decodeBase64(session.recvChainKey)
  const newSkipped = { ...session.skippedKeys }

  // Cache skipped message keys
  for (let i = session.recvCounter; i < messageCounter; i++) {
    const mk = await hmacSHA256(chainKey, MESSAGE_KEY_CONSTANT)
    newSkipped[String(i)] = encodeBase64(mk)
    chainKey = await hmacSHA256(chainKey, CHAIN_KEY_CONSTANT)
  }

  // Derive the message key for the target counter
  const messageKey = await hmacSHA256(chainKey, MESSAGE_KEY_CONSTANT)
  const newChainKey = await hmacSHA256(chainKey, CHAIN_KEY_CONSTANT)

  // Prune old skipped keys (keep most recent MAX_SKIP)
  const skippedEntries = Object.entries(newSkipped)
  if (skippedEntries.length > MAX_SKIP) {
    const sorted = skippedEntries.sort((a, b) => Number(a[0]) - Number(b[0]))
    const pruned: Record<string, string> = {}
    for (const [k, v] of sorted.slice(-MAX_SKIP)) {
      pruned[k] = v
    }
    Object.keys(newSkipped).forEach((k) => {
      if (!(k in pruned)) delete newSkipped[k]
    })
  }

  return {
    messageKey,
    session: {
      ...session,
      recvChainKey: encodeBase64(newChainKey),
      recvCounter: messageCounter + 1,
      skippedKeys: newSkipped,
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Encrypt a plaintext message using a message key (nacl.secretbox)
 */
export function encryptWithMessageKey(
  plaintext: string,
  messageKey: Uint8Array
): { encrypted: string; nonce: string } {
  // Use first 32 bytes of message key as secretbox key
  const key = messageKey.slice(0, nacl.secretbox.keyLength)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const messageBytes = decodeUTF8(plaintext)

  const encrypted = nacl.secretbox(messageBytes, nonce, key)
  if (!encrypted) throw new Error('Ratchet encryption failed')

  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  }
}

/**
 * Decrypt a ciphertext using a message key
 */
export function decryptWithMessageKey(
  encrypted: string,
  nonce: string,
  messageKey: Uint8Array
): string {
  const key = messageKey.slice(0, nacl.secretbox.keyLength)
  const encryptedBytes = decodeBase64(encrypted)
  const nonceBytes = decodeBase64(nonce)

  const decrypted = nacl.secretbox.open(encryptedBytes, nonceBytes, key)
  if (!decrypted) throw new Error('Ratchet decryption failed')

  return encodeUTF8(decrypted)
}

// ─── DH Ratchet Functions ─────────────────────────────────────────────────────

/**
 * Perform a DH ratchet step when we receive a new peer DH public key.
 * This derives a new root key and resets our receiving chain.
 *
 * @param session Current session state
 * @param peerDHPublicKey New DH public key from peer (base64)
 * @returns Updated session with new receiving chain
 */
export async function performDHRatchetReceive(
  session: RatchetSession,
  peerDHPublicKey: string
): Promise<RatchetSession> {
  // Skip if no DH ratchet keys in session (legacy v1 session)
  if (!session.dhRatchetSecretKey) {
    return {
      ...session,
      peerDHRatchetKey: peerDHPublicKey,
      updatedAt: new Date().toISOString(),
    }
  }

  // Skip if peer key hasn't changed
  if (session.peerDHRatchetKey === peerDHPublicKey) {
    return session
  }

  const mySecretKey = decodeBase64(session.dhRatchetSecretKey)
  const theirPublicKey = decodeBase64(peerDHPublicKey)

  // Perform DH: our secret x their public
  const dhOutput = nacl.box.before(theirPublicKey, mySecretKey)

  // Derive new receiving chain key using HKDF
  // info string differentiates this from other derivations
  const newRecvChainKey = await hkdf(
    dhOutput,
    null,
    'blite-dh-ratchet-recv',
    32
  )

  // SECURITY: Zero the DH output
  secureZero(dhOutput)

  const newGeneration = (session.dhRatchetGeneration || 0) + 1

  return {
    ...session,
    recvChainKey: encodeBase64(newRecvChainKey),
    recvCounter: 0, // Reset counter for new chain
    peerDHRatchetKey: peerDHPublicKey,
    dhRatchetGeneration: newGeneration,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Perform a DH ratchet step for sending after we've received a new peer key.
 * This generates a new DH key pair and derives a new sending chain.
 *
 * Should be called after performDHRatchetReceive when we want to send.
 *
 * @param session Current session state (after receive ratchet)
 * @returns Updated session with new sending chain and DH key pair
 */
export async function performDHRatchetSend(
  session: RatchetSession
): Promise<RatchetSession> {
  // Skip if no peer DH key yet (can't do DH without peer's key)
  if (!session.peerDHRatchetKey) {
    return session
  }

  // Generate new DH ratchet key pair
  const newKeyPair = nacl.box.keyPair()
  const theirPublicKey = decodeBase64(session.peerDHRatchetKey)

  // Perform DH: our new secret x their public
  const dhOutput = nacl.box.before(theirPublicKey, newKeyPair.secretKey)

  // Derive new sending chain key
  const newSendChainKey = await hkdf(
    dhOutput,
    null,
    'blite-dh-ratchet-send',
    32
  )

  // SECURITY: Zero the DH output and old secret key
  secureZero(dhOutput)
  if (session.dhRatchetSecretKey) {
    const oldSecret = decodeBase64(session.dhRatchetSecretKey)
    secureZero(oldSecret)
  }

  return {
    ...session,
    sendChainKey: encodeBase64(newSendChainKey),
    sendCounter: 0, // Reset counter for new chain
    dhRatchetPublicKey: encodeBase64(newKeyPair.publicKey),
    dhRatchetSecretKey: encodeBase64(newKeyPair.secretKey),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Advance the receive chain with DH ratchet support.
 * If the message includes a new peer DH public key, performs a DH ratchet step first.
 *
 * @param session Current session state
 * @param messageCounter Counter from the incoming message
 * @param peerDHPublicKey DH public key from the message (optional, base64)
 * @returns Message key and updated session
 */
export async function advanceRecvChainWithDH(
  session: RatchetSession,
  messageCounter: number,
  peerDHPublicKey?: string
): Promise<AdvanceResult> {
  let currentSession = session

  // If peer sent a new DH public key, perform DH ratchet step
  if (peerDHPublicKey && peerDHPublicKey !== session.peerDHRatchetKey) {
    // Before doing DH ratchet, cache any skipped keys from current chain
    if (session.dhRatchetGeneration !== undefined) {
      const skippedDHKeys = { ...session.skippedDHKeys }

      // Cache remaining keys in current receive chain if counter would reset
      // (up to MAX_SKIP keys from current recvCounter)
      const keysToCache = Math.min(MAX_SKIP, MAX_SKIP - Object.keys(skippedDHKeys).length)
      if (keysToCache > 0 && session.recvCounter > 0) {
        let chainKey = decodeBase64(session.recvChainKey)
        for (let i = 0; i < keysToCache && session.recvCounter + i < MAX_SKIP; i++) {
          const mk = await hmacSHA256(chainKey, MESSAGE_KEY_CONSTANT)
          const idx = `${session.dhRatchetGeneration}:${session.recvCounter + i}`
          skippedDHKeys[idx] = encodeBase64(mk)
          chainKey = await hmacSHA256(chainKey, CHAIN_KEY_CONSTANT)
        }
      }

      currentSession = { ...currentSession, skippedDHKeys }
    }

    currentSession = await performDHRatchetReceive(currentSession, peerDHPublicKey)
  }

  // Check for skipped keys from previous DH generations
  if (currentSession.skippedDHKeys && currentSession.dhRatchetGeneration !== undefined) {
    // Check all previous generations for this counter
    for (let gen = 0; gen < currentSession.dhRatchetGeneration; gen++) {
      const idx = `${gen}:${messageCounter}`
      const skippedKey = currentSession.skippedDHKeys[idx]
      if (skippedKey) {
        const newSkippedDHKeys = { ...currentSession.skippedDHKeys }
        delete newSkippedDHKeys[idx]
        return {
          messageKey: decodeBase64(skippedKey),
          session: {
            ...currentSession,
            skippedDHKeys: newSkippedDHKeys,
            updatedAt: new Date().toISOString(),
          },
        }
      }
    }
  }

  // Use standard symmetric ratchet for current chain
  return advanceRecvChain(currentSession, messageCounter)
}

/**
 * Advance the send chain with DH ratchet support.
 * If we've received a new peer DH key since our last send, performs a DH ratchet step.
 *
 * @param session Current session state
 * @param forceRatchet Force a DH ratchet step even if peer key hasn't changed
 * @returns Message key, DH public key to include in message, and updated session
 */
export async function advanceSendChainWithDH(
  session: RatchetSession,
  forceRatchet = false
): Promise<AdvanceResult> {
  let currentSession = session

  // Check if we should do a DH ratchet step
  // We ratchet if: we have a peer key AND (forced OR first message OR periodic rotation)
  const shouldRatchet = session.peerDHRatchetKey && (
    forceRatchet ||
    session.sendCounter === 0 ||
    (session.sendCounter > 0 && session.sendCounter % 50 === 0) // Periodic ratchet every 50 messages
  )

  if (shouldRatchet) {
    currentSession = await performDHRatchetSend(currentSession)
  }

  // Use standard symmetric ratchet
  return advanceSendChain(currentSession)
}

/**
 * Check if a session supports DH ratchet (v2 session)
 */
export function sessionSupportsDHRatchet(session: RatchetSession): boolean {
  return !!session.dhRatchetPublicKey && !!session.dhRatchetSecretKey
}
