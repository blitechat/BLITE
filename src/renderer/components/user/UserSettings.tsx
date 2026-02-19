import React, { useState, useRef, useEffect } from 'react'
import { User, Mail, Lock, Palette, ShieldCheck, LogOut, Loader2, Sun, Moon, Phone, Camera, Mic, Key, Download, RefreshCw, Copy, Check, AlertTriangle, CheckCircle2 } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import UserAvatar from './UserAvatar'
import { useAuthStore } from '@renderer/stores/authStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { THEMES, type ThemeDefinition } from '@renderer/config/themes'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { userAPI, uploadAPI, keyAPI } from '@renderer/services/api'
import { clearPrivateKey } from '@renderer/services/crypto'
import { disconnectSocket } from '@renderer/services/socket'
import {
  formatRecoveryKey,
  generateOneTimePreKeys,
} from '@renderer/services/e2ee'
import naclUtil from 'tweetnacl-util'

const { encodeBase64 } = naclUtil

type SettingsTab = 'profile' | 'account' | 'appearance' | 'privacy' | 'voice'

export default function UserSettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const closeModal = useUIStore((s) => s.closeModal)

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Profile', icon: <User size={16} /> },
    { id: 'account', label: 'Account', icon: <Mail size={16} /> },
    { id: 'voice', label: 'Voice & Video', icon: <Mic size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
    { id: 'privacy', label: 'Privacy', icon: <ShieldCheck size={16} /> },
  ]

  return (
    <Modal title="User Settings" onClose={closeModal} width="max-w-2xl">
      <div className="flex gap-4 min-h-[400px] -mx-2">
        {/* Sidebar */}
        <div className="w-44 flex-shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-blite-bg-active text-blite-text-primary'
                  : 'text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <div className="border-t border-blite-border my-2" />
          <LogoutButton />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'account' && <AccountTab />}
          {activeTab === 'voice' && <VoiceVideoTab />}
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'privacy' && <PrivacyTab />}
        </div>
      </div>
    </Modal>
  )
}

function LogoutButton() {
  const logout = useAuthStore((s) => s.logout)
  const closeModal = useUIStore((s) => s.closeModal)

  const handleLogout = () => {
    disconnectSocket()
    clearPrivateKey()
    localStorage.removeItem('blite_token')
    logout()
    closeModal()
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-blite-danger hover:bg-blite-danger/10 transition-colors"
    >
      <LogOut size={16} />
      Log Out
    </button>
  )
}

function ProfileTab() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const token = useAuthStore((s) => s.token)
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [customStatus, setCustomStatus] = useState(user?.customStatus || '')
  const [bio, setBio] = useState(user?.bio || '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user || !token) return
    setUploadingAvatar(true)
    try {
      const uploaded = await uploadAPI.upload(file)
      const updated = await userAPI.updateProfile({ avatarUrl: uploaded.url })
      setUser({ ...user, avatarUrl: updated.avatarUrl }, token)
    } catch (err) {
      console.error('Failed to upload avatar:', err)
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user || !token) return
    setUploadingBanner(true)
    try {
      const uploaded = await uploadAPI.upload(file)
      const updated = await userAPI.updateProfile({ bannerUrl: uploaded.url })
      setUser({ ...user, bannerUrl: updated.bannerUrl }, token)
    } catch (err) {
      console.error('Failed to upload banner:', err)
    } finally {
      setUploadingBanner(false)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    if (!user || !token) return
    setSaving(true)
    setSuccess(false)
    try {
      const updated = await userAPI.updateProfile({
        displayName: displayName.trim() || user.displayName,
        customStatus: customStatus.trim() || undefined,
        bio: bio.trim() || undefined,
      })
      setUser({ ...user, displayName: updated.displayName, customStatus: updated.customStatus, bio: updated.bio }, token)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to update profile:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide mb-3">
          Preview
        </h3>
        <div className="glass rounded-lg overflow-hidden">
          {/* Banner */}
          <div
            className="relative h-24 group cursor-pointer"
            onClick={() => bannerInputRef.current?.click()}
            style={{
              background: user.bannerUrl
                ? `url(${user.bannerUrl}) center/cover`
                : 'linear-gradient(135deg, var(--blite-gradient-start), var(--blite-gradient-end))',
            }}
          >
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingBanner ? (
                <Loader2 size={20} className="text-white animate-spin" />
              ) : (
                <Camera size={20} className="text-white" />
              )}
            </div>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              onChange={handleBannerUpload}
              className="hidden"
            />
          </div>
          <div className="flex items-center gap-3 p-3 -mt-6 relative">
            <div className="relative group">
              <UserAvatar
                username={displayName || user.username}
                avatarUrl={user.avatarUrl}
                size="lg"
                showStatus={false}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploadingAvatar ? (
                  <Loader2 size={20} className="text-white animate-spin" />
                ) : (
                  <Camera size={20} className="text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div>
              <p className="font-semibold text-blite-text-primary">{displayName || user.displayName}</p>
              <p className="text-sm text-blite-text-secondary font-mono">@{user.username}</p>
              {customStatus && (
                <p className="text-sm text-blite-text-muted italic mt-0.5">{customStatus}</p>
              )}
            </div>
          </div>
          {bio && (
            <div className="px-3 pb-3">
              <p className="text-sm text-blite-text-secondary">{bio}</p>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="input-field"
          maxLength={32}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
          Custom Status
        </label>
        <input
          type="text"
          value={customStatus}
          onChange={(e) => setCustomStatus(e.target.value)}
          className="input-field"
          placeholder="What are you up to?"
          maxLength={128}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
          About Me
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="input-field resize-none"
          placeholder="Tell others about yourself..."
          maxLength={500}
          rows={3}
        />
        <p className="text-xs text-blite-text-muted mt-1">{bio.length}/500</p>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save Changes
        </button>
        {success && <span className="text-sm text-blite-success">Saved!</span>}
      </div>
    </div>
  )
}

function AccountTab() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const token = useAuthStore((s) => s.token)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNew, setConfirmNew] = useState('')
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneSuccess, setPhoneSuccess] = useState(false)

  if (!user) return null

  const handleSavePhone = async () => {
    if (!user || !token) return
    setSavingPhone(true)
    setPhoneSuccess(false)
    try {
      const updated = await userAPI.updateProfile({ phoneNumber: phoneNumber.trim() || undefined })
      setUser({ ...user, phoneNumber: updated.phoneNumber ?? null }, token)
      setPhoneSuccess(true)
      setTimeout(() => setPhoneSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to update phone number:', err)
    } finally {
      setSavingPhone(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide mb-3">
          Account Info
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 glass rounded-lg">
            <div>
              <p className="text-xs text-blite-text-muted uppercase">Username</p>
              <p className="text-blite-text-primary font-mono">{user.username}</p>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 glass rounded-lg">
            <div>
              <p className="text-xs text-blite-text-muted uppercase">Email</p>
              <p className="text-blite-text-primary">{user.email}</p>
            </div>
          </div>
          <div className="p-3 glass rounded-lg">
            <label className="block text-xs text-blite-text-muted uppercase mb-1.5">Phone Number</label>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="input-field flex-1"
                placeholder="+1 (555) 123-4567"
              />
              <button
                onClick={handleSavePhone}
                disabled={savingPhone}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
              >
                {savingPhone && <Loader2 size={12} className="animate-spin" />}
                Save
              </button>
            </div>
            {phoneSuccess && <span className="text-xs text-blite-success mt-1 block">Saved!</span>}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide mb-3">
          Change Password
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmNew}
              onChange={(e) => setConfirmNew(e.target.value)}
              className="input-field"
            />
          </div>
          <button className="btn-primary" disabled={!currentPassword || !newPassword || newPassword !== confirmNew}>
            Update Password
          </button>
        </div>
      </div>
    </div>
  )
}

function VoiceVideoTab() {
  const audioSettings = useSettingsStore((s) => s.audio)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])

  // Load audio devices
  React.useEffect(() => {
    const loadDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        setAudioDevices(devices.filter(d => d.kind === 'audioinput'))
        setOutputDevices(devices.filter(d => d.kind === 'audiooutput'))
      } catch (err) {
        console.error('Failed to load audio devices:', err)
      }
    }
    loadDevices()
  }, [])

  const updateSetting = (key: string, value: any) => {
    const store = useSettingsStore.getState()
    const updateFn = store[`set${key.charAt(0).toUpperCase() + key.slice(1)}`]
    if (updateFn) {
      updateFn(value)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide mb-4">
          Voice & Video Settings
        </h3>

        {/* Input Device */}
        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium text-blite-text-primary">Input Device</label>
          <select
            value={audioSettings.inputDeviceId || ''}
            onChange={(e) => updateSetting('inputDevice', e.target.value || null)}
            className="w-full input-field"
          >
            <option value="">Default</option>
            {audioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        {/* Output Device */}
        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium text-blite-text-primary">Output Device</label>
          <select
            value={audioSettings.outputDeviceId || ''}
            onChange={(e) => updateSetting('outputDevice', e.target.value || null)}
            className="w-full input-field"
          >
            <option value="">Default</option>
            {outputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>

        {/* Voice Activation */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-blite-text-primary">Voice Activation</label>
            <button
              onClick={() => updateSetting('voiceActivationEnabled', !audioSettings.voiceActivationEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                audioSettings.voiceActivationEnabled ? 'bg-blite-success' : 'bg-blite-bg-hover'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  audioSettings.voiceActivationEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {audioSettings.voiceActivationEnabled && (
            <div>
              <label className="text-xs text-blite-text-secondary mb-2 block">
                Voice Activation Threshold: {audioSettings.voiceActivationThreshold}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={audioSettings.voiceActivationThreshold}
                onChange={(e) => updateSetting('voiceActivationThreshold', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-blite-text-muted mt-1">
                <span>Less Sensitive</span>
                <span>More Sensitive</span>
              </div>
            </div>
          )}
        </div>

        {/* Audio Processing */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-blite-text-primary">Noise Suppression</label>
            <button
              onClick={() => updateSetting('noiseSuppression', !audioSettings.noiseSuppression)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                audioSettings.noiseSuppression ? 'bg-blite-success' : 'bg-blite-bg-hover'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  audioSettings.noiseSuppression ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-blite-text-primary">Echo Cancellation</label>
            <button
              onClick={() => updateSetting('echoCancellation', !audioSettings.echoCancellation)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                audioSettings.echoCancellation ? 'bg-blite-success' : 'bg-blite-bg-hover'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  audioSettings.echoCancellation ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-blite-text-primary">Auto Gain Control</label>
            <button
              onClick={() => updateSetting('autoGainControl', !audioSettings.autoGainControl)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                audioSettings.autoGainControl ? 'bg-blite-success' : 'bg-blite-bg-hover'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  audioSettings.autoGainControl ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Input Volume */}
        <div className="space-y-2 mt-4">
          <label className="text-sm font-medium text-blite-text-primary">
            Input Volume: {audioSettings.inputVolume}%
          </label>
          <input
            type="range"
            min="0"
            max="200"
            value={audioSettings.inputVolume}
            onChange={(e) => updateSetting('inputVolume', parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Output Volume */}
        <div className="space-y-2 mt-4">
          <label className="text-sm font-medium text-blite-text-primary">
            Output Volume: {audioSettings.outputVolume}%
          </label>
          <input
            type="range"
            min="0"
            max="200"
            value={audioSettings.outputVolume}
            onChange={(e) => updateSetting('outputVolume', parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Audio Test */}
        <div className="mt-6 pt-6 border-t border-blite-border">
          <h4 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide mb-4">
            Test Audio & Microphone
          </h4>
          <AudioTestComponent inputDeviceId={audioSettings.inputDeviceId} outputDeviceId={audioSettings.outputDeviceId} />
        </div>
      </div>
    </div>
  )
}

function AudioTestComponent({ inputDeviceId, outputDeviceId }: { inputDeviceId?: string | null, outputDeviceId?: string | null }) {
  const [isTesting, setIsTesting] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [playbackEnabled, setPlaybackEnabled] = useState(true)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const startTest = async () => {
    try {
      // Get microphone stream
      const constraints: MediaStreamConstraints = {
        audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
        video: false,
      }
      const micStream = await navigator.mediaDevices.getUserMedia(constraints)
      micStreamRef.current = micStream
      setStream(micStream)

      // Create audio context and analyser
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      // Create nodes
      const analyser = audioContext.createAnalyser()
      analyserRef.current = analyser
      analyser.fftSize = 256

      const gainNode = audioContext.createGain()
      gainNodeRef.current = gainNode
      gainNode.gain.value = playbackEnabled ? 1.0 : 0.0

      const source = audioContext.createMediaStreamSource(micStream)
      sourceNodeRef.current = source

      // Connect: source -> analyser -> gain -> destination (speakers)
      source.connect(analyser)
      analyser.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Start monitoring audio level
      setIsTesting(true)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const updateLevel = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
        setAudioLevel(Math.min(100, (average / 255) * 200))
        animationFrameRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()
    } catch (err) {
      console.error('Failed to start audio test:', err)
      alert('Failed to access microphone. Please check permissions.')
      stopTest()
    }
  }

  const togglePlayback = () => {
    const newPlaybackEnabled = !playbackEnabled
    setPlaybackEnabled(newPlaybackEnabled)
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newPlaybackEnabled ? 1.0 : 0.0
    }
  }

  const stopTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop())
      micStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setStream(null)
    setIsTesting(false)
    setAudioLevel(0)
  }

  useEffect(() => {
    return () => {
      stopTest()
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={isTesting ? stopTest : startTest}
          className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
            isTesting
              ? 'bg-blite-danger hover:bg-blite-danger/90 text-white'
              : 'btn-primary'
          }`}
        >
          <Mic size={16} className="inline mr-2" />
          {isTesting ? 'Stop Test' : 'Start Mic Test'}
        </button>
        {isTesting && (
          <>
            <button
              onClick={togglePlayback}
              className={`px-4 py-2 rounded-md font-medium text-sm border transition-colors ${
                playbackEnabled
                  ? 'border-blite-success bg-blite-success/10 text-blite-success hover:bg-blite-success/20'
                  : 'border-blite-border bg-blite-bg-hover text-blite-text-secondary hover:bg-blite-bg-active'
              }`}
            >
              {playbackEnabled ? '🔊 Playback On' : '🔇 Playback Off'}
            </button>
            <span className="text-sm text-blite-text-secondary">Speak into your microphone...</span>
          </>
        )}
      </div>

      {/* Audio Level Visualizer */}
      {isTesting && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-blite-text-secondary">Input Level</span>
            <span className="text-blite-text-primary font-mono">{Math.round(audioLevel)}%</span>
          </div>
          <div className="h-8 bg-blite-bg-secondary rounded-lg overflow-hidden relative">
            <div
              className="h-full transition-all duration-75 ease-linear"
              style={{
                width: `${audioLevel}%`,
                background: audioLevel > 80
                  ? 'linear-gradient(to right, var(--blite-success), var(--blite-danger))'
                  : 'linear-gradient(to right, var(--blite-gradient-start), var(--blite-gradient-end))'
              }}
            />
            {/* Level markers */}
            <div className="absolute inset-0 flex items-center px-2">
              <div className="w-full flex justify-between">
                {[20, 40, 60, 80].map(mark => (
                  <div key={mark} className="w-px h-4 bg-blite-border opacity-50" style={{ marginLeft: `${mark}%` }} />
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-blite-text-muted">
            {audioLevel < 10 && '🔇 Too quiet - speak louder or increase input volume'}
            {audioLevel >= 10 && audioLevel < 50 && '🔉 Good level'}
            {audioLevel >= 50 && audioLevel < 80 && '🔊 Perfect level!'}
            {audioLevel >= 80 && '📢 Too loud - may cause distortion'}
          </p>
        </div>
      )}

      {!isTesting && (
        <div className="p-3 rounded-md bg-blite-bg-hover border border-blite-border">
          <p className="text-xs text-blite-text-muted">
            Click "Start Mic Test" to check your microphone. You'll see a visual representation of your audio input level.
          </p>
        </div>
      )}
    </div>
  )
}

function AppearanceTab() {
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide">
        Appearance
      </h3>
      <p className="text-sm text-blite-text-secondary">Choose your preferred theme</p>

      <div className="max-h-[320px] overflow-y-auto pr-1 grid grid-cols-2 gap-2">
        {THEMES.map((t: ThemeDefinition) => {
          const isActive = theme === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`relative p-3 rounded-lg border-2 text-left transition-all ${
                isActive
                  ? 'border-blite-gradient-start glow-accent-sm'
                  : 'border-blite-border hover:border-blite-glass-border'
              }`}
            >
              {isActive && (
                <CheckCircle2
                  size={14}
                  className="absolute top-2 right-2 text-blite-gradient-start"
                />
              )}
              <div className="flex items-center gap-1.5 mb-1.5">
                {t.isDark ? (
                  <Moon size={13} className={isActive ? 'text-blite-gradient-start' : 'text-blite-text-muted'} />
                ) : (
                  <Sun size={13} className={isActive ? 'text-blite-gradient-start' : 'text-blite-text-muted'} />
                )}
                <span className="font-medium text-xs text-blite-text-primary truncate">{t.name}</span>
              </div>
              {/* Mini preview */}
              <div className="rounded overflow-hidden border border-blite-glass-border mb-1.5">
                <div
                  className="h-1.5"
                  style={{ background: `linear-gradient(90deg, ${t.preview.accent}, ${t.preview.accent}88)` }}
                />
                <div className="flex h-8">
                  <div className="w-6" style={{ background: t.preview.sidebar }} />
                  <div className="flex-1" style={{ background: t.preview.main }} />
                </div>
              </div>
              <p className="text-[10px] text-blite-text-muted leading-tight truncate">{t.description}</p>
            </button>
          )
        })}
      </div>

      <div className="p-3 glass rounded-lg">
        <p className="text-xs text-blite-text-muted">
          Currently using <span className="font-semibold text-blite-text-secondary">{THEMES.find((t: ThemeDefinition) => t.id === theme)?.name || theme}</span>.
          Your preference is saved automatically.
        </p>
      </div>
    </div>
  )
}

function PrivacyTab() {
  const user = useAuthStore((s) => s.user)
  const [prekeyCount, setPrekeyCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(true)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [loadingRecovery, setLoadingRecovery] = useState(false)
  const [replenishing, setReplenishing] = useState(false)
  const [copiedPublic, setCopiedPublic] = useState(false)
  const [copiedRecovery, setCopiedRecovery] = useState(false)
  const [showRecoveryWarning, setShowRecoveryWarning] = useState(false)

  // Load prekey count on mount
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const count = await keyAPI.getPrekeyCount()
        setPrekeyCount(count)
      } catch (err) {
        console.error('Failed to fetch prekey count:', err)
        setPrekeyCount(null)
      } finally {
        setLoadingCount(false)
      }
    }
    fetchCount()
  }, [])

  const handleCopyPublicKey = async () => {
    if (!user?.publicKey) return
    try {
      await navigator.clipboard.writeText(user.publicKey)
      setCopiedPublic(true)
      setTimeout(() => setCopiedPublic(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleViewRecoveryKey = async () => {
    if (recoveryKey) {
      setRecoveryKey(null)
      return
    }

    setShowRecoveryWarning(true)
  }

  const handleConfirmViewRecovery = async () => {
    setShowRecoveryWarning(false)
    setLoadingRecovery(true)
    try {
      // Check if a recovery blob exists on the server
      await keyAPI.getRecovery()
      // The recovery key is a user secret that was shown only during signup.
      // We cannot retrieve it from the server - the user must have saved it.
      setRecoveryKey('Recovery key was shown during signup. Please refer to your saved copy.')
    } catch (err) {
      console.error('Failed to fetch recovery key:', err)
      setRecoveryKey('Unable to retrieve recovery key. It was shown once during signup.')
    } finally {
      setLoadingRecovery(false)
    }
  }

  const handleCopyRecoveryKey = async () => {
    if (!recoveryKey) return
    try {
      await navigator.clipboard.writeText(recoveryKey)
      setCopiedRecovery(true)
      setTimeout(() => setCopiedRecovery(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleReplenishPrekeys = async () => {
    setReplenishing(true)
    try {
      // Generate 20 new one-time prekeys
      // Use timestamp-based ID to avoid conflicts
      const startId = Date.now()
      const newOTPs = generateOneTimePreKeys(startId, 20)

      // Upload to server
      const uploadableOTPs = newOTPs.map((otp) => ({
        keyId: otp.id,
        publicKey: encodeBase64(otp.keyPair.publicKey),
      }))

      await keyAPI.uploadPrekeys(uploadableOTPs)

      // Refresh count
      const newCount = await keyAPI.getPrekeyCount()
      setPrekeyCount(newCount)
    } catch (err) {
      console.error('Failed to replenish prekeys:', err)
    } finally {
      setReplenishing(false)
    }
  }

  // Calculate key fingerprint (first 16 chars of public key)
  const keyFingerprint = user?.publicKey?.substring(0, 16) || 'N/A'

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide">
        Privacy & Security
      </h3>

      {/* Encryption Status */}
      <div className="p-6 glass rounded-lg text-center">
        <ShieldCheck size={32} className="mx-auto gradient-accent-text mb-2" />
        <p className="text-blite-text-primary font-medium">End-to-End Encryption Active</p>
        <p className="text-blite-text-secondary text-sm mt-1">
          All messages are encrypted using your personal key pair.
          Your private key never leaves this device.
        </p>
      </div>

      {/* Key Management */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide flex items-center gap-2">
          <Key size={14} />
          Key Management
        </h4>

        {/* Public Key */}
        <div className="p-4 glass rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-blite-text-muted uppercase font-semibold">Your Public Key</p>
            <button
              onClick={handleCopyPublicKey}
              className="text-xs flex items-center gap-1 text-blite-text-secondary hover:text-blite-text-primary transition-colors"
            >
              {copiedPublic ? <Check size={12} className="text-blite-success" /> : <Copy size={12} />}
              {copiedPublic ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-blite-text-secondary font-mono break-all">
            {user?.publicKey || 'Not available'}
          </p>
          <div className="mt-2 pt-2 border-t border-blite-border">
            <p className="text-xs text-blite-text-muted">
              Fingerprint: <span className="font-mono text-blite-text-secondary">{keyFingerprint}</span>
            </p>
          </div>
        </div>

        {/* One-Time Prekeys */}
        <div className="p-4 glass rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-blite-text-muted uppercase font-semibold">One-Time Prekeys</p>
              <p className="text-xs text-blite-text-muted mt-0.5">
                Used for establishing secure sessions
              </p>
            </div>
            <div className="text-right">
              {loadingCount ? (
                <Loader2 size={16} className="animate-spin text-blite-text-muted" />
              ) : (
                <span className={`text-lg font-bold ${
                  (prekeyCount ?? 0) < 5 ? 'text-blite-danger' : 'text-blite-text-primary'
                }`}>
                  {prekeyCount ?? 0}
                </span>
              )}
            </div>
          </div>
          {(prekeyCount ?? 0) < 5 && (
            <div className="mb-3 p-2 rounded-md bg-blite-danger/10 border border-blite-danger/20 flex items-start gap-2">
              <AlertTriangle size={14} className="text-blite-danger mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blite-danger">
                Low prekey count. Replenish to ensure secure session establishment.
              </p>
            </div>
          )}
          <button
            onClick={handleReplenishPrekeys}
            disabled={replenishing}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-2 w-full justify-center"
          >
            {replenishing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw size={12} />
                Replenish Prekeys
              </>
            )}
          </button>
        </div>

        {/* Recovery Key */}
        <div className="p-4 glass rounded-lg">
          <div className="mb-2">
            <p className="text-xs text-blite-text-muted uppercase font-semibold">Recovery Key</p>
            <p className="text-xs text-blite-text-muted mt-0.5">
              Shown once during signup. Store it safely to recover your account.
            </p>
          </div>

          {recoveryKey ? (
            <div className="space-y-2">
              <div className="p-3 rounded-md bg-blite-bg-primary border border-blite-glass-border">
                <p className="text-xs font-mono text-blite-text-primary break-all select-all">
                  {recoveryKey}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyRecoveryKey}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md border border-blite-glass-border text-xs text-blite-text-secondary hover:bg-blite-bg-hover transition-colors"
                >
                  {copiedRecovery ? <Check size={12} className="text-blite-success" /> : <Copy size={12} />}
                  {copiedRecovery ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => setRecoveryKey(null)}
                  className="flex-1 px-3 py-1.5 rounded-md border border-blite-glass-border text-xs text-blite-text-secondary hover:bg-blite-bg-hover transition-colors"
                >
                  Hide
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleViewRecoveryKey}
              disabled={loadingRecovery}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-2 w-full justify-center"
            >
              {loadingRecovery ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Download size={12} />
                  View Recovery Information
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Recovery Warning Modal */}
      {showRecoveryWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 p-6 glass rounded-lg shadow-2xl" style={{ background: 'var(--blite-bg-secondary)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-blite-danger/20">
                <AlertTriangle size={24} className="text-blite-danger" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-blite-text-primary">Important Security Notice</h2>
              </div>
            </div>

            <div className="mb-4 space-y-2 text-sm text-blite-text-secondary">
              <p>
                Your recovery key was shown once during account creation. For security reasons, the actual recovery key cannot be retrieved from the server.
              </p>
              <p>
                If you didn't save your recovery key during signup, you won't be able to recover your account on a new device if you lose access to this one.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowRecoveryWarning(false)}
                className="flex-1 px-4 py-2 rounded-md border border-blite-glass-border text-sm text-blite-text-secondary hover:bg-blite-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmViewRecovery}
                className="flex-1 btn-primary text-sm"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
