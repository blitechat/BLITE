import React, { useState, useRef, FormEvent } from 'react'
import { Plus, ArrowRight, Loader2, Upload, X } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import { useUIStore } from '@renderer/stores/uiStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { serverAPI, channelAPI, uploadAPI } from '@renderer/services/api'

type Tab = 'create' | 'join'

export default function CreateServerModal() {
  const [activeTab, setActiveTab] = useState<Tab>('create')
  const closeModal = useUIStore((s) => s.closeModal)

  return (
    <Modal title={activeTab === 'create' ? 'Create a Room' : 'Join a Room'} onClose={closeModal}>
      {/* Tab switcher */}
      <div className="flex gap-2 mb-5 p-1 bg-blite-bg-hover rounded-md">
        <button
          onClick={() => setActiveTab('create')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === 'create'
              ? 'gradient-accent text-white glow-accent-sm'
              : 'text-blite-text-secondary hover:text-blite-text-primary'
          }`}
        >
          Create a Room
        </button>
        <button
          onClick={() => setActiveTab('join')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === 'join'
              ? 'gradient-accent text-white glow-accent-sm'
              : 'text-blite-text-secondary hover:text-blite-text-primary'
          }`}
        >
          Join a Room
        </button>
      </div>

      {activeTab === 'create' ? <CreateTab /> : <JoinTab />}
    </Modal>
  )
}

function CreateTab() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const closeModal = useUIStore((s) => s.closeModal)
  const addServer = useServerStore((s) => s.addServer)
  const setActiveServer = useServerStore((s) => s.setActiveServer)
  const setChannels = useServerStore((s) => s.setChannels)
  const setActiveChannel = useServerStore((s) => s.setActiveChannel)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIconFile(file)
    const url = URL.createObjectURL(file)
    setIconPreview(url)
  }

  const clearIcon = () => {
    setIconFile(null)
    if (iconPreview) URL.revokeObjectURL(iconPreview)
    setIconPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError('')

    try {
      let iconUrl: string | undefined
      if (iconFile) {
        const uploaded = await uploadAPI.upload(iconFile)
        iconUrl = uploaded.url
      }

      const result = await serverAPI.create(name.trim(), iconUrl)
      addServer(result.server)
      setActiveServer(result.server.id)
      setActiveView('servers')

      // Set the default general channel from the response
      if (result.channel) {
        setChannels(result.server.id, [result.channel])
        setActiveChannel(result.channel.id)
      } else {
        // Fallback: fetch channels from API
        try {
          const channels = await channelAPI.list(result.server.id)
          setChannels(result.server.id, channels)
          const firstText = channels.find((c) => c.type === 'text')
          if (firstText) setActiveChannel(firstText.id)
        } catch {
          // Server might not have channels yet
        }
      }

      closeModal()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to create room.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col items-center py-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-20 h-20 rounded-lg gradient-accent border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity group glow-accent overflow-hidden"
          >
            {iconPreview ? (
              <img src={iconPreview} alt="Icon preview" className="w-full h-full object-cover" />
            ) : (
              <Upload size={24} className="text-white" />
            )}
          </button>
          {iconPreview && (
            <button
              type="button"
              onClick={clearIcon}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blite-danger flex items-center justify-center text-white shadow-lg"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleIconSelect}
          className="hidden"
        />
        <p className="text-xs text-blite-text-muted mt-2">Upload an icon (optional)</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
          Room Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
          placeholder="My Awesome Room"
          maxLength={100}
          autoFocus
        />
      </div>

      <p className="text-xs text-blite-text-muted">
        By creating a room, you agree to BLITE's community guidelines.
      </p>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={closeModal} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Create
              <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>
    </form>
  )
}

function JoinTab() {
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const closeModal = useUIStore((s) => s.closeModal)
  const addServer = useServerStore((s) => s.addServer)
  const setActiveServer = useServerStore((s) => s.setActiveServer)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return

    setLoading(true)
    setError('')

    try {
      let code = inviteCode.trim()
      if (code.includes('/')) {
        const parts = code.split('/')
        code = parts[parts.length - 1]
      }

      const result = await serverAPI.join(code)
      addServer(result.server)
      setActiveServer(result.server.id)
      setActiveView('servers')
      closeModal()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to join room. Check the invite code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
          {error}
        </div>
      )}

      <div className="text-center py-4">
        <div className="w-16 h-16 rounded-lg gradient-accent flex items-center justify-center mx-auto mb-3 glow-accent">
          <ArrowRight size={24} className="text-white" />
        </div>
        <p className="text-sm text-blite-text-secondary">
          Enter an invite code or link to join an existing room.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
          Invite Link or Code
        </label>
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="input-field font-mono"
          placeholder="AbCdEf or https://blite.chat/invite/AbCdEf"
          autoFocus
        />
      </div>

      <div className="glass rounded-md p-3">
        <p className="text-xs font-semibold text-blite-text-secondary uppercase mb-1">Invites should look like</p>
        <p className="text-xs text-blite-text-muted font-mono">AbCdEf</p>
        <p className="text-xs text-blite-text-muted font-mono">https://blite.chat/invite/AbCdEf</p>
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={closeModal} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!inviteCode.trim() || loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Joining...
            </>
          ) : (
            'Join Room'
          )}
        </button>
      </div>
    </form>
  )
}
