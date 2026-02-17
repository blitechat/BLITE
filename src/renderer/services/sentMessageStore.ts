/**
 * Persistent storage for sent message plaintexts using IndexedDB
 * This allows users to see their own sent messages after app restart
 */

const DB_NAME = 'blite-sent-messages'
const STORE_NAME = 'messages'
const DB_VERSION = 1
const MAX_MESSAGES = 5000 // Keep last 5000 decrypted messages (sent + received)

let dbInstance: IDBDatabase | null = null

/**
 * Initialize or get the IndexedDB database
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'messageId' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

/**
 * Store a sent message plaintext
 */
export async function storeSentMessage(messageId: string, plaintext: string, channelId: string): Promise<void> {
  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await new Promise<void>((resolve, reject) => {
      const request = store.put({
        messageId,
        plaintext,
        channelId,
        timestamp: Date.now()
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    // Cleanup old messages (keep last MAX_MESSAGES)
    await cleanupOldMessages()
  } catch (error) {
    console.error('[SentMessageStore] Failed to store message:', error)
  }
}

/**
 * Get a sent message plaintext by ID
 */
export async function getSentMessage(messageId: string): Promise<string | null> {
  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.get(messageId)
      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.plaintext : null)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[SentMessageStore] Failed to get message:', error)
    return null
  }
}

/**
 * Get all sent messages for a channel
 */
export async function getSentMessagesForChannel(channelId: string): Promise<Map<string, string>> {
  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const results = request.result || []
        const map = new Map<string, string>()

        results
          .filter((item: any) => item.channelId === channelId)
          .forEach((item: any) => {
            map.set(item.messageId, item.plaintext)
          })

        resolve(map)
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[SentMessageStore] Failed to get channel messages:', error)
    return new Map()
  }
}

/**
 * Clean up old messages, keeping only the most recent MAX_MESSAGES
 */
async function cleanupOldMessages(): Promise<void> {
  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index('timestamp')

    // Get all messages ordered by timestamp
    const request = index.openCursor(null, 'prev') // Newest first
    const messagesToKeep: string[] = []

    await new Promise<void>((resolve, reject) => {
      let count = 0

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result

        if (cursor && count < MAX_MESSAGES) {
          messagesToKeep.push(cursor.value.messageId)
          count++
          cursor.continue()
        } else {
          resolve()
        }
      }

      request.onerror = () => reject(request.error)
    })

    // Delete messages not in the keep list
    const allRequest = store.getAll()
    await new Promise<void>((resolve, reject) => {
      allRequest.onsuccess = () => {
        const all = allRequest.result || []
        const toDelete = all.filter((item: any) => !messagesToKeep.includes(item.messageId))

        toDelete.forEach((item: any) => {
          store.delete(item.messageId)
        })

        resolve()
      }
      allRequest.onerror = () => reject(allRequest.error)
    })
  } catch (error) {
    console.error('[SentMessageStore] Failed to cleanup old messages:', error)
  }
}

/**
 * Clear all sent messages (on logout)
 */
export async function clearSentMessages(): Promise<void> {
  try {
    const db = await getDB()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await new Promise<void>((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[SentMessageStore] Failed to clear messages:', error)
  }
}

/**
 * Delete the entire database (for troubleshooting)
 */
export async function deleteSentMessageDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
