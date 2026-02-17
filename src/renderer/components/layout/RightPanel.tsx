import React from 'react'
import { X } from 'lucide-react'
import MemberSidebar from './MemberSidebar'
import SearchPanel from '@renderer/components/chat/SearchPanel'
import PinnedMessagesPanel from '@renderer/components/chat/PinnedMessagesPanel'
import { useUIStore } from '@renderer/stores/uiStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useDMStore } from '@renderer/stores/dmStore'

export default function RightPanel() {
  const rightPanel = useUIStore((s) => s.rightPanel)
  const activeView = useUIStore((s) => s.activeView)
  const activeChannelId = useServerStore((s) => s.activeChannelId)
  const activeDMId = useDMStore((s) => s.activeDMId)

  const channelId = activeChannelId || activeDMId || ''
  const isDM = activeView === 'dms'

  const handleClose = () => {
    useUIStore.getState().setRightPanel('none')
  }

  if (rightPanel === 'none') return null

  return (
    <div className="w-72 flex-shrink-0 border-l border-blite-glass-border animate-slide-in-right neon-border bg-blite-bg-secondary flex flex-col">
      {rightPanel === 'members' && activeView === 'servers' && (
        <MemberSidebar />
      )}

      {rightPanel === 'search' && channelId && (
        <SearchPanel
          channelId={channelId}
          isDM={isDM}
          onClose={handleClose}
        />
      )}

      {rightPanel === 'pinned' && channelId && (
        <PinnedMessagesPanel
          channelId={channelId}
          onClose={handleClose}
        />
      )}

      {/* Fallback: show close button for members panel */}
      {rightPanel === 'members' && activeView !== 'servers' && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-blite-text-muted text-sm">Members only available in rooms</p>
        </div>
      )}
    </div>
  )
}
