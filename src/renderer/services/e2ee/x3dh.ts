/**
 * X3DH Key Agreement Protocol
 * Extended Triple Diffie-Hellman using tweetnacl's X25519 + Web Crypto HKDF
 */
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { hkdf, concatBytes } from './crypto-utils'

const { encodeBase64, decodeBase64 } = naclUtil

export interface RemoteKeyBundle {
  identityKey: string       // base64 X25519 public key
  signingKey: string        // base64 Ed25519 public key
  signedPreKey: string      // base64 X25519 public key
  signedPreKeyId: number
  signedPreKeySig: string   // base64 Ed25519 signature
  oneTimePreKey?: string    // base64 X25519 public key (may be absent)
  oneTimePreKeyId?: number
}

export interface X3DHResult {
  sharedSecret: Uint8Array    // 32-byte shared secret for initializing ratchet
  ephemeralPublicKey: string  // base64 ephemeral public key to send to recipient
  usedOtpKeyId?: number       // which OTP was consumed (if any)
}

export interface X3DHInitiatorParams {
  myIdentitySecret: Uint8Array
  recipientBundle: RemoteKeyBundle
}

export interface X3DHResponderParams {
  myIdentitySecret: Uint8Array
  mySignedPreKeySecret: Uint8Array
  myOneTimePreKeySecret?: Uint8Array  // if OTP was used
  senderIdentityKey: string           // base64
  senderEphemeralKey: string          // base64
}

/**
 * Verify the signed pre-key signature using the signing key
 */
export function verifySignedPreKey(bundle: RemoteKeyBundle): boolean {
  const signingKey = decodeBase64(bundle.signingKey)
  const signedPreKey = decodeBase64(bundle.signedPreKey)
  const signature = decodeBase64(bundle.signedPreKeySig)
  return nacl.sign.detached.verify(signedPreKey, signature, signingKey)
}

/**
 * Perform X3DH as the initiator (sender)
 *
 * DH1 = DH(myIdentity, theirSignedPreKey)
 * DH2 = DH(myEphemeral, theirIdentity)
 * DH3 = DH(myEphemeral, theirSignedPreKey)
 * DH4 = DH(myEphemeral, theirOTP)  [if available]
 * sharedSecret = HKDF(DH1 || DH2 || DH3 [|| DH4])
 */
export async function performX3DH(params: X3DHInitiatorParams): Promise<X3DHResult> {
  const { myIdentitySecret, recipientBundle } = params

  // Verify the signed pre-key
  if (!verifySignedPreKey(recipientBundle)) {
    throw new Error('Signed pre-key signature verification failed')
  }

  const theirIdentity = decodeBase64(recipientBundle.identityKey)
  const theirSignedPreKey = decodeBase64(recipientBundle.signedPreKey)

  // Generate ephemeral key pair
  const ephemeral = nacl.box.keyPair()

  // DH1: myIdentity x theirSignedPreKey
  const dh1 = nacl.box.before(theirSignedPreKey, myIdentitySecret)

  // DH2: myEphemeral x theirIdentity
  const dh2 = nacl.box.before(theirIdentity, ephemeral.secretKey)

  // DH3: myEphemeral x theirSignedPreKey
  const dh3 = nacl.box.before(theirSignedPreKey, ephemeral.secretKey)

  let dhConcat: Uint8Array
  let usedOtpKeyId: number | undefined

  if (recipientBundle.oneTimePreKey) {
    // DH4: myEphemeral x theirOTP
    const theirOTP = decodeBase64(recipientBundle.oneTimePreKey)
    const dh4 = nacl.box.before(theirOTP, ephemeral.secretKey)
    dhConcat = concatBytes(dh1, dh2, dh3, dh4)
    usedOtpKeyId = recipientBundle.oneTimePreKeyId
  } else {
    dhConcat = concatBytes(dh1, dh2, dh3)
  }

  // Derive shared secret using HKDF
  const sharedSecret = await hkdf(dhConcat, null, 'blite-x3dh-v1', 32)

  return {
    sharedSecret,
    ephemeralPublicKey: encodeBase64(ephemeral.publicKey),
    usedOtpKeyId,
  }
}

/**
 * Respond to X3DH as the recipient
 * Computes the same shared secret from the responder's side
 */
export async function respondX3DH(params: X3DHResponderParams): Promise<{ sharedSecret: Uint8Array }> {
  const {
    myIdentitySecret,
    mySignedPreKeySecret,
    myOneTimePreKeySecret,
    senderIdentityKey,
    senderEphemeralKey,
  } = params

  const theirIdentity = decodeBase64(senderIdentityKey)
  const theirEphemeral = decodeBase64(senderEphemeralKey)

  // DH1: theirIdentity x mySignedPreKey (same as initiator's DH1)
  const dh1 = nacl.box.before(theirIdentity, mySignedPreKeySecret)

  // DH2: theirEphemeral x myIdentity (same as initiator's DH2)
  const dh2 = nacl.box.before(theirEphemeral, myIdentitySecret)

  // DH3: theirEphemeral x mySignedPreKey (same as initiator's DH3)
  const dh3 = nacl.box.before(theirEphemeral, mySignedPreKeySecret)

  let dhConcat: Uint8Array

  if (myOneTimePreKeySecret) {
    // DH4: theirEphemeral x myOTP
    const dh4 = nacl.box.before(theirEphemeral, myOneTimePreKeySecret)
    dhConcat = concatBytes(dh1, dh2, dh3, dh4)
  } else {
    dhConcat = concatBytes(dh1, dh2, dh3)
  }

  const sharedSecret = await hkdf(dhConcat, null, 'blite-x3dh-v1', 32)

  return { sharedSecret }
}
