import React, { useState } from 'react'
import { Mic, MicOff, Headphones, EarOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, Loader2, Lock } from 'lucide-react'
import VoicePeerList from './VoicePeerList'
import VideoGrid from './VideoGrid'
import ScreenSharePicker from './ScreenSharePicker'
import Tooltip from '@renderer/components/common/Tooltip'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import {
  leaveVoiceChannel,
  toggleMute,
  toggleDeafen,
  startCamera,
  stopCamera,
  startScreenShare,
  stopScreenShare,
} from '@renderer/services/voiceService'

const isElectron = typeof window !== 'undefined' && !!window.api

export default function VoicePanel() {
  const isConnecting = useVoiceStore((s) => s.isConnecting)
  const isConnected = useVoiceStore((s) => s.isConnected)
  const connectionError = useVoiceStore((s) => s.connectionError)
  const isMuted = useVoiceStore((s) => s.isMuted)
  const isDeafened = useVoiceStore((s) => s.isDeafened)
  const isCameraOn = useVoiceStore((s) => s.isCameraOn)
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing)
  const peers = useVoiceStore((s) => s.peers)
  const localVideoStream = useVoiceStore((s) => s.localVideoStream)
  const localScreenStream = useVoiceStore((s) => s.localScreenStream)
  const isVoiceE2EE = useVoiceStore((s) => s.isVoiceE2EE)
  const [showScreenPicker, setShowScreenPicker] = useState(false)

  const handleScreenShare = () => {
    if (isScreenSharing) {
      stopScreenShare()
    } else if (isElectron) {
      setShowScreenPicker(true)
    } else {
      startScreenShare(undefined, true)
    }
  }

  const handleScreenSourceSelected = (sourceId: string, includeAudio: boolean) => {
    setShowScreenPicker(false)
    startScreenShare(sourceId, includeAudio)
  }

  // Check if anyone has video/screen
  const hasVideo = isCameraOn || isScreenSharing ||
    Object.values(peers).some((p) => p.isCameraOn || p.isScreenSharing) ||
    localVideoStream || localScreenStream ||
    Object.values(peers).some((p) => p.videoStream || p.screenStream)

  if (isConnecting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="animate-spin text-blite-text-muted" />
        <p className="text-blite-text-secondary text-sm">Connecting to voice...</p>
      </div>
    )
  }

  if (connectionError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-blite-danger text-sm">Failed to connect: {connectionError}</p>
        <button onClick={() => useVoiceStore.getState().setDisconnected()} className="btn-primary text-sm">
          Dismiss
        </button>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <p className="text-blite-text-muted text-sm">Click a voice channel to join</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Screen share source picker modal */}
      {showScreenPicker && (
        <ScreenSharePicker
          onSelect={handleScreenSourceSelected}
          onClose={() => setShowScreenPicker(false)}
        />
      )}

      {/* Video grid (when anyone has video/screen) */}
      {hasVideo && <VideoGrid />}

      {/* Peer list (always shown) */}
      <div className={`${hasVideo ? 'flex-shrink-0' : 'flex-1 flex items-center justify-center'}`}>
        <VoicePeerList />
      </div>

      {/* E2EE indicator */}
      {isVoiceE2EE && (
        <div className="flex-shrink-0 flex items-center justify-center gap-1.5 py-1.5 text-xs text-green-400">
          <Lock size={12} />
          <span>End-to-end encrypted</span>
        </div>
      )}

      {/* Control bar */}
      <div className="flex-shrink-0 border-t border-blite-glass-border px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <Tooltip content={isMuted ? 'Unmute' : 'Mute'} position="top">
            <button
              onClick={() => toggleMute()}
              className={`p-3 rounded-full transition-colors ${
                isMuted
                  ? 'bg-blite-danger/20 text-blite-danger hover:bg-blite-danger/30'
                  : 'bg-blite-bg-hover text-blite-text-primary hover:bg-blite-bg-active'
              }`}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          </Tooltip>

          <Tooltip content={isDeafened ? 'Undeafen' : 'Deafen'} position="top">
            <button
              onClick={() => toggleDeafen()}
              className={`p-3 rounded-full transition-colors ${
                isDeafened
                  ? 'bg-blite-danger/20 text-blite-danger hover:bg-blite-danger/30'
                  : 'bg-blite-bg-hover text-blite-text-primary hover:bg-blite-bg-active'
              }`}
            >
              {isDeafened ? <EarOff size={20} /> : <Headphones size={20} />}
            </button>
          </Tooltip>

          <Tooltip content={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'} position="top">
            <button
              onClick={() => isCameraOn ? stopCamera() : startCamera()}
              className={`p-3 rounded-full transition-colors ${
                isCameraOn
                  ? 'bg-blite-success/20 text-blite-success hover:bg-blite-success/30'
                  : 'bg-blite-bg-hover text-blite-text-primary hover:bg-blite-bg-active'
              }`}
            >
              {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
          </Tooltip>

          <Tooltip content={isScreenSharing ? 'Stop Sharing' : 'Share Screen'} position="top">
            <button
              onClick={handleScreenShare}
              className={`p-3 rounded-full transition-colors ${
                isScreenSharing
                  ? 'bg-blite-success/20 text-blite-success hover:bg-blite-success/30'
                  : 'bg-blite-bg-hover text-blite-text-primary hover:bg-blite-bg-active'
              }`}
            >
              {isScreenSharing ? <Monitor size={20} /> : <MonitorOff size={20} />}
            </button>
          </Tooltip>

          <div className="w-px h-8 bg-blite-border mx-1" />

          <Tooltip content="Disconnect" position="top">
            <button
              onClick={() => leaveVoiceChannel()}
              className="p-3 rounded-full bg-blite-danger text-white hover:bg-blite-danger/80 transition-colors"
            >
              <PhoneOff size={20} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
