import React from 'react'
import { Hash, Volume2, MicOff, Timer } from 'lucide-react'
import UserAvatar from '@renderer/components/user/UserAvatar'
import { useServerStore } from '@renderer/stores/serverStore'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { joinVoiceChannel } from '@renderer/services/voiceService'
import { readAPI, channelAPI } from '@renderer/services/api'
import type { Channel } from '@shared/types'

interface ChannelItemProps {
  channel: Channel
  isActive: boolean
  hasUnread?: boolean
}

export default function ChannelItem({ channel, isActive, hasUnread: hasUnreadProp }: ChannelItemProps) {
  const setActiveChannel = useServerStore((s) => s.setActiveChannel)
  const markChannelRead = useServerStore((s) => s.markChannelRead)
  const unreadChannels = useServerStore((s) => s.unreadChannels)
  const showContextMenu = useUIStore((s) => s.showContextMenu)
  const channelOccupants = useVoiceStore((s) => s.channelOccupants)
  const currentVoiceChannelId = useVoiceStore((s) => s.currentChannelId)
  const isConnected = useVoiceStore((s) => s.isConnected)
  const activeSpeakerId = useVoiceStore((s) => s.activeSpeakerId)
  const currentUser = useAuthStore((s) => s.user)

  const occupants = channelOccupants[channel.id] || []
  const isInThisVoice = isConnected && currentVoiceChannelId === channel.id

  // Use store-tracked unread if prop not provided
  const hasUnread = hasUnreadProp !== undefined ? hasUnreadProp : unreadChannels.has(channel.id)

  const handleClick = () => {
    if (channel.type === 'category') return

    if (channel.type === 'voice') {
      // Voice channel: just join voice, don't set as active channel (no chat)
      joinVoiceChannel(channel.id, channel.serverId)
    } else {
      setActiveChannel(channel.id)
      markChannelRead(channel.id)
      // Also mark read on server
      readAPI.markRead(channel.id).catch(() => {})
    }
  }

  const updateChannel = useServerStore((s) => s.updateChannel)

  const setExpiry = async (expiry: string) => {
    try {
      const updated = await channelAPI.update(channel.id, { messageExpiry: expiry } as any)
      updateChannel(channel.serverId, channel.id, { messageExpiry: expiry })
    } catch (err) {
      console.error('Failed to set message expiry:', err)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const expiryOptions = ['never', '30s', '5m', '1h', '24h', '7d']
    const currentExpiry = channel.messageExpiry || 'never'
    showContextMenu(e.clientX, e.clientY, [
      {
        label: 'Edit Channel',
        onClick: () => {},
      },
      {
        label: `Disappearing Messages: ${currentExpiry === 'never' ? 'Off' : currentExpiry}`,
        onClick: () => {
          const currentIdx = expiryOptions.indexOf(currentExpiry)
          const nextIdx = (currentIdx + 1) % expiryOptions.length
          setExpiry(expiryOptions[nextIdx])
        },
      },
      {
        label: 'Delete Channel',
        danger: true,
        onClick: () => {},
      },
    ])
  }

  const icon = channel.type === 'voice' ? (
    <Volume2 size={17} className={`flex-shrink-0 ${isInThisVoice ? 'text-blite-success' : ''}`} />
  ) : (
    <Hash size={17} className="flex-shrink-0" />
  )

  return (
    <div>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-2 px-2.5 py-2 mx-1 rounded-lg text-sm transition-all group ${
          isActive
            ? 'bg-blite-bg-active text-blite-text-primary border-l-2'
            : 'text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary border-l-2 border-transparent'
        }`}
        style={isActive ? { borderImage: 'linear-gradient(to bottom, var(--blite-gradient-start), var(--blite-gradient-end)) 1' } : undefined}
      >
        <span className={isActive ? 'text-blite-text-primary' : 'text-blite-text-muted'}>
          {icon}
        </span>
        <span className={`truncate ${hasUnread && !isActive ? 'font-semibold text-blite-text-primary' : ''}`}>
          {channel.name}
        </span>
        {channel.messageExpiry && channel.messageExpiry !== 'never' && (
          <span title={`Messages expire after ${channel.messageExpiry}`}>
            <Timer size={12} className="text-blite-text-muted flex-shrink-0" />
          </span>
        )}
        {hasUnread && !isActive && (
          <span className="ml-auto w-2 h-2 rounded-full gradient-accent flex-shrink-0" />
        )}
      </button>

      {/* Voice channel occupants (TeamSpeak-style) */}
      {channel.type === 'voice' && occupants.length > 0 && (
        <div className="ml-7 mr-2 mb-1">
          {occupants.map((user) => {
            const isSpeaking = activeSpeakerId === user.userId
            return (
              <div key={user.userId} className={`flex items-center gap-2 py-1 px-1.5 rounded-lg transition-all ${isSpeaking ? 'bg-green-500/10' : ''}`}>
                <UserAvatar
                  username={user.displayName}
                  avatarUrl={null}
                  size="xs"
                  showStatus={false}
                  className={isSpeaking ? 'ring-2 ring-green-500 rounded-full' : ''}
                />
                <span className={`text-xs truncate ${isSpeaking ? 'text-green-400 font-medium' : 'text-blite-text-muted'}`}>{user.displayName}</span>
                {user.isMuted && <MicOff size={12} className="text-blite-text-muted flex-shrink-0" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
