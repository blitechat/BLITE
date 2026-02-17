import React, { useState, useEffect } from 'react'
import { Copy, Check, Loader2, Link, RefreshCw } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import { useUIStore } from '@renderer/stores/uiStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { inviteAPI } from '@renderer/services/api'
import type { Invite } from '@shared/types'

export default function InviteModal() {
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [maxUses, setMaxUses] = useState(0)
  const [expiresIn, setExpiresIn] = useState(86400)
  const [error, setError] = useState('')
  const closeModal = useUIStore((s) => s.closeModal)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const activeServer = servers.find((s) => s.id === activeServerId)

  const createInvite = async () => {
    if (!activeServerId) return

    setLoading(true)
    setError('')
    try {
      const newInvite = await inviteAPI.create(
        activeServerId,
        maxUses || undefined,
        expiresIn || undefined
      )
      setInvite(newInvite)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create invite.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    createInvite()
  }, [])

  const handleCopy = async () => {
    if (!invite) return
    const inviteUrl = `https://blite.chat/invite/${invite.code}`
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = inviteUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Modal title={`Invite to ${activeServer?.name || 'Room'}`} onClose={closeModal}>
      {error && (
        <div className="mb-4 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
          {error}
        </div>
      )}

      {invite ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
              Share this link to invite others
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center glass rounded-md px-3 py-2">
                <Link size={14} className="text-blite-text-muted mr-2 flex-shrink-0" />
                <span className="text-sm text-blite-text-primary font-mono truncate">
                  https://blite.chat/invite/{invite.code}
                </span>
              </div>
              <button
                onClick={handleCopy}
                className={`flex-shrink-0 px-4 py-2 rounded-md font-medium text-sm transition-all ${
                  copied
                    ? 'bg-blite-success text-white'
                    : 'gradient-accent text-white glow-accent-sm'
                }`}
              >
                {copied ? (
                  <span className="flex items-center gap-1">
                    <Check size={14} />
                    Copied
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Copy size={14} />
                    Copy
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="border-t border-blite-border pt-4 space-y-3">
            <p className="text-xs font-semibold text-blite-text-secondary uppercase tracking-wide">
              Invite Settings
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-blite-text-muted mb-1">Max Uses</label>
                <select
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="input-field text-sm"
                >
                  <option value={0}>No limit</option>
                  <option value={1}>1 use</option>
                  <option value={5}>5 uses</option>
                  <option value={10}>10 uses</option>
                  <option value={25}>25 uses</option>
                  <option value={50}>50 uses</option>
                  <option value={100}>100 uses</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-blite-text-muted mb-1">Expires After</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(Number(e.target.value))}
                  className="input-field text-sm"
                >
                  <option value={1800}>30 minutes</option>
                  <option value={3600}>1 hour</option>
                  <option value={21600}>6 hours</option>
                  <option value={43200}>12 hours</option>
                  <option value={86400}>1 day</option>
                  <option value={604800}>7 days</option>
                  <option value={0}>Never</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-blite-text-muted">
                Each invite link is unique
              </p>
              <button
                onClick={createInvite}
                disabled={loading}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Generate New Link
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin gradient-accent-text" />
        </div>
      ) : null}
    </Modal>
  )
}
