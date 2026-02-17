import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { useAuthStore } from '@renderer/stores/authStore'
import { connectSocket, disconnectSocket, getSocket } from '@renderer/services/socket'

export function useSocket(): Socket | null {
  const socketRef = useRef<Socket | null>(null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (isAuthenticated && token) {
      try {
        const socket = connectSocket()
        socketRef.current = socket
      } catch (err) {
        console.error('Failed to connect socket:', err)
      }
    }

    return () => {
      if (!isAuthenticated) {
        disconnectSocket()
        socketRef.current = null
      }
    }
  }, [isAuthenticated, token])

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket()
      socketRef.current = null
    }
  }, [isAuthenticated])

  return socketRef.current ?? getSocket()
}
