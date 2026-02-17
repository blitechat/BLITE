import { useEffect, useRef, useCallback } from 'react'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { updatePresence } from '@renderer/services/socket'
import type { UserStatus } from '@shared/types'

const IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export function usePresence() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const presences = usePresenceStore((s) => s.presences)
  const setPresence = usePresenceStore((s) => s.setPresence)
  const user = useAuthStore((s) => s.user)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentStatusRef = useRef<UserStatus>('online')
  const manualStatusRef = useRef<UserStatus | null>(null)

  const resetIdleTimer = useCallback(() => {
    if (manualStatusRef.current === 'dnd') return

    if (currentStatusRef.current === 'idle') {
      currentStatusRef.current = 'online'
      updatePresence('online')
      if (user) {
        setPresence(user.id, 'online')
      }
    }

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }

    idleTimerRef.current = setTimeout(() => {
      if (manualStatusRef.current === 'dnd') return
      currentStatusRef.current = 'idle'
      updatePresence('idle')
      if (user) {
        setPresence(user.id, 'idle')
      }
    }, IDLE_TIMEOUT)
  }, [user, setPresence])

  useEffect(() => {
    if (!isAuthenticated) return

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach((event) => window.addEventListener(event, resetIdleTimer))
    resetIdleTimer()

    updatePresence('online')

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetIdleTimer))
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
    }
  }, [isAuthenticated, resetIdleTimer])

  const getStatus = useCallback(
    (userId: string): UserStatus => {
      return presences[userId] || 'offline'
    },
    [presences]
  )

  const setManualStatus = useCallback(
    (status: UserStatus) => {
      manualStatusRef.current = status === 'online' ? null : status
      currentStatusRef.current = status
      updatePresence(status)
      if (user) {
        setPresence(user.id, status)
      }
    },
    [user, setPresence]
  )

  return { getStatus, setManualStatus }
}
