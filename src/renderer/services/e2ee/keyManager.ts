/**
 * E2EE Key Manager
 * Key generation, bundle creation, storage, rotation, and replenishment
 */
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { hkdf } from './crypto-utils'

const { encodeBase64, decodeBase64 } = naclUtil

const OTP_BATCH_SIZE = 20
const OTP_REPLENISH_THRESHOLD = 5

export interface KeyBundle {
  identityKeyPair: nacl.BoxKeyPair
  signingKeyPair: nacl.SignKeyPair
  signedPreKey: {
    keyPair: nacl.BoxKeyPair
    id: number
    signature: Uint8Array
  }
  oneTimePreKeys: Array<{
    keyPair: nacl.BoxKeyPair
    id: number
  }>
}

export interface SerializedKeyBundle {
  identityPublicKey: string
  identitySecretKey: string
  signingPublicKey: string
  signingSecretKey: string
  signedPreKeyPublic: string
  signedPreKeySecret: string
  signedPreKeyId: number
  signedPreKeySig: string
  // OTP private keys stored locally
  oneTimePreKeys: Array<{ id: number; secretKey: string }>
}

export interface UploadableKeyBundle {
  identityKey: string
  signingKey: string
  signedPreKey: string
  signedPreKeyId: number
  signedPreKeySig: string
  oneTimePreKeys: Array<{ keyId: number; publicKey: string }>
}

/**
 * Generate a full key bundle for a new user
 */
export function generateKeyBundle(): KeyBundle {
  // Identity key pair (X25519) for DH
  const identityKeyPair = nacl.box.keyPair()

  // Signing key pair (Ed25519) for signatures
  const signingKeyPair = nacl.sign.keyPair()

  // Signed pre-key (X25519) signed with Ed25519 signing key
  const signedPreKeyPair = nacl.box.keyPair()
  const signedPreKeyId = 1
  const signature = nacl.sign.detached(signedPreKeyPair.publicKey, signingKeyPair.secretKey)

  // One-time pre-keys
  const oneTimePreKeys: KeyBundle['oneTimePreKeys'] = []
  for (let i = 0; i < OTP_BATCH_SIZE; i++) {
    oneTimePreKeys.push({
      keyPair: nacl.box.keyPair(),
      id: i + 1,
    })
  }

  return {
    identityKeyPair,
    signingKeyPair,
    signedPreKey: {
      keyPair: signedPreKeyPair,
      id: signedPreKeyId,
      signature,
    },
    oneTimePreKeys,
  }
}

/**
 * Generate additional one-time pre-keys starting from a given ID
 */
export function generateOneTimePreKeys(startId: number, count = OTP_BATCH_SIZE) {
  const keys: Array<{ keyPair: nacl.BoxKeyPair; id: number }> = []
  for (let i = 0; i < count; i++) {
    keys.push({
      keyPair: nacl.box.keyPair(),
      id: startId + i,
    })
  }
  return keys
}

/**
 * Rotate the signed pre-key (generate new one, sign with signing key)
 */
export function rotateSignedPreKey(
  signingSecretKey: Uint8Array,
  newId: number
): { keyPair: nacl.BoxKeyPair; id: number; signature: Uint8Array } {
  const keyPair = nacl.box.keyPair()
  const signature = nacl.sign.detached(keyPair.publicKey, signingSecretKey)
  return { keyPair, id: newId, signature }
}

/**
 * Convert a KeyBundle to a format suitable for uploading to the server (public keys only)
 */
export function bundleToUploadable(bundle: KeyBundle): UploadableKeyBundle {
  return {
    identityKey: encodeBase64(bundle.identityKeyPair.publicKey),
    signingKey: encodeBase64(bundle.signingKeyPair.publicKey),
    signedPreKey: encodeBase64(bundle.signedPreKey.keyPair.publicKey),
    signedPreKeyId: bundle.signedPreKey.id,
    signedPreKeySig: encodeBase64(bundle.signedPreKey.signature),
    oneTimePreKeys: bundle.oneTimePreKeys.map((otp) => ({
      keyId: otp.id,
      publicKey: encodeBase64(otp.keyPair.publicKey),
    })),
  }
}

/**
 * Serialize a KeyBundle for local storage (includes secret keys)
 */
export function serializeKeyBundle(bundle: KeyBundle): SerializedKeyBundle {
  return {
    identityPublicKey: encodeBase64(bundle.identityKeyPair.publicKey),
    identitySecretKey: encodeBase64(bundle.identityKeyPair.secretKey),
    signingPublicKey: encodeBase64(bundle.signingKeyPair.publicKey),
    signingSecretKey: encodeBase64(bundle.signingKeyPair.secretKey),
    signedPreKeyPublic: encodeBase64(bundle.signedPreKey.keyPair.publicKey),
    signedPreKeySecret: encodeBase64(bundle.signedPreKey.keyPair.secretKey),
    signedPreKeyId: bundle.signedPreKey.id,
    signedPreKeySig: encodeBase64(bundle.signedPreKey.signature),
    oneTimePreKeys: bundle.oneTimePreKeys.map((otp) => ({
      id: otp.id,
      secretKey: encodeBase64(otp.keyPair.secretKey),
    })),
  }
}

/**
 * Deserialize a stored KeyBundle back into usable key pairs
 */
export function deserializeKeyBundle(data: SerializedKeyBundle): KeyBundle {
  const identitySecret = decodeBase64(data.identitySecretKey)
  const identityPublic = decodeBase64(data.identityPublicKey)

  const signingSecret = decodeBase64(data.signingSecretKey)
  const signingPublic = decodeBase64(data.signingPublicKey)

  const signedPreKeySecret = decodeBase64(data.signedPreKeySecret)
  const signedPreKeyPublic = decodeBase64(data.signedPreKeyPublic)

  return {
    identityKeyPair: { publicKey: identityPublic, secretKey: identitySecret },
    signingKeyPair: { publicKey: signingPublic, secretKey: signingSecret },
    signedPreKey: {
      keyPair: { publicKey: signedPreKeyPublic, secretKey: signedPreKeySecret },
      id: data.signedPreKeyId,
      signature: decodeBase64(data.signedPreKeySig),
    },
    oneTimePreKeys: data.oneTimePreKeys.map((otp) => {
      const secretKey = decodeBase64(otp.secretKey)
      // Derive public key from secret key
      const keyPair = nacl.box.keyPair.fromSecretKey(secretKey)
      return { keyPair, id: otp.id }
    }),
  }
}

/**
 * Web-based encryption using crypto.subtle (for browser environments)
 */
async function encryptForWeb(data: string): Promise<string> {
  // Generate a random encryption key (could be derived from user password in future)
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  // Export and store the key (wrapped with a password-derived key would be better)
  const exportedKey = await crypto.subtle.exportKey('raw', key)
  const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)))

  // Generate IV
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Encrypt
  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  )

  // Store key in localStorage so it persists across page refreshes.
  // The key bundle itself is already in localStorage; losing this decryption key
  // on refresh causes the bundle to be wiped and new keys generated,
  // breaking cross-device message decryption.
  localStorage.setItem('blite_encryption_key', keyBase64)

  // Return base64 encoded: IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}

/**
 * Web-based decryption using crypto.subtle
 */
async function decryptForWeb(encryptedData: string): Promise<string> {
  try {
    // Get stored key
    // Check both localStorage (new) and sessionStorage (legacy) for the key
    const keyBase64 = localStorage.getItem('blite_encryption_key') || sessionStorage.getItem('blite_encryption_key')
    if (!keyBase64) {
      throw new Error('Encryption key not found in session')
    }

    // Import key
    const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    // Decode combined data
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    )

    const decoder = new TextDecoder()
    return decoder.decode(decrypted)
  } catch (err) {
    console.error('[KeyManager] Web decryption failed:', err)
    throw new Error('Failed to decrypt key bundle')
  }
}

/**
 * Store the full key bundle securely using Electron's safeStorage or Web Crypto API
 */
export async function storeKeyBundle(bundle: SerializedKeyBundle): Promise<void> {
  const json = JSON.stringify(bundle)
  if (window.api?.encryptData) {
    // Electron: use native encryption
    const encrypted = await window.api.encryptData(json)
    localStorage.setItem('blite_key_bundle', encrypted)
  } else {
    // Web: use crypto.subtle with AES-GCM
    try {
      const encrypted = await encryptForWeb(json)
      localStorage.setItem('blite_key_bundle', encrypted)
      localStorage.setItem('blite_key_bundle_type', 'web-encrypted')
    } catch (err) {
      console.error('[KeyManager] Failed to encrypt key bundle:', err)
      throw new Error('Cannot store keys securely - encryption failed')
    }
  }
}

/**
 * Load the key bundle from secure storage
 */
export async function loadKeyBundle(): Promise<SerializedKeyBundle | null> {
  const stored = localStorage.getItem('blite_key_bundle')
  if (!stored) return null

  try {
    if (window.api?.decryptData) {
      // Electron: use native decryption
      const decrypted = await window.api.decryptData(stored)
      return JSON.parse(decrypted)
    } else {
      // Web: check if it's encrypted
      const bundleType = localStorage.getItem('blite_key_bundle_type')
      if (bundleType === 'web-encrypted') {
        const decrypted = await decryptForWeb(stored)
        return JSON.parse(decrypted)
      } else {
        // Legacy plaintext data - migrate to encrypted
        const bundle = JSON.parse(stored)
        // Re-save as encrypted
        await storeKeyBundle(bundle)
        return bundle
      }
    }
  } catch (err) {
    console.error('[KeyManager] Failed to load key bundle:', err)
    // Clear corrupted/undecryptable bundle so recovery can proceed
    console.warn('[KeyManager] Clearing corrupted key bundle from storage')
    clearKeyBundle()
    return null
  }
}

/**
 * Clear stored key bundle on logout
 */
export function clearKeyBundle(): void {
  localStorage.removeItem('blite_key_bundle')
  localStorage.removeItem('blite_key_bundle_type')
  localStorage.removeItem('blite_encryption_key')
  sessionStorage.removeItem('blite_encryption_key') // legacy cleanup
}

/**
 * Check if OTP count needs replenishment
 */
export function needsOTPReplenishment(count: number): boolean {
  return count < OTP_REPLENISH_THRESHOLD
}

/**
 * Check if signed pre-key needs rotation (older than 30 days)
 */
export function needsSignedPreKeyRotation(updatedAt: string | null): boolean {
  if (!updatedAt) return true
  const age = Date.now() - new Date(updatedAt).getTime()
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  return age > thirtyDays
}

/**
 * Derive a key for encrypting session store data
 */
export async function deriveSessionStoreKey(identitySecretKey: Uint8Array): Promise<Uint8Array> {
  return hkdf(identitySecretKey, null, 'blite-session-store', 32)
}
