import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Send, X } from 'lucide-react'

interface VoiceRecorderProps {
  onSend: (file: File) => void
}

export default function VoiceRecorder({ onSend }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      mediaRecorder.start()
      setRecording(true)
      setDuration(0)
      setAudioBlob(null)

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleSend = useCallback(() => {
    if (!audioBlob) return
    const file = new File([audioBlob], `voice-message-${Date.now()}.webm`, { type: 'audio/webm' })
    onSend(file)
    setAudioBlob(null)
    setDuration(0)
  }, [audioBlob, onSend])

  const handleCancel = useCallback(() => {
    if (recording) {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      setRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    setAudioBlob(null)
    setDuration(0)
  }, [recording])

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (audioBlob) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleCancel}
          className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-danger hover:bg-blite-danger/10 transition-colors"
          title="Cancel"
        >
          <X size={18} />
        </button>
        <span className="text-xs text-blite-text-secondary font-mono">{formatDuration(duration)}</span>
        <div className="flex items-center gap-1">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-blite-text-muted/40"
              style={{ height: `${4 + Math.random() * 12}px` }}
            />
          ))}
        </div>
        <button
          onClick={handleSend}
          className="p-1.5 rounded-md gradient-accent text-white hover:opacity-90 transition-opacity"
          title="Send voice message"
        >
          <Send size={16} />
        </button>
      </div>
    )
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleCancel}
          className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-danger hover:bg-blite-danger/10 transition-colors"
          title="Cancel"
        >
          <X size={18} />
        </button>
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs text-red-400 font-mono">{formatDuration(duration)}</span>
        <button
          onClick={stopRecording}
          className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
          title="Stop recording"
        >
          <Square size={16} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={startRecording}
      className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
      title="Record voice message"
    >
      <Mic size={18} />
    </button>
  )
}
