/**
 * Recovery Key System
 * Generates a recovery key, encrypts identity/signing secrets with it,
 * and provides restore functionality for new-device login.
 */
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'

const { encodeBase64, decodeBase64, decodeUTF8, encodeUTF8 } = naclUtil

export interface RecoveryBlob {
  encrypted: string  // base64 nacl.secretbox ciphertext
  nonce: string      // base64 nonce
}

export interface RecoverableKeys {
  identitySecretKey: string   // base64
  identityPublicKey: string   // base64
  signingSecretKey: string    // base64
  signingPublicKey: string    // base64
  signedPreKeySecret: string  // base64
  signedPreKeyPublic: string  // base64
  signedPreKeyId: number
  signedPreKeySig: string     // base64
}

/**
 * Generate a 48-character hex recovery key (24 random bytes)
 */
export function generateRecoveryKey(): string {
  const bytes = nacl.randomBytes(24)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Format recovery key for display (groups of 4)
 */
export function formatRecoveryKey(key: string): string {
  return key.match(/.{1,4}/g)?.join(' ') || key
}

/**
 * Validate a recovery key format (48 hex characters)
 */
export function validateRecoveryKey(key: string): boolean {
  const cleaned = key.replace(/\s+/g, '')
  return /^[0-9a-f]{48}$/i.test(cleaned)
}

/**
 * Clean recovery key input (remove spaces, normalize to lowercase)
 */
export function cleanRecoveryKey(key: string): string {
  return key.replace(/\s+/g, '').toLowerCase()
}

/**
 * Derive a 32-byte encryption key from a recovery key using nacl hash
 */
function deriveKeyFromRecovery(recoveryKey: string): Uint8Array {
  const keyBytes = decodeUTF8(recoveryKey)
  const hash = nacl.hash(keyBytes) // SHA-512
  return hash.slice(0, nacl.secretbox.keyLength) // First 32 bytes
}

/**
 * Encrypt identity and signing secrets with a recovery key
 */
export function encryptKeysForRecovery(
  recoveryKey: string,
  keys: RecoverableKeys
): RecoveryBlob {
  const encryptionKey = deriveKeyFromRecovery(recoveryKey)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const plaintext = decodeUTF8(JSON.stringify(keys))

  const encrypted = nacl.secretbox(plaintext, nonce, encryptionKey)
  if (!encrypted) throw new Error('Recovery encryption failed')

  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  }
}

/**
 * Decrypt identity and signing secrets using a recovery key
 */
export function decryptKeysFromRecovery(
  recoveryKey: string,
  blob: RecoveryBlob
): RecoverableKeys {
  const encryptionKey = deriveKeyFromRecovery(recoveryKey)
  const encryptedBytes = decodeBase64(blob.encrypted)
  const nonceBytes = decodeBase64(blob.nonce)

  const decrypted = nacl.secretbox.open(encryptedBytes, nonceBytes, encryptionKey)
  if (!decrypted) throw new Error('Invalid recovery key or corrupted backup')

  return JSON.parse(encodeUTF8(decrypted))
}
