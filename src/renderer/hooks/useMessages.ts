import { useState, useEffect, useCallback, useRef } from 'react'
import { useMessageStore } from '@renderer/stores/messageStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { messageAPI, channelKeyAPI, userAPI, keyAPI } from '@renderer/services/api'
import { decryptChannel, decryptDM, decryptKeyForUser } from '@renderer/services/crypto'
import {
  getSession,
  saveSession,
  respondX3DH,
  initSession as initRatchetSession,
  advanceRecvChain,
  decryptWithMessageKey,
  getSenderKeyState,
  saveSenderKeyState,
  createSenderKeyState,
  advanceSenderRecvChain,
  decryptWithSenderKey,
  decryptSenderKeyFromUser,
  loadKeyBundle,
  deserializeKeyBundle,
  isSessionDBReady,
  initSessionDB,
  deriveSessionStoreKey,
} from '@renderer/services/e2ee'
import { storeSentMessage, getSentMessage } from '@renderer/services/sentMessageStore'
import type { Message } from '@shared/types'

interface UseMessagesReturn {
  messages: Message[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
}

const channelKeyCache: Record<string, Uint8Array> = {}

/**
 * Lazily ensure the session DB is initialized.
 * This handles the case where the session DB wasn't initialized during login
 * (e.g., web app key bundle was temporarily unreadable).
 */
async function ensureSessionDB(): Promise<boolean> {
  if (isSessionDBReady()) return true

  try {
    const storedBundle = await loadKeyBundle()
    if (!storedBundle) return false

    const bundle = deserializeKeyBundle(storedBundle)
    const storeKey = await deriveSessionStoreKey(bundle.identityKeyPair.secretKey)
    await initSessionDB(storeKey)
    return true
  } catch (err) {
    console.warn('[useMessages] Failed to lazily init session DB:', err)
    return false
  }
}

/**
 * Cache plaintext for a sent message by its message ID (now persistent)
 */
export async function cacheSentMessageById(messageId: string, plaintext: string, channelId: string): Promise<void> {
  await storeSentMessage(messageId, plaintext, channelId)
}

/**
 * Get cached plaintext for a message ID (from persistent storage)
 */
export async function getCachedSentMessage(messageId: string): Promise<string | null> {
  return await getSentMessage(messageId)
}

/**
 * Clear channel key cache on logout to prevent key leakage
 */
export function clearChannelKeyCache(): void {
  for (const key in channelKeyCache) {
    delete channelKeyCache[key]
  }
  // Note: Sent messages in IndexedDB persist across sessions by design
}

/**
 * Parse a nonce string to determine the encryption version:
 * - null/empty → v0 (plaintext)
 * - plain base64 (no JSON) → v1 (legacy nacl.box/secretbox)
 * - JSON with v:2 → v2 (new protocol)
 */
function parseNonceVersion(nonce: string | null | undefined): { version: 0 | 1 | 2; parsed?: any } {
  if (!nonce) return { version: 0 }
  try {
    const parsed = JSON.parse(nonce)
    if (parsed && parsed.v === 2) {
      return { version: 2, parsed }
    }
  } catch {
    // Not JSON — v1 plain base64
  }
  return { version: 1 }
}

export function useMessages(channelId: string | null, isDM = false): UseMessagesReturn {
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const rawMessages = useMessageStore((s) => (channelId ? s.messages[channelId] || [] : []))
  const hasMore = useMessageStore((s) => (channelId ? s.hasMore[channelId] ?? true : false))
  const setMessages = useMessageStore((s) => s.setMessages)
  const prependMessages = useMessageStore((s) => s.prependMessages)
  const setHasMore = useMessageStore((s) => s.setHasMore)
  const privateKey = useAuthStore((s) => s.privateKey)
  const user = useAuthStore((s) => s.user)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const dmChannels = useDMStore((s) => s.dmChannels)
  const [decryptedMessages, setDecryptedMessages] = useState<Message[]>([])
  const initialLoadRef = useRef(0)
  const incrementalRef = useRef(0)

  // Store frequently-changing dependencies in refs so decryptMessages identity stays stable
  const privateKeyRef = useRef(privateKey)
  privateKeyRef.current = privateKey
  const userRef = useRef(user)
  userRef.current = user
  const dmChannelsRef = useRef(dmChannels)
  dmChannelsRef.current = dmChannels

  const getChannelKey = useCallback(async (chId: string, senderId?: string): Promise<Uint8Array | null> => {
    const cacheKey = senderId ? `${chId}:${senderId}` : chId
    if (channelKeyCache[cacheKey]) return channelKeyCache[cacheKey]
    if (!privateKeyRef.current) {
      console.warn('[getChannelKey] No private key available')
      return null
    }

    try {
      console.log('[getChannelKey] Fetching channel key for:', chId, senderId ? `sender: ${senderId}` : '(legacy)')
      const keyData = await channelKeyAPI.getKey(chId, senderId)
      if (keyData && keyData.encryptedKey) {
        const parts = keyData.encryptedKey.split(':')
        if (parts.length === 2) {
          // For sender key decryption, we need the sender's public key
          let publicKey = userRef.current?.publicKey || ''
          if (senderId && senderId !== userRef.current?.id) {
            try {
              const profile = await userAPI.getProfile(senderId)
              publicKey = profile.publicKey
            } catch {
              console.warn('[getChannelKey] Could not get sender profile for:', senderId)
            }
          }
          const key = decryptKeyForUser(parts[0], parts[1], publicKey, privateKeyRef.current)
          channelKeyCache[cacheKey] = key
          console.log('[getChannelKey] Channel key cached successfully')
          return key
        } else {
          console.error('[getChannelKey] Invalid encrypted key format:', keyData.encryptedKey)
        }
      } else {
        console.warn('[getChannelKey] No encrypted key data returned for channel:', chId)
      }
    } catch (err) {
      console.error('[getChannelKey] Failed to get channel key:', err)
    }
    return null
  }, [])

  /**
   * Decrypt a v2 DM message
   */
  const decryptV2DM = async (
    encryptedContent: string,
    parsed: any,
    senderId: string
  ): Promise<string> => {
    const pk = privateKeyRef.current
    if (!pk || !userRef.current) throw new Error('No private key')

    // Ensure session DB is ready (lazy init if needed)
    if (!await ensureSessionDB()) {
      throw new Error('Session DB not available - please log out and log back in')
    }

    let session = await getSession(senderId)

    // If this is an X3DH initial message (has ephemeral key)
    if (parsed.ek && !session) {
      console.log('[Decrypt] Receiving X3DH initial message from', senderId)

      // Load our key bundle to respond to X3DH
      const storedBundle = await loadKeyBundle()
      if (!storedBundle) {
        console.error('[Decrypt] No key bundle found for X3DH response')
        throw new Error('No key bundle for X3DH response')
      }
      const bundle = deserializeKeyBundle(storedBundle)

      // Find the OTP secret key if one was used
      let otpSecret: Uint8Array | undefined
      if (parsed.otk != null) {
        const otpKey = bundle.oneTimePreKeys.find((k) => k.id === parsed.otk)
        if (otpKey) {
          console.log('[Decrypt] Found OTP key', parsed.otk)
          otpSecret = otpKey.keyPair.secretKey
        } else {
          console.warn('[Decrypt] OTP key', parsed.otk, 'not found in bundle')
        }
      }

      // Get sender's identity key from their profile
      let senderIdentityKey: string
      try {
        const senderBundle = await keyAPI.getBundle(senderId)
        senderIdentityKey = senderBundle.identityKey
        console.log('[Decrypt] Got sender identity key from bundle')
      } catch (err) {
        console.warn('[Decrypt] Could not fetch sender bundle, falling back to profile:', err)
        // Fallback to user profile public key
        const profile = await userAPI.getProfile(senderId)
        senderIdentityKey = profile.publicKey
        console.log('[Decrypt] Got sender identity key from profile')
      }

      try {
        const x3dhResult = await respondX3DH({
          myIdentitySecret: bundle.identityKeyPair.secretKey,
          mySignedPreKeySecret: bundle.signedPreKey.keyPair.secretKey,
          myOneTimePreKeySecret: otpSecret,
          senderIdentityKey,
          senderEphemeralKey: parsed.ek,
        })

        session = await initRatchetSession(
          parsed.sid,
          senderId,
          x3dhResult.sharedSecret,
          false
        )
        console.log('[Decrypt] X3DH session initialized successfully')
      } catch (err) {
        console.error('[Decrypt] X3DH failed:', err)
        throw new Error(`X3DH failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    if (!session) {
      console.error('[Decrypt] No ratchet session for peer', senderId, '- message may be out of order or keys missing')
      throw new Error('No ratchet session for peer - send a new message to re-establish encryption')
    }

    try {
      const { messageKey, session: updatedSession } = await advanceRecvChain(session, parsed.c)
      await saveSession(updatedSession)
      return decryptWithMessageKey(encryptedContent, parsed.n, messageKey)
    } catch (err) {
      console.error('[Decrypt] Ratchet decryption failed:', err)
      // If counter is behind, this is likely an old message after session reset
      if (err instanceof Error && err.message.includes('behind current')) {
        throw new Error('Message from a previous session (encryption keys changed)')
      }
      throw new Error(`Ratchet decryption failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  /**
   * Decrypt a v2 sender key (channel) message
   */
  const decryptV2Channel = async (
    encryptedContent: string,
    parsed: any,
    chId: string,
    senderId: string
  ): Promise<string> => {
    const pk = privateKeyRef.current
    if (!pk || !userRef.current) throw new Error('No private key')

    // Ensure session DB is ready (lazy init if needed)
    if (!await ensureSessionDB()) {
      throw new Error('Session DB not available - please log out and log back in')
    }

    let senderState = await getSenderKeyState(chId, senderId)

    if (!senderState) {
      // We need to fetch the sender key from the channel keys
      try {
        // Pass senderId so the server returns the correct sender's key encrypted for us
        const keyData = await channelKeyAPI.getKey(chId, senderId)
        if (keyData?.encryptedKey) {
          const parts = keyData.encryptedKey.split(':')
          if (parts.length === 2) {
            // Try to get sender's public key
            let senderPubKey: string
            try {
              const profile = await userAPI.getProfile(senderId)
              senderPubKey = profile.publicKey
            } catch {
              throw new Error('Cannot get sender public key')
            }

            const senderKey = decryptSenderKeyFromUser(parts[0], parts[1], senderPubKey, pk)
            senderState = createSenderKeyState(chId, senderId, senderKey)
            // Persist the sender key state so we don't need to fetch again
            await saveSenderKeyState(senderState)
          }
        }
      } catch (err) {
        console.error('[Decrypt] Failed to fetch sender key for', senderId, 'in channel', chId, err)
        throw new Error('No sender key available')
      }
    }

    if (!senderState) throw new Error('No sender key state')

    const { messageKey, state: updatedState } = await advanceSenderRecvChain(senderState, parsed.c)
    await saveSenderKeyState(updatedState)
    return decryptWithSenderKey(encryptedContent, parsed.n, messageKey)
  }

  const decryptMessagesRef = useRef<(msgs: Message[], chId: string) => Promise<Message[]>>(null as any)
  decryptMessagesRef.current = async (msgs: Message[], chId: string): Promise<Message[]> => {
    if (!privateKeyRef.current || !chId) return msgs

    const results: Message[] = []

    for (const msg of msgs) {
      if (msg.content !== undefined) {
        results.push(msg)
        continue
      }

      if (msg.type === 'system') {
        results.push({ ...msg, content: msg.encryptedContent || 'System message' })
        continue
      }

      // Own messages: try cache first, then attempt decryption as fallback
      if (msg.senderId === userRef.current?.id) {
        // Check if we have cached plaintext for this specific message ID (from persistent storage)
        const cachedPlaintext = await getCachedSentMessage(msg.id)
        if (cachedPlaintext) {
          results.push({
            ...msg,
            content: cachedPlaintext
          })
          continue
        }

        // Cache miss - try to decrypt using available methods
        // v1 symmetric/box encryption can decrypt own messages (same key works both ways)
        try {
          const { version, parsed } = parseNonceVersion(msg.nonce)

          if (version === 0) {
            results.push({ ...msg, content: msg.encryptedContent || '' })
            continue
          } else if (version === 1) {
            // v1 legacy: can decrypt with same key
            if (isDM) {
              const dm = dmChannelsRef.current.find((d) => d.id === chId)
              const otherUser = dm?.participants?.find((p) => p.id !== userRef.current?.id)
              if (otherUser?.publicKey && privateKeyRef.current) {
                const decrypted = decryptDM(msg.encryptedContent, msg.nonce, otherUser.publicKey, privateKeyRef.current)
                results.push({ ...msg, content: decrypted })
                continue
              }
            } else {
              const channelKey = await getChannelKey(chId)
              if (channelKey) {
                const decrypted = decryptChannel(msg.encryptedContent, msg.nonce, channelKey)
                results.push({ ...msg, content: decrypted })
                continue
              }
            }
          } else if (version === 2 && parsed?.sk) {
            // v2 sender key: we can decrypt our own sender key messages
            // because we have our own sender key state
            const senderState = await getSenderKeyState(chId, userRef.current!.id)
            if (senderState) {
              try {
                const { messageKey, state: updatedState } = await advanceSenderRecvChain(senderState, parsed.c)
                await saveSenderKeyState(updatedState)
                const decrypted = decryptWithSenderKey(msg.encryptedContent, parsed.n, messageKey)
                // Cache for next time
                await cacheSentMessageById(msg.id, decrypted, chId)
                results.push({ ...msg, content: decrypted })
                continue
              } catch {
                // Sender key chain may be out of sync, fall through
              }
            }
          }
          // v2 DM ratchet own messages can't be decrypted with recv chain
          // Fall through to placeholder
        } catch {
          // Decryption failed, fall through
        }

        // Last resort: show a useful placeholder
        results.push({
          ...msg,
          content: '[Your message is no longer stored on this device]'
        })
        continue
      }

      // Check decrypted message cache before attempting protocol-level decryption
      const cachedContent = await getCachedSentMessage(msg.id)
      if (cachedContent) {
        let sender = msg.sender
        if (!sender) {
          try {
            sender = await userAPI.getProfile(msg.senderId)
          } catch {
            // Couldn't load profile
          }
        }
        results.push({ ...msg, content: cachedContent, sender })
        continue
      }

      try {
        let content: string
        const { version, parsed } = parseNonceVersion(msg.nonce)

        if (version === 0) {
          // v0: plaintext (old channel messages)
          content = msg.encryptedContent || ''
        } else if (version === 2) {
          // v2: new protocol
          if (parsed.sk) {
            // Sender key (channel)
            content = await decryptV2Channel(msg.encryptedContent, parsed, chId, msg.senderId)
          } else {
            // DM ratchet
            content = await decryptV2DM(msg.encryptedContent, parsed, msg.senderId)
          }
        } else {
          // v1: legacy encryption
          if (isDM) {
            const dm = dmChannelsRef.current.find((d) => d.id === chId)
            const otherUser = dm?.participants?.find((p) => p.id !== userRef.current?.id)
            console.log('[Decrypt v1 DM] Channel:', chId, 'DM found:', !!dm, 'Other user:', otherUser?.id, 'Has public key:', !!otherUser?.publicKey)
            if (otherUser && otherUser.publicKey) {
              console.log('[Decrypt v1 DM] Decrypting message', msg.id)
              content = decryptDM(msg.encryptedContent, msg.nonce, otherUser.publicKey, privateKeyRef.current)
              console.log('[Decrypt v1 DM] Successfully decrypted')
            } else {
              console.error('[Decrypt v1 DM] Missing DM keys for message', msg.id, 'otherUser:', otherUser?.id, 'hasPublicKey:', !!otherUser?.publicKey, 'participants:', dm?.participants?.map(p => ({ id: p.id, hasKey: !!p.publicKey })))
              // Try to reload DM data
              content = '[Unable to decrypt - missing encryption key]'
            }
          } else {
            console.log('[Decrypt v1 Channel] Attempting to get channel key for message', msg.id, 'in channel', chId)
            const channelKey = await getChannelKey(chId)
            if (channelKey) {
              console.log('[Decrypt v1 Channel] Got channel key, decrypting message', msg.id)
              content = decryptChannel(msg.encryptedContent, msg.nonce, channelKey)
              console.log('[Decrypt v1 Channel] Successfully decrypted')
            } else {
              console.error('[Decrypt v1 Channel] No channel key available for message', msg.id, 'in channel', chId)
              content = '[Encrypted message - channel key not available]'
            }
          }
        }

        // Cache successfully decrypted message for future restarts
        await storeSentMessage(msg.id, content, chId)

        let sender = msg.sender
        if (!sender) {
          try {
            sender = await userAPI.getProfile(msg.senderId)
          } catch {
            // Couldn't load profile
          }
        }

        results.push({ ...msg, content, sender })
      } catch (err) {
        console.error(`[Decrypt] Failed to decrypt message ${msg.id}:`, err)
        console.error(`[Decrypt] Message details: version=${parseNonceVersion(msg.nonce).version}, senderId=${msg.senderId}, channelId=${chId}, isDM=${isDM}, hasPrivateKey=${!!privateKeyRef.current}, nonce=${msg.nonce?.substring(0, 80)}`)

        // Provide a user-friendly error message
        let errorContent = '[This message could not be decrypted - it may be outside your local message history]'
        if (!privateKeyRef.current) {
          errorContent = '[Encryption keys not loaded - please log out and log back in]'
        } else if (err instanceof Error) {
          if (err.message.includes('No sender key')) {
            errorContent = '[Could not decrypt - encryption keys for this sender are no longer available on this device]'
          } else if (err.message.includes('No ratchet session') || err.message.includes('previous session')) {
            errorContent = '[This message is from a previous encryption session and is no longer stored on this device]'
          } else if (err.message.includes('X3DH failed') || err.message.includes('No key bundle')) {
            errorContent = '[Key exchange pending - message will decrypt when keys sync]'
          } else if (err.message.includes('behind current') || err.message.includes('Ratchet decryption failed')) {
            errorContent = '[This message is from a previous encryption session and is no longer stored on this device]'
          }
        }

        results.push({
          ...msg,
          content: errorContent
        })
      }
    }

    return results
  }

  // Load initial messages - only depends on channelId
  useEffect(() => {
    if (!channelId) {
      setDecryptedMessages([])
      setLoading(false)
      return
    }

    // Create AbortController for request cancellation
    const abortController = new AbortController()

    // Reset state for new channel
    setDecryptedMessages([])
    const currentRun = ++initialLoadRef.current

    const loadInitial = async () => {
      setLoading(true)
      try {
        const response = await messageAPI.list(channelId, undefined, 50, abortController.signal)
        if (initialLoadRef.current !== currentRun) return
        setMessages(channelId, response.messages)
        setHasMore(channelId, response.hasMore)

        const decrypted = await decryptMessagesRef.current(response.messages, channelId)
        if (initialLoadRef.current !== currentRun) return
        setDecryptedMessages(decrypted)
      } catch (err: any) {
        // Ignore aborted requests
        if (err?.name === 'AbortError' || err?.name === 'CanceledError') return
        console.error('Failed to load messages:', err)
        if (initialLoadRef.current === currentRun) {
          setDecryptedMessages([])
          setHasMore(channelId, false)
        }
      } finally {
        if (initialLoadRef.current === currentRun) {
          setLoading(false)
        }
      }
    }

    loadInitial()

    // Cleanup: abort request on unmount or channel change
    return () => {
      abortController.abort()
    }
  }, [channelId, setMessages, setHasMore])

  // Re-decrypt only NEW messages when raw messages change (new messages arrive via socket)
  useEffect(() => {
    if (!channelId || loading) return

    const currentRun = ++incrementalRef.current

    // Find messages that aren't already decrypted
    const existingIds = new Set(decryptedMessages.map((m) => m.id))
    const newMessages = rawMessages.filter((m) => !existingIds.has(m.id))

    // Also check for edited messages
    const editedMessages = rawMessages.filter((m) => {
      const existing = decryptedMessages.find((dm) => dm.id === m.id)
      return existing && m.editedAt && m.editedAt !== existing.editedAt
    })

    if (newMessages.length === 0 && editedMessages.length === 0) {
      return // No new or edited messages, skip decryption
    }

    const toDecrypt = [...newMessages, ...editedMessages]

    // Only decrypt new/edited messages
    decryptMessagesRef.current(toDecrypt, channelId).then((decrypted) => {
      if (incrementalRef.current === currentRun) {
        setDecryptedMessages((prev) => {
          // Replace edited messages and add new ones
          const editedIds = new Set(editedMessages.map((m) => m.id))
          const filtered = prev.filter((m) => !editedIds.has(m.id))
          const prevIds = new Set(filtered.map((m) => m.id))
          const uniqueNew = decrypted.filter((m) => !prevIds.has(m.id))
          return [...filtered, ...uniqueNew]
        })
      }
    }).catch((err) => {
      console.error('[useMessages] Incremental decryption failed:', err)
    })
  }, [rawMessages, loading, channelId])

  const loadMore = useCallback(async () => {
    if (!channelId || !hasMore || loadingMore) return

    setLoadingMore(true)
    try {
      const firstMsg = rawMessages[0]
      const response = await messageAPI.list(channelId, firstMsg?.id, 50)
      setHasMore(channelId, response.hasMore)
      prependMessages(channelId, response.messages)
      const newlyDecrypted = await decryptMessagesRef.current(response.messages, channelId)
      setDecryptedMessages(prev => [...newlyDecrypted, ...prev])
    } catch (err) {
      console.error('Failed to load more messages:', err)
    } finally {
      setLoadingMore(false)
    }
  }, [channelId, hasMore, loadingMore, rawMessages, prependMessages, setHasMore])

  return {
    messages: decryptedMessages,
    loading,
    loadingMore,
    hasMore,
    loadMore,
  }
}
