import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuthStore } from '@renderer/stores/authStore'
import { addReaction, removeReaction } from '@renderer/services/socket'
import EmojiPicker from '@renderer/components/common/EmojiPicker'
import type { ReactionGroup } from '@shared/types'

interface ReactionBarProps {
  messageId: string
  channelId: string
  reactions: ReactionGroup[]
}

export default function ReactionBar({ messageId, channelId, reactions }: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false)
  const currentUser = useAuthStore((s) => s.user)

  if (reactions.length === 0 && !showPicker) return null

  const handleReactionClick = (emoji: string, userIds: string[]) => {
    if (!currentUser) return
    if (userIds.includes(currentUser.id)) {
      removeReaction(messageId, channelId, emoji)
    } else {
      addReaction(messageId, channelId, emoji)
    }
  }

  const handleAddEmoji = (emoji: string) => {
    addReaction(messageId, channelId, emoji)
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1 ml-1">
      {reactions.map((r) => {
        const isActive = currentUser && r.userIds.includes(currentUser.id)
        return (
          <button
            key={r.emoji}
            onClick={() => handleReactionClick(r.emoji, r.userIds)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors border ${
              isActive
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                : 'border-blite-glass-border bg-blite-bg-hover text-blite-text-secondary hover:bg-blite-bg-active'
            }`}
          >
            <span className="text-sm">{r.emoji}</span>
            <span className="font-medium">{r.count}</span>
          </button>
        )
      })}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-blite-glass-border text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
        >
          <Plus size={12} />
        </button>
        {showPicker && (
          <div className="absolute bottom-8 left-0 z-50">
            <EmojiPicker
              onSelect={handleAddEmoji}
              onClose={() => setShowPicker(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
