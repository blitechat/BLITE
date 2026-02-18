import React, { useState, FormEvent } from 'react'
import { HelpCircle, Bug, Lightbulb, MessageCircle, Loader2, Check } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import { useUIStore } from '@renderer/stores/uiStore'
import { feedbackAPI } from '@renderer/services/api'

type FeedbackType = 'bug' | 'feature' | 'general'

const TYPES: { id: FeedbackType; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'bug', label: 'Bug Report', icon: <Bug size={15} />, description: 'Something is broken' },
  { id: 'feature', label: 'Feature Request', icon: <Lightbulb size={15} />, description: 'Suggest an idea' },
  { id: 'general', label: 'General Feedback', icon: <MessageCircle size={15} />, description: 'Anything else' },
]

export default function FeedbackModal() {
  const closeModal = useUIStore((s) => s.closeModal)
  const [type, setType] = useState<FeedbackType>('bug')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) return

    setLoading(true)
    setError('')
    try {
      await feedbackAPI.submit({ type, subject: subject.trim(), description: description.trim() })
      setSuccess(true)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to submit feedback. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <Modal title="Help & Feedback" onClose={closeModal}>
        <div className="py-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-blite-success/20 flex items-center justify-center mx-auto">
            <Check size={24} className="text-blite-success" />
          </div>
          <div>
            <p className="text-base font-semibold text-blite-text-primary">Thank you!</p>
            <p className="text-sm text-blite-text-secondary mt-1">Your feedback has been submitted.</p>
          </div>
          <button onClick={closeModal} className="btn-primary">
            Close
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Help & Feedback" onClose={closeModal}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Icon header */}
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-lg gradient-accent flex items-center justify-center mx-auto mb-2 glow-accent">
            <HelpCircle size={20} className="text-white" />
          </div>
          <p className="text-sm text-blite-text-secondary">
            Found a bug, have a suggestion, or just want to share feedback?
          </p>
        </div>

        {/* Type selector */}
        <div>
          <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-2">
            Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border text-xs font-medium transition-all ${
                  type === t.id
                    ? 'border-blite-accent bg-blite-accent/10 text-blite-accent'
                    : 'border-blite-glass-border text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div>
          <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={100}
            className="input-field"
            placeholder="Brief summary of your feedback"
            required
            autoFocus
          />
          <p className="text-xs text-blite-text-muted mt-1 text-right">{subject.length}/100</p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={5}
            className="input-field resize-none"
            placeholder="Describe in detail. For bugs, include steps to reproduce."
            required
          />
          <p className="text-xs text-blite-text-muted mt-1 text-right">{description.length}/1000</p>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-blite-danger/10 border border-blite-danger/30 text-blite-danger text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={closeModal} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !subject.trim() || !description.trim()}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
