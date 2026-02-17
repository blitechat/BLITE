import React, { useState } from 'react'
import { Clock, Send, X } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import { saveScheduledMessage } from '@renderer/services/scheduler'

interface ScheduleModalProps {
  channelId: string
  content: string
  isDM: boolean
  onClose: () => void
  onScheduled: () => void
}

export default function ScheduleModal({ channelId, content, isDM, onClose, onScheduled }: ScheduleModalProps) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  const handleSchedule = () => {
    if (!date || !time) return

    const scheduledAt = new Date(`${date}T${time}`).toISOString()
    if (new Date(scheduledAt) <= new Date()) {
      alert('Please select a future date and time.')
      return
    }

    saveScheduledMessage({
      id: `sched_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      channelId,
      content,
      scheduledAt,
      isDM,
    })

    onScheduled()
    onClose()
  }

  // Set default min to now
  const now = new Date()
  const minDate = now.toISOString().split('T')[0]
  const minTime = date === minDate
    ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    : '00:00'

  return (
    <Modal title="Schedule Message" onClose={onClose} width="max-w-sm">
      <div className="space-y-4">
        {/* Preview */}
        <div className="p-3 glass rounded-lg">
          <p className="text-xs text-blite-text-muted mb-1">Message to schedule:</p>
          <p className="text-sm text-blite-text-primary line-clamp-3">{content}</p>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-blite-text-muted mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={minDate}
              className="input-field text-sm w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-blite-text-muted mb-1">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              min={date === minDate ? minTime : undefined}
              className="input-field text-sm w-full"
            />
          </div>
        </div>

        <p className="text-xs text-blite-text-muted">
          Messages are only sent when the app is open. If the app is closed at the scheduled time, the message will be sent when you next open it.
        </p>

        <div className="flex gap-2">
          <button
            onClick={handleSchedule}
            disabled={!date || !time}
            className="btn-primary flex items-center gap-2 flex-1"
          >
            <Clock size={14} />
            Schedule
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
