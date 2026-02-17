import React, { useState, useMemo } from 'react'
import { Search, X, Lock } from 'lucide-react'
import { format } from 'date-fns'
import { useMessages } from '@renderer/hooks/useMessages'
import type { Message } from '@shared/types'

interface SearchPanelProps {
  channelId: string
  isDM?: boolean
  onClose: () => void
}

export default function SearchPanel({ channelId, isDM = false, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const { messages: decryptedMessages } = useMessages(channelId, isDM)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q.length < 2) return []
    return decryptedMessages.filter((msg) => {
      const content = msg.content || ''
      return content.toLowerCase().includes(q)
    })
  }, [query, decryptedMessages])

  const searched = query.trim().length >= 2

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="w-80 h-full border-l border-blite-border flex flex-col" style={{ background: 'var(--blite-bg-secondary)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-blite-border">
        <h3 className="text-sm font-semibold text-blite-text-primary">Search Messages</h3>
        <button onClick={onClose} className="text-blite-text-muted hover:text-blite-text-primary transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Search input */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blite-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search loaded messages..."
            className="input-field text-sm pl-8 py-1.5"
            autoFocus
          />
        </div>
        <div className="flex items-center gap-1 mt-1.5 px-1">
          <Lock size={10} className="text-blite-text-muted" />
          <span className="text-[10px] text-blite-text-muted">Search runs locally on decrypted messages</span>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {searched && results.length === 0 && (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-blite-text-muted">No results in loaded messages</p>
            <p className="text-xs text-blite-text-muted mt-1">Scroll up to load more history, then search again</p>
          </div>
        )}

        {results.map((msg) => (
          <div key={msg.id} className="px-3 py-2 border-b border-blite-border hover:bg-blite-bg-hover transition-colors">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-medium text-blite-text-primary">
                {msg.sender?.displayName || 'Unknown'}
              </span>
              <span className="text-[10px] text-blite-text-muted">
                {format(new Date(msg.createdAt), 'MMM d, yyyy')}
              </span>
            </div>
            <p className="text-xs text-blite-text-secondary line-clamp-2">
              {msg.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
