import React, { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Shield, Eye, EyeOff, Loader2, Lock, ArrowRight, Key, MessageSquare, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '@renderer/stores/authStore'
import { authAPI, keyAPI } from '@renderer/services/api'
import { storePrivateKey } from '@renderer/services/crypto'
import { connectSocket } from '@renderer/services/socket'
import {
  generateKeyBundle,
  bundleToUploadable,
  serializeKeyBundle,
  storeKeyBundle,
  generateRecoveryKey,
  encryptKeysForRecovery,
} from '@renderer/services/e2ee'
import type { RecoverableKeys } from '@renderer/services/e2ee'
import RecoveryKeyModal from './RecoveryKeyModal'
import logoImg from '@renderer/assets/logo.png'
import naclUtil from 'tweetnacl-util'

const { encodeBase64 } = naclUtil

type Step = 'info' | 'education' | 'generating' | 'recovery'

export default function RegisterForm() {
  const [step, setStep] = useState<Step>('info')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<string>('')
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [recoverableKeys, setRecoverableKeys] = useState<RecoverableKeys | null>(null)
  const [pendingNav, setPendingNav] = useState<string>('/app')
  const [pendingAuthData, setPendingAuthData] = useState<{ user: any; token: string } | null>(null)
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const setPrivateKey = useAuthStore((s) => s.setPrivateKey)
  const setSigningKey = useAuthStore((s) => s.setSigningKey)
  const setSignedPreKeySecret = useAuthStore((s) => s.setSignedPreKeySecret)
  const setKeyBundleLoaded = useAuthStore((s) => s.setKeyBundleLoaded)

  const handleInfoSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim() || !displayName.trim() || !password || !confirmPassword) {
      setError('Please fill in all required fields.')
      return
    }

    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    // Check password strength (must match server-side requirements)
    if (!/(?=.*[a-z])/.test(password)) {
      setError('Password must contain at least one lowercase letter.')
      return
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      setError('Password must contain at least one uppercase letter.')
      return
    }
    if (!/(?=.*\d)/.test(password)) {
      setError('Password must contain at least one number.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    // Move to education step
    setStep('education')
  }

  const handleStartGeneration = async () => {
    setStep('generating')
    setLoading(true)
    setError('')

    try {
      // Generate full E2EE key bundle
      setLoadingStage('Generating encryption keys...')
      await new Promise((resolve) => setTimeout(resolve, 500)) // Brief pause for UX
      const bundle = generateKeyBundle()
      const uploadable = bundleToUploadable(bundle)

      setLoadingStage('Creating your account...')
      const response = await authAPI.register({
        username: username.trim(),
        displayName: displayName.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        password,
        publicKey: encodeBase64(bundle.identityKeyPair.publicKey),
        signingKey: encodeBase64(bundle.signingKeyPair.publicKey),
        keyBundle: uploadable,
        ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
      })

      // Store private key securely (legacy compat - identity secret key)
      await storePrivateKey(bundle.identityKeyPair.secretKey)
      setPrivateKey(bundle.identityKeyPair.secretKey)
      setSigningKey(bundle.signingKeyPair.secretKey)
      setSignedPreKeySecret(bundle.signedPreKey.keyPair.secretKey)

      // Store full key bundle locally
      const serialized = serializeKeyBundle(bundle)
      await storeKeyBundle(serialized)
      setKeyBundleLoaded(true)

      // Store token but DON'T set user yet (to prevent navigation)
      localStorage.setItem('blite_token', response.token)

      // Save auth data to apply AFTER recovery key is confirmed
      setPendingAuthData({ user: response.user, token: response.token })

      // Generate recovery key and encrypt private keys
      setLoadingStage('Generating recovery key...')
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

      // Upload encrypted recovery blob to server
      try {
        await keyAPI.uploadRecovery(recoveryBlob)
      } catch (err) {
        console.error('Failed to upload recovery blob:', err)
      }

      // Determine navigation target
      const pendingInvite = localStorage.getItem('blite_pending_invite')
      if (pendingInvite) {
        localStorage.removeItem('blite_pending_invite')
        setPendingNav(`/invite/${pendingInvite}`)
      }

      // Show recovery key modal before navigating
      setRecoveryKey(recKey)
      setRecoverableKeys(recoverableKeys)
      setStep('recovery')
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.message || 'Registration failed. Please try again.'
      setError(message)
      setStep('info') // Go back to info step on error
    } finally {
      setLoading(false)
    }
  }

  const handleRecoveryConfirm = () => {
    // Now that recovery key is saved, complete authentication
    if (pendingAuthData) {
      setUser(pendingAuthData.user, pendingAuthData.token)
      connectSocket()
    }
    setRecoveryKey(null)
    setRecoverableKeys(null)
    navigate(pendingNav)
  }

  // Recovery key modal
  if (step === 'recovery' && recoveryKey) {
    return <RecoveryKeyModal recoveryKey={recoveryKey} recoverableKeys={recoverableKeys || undefined} username={username} onConfirm={handleRecoveryConfirm} />
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-blite-bg-primary relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--blite-gradient-start)' }} />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: 'var(--blite-gradient-end)' }} />

      <div className="w-full max-w-lg mx-4 relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src={logoImg} alt="BLITE" className="w-32 h-32 mb-4" />
          <h1 className="text-3xl font-bold gradient-accent-text tracking-tight">BLITE</h1>
          <p className="mt-1 text-sm text-blite-text-secondary">Encrypted. Private. Yours.</p>
        </div>

        {/* Step Indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className={`h-2 w-2 rounded-full transition-all ${step === 'info' ? 'bg-blite-gradient-start w-8' : 'bg-blite-text-muted'}`} />
          <div className={`h-2 w-2 rounded-full transition-all ${step === 'education' ? 'bg-blite-gradient-start w-8' : 'bg-blite-text-muted'}`} />
          <div className={`h-2 w-2 rounded-full transition-all ${step === 'generating' ? 'bg-blite-gradient-start w-8' : 'bg-blite-text-muted'}`} />
          <div className={`h-2 w-2 rounded-full transition-all ${step === 'recovery' ? 'bg-blite-gradient-start w-8' : 'bg-blite-text-muted'}`} />
        </div>

        {/* Card */}
        <div className="p-6 glass rounded-lg shadow-2xl glow-accent-sm" style={{ background: 'var(--blite-bg-secondary)' }}>
          {step === 'info' && (
            <>
              <h2 className="text-xl font-semibold text-blite-text-primary mb-1">Create an account</h2>
              <p className="text-sm text-blite-text-secondary mb-5">Let's get you started</p>

              {error && (
                <div className="mb-4 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleInfoSubmit} className="space-y-3.5">
                <div>
                  <label htmlFor="username" className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="input-field"
                    placeholder="your_username"
                    autoFocus
                  />
                </div>

                <div>
                  <label htmlFor="displayName" className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
                    Display Name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input-field"
                    placeholder="How others see you"
                  />
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
                    Email <span className="normal-case font-normal text-blite-text-muted">(optional)</span>
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="phoneNumber" className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
                    Phone Number <span className="normal-case font-normal text-blite-text-muted">(optional)</span>
                  </label>
                  <input
                    id="phoneNumber"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="input-field"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field pr-10"
                      placeholder="Min 8 chars, uppercase, lowercase, number"
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

                <div>
                  <label htmlFor="confirmPassword" className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field"
                    placeholder="Repeat your password"
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full flex items-center justify-center gap-2 h-10"
                >
                  Continue
                  <ArrowRight size={16} />
                </button>
              </form>
            </>
          )}

          {step === 'education' && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-full bg-blite-gradient-start/20">
                  <Shield size={28} className="text-blite-gradient-start" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-blite-text-primary">How BLITE Keeps Your Messages Secret</h2>
                  <p className="text-xs text-blite-text-secondary">Understanding your encryption keys (super simple!)</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                {/* What are encryption keys */}
                <div className="p-4 glass rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blite-gradient-start/10 flex-shrink-0">
                      <Key size={20} className="text-blite-gradient-start" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-blite-text-primary mb-1.5">Two types of keys</h3>
                      <p className="text-sm text-blite-text-secondary leading-relaxed mb-2">
                        <strong className="text-blite-text-primary">Public Key</strong> 🔓 - Like your locker number. Everyone can see it. People use this to send you secret messages.
                      </p>
                      <p className="text-sm text-blite-text-secondary leading-relaxed">
                        <strong className="text-blite-text-primary">Private Key</strong> 🔑 - Like your locker combination. Only you know it. You use this to read your messages. <span className="text-orange-400">Never share this!</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* How it works */}
                <div className="p-4 glass rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blite-gradient-end/10 flex-shrink-0">
                      <MessageSquare size={20} className="text-blite-gradient-end" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-blite-text-primary mb-1.5">How sending a message works</h3>
                      <div className="text-sm text-blite-text-secondary leading-relaxed space-y-1.5">
                        <p>1. You write: "Hello!"</p>
                        <p>2. Your app scrambles it using your friend's public key</p>
                        <p>3. It becomes gibberish: "kjsd8f234jksd"</p>
                        <p>4. Only your friend's private key can unscramble it</p>
                        <p className="text-blite-success font-medium pt-1">Even you can't read it anymore! That's the magic.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Your keys stay local */}
                <div className="p-4 glass rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10 flex-shrink-0">
                      <ShieldCheck size={20} className="text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-blite-text-primary mb-1.5">Your private keys stay on YOUR device</h3>
                      <p className="text-sm text-blite-text-secondary leading-relaxed mb-2">
                        Your private keys never leave your phone or computer. Not even BLITE can see them.
                      </p>
                      <p className="text-sm text-blite-text-secondary leading-relaxed">
                        You'll get a <strong className="text-blite-text-primary">recovery key</strong> (like a backup code) that lets you restore your keys if you get a new device or lose access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-4 p-3 rounded-md bg-blite-bg-hover border border-blite-glass-border">
                <p className="text-xs text-blite-text-muted text-center">
                  Next, we'll create your encryption keys. Takes just a few seconds!
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('info')}
                  className="flex-1 px-4 py-2 rounded-md border border-blite-glass-border text-sm text-blite-text-secondary hover:bg-blite-bg-hover transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleStartGeneration}
                  className="flex-1 btn-primary text-sm flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 'generating' && (
            <>
              <div className="text-center py-8">
                <div className="mb-6">
                  <Loader2 size={48} className="animate-spin text-blite-gradient-start mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-blite-text-primary mb-2">{loadingStage || 'Setting up your account...'}</h2>
                  <p className="text-sm text-blite-text-secondary">
                    {loadingStage.includes('encryption') && 'Creating your unique identity, signing, and prekeys for secure messaging'}
                    {loadingStage.includes('account') && 'Registering your account and uploading your public keys'}
                    {loadingStage.includes('recovery') && 'Creating a recovery key to restore access if you lose your device'}
                  </p>
                </div>

                <div className="space-y-2 text-left max-w-xs mx-auto">
                  <div className="flex items-center gap-2 text-sm text-blite-text-secondary">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      loadingStage.includes('encryption') || loadingStage.includes('account') || loadingStage.includes('recovery')
                        ? 'bg-blite-success text-white' : 'border-2 border-blite-text-muted'
                    }`}>
                      {(loadingStage.includes('account') || loadingStage.includes('recovery')) && <CheckCircle2 size={14} />}
                    </div>
                    <span>Generate encryption keys</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-blite-text-secondary">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      loadingStage.includes('account') || loadingStage.includes('recovery')
                        ? 'bg-blite-success text-white' : 'border-2 border-blite-text-muted'
                    }`}>
                      {loadingStage.includes('recovery') && <CheckCircle2 size={14} />}
                    </div>
                    <span>Create your account</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-blite-text-secondary">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      loadingStage.includes('recovery')
                        ? 'bg-blite-success text-white' : 'border-2 border-blite-text-muted'
                    }`}>
                      {step === 'recovery' && <CheckCircle2 size={14} />}
                    </div>
                    <span>Generate recovery key</span>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm text-center">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-blite-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="gradient-accent-text font-medium hover:opacity-80 transition-opacity">
            Log In
          </Link>
        </p>
      </div>
    </div>
  )
}
