import React, { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@renderer/stores/authStore'
import { authAPI, keyAPI, userAPI } from '@renderer/services/api'
import { loadPrivateKey, storePrivateKey } from '@renderer/services/crypto'
import { connectSocket } from '@renderer/services/socket'
import {
  loadKeyBundle,
  deserializeKeyBundle,
  storeKeyBundle,
  decryptKeysFromRecovery,
  generateKeyBundle,
  bundleToUploadable,
  serializeKeyBundle,
  generateRecoveryKey,
  encryptKeysForRecovery,
  deriveSessionStoreKey,
  initSessionDB,
} from '@renderer/services/e2ee'
import type { RecoverableKeys } from '@renderer/services/e2ee'
import RecoveryKeyInput from './RecoveryKeyInput'
import RecoveryKeyModal from './RecoveryKeyModal'
import logoImg from '@renderer/assets/logo.png'
import naclUtil from 'tweetnacl-util'
import nacl from 'tweetnacl'

const { decodeBase64, encodeBase64 } = naclUtil

export default function LoginForm() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsRecovery, setNeedsRecovery] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [migrationLoading, setMigrationLoading] = useState(false)
  const [migrationError, setMigrationError] = useState('')
  const [migrationRecoveryKey, setMigrationRecoveryKey] = useState<string | null>(null)
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const setPrivateKey = useAuthStore((s) => s.setPrivateKey)
  const setSigningKey = useAuthStore((s) => s.setSigningKey)
  const setSignedPreKeySecret = useAuthStore((s) => s.setSignedPreKeySecret)
  const setKeyBundleLoaded = useAuthStore((s) => s.setKeyBundleLoaded)

  const finalizeLogin = () => {
    const pendingInvite = localStorage.getItem('blite_pending_invite')
    if (pendingInvite) {
      localStorage.removeItem('blite_pending_invite')
      navigate(`/invite/${pendingInvite}`)
    } else {
      navigate('/app')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!identifier.trim() || !password.trim()) {
      setError('Please fill in all fields.')
      return
    }

    setLoading(true)
    try {
      const response = await authAPI.login({ email: identifier.trim(), password })
      localStorage.setItem('blite_token', response.token)
      setUser(response.user, response.token)

      // Try to load key bundle from local storage
      const storedBundle = await loadKeyBundle()
      console.log('[LoginForm] Stored bundle:', storedBundle ? 'found' : 'not found')

      if (storedBundle) {
        // Bundle found locally - restore keys
        const bundle = deserializeKeyBundle(storedBundle)
        setPrivateKey(bundle.identityKeyPair.secretKey)
        setSigningKey(bundle.signingKeyPair.secretKey)
        setSignedPreKeySecret(bundle.signedPreKey.keyPair.secretKey)

        // Initialize session DB before marking bundle as loaded
        try {
          const storeKey = await deriveSessionStoreKey(bundle.identityKeyPair.secretKey)
          await initSessionDB(storeKey)
        } catch (dbErr) {
          console.error('[LoginForm] Session DB init failed:', dbErr)
        }

        setKeyBundleLoaded(true)

        // Also store legacy private key for backward compat
        await storePrivateKey(bundle.identityKeyPair.secretKey)

        connectSocket()
        finalizeLogin()
      } else {
        // No local bundle - try loading legacy private key
        const legacyKey = await loadPrivateKey()
        console.log('[LoginForm] Legacy key:', legacyKey ? 'found' : 'not found')
        if (legacyKey) {
          setPrivateKey(legacyKey)
          connectSocket()

          // Check if user has a key bundle on server
          try {
            await keyAPI.getBundle(response.user.id)
            // Bundle exists on server but not locally = new device
            console.log('[LoginForm] Recovery needed - bundle exists on server')
            setNeedsRecovery(true)
          } catch {
            // No bundle on server either = existing user pre-E2EE, needs migration
            console.log('[LoginForm] Migration needed - no bundle on server')
            setNeedsMigration(true)
          }
        } else {
          // No local keys at all - check if recovery is available
          connectSocket()
          try {
            await keyAPI.getRecovery()
            // Recovery blob exists - show recovery input
            console.log('[LoginForm] Recovery needed - no local keys but recovery blob exists')
            setNeedsRecovery(true)
          } catch (err: any) {
            // No recovery data = existing user pre-E2EE, needs migration
            console.log('[LoginForm] Recovery check failed:', err?.response?.status, err?.message)
            if (err?.response?.status === 404) {
              console.log('[LoginForm] Migration needed - no recovery blob on server')
              setNeedsMigration(true)
            } else {
              console.error('[LoginForm] Unexpected error checking recovery:', err)
              // Assume migration needed as fallback
              setNeedsMigration(true)
            }
          }
        }
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.message || 'Login failed. Please try again.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleRecovery = async (recoveryKey: string) => {
    // Download recovery blob from server
    const blob = await keyAPI.getRecovery()
    const keys = decryptKeysFromRecovery(recoveryKey, blob)

    // Restore keys
    const identitySecret = decodeBase64(keys.identitySecretKey)
    const signingSecret = decodeBase64(keys.signingSecretKey)
    const signedPreKeySecret = decodeBase64(keys.signedPreKeySecret)

    setPrivateKey(identitySecret)
    setSigningKey(signingSecret)
    setSignedPreKeySecret(signedPreKeySecret)
    await storePrivateKey(identitySecret)

    // Store as full key bundle locally
    const serialized = {
      identityPublicKey: keys.identityPublicKey,
      identitySecretKey: keys.identitySecretKey,
      signingPublicKey: keys.signingPublicKey,
      signingSecretKey: keys.signingSecretKey,
      signedPreKeyPublic: keys.signedPreKeyPublic,
      signedPreKeySecret: keys.signedPreKeySecret,
      signedPreKeyId: keys.signedPreKeyId,
      signedPreKeySig: keys.signedPreKeySig,
      oneTimePreKeys: [],
    }
    await storeKeyBundle(serialized)

    // Initialize session DB before marking bundle as loaded
    try {
      const storeKey = await deriveSessionStoreKey(identitySecret)
      await initSessionDB(storeKey)
    } catch (dbErr) {
      console.error('[LoginForm] Session DB init failed after recovery:', dbErr)
    }

    setKeyBundleLoaded(true)

    // Sync identity public key to users table (used by voice E2EE key exchange)
    try {
      await userAPI.updateProfile({ publicKey: keys.identityPublicKey })
    } catch (err) {
      console.warn('[LoginForm] Failed to sync publicKey to profile:', err)
    }

    // Generate fresh OTPs for the new device and upload
    try {
      const newBundle = generateKeyBundle()
      const uploadable = bundleToUploadable(newBundle)
      // Only upload new prekeys, keep existing identity/signing
      await keyAPI.uploadPrekeys(uploadable.oneTimePreKeys)
    } catch {
      // Non-critical
    }

    setNeedsRecovery(false)
    finalizeLogin()
  }

  const handleMigration = async () => {
    setMigrationLoading(true)
    setMigrationError('')
    try {
      // Existing user without key bundle - generate one now
      const bundle = generateKeyBundle()
      const uploadable = bundleToUploadable(bundle)

      // Upload key bundle
      await keyAPI.uploadBundle(uploadable)

      // Store locally
      await storePrivateKey(bundle.identityKeyPair.secretKey)
      setPrivateKey(bundle.identityKeyPair.secretKey)
      setSigningKey(bundle.signingKeyPair.secretKey)
      setSignedPreKeySecret(bundle.signedPreKey.keyPair.secretKey)

      const serialized = serializeKeyBundle(bundle)
      await storeKeyBundle(serialized)

      // Initialize session DB before marking bundle as loaded
      try {
        const storeKey = await deriveSessionStoreKey(bundle.identityKeyPair.secretKey)
        await initSessionDB(storeKey)
      } catch (dbErr) {
        console.error('[LoginForm] Session DB init failed after migration:', dbErr)
      }

      setKeyBundleLoaded(true)

      // Sync new identity public key to users table (used by voice E2EE key exchange)
      try {
        await userAPI.updateProfile({ publicKey: encodeBase64(bundle.identityKeyPair.publicKey) })
      } catch (err) {
        console.warn('[LoginForm] Failed to sync publicKey to profile:', err)
      }

      // Generate recovery key
      const recKey = generateRecoveryKey()
      const recoverableKeys: RecoverableKeys = {
        identitySecretKey: encodeBase64(bundle.identityKeyPair.secretKey),
        identityPublicKey: encodeBase64(bundle.identityKeyPair.publicKey),
        signingSecretKey: encodeBase64(bundle.signingKeyPair.secretKey),
        signingPublicKey: encodeBase64(bundle.signingKeyPair.publicKey),
        signedPreKeySecret: encodeBase64(bundle.signedPreKey.keyPair.secretKey),
        signedPreKeyPublic: encodeBase64(bundle.signedPreKey.keyPair.publicKey),
        signedPreKeyId: bundle.signedPreKey.id,
        signedPreKeySig: encodeBase64(bundle.signedPreKey.signature),
      }
      const recoveryBlob = encryptKeysForRecovery(recKey, recoverableKeys)
      try {
        await keyAPI.uploadRecovery(recoveryBlob)
      } catch {
        // Non-critical
      }

      setNeedsMigration(false)
      setMigrationRecoveryKey(recKey)
    } catch (err: any) {
      console.error('[LoginForm] Migration failed:', err)
      setMigrationError(err?.response?.data?.error || err?.message || 'Key generation failed. Please try again.')
    } finally {
      setMigrationLoading(false)
    }
  }

  const handleGenerateNewKeys = async () => {
    // User lost recovery key - generate fresh keys (loses access to old messages)
    const bundle = generateKeyBundle()
    const uploadable = bundleToUploadable(bundle)

    // Upload new key bundle to server
    await keyAPI.uploadBundle(uploadable)

    // Store locally
    await storePrivateKey(bundle.identityKeyPair.secretKey)
    setPrivateKey(bundle.identityKeyPair.secretKey)
    setSigningKey(bundle.signingKeyPair.secretKey)
    setSignedPreKeySecret(bundle.signedPreKey.keyPair.secretKey)

    const serialized = serializeKeyBundle(bundle)
    await storeKeyBundle(serialized)

    // Initialize session DB
    try {
      const storeKey = await deriveSessionStoreKey(bundle.identityKeyPair.secretKey)
      await initSessionDB(storeKey)
    } catch (dbErr) {
      console.error('[LoginForm] Session DB init failed after generating new keys:', dbErr)
    }

    setKeyBundleLoaded(true)

    // Sync new identity public key to users table (used by voice E2EE key exchange)
    try {
      await userAPI.updateProfile({ publicKey: encodeBase64(bundle.identityKeyPair.publicKey) })
    } catch (err) {
      console.warn('[LoginForm] Failed to sync publicKey to profile:', err)
    }

    // Generate recovery key for the new bundle
    const recKey = generateRecoveryKey()
    const blob = encryptKeysForRecovery(recKey, {
      identityPublicKey: serialized.identityPublicKey,
      identitySecretKey: serialized.identitySecretKey,
      signingPublicKey: serialized.signingPublicKey,
      signingSecretKey: serialized.signingSecretKey,
      signedPreKeyPublic: serialized.signedPreKeyPublic,
      signedPreKeySecret: serialized.signedPreKeySecret,
      signedPreKeyId: serialized.signedPreKeyId,
      signedPreKeySig: serialized.signedPreKeySig,
    })
    await keyAPI.uploadRecovery(blob)

    setNeedsRecovery(false)
    setMigrationRecoveryKey(recKey)
  }

  if (migrationRecoveryKey) {
    return (
      <RecoveryKeyModal
        recoveryKey={migrationRecoveryKey}
        username={user?.username}
        onConfirm={() => {
          setMigrationRecoveryKey(null)
          finalizeLogin()
        }}
      />
    )
  }

  if (needsRecovery) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-blite-bg-primary relative overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--blite-gradient-start)' }} />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--blite-gradient-end)' }} />
        <div className="relative z-10">
          <RecoveryKeyInput onSubmit={handleRecovery} onGenerateNew={handleGenerateNewKeys} />
        </div>
      </div>
    )
  }

  if (needsMigration) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-blite-bg-primary relative overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--blite-gradient-start)' }} />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--blite-gradient-end)' }} />
        <div className="relative z-10 w-full max-w-sm mx-4 p-6 glass rounded-lg shadow-2xl" style={{ background: 'var(--blite-bg-secondary)' }}>
          <h2 className="text-lg font-semibold text-blite-text-primary mb-2">Encryption Upgrade</h2>
          <p className="text-sm text-blite-text-secondary mb-4">
            BLITE now uses enhanced end-to-end encryption. We need to generate new encryption keys for your account. Your existing messages will remain readable.
          </p>
          {migrationError && (
            <div className="mb-4 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
              {migrationError}
            </div>
          )}
          <button
            onClick={handleMigration}
            disabled={migrationLoading}
            className="btn-primary w-full h-10 text-sm flex items-center justify-center gap-2"
          >
            {migrationLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating Keys...
              </>
            ) : (
              'Generate Encryption Keys'
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-blite-bg-primary relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--blite-gradient-start)' }} />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-25 blur-3xl" style={{ background: 'var(--blite-gradient-end)' }} />

      <div className="w-full max-w-sm mx-4 relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src={logoImg} alt="BLITE" className="w-32 h-32 mb-4" />
          <h1 className="text-3xl font-bold gradient-accent-text tracking-tight">BLITE</h1>
          <p className="mt-1 text-sm text-blite-text-secondary">Encrypted. Private. Yours.</p>
        </div>

        {/* Card */}
        <div className="p-6 glass rounded-xl shadow-2xl glow-accent" style={{ background: 'var(--blite-bg-secondary)' }}>
          <h2 className="text-xl font-semibold text-blite-text-primary mb-1">Welcome back</h2>
          <p className="text-sm text-blite-text-secondary mb-6">Sign in to your account</p>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
                Username or Email
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="input-field"
                placeholder="your_username or you@example.com"
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Your password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-blite-text-muted hover:text-blite-text-primary transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 h-10"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                'Log In'
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-blite-text-secondary">
          Don't have an account?{' '}
          <Link to="/register" className="gradient-accent-text font-medium hover:opacity-80 transition-opacity">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
