import React from 'react'
import { useMessageStore } from '@renderer/stores/messageStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useServerStore } from '@renderer/stores/serverStore'

interface TypingIndicatorProps {
  channelId: string | null
}

export default function TypingIndicator({ channelId }: TypingIndicatorProps) {
  const typingUsers = useMessageStore((s) => (channelId ? s.typingUsers[channelId] || [] : []))
  const currentUserId = useAuthStore((s) => s.user?.id)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const members = useServerStore((s) => (activeServerId ? s.members[activeServerId] || [] : []))

  // Filter out current user
  const otherTyping = typingUsers.filter((id) => id !== currentUserId)

  if (otherTyping.length === 0) {
    return <div className="h-6 px-4 flex-shrink-0" />
  }

  const getDisplayName = (userId: string): string => {
    const member = members.find((m) => m.userId === userId)
    return member?.nickname || member?.user?.displayName || 'Someone'
  }

  let text: string
  if (otherTyping.length === 1) {
    text = `${getDisplayName(otherTyping[0])} is typing`
  } else if (otherTyping.length === 2) {
    text = `${getDisplayName(otherTyping[0])} and ${getDisplayName(otherTyping[1])} are typing`
  } else if (otherTyping.length === 3) {
    text = `${getDisplayName(otherTyping[0])}, ${getDisplayName(otherTyping[1])}, and ${getDisplayName(otherTyping[2])} are typing`
  } else {
    text = 'Several people are typing'
  }

  return (
    <div className="h-6 px-4 flex items-center gap-1.5 flex-shrink-0">
      <BouncingDots />
      <span className="text-xs text-blite-text-secondary font-medium">
        {text}
      </span>
    </div>
  )
}

function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-[2px]">
      <span className="w-1.5 h-1.5 rounded-full bg-blite-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-blite-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-blite-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  )
}
