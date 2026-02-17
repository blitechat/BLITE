import React, { useEffect, useState } from 'react'
import { X, Monitor, Loader2, Volume2 } from 'lucide-react'
import type { ScreenSource } from '@renderer/types'

interface ScreenSharePickerProps {
  onSelect: (sourceId: string, includeAudio: boolean) => void
  onClose: () => void
}

export default function ScreenSharePicker({ onSelect, onClose }: ScreenSharePickerProps) {
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [loading, setLoading] = useState(true)
  const [includeAudio, setIncludeAudio] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadSources = async () => {
      try {
        const result = await window.api!.getScreenSources()
        if (!cancelled) {
          setSources(result)
        }
      } catch (err) {
        console.error('Failed to get screen sources:', err)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSources()
    return () => { cancelled = true }
  }, [])

  const screens = sources.filter((s) => s.id.startsWith('screen:'))
  const windows = sources.filter((s) => s.id.startsWith('window:'))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-blite-bg-secondary rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-blite-border">
          <h2 className="text-lg font-semibold text-blite-text-primary">Share Your Screen</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Audio toggle */}
        <div className="flex items-center gap-2 px-5 py-2 border-b border-blite-border">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
              className="w-4 h-4 rounded border-blite-border accent-blite-accent-primary"
            />
            <Volume2 size={14} className="text-blite-text-secondary" />
            <span className="text-sm text-blite-text-secondary">Share audio</span>
          </label>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-blite-text-muted mb-3" />
              <p className="text-sm text-blite-text-secondary">Loading sources...</p>
            </div>
          ) : (
            <>
              {/* Screens */}
              {screens.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-3">
                    Screens
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {screens.map((source) => (
                      <SourceCard key={source.id} source={source} onSelect={(id) => onSelect(id, includeAudio)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Windows */}
              {windows.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-3">
                    Windows
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {windows.map((source) => (
                      <SourceCard key={source.id} source={source} onSelect={(id) => onSelect(id, includeAudio)} />
                    ))}
                  </div>
                </div>
              )}

              {screens.length === 0 && windows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Monitor size={32} className="text-blite-text-muted mb-3" />
                  <p className="text-sm text-blite-text-secondary">No sources available</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SourceCard({ source, onSelect }: { source: ScreenSource; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(source.id)}
      className="group rounded-lg border border-blite-border hover:border-blite-accent-primary bg-blite-bg-primary hover:bg-blite-bg-hover transition-all p-2 text-left"
    >
      <div className="aspect-video rounded overflow-hidden bg-black mb-2">
        <img
          src={source.thumbnailDataUrl}
          alt={source.name}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="flex items-center gap-2 px-1">
        {source.appIconDataUrl && (
          <img src={source.appIconDataUrl} alt="" className="w-4 h-4 flex-shrink-0" />
        )}
        <span className="text-xs text-blite-text-secondary group-hover:text-blite-text-primary truncate">
          {source.name}
        </span>
      </div>
    </button>
  )
}
