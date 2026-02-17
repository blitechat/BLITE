import React, { useState, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'

interface AudioPlayerProps {
  src: string
}

export default function AudioPlayer({ src }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio(src)
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration)
    })
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100)
      }
    })
    audio.addEventListener('ended', () => {
      setPlaying(false)
      setProgress(0)
    })

    return () => {
      audio.pause()
      audio.src = ''
    }
  }, [src])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    audioRef.current.currentTime = pct * duration
    setProgress(pct * 100)
  }

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <button
        onClick={togglePlay}
        className="p-1.5 rounded-full gradient-accent text-white hover:opacity-90 transition-opacity flex-shrink-0"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>

      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div
          className="flex-1 h-1.5 bg-blite-bg-hover rounded-full cursor-pointer relative"
          onClick={handleSeek}
        >
          <div
            className="h-full gradient-accent rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-blite-text-muted font-mono flex-shrink-0 w-8">
          {formatTime(playing && audioRef.current ? audioRef.current.currentTime : duration)}
        </span>
      </div>
    </div>
  )
}
