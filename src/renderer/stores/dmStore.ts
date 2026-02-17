import { create } from 'zustand'
import type { DMChannel } from '@shared/types'

interface DMState {
  dmChannels: DMChannel[]
  activeDMId: string | null

  setDMChannels: (channels: DMChannel[]) => void
  addDMChannel: (channel: DMChannel) => void
  setActiveDM: (dmId: string | null) => void
  updateLastMessage: (dmId: string, message: any) => void
}

export const useDMStore = create<DMState>((set) => ({
  dmChannels: [],
  activeDMId: null,

  setDMChannels: (channels) => set({ dmChannels: channels }),

  addDMChannel: (channel) => set((state) => {
    // Check if channel already exists - update it instead of duplicating
    const existingIndex = state.dmChannels.findIndex(dm => dm.id === channel.id)
    if (existingIndex !== -1) {
      // Update existing channel (this ensures we get fresh participant data including publicKey)
      const updatedChannels = [...state.dmChannels]
      updatedChannels[existingIndex] = channel
      return { dmChannels: updatedChannels }
    }
    // Add new channel at the beginning
    return { dmChannels: [channel, ...state.dmChannels] }
  }),

  setActiveDM: (dmId) => set({ activeDMId: dmId }),

  updateLastMessage: (dmId, message) => set((state) => ({
    dmChannels: state.dmChannels.map((dm) =>
      dm.id === dmId ? { ...dm, lastMessage: message } : dm
    )
  }))
}))
