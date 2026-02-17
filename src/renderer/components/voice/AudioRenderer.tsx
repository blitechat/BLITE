import React, { useEffect, useRef, useCallback } from 'react'
import { useVoiceStore } from '@renderer/stores/voiceStore'

/**
 * Hidden component that renders <audio> elements for each remote peer's audio stream.
 * Required for audio playback of consumed tracks.
 */
export default function AudioRenderer() {
  const peers = useVoiceStore((s) => s.peers)
  const isDeafened = useVoiceStore((s) => s.isDeafened)

  return (
    <div style={{ display: 'none' }}>
      {Object.values(peers).map((peer) => (
        <React.Fragment key={peer.userId}>
          {peer.audioStream && (
            <AudioElement
              key={`audio-${peer.userId}`}
              stream={peer.audioStream}
              muted={isDeafened}
            />
          )}
          {peer.screenAudioStream && (
            <AudioElement
              key={`screen-audio-${peer.userId}`}
              stream={peer.screenAudioStream}
              muted={isDeafened}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

// Keep track of audio elements that failed autoplay so we can retry on user gesture
const pendingAudioElements = new Map<HTMLAudioElement, number>() // audio -> timestamp
let gestureListenerAdded = false
const PENDING_AUDIO_TIMEOUT = 30000 // 30 seconds

function cleanupGestureListener() {
  if (gestureListenerAdded) {
    document.removeEventListener('click', retryPending)
    document.removeEventListener('keydown', retryPending)
    document.removeEventListener('touchstart', retryPending)
    gestureListenerAdded = false
  }
  pendingAudioElements.clear()
}

// Export cleanup for voiceService
export { cleanupGestureListener }

const retryPending = () => {
  const now = Date.now()
  for (const [audio, timestamp] of pendingAudioElements.entries()) {
    // Remove stale pending audios after 30 seconds
    if (now - timestamp > PENDING_AUDIO_TIMEOUT) {
      pendingAudioElements.delete(audio)
      console.log('[AudioElement] Removed stale pending audio after timeout')
      continue
    }

    audio.play()
      .then(() => {
        pendingAudioElements.delete(audio)
        console.log('[AudioElement] Resumed audio after user gesture')
      })
      .catch(() => {
        // still blocked, keep in pending set
      })
  }

  if (pendingAudioElements.size === 0) {
    cleanupGestureListener()
  }
}

function addGestureListener() {
  if (gestureListenerAdded) return
  gestureListenerAdded = true

  document.addEventListener('click', retryPending, { once: false })
  document.addEventListener('keydown', retryPending, { once: false })
  document.addEventListener('touchstart', retryPending, { once: false })
}

function AudioElement({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !stream) {
      console.log('[AudioElement] Missing audio element or stream')
      return
    }

    console.log('[AudioElement] Setting up audio stream, tracks:', stream.getTracks().length)

    // Set the stream
    audio.srcObject = stream

    // Ensure all tracks are enabled
    stream.getTracks().forEach(track => {
      console.log('[AudioElement] Track:', track.kind, 'enabled:', track.enabled, 'readyState:', track.readyState, 'muted:', track.muted)
      track.enabled = true
    })

    // Set volume to max (not muted)
    audio.volume = 1.0
    audio.muted = false

    // Listen for track becoming live (unmuted)
    stream.getTracks().forEach(track => {
      if (track.muted) {
        const onUnmute = () => {
          console.log('[AudioElement] Track unmuted, retrying play')
          track.removeEventListener('unmute', onUnmute)
          if (audio.paused && audio.srcObject) {
            audio.play().catch(() => {})
          }
        }
        track.addEventListener('unmute', onUnmute)
      }
    })

    // Try to play the audio with automatic retries
    const playAudio = async (attempt = 1) => {
      try {
        console.log(`[AudioElement] Attempting to play audio (attempt ${attempt})...`)
        await audio.play()
        console.log('[AudioElement] Audio playing successfully')
        pendingAudioElements.delete(audio)
      } catch (err) {
        console.warn('[AudioElement] Audio autoplay prevented:', err)
        // Queue for retry on next user gesture
        pendingAudioElements.set(audio, Date.now())
        addGestureListener()

        // Also retry automatically after a short delay (up to 5 times)
        if (attempt < 5) {
          setTimeout(() => {
            if (audio.srcObject && audio.paused) {
              playAudio(attempt + 1)
            }
          }, 500 * attempt)
        }
      }
    }

    playAudio()

    return () => {
      pendingAudioElements.delete(audio)
      audio.srcObject = null
    }
  }, [stream])

  useEffect(() => {
    if (audioRef.current) {
      // Only mute if deafened, never set to fully muted otherwise
      audioRef.current.muted = muted
      if (!muted) {
        audioRef.current.volume = 1.0
        // Try to play again when undeafening (may have been paused)
        audioRef.current.play().catch(() => {})
      }
    }
  }, [muted])

  return <audio ref={audioRef} autoPlay playsInline />
}
