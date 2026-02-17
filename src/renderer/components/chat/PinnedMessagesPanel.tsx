import React, { useState, useEffect } from 'react'
import { Pin, X, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { pinAPI } from '@renderer/services/api'
import type { Pin as PinType } from '@shared/types'

interface PinnedMessagesPanelProps {
  channelId: string
  onClose: () => void
}

export default function PinnedMessagesPanel({ channelId, onClose }: PinnedMessagesPanelProps) {
  const [pins, setPins] = useState<PinType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!channelId) return

    setLoading(true)
    pinAPI.list(channelId).then((data) => {
      setPins(data)
    }).catch((err) => {
      console.error('Failed to load pins:', err)
    }).finally(() => {
      setLoading(false)
    })
  }, [channelId])

  const handleUnpin = async (messageId: string) => {
    try {
      await pinAPI.unpin(channelId, messageId)
      setPins((prev) => prev.filter((p) => p.messageId !== messageId))
    } catch (err) {
      console.error('Failed to unpin:', err)
    }
  }

  return (
    <div className="w-80 h-full border-l border-blite-border flex flex-col" style={{ background: 'var(--blite-bg-secondary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-blite-border">
        <div className="flex items-center gap-2">
          <Pin size={16} className="text-blite-text-muted" />
          <h3 className="text-sm font-semibold text-blite-text-primary">Pinned Messages</h3>
        </div>
        <button onClick={onClose} className="text-blite-text-muted hover:text-blite-text-primary transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-blite-text-muted" />
          </div>
        )}

        {!loading && pins.length === 0 && (
          <div className="text-center py-8 px-4">
            <Pin size={32} className="mx-auto text-blite-text-muted mb-2" />
            <p className="text-sm text-blite-text-muted">No pinned messages yet</p>
          </div>
        )}

        {!loading && pins.map((pin) => (
          <div key={pin.id} className="px-3 py-3 border-b border-blite-border group hover:bg-blite-bg-hover transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-blite-text-primary">
                {pin.message?.sender?.displayName || 'Unknown'}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-blite-text-muted">
                  {format(new Date(pin.message?.createdAt || pin.createdAt), 'MMM d, yyyy')}
                </span>
                <button
                  onClick={() => handleUnpin(pin.messageId)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-blite-text-muted hover:text-blite-danger transition-all"
                  title="Unpin"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
            <p className="text-xs text-blite-text-secondary line-clamp-3">
              {pin.message?.encryptedContent || '[Message deleted]'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
