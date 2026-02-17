import React from 'react'
import { MicOff, Headphones, Video, Monitor } from 'lucide-react'
import UserAvatar from '@renderer/components/user/UserAvatar'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useAuthStore } from '@renderer/stores/authStore'

export default function VoicePeerList() {
  const peers = useVoiceStore((s) => s.peers)
  const activeSpeakerId = useVoiceStore((s) => s.activeSpeakerId)
  const currentUser = useAuthStore((s) => s.user)
  const isMuted = useVoiceStore((s) => s.isMuted)
  const isDeafened = useVoiceStore((s) => s.isDeafened)
  const isCameraOn = useVoiceStore((s) => s.isCameraOn)
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing)

  const peerList = Object.values(peers)

  return (
    <div className="flex flex-wrap gap-3 justify-center p-4">
      {/* Local user */}
      {currentUser && (
        <PeerCard
          userId={currentUser.id}
          displayName={currentUser.displayName}
          avatarUrl={currentUser.avatarUrl}
          isMuted={isMuted}
          isDeafened={isDeafened}
          isCameraOn={isCameraOn}
          isScreenSharing={isScreenSharing}
          isSpeaking={activeSpeakerId === currentUser.id}
          isLocal
        />
      )}

      {/* Remote peers */}
      {peerList.map((peer) => (
        <PeerCard
          key={peer.userId}
          userId={peer.userId}
          displayName={peer.displayName}
          isMuted={peer.isMuted}
          isDeafened={peer.isDeafened}
          isCameraOn={peer.isCameraOn}
          isScreenSharing={peer.isScreenSharing}
          isSpeaking={activeSpeakerId === peer.userId}
        />
      ))}
    </div>
  )
}

function PeerCard({
  userId,
  displayName,
  avatarUrl,
  isMuted,
  isDeafened,
  isCameraOn,
  isScreenSharing,
  isSpeaking,
  isLocal,
}: {
  userId: string
  displayName: string
  avatarUrl?: string | null
  isMuted: boolean
  isDeafened: boolean
  isCameraOn: boolean
  isScreenSharing: boolean
  isSpeaking: boolean
  isLocal?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 p-4 rounded-lg glass transition-all ${
        isSpeaking ? 'ring-2 ring-green-500 ring-opacity-75 shadow-lg shadow-green-500/20' : ''
      }`}
      style={{ minWidth: '120px' }}
    >
      <div className="relative">
        <UserAvatar
          username={displayName}
          avatarUrl={avatarUrl || null}
          size="lg"
          showStatus={false}
          className={isSpeaking ? 'ring-2 ring-green-500 rounded-full' : ''}
        />
      </div>

      <p className="text-sm font-medium text-blite-text-primary truncate max-w-[100px]">
        {displayName}
        {isLocal && <span className="text-blite-text-muted text-xs ml-1">(You)</span>}
      </p>

      <div className="flex items-center gap-1.5">
        {isMuted && (
          <span className="text-blite-danger" title="Muted">
            <MicOff size={14} />
          </span>
        )}
        {isDeafened && (
          <span className="text-blite-danger" title="Deafened">
            <Headphones size={14} />
          </span>
        )}
        {isCameraOn && (
          <span className="text-blite-success" title="Camera On">
            <Video size={14} />
          </span>
        )}
        {isScreenSharing && (
          <span className="text-blite-success" title="Screen Sharing">
            <Monitor size={14} />
          </span>
        )}
      </div>
    </div>
  )
}
