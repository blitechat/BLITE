import React, { useState } from 'react'
import { X, UserPlus, Check, XCircle, Bell, Users } from 'lucide-react'
import { useFriendStore } from '@renderer/stores/friendStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { friendAPI } from '@renderer/services/api'
import UserAvatar from '@renderer/components/user/UserAvatar'
import type { FriendRequest } from '@shared/types'

type TabType = 'all' | 'friend-requests'

export default function NotificationInbox() {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [loading, setLoading] = useState<string | null>(null)
  const closeModal = useUIStore((s) => s.closeModal)
  const incomingRequests = useFriendStore((s) => s.incomingRequests)
  const removeIncomingRequest = useFriendStore((s) => s.removeIncomingRequest)
  const addFriend = useFriendStore((s) => s.addFriend)

  const handleAccept = async (request: FriendRequest) => {
    setLoading(request.id)
    try {
      const friendship = await friendAPI.acceptRequest(request.id)
      addFriend(friendship)
      removeIncomingRequest(request.id)
    } catch (err) {
      console.error('Failed to accept friend request:', err)
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async (request: FriendRequest) => {
    setLoading(request.id)
    try {
      await friendAPI.rejectRequest(request.id)
      removeIncomingRequest(request.id)
    } catch (err) {
      console.error('Failed to reject friend request:', err)
    } finally {
      setLoading(null)
    }
  }

  const totalNotifications = incomingRequests.length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 glass rounded-xl shadow-2xl border border-blite-glass-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-blite-glass-border">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-blite-text-muted" />
            <h2 className="text-lg font-semibold text-blite-text-primary">Inbox</h2>
            {totalNotifications > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full gradient-accent text-white">
                {totalNotifications}
              </span>
            )}
          </div>
          <button
            onClick={closeModal}
            className="p-1 text-blite-text-muted hover:text-blite-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-blite-glass-border">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'text-blite-text-primary border-b-2 border-blite-accent'
                : 'text-blite-text-muted hover:text-blite-text-secondary'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('friend-requests')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'friend-requests'
                ? 'text-blite-text-primary border-b-2 border-blite-accent'
                : 'text-blite-text-muted hover:text-blite-text-secondary'
            }`}
          >
            Friend Requests
            {incomingRequests.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-blite-danger text-white">
                {incomingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto">
          {activeTab === 'all' && (
            <>
              {incomingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <Bell size={40} className="text-blite-text-muted mb-3" />
                  <p className="text-blite-text-secondary text-sm">No new notifications</p>
                  <p className="text-blite-text-muted text-xs mt-1">You're all caught up!</p>
                </div>
              ) : (
                <div className="divide-y divide-blite-glass-border">
                  {incomingRequests.map((request) => (
                    <FriendRequestItem
                      key={request.id}
                      request={request}
                      loading={loading === request.id}
                      onAccept={() => handleAccept(request)}
                      onReject={() => handleReject(request)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'friend-requests' && (
            <>
              {incomingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <Users size={40} className="text-blite-text-muted mb-3" />
                  <p className="text-blite-text-secondary text-sm">No pending friend requests</p>
                </div>
              ) : (
                <div className="divide-y divide-blite-glass-border">
                  {incomingRequests.map((request) => (
                    <FriendRequestItem
                      key={request.id}
                      request={request}
                      loading={loading === request.id}
                      onAccept={() => handleAccept(request)}
                      onReject={() => handleReject(request)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface FriendRequestItemProps {
  request: FriendRequest
  loading: boolean
  onAccept: () => void
  onReject: () => void
}

function FriendRequestItem({ request, loading, onAccept, onReject }: FriendRequestItemProps) {
  const sender = request.sender

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-blite-bg-hover transition-colors">
      <UserAvatar
        username={sender?.displayName || sender?.username || 'Unknown'}
        avatarUrl={sender?.avatarUrl}
        size="md"
        showStatus={false}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <UserPlus size={14} className="text-blite-accent flex-shrink-0" />
          <p className="text-sm text-blite-text-primary">
            <span className="font-semibold">{sender?.displayName || sender?.username}</span>
            <span className="text-blite-text-muted"> wants to be your friend</span>
          </p>
        </div>
        {sender?.username && sender?.displayName !== sender?.username && (
          <p className="text-xs text-blite-text-muted mt-0.5">@{sender.username}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onAccept}
          disabled={loading}
          className="p-1.5 rounded-md bg-blite-success/10 text-blite-success hover:bg-blite-success/20 transition-colors disabled:opacity-50"
          title="Accept"
        >
          <Check size={16} />
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          className="p-1.5 rounded-md bg-blite-danger/10 text-blite-danger hover:bg-blite-danger/20 transition-colors disabled:opacity-50"
          title="Reject"
        >
          <XCircle size={16} />
        </button>
      </div>
    </div>
  )
}
