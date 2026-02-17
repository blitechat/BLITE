import React, { useState, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import UserAvatar from '@renderer/components/user/UserAvatar'
import { useDMStore } from '@renderer/stores/dmStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useUIStore } from '@renderer/stores/uiStore'
import type { DMChannel } from '@shared/types'

export default function DMList() {
  const [search, setSearch] = useState('')
  const dmChannels = useDMStore((s) => s.dmChannels)
  const activeDMId = useDMStore((s) => s.activeDMId)
  const setActiveDM = useDMStore((s) => s.setActiveDM)
  const currentUser = useAuthStore((s) => s.user)
  const presences = usePresenceStore((s) => s.presences)
  const setActiveChannel = useServerStore((s) => s.setActiveChannel)
  const setShowFriendsPanel = useUIStore((s) => s.setShowFriendsPanel)

  const filteredDMs = useMemo(() => {
    if (!search.trim()) return dmChannels

    const query = search.toLowerCase()
    return dmChannels.filter((dm) => {
      const otherUser = dm.participants?.find((p) => p.id !== currentUser?.id)
      const name = otherUser?.displayName || otherUser?.username || ''
      return name.toLowerCase().includes(query)
    })
  }, [dmChannels, search, currentUser])

  const handleSelectDM = (dmId: string) => {
    setActiveDM(dmId)
    setActiveChannel(null)
    setShowFriendsPanel(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 pt-3 pb-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blite-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a conversation"
            className="input-field pl-8 pr-8 py-1.5 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-blite-text-muted hover:text-blite-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* DM Header */}
      <div className="px-3 py-1.5">
        <p className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide">
          Direct Messages
        </p>
      </div>

      {/* DM list */}
      <div className="flex-1 overflow-y-auto px-1.5 space-y-0.5">
        {filteredDMs.map((dm) => (
          <DMItem
            key={dm.id}
            dm={dm}
            isActive={activeDMId === dm.id}
            currentUserId={currentUser?.id || ''}
            onClick={() => handleSelectDM(dm.id)}
          />
        ))}
        {filteredDMs.length === 0 && (
          <p className="text-xs text-blite-text-muted text-center py-4">
            {search ? 'No conversations found.' : 'No direct messages yet.'}
          </p>
        )}
      </div>
    </div>
  )
}

interface DMItemProps {
  dm: DMChannel
  isActive: boolean
  currentUserId: string
  onClick: () => void
}

function DMItem({ dm, isActive, currentUserId, onClick }: DMItemProps) {
  const presences = usePresenceStore((s) => s.presences)
  const otherUser = dm.participants?.find((p) => p.id !== currentUserId)
  const displayName = otherUser?.displayName || otherUser?.username || 'Unknown'
  const status = otherUser ? presences[otherUser.id] || 'offline' : 'offline'

  // Get last message preview
  let lastMsgPreview = ''
  if (dm.lastMessage) {
    lastMsgPreview = dm.lastMessage.content || 'Encrypted message'
    if (lastMsgPreview.length > 40) {
      lastMsgPreview = lastMsgPreview.substring(0, 40) + '...'
    }
  }

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors ${
        isActive
          ? 'bg-blite-bg-active text-blite-text-primary'
          : 'text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary'
      }`}
    >
      <UserAvatar
        username={displayName}
        avatarUrl={otherUser?.avatarUrl}
        status={status}
        size="sm"
        showStatus={true}
      />
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[13px] font-medium truncate">{displayName}</p>
        {lastMsgPreview && (
          <p className="text-xs text-blite-text-muted truncate">{lastMsgPreview}</p>
        )}
      </div>
    </button>
  )
}
