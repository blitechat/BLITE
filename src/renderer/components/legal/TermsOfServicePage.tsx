import React from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, ArrowLeft } from 'lucide-react'
import logoImg from '@renderer/assets/logo.png'

export default function TermsOfServicePage() {
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
          <FileText size={28} className="text-blite-accent" />
          <h1 className="text-3xl font-bold">Terms of Service</h1>
        </div>
        <p className="text-blite-text-muted text-sm mb-10">Last updated: February 2026</p>

        <div className="prose prose-invert max-w-none space-y-8 text-blite-text-secondary leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using BLITE (the "Service"), you agree to be bound by these Terms of
              Service. If you do not agree, do not use the Service.
            </p>
            <p className="mt-3">
              These terms apply to the hosted instance at <strong>blite.chat</strong>. If you self-host BLITE,
              you are responsible for your own terms with your users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">2. Eligibility</h2>
            <p>
              You must be at least 13 years old to use BLITE. If you are under 18, you must have permission
              from a parent or legal guardian. By using the Service, you confirm you meet these requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">3. Your Account</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You are responsible for maintaining the security of your account credentials and encryption keys.</li>
              <li>You are responsible for all activity that occurs under your account.</li>
              <li>You must provide accurate information when creating your account.</li>
              <li>You must not share your account with others or create accounts on behalf of others without their consent.</li>
              <li>
                BLITE uses end-to-end encryption. If you lose your device and your recovery key, you may
                permanently lose access to historical messages. This is a security feature, not a bug.
                BLITE cannot recover your private keys.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">4. Acceptable Use</h2>
            <p>You agree not to use BLITE to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
              <li>Violate any applicable law or regulation</li>
              <li>Distribute, possess, or solicit child sexual abuse material (CSAM) — this is a zero-tolerance policy and will result in immediate account termination and reporting to authorities</li>
              <li>Harass, threaten, stalk, or intimidate other users</li>
              <li>Distribute malware, ransomware, spyware, or other malicious software</li>
              <li>Conduct phishing, fraud, or other deceptive practices</li>
              <li>Coordinate or facilitate acts of violence or terrorism</li>
              <li>Spam or send unsolicited bulk messages</li>
              <li>Attempt to gain unauthorized access to any system or account</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Circumvent any security, rate limiting, or access control measures</li>
              <li>Impersonate BLITE, BLITE staff, or other users</li>
            </ul>
            <p className="mt-3">
              Because BLITE is end-to-end encrypted, we cannot proactively monitor message content.
              Violations can be reported via our{' '}
              <a
                href="https://github.com/blitechat/BLITE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blite-accent hover:underline"
              >
                GitHub repository
              </a>
              . We will take action on confirmed violations including account suspension and, where legally
              required, reporting to law enforcement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">5. Your Content</h2>
            <p>
              You retain ownership of content you send through BLITE. Because your messages are
              end-to-end encrypted, BLITE has no ability to access, use, or monetize your content.
            </p>
            <p className="mt-3">
              By using the Service, you grant BLITE the limited technical rights necessary to transmit and
              store your encrypted messages for delivery — nothing more.
            </p>
            <p className="mt-3">
              You are solely responsible for all content you send. Do not send content that violates these
              terms or applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">6. Service Availability</h2>
            <p>
              BLITE is provided on a best-effort basis. We do not guarantee 100% uptime, and we may
              perform maintenance that temporarily interrupts the Service. We are not liable for any loss
              resulting from service interruptions.
            </p>
            <p className="mt-3">
              We reserve the right to modify, suspend, or discontinue any part of the Service at any time.
              If we discontinue the hosted service, we will provide reasonable notice and the open source
              code will remain available for self-hosting.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">7. Account Termination</h2>
            <p>
              You may delete your account at any time from Settings. Account deletion permanently removes
              your account data and messages from our servers.
            </p>
            <p className="mt-3">
              We reserve the right to suspend or terminate accounts that violate these Terms, without prior
              notice in cases of serious violations (e.g., CSAM, threats of violence).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">8. Open Source License</h2>
            <p>
              BLITE is open source software. The source code is available at{' '}
              <a
                href="https://github.com/blitechat/BLITE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blite-accent hover:underline"
              >
                github.com/blitechat/BLITE
              </a>{' '}
              under its applicable open source license. You are free to self-host, audit, fork, and
              contribute to the codebase in accordance with that license.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">9. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS
              FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="mt-3">
              While BLITE employs strong end-to-end encryption, no system is perfectly secure. You use
              the Service at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">10. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, BLITE AND ITS CONTRIBUTORS SHALL NOT
              BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES
              ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY
              OF SUCH DAMAGES.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">11. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Changes will be posted at this URL with an
              updated date. Continued use of BLITE after changes constitutes acceptance of the revised terms.
              For material changes, we will make reasonable efforts to notify users.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-blite-text-primary mb-3">12. Contact</h2>
            <p>
              Questions about these Terms? Open an issue on our{' '}
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
