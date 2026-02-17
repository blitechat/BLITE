import React, { useMemo } from 'react'
import UserAvatar from '@renderer/components/user/UserAvatar'
import type { ServerMember } from '@shared/types'

interface MentionAutocompleteProps {
  query: string
  members: ServerMember[]
  onSelect: (username: string) => void
}

export default function MentionAutocomplete({ query, members, onSelect }: MentionAutocompleteProps) {
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return members
      .filter((m) => {
        const username = m.user?.username?.toLowerCase() || ''
        const displayName = m.user?.displayName?.toLowerCase() || ''
        return username.includes(q) || displayName.includes(q)
      })
      .slice(0, 8)
  }, [query, members])

  if (filtered.length === 0) return null

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-1 glass rounded-lg shadow-xl overflow-hidden z-50"
      style={{ background: 'var(--blite-bg-secondary)' }}
    >
      <div className="px-3 py-1.5 border-b border-blite-border">
        <span className="text-xs font-semibold text-blite-text-muted uppercase">Members matching @{query}</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.map((member) => (
          <button
            key={member.userId}
            onClick={() => onSelect(member.user?.username || '')}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-blite-bg-hover transition-colors text-left"
          >
            <UserAvatar
              username={member.user?.displayName || member.user?.username || ''}
              avatarUrl={member.user?.avatarUrl || null}
              size="xs"
              showStatus={false}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-blite-text-primary truncate block">
                {member.user?.displayName}
              </span>
              <span className="text-xs text-blite-text-muted truncate block">
                @{member.user?.username}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
