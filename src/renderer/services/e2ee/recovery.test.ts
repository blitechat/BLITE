import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import {
  generateRecoveryKey,
  validateRecoveryKey,
  cleanRecoveryKey,
  encryptKeysForRecovery,
  decryptKeysFromRecovery,
} from './recovery'
import type { RecoverableKeys, RecoveryBlob } from './recovery'

const { encodeBase64, decodeUTF8 } = naclUtil

const TEST_KEYS: RecoverableKeys = {
  identitySecretKey: encodeBase64(nacl.randomBytes(64)),
  identityPublicKey: encodeBase64(nacl.randomBytes(32)),
  signingSecretKey: encodeBase64(nacl.randomBytes(64)),
  signingPublicKey: encodeBase64(nacl.randomBytes(32)),
  signedPreKeySecret: encodeBase64(nacl.randomBytes(32)),
  signedPreKeyPublic: encodeBase64(nacl.randomBytes(32)),
  signedPreKeyId: 42,
  signedPreKeySig: encodeBase64(nacl.randomBytes(64)),
}

describe('generateRecoveryKey', () => {
  it('returns a 48-character lowercase hex string', () => {
    const key = generateRecoveryKey()
    expect(key).toMatch(/^[0-9a-f]{48}$/)
  })

  it('returns a different key each call', () => {
    expect(generateRecoveryKey()).not.toBe(generateRecoveryKey())
  })
})

describe('validateRecoveryKey', () => {
  it('accepts a valid 48-char hex key', () => {
    expect(validateRecoveryKey('abcdef1234567890'.repeat(3))).toBe(true)
  })

  it('accepts uppercase hex', () => {
    expect(validateRecoveryKey('ABCDEF1234567890'.repeat(3))).toBe(true)
  })

  it('accepts a key with spaces (ignores them)', () => {
    const raw = 'abcdef1234567890'.repeat(3)
    const spaced = raw.match(/.{1,4}/g)!.join(' ')
    expect(validateRecoveryKey(spaced)).toBe(true)
  })

  it('rejects a key that is too short', () => {
    expect(validateRecoveryKey('abcdef1234567890'.repeat(3).slice(1))).toBe(false)
  })

  it('rejects a key that is too long', () => {
    expect(validateRecoveryKey('abcdef1234567890'.repeat(3) + 'a')).toBe(false)
  })

  it('rejects non-hex characters', () => {
    expect(validateRecoveryKey('g'.repeat(48))).toBe(false)
  })
})

describe('cleanRecoveryKey', () => {
  it('strips all whitespace', () => {
    expect(cleanRecoveryKey('ab cd  ef')).toBe('abcdef')
  })

  it('lowercases the key', () => {
    expect(cleanRecoveryKey('ABCDEF')).toBe('abcdef')
  })
})

describe('encryptKeysForRecovery', () => {
  it('produces a blob with all required PBKDF2 fields', async () => {
    const blob = await encryptKeysForRecovery(generateRecoveryKey(), TEST_KEYS)
    expect(blob.encrypted).toBeTruthy()
    expect(blob.nonce).toBeTruthy()
    expect(blob.salt).toBeTruthy()
    expect(blob.iterations).toBe(100000)
  })

  it('produces a unique ciphertext and salt on each call', async () => {
    const key = generateRecoveryKey()
    const a = await encryptKeysForRecovery(key, TEST_KEYS)
    const b = await encryptKeysForRecovery(key, TEST_KEYS)
    expect(a.encrypted).not.toBe(b.encrypted)
    expect(a.salt).not.toBe(b.salt)
  })
})

describe('decryptKeysFromRecovery', () => {
  it('round-trips keys through PBKDF2 encrypt/decrypt', async () => {
    const recoveryKey = generateRecoveryKey()
    const blob = await encryptKeysForRecovery(recoveryKey, TEST_KEYS)
    const restored = await decryptKeysFromRecovery(recoveryKey, blob)
    expect(restored).toEqual(TEST_KEYS)
  })

  it('decrypts a legacy blob (no salt) using the SHA-512 fallback', async () => {
    const recoveryKey = generateRecoveryKey()

    // Reproduce the v1 encryption path manually
    const encryptionKey = nacl.hash(decodeUTF8(recoveryKey)).slice(0, nacl.secretbox.keyLength)
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
    const encrypted = nacl.secretbox(decodeUTF8(JSON.stringify(TEST_KEYS)), nonce, encryptionKey)

    const legacyBlob: RecoveryBlob = {
      encrypted: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
      // no salt or iterations — legacy format
    }

    const restored = await decryptKeysFromRecovery(recoveryKey, legacyBlob)
    expect(restored).toEqual(TEST_KEYS)
  })

  it('throws when given the wrong recovery key', async () => {
    const blob = await encryptKeysForRecovery(generateRecoveryKey(), TEST_KEYS)
    await expect(decryptKeysFromRecovery(generateRecoveryKey(), blob)).rejects.toThrow()
  })

  it('throws when the blob is corrupted', async () => {
    const recoveryKey = generateRecoveryKey()
    const blob = await encryptKeysForRecovery(recoveryKey, TEST_KEYS)
    const corrupted: RecoveryBlob = { ...blob, encrypted: encodeBase64(nacl.randomBytes(64)) }
    await expect(decryptKeysFromRecovery(recoveryKey, corrupted)).rejects.toThrow()
  })
})
