import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { useMessageStore } from '../stores/messageStore'
import { usePresenceStore } from '../stores/presenceStore'
import { useServerStore } from '../stores/serverStore'
import { useFriendStore } from '../stores/friendStore'
import { useVoiceStore } from '../stores/voiceStore'
import { useCallStore } from '../stores/callStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { VoicePeerSummary } from '../stores/voiceStore'
import { consumeProducer, handleProducerClosed, closePeerConsumers, cleanup as cleanupVoice } from './voiceService'
import { handleIncomingCall, handleCallAccepted, handleCallDeclined, handleCallCancelled, handleVoiceDisconnected } from './callService'
import { playUserJoinedSound, playUserLeftSound, playMessageReceivedSound } from './soundService'
import type { Message, UserStatus, Channel, ServerMember, FriendRequest, Friendship, ReactionGroup } from '@shared/types'

import { PRODUCTION_URL } from './config'

function getSocketUrl(): string {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL
  const override = typeof window !== 'undefined' && localStorage.getItem('blite_backend_url')
  if (override) return override
  const isElectron = typeof window !== 'undefined' && !!window.api
  if (isElectron) return PRODUCTION_URL
  return '' // web: same-origin
}

const SOCKET_URL = getSocketUrl()

let socket: Socket | null = null
let listenersRegistered = false
let privateKeyUnsubscribe: (() => void) | null = null

// Message queue for offline messages
interface QueuedMessage {
  id: string
  channelId: string
  encryptedContent: string
  nonce: string
  type: string
  replyToId?: string
  timestamp: number
  retries: number
}

const messageQueue: QueuedMessage[] = []
const MAX_RETRIES = 3
const MAX_QUEUE_SIZE = 100

// Track pending sent messages to cache plaintext when they echo back
// Primary: match by encrypted content. Secondary: match by channelId + timestamp.
const pendingSentMessages = new Map<string, { plaintext: string; channelId: string; timestamp: number }>()

export function connectSocket(): Socket {
  const token = useAuthStore.getState().token
  if (!token) throw new Error('No auth token')

  // If socket exists and is connected, return it without re-registering listeners
  if (socket?.connected) return socket

  // If socket exists but disconnected, close it and create a new one
  if (socket) {
    socket.removeAllListeners()
    socket.close()
    listenersRegistered = false
  }

  // Clean up any previous privateKey subscriber
  if (privateKeyUnsubscribe) {
    privateKeyUnsubscribe()
    privateKeyUnsubscribe = null
  }

  socket = io(SOCKET_URL || undefined, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  })

  // Only register listeners once to prevent duplicates
  if (!listenersRegistered) {
    registerSocketListeners(socket)
    listenersRegistered = true
  }

  return socket
}

function flushMessageQueue(): void {
  if (!socket || !socket.connected || messageQueue.length === 0) return

  console.log(`[Socket] Flushing ${messageQueue.length} queued messages`)

  // Process messages in order
  const messagesToSend = [...messageQueue]
  messageQueue.length = 0 // Clear queue

  for (const msg of messagesToSend) {
    socket.emit('message:send', {
      channelId: msg.channelId,
      encryptedContent: msg.encryptedContent,
      nonce: msg.nonce,
      type: msg.type,
      replyToId: msg.replyToId,
    }, (response: any) => {
      if (response?.error) {
        console.error('[Socket] Failed to send queued message:', response.error)
        // Re-queue if retries left
        if (msg.retries < MAX_RETRIES) {
          msg.retries++
          messageQueue.push(msg)
          console.log(`[Socket] Re-queued message (retry ${msg.retries}/${MAX_RETRIES})`)
        }
      } else {
        console.log('[Socket] Queued message sent successfully:', msg.id)
      }
    })
  }
}

function registerSocketListeners(socket: Socket): void {
  socket.on('connect', () => {
    console.log('[Socket] ==========================================')
    console.log('[Socket] Socket CONNECTED')
    console.log('[Socket] Socket ID:', socket?.id)
    const user = useAuthStore.getState().user
    console.log('[Socket] Current user:', user?.id, user?.username)
    console.log('[Socket] User should be in room: user:' + user?.id)
    console.log('[Socket] ==========================================')

    // Flush queued messages on reconnect
    flushMessageQueue()
  })

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason)
    const voiceStore = useVoiceStore.getState()
    if (voiceStore.isConnected || voiceStore.currentChannelId) {
      cleanupVoice()
      voiceStore.setDisconnected()
      handleVoiceDisconnected()
    }
  })

  // Message events
  socket.on('message:new', async (message: Message) => {
    // If this is our own message, cache it BEFORE adding to store
    const currentUserId = useAuthStore.getState().user?.id
    if (message.senderId === currentUserId) {
      try {
        const { cacheSentMessageById } = await import('../hooks/useMessages')

        // Try exact match by encrypted content first
        let pending = pendingSentMessages.get(message.encryptedContent)

        // Fallback: find any pending message for this channel (handles edge cases)
        if (!pending || pending.channelId !== message.channelId) {
          for (const [key, entry] of pendingSentMessages) {
            if (entry.channelId === message.channelId && Date.now() - entry.timestamp < 30000) {
              pending = entry
              pendingSentMessages.delete(key)
              break
            }
          }
        } else {
          pendingSentMessages.delete(message.encryptedContent)
        }

        if (pending) {
          // Wait for cache to complete before adding to store
          await cacheSentMessageById(message.id, pending.plaintext, message.channelId)
        }
      } catch (err) {
        console.error('[Socket] Failed to cache sent message:', err)
      }
    }

    // Now add to message store (cache is ready for own messages)
    useMessageStore.getState().addMessage(message.channelId, message)

    // Track unread
    const activeChannelId = useServerStore.getState().activeChannelId
    if (message.channelId !== activeChannelId) {
      useServerStore.getState().markChannelUnread(message.channelId)
    }

    // Play notification sound if not in the active channel
    const currentUser = useAuthStore.getState().user
    if (message.senderId !== currentUser?.id && message.channelId !== activeChannelId) {
      const notifSettings = useSettingsStore.getState().notifications
      if (notifSettings.messageSound) {
        playMessageReceivedSound()
      }
    }

    // Show desktop notification if not focused
    if (document.hidden) {
      const sender = message.sender
      if (window.api?.showNotification) {
        window.api.showNotification(
          sender?.displayName || 'New message',
          'New encrypted message received'
        )
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(sender?.displayName || 'New message', {
          body: 'New encrypted message received'
        })
      }
    }
  })

  socket.on('message:edited', (message: Message) => {
    useMessageStore.getState().editMessage(
      message.channelId,
      message.id,
      message.content || '',
      message.encryptedContent,
      message.nonce
    )
  })

  socket.on('message:deleted', ({ channelId, messageId }: { channelId: string; messageId: string }) => {
    useMessageStore.getState().deleteMessage(channelId, messageId)
  })

  // Expired messages (disappearing messages cleanup)
  socket.on('message:expired', ({ channelId, messageIds }: { channelId: string; messageIds: string[] }) => {
    const store = useMessageStore.getState()
    for (const messageId of messageIds) {
      store.deleteMessage(channelId, messageId)
    }
  })

  // Reaction events
  socket.on('reaction:updated', ({ messageId, channelId, reactions }: { messageId: string; channelId: string; reactions: ReactionGroup[] }) => {
    useMessageStore.getState().updateReactions(channelId, messageId, reactions)
  })

  // Typing events
  socket.on('typing:update', ({ channelId, userId, typing }: { channelId: string; userId: string; typing: boolean }) => {
    useMessageStore.getState().setTypingUser(channelId, userId, typing)
  })

  // Presence events
  socket.on('presence:changed', ({ userId, status }: { userId: string; status: UserStatus }) => {
    usePresenceStore.getState().setPresence(userId, status)
  })

  // Server member events
  socket.on('member:joined', ({ serverId, member }: { serverId: string; member: ServerMember }) => {
    useServerStore.getState().addMember(serverId, member)
  })

  socket.on('member:left', ({ serverId, userId }: { serverId: string; userId: string }) => {
    useServerStore.getState().removeMember(serverId, userId)
  })

  // Channel events
  socket.on('channel:created', ({ serverId, channel }: { serverId: string; channel: Channel }) => {
    useServerStore.getState().addChannel(serverId, channel)
  })

  socket.on('channel:deleted', ({ serverId, channelId }: { serverId: string; channelId: string }) => {
    useServerStore.getState().removeChannel(serverId, channelId)
  })

  // Friend events
  socket.on('friend:request-received', ({ request }: { request: FriendRequest }) => {
    useFriendStore.getState().addIncomingRequest(request)

    // Show desktop notification for friend request
    const senderName = request.sender?.displayName || request.sender?.username || 'Someone'
    if (window.api?.showNotification) {
      window.api.showNotification('Friend Request', `${senderName} wants to be your friend`)
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Friend Request', {
        body: `${senderName} wants to be your friend`
      })
    }
  })

  socket.on('friend:request-accepted', ({ friendship }: { friendship: Friendship }) => {
    useFriendStore.getState().addFriend(friendship)
    useFriendStore.getState().removeOutgoingRequest(friendship.friendId)
  })

  socket.on('friend:removed', ({ userId }: { userId: string }) => {
    useFriendStore.getState().removeFriend(userId)
  })

  // Voice events
  socket.on('voice:user-joined', async ({ userId, displayName, channelId }: { userId: string; displayName: string; channelId: string }) => {
    const voiceStore = useVoiceStore.getState()
    if (voiceStore.currentChannelId === channelId) {
      voiceStore.addPeer(userId, displayName)
      playUserJoinedSound()

      // Distribute our voice E2EE key to the new peer
      try {
        const { distributeKeyToPeer } = await import('./e2ee/voiceE2EE')
        await distributeKeyToPeer(channelId, userId)
      } catch (err) {
        console.error('[Socket] Failed to distribute voice key to new peer:', err)
      }
    }
  })

  socket.on('voice:user-left', async ({ userId, channelId }: { userId: string; channelId: string }) => {
    const voiceStore = useVoiceStore.getState()
    if (voiceStore.currentChannelId === channelId) {
      // Close all consumers for this peer before removing
      closePeerConsumers(userId)
      voiceStore.removePeer(userId)
      playUserLeftSound()

      // Clean up peer's E2EE key and rotate our own key
      try {
        const { handlePeerLeft, rotateVoiceKey } = await import('./e2ee/voiceE2EE')
        handlePeerLeft(userId)
        await rotateVoiceKey(channelId)
      } catch (err) {
        console.error('[Socket] Failed to handle voice E2EE peer left:', err)
      }

      // If this is a DM call and the other party left, end the call
      if (voiceStore.currentServerId === 'dm') {
        // In a DM call, if the other person leaves, we should disconnect too
        const remainingPeers = Object.keys(voiceStore.peers).filter(id => id !== userId)
        if (remainingPeers.length === 0) {
          // No peers left, end the call
          cleanupVoice()
          voiceStore.setDisconnected()
          handleVoiceDisconnected()
        }
      }
    }
  })

  socket.on('voice:newProducer', async ({ producerId, userId, kind, appData }: { producerId: string; userId: string; kind: string; appData: Record<string, unknown> }) => {
    const voiceStore = useVoiceStore.getState()
    if (voiceStore.isConnected) {
      consumeProducer(producerId, userId)
    }
  })

  socket.on('voice:producerClosed', ({ producerId, userId }: { producerId: string; userId: string }) => {
    handleProducerClosed(producerId, userId)
  })

  socket.on('voice:producerPaused', ({ producerId, userId }: { producerId: string; userId: string }) => {
    // Producer paused on server side - handled by consumer events
  })

  socket.on('voice:producerResumed', ({ producerId, userId }: { producerId: string; userId: string }) => {
    // Producer resumed on server side - handled by consumer events
  })

  socket.on('voice:peerStateChanged', ({ userId, isMuted, isDeafened, isCameraOn, isScreenSharing }: {
    userId: string; isMuted: boolean; isDeafened: boolean; isCameraOn: boolean; isScreenSharing: boolean
  }) => {
    useVoiceStore.getState().updatePeerState(userId, { isMuted, isDeafened, isCameraOn, isScreenSharing })
  })

  socket.on('voice:activeSpeaker', ({ userId, volume }: { userId: string | null; volume: number }) => {
    useVoiceStore.getState().setActiveSpeaker(userId)
  })

  socket.on('voice:channelUpdate', ({ channelId, peers, occupancy }: {
    channelId: string; peers: VoicePeerSummary[]; occupancy: Record<string, VoicePeerSummary[]>
  }) => {
    useVoiceStore.getState().setChannelOccupants(occupancy)
  })

  // Voice E2EE: receive encrypted AES key from a peer
  socket.on('voice:e2ee-key', async ({ fromUserId, fromPublicKey, encrypted, nonce, keyId }: {
    fromUserId: string; fromPublicKey: string | null; encrypted: string; nonce: string; keyId: number
  }) => {
    const voiceStore = useVoiceStore.getState()
    // Accept keys during connecting phase too - peers send keys as soon as
    // they see us join, which happens before we finish setup and set isConnected
    if (!voiceStore.isConnected && !voiceStore.isConnecting) return

    if (!fromPublicKey) {
      console.warn('[Socket] Cannot decrypt voice E2EE key: sender public key missing')
      return
    }

    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      // Private key not loaded yet — buffer so we can process once it arrives
      const { bufferIncomingKey } = await import('./e2ee/voiceE2EE')
      bufferIncomingKey(fromUserId, encrypted, nonce, fromPublicKey, keyId)
      return
    }

    try {
      const { handlePeerVoiceKey } = await import('./e2ee/voiceE2EE')
      await handlePeerVoiceKey(fromUserId, encrypted, nonce, fromPublicKey, privateKey, keyId)
    } catch (err) {
      console.error('[Socket] Failed to handle voice E2EE key:', err)
    }
  })

  // Voice E2EE: someone is requesting our key
  socket.on('voice:e2ee-key-requested', async ({ fromUserId, channelId }: {
    fromUserId: string; channelId: string
  }) => {
    const voiceStore = useVoiceStore.getState()
    if (!voiceStore.isConnected || voiceStore.currentChannelId !== channelId) {
      console.log(`[Socket] Ignoring key request: not in channel ${channelId}`)
      return
    }

    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      console.warn(`[Socket] Cannot send E2EE key to ${fromUserId}: private key not available`)
      return
    }

    console.log(`[Socket] User ${fromUserId} requested our E2EE key for channel ${channelId}`)

    try {
      const { distributeKeyToPeer } = await import('./e2ee/voiceE2EE')
      await distributeKeyToPeer(channelId, fromUserId)
      console.log(`[Socket] ✓ Sent E2EE key to ${fromUserId} in response to request`)
    } catch (err) {
      console.error('[Socket] Failed to send key in response to request:', err)
    }
  })

  // When private key becomes available while already in a voice channel, flush
  // any buffered peer keys and redistribute our own key so E2EE activates late.
  {
    let prevPrivateKey: Uint8Array | null = useAuthStore.getState().privateKey
    privateKeyUnsubscribe = useAuthStore.subscribe(async (state) => {
      const { privateKey } = state
      if (!privateKey || privateKey === prevPrivateKey) {
        prevPrivateKey = privateKey
        return
      }
      prevPrivateKey = privateKey

      const voiceStore = useVoiceStore.getState()
      if (!voiceStore.isConnected || !voiceStore.currentChannelId) return

      console.log('[Socket] Private key now available while in voice — retrying E2EE key exchange')
      try {
        const { flushPendingIncomingKeys, distributeKeyToAllPeers } = await import('./e2ee/voiceE2EE')
        await flushPendingIncomingKeys(privateKey)
        await distributeKeyToAllPeers(voiceStore.currentChannelId)
        useVoiceStore.getState().setVoiceE2EE(true)
      } catch (err) {
        console.error('[Socket] Failed to retry voice E2EE key exchange:', err)
      }
    })
  }

  // E2EE: member needs keys (new member joined server)
  socket.on('member:needs-keys', async ({ serverId, userId: newMemberId }: { serverId: string; userId: string }) => {
    // When a new member joins, distribute our sender keys to them
    const currentUser = useAuthStore.getState().user
    const privateKey = useAuthStore.getState().privateKey
    if (!currentUser || !privateKey || currentUser.id === newMemberId) return

    try {
      // Dynamically import to avoid circular deps
      const { getSenderKeyState, encryptSenderKeyForUser } = await import('./e2ee')
      const { userAPI, channelKeyAPI } = await import('./api')
      const { useServerStore } = await import('../stores/serverStore')

      const serverStore = useServerStore.getState()
      const serverChannels = serverStore.channels[serverId] || []

      // Get the new member's public key
      let memberPubKey: string
      try {
        const profile = await userAPI.getProfile(newMemberId)
        memberPubKey = profile.publicKey
      } catch {
        return // Can't distribute without public key
      }

      // Distribute sender keys for each channel
      for (const channel of serverChannels) {
        if (channel.type !== 'text') continue
        const state = await getSenderKeyState(channel.id, currentUser.id)
        if (!state) continue

        try {
          const naclUtil = await import('tweetnacl-util')
          const senderKey = naclUtil.decodeBase64(state.chainKey)
          const { encrypted, nonce } = encryptSenderKeyForUser(senderKey, memberPubKey, privateKey)
          await channelKeyAPI.setKeys(channel.id, [{
            userId: newMemberId,
            encryptedKey: `${encrypted}:${nonce}`,
          }])
        } catch {
          // Non-critical
        }
      }
    } catch (err) {
      console.error('[Socket] Failed to distribute keys to new member:', err)
    }
  })

  // Call events
  socket.on('call:incoming', ({ callerId, callerName, callerAvatar, dmId, withVideo }: {
    callerId: string; callerName: string; callerAvatar: string | null; dmId: string; withVideo: boolean
  }) => {
    console.log('[Socket] ==========================================')
    console.log('[Socket] *** RECEIVED call:incoming EVENT ***')
    console.log('[Socket] Caller:', callerName, '(', callerId, ')')
    console.log('[Socket] DM ID:', dmId, 'withVideo:', withVideo)
    console.log('[Socket] Call store status:', useCallStore.getState().callStatus)
    console.log('[Socket] Voice store connected:', useVoiceStore.getState().isConnected)
    console.log('[Socket] ==========================================')
    handleIncomingCall(callerId, callerName, callerAvatar, dmId, withVideo)
  })

  socket.on('call:accepted', ({ dmId, recipientId }: { dmId: string; recipientId: string }) => {
    console.log('[Socket] *** RECEIVED call:accepted EVENT ***')
    console.log('[Socket] DM ID:', dmId, 'recipientId:', recipientId)
    handleCallAccepted(dmId, recipientId)
  })

  socket.on('call:declined', () => {
    console.log('[Socket] *** RECEIVED call:declined EVENT ***')
    handleCallDeclined()
  })

  socket.on('call:cancelled', () => {
    console.log('[Socket] *** RECEIVED call:cancelled EVENT ***')
    handleCallCancelled()
  })

  socket.on('call:busy', () => {
    // Recipient is busy (already in a call)
    useCallStore.getState().setCallStatus('declined')
    setTimeout(() => {
      useCallStore.getState().clearCall()
    }, 2000)
  })

  socket.on('call:timeout', () => {
    // Call was not answered in time
    useCallStore.getState().setCallStatus('missed')
    setTimeout(() => {
      useCallStore.getState().clearCall()
    }, 2000)
  })
}

export function disconnectSocket(): void {
  if (privateKeyUnsubscribe) {
    privateKeyUnsubscribe()
    privateKeyUnsubscribe = null
  }
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  socket = null
  listenersRegistered = false
}

export function getSocket(): Socket | null {
  return socket
}

// Emit helpers
export function sendMessage(channelId: string, encryptedContent: string, nonce: string, type = 'text', replyToId?: string, plaintext?: string): void {
  // Store plaintext for caching when message echoes back
  if (plaintext) {
    pendingSentMessages.set(encryptedContent, { plaintext, channelId, timestamp: Date.now() })
    // Clean up after 120 seconds in case message never comes back
    setTimeout(() => {
      pendingSentMessages.delete(encryptedContent)
    }, 120000)
  }
  if (!socket || !socket.connected) {
    // Queue message for later delivery
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
      console.warn('[Socket] Message queue full, dropping oldest message')
      messageQueue.shift()
    }

    const queuedMessage: QueuedMessage = {
      id: `queued-${Date.now()}-${Math.random()}`,
      channelId,
      encryptedContent,
      nonce,
      type,
      replyToId,
      timestamp: Date.now(),
      retries: 0,
    }

    messageQueue.push(queuedMessage)
    console.log(`[Socket] Message queued (${messageQueue.length} in queue)`)

    // Optionally notify user
    useMessageStore.getState().addMessage(channelId, {
      id: queuedMessage.id,
      channelId,
      senderId: useAuthStore.getState().user?.id || '',
      encryptedContent,
      nonce,
      type: type as any,
      content: '[Sending...]', // Placeholder
      createdAt: new Date().toISOString(),
      sender: useAuthStore.getState().user as any,
    })

    return
  }

  socket.emit('message:send', { channelId, encryptedContent, nonce, type, replyToId })
}

export function editMessage(messageId: string, encryptedContent: string, nonce: string): void {
  socket?.emit('message:edit', { messageId, encryptedContent, nonce })
}

export function deleteMessage(messageId: string): void {
  socket?.emit('message:delete', { messageId })
}

export function startTyping(channelId: string): void {
  socket?.emit('typing:start', { channelId })
}

export function stopTyping(channelId: string): void {
  socket?.emit('typing:stop', { channelId })
}

export function updatePresence(status: UserStatus): void {
  socket?.emit('presence:update', { status })
}

export function joinChannel(channelId: string): void {
  socket?.emit('channel:join', { channelId })
}

export function leaveChannel(channelId: string): void {
  socket?.emit('channel:leave', { channelId })
}

export function addReaction(messageId: string, channelId: string, emoji: string): void {
  socket?.emit('reaction:add', { messageId, channelId, emoji })
}

export function removeReaction(messageId: string, channelId: string, emoji: string): void {
  socket?.emit('reaction:remove', { messageId, channelId, emoji })
}
