import React, { useState, FormEvent } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import { useUIStore } from '@renderer/stores/uiStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { serverAPI } from '@renderer/services/api'

export default function JoinServerModal() {
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const closeModal = useUIStore((s) => s.closeModal)
  const addServer = useServerStore((s) => s.addServer)
  const setActiveServer = useServerStore((s) => s.setActiveServer)
  const setActiveView = useUIStore((s) => s.setActiveView)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return

    setLoading(true)
    setError('')

    try {
      let code = inviteCode.trim()
      if (code.includes('/')) {
        const parts = code.split('/')
        code = parts[parts.length - 1]
      }

      const result = await serverAPI.join(code)
      addServer(result.server)
      setActiveServer(result.server.id)
      setActiveView('servers')
      closeModal()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid or expired invite code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Join a Room" onClose={closeModal}>
      {error && (
        <div className="mb-4 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-lg gradient-accent flex items-center justify-center mx-auto mb-3 glow-accent">
            <ArrowRight size={22} className="text-white" />
          </div>
          <p className="text-sm text-blite-text-secondary">
            Enter an invite code to join an existing room.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
            Invite Code
          </label>
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className="input-field font-mono"
            placeholder="Enter invite code"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={closeModal} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!inviteCode.trim() || loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Joining...
              </>
            ) : (
              'Join Room'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
