import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import TopNav from './TopNav'
import LeftPanel from './LeftPanel'
import RightPanel from './RightPanel'
import TopBar from './TopBar'
import MessageList from '@renderer/components/chat/MessageList'
import MessageInput from '@renderer/components/chat/MessageInput'
import TypingIndicator from '@renderer/components/chat/TypingIndicator'
import DMConversation from '@renderer/components/dm/DMConversation'
import FriendsPanel from '@renderer/components/friends/FriendsPanel'
import AddFriendModal from '@renderer/components/friends/AddFriendModal'
import ContextMenu from '@renderer/components/common/ContextMenu'
import CreateServerModal from '@renderer/components/server/CreateServerModal'
import JoinServerModal from '@renderer/components/server/JoinServerModal'
import ServerSettings from '@renderer/components/server/ServerSettings'
import InviteModal from '@renderer/components/server/InviteModal'
import CreateChannelModal from '@renderer/components/channel/CreateChannelModal'
import UserSettings from '@renderer/components/user/UserSettings'
import VoicePanel from '@renderer/components/voice/VoicePanel'
import AudioRenderer from '@renderer/components/voice/AudioRenderer'
import QuickSwitcher from '@renderer/components/common/QuickSwitcher'
import NotificationInbox from '@renderer/components/notifications/NotificationInbox'
import ForwardModal from '@renderer/components/chat/ForwardModal'
import { initScheduler, stopScheduler } from '@renderer/services/scheduler'
import { encryptDM, encryptChannel, generateChannelKey } from '@renderer/services/crypto'
import { sendMessage } from '@renderer/services/socket'
import IncomingCallModal from '@renderer/components/call/IncomingCallModal'
import OutgoingCallModal from '@renderer/components/call/OutgoingCallModal'
import { useServerStore } from '@renderer/stores/serverStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useFriendStore } from '@renderer/stores/friendStore'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { useSocket } from '@renderer/hooks/useSocket'
import { usePresence } from '@renderer/hooks/usePresence'
import { serverAPI, channelAPI, dmAPI, friendAPI, blockAPI } from '@renderer/services/api'
import { shallow } from 'zustand/shallow'
import { useAuthStore } from '@renderer/stores/authStore'
import { AlertTriangle } from 'lucide-react'

export default function AppLayout() {
  const { serverId: urlServerId } = useParams<{ serverId?: string }>()

  const privateKey = useAuthStore((s) => s.privateKey)
  const openModal = useUIStore((s) => s.openModal)

  const {
    activeView,
    activeModal,
    leftPanelTab,
    setActiveView,
  } = useUIStore(
    (s) => ({
      activeView: s.activeView,
      activeModal: s.activeModal,
      leftPanelTab: s.leftPanelTab,
      setActiveView: s.setActiveView,
    }),
    shallow
  )

  const {
    activeServerId,
    activeChannelId,
    servers,
    setServers,
    setChannels,
    setActiveChannel,
    setActiveServer,
    setBlockedUsers,
  } = useServerStore(
    (s) => ({
      activeServerId: s.activeServerId,
      activeChannelId: s.activeChannelId,
      servers: s.servers,
      setServers: s.setServers,
      setChannels: s.setChannels,
      setActiveChannel: s.setActiveChannel,
      setActiveServer: s.setActiveServer,
      setBlockedUsers: s.setBlockedUsers,
    }),
    shallow
  )

  const channels = useServerStore((s) => (activeServerId ? s.channels[activeServerId] || [] : []))

  const { setDMChannels } = useDMStore((s) => ({ setDMChannels: s.setDMChannels }), shallow)
  const { setFriends, setIncomingRequests, setOutgoingRequests } = useFriendStore(
    (s) => ({
      setFriends: s.setFriends,
      setIncomingRequests: s.setIncomingRequests,
      setOutgoingRequests: s.setOutgoingRequests,
    }),
    shallow
  )

  const [isMaximized, setIsMaximized] = useState(false)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)

  useSocket()
  usePresence()

  // Handle URL server ID
  useEffect(() => {
    if (urlServerId && servers.length > 0) {
      const server = servers.find((s) => s.id === urlServerId)
      if (server) {
        setActiveServer(urlServerId)
        setActiveView('servers')
      }
    }
  }, [urlServerId, servers, setActiveServer, setActiveView])

  // Quick switcher keyboard shortcut and room shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setShowQuickSwitcher((prev) => !prev)
        return
      }
      if (e.key === 'Escape' && showQuickSwitcher) {
        setShowQuickSwitcher(false)
        return
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key)
        if (e.key === '`' || e.key === '0') {
          e.preventDefault()
          setActiveView('dms')
          setActiveServer(null)
        } else if (num >= 1 && num <= 9) {
          const serverIndex = num - 1
          if (servers[serverIndex]) {
            e.preventDefault()
            setActiveView('servers')
            setActiveServer(servers[serverIndex].id)
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showQuickSwitcher, servers, setActiveServer, setActiveView])

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [servers, dms, friends, incoming, outgoing, blocks] = await Promise.all([
          serverAPI.list(),
          dmAPI.list(),
          friendAPI.list(),
          friendAPI.getIncomingRequests(),
          friendAPI.getOutgoingRequests(),
          blockAPI.list().catch(() => []),
        ])
        setServers(servers)
        setDMChannels(dms)
        setFriends(friends)
        setIncomingRequests(incoming)
        setOutgoingRequests(outgoing)
        setBlockedUsers(blocks.map((b: any) => b.blockedId))
      } catch (err) {
        console.error('Failed to load initial data:', err)
      }
    }

    loadInitialData()
  }, [setServers, setDMChannels, setFriends, setIncomingRequests, setOutgoingRequests])

  // Load channels when active server changes
  useEffect(() => {
    if (!activeServerId) return

    const loadChannels = async () => {
      try {
        const fetchedChannels = await channelAPI.list(activeServerId)
        setChannels(activeServerId, fetchedChannels)

        if (!activeChannelId) {
          const firstText = fetchedChannels.find((c) => c.type === 'text')
          if (firstText) {
            setActiveChannel(firstText.id)
          }
        }
      } catch (err) {
        console.error('Failed to load channels:', err)
      }
    }

    loadChannels()
  }, [activeServerId])

  // Initialize scheduler
  useEffect(() => {
    initScheduler(async (channelId, content, isDM) => {
      const auth = useAuthStore.getState()
      if (!auth.user || !auth.privateKey) return

      if (isDM) {
        const dms = useDMStore.getState().dmChannels
        const dm = dms.find((d) => d.id === channelId)
        const other = dm?.participants?.find((p) => p.id !== auth.user!.id)
        if (other?.publicKey) {
          const result = encryptDM(content, other.publicKey, auth.privateKey)
          sendMessage(channelId, result.encrypted, result.nonce, 'text', undefined, content)
        }
      } else {
        const key = generateChannelKey()
        const result = encryptChannel(content, key)
        sendMessage(channelId, result.encrypted, result.nonce, 'text', undefined, content)
      }
    })
    return () => stopScheduler()
  }, [])

  // Check maximized state
  useEffect(() => {
    if (!window.api?.isMaximized) return
    const checkMaximized = async () => {
      try {
        const maximized = await window.api!.isMaximized()
        setIsMaximized(maximized)
      } catch {
        // Not in electron
      }
    }
    checkMaximized()
  }, [])

  const activeChannel = channels.find((c) => c.id === activeChannelId)
  const isVoiceConnected = useVoiceStore((s) => s.isConnected)
  const voiceServerId = useVoiceStore((s) => s.currentServerId)

  // Determine if we should show the friends panel in the main content area
  const showFriendsInMain = leftPanelTab === 'friends' && activeView === 'dms'

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-blite-bg-primary">
      {/* Top Nav */}
      <TopNav isMaximized={isMaximized} setIsMaximized={setIsMaximized} />

      {/* Main content: left panel + chat + right panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel (Telegram-style) */}
        <LeftPanel />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 bg-blite-bg-chat">
          <TopBar />

          {/* Encryption Keys Warning */}
          {!privateKey && (
            <div className="bg-blite-warning/10 border-b border-blite-warning/30 px-4 py-2 flex items-center gap-2 text-sm text-blite-warning">
              <AlertTriangle size={16} className="flex-shrink-0" />
              <span className="flex-1">
                Encryption keys not loaded. You can read messages but cannot send new ones.{' '}
                <button
                  onClick={() => openModal('userSettings')}
                  className="underline hover:brightness-125 transition-all"
                >
                  Log out and back in
                </button>
                {' '}to restore your keys.
              </span>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {/* Chat area */}
            <div className="flex-1 flex flex-col min-w-0">
              {activeView === 'dms' ? (
                showFriendsInMain ? <FriendsPanel /> : <DMConversation />
              ) : (
                <>
                  <MessageList
                    channelId={activeChannelId}
                    channelName={activeChannel?.name}
                    isDM={false}
                  />
                  <TypingIndicator channelId={activeChannelId} />
                  <MessageInput
                    channelId={activeChannelId}
                    channelName={activeChannel?.name}
                    isDM={false}
                  />
                </>
              )}
            </div>

            {/* Voice Panel - show when connected and in the right context */}
            {isVoiceConnected && (
              // Show voice panel for server voice channels when in that server
              (activeView === 'servers' && voiceServerId === activeServerId) ||
              // Always show voice panel for DM calls (even if not in DMs view)
              (voiceServerId === 'dm')
            ) && (
              <VoicePanel />
            )}
          </div>
        </div>

        {/* Right Panel (slide-in) */}
        <RightPanel />
      </div>

      {/* Hidden audio renderer */}
      {isVoiceConnected && <AudioRenderer />}

      {/* Context Menu */}
      <ContextMenu />

      {/* Modals */}
      {activeModal === 'createServer' && <CreateServerModal />}
      {activeModal === 'joinServer' && <JoinServerModal />}
      {activeModal === 'serverSettings' && <ServerSettings />}
      {activeModal === 'invite' && <InviteModal />}
      {activeModal === 'createChannel' && <CreateChannelModal />}
      {activeModal === 'userSettings' && <UserSettings />}
      {activeModal === 'addFriend' && <AddFriendModal />}
      {activeModal === 'inbox' && <NotificationInbox />}

      {/* Forward Message Modal */}
      <ForwardModal />

      {/* Quick Switcher */}
      {showQuickSwitcher && <QuickSwitcher onClose={() => setShowQuickSwitcher(false)} />}

      {/* Call Modals */}
      <IncomingCallModal />
      <OutgoingCallModal />
    </div>
  )
}
