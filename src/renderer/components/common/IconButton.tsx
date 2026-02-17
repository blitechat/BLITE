import React from 'react'
import Tooltip from './Tooltip'

interface IconButtonProps {
  icon: React.ReactNode
  onClick?: () => void
  tooltip?: string
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right'
  badge?: number
  className?: string
  disabled?: boolean
  active?: boolean
}

export default function IconButton({
  icon,
  onClick,
  tooltip,
  tooltipPosition = 'top',
  badge,
  className = '',
  disabled = false,
  active = false,
}: IconButtonProps) {
  const button = (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative p-2 rounded-md transition-colors duration-150 ${
        active
          ? 'bg-blite-bg-active text-blite-text-primary'
          : 'text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-xxs font-bold bg-blite-danger text-white rounded-full">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )

  if (tooltip) {
    return (
      <Tooltip content={tooltip} position={tooltipPosition}>
        {button}
      </Tooltip>
    )
  }

  return button
}
