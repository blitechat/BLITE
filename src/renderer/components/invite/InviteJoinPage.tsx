import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle, XCircle, Shield } from 'lucide-react'
import { useAuthStore } from '@renderer/stores/authStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { serverAPI, inviteAPI } from '@renderer/services/api'
import logoImg from '@renderer/assets/logo.png'

export default function InviteJoinPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const addServer = useServerStore((s) => s.addServer)
  const setActiveServer = useServerStore((s) => s.setActiveServer)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const [status, setStatus] = useState<'loading' | 'joining' | 'success' | 'error'>('loading')
  const [serverName, setServerName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      // Save invite code so we can rejoin after login
      if (code) localStorage.setItem('blite_pending_invite', code)
      navigate('/login', { replace: true })
      return
    }
    if (!code) {
      setStatus('error')
      setError('No invite code provided.')
      return
    }

    joinServer(code)
  }, [code, isAuthenticated, isLoading])

  const joinServer = async (inviteCode: string) => {
    setStatus('joining')
    try {
      const result = await serverAPI.join(inviteCode)
      addServer(result.server)
      setActiveServer(result.server.id)
      setActiveView('servers')
      setServerName(result.server.name)
      setStatus('success')

      // Navigate directly to the joined server
      setTimeout(() => {
        navigate(`/app/${result.server.id}`, { replace: true })
      }, 1200)
    } catch (err: any) {
      setStatus('error')
      setError(err?.response?.data?.message || 'Invalid or expired invite link.')
    }
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-blite-bg-primary relative overflow-hidden">
      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: 'var(--blite-gradient-start)' }} />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: 'var(--blite-gradient-end)' }} />

      <div className="relative z-10 flex flex-col items-center text-center px-6">
        <img src={logoImg} alt="BLITE" className="w-16 h-16 mb-6" />
        <h1 className="text-xl font-bold gradient-accent-text tracking-widest mb-6">BLITE</h1>

        {(status === 'loading' || status === 'joining') && (
          <>
            <Loader2 size={28} className="animate-spin gradient-accent-text mb-4" />
            <p className="text-blite-text-secondary text-sm">Joining room...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={28} className="text-blite-success mb-4" />
            <p className="text-blite-text-primary font-medium">Joined {serverName}!</p>
            <p className="text-blite-text-secondary text-sm mt-1">Redirecting...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={28} className="text-blite-danger mb-4" />
            <p className="text-blite-text-primary font-medium">Failed to join</p>
            <p className="text-blite-text-secondary text-sm mt-1">{error}</p>
            <button
              onClick={() => navigate('/app', { replace: true })}
              className="btn-primary mt-6 text-sm"
            >
              Go to App
            </button>
          </>
        )}
      </div>
    </div>
  )
}
