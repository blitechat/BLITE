import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Hash, MessageSquare, Users, X } from 'lucide-react'
import { useServerStore } from '@renderer/stores/serverStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { getAssetUrl } from '@renderer/services/config'
import UserAvatar from '@renderer/components/user/UserAvatar'

interface QuickSwitcherProps {
  onClose: () => void
}

type SearchResult = {
  type: 'server' | 'channel' | 'dm'
  id: string
  name: string
  serverId?: string
  serverName?: string
  avatarUrl?: string | null
  status?: string | null
}

export default function QuickSwitcher({ onClose }: QuickSwitcherProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const servers = useServerStore((s) => s.servers)
  const channels = useServerStore((s) => s.channels)
  const setActiveServer = useServerStore((s) => s.setActiveServer)
  const setActiveChannel = useServerStore((s) => s.setActiveChannel)
  const dmChannels = useDMStore((s) => s.dmChannels)
  const setActiveDM = useDMStore((s) => s.setActiveDM)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const setShowFriendsPanel = useUIStore((s) => s.setShowFriendsPanel)
  const currentUser = useAuthStore((s) => s.user)
  const presences = usePresenceStore((s) => s.presences)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Build search results
  const results = useMemo<SearchResult[]>(() => {
    const items: SearchResult[] = []
    const lowerQuery = query.toLowerCase().trim()

    // Add servers (rooms)
    servers.forEach((server) => {
      if (!lowerQuery || server.name.toLowerCase().includes(lowerQuery)) {
        items.push({
          type: 'server',
          id: server.id,
          name: server.name,
          avatarUrl: server.iconUrl,
        })
      }

      // Add channels from this server
      const serverChannels = channels[server.id] || []
      serverChannels
        .filter((ch) => ch.type === 'text' || ch.type === 'voice')
        .forEach((ch) => {
          if (!lowerQuery || ch.name.toLowerCase().includes(lowerQuery) || server.name.toLowerCase().includes(lowerQuery)) {
            items.push({
              type: 'channel',
              id: ch.id,
              name: ch.name,
              serverId: server.id,
              serverName: server.name,
            })
          }
        })
    })

    // Add DMs
    dmChannels.forEach((dm) => {
      const otherUser = dm.participants?.find((p) => p.id !== currentUser?.id)
      const displayName = otherUser?.displayName || otherUser?.username || 'Unknown'
      if (!lowerQuery || displayName.toLowerCase().includes(lowerQuery)) {
        items.push({
          type: 'dm',
          id: dm.id,
          name: displayName,
          avatarUrl: otherUser?.avatarUrl,
          status: otherUser ? presences[otherUser.id] || 'offline' : 'offline',
        })
      }
    })

    return items.slice(0, 15) // Limit results
  }, [query, servers, channels, dmChannels, currentUser, presences])

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current
    if (!container) return
    const selectedEl = container.children[selectedIndex] as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleSelect = (result: SearchResult) => {
    switch (result.type) {
      case 'server':
        setActiveView('servers')
        setActiveServer(result.id)
        break
      case 'channel':
        setActiveView('servers')
        setActiveServer(result.serverId!)
        setActiveChannel(result.id)
        break
      case 'dm':
        setActiveView('dms')
        setActiveDM(result.id)
        setActiveChannel(null)
        setShowFriendsPanel(false)
        break
    }
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 glass rounded-xl shadow-2xl border border-blite-glass-border overflow-hidden">
        {/* Search input */}
        <div className="flex items-center px-4 py-3 border-b border-blite-glass-border">
          <Search size={18} className="text-blite-text-muted mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search rooms, channels, and DMs..."
            className="flex-1 bg-transparent text-blite-text-primary placeholder:text-blite-text-muted outline-none text-sm"
          />
          <div className="flex items-center gap-2 ml-2">
            <kbd className="px-1.5 py-0.5 text-xs font-mono bg-blite-bg-tertiary text-blite-text-muted rounded">
              esc
            </kbd>
            <button
              onClick={onClose}
              className="p-1 text-blite-text-muted hover:text-blite-text-primary transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-blite-text-muted">
                {query ? 'No results found' : 'Start typing to search...'}
              </p>
            </div>
          ) : (
            results.map((result, idx) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  idx === selectedIndex
                    ? 'bg-blite-bg-active'
                    : 'hover:bg-blite-bg-hover'
                }`}
              >
                {result.type === 'server' && (
                  <>
                    {result.avatarUrl ? (
                      <img
                        src={getAssetUrl(result.avatarUrl)}
                        alt={result.name}
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-blite-bg-tertiary flex items-center justify-center">
                        <Users size={16} className="text-blite-text-muted" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blite-text-primary truncate">{result.name}</p>
                      <p className="text-xs text-blite-text-muted">Room</p>
                    </div>
                  </>
                )}

                {result.type === 'channel' && (
                  <>
                    <div className="w-8 h-8 rounded-lg bg-blite-bg-tertiary flex items-center justify-center">
                      <Hash size={16} className="text-blite-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blite-text-primary truncate">{result.name}</p>
                      <p className="text-xs text-blite-text-muted truncate">{result.serverName}</p>
                    </div>
                  </>
                )}

                {result.type === 'dm' && (
                  <>
                    <UserAvatar
                      username={result.name}
                      avatarUrl={result.avatarUrl}
                      status={result.status as any}
                      size="sm"
                      showStatus
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blite-text-primary truncate">{result.name}</p>
                      <p className="text-xs text-blite-text-muted">Direct Message</p>
                    </div>
                  </>
                )}

                {idx === selectedIndex && (
                  <kbd className="px-1.5 py-0.5 text-xs font-mono bg-blite-bg-tertiary text-blite-text-muted rounded flex-shrink-0">
                    enter
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-blite-glass-border flex items-center justify-between text-xs text-blite-text-muted">
          <span>Quick Switch</span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-blite-bg-tertiary rounded">↑</kbd>
              <kbd className="px-1 py-0.5 bg-blite-bg-tertiary rounded">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-blite-bg-tertiary rounded">enter</kbd>
              select
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
