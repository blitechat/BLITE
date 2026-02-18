/**
 * E2EE Module - Re-exports
 */

// Crypto utilities
export { hmacSHA256, hkdf, concatBytes } from './crypto-utils'

// Key management
export {
  generateKeyBundle,
  generateOneTimePreKeys,
  rotateSignedPreKey,
  bundleToUploadable,
  serializeKeyBundle,
  deserializeKeyBundle,
  storeKeyBundle,
  loadKeyBundle,
  clearKeyBundle,
  needsOTPReplenishment,
  needsSignedPreKeyRotation,
  deriveSessionStoreKey,
} from './keyManager'
export type { KeyBundle, SerializedKeyBundle, UploadableKeyBundle } from './keyManager'

// X3DH key agreement
export {
  verifySignedPreKey,
  performX3DH,
  respondX3DH,
} from './x3dh'
export type { RemoteKeyBundle, X3DHResult } from './x3dh'

// Symmetric ratchet
export {
  initSession,
  advanceSendChain,
  advanceRecvChain,
  encryptWithMessageKey,
  decryptWithMessageKey,
  createCanonicalSessionId,
  isCanonicalInitiator,
} from './ratchet'
export type { RatchetSession } from './ratchet'

// Session store (IndexedDB)
export {
  initSessionDB,
  isSessionDBReady,
  saveSession,
  getSession,
  deleteSession,
  getAllSessions,
  saveSenderKeyState,
  getSenderKeyState,
  deleteSenderKeyState,
  getAllSenderKeyStates,
  clearAllSenderKeys,
  clearAllE2EEData,
} from './sessionStore'

// Sender keys (group/channel)
export {
  generateSenderKey,
  createSenderKeyState,
  encryptSenderKeyForUser,
  decryptSenderKeyFromUser,
  advanceSenderChain,
  advanceSenderRecvChain,
  encryptWithSenderKey,
  decryptWithSenderKey,
  distributeSenderKey,
} from './senderKeys'
export type { SenderKeyState } from './senderKeys'

// Voice/Video E2EE
export {
  isInsertableStreamsSupported,
  initVoiceE2EE,
  cleanupVoiceE2EE,
  rotateVoiceKey,
  distributeKeyToPeer,
  distributeKeyToAllPeers,
  handlePeerVoiceKey,
  handlePeerLeft,
  hasPeerKey,
  waitForPeerKey,
  requestPeerKey,
  attachEncryptTransform,
  attachDecryptTransform,
} from './voiceE2EE'

// Recovery
export {
  generateRecoveryKey,
  formatRecoveryKey,
  validateRecoveryKey,
  cleanRecoveryKey,
  encryptKeysForRecovery,
  decryptKeysFromRecovery,
} from './recovery'
export type { RecoveryBlob, RecoverableKeys } from './recovery'
