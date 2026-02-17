import React, { useEffect } from 'react'
import MessageList from '@renderer/components/chat/MessageList'
import MessageInput from '@renderer/components/chat/MessageInput'
import TypingIndicator from '@renderer/components/chat/TypingIndicator'
import { useDMStore } from '@renderer/stores/dmStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { dmAPI } from '@renderer/services/api'
import { MessageSquare } from 'lucide-react'

export default function DMConversation() {
  const activeDMId = useDMStore((s) => s.activeDMId)
  const dmChannels = useDMStore((s) => s.dmChannels)
  const addDMChannel = useDMStore((s) => s.addDMChannel)
  const currentUser = useAuthStore((s) => s.user)

  const activeDM = dmChannels.find((dm) => dm.id === activeDMId)
  const otherUser = activeDM?.participants?.find((p) => p.id !== currentUser?.id)
  const channelName = otherUser?.displayName || otherUser?.username || 'User'

  // Refresh DM data if publicKey is missing (stale cache)
  useEffect(() => {
    if (activeDM && otherUser && !otherUser.publicKey) {
      console.log('[DMConversation] PublicKey missing, refreshing DM data...')
      // Re-fetch DM to get fresh participant data with publicKey
      dmAPI.create(otherUser.id).then((freshDM) => {
        console.log('[DMConversation] Got fresh DM data, publicKey:', freshDM.participants?.find((p: any) => p.id !== currentUser?.id)?.publicKey ? 'present' : 'still missing')
        addDMChannel(freshDM)
      }).catch((err) => {
        console.error('[DMConversation] Failed to refresh DM:', err)
      })
    }
  }, [activeDM?.id, otherUser?.publicKey])

  // Debug logging for DM participants
  useEffect(() => {
    if (activeDM) {
      console.log('[DMConversation] Active DM:', activeDM.id)
      console.log('[DMConversation] Participants:', activeDM.participants)
      if (otherUser) {
        console.log('[DMConversation] Other user publicKey:', otherUser.publicKey ? 'present' : 'MISSING')
      }
    }
  }, [activeDM, otherUser])

  if (!activeDMId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-blite-bg-chat">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-lg gradient-accent flex items-center justify-center mx-auto mb-4 glow-accent">
            <MessageSquare size={28} className="text-white" />
          </div>
          <p className="text-blite-text-secondary text-lg font-medium">Your Direct Messages</p>
          <p className="text-blite-text-muted text-sm mt-1">
            Select a conversation from the sidebar to start chatting.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <MessageList channelId={activeDMId} channelName={channelName} isDM={true} />
      <TypingIndicator channelId={activeDMId} />
      <MessageInput channelId={activeDMId} channelName={channelName} isDM={true} />
    </div>
  )
}
