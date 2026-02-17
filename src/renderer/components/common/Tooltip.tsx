import React, { useState, useRef, useCallback, useEffect } from 'react'

interface TooltipProps {
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  children: React.ReactNode
}

export default function Tooltip({ content, position = 'top', delay = 400, children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const gap = 8

    let x = 0
    let y = 0

    switch (position) {
      case 'top':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        y = triggerRect.top - tooltipRect.height - gap
        break
      case 'bottom':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        y = triggerRect.bottom + gap
        break
      case 'left':
        x = triggerRect.left - tooltipRect.width - gap
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        break
      case 'right':
        x = triggerRect.right + gap
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        break
    }

    // Clamp to viewport
    x = Math.max(4, Math.min(x, window.innerWidth - tooltipRect.width - 4))
    y = Math.max(4, Math.min(y, window.innerHeight - tooltipRect.height - 4))

    setCoords({ x, y })
  }, [position])

  useEffect(() => {
    if (visible) {
      calculatePosition()
    }
  }, [visible, calculatePosition])

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex"
      >
        {children}
      </div>
      {visible && (
        <div
          ref={tooltipRef}
          className="tooltip whitespace-nowrap"
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
          }}
        >
          {content}
        </div>
      )}
    </>
  )
}
