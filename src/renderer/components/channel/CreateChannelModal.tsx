import React, { useState, FormEvent } from 'react'
import { Hash, Volume2, Loader2 } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import { useUIStore } from '@renderer/stores/uiStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { channelAPI } from '@renderer/services/api'
import type { ChannelType } from '@shared/types'

export default function CreateChannelModal() {
  const [name, setName] = useState('')
  const [type, setType] = useState<ChannelType>('text')
  const [categoryId, setCategoryId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const closeModal = useUIStore((s) => s.closeModal)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const channels = useServerStore((s) => (activeServerId ? s.channels[activeServerId] || [] : []))
  const addChannel = useServerStore((s) => s.addChannel)

  const categories = channels.filter((c) => c.type === 'category')

  const handleNameChange = (value: string) => {
    const formatted = value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '')
    setName(formatted)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !activeServerId) return

    setLoading(true)
    setError('')

    try {
      const channel = await channelAPI.create(
        activeServerId,
        name.trim(),
        type,
        categoryId || undefined
      )
      addChannel(activeServerId, channel)
      closeModal()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create channel.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Create Channel" onClose={closeModal}>
      {error && (
        <div className="mb-4 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Channel Type */}
        <div>
          <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-2">
            Channel Type
          </label>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setType('text')}
              className={`w-full flex items-center gap-3 p-3 rounded-md border transition-all ${
                type === 'text'
                  ? 'border-blite-gradient-start bg-blite-bg-active glow-accent-sm'
                  : 'border-blite-border bg-blite-bg-hover hover:bg-blite-bg-active'
              }`}
            >
              <Hash size={20} className={type === 'text' ? 'text-blite-gradient-start' : 'text-blite-text-muted'} />
              <div className="text-left">
                <p className="text-sm font-medium text-blite-text-primary">Text</p>
                <p className="text-xs text-blite-text-muted">Send messages, images, and files</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setType('voice')}
              className={`w-full flex items-center gap-3 p-3 rounded-md border transition-all ${
                type === 'voice'
                  ? 'border-blite-gradient-start bg-blite-bg-active glow-accent-sm'
                  : 'border-blite-border bg-blite-bg-hover hover:bg-blite-bg-active'
              }`}
            >
              <Volume2 size={20} className={type === 'voice' ? 'text-blite-gradient-start' : 'text-blite-text-muted'} />
              <div className="text-left">
                <p className="text-sm font-medium text-blite-text-primary">Voice</p>
                <p className="text-xs text-blite-text-muted">Voice chat with friends</p>
              </div>
            </button>
          </div>
        </div>

        {/* Channel Name */}
        <div>
          <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
            Channel Name
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blite-text-muted">
              {type === 'voice' ? <Volume2 size={16} /> : <Hash size={16} />}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="input-field pl-9"
              placeholder="new-channel"
              maxLength={100}
              autoFocus
            />
          </div>
        </div>

        {/* Category */}
        {categories.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input-field"
            >
              <option value="">No Category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={closeModal} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create Channel
          </button>
        </div>
      </form>
    </Modal>
  )
}
