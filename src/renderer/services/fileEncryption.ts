/**
 * Client-side file encryption/decryption using AES-GCM 256-bit via Web Crypto API.
 * Each file gets a random AES key + 12-byte IV. The key and IV are embedded in the
 * message content (which is then encrypted by the existing E2EE layer).
 */

export interface EncryptedFileMetadata {
  encrypted: true
  url: string
  key: string   // base64 AES-256 raw key
  iv: string    // base64 12-byte IV
  filename: string
  mimetype: string
  size: number
}

export interface EncryptFileResult {
  encryptedBlob: Blob
  key: string
  iv: string
  filename: string
  mimetype: string
  size: number
}

// Cache of decrypted object URLs keyed by upload URL to avoid re-decrypting
const objectUrlCache = new Map<string, string>()

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Encrypt a file with a random AES-GCM 256-bit key.
 */
export async function encryptFile(file: File): Promise<EncryptFileResult> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = await file.arrayBuffer()

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )

  const rawKey = await crypto.subtle.exportKey('raw', key)

  return {
    encryptedBlob: new Blob([ciphertext], { type: 'application/octet-stream' }),
    key: toBase64(rawKey),
    iv: toBase64(iv.buffer),
    filename: file.name,
    mimetype: file.type || 'application/octet-stream',
    size: file.size,
  }
}

/**
 * Decrypt an encrypted file. Returns an object URL for rendering.
 * Results are cached by upload URL.
 */
export async function decryptFile(
  encryptedData: ArrayBuffer,
  keyB64: string,
  ivB64: string,
  mimetype: string,
  cacheKey?: string
): Promise<string> {
  // Check cache first
  if (cacheKey && objectUrlCache.has(cacheKey)) {
    return objectUrlCache.get(cacheKey)!
  }

  const rawKey = fromBase64(keyB64)
  const iv = fromBase64(ivB64)

  const key = await crypto.subtle.importKey(
    'raw',
    rawKey.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encryptedData
  )

  const blob = new Blob([plaintext], { type: mimetype })
  const url = URL.createObjectURL(blob)

  if (cacheKey) {
    objectUrlCache.set(cacheKey, url)
  }

  return url
}

/**
 * Try to parse message content as encrypted file metadata.
 * Returns null for legacy plain URL strings.
 */
export function parseEncryptedFileMetadata(content: string): EncryptedFileMetadata | null {
  try {
    const parsed = JSON.parse(content)
    if (parsed && parsed.encrypted === true && parsed.url && parsed.key && parsed.iv) {
      return parsed as EncryptedFileMetadata
    }
  } catch {
    // Not JSON — legacy plain URL
  }
  return null
}

/**
 * Revoke all cached object URLs. Call on logout.
 */
export function revokeAll(): void {
  for (const url of objectUrlCache.values()) {
    URL.revokeObjectURL(url)
  }
  objectUrlCache.clear()
}
