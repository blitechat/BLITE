/**
 * Sender Keys for Group/Channel Encryption
 *
 * Each user generates a sender key (32-byte symmetric) per channel.
 * The key is encrypted for each member using nacl.box and uploaded.
 * Messages are encrypted with a ratcheted chain derived from the sender key.
 */
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { hmacSHA256 } from './crypto-utils'

const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil

const CHAIN_KEY_CONSTANT = new Uint8Array([0x01])
const MESSAGE_KEY_CONSTANT = new Uint8Array([0x02])

export interface SenderKeyState {
  channelId: string
  senderId: string
  chainKey: string     // base64 - current chain key
  counter: number
  createdAt: string
  updatedAt: string
}

/**
 * Generate a new sender key (random 32 bytes)
 */
export function generateSenderKey(): Uint8Array {
  return nacl.randomBytes(32)
}

/**
 * Create initial sender key state for a channel
 */
export function createSenderKeyState(
  channelId: string,
  senderId: string,
  senderKey: Uint8Array
): SenderKeyState {
  const now = new Date().toISOString()
  return {
    channelId,
    senderId,
    chainKey: encodeBase64(senderKey),
    counter: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Encrypt a sender key for a specific recipient using nacl.box
 */
export function encryptSenderKeyForUser(
  senderKey: Uint8Array,
  recipientPublicKey: string,
  senderSecretKey: Uint8Array
): { encrypted: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const pubKey = decodeBase64(recipientPublicKey)
  const encrypted = nacl.box(senderKey, nonce, pubKey, senderSecretKey)
  if (!encrypted) throw new Error('Failed to encrypt sender key for user')
  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  }
}

/**
 * Decrypt a sender key received from another user
 */
export function decryptSenderKeyFromUser(
  encrypted: string,
  nonce: string,
  senderPublicKey: string,
  recipientSecretKey: Uint8Array
): Uint8Array {
  const encBytes = decodeBase64(encrypted)
  const nonceBytes = decodeBase64(nonce)
  const pubKey = decodeBase64(senderPublicKey)
  const decrypted = nacl.box.open(encBytes, nonceBytes, pubKey, recipientSecretKey)
  if (!decrypted) throw new Error('Failed to decrypt sender key')
  return decrypted
}

/**
 * Advance the sender key chain and derive a message key for encryption
 */
export async function advanceSenderChain(state: SenderKeyState): Promise<{
  messageKey: Uint8Array
  state: SenderKeyState
}> {
  const chainKey = decodeBase64(state.chainKey)
  const messageKey = await hmacSHA256(chainKey, MESSAGE_KEY_CONSTANT)
  const newChainKey = await hmacSHA256(chainKey, CHAIN_KEY_CONSTANT)

  return {
    messageKey,
    state: {
      ...state,
      chainKey: encodeBase64(newChainKey),
      counter: state.counter + 1,
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Advance a receiver's copy of a sender key chain to a target counter
 */
export async function advanceSenderRecvChain(
  state: SenderKeyState,
  targetCounter: number
): Promise<{
  messageKey: Uint8Array
  state: SenderKeyState
}> {
  if (targetCounter < state.counter) {
    throw new Error(`Sender key counter ${targetCounter} behind current ${state.counter}`)
  }

  const skip = targetCounter - state.counter
  if (skip > 1000) {
    throw new Error(`Too many skipped sender key messages (${skip})`)
  }

  let chainKey = decodeBase64(state.chainKey)

  // Advance through skipped messages
  for (let i = state.counter; i < targetCounter; i++) {
    chainKey = await hmacSHA256(chainKey, CHAIN_KEY_CONSTANT)
  }

  // Derive message key at target counter
  const messageKey = await hmacSHA256(chainKey, MESSAGE_KEY_CONSTANT)
  const newChainKey = await hmacSHA256(chainKey, CHAIN_KEY_CONSTANT)

  return {
    messageKey,
    state: {
      ...state,
      chainKey: encodeBase64(newChainKey),
      counter: targetCounter + 1,
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Encrypt a message with a sender key message key (nacl.secretbox)
 */
export function encryptWithSenderKey(
  plaintext: string,
  messageKey: Uint8Array
): { encrypted: string; nonce: string } {
  const key = messageKey.slice(0, nacl.secretbox.keyLength)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const messageBytes = decodeUTF8(plaintext)
  const encrypted = nacl.secretbox(messageBytes, nonce, key)
  if (!encrypted) throw new Error('Sender key encryption failed')
  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  }
}

/**
 * Decrypt a message with a sender key message key
 */
export function decryptWithSenderKey(
  encrypted: string,
  nonce: string,
  messageKey: Uint8Array
): string {
  const key = messageKey.slice(0, nacl.secretbox.keyLength)
  const encBytes = decodeBase64(encrypted)
  const nonceBytes = decodeBase64(nonce)
  const decrypted = nacl.secretbox.open(encBytes, nonceBytes, key)
  if (!decrypted) throw new Error('Sender key decryption failed')
  return encodeUTF8(decrypted)
}

/**
 * Distribute a sender key to all members of a channel.
 * Returns an array of {userId, encryptedKey} for upload.
 */
export function distributeSenderKey(
  senderKey: Uint8Array,
  members: Array<{ id: string; publicKey: string }>,
  senderSecretKey: Uint8Array
): Array<{ userId: string; encryptedKey: string }> {
  return members
    .filter((m) => m.publicKey)
    .map((member) => {
      const { encrypted, nonce } = encryptSenderKeyForUser(
        senderKey,
        member.publicKey,
        senderSecretKey
      )
      return {
        userId: member.id,
        encryptedKey: `${encrypted}:${nonce}`,
      }
    })
}
