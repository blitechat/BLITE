import React, { useState } from 'react'
import { Users, UserCheck, Clock, MessageSquare, UserMinus, Check, X, Loader2, Phone } from 'lucide-react'
import UserAvatar from '@renderer/components/user/UserAvatar'
import UserPopover from '@renderer/components/user/UserPopover'
import { useFriendStore } from '@renderer/stores/friendStore'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { friendAPI, dmAPI } from '@renderer/services/api'
import { joinChannel } from '@renderer/services/socket'
import { initiateCall } from '@renderer/services/callService'
import type { Friendship, FriendRequest } from '@shared/types'

type Tab = 'all' | 'online' | 'pending'

export default function FriendsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('all')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All', icon: <Users size={14} /> },
    { id: 'online', label: 'Online', icon: <UserCheck size={14} /> },
    { id: 'pending', label: 'Pending', icon: <Clock size={14} /> },
  ]

  const incomingRequests = useFriendStore((s) => s.incomingRequests)
  const pendingCount = incomingRequests.length

  return (
    <div className="flex-1 flex flex-col bg-blite-bg-chat">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-3 border-b border-blite-border">
        <Users size={20} className="text-blite-text-muted mr-2" />
        <h2 className="text-sm font-semibold text-blite-text-primary mr-4">Friends</h2>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-blite-bg-active text-blite-text-primary'
                : 'text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'pending' && pendingCount > 0 && (
              <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full gradient-accent text-white text-[10px] font-bold px-1">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'all' && <AllFriends />}
        {activeTab === 'online' && <OnlineFriends />}
        {activeTab === 'pending' && <PendingRequests />}
      </div>
    </div>
  )
}

function AllFriends() {
  const friends = useFriendStore((s) => s.friends)

  if (friends.length === 0) {
    return <EmptyState message="No friends yet. Send a friend request to get started!" />
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide mb-2">
        All Friends — {friends.length}
      </p>
      {friends.map((f) => (
        <FriendRow key={f.friendId} friendship={f} />
      ))}
    </div>
  )
}

function OnlineFriends() {
  const friends = useFriendStore((s) => s.friends)
  const presences = usePresenceStore((s) => s.presences)

  const onlineFriends = friends.filter((f) => {
    const status = presences[f.friendId] || f.friend?.status || 'offline'
    return status !== 'offline'
  })

  if (onlineFriends.length === 0) {
    return <EmptyState message="No friends are online right now." />
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide mb-2">
        Online — {onlineFriends.length}
      </p>
      {onlineFriends.map((f) => (
        <FriendRow key={f.friendId} friendship={f} />
      ))}
    </div>
  )
}

function PendingRequests() {
  const incomingRequests = useFriendStore((s) => s.incomingRequests)
  const outgoingRequests = useFriendStore((s) => s.outgoingRequests)

  if (incomingRequests.length === 0 && outgoingRequests.length === 0) {
    return <EmptyState message="No pending friend requests." />
  }

  return (
    <div className="space-y-4">
      {incomingRequests.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide mb-2">
            Incoming — {incomingRequests.length}
          </p>
          <div className="space-y-1">
            {incomingRequests.map((r) => (
              <IncomingRequestRow key={r.id} request={r} />
            ))}
          </div>
        </div>
      )}

      {outgoingRequests.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide mb-2">
            Outgoing — {outgoingRequests.length}
          </p>
          <div className="space-y-1">
            {outgoingRequests.map((r) => (
              <OutgoingRequestRow key={r.id} request={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FriendRow({ friendship }: { friendship: Friendship }) {
  const presences = usePresenceStore((s) => s.presences)
  const setShowFriendsPanel = useUIStore((s) => s.setShowFriendsPanel)
  const setActiveDM = useDMStore((s) => s.setActiveDM)
  const addDMChannel = useDMStore((s) => s.addDMChannel)
  const removeFriendFromStore = useFriendStore((s) => s.removeFriend)
  const [loading, setLoading] = useState(false)
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)

  const friend = friendship.friend
  if (!friend) return null

  const status = presences[friend.id] || friend.status || 'offline'

  const handleAvatarClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPopover({ x: rect.right + 8, y: rect.top })
  }

  const handleMessage = async () => {
    try {
      const dm = await dmAPI.create(friend.id)
      console.log('[FriendsPanel] DM created/retrieved:', dm.id, 'participants:', dm.participants)
      addDMChannel(dm)
      setActiveDM(dm.id)
      setShowFriendsPanel(false)
      // Join the DM channel room for real-time updates
      joinChannel(dm.id)
    } catch (err) {
      console.error('Failed to create DM:', err)
    }
  }

  const handleCall = async () => {
    try {
      // Create or get DM channel first
      const dm = await dmAPI.create(friend.id)
      addDMChannel(dm)
      // Initiate voice call
      await initiateCall(
        friend.id,
        friend.displayName || friend.username,
        dm.id,
        false // audio only by default
      )
      setShowFriendsPanel(false)
    } catch (err) {
      console.error('Failed to initiate call:', err)
    }
  }

  const handleRemove = async () => {
    setLoading(true)
    try {
      await friendAPI.removeFriend(friend.id)
      removeFriendFromStore(friend.id)
    } catch (err) {
      console.error('Failed to remove friend:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-blite-bg-hover transition-colors group">
        <button onClick={handleAvatarClick}>
          <UserAvatar
            username={friend.displayName || friend.username}
            avatarUrl={friend.avatarUrl}
            status={status}
            size="sm"
            showStatus
          />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blite-text-primary truncate">
            {friend.displayName || friend.username}
          </p>
          <p className="text-xs text-blite-text-muted capitalize">{status}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleMessage}
            className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-active transition-colors"
            title="Message"
          >
            <MessageSquare size={16} />
          </button>
          <button
            onClick={handleCall}
            className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-success hover:bg-blite-success/10 transition-colors"
            title="Call"
          >
            <Phone size={16} />
          </button>
          <button
            onClick={handleRemove}
            disabled={loading}
            className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-danger hover:bg-blite-danger/10 transition-colors"
            title="Remove Friend"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <UserMinus size={16} />}
          </button>
        </div>
      </div>

      {/* User Profile Popover */}
      {popover && (
        <UserPopover
          user={friend}
          onClose={() => setPopover(null)}
          position={popover}
          serverId={null}
        />
      )}
    </>
  )
}

function IncomingRequestRow({ request }: { request: FriendRequest }) {
  const addFriend = useFriendStore((s) => s.addFriend)
  const removeIncomingRequest = useFriendStore((s) => s.removeIncomingRequest)
  const [loading, setLoading] = useState(false)

  const sender = request.sender
  if (!sender) return null

  const handleAccept = async () => {
    setLoading(true)
    try {
      const friendship = await friendAPI.acceptRequest(request.id)
      addFriend(friendship)
      removeIncomingRequest(request.id)
    } catch (err) {
      console.error('Failed to accept request:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await friendAPI.rejectRequest(request.id)
      removeIncomingRequest(request.id)
    } catch (err) {
      console.error('Failed to reject request:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-blite-bg-hover transition-colors">
      <UserAvatar
        username={sender.displayName || sender.username}
        avatarUrl={sender.avatarUrl}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blite-text-primary truncate">
          {sender.displayName || sender.username}
        </p>
        <p className="text-xs text-blite-text-muted">Incoming Friend Request</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleAccept}
          disabled={loading}
          className="p-1.5 rounded-md text-blite-success hover:bg-blite-success/10 transition-colors"
          title="Accept"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="p-1.5 rounded-md text-blite-danger hover:bg-blite-danger/10 transition-colors"
          title="Reject"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function OutgoingRequestRow({ request }: { request: FriendRequest }) {
  const receiver = request.receiver
  if (!receiver) return null

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-blite-bg-hover transition-colors">
      <UserAvatar
        username={receiver.displayName || receiver.username}
        avatarUrl={receiver.avatarUrl}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blite-text-primary truncate">
          {receiver.displayName || receiver.username}
        </p>
        <p className="text-xs text-blite-text-muted">Outgoing Friend Request</p>
      </div>
      <span className="text-xs text-blite-text-muted">Pending</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-lg gradient-accent flex items-center justify-center mb-4 glow-accent">
        <Users size={28} className="text-white" />
      </div>
      <p className="text-blite-text-muted text-sm text-center max-w-xs">{message}</p>
    </div>
  )
}
