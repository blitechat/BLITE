import React from 'react'
import { Settings, Minus, Square, X, Copy, Search } from 'lucide-react'
import Tooltip from '@renderer/components/common/Tooltip'
import { useUIStore } from '@renderer/stores/uiStore'
import logoImg from '@renderer/assets/logo.png'

const isElectron = typeof window !== 'undefined' && !!window.api

interface TopNavProps {
  isMaximized: boolean
  setIsMaximized: (v: boolean) => void
}

export default function TopNav({ isMaximized, setIsMaximized }: TopNavProps) {
  const openModal = useUIStore((s) => s.openModal)

  const handleMinimize = () => window.api?.minimizeWindow?.()
  const handleMaximize = async () => {
    window.api?.maximizeWindow?.()
    const maximized = await window.api?.isMaximized?.()
    setIsMaximized(!!maximized)
  }
  const handleClose = () => window.api?.closeWindow?.()

  const openQuickSwitcher = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
  }

  return (
    <div className="titlebar-drag h-11 bg-blite-bg-secondary flex items-center px-3 flex-shrink-0 no-select border-b border-blite-border neon-underline">
      {/* Left: Logo */}
      <div className="titlebar-no-drag flex items-center gap-2">
        <img src={logoImg} alt="BLITE" className="w-7 h-7" />
        <span className="text-sm font-bold tracking-widest gradient-accent-text">BLITE</span>
      </div>

      {/* Center: Global Search */}
      <div className="flex-1 flex justify-center px-4">
        <button
          onClick={openQuickSwitcher}
          className="titlebar-no-drag flex items-center gap-2 px-3 py-1.5 rounded-lg text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-all text-sm max-w-xs w-full justify-center"
        >
          <Search size={14} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline px-1.5 py-0.5 text-[11px] font-mono bg-blite-bg-tertiary rounded border border-blite-border">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right: Settings + window controls */}
      <div className="titlebar-no-drag flex items-center gap-0.5">
        <Tooltip content="User Settings" position="bottom">
          <button
            onClick={() => openModal('userSettings')}
            className="p-2 rounded-lg text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors"
          >
            <Settings size={16} />
          </button>
        </Tooltip>

        {isElectron && (
          <>
            <div className="w-px h-5 bg-blite-border mx-1" />

            <button
              onClick={handleMinimize}
              className="w-9 h-9 flex items-center justify-center text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors rounded-lg"
              title="Minimize"
            >
              <Minus size={15} />
            </button>
            <button
              onClick={handleMaximize}
              className="w-9 h-9 flex items-center justify-center text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover transition-colors rounded-lg"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Copy size={13} /> : <Square size={13} />}
            </button>
            <button
              onClick={handleClose}
              className="w-9 h-9 flex items-center justify-center text-blite-text-muted hover:text-white hover:bg-blite-danger transition-colors rounded-lg"
              title="Close"
            >
              <X size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
