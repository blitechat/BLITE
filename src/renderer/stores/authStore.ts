import { create } from 'zustand'
import type { User } from '@shared/types'
import { clearKeyBundle } from '@renderer/services/e2ee/keyManager'
import { clearChannelKeyCache } from '@renderer/hooks/useMessages'
import { clearSentMessages } from '@renderer/services/sentMessageStore'

interface AuthState {
  user: User | null
  token: string | null
  privateKey: Uint8Array | null
  signingKey: Uint8Array | null
  signedPreKeySecret: Uint8Array | null
  keyBundleLoaded: boolean
  isAuthenticated: boolean
  isLoading: boolean

  setUser: (user: User, token: string) => void
  setPrivateKey: (key: Uint8Array) => void
  setSigningKey: (key: Uint8Array) => void
  setSignedPreKeySecret: (key: Uint8Array) => void
  setKeyBundleLoaded: (loaded: boolean) => void
  logout: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  privateKey: null,
  signingKey: null,
  signedPreKeySecret: null,
  keyBundleLoaded: false,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user, token) => set({ user, token, isAuthenticated: true, isLoading: false }),

  setPrivateKey: (key) => set({ privateKey: key }),

  setSigningKey: (key) => set({ signingKey: key }),

  setSignedPreKeySecret: (key) => set({ signedPreKeySecret: key }),

  setKeyBundleLoaded: (loaded) => set({ keyBundleLoaded: loaded }),

  logout: () => {
    // Clear all stored encryption keys and caches
    clearKeyBundle()
    clearChannelKeyCache()
    // Note: We intentionally DO NOT clear the sent message cache (clearSentMessages())
    // This allows users to see their message history after re-login.
    // The cache is stored locally in IndexedDB and provides a better UX.

    // Clear auth state
    set({
      user: null,
      token: null,
      privateKey: null,
      signingKey: null,
      signedPreKeySecret: null,
      keyBundleLoaded: false,
      isAuthenticated: false,
      isLoading: false
    })
  },

  setLoading: (loading) => set({ isLoading: loading })
}))
