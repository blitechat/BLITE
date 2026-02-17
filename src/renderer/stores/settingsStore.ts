import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AudioSettings {
  // Input device
  inputDeviceId: string | null
  outputDeviceId: string | null

  // Voice activation
  voiceActivationEnabled: boolean
  voiceActivationThreshold: number // 0-100, higher = more sensitive

  // Audio processing
  noiseSuppression: boolean
  echoCancellation: boolean
  autoGainControl: boolean

  // Volume
  inputVolume: number // 0-200, 100 = normal
  outputVolume: number // 0-200, 100 = normal
}

export interface NotificationSettings {
  messageSound: boolean
  desktopNotifications: boolean
}

interface SettingsState {
  audio: AudioSettings
  notifications: NotificationSettings

  // Actions
  setInputDevice: (deviceId: string | null) => void
  setOutputDevice: (deviceId: string | null) => void
  setVoiceActivationEnabled: (enabled: boolean) => void
  setVoiceActivationThreshold: (threshold: number) => void
  setNoiseSuppression: (enabled: boolean) => void
  setEchoCancellation: (enabled: boolean) => void
  setAutoGainControl: (enabled: boolean) => void
  setInputVolume: (volume: number) => void
  setOutputVolume: (volume: number) => void
  updateAudioSettings: (settings: Partial<AudioSettings>) => void
  resetAudioSettings: () => void
  setMessageSound: (enabled: boolean) => void
  setDesktopNotifications: (enabled: boolean) => void
}

const defaultAudioSettings: AudioSettings = {
  inputDeviceId: null,
  outputDeviceId: null,
  voiceActivationEnabled: false,
  voiceActivationThreshold: 50,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  inputVolume: 100,
  outputVolume: 100,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      audio: defaultAudioSettings,
      notifications: { messageSound: true, desktopNotifications: true },

      setInputDevice: (deviceId) =>
        set((state) => ({
          audio: { ...state.audio, inputDeviceId: deviceId },
        })),

      setOutputDevice: (deviceId) =>
        set((state) => ({
          audio: { ...state.audio, outputDeviceId: deviceId },
        })),

      setVoiceActivationEnabled: (enabled) =>
        set((state) => ({
          audio: { ...state.audio, voiceActivationEnabled: enabled },
        })),

      setVoiceActivationThreshold: (threshold) =>
        set((state) => ({
          audio: { ...state.audio, voiceActivationThreshold: threshold },
        })),

      setNoiseSuppression: (enabled) =>
        set((state) => ({
          audio: { ...state.audio, noiseSuppression: enabled },
        })),

      setEchoCancellation: (enabled) =>
        set((state) => ({
          audio: { ...state.audio, echoCancellation: enabled },
        })),

      setAutoGainControl: (enabled) =>
        set((state) => ({
          audio: { ...state.audio, autoGainControl: enabled },
        })),

      setInputVolume: (volume) =>
        set((state) => ({
          audio: { ...state.audio, inputVolume: Math.max(0, Math.min(200, volume)) },
        })),

      setOutputVolume: (volume) =>
        set((state) => ({
          audio: { ...state.audio, outputVolume: Math.max(0, Math.min(200, volume)) },
        })),

      updateAudioSettings: (settings) =>
        set((state) => ({
          audio: { ...state.audio, ...settings },
        })),

      resetAudioSettings: () =>
        set({ audio: defaultAudioSettings }),

      setMessageSound: (enabled) =>
        set((state) => ({
          notifications: { ...state.notifications, messageSound: enabled },
        })),

      setDesktopNotifications: (enabled) =>
        set((state) => ({
          notifications: { ...state.notifications, desktopNotifications: enabled },
        })),
    }),
    {
      name: 'blite-settings',
      partialize: (state) => ({ audio: state.audio, notifications: state.notifications }),
    }
  )
)
