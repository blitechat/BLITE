import { create } from 'zustand'
import type { UserProfile } from '@shared/types'

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'declined' | 'missed' | 'ended'

interface CallState {
  // Outgoing call state (when you're calling someone)
  outgoingCall: {
    recipientId: string
    recipientName: string
    dmId: string
    withVideo: boolean
  } | null

  // Incoming call state (when someone is calling you)
  incomingCall: {
    callerId: string
    callerName: string
    callerAvatar: string | null
    dmId: string
    withVideo: boolean
  } | null

  callStatus: CallStatus

  // Actions
  initiateCall: (recipientId: string, recipientName: string, dmId: string, withVideo: boolean) => void
  receiveCall: (callerId: string, callerName: string, callerAvatar: string | null, dmId: string, withVideo: boolean) => void
  setCallStatus: (status: CallStatus) => void
  acceptCall: () => void
  declineCall: () => void
  cancelCall: () => void
  endCall: () => void
  clearCall: () => void
}

export const useCallStore = create<CallState>((set, get) => ({
  outgoingCall: null,
  incomingCall: null,
  callStatus: 'idle',

  initiateCall: (recipientId, recipientName, dmId, withVideo) => {
    console.log('[CallStore] initiateCall:', recipientName)
    set({
      outgoingCall: { recipientId, recipientName, dmId, withVideo },
      incomingCall: null,
      callStatus: 'calling',
    })
  },

  receiveCall: (callerId, callerName, callerAvatar, dmId, withVideo) => {
    console.log('[CallStore] receiveCall from:', callerName)
    set({
      incomingCall: { callerId, callerName, callerAvatar, dmId, withVideo },
      outgoingCall: null,
      callStatus: 'ringing',
    })
  },

  setCallStatus: (status) => set({ callStatus: status }),

  acceptCall: () => set({ callStatus: 'connected' }),

  declineCall: () => set({
    incomingCall: null,
    callStatus: 'idle',
  }),

  cancelCall: () => set({
    outgoingCall: null,
    callStatus: 'idle',
  }),

  endCall: () => set({
    outgoingCall: null,
    incomingCall: null,
    callStatus: 'ended',
  }),

  clearCall: () => set({
    outgoingCall: null,
    incomingCall: null,
    callStatus: 'idle',
  }),
}))
