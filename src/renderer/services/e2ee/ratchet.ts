/**
 * Symmetric Ratchet
 * Per-message key derivation using HMAC-SHA256 chain keys.
 *
 * chain_key_new = HMAC-SHA256(chain_key, 0x01)
 * message_key  = HMAC-SHA256(chain_key, 0x02)
 */
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { hmacSHA256 } from './crypto-utils'

const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil

const CHAIN_KEY_CONSTANT = new Uint8Array([0x01])
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x02])
const MAX_SKIP = 100

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
  rootKey: string          // base64
  sendChainKey: string     // base64
  recvChainKey: string     // base64
  sendCounter: number
  recvCounter: number
  skippedKeys: Record<string, string>  // `${counter}` -> base64 message key
  createdAt: string
  updatedAt: string
}

export interface AdvanceResult {
  messageKey: Uint8Array
  session: RatchetSession
}

/**
 * Initialize a new ratchet session from a shared secret (from X3DH)
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

  const now = new Date().toISOString()

  return {
    sessionId,
    peerId,
    rootKey: encodeBase64(sharedSecret),
    sendChainKey: encodeBase64(sendChainKey),
    recvChainKey: encodeBase64(recvChainKey),
    sendCounter: 0,
    recvCounter: 0,
    skippedKeys: {},
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Advance the send chain and derive a message key
 */
export async function advanceSendChain(session: RatchetSession): Promise<AdvanceResult> {
  const chainKey = decodeBase64(session.sendChainKey)

  // Derive message key
  const messageKey = await hmacSHA256(chainKey, MESSAGE_KEY_CONSTANT)

  // Advance chain key
  const newChainKey = await hmacSHA256(chainKey, CHAIN_KEY_CONSTANT)

  return {
    messageKey,
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
