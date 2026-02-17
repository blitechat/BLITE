import React from 'react'
import { Users, UserPlus } from 'lucide-react'
import { useUIStore } from '@renderer/stores/uiStore'
import { useFriendStore } from '@renderer/stores/friendStore'
import { useDMStore } from '@renderer/stores/dmStore'

export default function FriendList() {
  const openModal = useUIStore((s) => s.openModal)
  const showFriendsPanel = useUIStore((s) => s.showFriendsPanel)
  const setShowFriendsPanel = useUIStore((s) => s.setShowFriendsPanel)
  const setActiveDM = useDMStore((s) => s.setActiveDM)
  const incomingRequests = useFriendStore((s) => s.incomingRequests)

  const pendingCount = incomingRequests.length

  const handleFriendsClick = () => {
    setActiveDM(null)
    setShowFriendsPanel(true)
  }

  return (
    <div className="px-2 py-2 space-y-1 border-b border-blite-glass-border">
      <button
        onClick={handleFriendsClick}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium transition-all ${
          showFriendsPanel
            ? 'bg-blite-bg-active text-blite-text-primary'
            : 'text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary'
        }`}
      >
        <Users size={16} />
        <span className="flex-1 text-left">Friends</span>
        {pendingCount > 0 && (
          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full gradient-accent text-white text-xs font-bold px-1">
            {pendingCount}
          </span>
        )}
      </button>
      <button
        onClick={() => openModal('addFriend')}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary transition-all"
      >
        <UserPlus size={16} />
        <span className="flex-1 text-left">Add Friend</span>
      </button>
    </div>
  )
}
