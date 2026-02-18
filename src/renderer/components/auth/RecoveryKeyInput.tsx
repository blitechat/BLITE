import React, { useState } from 'react'
import { Shield, Loader2, AlertCircle } from 'lucide-react'
import { validateRecoveryKey, cleanRecoveryKey } from '@renderer/services/e2ee'

interface RecoveryKeyInputProps {
  onSubmit: (recoveryKey: string) => Promise<void>
  onGenerateNew?: () => Promise<void>  // Optional - only for migration, not for recovery
}

export default function RecoveryKeyInput({ onSubmit, onGenerateNew }: RecoveryKeyInputProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [generatingNew, setGeneratingNew] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const cleaned = cleanRecoveryKey(input)
    if (!validateRecoveryKey(cleaned)) {
      setError('Recovery key must be 48 hex characters (letters a-f and numbers 0-9)')
      return
    }

    setLoading(true)
    try {
      await onSubmit(cleaned)
    } catch (err: any) {
      setError(err?.message || 'Invalid recovery key or corrupted backup')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateNew = async () => {
    if (!confirm(
      "⚠️ Generate New Keys?\n\n" +
      "This will create fresh encryption keys, but you will LOSE ACCESS to all your old encrypted messages.\n\n" +
      "Only do this if you've permanently lost your recovery key.\n\n" +
      "Continue?"
    )) {
      return
    }

    setGeneratingNew(true)
    try {
      await onGenerateNew()
    } catch (err: any) {
      setError(err?.message || 'Failed to generate new keys')
      setGeneratingNew(false)
    }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-blite-gradient-start/20">
          <Shield size={24} className="text-blite-gradient-start" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-blite-text-primary">Restore Your Keys</h2>
          <p className="text-xs text-blite-text-secondary">New device detected. Enter your recovery key to restore encryption.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30">
          <AlertCircle size={16} className="text-blite-danger flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blite-danger">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
            Recovery Key
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter your 48-character recovery key"
            className="input-field font-mono text-sm tracking-wider"
            autoFocus
            disabled={loading}
          />
          <p className="mt-1 text-xs text-blite-text-muted">
            48 hex characters. Spaces are ignored.
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="submit"
            disabled={loading || generatingNew || !input.trim()}
            className="w-full btn-primary h-10 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Restoring...
              </>
            ) : (
              'Restore Keys'
            )}
          </button>

          {onGenerateNew && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-blite-glass-border"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-blite-bg-secondary text-blite-text-muted">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateNew}
                disabled={loading || generatingNew}
                className="w-full px-4 py-2 rounded-md border border-blite-danger/30 text-sm text-blite-danger hover:bg-blite-danger/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generatingNew ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} />
                    Lost Key? Generate New Keys
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </form>

      {onGenerateNew && (
        <p className="mt-4 text-xs text-center text-blite-text-muted">
          Generating new keys will permanently delete access to old messages.
        </p>
      )}
    </div>
  )
}
