import React from 'react'
import { Hash, AtSign, Search, Pin, Users, Lock, Bell, Phone, Video } from 'lucide-react'
import IconButton from '@renderer/components/common/IconButton'
import Tooltip from '@renderer/components/common/Tooltip'
import { useServerStore } from '@renderer/stores/serverStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { useFriendStore } from '@renderer/stores/friendStore'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useCallStore } from '@renderer/stores/callStore'
import { initiateCall } from '@renderer/services/callService'

export default function TopBar() {
  const activeView = useUIStore((s) => s.activeView)
  const rightPanel = useUIStore((s) => s.rightPanel)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const openModal = useUIStore((s) => s.openModal)
  const incomingRequests = useFriendStore((s) => s.incomingRequests)
  const isVoiceConnected = useVoiceStore((s) => s.isConnected)
  const callStatus = useCallStore((s) => s.callStatus)

  const notificationCount = incomingRequests.length
  const isInCall = callStatus !== 'idle' || isVoiceConnected

  const activeServerId = useServerStore((s) => s.activeServerId)
  const activeChannelId = useServerStore((s) => s.activeChannelId)
  const channels = useServerStore((s) => (activeServerId ? s.channels[activeServerId] || [] : []))
  const activeDMId = useDMStore((s) => s.activeDMId)
  const dmChannels = useDMStore((s) => s.dmChannels)
  const currentUser = useAuthStore((s) => s.user)

  const activeDM = dmChannels.find((d) => d.id === activeDMId)
  const dmOtherUser = activeDM?.participants?.find((p) => p.id !== currentUser?.id)

  const handleStartCall = (withVideo: boolean) => {
    if (!activeDMId || !dmOtherUser) return
    initiateCall(
      dmOtherUser.id,
      dmOtherUser.displayName || dmOtherUser.username,
      activeDMId,
      withVideo
    )
  }

  let icon: React.ReactNode
  let title = ''
  let description = ''

  if (activeView === 'dms') {
    const dm = dmChannels.find((d) => d.id === activeDMId)
    const otherUser = dm?.participants?.find((p) => p.id !== currentUser?.id)
    icon = <AtSign size={18} className="text-neon-cyan" />
    title = otherUser?.displayName || otherUser?.username || ''
    description = 'End-to-end encrypted'
  } else {
    const channel = channels.find((c) => c.id === activeChannelId)
    icon = <Hash size={18} className="text-neon-cyan" />
    title = channel?.name || ''
    description = ''
  }

  return (
    <div className="h-12 flex items-center px-4 border-b border-blite-glass-border bg-blite-bg-secondary flex-shrink-0 neon-underline" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
      {/* Left section */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {title ? (
          <>
            {icon}
            <h3 className="font-semibold text-blite-text-primary text-base truncate">{title}</h3>
            {description && (
              <>
                <div className="w-px h-4 bg-blite-border mx-1.5 flex-shrink-0" />
                <div className="flex items-center gap-1 text-blite-text-muted min-w-0">
                  <Lock size={12} className="flex-shrink-0" />
                  <p className="text-sm truncate">{description}</p>
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-blite-text-muted">
            {activeView === 'dms' ? 'Select a conversation' : 'Select a channel'}
          </p>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* DM Call Buttons */}
        {activeView === 'dms' && activeDMId && dmOtherUser && (
          <>
            <Tooltip content="Start Voice Call" position="bottom">
              <button
                onClick={() => handleStartCall(false)}
                disabled={isInCall}
                className="p-2 rounded-lg text-blite-text-muted hover:text-blite-success hover:bg-blite-success/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Phone size={18} />
              </button>
            </Tooltip>
            <Tooltip content="Start Video Call" position="bottom">
              <button
                onClick={() => handleStartCall(true)}
                disabled={isInCall}
                className="p-2 rounded-lg text-blite-text-muted hover:text-blite-success hover:bg-blite-success/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Video size={18} />
              </button>
            </Tooltip>
            <div className="w-px h-5 bg-blite-border mx-1" />
          </>
        )}

        {/* Search Messages in Channel */}
        {(activeChannelId || activeDMId) && (
          <Tooltip content="Search Messages" position="bottom">
            <button
              onClick={() => toggleRightPanel('search')}
              className={`p-2 rounded-lg transition-colors ${
                rightPanel === 'search'
                  ? 'text-neon-cyan bg-blite-bg-active'
                  : 'text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover'
              }`}
            >
              <Search size={18} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Pinned Messages" position="bottom">
          <button
            onClick={() => toggleRightPanel('pinned')}
            className={`p-2 rounded-lg transition-colors ${
              rightPanel === 'pinned'
                ? 'text-neon-cyan bg-blite-bg-active'
                : 'text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover'
            }`}
          >
            <Pin size={18} />
          </button>
        </Tooltip>
        {activeView === 'servers' && (
          <Tooltip content="Member List" position="bottom">
            <button
              onClick={() => toggleRightPanel('members')}
              className={`p-2 rounded-lg transition-colors ${
                rightPanel === 'members'
                  ? 'text-neon-cyan bg-blite-bg-active'
                  : 'text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover'
              }`}
            >
              <Users size={18} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Inbox" position="bottom">
          <button
            onClick={() => openModal('inbox')}
            className="relative p-2 rounded-lg text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
          >
            <Bell size={18} />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold rounded-full gradient-accent text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
