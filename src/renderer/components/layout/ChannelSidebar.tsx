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
import { toggleMute, toggleDeafen, leaveVoiceChannel } from '@renderer/services/voiceService'
import { channelAPI } from '@renderer/services/api'
import type { Channel } from '@shared/types'

export default function ChannelSidebar() {
  const activeView = useUIStore((s) => s.activeView)

  return (
    <div className="w-56 md:w-64 flex-shrink-0 glass flex flex-col border-r border-blite-glass-border">
      {activeView === 'servers' ? <ServerChannels /> : <DMSidebar />}
      <UserBar />
    </div>
  )
}

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
  const updateChannel = useServerStore((s) => s.updateChannel)
  const setChannels = useServerStore((s) => s.setChannels)
  const openModal = useUIStore((s) => s.openModal)
  const showContextMenu = useUIStore((s) => s.showContextMenu)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeServer = servers.find((s) => s.id === activeServerId)

  // Group channels by category
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

    // Reorder locally
    const reordered = [...allSortable]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)

    // Update positions
    const updatedChannels = channels.map((c) => {
      if (c.type === 'category') return c
      const idx = reordered.findIndex((r) => r.id === c.id)
      return { ...c, position: idx }
    })

    setChannels(activeServerId, updatedChannels)

    // Persist the moved channel's new position
    try {
      await channelAPI.update(moved.id, { position: newIndex } as any)
    } catch (err) {
      console.error('Failed to update channel position:', err)
    }
  }, [channels, activeServerId, setChannels])

  if (!activeServerId || !activeServer) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-blite-text-muted text-sm text-center">
          Select a room to view channels
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
        className="flex items-center justify-between px-4 h-11 border-b border-blite-glass-border hover:bg-blite-bg-hover transition-colors flex-shrink-0"
      >
        <h2 className="font-semibold text-blite-text-primary text-base truncate">
          {activeServer.name}
        </h2>
        <ChevronDown size={16} className="text-blite-text-muted flex-shrink-0" />
      </button>

      {/* Channels list */}
      <div className="flex-1 overflow-y-auto py-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {/* Uncategorized channels */}
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

          {/* Categorized channels */}
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

function DMSidebar() {
  return (
    <>
      {/* Header */}
      <div className="flex items-center px-4 h-11 border-b border-blite-glass-border flex-shrink-0">
        <h2 className="font-semibold text-blite-text-primary text-base">Direct Messages</h2>
      </div>

      {/* Friends buttons */}
      <FriendList />

      {/* DM List */}
      <div className="flex-1 overflow-hidden">
        <DMList />
      </div>
    </>
  )
}

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
      <div className="flex items-center px-3 py-3 glass border-t border-blite-glass-border">
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
