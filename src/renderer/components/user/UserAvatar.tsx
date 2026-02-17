import React, { useMemo } from 'react'
import StatusIndicator from './StatusIndicator'
import { getAssetUrl } from '@renderer/services/config'
import type { UserStatus } from '@shared/types'

interface UserAvatarProps {
  username: string
  avatarUrl?: string | null
  status?: UserStatus
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showStatus?: boolean
  className?: string
}

const sizeClasses = {
  xs: 'w-5 h-5 text-[8px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-20 h-20 text-2xl',
}

const statusPosition = {
  xs: '-bottom-0.5 -right-0.5',
  sm: '-bottom-0.5 -right-0.5',
  md: '-bottom-0.5 -right-0.5',
  lg: '-bottom-1 -right-1',
}

const statusSize: Record<string, 'sm' | 'md' | 'lg'> = {
  xs: 'sm',
  sm: 'sm',
  md: 'sm',
  lg: 'md',
}

function hashUsername(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash
  }
  return Math.abs(hash)
}

const avatarColors = [
  'bg-violet-600',
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-fuchsia-600',
  'bg-lime-600',
  'bg-orange-600',
  'bg-teal-600',
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const UserAvatar = React.memo(function UserAvatar({
  username,
  avatarUrl,
  status,
  size = 'md',
  showStatus = true,
  className = '',
}: UserAvatarProps) {
  // Memoize color calculation to avoid recomputing on every render
  const bgColor = useMemo(() => {
    const colorIndex = hashUsername(username) % avatarColors.length
    return avatarColors[colorIndex]
  }, [username])

  // Memoize initials calculation
  const initials = useMemo(() => getInitials(username), [username])

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className}`}>
      {avatarUrl ? (
        <img
          src={getAssetUrl(avatarUrl)}
          alt={username}
          className={`${sizeClasses[size]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${sizeClasses[size]} ${bgColor} rounded-full flex items-center justify-center font-semibold text-white select-none`}
        >
          {initials}
        </div>
      )}
      {showStatus && status && (
        <div className={`absolute ${statusPosition[size]}`}>
          <StatusIndicator status={status} size={statusSize[size]} />
        </div>
      )}
    </div>
  )
})

export default UserAvatar
