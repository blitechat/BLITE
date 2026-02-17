import React, { useState } from 'react'
import { Copy, Check, Shield, Download, AlertCircle } from 'lucide-react'
import { formatRecoveryKey } from '@renderer/services/e2ee'
import type { RecoverableKeys } from '@renderer/services/e2ee'

interface RecoveryKeyModalProps {
  recoveryKey: string
  recoverableKeys?: RecoverableKeys
  username?: string
  onConfirm: () => void
}

export default function RecoveryKeyModal({ recoveryKey, recoverableKeys, username, onConfirm }: RecoveryKeyModalProps) {
  const [copied, setCopied] = useState(false)
  const [keysCopied, setKeysCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [hasBackedUp, setHasBackedUp] = useState(false)

  const formatted = formatRecoveryKey(recoveryKey)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey)
      setCopied(true)
      setHasBackedUp(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text
      const el = document.getElementById('recovery-key-display')
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        setHasBackedUp(true)
      }
    }
  }

  const handleDownloadAllKeys = () => {
    const keysData = {
      recoveryKey,
      recoveryKeyFormatted: formatRecoveryKey(recoveryKey),
      ...(recoverableKeys || {}),
      timestamp: new Date().toISOString(),
      warning: 'KEEP THIS FILE SECURE! These are your private encryption keys. Anyone with access to this file can decrypt your messages.',
      instructions: 'To recover your account on a new device, you only need the recoveryKey field above. The other keys are included for advanced recovery options.'
    }
    const blob = new Blob([JSON.stringify(keysData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const filename = username ? `${username}_BLITE.txt` : `blite-backup-keys-${Date.now()}.txt`
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setHasBackedUp(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl mx-4 my-8 p-6 glass rounded-lg shadow-2xl" style={{ background: 'var(--blite-bg-secondary)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-blite-gradient-start/20">
            <Shield size={24} className="text-blite-gradient-start" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-blite-text-primary">Save Your Keys - This is Important!</h2>
            <p className="text-xs text-blite-text-secondary">You'll need these to log in on other devices</p>
          </div>
        </div>

        <div className="mb-4 p-4 rounded-md bg-red-500/10 border-2 border-red-500/40 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-400 font-semibold mb-1">⚠️ Don't Skip This Step!</p>
            <p className="text-xs text-red-300 leading-relaxed">
              If you lose your device or get a new phone WITHOUT saving these keys first, <strong>all your messages will be lost forever</strong>. No one can recover them - not even us!
            </p>
          </div>
        </div>

        {/* Recovery Key Section */}
        <div className={`mb-4 p-4 rounded-md border-2 transition-all ${
          hasBackedUp
            ? 'bg-green-500/5 border-green-500/40'
            : 'bg-blite-bg-primary border-orange-500/60 animate-pulse'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-blite-text-primary font-semibold flex items-center gap-2">
              {hasBackedUp ? '✅' : '🔑'} Your Recovery Key {!hasBackedUp && '- Save Now!'}
            </p>
          </div>

          <p
            id="recovery-key-display"
            className="font-mono text-base text-blite-text-primary tracking-wider break-all select-all leading-relaxed p-3 bg-blite-bg-secondary rounded border border-blite-glass-border mb-3"
          >
            {formatted}
          </p>

          <div className="flex gap-2 mb-2">
            <button
              onClick={handleCopy}
              className={`flex-1 px-4 py-3 rounded-md font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                copied
                  ? 'bg-green-500/20 text-green-400 border-2 border-green-500/40'
                  : 'bg-blite-gradient-start/20 text-blite-gradient-start hover:bg-blite-gradient-start/30 border-2 border-blite-gradient-start/40'
              }`}
            >
              {copied ? (
                <>
                  <Check size={16} className="text-green-400" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={16} />
                  Copy Recovery Key
                </>
              )}
            </button>
            <button
              onClick={handleDownloadAllKeys}
              className="flex-1 px-4 py-3 rounded-md font-medium text-sm bg-blite-gradient-end/20 text-blite-gradient-end hover:bg-blite-gradient-end/30 transition-all flex items-center justify-center gap-2 border-2 border-blite-gradient-end/40"
            >
              <Download size={16} />
              Download Complete Backup
            </button>
          </div>

          <p className="text-xs text-blite-text-muted">
            Download includes your recovery key + all private keys in one JSON file
          </p>
        </div>

        <div className="mb-4 p-3 rounded-md bg-blite-bg-hover border border-blite-glass-border">
          <p className="text-xs text-blite-text-secondary leading-relaxed mb-2">
            <strong>What are these?</strong>
          </p>
          <p className="text-xs text-blite-text-secondary mb-3">
            Think of your <strong>Recovery Key</strong> like a backup password. If you get a new phone or computer, type this in to get your messages back.
          </p>
          <p className="text-xs text-blite-text-secondary leading-relaxed mb-2">
            <strong>Where should I save them?</strong>
          </p>
          <ul className="text-xs text-blite-text-secondary space-y-1 ml-4 list-disc">
            <li>In your password manager (like 1Password, Bitwarden, LastPass)</li>
            <li>Screenshot and save to secure cloud storage (iCloud, Google Drive)</li>
            <li>Write it down on paper and keep it somewhere safe</li>
          </ul>
        </div>

        {!hasBackedUp && (
          <div className="mb-4 p-3 rounded-md bg-orange-500/10 border border-orange-500/40 text-center">
            <p className="text-sm text-orange-400 font-medium">
              👆 Please copy or download your recovery key first!
            </p>
          </div>
        )}

        <label className={`flex items-start gap-2 mb-4 cursor-pointer transition-opacity ${
          !hasBackedUp ? 'opacity-50 pointer-events-none' : ''
        }`}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={!hasBackedUp}
            className="mt-0.5 accent-blite-gradient-start"
          />
          <span className="text-sm text-blite-text-primary font-medium">
            I saved my recovery key somewhere safe (I understand I'll lose my messages if I don't)
          </span>
        </label>

        <button
          onClick={onConfirm}
          disabled={!hasBackedUp || !confirmed}
          className="btn-primary w-full h-11 text-sm disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          {!hasBackedUp ? '⬆️ Copy or Download Your Key First' : '✓ I Saved My Keys - Let\'s Go!'}
        </button>
      </div>
    </div>
  )
}
