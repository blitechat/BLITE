import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface VoicePeer {
  userId: string
  displayName: string
  isMuted: boolean
  isDeafened: boolean
  isCameraOn: boolean
  isScreenSharing: boolean
  audioStream: MediaStream | null
  videoStream: MediaStream | null
  screenStream: MediaStream | null
  screenAudioStream: MediaStream | null
  consumerIds: string[]
}

export interface VoicePeerSummary {
  userId: string
  displayName: string
  isMuted: boolean
  isDeafened: boolean
  isCameraOn: boolean
  isScreenSharing: boolean
}

interface VoiceState {
  // Connection
  currentChannelId: string | null
  currentServerId: string | null
  isConnecting: boolean
  isConnected: boolean
  connectionError: string | null

  // Local media
  isMuted: boolean
  isDeafened: boolean
  isCameraOn: boolean
  isScreenSharing: boolean
  localAudioStream: MediaStream | null
  localVideoStream: MediaStream | null
  localScreenStream: MediaStream | null
  audioProducerId: string | null
  videoProducerId: string | null
  screenProducerId: string | null

  // Remote peers
  peers: Record<string, VoicePeer>

  // Channel occupancy (for sidebar display across all voice channels)
  channelOccupants: Record<string, VoicePeerSummary[]>

  // Active speaker
  activeSpeakerId: string | null

  // E2EE
  isVoiceE2EE: boolean

  // Actions
  setConnecting: (channelId: string, serverId: string) => void
  setConnected: () => void
  setDisconnected: () => void
  setConnectionError: (error: string) => void

  setMuted: (muted: boolean) => void
  setDeafened: (deafened: boolean) => void
  setCameraOn: (on: boolean) => void
  setScreenSharing: (sharing: boolean) => void

  setLocalAudioStream: (stream: MediaStream | null) => void
  setLocalVideoStream: (stream: MediaStream | null) => void
  setLocalScreenStream: (stream: MediaStream | null) => void

  setAudioProducerId: (id: string | null) => void
  setVideoProducerId: (id: string | null) => void
  setScreenProducerId: (id: string | null) => void

  addPeer: (userId: string, displayName: string) => void
  removePeer: (userId: string) => void
  updatePeerState: (userId: string, state: Partial<VoicePeer>) => void
  setPeerStream: (userId: string, kind: 'audio' | 'video' | 'screen' | 'screen-audio', stream: MediaStream | null) => void
  addPeerConsumerId: (userId: string, consumerId: string) => void
  removePeerConsumerId: (userId: string, consumerId: string) => void

  setChannelOccupants: (occupancy: Record<string, VoicePeerSummary[]>) => void
  setActiveSpeaker: (userId: string | null) => void
  setVoiceE2EE: (enabled: boolean) => void

  reset: () => void
}

const initialState = {
  currentChannelId: null,
  currentServerId: null,
  isConnecting: false,
  isConnected: false,
  connectionError: null,
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreenSharing: false,
  localAudioStream: null,
  localVideoStream: null,
  localScreenStream: null,
  audioProducerId: null,
  videoProducerId: null,
  screenProducerId: null,
  peers: {},
  channelOccupants: {},
  activeSpeakerId: null,
  isVoiceE2EE: false,
}

export const useVoiceStore = create<VoiceState>()(
  immer((set) => ({
  ...initialState,

  setConnecting: (channelId, serverId) =>
    set({ currentChannelId: channelId, currentServerId: serverId, isConnecting: true, connectionError: null }),

  setConnected: () =>
    set({ isConnecting: false, isConnected: true, connectionError: null }),

  setDisconnected: () =>
    set((state) => ({
      currentChannelId: null,
      currentServerId: null,
      isConnecting: false,
      isConnected: false,
      connectionError: null,
      isMuted: false,
      isDeafened: false,
      isCameraOn: false,
      isScreenSharing: false,
      localAudioStream: null,
      localVideoStream: null,
      localScreenStream: null,
      audioProducerId: null,
      videoProducerId: null,
      screenProducerId: null,
      peers: {},
      // Preserve channelOccupants so sidebar still shows who's in voice channels
      channelOccupants: state.channelOccupants,
      activeSpeakerId: null,
      isVoiceE2EE: false,
    })),

  setConnectionError: (error) =>
    set({ connectionError: error, isConnecting: false, isConnected: false }),

  setMuted: (muted) => set({ isMuted: muted }),
  setDeafened: (deafened) => set({ isDeafened: deafened }),
  setCameraOn: (on) => set({ isCameraOn: on }),
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),

  setLocalAudioStream: (stream) => set({ localAudioStream: stream }),
  setLocalVideoStream: (stream) => set({ localVideoStream: stream }),
  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),

  setAudioProducerId: (id) => set({ audioProducerId: id }),
  setVideoProducerId: (id) => set({ videoProducerId: id }),
  setScreenProducerId: (id) => set({ screenProducerId: id }),

  addPeer: (userId, displayName) =>
    set((state) => {
      // With immer, directly mutate the draft state for efficient updates
      state.peers[userId] = {
        userId,
        displayName,
        isMuted: false,
        isDeafened: false,
        isCameraOn: false,
        isScreenSharing: false,
        audioStream: null,
        videoStream: null,
        screenStream: null,
        screenAudioStream: null,
        consumerIds: [],
      }
    }),

  removePeer: (userId) =>
    set((state) => {
      const peer = state.peers[userId]
      if (peer) {
        // Stop all media stream tracks to prevent ghost audio and memory leaks
        if (peer.audioStream) {
          peer.audioStream.getTracks().forEach((track) => track.stop())
        }
        if (peer.videoStream) {
          peer.videoStream.getTracks().forEach((track) => track.stop())
        }
        if (peer.screenStream) {
          peer.screenStream.getTracks().forEach((track) => track.stop())
        }
      }

      // With immer, directly delete from draft state
      delete state.peers[userId]
    }),

  updatePeerState: (userId, update) =>
    set((state) => {
      const peer = state.peers[userId]
      if (!peer) return
      // With immer, directly assign properties to draft state
      Object.assign(peer, update)
    }),

  setPeerStream: (userId, kind, stream) =>
    set((state) => {
      const peer = state.peers[userId]
      if (!peer) return
      // With immer, directly mutate draft state
      const key =
        kind === 'audio' ? 'audioStream'
        : kind === 'video' ? 'videoStream'
        : kind === 'screen-audio' ? 'screenAudioStream'
        : 'screenStream'
      peer[key] = stream
    }),

  addPeerConsumerId: (userId, consumerId) =>
    set((state) => {
      const peer = state.peers[userId]
      if (!peer) return
      // With immer, directly push to draft array
      peer.consumerIds.push(consumerId)
    }),

  removePeerConsumerId: (userId, consumerId) =>
    set((state) => {
      const peer = state.peers[userId]
      if (!peer) return
      // With immer, directly modify draft array
      const index = peer.consumerIds.indexOf(consumerId)
      if (index > -1) {
        peer.consumerIds.splice(index, 1)
      }
    }),

  setChannelOccupants: (occupancy) =>
    set({ channelOccupants: occupancy }),

  setActiveSpeaker: (userId) =>
    set({ activeSpeakerId: userId }),

  setVoiceE2EE: (enabled) =>
    set({ isVoiceE2EE: enabled }),

  reset: () => set(initialState),
})))
