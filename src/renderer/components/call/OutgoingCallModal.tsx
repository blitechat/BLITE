import React, { useEffect } from 'react'
import { Phone, PhoneOff, Video } from 'lucide-react'
import UserAvatar from '@renderer/components/user/UserAvatar'
import { useCallStore } from '@renderer/stores/callStore'
import { cancelOutgoingCall } from '@renderer/services/callService'
import { startCallingTone, stopCallingTone, playCallEndedSound } from '@renderer/services/soundService'

export default function OutgoingCallModal() {
  const outgoingCall = useCallStore((s) => s.outgoingCall)
  const callStatus = useCallStore((s) => s.callStatus)

  // Play calling/ringback tone
  useEffect(() => {
    if (callStatus === 'calling' && outgoingCall) {
      startCallingTone()

      return () => {
        stopCallingTone()
      }
    }
  }, [callStatus, outgoingCall])

  // Handle status changes
  useEffect(() => {
    if (callStatus === 'declined' || callStatus === 'connected' || callStatus === 'ended') {
      stopCallingTone()
      if (callStatus === 'declined') {
        playCallEndedSound()
      }
    }
  }, [callStatus])

  if (!outgoingCall || (callStatus !== 'calling' && callStatus !== 'declined' && callStatus !== 'missed')) return null

  const handleCancel = () => {
    stopCallingTone()
    cancelOutgoingCall()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-sm mx-4 glass rounded-2xl shadow-2xl border border-blite-glass-border overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-blite-accent/10 to-transparent" />
        </div>

        <div className="relative p-8 flex flex-col items-center">
          {/* Recipient info */}
          <div className="relative mb-6">
            {/* Pulsing animation for calling state */}
            {callStatus === 'calling' && (
              <>
                <div className="absolute -inset-3 rounded-full border-2 border-blite-accent/30 animate-ping" style={{ animationDuration: '1.5s' }} />
                <div className="absolute -inset-6 rounded-full border border-blite-accent/20 animate-ping" style={{ animationDuration: '2s' }} />
              </>
            )}
            <UserAvatar
              username={outgoingCall.recipientName}
              avatarUrl={null}
              size="lg"
              showStatus={false}
            />
          </div>

          <h2 className="text-xl font-semibold text-blite-text-primary mb-1">
            {outgoingCall.recipientName}
          </h2>

          {callStatus === 'calling' ? (
            <p className="text-sm text-blite-text-muted mb-8 flex items-center gap-2">
              {outgoingCall.withVideo ? (
                <>
                  <Video size={16} className="animate-pulse" />
                  Calling...
                </>
              ) : (
                <>
                  <Phone size={16} className="animate-pulse" />
                  Calling...
                </>
              )}
            </p>
          ) : callStatus === 'declined' ? (
            <p className="text-sm text-blite-danger mb-8">
              Call declined
            </p>
          ) : callStatus === 'missed' ? (
            <p className="text-sm text-blite-text-muted mb-8">
              No answer
            </p>
          ) : null}

          {/* Cancel button */}
          <button
            onClick={handleCancel}
            className="w-16 h-16 rounded-full bg-blite-danger flex items-center justify-center text-white shadow-lg hover:bg-blite-danger/90 transition-colors"
          >
            <PhoneOff size={28} />
          </button>

          <p className="mt-4 text-xs text-blite-text-muted">
            {callStatus === 'declined' ? 'Close' : 'Cancel call'}
          </p>
        </div>
      </div>
    </div>
  )
}
