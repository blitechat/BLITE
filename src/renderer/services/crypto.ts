import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'

const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil

// Generate a new X25519 key pair for the user
export function generateKeyPair(): { publicKey: string; secretKey: Uint8Array } {
  const keyPair = nacl.box.keyPair()
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: keyPair.secretKey
  }
}

// Encrypt a message for a specific recipient (DM)
export function encryptDM(
  message: string,
  recipientPublicKey: string,
  senderSecretKey: Uint8Array
): { encrypted: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const messageBytes = decodeUTF8(message)
  const pubKey = decodeBase64(recipientPublicKey)

  const encrypted = nacl.box(messageBytes, nonce, pubKey, senderSecretKey)
  if (!encrypted) throw new Error('Encryption failed')

  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce)
  }
}

// Decrypt a DM message
export function decryptDM(
  encrypted: string,
  nonce: string,
  senderPublicKey: string,
  recipientSecretKey: Uint8Array
): string {
  const encryptedBytes = decodeBase64(encrypted)
  const nonceBytes = decodeBase64(nonce)
  const pubKey = decodeBase64(senderPublicKey)

  const decrypted = nacl.box.open(encryptedBytes, nonceBytes, pubKey, recipientSecretKey)
  if (!decrypted) throw new Error('Decryption failed')

  return encodeUTF8(decrypted)
}

// Generate a random symmetric key for a channel
export function generateChannelKey(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength)
}

// Encrypt a message with a channel's symmetric key
export function encryptChannel(
  message: string,
  channelKey: Uint8Array
): { encrypted: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const messageBytes = decodeUTF8(message)

  const encrypted = nacl.secretbox(messageBytes, nonce, channelKey)
  if (!encrypted) throw new Error('Encryption failed')

  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce)
  }
}

// Decrypt a channel message
export function decryptChannel(
  encrypted: string,
  nonce: string,
  channelKey: Uint8Array
): string {
  const encryptedBytes = decodeBase64(encrypted)
  const nonceBytes = decodeBase64(nonce)

  const decrypted = nacl.secretbox.open(encryptedBytes, nonceBytes, channelKey)
  if (!decrypted) throw new Error('Decryption failed')

  return encodeUTF8(decrypted)
}

// Encrypt a channel key for a specific user (wrapping)
export function encryptKeyForUser(
  channelKey: Uint8Array,
  recipientPublicKey: string,
  senderSecretKey: Uint8Array
): { encrypted: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const pubKey = decodeBase64(recipientPublicKey)

  const encrypted = nacl.box(channelKey, nonce, pubKey, senderSecretKey)
  if (!encrypted) throw new Error('Key encryption failed')

  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce)
  }
}

// Decrypt a channel key that was encrypted for this user
export function decryptKeyForUser(
  encrypted: string,
  nonce: string,
  senderPublicKey: string,
  recipientSecretKey: Uint8Array
): Uint8Array {
  const encryptedBytes = decodeBase64(encrypted)
  const nonceBytes = decodeBase64(nonce)
  const pubKey = decodeBase64(senderPublicKey)

  const decrypted = nacl.box.open(encryptedBytes, nonceBytes, pubKey, recipientSecretKey)
  if (!decrypted) throw new Error('Key decryption failed')

  return decrypted
}

// Encrypt a file with a channel/DM key
export async function encryptFile(
  file: File,
  key: Uint8Array
): Promise<{ encrypted: Uint8Array; nonce: string; originalName: string; mimeType: string }> {
  const buffer = await file.arrayBuffer()
  const fileBytes = new Uint8Array(buffer)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)

  const encrypted = nacl.secretbox(fileBytes, nonce, key)
  if (!encrypted) throw new Error('File encryption failed')

  return {
    encrypted,
    nonce: encodeBase64(nonce),
    originalName: file.name,
    mimeType: file.type
  }
}

// Decrypt a file
export function decryptFile(
  encrypted: Uint8Array,
  nonce: string,
  key: Uint8Array
): Uint8Array {
  const nonceBytes = decodeBase64(nonce)
  const decrypted = nacl.secretbox.open(encrypted, nonceBytes, key)
  if (!decrypted) throw new Error('File decryption failed')
  return decrypted
}

// Store private key securely using Electron's safeStorage
export async function storePrivateKey(secretKey: Uint8Array): Promise<void> {
  const encoded = encodeBase64(secretKey)
  if (window.api?.encryptData) {
    const encrypted = await window.api.encryptData(encoded)
    localStorage.setItem('blite_private_key', encrypted)
  } else {
    // Fallback: store base64 directly (less secure, no safeStorage available)
    localStorage.setItem('blite_private_key', encoded)
  }
}

// Retrieve private key from secure storage
export async function loadPrivateKey(): Promise<Uint8Array | null> {
  const stored = localStorage.getItem('blite_private_key')
  if (!stored) return null

  try {
    if (window.api?.decryptData) {
      const decrypted = await window.api.decryptData(stored)
      return decodeBase64(decrypted)
    } else {
      return decodeBase64(stored)
    }
  } catch {
    return null
  }
}

// Clear stored private key on logout
export function clearPrivateKey(): void {
  localStorage.removeItem('blite_private_key')
}
