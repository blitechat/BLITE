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
  salt?: string      // base64 salt for PBKDF2 (v2). Absent = legacy SHA-512 derivation.
  iterations?: number // PBKDF2 iterations (v2). Absent = legacy.
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

// PBKDF2 iterations for key derivation (100,000 is OWASP recommended minimum for 2023+)
const PBKDF2_ITERATIONS = 100000

/**
 * Derive a 32-byte encryption key from a recovery key using PBKDF2-SHA256
 * This provides proper key stretching to resist brute-force attacks.
 */
async function deriveKeyWithPBKDF2(recoveryKey: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyBytes = decodeUTF8(recoveryKey)

  // Import the recovery key as raw key material
  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  )

  // Derive 256 bits using PBKDF2-SHA256
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  )

  return new Uint8Array(derivedBits)
}

/**
 * LEGACY: Derive a 32-byte encryption key from a recovery key using nacl hash
 * Only used for decrypting old recovery blobs that don't have a salt.
 */
function deriveKeyFromRecoveryLegacy(recoveryKey: string): Uint8Array {
  const keyBytes = decodeUTF8(recoveryKey)
  const hash = nacl.hash(keyBytes) // SHA-512
  return hash.slice(0, nacl.secretbox.keyLength) // First 32 bytes
}

/**
 * Encrypt identity and signing secrets with a recovery key
 * Uses PBKDF2-SHA256 with a random salt for proper key stretching.
 */
export async function encryptKeysForRecovery(
  recoveryKey: string,
  keys: RecoverableKeys
): Promise<RecoveryBlob> {
  // Generate a random salt for PBKDF2
  const salt = nacl.randomBytes(32)
  const encryptionKey = await deriveKeyWithPBKDF2(recoveryKey, salt)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const plaintext = decodeUTF8(JSON.stringify(keys))

  const encrypted = nacl.secretbox(plaintext, nonce, encryptionKey)
  if (!encrypted) throw new Error('Recovery encryption failed')

  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
    salt: encodeBase64(salt),
    iterations: PBKDF2_ITERATIONS,
  }
}

/**
 * Decrypt identity and signing secrets using a recovery key
 * Automatically handles both legacy (SHA-512) and modern (PBKDF2) blobs.
 */
export async function decryptKeysFromRecovery(
  recoveryKey: string,
  blob: RecoveryBlob
): Promise<RecoverableKeys> {
  let encryptionKey: Uint8Array

  // Check if this is a v2 blob with PBKDF2
  if (blob.salt) {
    const saltBytes = decodeBase64(blob.salt)
    encryptionKey = await deriveKeyWithPBKDF2(recoveryKey, saltBytes)
  } else {
    // Legacy blob - use old SHA-512 derivation
    encryptionKey = deriveKeyFromRecoveryLegacy(recoveryKey)
  }

  const encryptedBytes = decodeBase64(blob.encrypted)
  const nonceBytes = decodeBase64(blob.nonce)

  const decrypted = nacl.secretbox.open(encryptedBytes, nonceBytes, encryptionKey)
  if (!decrypted) throw new Error('Invalid recovery key or corrupted backup')

  return JSON.parse(encodeUTF8(decrypted))
}
