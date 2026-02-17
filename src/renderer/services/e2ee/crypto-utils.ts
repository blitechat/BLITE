/**
 * E2EE Crypto Utilities
 * HMAC-SHA256 and HKDF implementations using Web Crypto API
 */

/**
 * Compute HMAC-SHA256(key, data)
 */
export async function hmacSHA256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data as unknown as ArrayBuffer)
  return new Uint8Array(signature)
}

/**
 * HKDF-SHA256 key derivation
 * @param ikm Input keying material
 * @param salt Optional salt (defaults to 32 zero bytes)
 * @param info Context/application info string
 * @param length Output key length in bytes (default 32)
 */
export async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array | null,
  info: string,
  length = 32
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    ikm as unknown as ArrayBuffer,
    'HKDF',
    false,
    ['deriveBits']
  )
  const saltBuffer = (salt || new Uint8Array(32)) as unknown as ArrayBuffer
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBuffer,
      info: new TextEncoder().encode(info),
    },
    cryptoKey,
    length * 8
  )
  return new Uint8Array(derived)
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}
