import React from 'react'
import type { UserStatus } from '@shared/types'

interface StatusIndicatorProps {
  status: UserStatus
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
}

const colorMap: Record<UserStatus, string> = {
  online: 'bg-blite-online',
  idle: 'bg-blite-idle',
  dnd: 'bg-blite-dnd',
  offline: 'bg-blite-offline',
}

export default function StatusIndicator({ status, size = 'md', className = '' }: StatusIndicatorProps) {
  return (
    <span
      className={`inline-block rounded-full ${sizeMap[size]} ${colorMap[status]} ${className}`}
      style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--blite-bg-primary)' }}
      title={status === 'dnd' ? 'Do Not Disturb' : status.charAt(0).toUpperCase() + status.slice(1)}
    />
  )
}
