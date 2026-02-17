import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { EMOJI_CATEGORIES } from '@renderer/data/emojis'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(0)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        // Delay so any in-flight click/select events fire before we close
        requestAnimationFrame(() => onClose())
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Use mouseup instead of mousedown to avoid racing with click handlers
    document.addEventListener('mouseup', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mouseup', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter(() => {
      // Simple search: just show all if searching (emoji search by name would need a name map)
      return true
    })
  }, [search])

  return (
    <div
      ref={pickerRef}
      className="w-80 h-96 glass rounded-lg shadow-2xl flex flex-col overflow-hidden"
      style={{ background: 'var(--blite-bg-secondary)' }}
    >
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blite-text-muted" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emojis..."
            className="input-field text-sm pl-8 pr-8 py-1.5"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-blite-text-muted hover:text-blite-text-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex px-2 gap-0.5 border-b border-blite-border">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(i)}
              className={`p-1.5 text-lg rounded-t transition-colors ${
                activeCategory === i
                  ? 'bg-blite-bg-active'
                  : 'hover:bg-blite-bg-hover'
              }`}
              title={cat.name}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {search ? (
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJI_CATEGORIES.flatMap((c) => c.emojis).map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => {
                  onSelect(emoji)
                  onClose()
                }}
                className="p-1 text-xl rounded hover:bg-blite-bg-hover transition-colors text-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide mb-1 px-1">
              {EMOJI_CATEGORIES[activeCategory].name}
            </p>
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => {
                    onSelect(emoji)
                    onClose()
                  }}
                  className="p-1 text-xl rounded hover:bg-blite-bg-hover transition-colors text-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
