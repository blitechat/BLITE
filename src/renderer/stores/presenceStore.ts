import { create } from 'zustand'
import type { UserStatus } from '@shared/types'

interface PresenceState {
  presences: Record<string, UserStatus>

  setPresence: (userId: string, status: UserStatus) => void
  setBulkPresence: (presences: Record<string, UserStatus>) => void
  getPresence: (userId: string) => UserStatus
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  presences: {},

  setPresence: (userId, status) => set((state) => ({
    presences: { ...state.presences, [userId]: status }
  })),

  setBulkPresence: (presences) => set((state) => ({
    presences: { ...state.presences, ...presences }
  })),

  getPresence: (userId) => get().presences[userId] || 'offline'
}))
