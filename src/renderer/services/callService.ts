import { getSocket } from './socket'
import { useCallStore } from '../stores/callStore'
import { useAuthStore } from '../stores/authStore'
import { useVoiceStore } from '../stores/voiceStore'
import { startDMCall } from './voiceService'

// Emit helper with callback
function emit<T = any>(event: string, data?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = getSocket()
    if (!socket) {
      reject(new Error('Socket not connected'))
      return
    }
    socket.emit(event, data, (response: any) => {
      if (response?.error) {
        reject(new Error(response.error))
      } else {
        resolve(response as T)
      }
    })
  })
}

// Initiate a call to another user
export async function initiateCall(
  recipientId: string,
  recipientName: string,
  dmId: string,
  withVideo: boolean
): Promise<void> {
  const store = useCallStore.getState()
  const user = useAuthStore.getState().user

  if (!user) {
    console.error('Cannot initiate call: no user logged in')
    return
  }

  console.log('[Call] Initiating call to:', recipientId, 'dmId:', dmId)

  // Set calling state
  store.initiateCall(recipientId, recipientName, dmId, withVideo)

  try {
    // Send call request to server
    const response = await emit('call:initiate', {
      recipientId,
      dmId,
      withVideo,
      callerName: user.displayName || user.username,
      callerAvatar: user.avatarUrl,
    })
    console.log('[Call] Server response:', response)
  } catch (err) {
    console.error('[Call] Failed to initiate call:', err)
    store.clearCall()
  }
}

// Accept an incoming call
export async function acceptIncomingCall(): Promise<void> {
  const store = useCallStore.getState()
  const voiceStore = useVoiceStore.getState()
  const { incomingCall } = store

  if (!incomingCall) {
    console.log('[Call] acceptIncomingCall: no incoming call')
    return
  }

  console.log('[Call] ==========================================')
  console.log('[Call] Accepting call from:', incomingCall.callerName, 'dmId:', incomingCall.dmId)
  console.log('[Call] Voice state before accept - connected:', voiceStore.isConnected, 'connecting:', voiceStore.isConnecting)
  console.log('[Call] ==========================================')

  // Check if we're already trying to join this call
  if (voiceStore.isConnecting && voiceStore.currentChannelId === incomingCall.dmId) {
    console.log('[Call] Already joining this call, waiting for it to complete')
    return
  }

  try {
    // Notify caller that we accepted
    console.log('[Call] Sending call:accept to server...')
    await emit('call:accept', {
      callerId: incomingCall.callerId,
      dmId: incomingCall.dmId,
    })
    console.log('[Call] ✓ Server acknowledged acceptance')

    store.acceptCall()

    // Switch to DMs view to show the call UI
    const { useUIStore } = await import('../stores/uiStore')
    const { useDMStore } = await import('../stores/dmStore')
    useUIStore.getState().setActiveView('dms')
    useDMStore.getState().setActiveDM(incomingCall.dmId)

    // Start the voice/video connection
    console.log('[Call] Starting DM voice call...')
    await startDMCall(incomingCall.dmId, incomingCall.callerId, incomingCall.withVideo)
    console.log('[Call] ✓ DM voice call started successfully')
  } catch (err) {
    console.error('[Call] ✗ Failed to accept call:', err)

    // Ensure voice connection is cleaned up on error
    const { cleanup } = await import('./voiceService')
    cleanup()

    // Clear call UI
    store.clearCall()

    // Show error to user
    alert(`Failed to join call: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

// Decline an incoming call
export async function declineIncomingCall(): Promise<void> {
  const store = useCallStore.getState()
  const { incomingCall } = store

  if (!incomingCall) return

  console.log('[Call] Declining call from:', incomingCall.callerName)

  try {
    // Notify caller that we declined
    await emit('call:decline', {
      callerId: incomingCall.callerId,
      dmId: incomingCall.dmId,
    })
  } catch (err) {
    console.error('[Call] Failed to decline call:', err)
  }

  // Ensure voice connection is cleaned up
  const voiceStore = useVoiceStore.getState()
  if (voiceStore.isConnecting || voiceStore.isConnected) {
    console.log('[Call] Cleaning up voice connection after decline')
    const { cleanup } = await import('./voiceService')
    cleanup()
  }

  store.declineCall()
}

// Cancel an outgoing call
export async function cancelOutgoingCall(): Promise<void> {
  const store = useCallStore.getState()
  const { outgoingCall } = store

  if (!outgoingCall) return

  console.log('[Call] Cancelling outgoing call to:', outgoingCall.recipientName)

  try {
    // Notify recipient that we cancelled
    await emit('call:cancel', {
      recipientId: outgoingCall.recipientId,
      dmId: outgoingCall.dmId,
    })
  } catch (err) {
    console.error('[Call] Failed to cancel call:', err)
  }

  // Ensure voice connection is cleaned up
  const voiceStore = useVoiceStore.getState()
  if (voiceStore.isConnecting || voiceStore.isConnected) {
    console.log('[Call] Cleaning up voice connection after cancel')
    const { cleanup } = await import('./voiceService')
    cleanup()
  }

  store.cancelCall()
}

// Handle when our call is accepted by the recipient
export async function handleCallAccepted(dmId: string, recipientId: string): Promise<void> {
  console.log('[Call] ==========================================')
  console.log('[Call] handleCallAccepted - dmId:', dmId, 'recipientId:', recipientId)

  const store = useCallStore.getState()
  const voiceStore = useVoiceStore.getState()
  const { outgoingCall } = store

  if (!outgoingCall) {
    console.log('[Call] handleCallAccepted: no outgoing call')
    return
  }

  if (outgoingCall.dmId !== dmId) {
    console.log('[Call] handleCallAccepted: dmId mismatch', outgoingCall.dmId, '!=', dmId)
    return
  }

  console.log('[Call] ✓ Call accepted! Setting status to connected...')
  console.log('[Call] Voice state - connected:', voiceStore.isConnected, 'connecting:', voiceStore.isConnecting)
  console.log('[Call] ==========================================')

  // Check if we're already in this call or joining it
  if (voiceStore.isConnected && voiceStore.currentChannelId === dmId && voiceStore.currentServerId === 'dm') {
    console.log('[Call] Already connected to this DM call')
    store.setCallStatus('connected')
    return
  }

  if (voiceStore.isConnecting && voiceStore.currentChannelId === dmId) {
    console.log('[Call] Already joining this call, waiting for it to complete')
    return
  }

  store.setCallStatus('connected')

  // Switch to DMs view to show the call UI
  const { useUIStore } = await import('../stores/uiStore')
  const { useDMStore } = await import('../stores/dmStore')
  useUIStore.getState().setActiveView('dms')
  useDMStore.getState().setActiveDM(dmId)

  // Start the voice/video connection
  console.log('[Call] Starting DM voice call (caller side)...')
  try {
    await startDMCall(dmId, recipientId, outgoingCall.withVideo)
    console.log('[Call] ✓ DM voice call started successfully (caller side)')
  } catch (err) {
    console.error('[Call] ✗ Failed to start voice call:', err)

    // Ensure voice connection is cleaned up on error
    const { cleanup } = await import('./voiceService')
    cleanup()

    // Clear call UI
    store.clearCall()

    // Show error to user
    alert(`Failed to join call: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

// Handle when our call is declined by the recipient
export function handleCallDeclined(): void {
  const store = useCallStore.getState()
  store.setCallStatus('declined')

  // Auto-clear after showing "declined" message
  setTimeout(() => {
    store.clearCall()
  }, 2000)
}

// Handle when the caller cancels the call
export async function handleCallCancelled(): Promise<void> {
  console.log('[Call] Call was cancelled by caller')
  const store = useCallStore.getState()

  // Ensure voice connection is cleaned up
  const voiceStore = useVoiceStore.getState()
  if (voiceStore.isConnecting || voiceStore.isConnected) {
    console.log('[Call] Cleaning up voice connection after call cancelled')
    const { cleanup } = await import('./voiceService')
    cleanup()
  }

  store.clearCall()
}

// Handle incoming call from another user
export function handleIncomingCall(
  callerId: string,
  callerName: string,
  callerAvatar: string | null,
  dmId: string,
  withVideo: boolean
): void {
  console.log('[Call] ==========================================')
  console.log('[Call] Incoming call from:', callerName, '(', callerId, ')')
  console.log('[Call] DM ID:', dmId, 'withVideo:', withVideo)

  const callStore = useCallStore.getState()
  const voiceStore = useVoiceStore.getState()

  console.log('[Call] Current call status:', callStore.callStatus)
  console.log('[Call] Voice connected:', voiceStore.isConnected, 'connecting:', voiceStore.isConnecting)
  console.log('[Call] Current voice channel:', voiceStore.currentChannelId, 'server:', voiceStore.currentServerId)

  // Only auto-decline if ALREADY IN AN ACTIVE DM CALL or in the middle of calling someone
  // Don't decline just because we're in a voice channel!
  const inActiveDMCall = voiceStore.currentServerId === 'dm' && (voiceStore.isConnected || voiceStore.isConnecting)
  const callingOrRinging = callStore.callStatus === 'calling' || callStore.callStatus === 'ringing'

  if (inActiveDMCall || callingOrRinging) {
    console.log('[Call] Busy - auto-declining (inActiveDMCall:', inActiveDMCall, 'callingOrRinging:', callingOrRinging, ')')
    // Auto-decline - we're busy
    emit('call:busy', { callerId, dmId }).catch(() => {})
    return
  }

  console.log('[Call] ✓ Accepting incoming call, setting state to ringing')
  console.log('[Call] ==========================================')
  callStore.receiveCall(callerId, callerName, callerAvatar, dmId, withVideo)
}

// Handle voice disconnection during a call
export async function handleVoiceDisconnected(): Promise<void> {
  console.log('[Call] Voice disconnected - cleaning up call state')
  const store = useCallStore.getState()

  // Ensure voice connection is fully cleaned up
  const { cleanup } = await import('./voiceService')
  cleanup()

  // If we were in an active call, clear it
  if (store.callStatus === 'connected' || store.callStatus === 'calling') {
    console.log('[Call] Clearing call UI after voice disconnect')
    store.clearCall()
  }
}
