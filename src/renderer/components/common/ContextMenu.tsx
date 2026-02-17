import React, { useEffect, useRef } from 'react'
import { useUIStore, type ContextMenuItem } from '@renderer/stores/uiStore'

export default function ContextMenu() {
  const contextMenu = useUIStore((s) => s.contextMenu)
  const hideContextMenu = useUIStore((s) => s.hideContextMenu)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu()
      }
    }

    if (contextMenu) {
      document.addEventListener('mousedown', handleClick)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu, hideContextMenu])

  if (!contextMenu) return null

  // Clamp position to viewport
  const menuWidth = 200
  const menuHeight = contextMenu.items.length * 36 + 8
  let x = contextMenu.x
  let y = contextMenu.y

  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 8
  }
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 8
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[200px] py-1 glass rounded-lg shadow-2xl glow-accent-sm"
      style={{ left: x, top: y }}
    >
      {contextMenu.items.map((item, index) => (
        <ContextMenuItemRow key={index} item={item} onClose={hideContextMenu} />
      ))}
    </div>
  )
}

function ContextMenuItemRow({
  item,
  onClose,
}: {
  item: ContextMenuItem
  onClose: () => void
}) {
  const handleClick = () => {
    item.onClick()
    onClose()
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 transition-colors ${
        item.danger
          ? 'text-blite-danger hover:bg-blite-danger hover:text-white'
          : 'text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary'
      }`}
    >
      {item.label}
    </button>
  )
}
