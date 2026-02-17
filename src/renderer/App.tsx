import React, { useEffect } from 'react'
import { MemoryRouter, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@renderer/stores/authStore'
import { authAPI } from '@renderer/services/api'
import { loadPrivateKey } from '@renderer/services/crypto'
import {
  loadKeyBundle,
  deserializeKeyBundle,
  deriveSessionStoreKey,
  initSessionDB,
  clearAllSenderKeys,
  needsOTPReplenishment,
  generateOneTimePreKeys,
} from '@renderer/services/e2ee'
import { keyAPI } from '@renderer/services/api'
import naclUtil from 'tweetnacl-util'
import { connectSocket } from '@renderer/services/socket'
import { subscribeToPush } from '@renderer/services/notifications'
import LoginForm from '@renderer/components/auth/LoginForm'
import RegisterForm from '@renderer/components/auth/RegisterForm'
import AppLayout from '@renderer/components/layout/AppLayout'
import LandingPage from '@renderer/components/landing/LandingPage'
import PrivacyPolicyPage from '@renderer/components/legal/PrivacyPolicyPage'
import TermsOfServicePage from '@renderer/components/legal/TermsOfServicePage'
import InviteJoinPage from '@renderer/components/invite/InviteJoinPage'
import UpdateNotification from '@renderer/components/update/UpdateNotification'
import { Loader2, Shield } from 'lucide-react'
import logoImg from '@renderer/assets/logo.png'

const isElectron = typeof window !== 'undefined' && !!window.api

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-blite-bg-primary relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: 'var(--blite-gradient-start)' }} />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: 'var(--blite-gradient-end)' }} />

        <div className="relative z-10 flex flex-col items-center">
          <img src={logoImg} alt="BLITE" className="w-16 h-16 mb-6" />
          <h1 className="text-xl font-bold gradient-accent-text tracking-widest mb-4">BLITE</h1>
          <Loader2 size={24} className="animate-spin text-blite-text-muted mb-3" />
          <p className="text-sm text-blite-text-secondary">Restoring your session...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={isElectron ? '/login' : '/'} replace />
  }

  return <>{children}</>
}

export default function App() {
  const setUser = useAuthStore((s) => s.setUser)
  const setPrivateKey = useAuthStore((s) => s.setPrivateKey)
  const setSigningKey = useAuthStore((s) => s.setSigningKey)
  const setSignedPreKeySecret = useAuthStore((s) => s.setSignedPreKeySecret)
  const setKeyBundleLoaded = useAuthStore((s) => s.setKeyBundleLoaded)
  const setLoading = useAuthStore((s) => s.setLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const keyBundleLoaded = useAuthStore((s) => s.keyBundleLoaded)

  // Auto-login on mount: check for stored token
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('blite_token')
      if (!token) {
        setLoading(false)
        return
      }

      try {
        // Temporarily set token so the interceptor picks it up
        useAuthStore.setState({ token })

        const response = await authAPI.me()
        setUser(response.user, token)

        // Load private key from secure storage
        let privateKey = await loadPrivateKey()

        // Load E2EE key bundle if available
        let bundleLoaded = false
        try {
          const storedBundle = await loadKeyBundle()
          if (storedBundle) {
            const bundle = deserializeKeyBundle(storedBundle)
            // Key bundle takes priority over legacy private key
            privateKey = bundle.identityKeyPair.secretKey
            setPrivateKey(privateKey)
            setSigningKey(bundle.signingKeyPair.secretKey)
            setSignedPreKeySecret(bundle.signedPreKey.keyPair.secretKey)

            // Initialize IndexedDB session store BEFORE marking bundle as loaded
            try {
              const storeKey = await deriveSessionStoreKey(bundle.identityKeyPair.secretKey)
              await initSessionDB(storeKey)

              // One-time migration: clear stale sender key states to force redistribution
              const SK_MIGRATION = 'blite_sk_migration_v1'
              if (!localStorage.getItem(SK_MIGRATION)) {
                await clearAllSenderKeys()
                localStorage.setItem(SK_MIGRATION, Date.now().toString())
                console.log('[App] Cleared stale sender key states (migration v1)')
              }
            } catch (dbErr) {
              console.error('Session DB init failed:', dbErr)
            }

            setKeyBundleLoaded(true)
            bundleLoaded = true

            // E2EE maintenance: check OTP count (non-blocking)
            keyAPI.getPrekeyCount().then((otpCount) => {
              if (needsOTPReplenishment(otpCount)) {
                const newOTPs = generateOneTimePreKeys(otpCount + 1, 20)
                const otpPayload = newOTPs.map((otp) => ({
                  keyId: otp.id,
                  publicKey: naclUtil.encodeBase64(otp.keyPair.publicKey),
                }))
                keyAPI.uploadPrekeys(otpPayload).catch(() => {})
              }
            }).catch(() => {})
          }
        } catch (err) {
          console.error('E2EE initialization failed:', err)
        }

        // If no key bundle was loaded, force re-login so LoginForm can
        // trigger recovery or migration to restore the correct encryption keys.
        // A legacy private key alone is insufficient - the bundle is required
        // for both v2 decryption and correct v1 channel key decryption.
        if (!bundleLoaded) {
          console.warn('[App] No key bundle available - forcing re-login for recovery')
          localStorage.removeItem('blite_token')
          useAuthStore.setState({ token: null, user: null, isAuthenticated: false })
          setLoading(false)
          return
        }

        // Always ensure privateKey is set if available
        if (privateKey) {
          setPrivateKey(privateKey)
        }

        // Connect websocket
        try {
          connectSocket()
        } catch (err) {
          console.error('Socket connection failed:', err)
        }

        // Register service worker and subscribe to push notifications (web only)
        if (!isElectron && 'serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js').then(() => {
            subscribeToPush().catch(() => {})
          }).catch((err) => {
            console.error('[SW] Registration failed:', err)
          })
        }
      } catch (err) {
        console.error('Session restore failed:', err)
        localStorage.removeItem('blite_token')
        setLoading(false)
      }
    }

    restoreSession()
  }, [])

  const Router = isElectron ? MemoryRouter : BrowserRouter

  return (
    <>
      <Router>
        <Routes>
          <Route path="/login" element={
            (isAuthenticated && keyBundleLoaded) ? <Navigate to="/app" replace /> : <LoginForm />
          } />
          <Route path="/register" element={
            isAuthenticated ? <Navigate to="/app" replace /> : <RegisterForm />
          } />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          />
          <Route
            path="/app/:serverId"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          />
          <Route path="/invite/:code" element={<InviteJoinPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route
            path="/"
            element={
              isAuthenticated
                ? <Navigate to="/app" replace />
                : isElectron
                  ? <Navigate to="/login" replace />
                  : <LandingPage />
            }
          />
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      {isElectron && <UpdateNotification />}
    </>
  )
}
