import React, { useEffect, useRef, useState } from 'react'
import { Monitor, Video as VideoIcon, Maximize2 } from 'lucide-react'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { useAuthStore } from '@renderer/stores/authStore'

interface VideoTile {
  userId: string
  displayName: string
  stream: MediaStream
  type: 'camera' | 'screen'
}

export default function VideoGrid() {
  const peers = useVoiceStore((s) => s.peers)
  const localVideoStream = useVoiceStore((s) => s.localVideoStream)
  const localScreenStream = useVoiceStore((s) => s.localScreenStream)
  const currentUser = useAuthStore((s) => s.user)

  // Collect all video tiles
  const tiles: VideoTile[] = []

  // Screen shares go first (displayed prominently) - only include active streams with tracks
  if (localScreenStream && currentUser && localScreenStream.getTracks().length > 0 && localScreenStream.active) {
    tiles.push({
      userId: currentUser.id,
      displayName: `${currentUser.displayName} (Screen)`,
      stream: localScreenStream,
      type: 'screen',
    })
  }

  for (const peer of Object.values(peers)) {
    if (peer.screenStream && peer.screenStream.getTracks().length > 0 && peer.screenStream.active) {
      tiles.push({
        userId: peer.userId,
        displayName: `${peer.displayName} (Screen)`,
        stream: peer.screenStream,
        type: 'screen',
      })
    }
  }

  // Camera feeds (only include if stream is active and has tracks)
  if (localVideoStream && currentUser && localVideoStream.getTracks().length > 0 && localVideoStream.active) {
    tiles.push({
      userId: currentUser.id,
      displayName: currentUser.displayName,
      stream: localVideoStream,
      type: 'camera',
    })
  }

  for (const peer of Object.values(peers)) {
    if (peer.videoStream && peer.videoStream.getTracks().length > 0 && peer.videoStream.active) {
      tiles.push({
        userId: peer.userId,
        displayName: peer.displayName,
        stream: peer.videoStream,
        type: 'camera',
      })
    }
  }

  if (tiles.length === 0) return null

  // Separate screen shares from cameras
  const screens = tiles.filter((t) => t.type === 'screen')
  const cameras = tiles.filter((t) => t.type === 'camera')

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0 p-2">
      {/* Screen shares - large and resizable */}
      {screens.length > 0 && (
        <div className={`flex-1 grid gap-2 min-h-0 ${
          screens.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
        }`}>
          {screens.map((tile) => (
            <VideoTileComponent key={`${tile.userId}-${tile.type}`} tile={tile} large />
          ))}
        </div>
      )}

      {/* Camera feeds - smaller and resizable */}
      {cameras.length > 0 && (
        <div className={`flex gap-2 flex-wrap ${screens.length > 0 ? 'h-auto flex-shrink-0' : 'flex-1'}`}>
          {cameras.map((tile) => (
            <VideoTileComponent
              key={`${tile.userId}-${tile.type}`}
              tile={tile}
              large={screens.length === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function VideoTileComponent({ tile, large }: { tile: VideoTile; large?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(() => {
    // Load saved size from localStorage
    const saved = localStorage.getItem(`video-tile-${tile.userId}-${tile.type}`)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { width: parsed.width, height: parsed.height }
    }
    return large
      ? { width: 640, height: 360 }
      : { width: 240, height: 180 }
  })
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !tile.stream) return

    // Check if stream is actually valid and has active tracks
    const tracks = tile.stream.getTracks()
    if (tracks.length === 0 || !tile.stream.active) {
      console.warn('[VideoGrid] Stream has no tracks or is inactive, skipping', tile.userId)
      return
    }

    // Enable all tracks
    tracks.forEach((track) => { track.enabled = true })

    video.srcObject = tile.stream
    video.muted = true
    video.playsInline = true
    video.autoplay = true

    const playVideo = async () => {
      try {
        await video.play()
      } catch {
        // Retry after a short delay for autoplay restrictions
        setTimeout(async () => {
          try { await video.play() } catch { /* silent */ }
        }, 100)
      }
    }

    if (video.readyState >= 2) {
      playVideo()
    } else {
      const handleLoadedData = () => playVideo()
      video.addEventListener('loadeddata', handleLoadedData)
      return () => {
        video.removeEventListener('loadeddata', handleLoadedData)
        video.srcObject = null
      }
    }

    return () => {
      video.srcObject = null
    }
  }, [tile.stream, tile.displayName, tile.type, tile.userId])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)

    const startX = e.clientX
    const startY = e.clientY
    const startWidth = size.width
    const startHeight = size.height

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY

      const newWidth = Math.max(160, Math.min(1920, startWidth + deltaX))
      const newHeight = Math.max(120, Math.min(1080, startHeight + deltaY))

      setSize({ width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      // Save size to localStorage
      localStorage.setItem(`video-tile-${tile.userId}-${tile.type}`, JSON.stringify(size))
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleDoubleClick = () => {
    // Reset to default size
    const defaultSize = large
      ? { width: 640, height: 360 }
      : { width: 240, height: 180 }
    setSize(defaultSize)
    localStorage.setItem(`video-tile-${tile.userId}-${tile.type}`, JSON.stringify(defaultSize))
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg overflow-hidden bg-blite-bg-tertiary glass flex-shrink-0"
      style={{
        width: large ? '100%' : `${size.width}px`,
        height: large ? '100%' : `${size.height}px`,
        minWidth: large ? 'auto' : '160px',
        minHeight: large ? 'auto' : '120px',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain bg-black"
        onDoubleClick={handleDoubleClick}
      />

      {/* Label overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 pointer-events-none">
        <div className="flex items-center gap-1.5">
          {tile.type === 'screen' ? (
            <Monitor size={12} className="text-white/80" />
          ) : (
            <VideoIcon size={12} className="text-white/80" />
          )}
          <span className="text-xs text-white/90 truncate">{tile.displayName}</span>
        </div>
      </div>

      {/* Resize handle (only for non-large tiles) */}
      {!large && (
        <div
          className={`absolute bottom-1 right-1 w-6 h-6 cursor-nwse-resize bg-blite-bg-hover/80 rounded-tl-lg flex items-center justify-center group hover:bg-blite-bg-active/80 transition-colors ${
            isResizing ? 'bg-blite-gradient-start/60' : ''
          }`}
          onMouseDown={handleMouseDown}
          title="Drag to resize (Double-click video to reset)"
        >
          <Maximize2 size={12} className="text-blite-text-secondary group-hover:text-blite-text-primary" />
        </div>
      )}
    </div>
  )
}
