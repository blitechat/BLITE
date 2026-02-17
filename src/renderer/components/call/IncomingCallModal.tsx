import React, { useEffect } from 'react'
import { Phone, PhoneOff, Video } from 'lucide-react'
import UserAvatar from '@renderer/components/user/UserAvatar'
import { useCallStore } from '@renderer/stores/callStore'
import { acceptIncomingCall, declineIncomingCall } from '@renderer/services/callService'
import { startRingtone, stopRingtone } from '@renderer/services/soundService'

export default function IncomingCallModal() {
  const incomingCall = useCallStore((s) => s.incomingCall)
  const callStatus = useCallStore((s) => s.callStatus)

  // Play ringtone
  useEffect(() => {
    if (callStatus === 'ringing' && incomingCall) {
      // Start ringtone
      startRingtone()

      // Show desktop notification
      if (window.api?.showNotification) {
        window.api.showNotification(
          'Incoming Call',
          `${incomingCall.callerName} is calling you`
        )
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Incoming Call', {
          body: `${incomingCall.callerName} is calling you`,
        })
      }

      return () => {
        stopRingtone()
      }
    }
  }, [callStatus, incomingCall])

  if (!incomingCall || callStatus !== 'ringing') return null

  const handleAccept = () => {
    stopRingtone()
    acceptIncomingCall()
  }

  const handleDecline = () => {
    stopRingtone()
    declineIncomingCall()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-sm mx-4 glass rounded-2xl shadow-2xl border border-blite-glass-border overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-blite-accent/20 to-transparent animate-pulse" />
        </div>

        <div className="relative p-8 flex flex-col items-center">
          {/* Caller info */}
          <div className="relative mb-6">
            {/* Pulsing ring animation */}
            <div className="absolute inset-0 rounded-full animate-ping bg-blite-accent/30" style={{ animationDuration: '2s' }} />
            <div className="absolute -inset-2 rounded-full animate-pulse border-2 border-blite-accent/50" style={{ animationDuration: '1.5s' }} />
            <UserAvatar
              username={incomingCall.callerName}
              avatarUrl={incomingCall.callerAvatar}
              size="lg"
              showStatus={false}
            />
          </div>

          <h2 className="text-xl font-semibold text-blite-text-primary mb-1">
            {incomingCall.callerName}
          </h2>
          <p className="text-sm text-blite-text-muted mb-8 flex items-center gap-2">
            {incomingCall.withVideo ? (
              <>
                <Video size={16} />
                Incoming video call...
              </>
            ) : (
              <>
                <Phone size={16} />
                Incoming voice call...
              </>
            )}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-6">
            <button
              onClick={handleDecline}
              className="w-16 h-16 rounded-full bg-blite-danger flex items-center justify-center text-white shadow-lg hover:bg-blite-danger/90 transition-colors"
            >
              <PhoneOff size={28} />
            </button>
            <button
              onClick={handleAccept}
              className="w-16 h-16 rounded-full bg-blite-success flex items-center justify-center text-white shadow-lg hover:bg-blite-success/90 transition-colors animate-pulse"
            >
              <Phone size={28} />
            </button>
          </div>

          <div className="mt-6 flex gap-4 text-xs text-blite-text-muted">
            <span>Decline</span>
            <span>Accept</span>
          </div>
        </div>
      </div>
    </div>
  )
}
