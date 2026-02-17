import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'
import logoImg from '@renderer/assets/logo.png'

export default function PrivacyPolicyPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-blite-bg-primary text-blite-text-primary">
      {/* Nav */}
      <nav className="border-b border-blite-border bg-blite-bg-primary/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-blite-text-muted hover:text-blite-text-primary transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="BLITE" className="w-7 h-7" />
            <span className="font-bold tracking-widest gradient-accent-text">BLITE</span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-3">
          <Shield size={28} className="text-blite-accent" />
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
        </div>
        <p className="text-blite-text-muted text-sm mb-10">Last updated: February 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-blite-text-secondary leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">Overview</h2>
            <p>
              BLITE is an end-to-end encrypted (E2EE) messaging platform. This Privacy Policy explains what
              information is collected when you use BLITE, how it is used, and what you can do to control your
              own data. We are committed to transparency — our code is open source and our encryption claims
              are verifiable.
            </p>
            <p className="mt-3">
              If you self-host BLITE, you operate your own server and this policy applies to the hosted
              instance at <strong>blite.chat</strong> only. Self-hosters are responsible for their own privacy
              practices.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">1. What We Encrypt (Cannot Read)</h2>
            <p>
              BLITE uses the Signal Protocol — Double Ratchet, X3DH key agreement, and NaCl
              (libsodium) cryptography — to encrypt all message content end-to-end. This means:
            </p>
            <ul className="list-disc list-inside mt-3 space-y-2 ml-4">
              <li>Message text, including reactions and edits</li>
              <li>Photos, files, and documents you share</li>
              <li>Voice messages</li>
              <li>Video call content</li>
            </ul>
            <p className="mt-3">
              BLITE servers never have access to the encryption keys required to read this content.
              Your messages cannot be read by BLITE staff, interceptors, or any third party —
              only the intended recipients.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">2. What We Collect (Metadata)</h2>
            <p>
              To operate as a real-time service, BLITE servers necessarily process the following
              metadata. This is inherent to how networked messaging works — the same applies to
              Signal, the privacy gold standard.
            </p>

            <h3 className="text-base font-semibold text-blite-text-primary mt-4 mb-2">Account Information</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Username</li>
              <li>Email address (used for account recovery only)</li>
              <li>Hashed password (bcrypt — we never store plaintext passwords)</li>
              <li>Profile display name and avatar image (if set)</li>
              <li>Account creation date</li>
            </ul>

            <h3 className="text-base font-semibold text-blite-text-primary mt-4 mb-2">Communication Metadata</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Which servers and channels you are a member of</li>
              <li>Who you have direct message conversations with</li>
              <li>Message timestamps (when messages were sent, not their content)</li>
              <li>Encrypted message ciphertext stored for delivery to recipients</li>
              <li>File sizes and attachment metadata (not file contents, which are encrypted)</li>
            </ul>

            <h3 className="text-base font-semibold text-blite-text-primary mt-4 mb-2">Connection Data</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>IP address at the time of connection</li>
              <li>Last seen / online status (can be hidden in settings)</li>
              <li>Client type (desktop app vs. web browser)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">3. How We Use This Information</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>To deliver messages to the correct recipients</li>
              <li>To authenticate your account and maintain your session</li>
              <li>To provide server and channel membership features</li>
              <li>To detect and prevent abuse, spam, and unauthorized access</li>
              <li>To send account-related emails (e.g., password reset) if you request them</li>
            </ul>
            <p className="mt-3">
              We do not sell your data. We do not use your data for advertising. We do not share your
              data with third parties except as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">4. Data Retention</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Messages are stored on the server until deleted by the sender or recipient, or until account deletion.</li>
              <li>Disappearing messages (if enabled in a channel) are automatically deleted on the server after the configured timer.</li>
              <li>When you delete your account, your account data and messages are permanently deleted.</li>
              <li>Server logs (including IP addresses) are retained for a limited period for security purposes and then purged.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">5. Your Rights and Controls</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Delete messages:</strong> You can delete any message you sent at any time.</li>
              <li><strong>Delete account:</strong> You can permanently delete your account and all associated data from Settings.</li>
              <li><strong>Online status:</strong> You can hide your online/last-seen status in Privacy settings.</li>
              <li><strong>Self-host:</strong> You can run your own BLITE instance for complete control over all data — both content and metadata.</li>
              <li><strong>Export:</strong> Contact us to request a copy of your account data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">6. E2EE Key Storage</h2>
            <p>
              Your private encryption keys are generated locally on your device and stored in your browser's
              local storage or the desktop app's secure storage. The server holds only your public keys.
              BLITE cannot recover your private keys — if you lose your device and your recovery key,
              access to historical encrypted messages is permanently lost. This is a deliberate privacy design.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">7. Cookies and Local Storage</h2>
            <p>
              BLITE uses browser local storage to maintain your login session and store your encryption keys
              locally. We do not use third-party tracking cookies or analytics services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">8. Security</h2>
            <p>
              We use industry-standard security practices: bcrypt password hashing, HTTPS/TLS in transit,
              and Signal Protocol E2EE for message content. The source code is publicly auditable at{' '}
              <a
                href="https://github.com/blitechat/BLITE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blite-accent hover:underline"
              >
                github.com/blitechat/BLITE
              </a>
              . If you discover a security vulnerability, please report it responsibly via GitHub.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">9. Children's Privacy</h2>
            <p>
              BLITE is not intended for children under 13. We do not knowingly collect personal information
              from children under 13. If you believe a child has provided us with personal information,
              please contact us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted at this URL with
              an updated date. Continued use of BLITE after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">11. Contact</h2>
            <p>
              Questions about this policy? Open an issue on our{' '}
              <a
                href="https://github.com/blitechat/BLITE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blite-accent hover:underline"
              >
                GitHub repository
              </a>
              .
            </p>
          </section>

        </div>
      </div>

      <footer className="border-t border-blite-border py-8 mt-12">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-blite-text-muted">
          <p>© {new Date().getFullYear()} BLITE · End-to-End Encrypted Messaging</p>
        </div>
      </footer>
    </div>
  )
}
