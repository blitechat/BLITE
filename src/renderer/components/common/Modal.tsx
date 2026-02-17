import React, { useEffect, useCallback, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  width?: string
}

export default function Modal({ title, children, footer, onClose, width = 'max-w-md' }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose()
    }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className={`${width} w-full mx-4 glass rounded-lg shadow-2xl glow-accent-sm animate-in fade-in zoom-in`}
        style={{ background: 'var(--blite-bg-secondary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-blite-glass-border">
          <h2 className="text-lg font-semibold text-blite-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-blite-glass-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
