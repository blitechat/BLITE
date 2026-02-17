/**
 * E2EE Session Store
 * Persists ratchet sessions and sender key states in IndexedDB.
 * Each blob is encrypted with nacl.secretbox using a key derived from the identity secret.
 */
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import type { RatchetSession } from './ratchet'
import type { SenderKeyState } from './senderKeys'

const { encodeBase64, decodeBase64 } = naclUtil

const DB_NAME = 'blite_e2ee'
const DB_VERSION = 1
const SESSION_STORE = 'sessions'
const SENDER_KEY_STORE = 'senderKeys'

let dbInstance: IDBDatabase | null = null
let storeEncryptionKey: Uint8Array | null = null

/**
 * Initialize the IndexedDB database for E2EE session persistence
 */
export function initSessionDB(encryptionKey: Uint8Array): Promise<void> {
  storeEncryptionKey = encryptionKey
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve()
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'peerId' })
      }
      if (!db.objectStoreNames.contains(SENDER_KEY_STORE)) {
        db.createObjectStore(SENDER_KEY_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result
      resolve()
    }

    request.onerror = () => {
      reject(new Error('Failed to open E2EE IndexedDB'))
    }
  })
}

export function isSessionDBReady(): boolean {
  return dbInstance !== null && storeEncryptionKey !== null
}

function getDB(): IDBDatabase {
  if (!dbInstance) throw new Error('Session DB not initialized')
  return dbInstance
}

function getKey(): Uint8Array {
  if (!storeEncryptionKey) throw new Error('Session store encryption key not set')
  return storeEncryptionKey
}

function encryptBlob(data: string): { encrypted: string; nonce: string } {
  const key = getKey()
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const messageBytes = naclUtil.decodeUTF8(data)
  const encrypted = nacl.secretbox(messageBytes, nonce, key)
  return {
    encrypted: encodeBase64(encrypted),
    nonce: encodeBase64(nonce),
  }
}

function decryptBlob(encrypted: string, nonce: string): string {
  const key = getKey()
  const encBytes = decodeBase64(encrypted)
  const nonceBytes = decodeBase64(nonce)
  const decrypted = nacl.secretbox.open(encBytes, nonceBytes, key)
  if (!decrypted) throw new Error('Session blob decryption failed')
  return naclUtil.encodeUTF8(decrypted)
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ─── Ratchet Sessions ───────────────────────────────────────────────────────

export async function saveSession(session: RatchetSession): Promise<void> {
  const db = getDB()
  const { encrypted, nonce } = encryptBlob(JSON.stringify(session))
  const tx = db.transaction(SESSION_STORE, 'readwrite')
  const store = tx.objectStore(SESSION_STORE)
  await idbRequest(store.put({ peerId: session.peerId, encrypted, nonce }))
}

export async function getSession(peerId: string): Promise<RatchetSession | null> {
  const db = getDB()
  const tx = db.transaction(SESSION_STORE, 'readonly')
  const store = tx.objectStore(SESSION_STORE)
  const result = await idbRequest(store.get(peerId))
  if (!result) return null
  try {
    const json = decryptBlob(result.encrypted, result.nonce)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export async function deleteSession(peerId: string): Promise<void> {
  const db = getDB()
  const tx = db.transaction(SESSION_STORE, 'readwrite')
  const store = tx.objectStore(SESSION_STORE)
  await idbRequest(store.delete(peerId))
}

export async function getAllSessions(): Promise<RatchetSession[]> {
  const db = getDB()
  const tx = db.transaction(SESSION_STORE, 'readonly')
  const store = tx.objectStore(SESSION_STORE)
  const all = await idbRequest(store.getAll())
  const sessions: RatchetSession[] = []
  for (const item of all) {
    try {
      const json = decryptBlob(item.encrypted, item.nonce)
      sessions.push(JSON.parse(json))
    } catch {
      // skip corrupted sessions
    }
  }
  return sessions
}

// ─── Sender Key States ──────────────────────────────────────────────────────

export async function saveSenderKeyState(state: SenderKeyState): Promise<void> {
  const db = getDB()
  const { encrypted, nonce } = encryptBlob(JSON.stringify(state))
  const id = `${state.channelId}:${state.senderId}`
  const tx = db.transaction(SENDER_KEY_STORE, 'readwrite')
  const store = tx.objectStore(SENDER_KEY_STORE)
  await idbRequest(store.put({ id, encrypted, nonce }))
}

export async function getSenderKeyState(channelId: string, senderId: string): Promise<SenderKeyState | null> {
  const db = getDB()
  const id = `${channelId}:${senderId}`
  const tx = db.transaction(SENDER_KEY_STORE, 'readonly')
  const store = tx.objectStore(SENDER_KEY_STORE)
  const result = await idbRequest(store.get(id))
  if (!result) return null
  try {
    const json = decryptBlob(result.encrypted, result.nonce)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export async function deleteSenderKeyState(channelId: string, senderId: string): Promise<void> {
  const db = getDB()
  const id = `${channelId}:${senderId}`
  const tx = db.transaction(SENDER_KEY_STORE, 'readwrite')
  const store = tx.objectStore(SENDER_KEY_STORE)
  await idbRequest(store.delete(id))
}

export async function getAllSenderKeyStates(): Promise<SenderKeyState[]> {
  const db = getDB()
  const tx = db.transaction(SENDER_KEY_STORE, 'readonly')
  const store = tx.objectStore(SENDER_KEY_STORE)
  const all = await idbRequest(store.getAll())
  const states: SenderKeyState[] = []
  for (const item of all) {
    try {
      const json = decryptBlob(item.encrypted, item.nonce)
      states.push(JSON.parse(json))
    } catch {
      // skip corrupted
    }
  }
  return states
}

/**
 * Clear all sender key states (forces redistribution)
 */
export async function clearAllSenderKeys(): Promise<void> {
  if (!dbInstance) return
  const tx = dbInstance.transaction(SENDER_KEY_STORE, 'readwrite')
  tx.objectStore(SENDER_KEY_STORE).clear()
}

/**
 * Clear all E2EE data (logout)
 */
export async function clearAllE2EEData(): Promise<void> {
  if (!dbInstance) return
  const tx = dbInstance.transaction([SESSION_STORE, SENDER_KEY_STORE], 'readwrite')
  tx.objectStore(SESSION_STORE).clear()
  tx.objectStore(SENDER_KEY_STORE).clear()
}
