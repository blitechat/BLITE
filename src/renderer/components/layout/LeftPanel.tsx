import React, { useState, useCallback } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  Mic,
  MicOff,
  Headphones,
  EarOff,
  Hash,
  PhoneOff,
  Volume2,
  GripVertical,
  MessageSquare,
  Users,
  Server,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import UserAvatar from '@renderer/components/user/UserAvatar'
import ChannelItem from '@renderer/components/channel/ChannelItem'
import DMList from '@renderer/components/dm/DMList'
import FriendList from '@renderer/components/friends/FriendList'
import Tooltip from '@renderer/components/common/Tooltip'
import { useServerStore } from '@renderer/stores/serverStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useFriendStore } from '@renderer/stores/friendStore'
import { toggleMute, toggleDeafen, leaveVoiceChannel } from '@renderer/services/voiceService'
import { channelAPI } from '@renderer/services/api'
import { getAssetUrl } from '@renderer/services/config'
import type { Channel } from '@shared/types'

export default function LeftPanel() {
  const leftPanelTab = useUIStore((s) => s.leftPanelTab)
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab)

  return (
    <div className="w-80 flex-shrink-0 flex flex-col border-r border-blite-glass-border bg-blite-bg-secondary" style={{ boxShadow: '1px 0 6px rgba(0,0,0,0.12)' }}>
      {/* Tab Bar */}
      <div className="flex border-b border-blite-glass-border flex-shrink-0">
        <button
          onClick={() => setLeftPanelTab('rooms')}
          className={`left-panel-tab ${leftPanelTab === 'rooms' ? 'left-panel-tab-active' : ''}`}
        >
          <Server size={15} className="inline mr-1.5 -mt-0.5" />
          Rooms
        </button>
        <button
          onClick={() => setLeftPanelTab('dms')}
          className={`left-panel-tab ${leftPanelTab === 'dms' ? 'left-panel-tab-active' : ''}`}
        >
          <MessageSquare size={15} className="inline mr-1.5 -mt-0.5" />
          DMs
        </button>
        <button
          onClick={() => setLeftPanelTab('friends')}
          className={`left-panel-tab ${leftPanelTab === 'friends' ? 'left-panel-tab-active' : ''}`}
        >
          <Users size={15} className="inline mr-1.5 -mt-0.5" />
          Friends
        </button>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {leftPanelTab === 'rooms' && <RoomsTab />}
        {leftPanelTab === 'dms' && <DMsTab />}
        {leftPanelTab === 'friends' && <FriendsTab />}
      </div>

      {/* User Bar at bottom */}
      <UserBar />
    </div>
  )
}

// ─── Rooms Tab ───────────────────────────────────────────────

function RoomsTab() {
  const servers = useServerStore((s) => s.servers)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const setActiveServer = useServerStore((s) => s.setActiveServer)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const openModal = useUIStore((s) => s.openModal)
  const showContextMenu = useUIStore((s) => s.showContextMenu)

  const handleServerClick = (serverId: string) => {
    setActiveView('servers')
    setActiveServer(serverId)
  }

  const handleServerContextMenu = (e: React.MouseEvent, server: any) => {
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY, [
      {
        label: 'Invite People',
        onClick: () => {
          setActiveServer(server.id)
          openModal('invite')
        },
      },
      {
        label: 'Room Settings',
        onClick: () => {
          setActiveServer(server.id)
          openModal('serverSettings')
        },
      },
      {
        label: 'Leave Room',
        danger: true,
        onClick: () => {
          import('@renderer/services/api').then(({ serverAPI }) => {
            serverAPI.leave(server.id).then(() => {
              useServerStore.getState().removeServer(server.id)
            })
          })
        },
      },
    ])
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Server list */}
      <div className="flex-shrink-0 overflow-y-auto max-h-48 border-b border-blite-glass-border">
        <div className="p-2 space-y-0.5">
          {servers.map((server, index) => {
            const isActive = activeServerId === server.id
            const shortcut = index < 9 ? `Ctrl+${index + 1}` : ''
            return (
              <button
                key={server.id}
                onClick={() => handleServerClick(server.id)}
                onContextMenu={(e) => handleServerContextMenu(e, server)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? 'bg-blite-bg-active neon-border text-blite-text-primary'
                    : 'text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary'
                }`}
              >
                {server.iconUrl ? (
                  <img
                    src={getAssetUrl(server.iconUrl)}
                    alt={server.name}
                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                  />
                ) : (
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    isActive ? 'gradient-accent text-white' : 'bg-blite-bg-tertiary text-blite-text-primary'
                  }`}>
                    {server.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{server.name}</p>
                  {shortcut && (
                    <p className="text-xs text-blite-text-muted">{shortcut}</p>
                  )}
                </div>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan flex-shrink-0" />
                )}
              </button>
            )
          })}

          {/* Add Room button */}
          <button
            onClick={() => openModal('createServer')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-blite-text-muted hover:text-blite-success hover:bg-blite-success/5 transition-all border border-dashed border-blite-border hover:border-blite-success/30"
          >
            <span className="w-9 h-9 rounded-lg flex items-center justify-center border border-dashed border-current">
              <Plus size={18} />
            </span>
            <span className="text-sm">Add a Room</span>
          </button>
        </div>
      </div>

      {/* Channel list for active server */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <ServerChannels />
      </div>
    </div>
  )
}

// ─── DMs Tab ─────────────────────────────────────────────────

function DMsTab() {
  const openModal = useUIStore((s) => s.openModal)
  const dmChannels = useDMStore((s) => s.dmChannels)

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header with add friend button */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-blite-glass-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blite-text-primary">Direct Messages</h3>
        <Tooltip content="Add Friend" position="top">
          <button
            onClick={() => openModal('addFriend')}
            className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-success hover:bg-blite-success/10 transition-colors"
          >
            <Plus size={16} />
          </button>
        </Tooltip>
      </div>

      {/* DM List */}
      <div className="flex-1 overflow-hidden">
        <DMList />
      </div>

      {dmChannels.length === 0 && (
        <div className="px-4 py-6 text-center">
          <MessageSquare size={32} className="mx-auto text-blite-text-muted mb-2 opacity-50" />
          <p className="text-xs text-blite-text-muted mb-2">No conversations yet</p>
          <button
            onClick={() => openModal('addFriend')}
            className="text-xs gradient-accent-text hover:opacity-80"
          >
            Add a friend to start chatting
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Friends Tab ─────────────────────────────────────────────

function FriendsTab() {
  const openModal = useUIStore((s) => s.openModal)
  const friends = useFriendStore((s) => s.friends)
  const incomingRequests = useFriendStore((s) => s.incomingRequests)
  const outgoingRequests = useFriendStore((s) => s.outgoingRequests)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab)

  const handleViewAllFriends = () => {
    setActiveView('dms')
    setLeftPanelTab('friends')
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-blite-glass-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blite-text-primary">Friends</h3>
        <Tooltip content="Add Friend" position="top">
          <button
            onClick={() => openModal('addFriend')}
            className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-success hover:bg-blite-success/10 transition-colors"
          >
            <Plus size={16} />
          </button>
        </Tooltip>
      </div>

      {/* Friend requests section */}
      {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
        <div className="flex-shrink-0 px-3 py-2 border-b border-blite-glass-border bg-blite-bg-tertiary/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-blite-text-secondary uppercase tracking-wide">
              Pending Requests
            </span>
            <span className="text-xs text-blite-text-muted px-2 py-0.5 rounded-full bg-blite-accent/20">
              {incomingRequests.length + outgoingRequests.length}
            </span>
          </div>
          {incomingRequests.length > 0 && (
            <p className="text-xs text-blite-accent">
              {incomingRequests.length} incoming
            </p>
          )}
          {outgoingRequests.length > 0 && (
            <p className="text-xs text-blite-text-muted">
              {outgoingRequests.length} outgoing
            </p>
          )}
        </div>
      )}

      {/* Friends list preview */}
      <div className="flex-1 overflow-y-auto">
        <FriendList />
      </div>

      {/* View all button at bottom */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-blite-glass-border">
        <button
          onClick={handleViewAllFriends}
          className="w-full px-3 py-2 rounded-lg text-sm font-medium text-blite-text-primary bg-blite-bg-hover hover:bg-blite-bg-active transition-colors"
        >
          View All Friends ({friends.length})
        </button>
      </div>

      {friends.length === 0 && incomingRequests.length === 0 && outgoingRequests.length === 0 && (
        <div className="px-4 py-6 text-center">
          <Users size={32} className="mx-auto text-blite-text-muted mb-2 opacity-50" />
          <p className="text-xs text-blite-text-muted mb-2">No friends yet</p>
          <button
            onClick={() => openModal('addFriend')}
            className="text-xs gradient-accent-text hover:opacity-80"
          >
            Send a friend request
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Server Channels (within Rooms tab) ─────────────────────

function SortableChannelItem({ channel, isActive }: { channel: Channel; isActive: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center group/drag">
      <div
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover/drag:opacity-100 cursor-grab p-0.5 text-blite-text-muted"
      >
        <GripVertical size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <ChannelItem channel={channel} isActive={isActive} />
      </div>
    </div>
  )
}

function ServerChannels() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const channels = useServerStore((s) => (activeServerId ? s.channels[activeServerId] || [] : []))
  const activeChannelId = useServerStore((s) => s.activeChannelId)
  const setChannels = useServerStore((s) => s.setChannels)
  const openModal = useUIStore((s) => s.openModal)
  const showContextMenu = useUIStore((s) => s.showContextMenu)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeServer = servers.find((s) => s.id === activeServerId)

  const categories = channels.filter((c) => c.type === 'category')
  const uncategorized = channels.filter(
    (c) => c.type !== 'category' && !c.categoryId
  )
  const categorizedGroups = categories.map((cat) => ({
    category: cat,
    channels: channels.filter((c) => c.categoryId === cat.id && c.type !== 'category'),
  }))

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !activeServerId) return

    const allSortable = channels.filter((c) => c.type !== 'category')
    const oldIndex = allSortable.findIndex((c) => c.id === active.id)
    const newIndex = allSortable.findIndex((c) => c.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = [...allSortable]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    const updatedChannels = channels.map((c) => {
      if (c.type === 'category') return c
      const idx = reordered.findIndex((r) => r.id === c.id)
      return { ...c, position: idx }
    })

    setChannels(activeServerId, updatedChannels)

    try {
      await channelAPI.update(moved.id, { position: newIndex } as any)
    } catch (err) {
      console.error('Failed to update channel position:', err)
    }
  }, [channels, activeServerId, setChannels])

  if (!activeServerId || !activeServer) {
    return (
      <div className="flex items-center justify-center px-4 py-8">
        <p className="text-blite-text-muted text-xs text-center">
          Select a room above to view channels
        </p>
      </div>
    )
  }

  const handleHeaderContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY, [
      {
        label: 'Room Settings',
        onClick: () => openModal('serverSettings'),
      },
      {
        label: 'Create Channel',
        onClick: () => openModal('createChannel'),
      },
      {
        label: 'Invite People',
        onClick: () => openModal('invite'),
      },
    ])
  }

  return (
    <>
      {/* Server name header */}
      <button
        onClick={handleHeaderContextMenu}
        onContextMenu={handleHeaderContextMenu}
        className="flex items-center justify-between px-4 py-3 hover:bg-blite-bg-hover transition-colors flex-shrink-0 neon-underline"
      >
        <h2 className="font-semibold text-blite-text-primary text-base truncate">
          {activeServer.name}
        </h2>
        <ChevronDown size={16} className="text-blite-text-muted flex-shrink-0" />
      </button>

      {/* Channels list */}
      <div className="flex-1 overflow-y-auto py-1.5 px-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {uncategorized.length > 0 && (
            <SortableContext items={uncategorized.sort((a, b) => a.position - b.position).map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="mb-1">
                {uncategorized
                  .sort((a, b) => a.position - b.position)
                  .map((channel) => (
                    <SortableChannelItem
                      key={channel.id}
                      channel={channel}
                      isActive={activeChannelId === channel.id}
                    />
                  ))}
              </div>
            </SortableContext>
          )}

          {categorizedGroups.map(({ category, channels: catChannels }) => (
            <CategoryGroup
              key={category.id}
              category={category}
              channels={catChannels}
              activeChannelId={activeChannelId}
            />
          ))}
        </DndContext>

        {channels.length === 0 && (
          <div className="px-4 py-4 text-center">
            <Hash size={24} className="mx-auto text-blite-text-muted mb-2" />
            <p className="text-xs text-blite-text-muted">No channels yet.</p>
            <button
              onClick={() => openModal('createChannel')}
              className="text-xs gradient-accent-text hover:opacity-80 mt-1"
            >
              Create one
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function CategoryGroup({
  category,
  channels,
  activeChannelId,
}: {
  category: Channel
  channels: Channel[]
  activeChannelId: string | null
}) {
  const [collapsed, setCollapsed] = useState(false)
  const openModal = useUIStore((s) => s.openModal)

  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-1 py-1 group">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-xs font-semibold text-blite-text-muted uppercase tracking-wide hover:text-blite-text-secondary transition-colors"
        >
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
          <span>{category.name}</span>
        </button>
        <Tooltip content="Create Channel" position="top">
          <button
            onClick={() => openModal('createChannel')}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-blite-text-muted hover:text-blite-text-primary transition-all"
          >
            <Plus size={14} />
          </button>
        </Tooltip>
      </div>

      {!collapsed && (
        <div>
          {channels
            .sort((a, b) => a.position - b.position)
            .map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isActive={activeChannelId === channel.id}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// ─── Voice Connected Bar ────────────────────────────────────

function VoiceConnectedBar() {
  const isConnected = useVoiceStore((s) => s.isConnected)
  const currentChannelId = useVoiceStore((s) => s.currentChannelId)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const channels = useServerStore((s) => (activeServerId ? s.channels[activeServerId] || [] : []))

  if (!isConnected) return null

  const voiceChannel = channels.find((c) => c.id === currentChannelId)

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-t border-blite-glass-border bg-blite-success/5">
      <div className="flex items-center gap-2 min-w-0">
        <Volume2 size={14} className="text-blite-success flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-blite-success leading-tight">Voice Connected</p>
          {voiceChannel && (
            <p className="text-xxs text-blite-text-muted truncate leading-tight">{voiceChannel.name}</p>
          )}
        </div>
      </div>
      <Tooltip content="Disconnect" position="top">
        <button
          onClick={() => leaveVoiceChannel()}
          className="p-1 rounded-md text-blite-text-muted hover:text-blite-danger hover:bg-blite-danger/10 transition-colors"
        >
          <PhoneOff size={14} />
        </button>
      </Tooltip>
    </div>
  )
}

// ─── User Bar ───────────────────────────────────────────────

function UserBar() {
  const user = useAuthStore((s) => s.user)
  const presences = usePresenceStore((s) => s.presences)
  const openModal = useUIStore((s) => s.openModal)
  const isVoiceConnected = useVoiceStore((s) => s.isConnected)
  const isMuted = useVoiceStore((s) => s.isMuted)
  const isDeafened = useVoiceStore((s) => s.isDeafened)

  if (!user) return null

  const status = presences[user.id] || 'online'

  return (
    <div className="flex-shrink-0">
      <VoiceConnectedBar />
      <div className="flex items-center px-3 py-3 border-t border-blite-glass-border bg-blite-bg-secondary" style={{ boxShadow: '0 -1px 4px rgba(0,0,0,0.1)' }}>
        <UserAvatar
          username={user.displayName}
          avatarUrl={user.avatarUrl}
          status={status}
          size="sm"
          showStatus={true}
        />
        <div className="flex-1 min-w-0 ml-2.5">
          <p className="text-sm font-medium text-blite-text-primary truncate leading-tight">
            {user.displayName}
          </p>
          <p className="text-xs text-blite-text-muted truncate leading-tight mt-0.5">
            {user.customStatus || `@${user.username}`}
          </p>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Tooltip content={isMuted ? 'Unmute' : 'Mute'} position="top">
            <button
              onClick={() => { if (isVoiceConnected) toggleMute() }}
              className={`p-2 rounded-lg transition-colors ${
                !isVoiceConnected
                  ? 'text-blite-text-muted/40 cursor-not-allowed'
                  : isMuted
                    ? 'text-blite-danger hover:bg-blite-danger/10'
                    : 'text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover'
              }`}
              disabled={!isVoiceConnected}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </Tooltip>
          <Tooltip content={isDeafened ? 'Undeafen' : 'Deafen'} position="top">
            <button
              onClick={() => { if (isVoiceConnected) toggleDeafen() }}
              className={`p-2 rounded-lg transition-colors ${
                !isVoiceConnected
                  ? 'text-blite-text-muted/40 cursor-not-allowed'
                  : isDeafened
                    ? 'text-blite-danger hover:bg-blite-danger/10'
                    : 'text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover'
              }`}
              disabled={!isVoiceConnected}
            >
              {isDeafened ? <EarOff size={16} /> : <Headphones size={16} />}
            </button>
          </Tooltip>
          <Tooltip content="User Settings" position="top">
            <button
              onClick={() => openModal('userSettings')}
              className="p-2 rounded-lg text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
            >
              <Settings size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
