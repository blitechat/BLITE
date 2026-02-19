import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Shield, Lock, Eye, EyeOff, Server, Zap, AlertTriangle,
  Check, X, Download, Monitor, Apple, ChevronRight,
  MessageSquare, Users, Mic, Video, FileText, Key,
  Database, ShieldAlert, Radio, Globe, ChevronDown, ChevronUp
} from 'lucide-react'

import { PRODUCTION_URL } from '@renderer/services/config'
import logoImg from '@renderer/assets/logo.png'

function getDownloadBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return `${window.location.origin}/downloads`
  }
  return `${PRODUCTION_URL}/downloads`
}

function detectOS(): 'windows' | 'mac' | 'linux' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

export default function LandingPage() {
  const navigate = useNavigate()
  const baseUrl = useMemo(() => getDownloadBaseUrl(), [])
  const userOS = useMemo(() => detectOS(), [])
  const [showTechDetails, setShowTechDetails] = useState(false)

  const platforms = [
    { os: 'windows' as const, platform: 'Windows', icon: <Monitor size={28} />, file: 'blite-setup-win.exe', available: true },
    { os: 'mac' as const, platform: 'macOS', icon: <Apple size={28} />, file: 'blite-setup-mac.dmg', available: false },
    { os: 'linux' as const, platform: 'Linux', icon: <Download size={28} />, file: 'blite-setup-linux.AppImage', available: true },
  ]

  const sortedPlatforms = useMemo(() => {
    const idx = platforms.findIndex(p => p.os === userOS)
    if (idx > 0) {
      const copy = [...platforms]
      const [match] = copy.splice(idx, 1)
      copy.unshift(match)
      return copy
    }
    return platforms
  }, [userOS])

  return (
    <div className="min-h-screen bg-blite-bg-primary text-blite-text-primary overflow-y-auto">
      {/* Animated background */}
      <div className="fixed inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 -left-32 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ background: 'var(--blite-gradient-start)', animationDuration: '4s' }} />
        <div className="absolute bottom-0 -right-32 w-96 h-96 rounded-full blur-3xl animate-pulse" style={{ background: 'var(--blite-gradient-end)', animationDuration: '6s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 rounded-full blur-3xl animate-pulse" style={{ background: 'var(--blite-gradient-start)', animationDuration: '5s' }} />
      </div>

      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-8 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="BLITE" className="w-10 h-10" />
          <span className="text-xl font-bold tracking-widest gradient-accent-text">BLITE</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/login')}
            className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-blite-text-secondary hover:text-blite-text-primary transition-colors"
          >
            Log In
          </button>
          <button
            onClick={() => navigate('/register')}
            className="px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold gradient-accent text-white rounded-md glow-accent-sm hover:scale-105 transition-transform"
          >
            Get Started Free
          </button>
        </div>
      </header>

      {/* Hero - Shock Value */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 pt-12 sm:pt-20 pb-12">
        <div className="text-center">
          {/* Privacy badge */}
          <div className="inline-flex items-center gap-2 px-5 py-3 rounded-full glass border border-red-500/30 mb-8">
            <AlertTriangle size={18} className="text-red-400" />
            <span className="text-sm text-blite-text-secondary">
              Your messages aren't as private as you think
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-6 leading-tight">
            You are being{' '}
            <span className="gradient-accent-text relative">
              watched
              <div className="absolute -bottom-2 left-0 right-0 h-1 bg-red-500/30 blur-sm" />
            </span>
          </h1>

          <p className="text-lg sm:text-2xl text-blite-text-secondary max-w-3xl mx-auto mb-4 leading-relaxed">
            Every message. Every photo. Every voice call.
          </p>

          <p className="text-base sm:text-xl text-blite-text-muted max-w-2xl mx-auto mb-10">
            Most chat platforms can access your message content. They scan for ads, patterns, and moderation.
            <span className="text-blite-text-primary font-semibold"> It doesn't have to be this way.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-8 py-4 text-base sm:text-lg font-bold gradient-accent text-white rounded-lg glow-accent shadow-2xl hover:scale-105 transition-transform flex items-center justify-center gap-2"
            >
              Take Back Your Privacy
              <ChevronRight size={20} />
            </button>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto px-8 py-4 text-base font-semibold text-blite-text-primary glass rounded-lg hover:bg-blite-bg-hover transition-colors"
            >
              See How It Works
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-blite-text-muted">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-green-400" />
              <span>No payment required</span>
            </div>
            <div className="flex items-center gap-2">
              <Check size={16} className="text-green-400" />
              <span>No phone number</span>
            </div>
            <div className="flex items-center gap-2">
              <Check size={16} className="text-green-400" />
              <span>Free forever</span>
            </div>
          </div>
        </div>
      </section>

      {/* The Cost of "Free" */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 py-16">
        <div className="glass rounded-2xl p-8 sm:p-12 border border-red-500/20">
          <div className="text-center mb-10">
            <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              What They're <span className="text-red-400">Really</span> Taking
            </h2>
            <p className="text-blite-text-secondary text-lg">
              Your messages belong to you — not us, not advertisers, not anyone
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ThreatCard
              icon={<Database size={24} className="text-red-400" />}
              title="They Read Your Messages"
              description="Without E2E encryption, platforms can access and analyze your actual message content—not just metadata. Your words, photos, and files are readable by the company and their AI systems."
            />
            <ThreatCard
              icon={<Eye size={24} className="text-orange-400" />}
              title="Server-Side Access"
              description="Without end-to-end encryption, service providers can access message content for moderation, compliance, and other purposes."
            />
            <ThreatCard
              icon={<Radio size={24} className="text-yellow-400" />}
              title="Closed Source = Zero Accountability"
              description="Most platforms are closed source—you can't verify their privacy claims. Even if they promise encryption, you have to take their word for it."
            />
            <ThreatCard
              icon={<Globe size={24} className="text-blue-400" />}
              title="What Can Be Compelled?"
              description="All services must comply with legal requests. Without E2E encryption, companies can be forced to hand over your message content. With E2E, they can only provide metadata—content is mathematically inaccessible."
            />
          </div>

          <div className="mt-10 p-6 rounded-xl bg-blite-bg-tertiary border border-blite-border text-center">
            <p className="text-base text-blite-text-secondary mb-4">
              "Privacy is dead, and social networks hold the most comprehensive data about people."
            </p>
            <p className="text-sm text-blite-text-muted mb-3">
              — Mark Zuckerberg, 2010
            </p>
            <p className="text-sm text-orange-300">
              The same year Facebook settled an FTC complaint for privacy violations. In 2019, Facebook paid $5 billion for repeated privacy breaches including Cambridge Analytica.
            </p>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section id="how-it-works" className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-green-500/30 mb-6">
            <Shield size={16} className="text-green-400" />
            <span className="text-sm font-medium text-green-400">The Solution</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-bold mb-4">
            Your Messages,{' '}
            <span className="gradient-accent-text">Unreadable by Anyone</span>
          </h2>
          <p className="text-lg text-blite-text-secondary max-w-2xl mx-auto">
            BLITE uses Signal Protocol encryption. Your message content is scrambled before it leaves your device.
            BLITE servers can't read it. Hackers can't read it. Governments can't read it. Only your intended recipient can.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <ProcessCard
            number="01"
            icon={<Lock size={28} className="text-blite-gradient-start" />}
            title="Encrypted On Your Device"
            description="Messages are scrambled before leaving your device using keys only you control."
          />
          <ProcessCard
            number="02"
            icon={<Server size={28} className="text-blite-gradient-end" />}
            title="Server Relays Encrypted Data"
            description="BLITE servers relay encrypted messages without the ability to decrypt content. Only ciphertext passes through our infrastructure."
          />
          <ProcessCard
            number="03"
            icon={<Key size={28} className="text-green-400" />}
            title="Only You Can Decrypt"
            description="Your conversation partner's device decrypts using their private key. Perfect secrecy."
          />
        </div>

        <div className="glass rounded-xl p-8 border border-blite-border">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <ShieldAlert size={32} className="text-blite-gradient-start" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">Zero-Knowledge Architecture</h3>
              <p className="text-blite-text-secondary mb-4">
                BLITE uses the <strong>Signal Protocol</strong> for direct messages—the same encryption standard used by Signal and WhatsApp.
                BLITE is open-source and self-hostable, allowing independent verification and deployment.
              </p>
              <button
                onClick={() => setShowTechDetails(!showTechDetails)}
                className="flex items-center gap-2 text-sm font-medium text-blite-gradient-start hover:underline"
              >
                {showTechDetails ? 'Hide' : 'Show'} technical details
                {showTechDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showTechDetails && (
                <div className="mt-6 space-y-4">
                  <div className="p-4 rounded-lg bg-blite-bg-tertiary border border-blite-border">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <h4 className="font-semibold mb-2 text-purple-400">Direct Messages</h4>
                        <ul className="space-y-1 text-blite-text-secondary text-sm">
                          <li>• Double Ratchet (Signal-style)</li>
                          <li>• X3DH key agreement</li>
                          <li>• XSalsa20-Poly1305 (NaCl secretbox)</li>
                          <li>• HMAC-SHA256 for key derivation</li>
                          <li>• Perfect forward secrecy</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2 text-blue-400">Voice & Video</h4>
                        <ul className="space-y-1 text-blite-text-secondary text-sm">
                          <li>• WebRTC Insertable Streams</li>
                          <li>• AES-128-GCM frame encryption</li>
                          <li>• Ephemeral Curve25519 key exchange</li>
                          <li>• Server sees only ciphertext</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-blite-bg-tertiary border border-blite-gradient-start/30">
                    <div className="flex items-start gap-3">
                      <Server size={20} className="text-blite-gradient-start flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-semibold mb-1 text-blite-text-primary">Self-Host for Full Control</h4>
                        <p className="text-sm text-blite-text-secondary mb-3">
                          BLITE encrypts all message <strong>content</strong> end-to-end on the hosted service — we can never read your messages.
                          But like any real-time service, our servers see <strong>metadata</strong>: who talks to whom, timestamps, and IP addresses.
                        </p>
                        <p className="text-sm text-blite-text-secondary mb-3">
                          Want control over metadata too? Self-host your own BLITE instance. Your server, your data, your rules.
                          It takes 3 commands with Docker.
                        </p>
                        <a
                          href="https://github.com/blitechat/BLITE/blob/main/SELF_HOST.md"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-medium text-blite-gradient-start hover:underline"
                        >
                          Self-hosting guide
                          <ChevronRight size={14} />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features - Benefits Focused */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Everything You Need. Nothing You Don't.
          </h2>
          <p className="text-blite-text-secondary">
            Full-featured team communication without the surveillance
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={<MessageSquare size={24} />}
            title="Encrypted Messaging"
            description="Text, photos, files—all encrypted end-to-end. Rich formatting, reactions, threads."
          />
          <FeatureCard
            icon={<Users size={24} />}
            title="Private Communities"
            description="Create servers with channels. Invite with a link. Everything encrypted by default."
          />
          <FeatureCard
            icon={<Mic size={24} />}
            title="Voice Channels"
            description="Drop-in voice chat with E2E encryption. Server never hears your voice."
          />
          <FeatureCard
            icon={<Video size={24} />}
            title="Video & Screenshare"
            description="Face-to-face calls and screen sharing. All encrypted. All private."
          />
          <FeatureCard
            icon={<FileText size={24} />}
            title="File Sharing"
            description="Send files up to 25MB. Attachments are stored encrypted and transmitted over secure channels."
          />
          <FeatureCard
            icon={<EyeOff size={24} />}
            title="Self-Hostable"
            description="Want complete control? Run your own BLITE server. Full control over all data, metadata included. Open source and auditable."
          />
        </div>
      </section>

      {/* Social Proof / Comparison */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Choose Your Future
          </h2>
          <p className="text-blite-text-secondary">
            Stay surveilled or take back control
          </p>
        </div>

        <div className="glass rounded-2xl overflow-hidden border border-blite-border">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-blite-border bg-blite-bg-tertiary">
                  <th className="text-left p-4 font-semibold text-blite-text-primary">Privacy Feature</th>
                  <th className="text-center p-4 font-semibold text-blite-text-secondary text-sm">Discord</th>
                  <th className="text-center p-4 font-semibold text-blite-text-secondary text-sm">Slack</th>
                  <th className="text-center p-4 font-semibold">
                    <span className="gradient-accent-text">BLITE</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <ComparisonRow
                  feature="E2E encrypted messages"
                  discord={false}
                  slack={false}
                  blite={true}
                />
                <ComparisonRow
                  feature="Server cannot read content"
                  discord={false}
                  slack={false}
                  blite={true}
                />
                <ComparisonRow
                  feature="Zero-knowledge architecture"
                  discord={false}
                  slack={false}
                  blite={true}
                />
                <ComparisonRow
                  feature="Self-hostable"
                  discord={false}
                  slack={false}
                  blite={true}
                />
                <ComparisonRow
                  feature="Open source"
                  discord={false}
                  slack={false}
                  blite={true}
                />
                <ComparisonRow
                  feature="No phone number required"
                  discord={true}
                  slack={true}
                  blite={true}
                />
                <ComparisonRow
                  feature="Voice & video"
                  discord={true}
                  slack={true}
                  blite={true}
                  lastRow={true}
                />
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-3 text-sm text-blite-text-muted text-center">
            Comparison based on publicly available information and standard product offerings as of February 2026.
            Features may vary by plan and configuration.
          </div>
        </div>
      </section>

      {/* CTA - Download */}
      <section id="download" className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 py-16">
        <div className="glass rounded-2xl p-10 sm:p-16 text-center border-2 border-blite-gradient-start/30 glow-accent">
          <Shield size={56} className="mx-auto mb-6 text-blite-gradient-start" />
          <h2 className="text-3xl sm:text-5xl font-bold mb-4">
            Ready to Go Private?
          </h2>
          <p className="text-lg text-blite-text-secondary mb-8 max-w-2xl mx-auto">
            Start using end-to-end encrypted communication.
            Free to use. No credit card required.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mb-8">
            {sortedPlatforms.map(({ os, platform, icon, file, available }) => (
              available ? (
                <a
                  key={os}
                  href={`${baseUrl}/${file}`}
                  download={file}
                  className={`glass rounded-lg p-6 hover:bg-blite-bg-hover transition-all block ${
                    os === userOS ? 'ring-2 ring-blite-gradient-start/50' : ''
                  }`}
                >
                  <div className="w-12 h-12 rounded-lg bg-blite-gradient-start/20 flex items-center justify-center mx-auto mb-3 text-blite-gradient-start">
                    {icon}
                  </div>
                  <h3 className="font-semibold mb-1">{platform}</h3>
                  {os === userOS && (
                    <span className="text-xs text-blite-gradient-start">Detected</span>
                  )}
                </a>
              ) : (
                <div
                  key={os}
                  className="glass rounded-lg p-6 opacity-50 cursor-not-allowed"
                >
                  <div className="w-12 h-12 rounded-lg bg-blite-bg-hover flex items-center justify-center mx-auto mb-3 text-blite-text-muted">
                    {icon}
                  </div>
                  <h3 className="font-semibold mb-1 text-blite-text-muted">{platform}</h3>
                  <span className="text-xs text-blite-text-muted">Soon</span>
                </div>
              )
            ))}
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => navigate('/register')}
              className="px-8 py-4 text-lg font-bold gradient-accent text-white rounded-lg glow-accent hover:scale-105 transition-transform shadow-2xl"
            >
              Start Chatting Now →
            </button>
            <p className="text-sm text-blite-text-muted">
              Works in browser. Desktop apps available above.
            </p>
          </div>
        </div>
      </section>

      {/* Final Push - FOMO */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 sm:px-8 py-12">
        <div className="text-center">
          <p className="text-lg text-blite-text-secondary mb-2">
            Your conversations deserve real privacy protection.
          </p>
          <p className="text-2xl sm:text-3xl font-bold gradient-accent-text">
            Your privacy isn't negotiable.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center py-12 border-t border-blite-border mt-12">
        <div className="max-w-4xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logoImg} alt="BLITE" className="w-12 h-12" />
            <span className="text-lg font-bold tracking-widest gradient-accent-text">BLITE</span>
          </div>
          <p className="text-sm text-blite-text-muted mb-6">
            End-to-end encrypted communication. Open source and self-hostable.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-blite-text-muted mb-6">
            <span>🔒 Signal Protocol</span>
            <span>•</span>
            <span>🛡️ Zero-Knowledge Content</span>
            <span>•</span>
            <span>📖 Open Source</span>
            <span>•</span>
            <span>🏠 Self-Hostable</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-blite-text-muted">
            <Link to="/privacy" className="hover:text-blite-text-primary transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-blite-text-primary transition-colors">Terms of Service</Link>
            <span>•</span>
            <a href="https://github.com/blitechat/BLITE" target="_blank" rel="noopener noreferrer" className="hover:text-blite-text-primary transition-colors">Source Code</a>
          </div>
          <div className="pt-6 border-t border-blite-border text-xs text-blite-text-muted max-w-2xl mx-auto">
            <p className="mb-3">
              <strong>Content Privacy (Encrypted):</strong> BLITE encrypts message content end-to-end using Signal Protocol (Double Ratchet + X3DH + NaCl cryptography).
              Your actual messages, photos, voice, and video cannot be read by BLITE servers, interceptors, or anyone except your intended recipients.
              This is the core privacy protection.
            </p>
            <p className="mb-3">
              <strong>Metadata (Like All Real-Time Services):</strong> To function, BLITE servers see operational data: who communicates with whom, timestamps, server membership, IP addresses.
              This metadata reveals communication patterns but not content. Signal, the privacy gold standard, has the same limitation.
              <strong> The difference: you can self-host BLITE</strong> for complete metadata control.
            </p>
            <p>
              <strong>Open Source Transparency:</strong> BLITE code is fully auditable. Our encryption claims are verifiable, not marketing promises.
              Self-hosting gives you full control over both content and metadata.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ThreatCard({ icon, title, description }: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="p-6 rounded-xl bg-blite-bg-secondary border border-blite-border hover:border-red-500/30 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blite-bg-tertiary flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold mb-2 text-blite-text-primary">{title}</h3>
          <p className="text-sm text-blite-text-secondary leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}

function ProcessCard({ number, icon, title, description }: {
  number: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="relative glass rounded-xl p-6 border border-blite-border hover:border-blite-gradient-start/30 transition-colors">
      <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full gradient-accent flex items-center justify-center text-white font-bold text-sm glow-accent-sm">
        {number}
      </div>
      <div className="mb-4">{icon}</div>
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-sm text-blite-text-secondary leading-relaxed">{description}</p>
    </div>
  )
}

function FeatureCard({ icon, title, description }: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="glass rounded-xl p-6 hover:bg-blite-bg-hover transition-all border border-transparent hover:border-blite-gradient-start/20">
      <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center mb-4 text-white glow-accent-sm">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-blite-text-secondary leading-relaxed">{description}</p>
    </div>
  )
}

function ComparisonRow({
  feature,
  discord,
  slack,
  blite,
  lastRow,
}: {
  feature: string
  discord: boolean
  slack: boolean
  blite: boolean
  lastRow?: boolean
}) {
  return (
    <tr className={`${lastRow ? '' : 'border-b border-blite-border/50'} hover:bg-blite-bg-hover/50 transition-colors`}>
      <td className="p-4 text-blite-text-primary">{feature}</td>
      <td className="p-4 text-center">
        {discord ? (
          <Check size={18} className="inline text-blite-text-muted" />
        ) : (
          <X size={18} className="inline text-red-400/60" />
        )}
      </td>
      <td className="p-4 text-center">
        {slack ? (
          <Check size={18} className="inline text-blite-text-muted" />
        ) : (
          <X size={18} className="inline text-red-400/60" />
        )}
      </td>
      <td className="p-4 text-center">
        {blite ? (
          <Check size={18} className="inline text-green-400 glow-accent-sm" />
        ) : (
          <X size={18} className="inline text-red-400/60" />
        )}
      </td>
    </tr>
  )
}
