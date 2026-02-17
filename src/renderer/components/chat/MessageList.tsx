import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { Loader2, Hash, Lock } from 'lucide-react'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import MessageItem from './MessageItem'
import { useMessages } from '@renderer/hooks/useMessages'
import { useServerStore } from '@renderer/stores/serverStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { joinChannel, leaveChannel } from '@renderer/services/socket'
import type { Message } from '@shared/types'

interface MessageListProps {
  channelId: string | null
  channelName?: string
  isDM?: boolean
}

export default function MessageList({ channelId, channelName, isDM = false }: MessageListProps) {
  const { messages, loading, loadingMore, hasMore, loadMore } = useMessages(channelId, isDM)
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)
  const prevChannelRef = useRef<string | null>(null)

  // Join/leave socket room on channel change
  useEffect(() => {
    if (channelId) {
      joinChannel(channelId)
    }
    return () => {
      if (prevChannelRef.current) {
        leaveChannel(prevChannelRef.current)
      }
      prevChannelRef.current = channelId
    }
  }, [channelId])

  // Auto-scroll to bottom on new messages if user was at bottom
  useEffect(() => {
    if (wasAtBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Scroll to bottom on channel change
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView()
    }
    wasAtBottomRef.current = true
  }, [channelId])

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    // Check if at bottom
    const { scrollTop, scrollHeight, clientHeight } = container
    wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50

    // Load more when scrolled to top
    if (scrollTop < 100 && hasMore && !loadingMore) {
      const previousHeight = scrollHeight
      loadMore().then(() => {
        // Maintain scroll position after prepending messages
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight - previousHeight
          }
        })
      })
    }
  }, [hasMore, loadingMore, loadMore])

  // Group messages by date and proximity - memoized to avoid recalculation on every render
  const groupedMessages = useMemo(() => {
    return groupMessagesByDateAndSender(messages)
  }, [messages])

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-blite-bg-chat">
        <div className="text-center">
          <Hash size={48} className="mx-auto text-blite-text-muted mb-3" />
          <p className="text-blite-text-secondary text-lg">Select a channel to start chatting</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-blite-bg-chat"
      onScroll={handleScroll}
    >
      {/* Loading more indicator */}
      {loadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={20} className="animate-spin text-blite-text-muted" />
        </div>
      )}

      {/* Welcome header */}
      {!hasMore && (
        <div className="px-6 pt-12 pb-6 border-b border-blite-border mb-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-lg gradient-accent mb-4 glow-accent">
            {isDM ? (
              <Lock size={28} className="text-white" />
            ) : (
              <Hash size={28} className="text-white" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-blite-text-primary">
            {isDM ? `Start of your conversation` : `Welcome to #${channelName || 'channel'}`}
          </h2>
          <p className="text-blite-text-secondary mt-1">
            {isDM
              ? 'This is the beginning of your direct message history. Messages are end-to-end encrypted.'
              : `This is the start of the #${channelName || 'channel'} channel.`}
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin gradient-accent-text" />
        </div>
      )}

      {/* Messages */}
      {!loading && groupedMessages.map((group, groupIdx) => (
        <React.Fragment key={groupIdx}>
          {/* Date separator */}
          {group.dateSeparator && (
            <div className="flex items-center px-4 my-4">
              <div className="flex-1 border-t border-blite-border" />
              <span className="px-3 text-xs font-semibold text-blite-text-muted font-mono">
                {group.dateSeparator}
              </span>
              <div className="flex-1 border-t border-blite-border" />
            </div>
          )}

          {/* Messages in group */}
          {group.messages.map((msg, msgIdx) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isFirstInGroup={msgIdx === 0}
              compact={msgIdx > 0}
              isDM={isDM}
            />
          ))}
        </React.Fragment>
      ))}

      {/* Empty state */}
      {!loading && messages.length === 0 && !hasMore && (
        <div className="flex items-center justify-center py-8">
          <p className="text-blite-text-muted text-sm">No messages yet. Start the conversation!</p>
        </div>
      )}

      <div ref={bottomRef} className="h-1" />
    </div>
  )
}

interface MessageGroup {
  dateSeparator?: string
  messages: Message[]
}

function groupMessagesByDateAndSender(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentDate: Date | null = null
  let currentSenderId: string | null = null
  let currentMessages: Message[] = []
  let lastTimestamp = 0

  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt)
    const needsDateSep = !currentDate || !isSameDay(currentDate, msgDate)
    const isSameSender = msg.senderId === currentSenderId && msg.type !== 'system'
    const isCloseInTime = msg.createdAt - lastTimestamp < 5 * 60 * 1000 // 5 minutes

    if (needsDateSep) {
      // Flush current group before date separator
      if (currentMessages.length > 0) {
        groups.push({ messages: [...currentMessages] })
        currentMessages = []
      }

      // Add date separator
      let dateLabel: string
      if (isToday(msgDate)) {
        dateLabel = 'Today'
      } else if (isYesterday(msgDate)) {
        dateLabel = 'Yesterday'
      } else {
        dateLabel = format(msgDate, 'MMMM d, yyyy')
      }
      groups.push({ dateSeparator: dateLabel, messages: [] })

      // Start new group with this message
      currentMessages = [msg]
      currentDate = msgDate
      currentSenderId = msg.senderId
      lastTimestamp = msg.createdAt
      continue
    }

    if (isSameSender && isCloseInTime) {
      // Add to current group (compact)
      currentMessages.push(msg)
    } else {
      // Flush current group and start new one
      if (currentMessages.length > 0) {
        groups.push({ messages: [...currentMessages] })
      }
      currentMessages = [msg]
      currentSenderId = msg.senderId
    }

    lastTimestamp = msg.createdAt
  }

  // Flush remaining messages
  if (currentMessages.length > 0) {
    groups.push({ messages: [...currentMessages] })
  }

  return groups
}
