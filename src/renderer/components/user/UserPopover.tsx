import React, { useEffect, useRef, useState } from 'react'
import { MessageSquare, X, ShieldBan, Ban, UserX } from 'lucide-react'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useDMStore } from '@renderer/stores/dmStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { dmAPI, moderationAPI, blockAPI } from '@renderer/services/api'
import UserAvatar from './UserAvatar'
import type { UserProfile, Role } from '@shared/types'

interface UserPopoverProps {
  user: UserProfile
  onClose: () => void
  position: { x: number; y: number }
  serverId?: string | null
}

export default function UserPopover({ user, onClose, position, serverId }: UserPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const presences = usePresenceStore((s) => s.presences)
  const currentUser = useAuthStore((s) => s.user)
  const members = useServerStore((s) => s.members)
  const roles = useServerStore((s) => s.roles)
  const addDMChannel = useDMStore((s) => s.addDMChannel)
  const setActiveDM = useDMStore((s) => s.setActiveDM)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const [coords, setCoords] = useState(position)

  const status = presences[user.id] || 'offline'

  const serverRoles: Role[] = []
  if (serverId) {
    const serverMembers = members[serverId] || []
    const member = serverMembers.find((m) => m.userId === user.id)
    const serverRoleList = roles[serverId] || []
    if (member?.roleId) {
      const role = serverRoleList.find((r) => r.id === member.roleId)
      if (role) serverRoles.push(role)
    }
  }

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Clamp to viewport
  useEffect(() => {
    if (popoverRef.current) {
      const rect = popoverRef.current.getBoundingClientRect()
      let x = position.x
      let y = position.y
      if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8
      if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8
      if (x < 0) x = 8
      if (y < 0) y = 8
      setCoords({ x, y })
    }
  }, [position])

  const activeServerId = useServerStore((s) => s.activeServerId)
  const blockedUserIds = useServerStore((s) => s.blockedUserIds)
  const addBlockedUser = useServerStore((s) => s.addBlockedUser)
  const removeBlockedUser = useServerStore((s) => s.removeBlockedUser)
  const removeMember = useServerStore((s) => s.removeMember)

  const isBlocked = blockedUserIds.has(user.id)

  const handleSendMessage = async () => {
    if (!currentUser || user.id === currentUser.id) return
    try {
      const dm = await dmAPI.create(user.id)
      addDMChannel(dm)
      setActiveDM(dm.id)
      setActiveView('dms')
      onClose()
    } catch (err) {
      console.error('Failed to create DM:', err)
    }
  }

  const handleBlock = async () => {
    try {
      if (isBlocked) {
        await blockAPI.unblock(user.id)
        removeBlockedUser(user.id)
      } else {
        await blockAPI.block(user.id)
        addBlockedUser(user.id)
      }
      onClose()
    } catch (err) {
      console.error('Failed to block/unblock:', err)
    }
  }

  const handleKick = async () => {
    if (!activeServerId) return
    try {
      await moderationAPI.kick(activeServerId, user.id)
      removeMember(activeServerId, user.id)
      onClose()
    } catch (err) {
      console.error('Failed to kick:', err)
    }
  }

  const handleBan = async () => {
    if (!activeServerId) return
    try {
      await moderationAPI.ban(activeServerId, user.id)
      removeMember(activeServerId, user.id)
      onClose()
    } catch (err) {
      console.error('Failed to ban:', err)
    }
  }

  return (
    <div
      ref={popoverRef}
      className="fixed z-[60] w-72 glass rounded-lg shadow-2xl glow-accent-sm overflow-hidden"
      style={{ left: coords.x, top: coords.y, background: 'var(--blite-bg-primary)' }}
    >
      {/* Banner */}
      <div
        className="h-16 relative"
        style={{
          background: user.bannerUrl
            ? `url(${user.bannerUrl}) center/cover`
            : 'linear-gradient(135deg, var(--blite-gradient-start), var(--blite-gradient-end))',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-0.5 rounded text-white/70 hover:text-white hover:bg-white/20 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Avatar (overlapping banner) */}
      <div className="px-4 -mt-8">
        <div className="rounded-full inline-block" style={{ borderWidth: '4px', borderStyle: 'solid', borderColor: 'var(--blite-bg-primary)' }}>
          <UserAvatar
            username={user.displayName || user.username}
            avatarUrl={user.avatarUrl}
            status={status}
            size="lg"
            showStatus={true}
          />
        </div>
      </div>

      {/* User Info */}
      <div className="px-4 pt-2 pb-3">
        <h3 className="text-lg font-semibold text-blite-text-primary">{user.displayName}</h3>
        <p className="text-sm text-blite-text-secondary font-mono">@{user.username}</p>

        {user.customStatus && (
          <p className="mt-1 text-sm text-blite-text-secondary italic">{user.customStatus}</p>
        )}

        {/* Bio */}
        {user.bio && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1">About Me</p>
            <p className="text-sm text-blite-text-secondary whitespace-pre-wrap">{user.bio}</p>
          </div>
        )}

        {/* Role Badges */}
        {serverRoles.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1">Roles</p>
            <div className="flex flex-wrap gap-1">
              {serverRoles.map((role) => (
                <span
                  key={role.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blite-bg-hover border border-blite-glass-border"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: role.color }}
                  />
                  <span className="text-blite-text-primary">{role.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {currentUser && user.id !== currentUser.id && (
          <div className="mt-3 space-y-1.5">
            <button
              onClick={handleSendMessage}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm h-9"
            >
              <MessageSquare size={14} />
              Send Message
            </button>

            <button
              onClick={handleBlock}
              className="w-full flex items-center justify-center gap-2 text-sm h-8 rounded-md transition-colors text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary"
            >
              <ShieldBan size={14} />
              {isBlocked ? 'Unblock' : 'Block'}
            </button>

            {activeServerId && (
              <div className="flex gap-1.5">
                <button
                  onClick={handleKick}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs h-7 rounded-md transition-colors text-blite-text-muted hover:bg-blite-danger/10 hover:text-blite-danger"
                >
                  <UserX size={12} />
                  Kick
                </button>
                <button
                  onClick={handleBan}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs h-7 rounded-md transition-colors text-blite-text-muted hover:bg-blite-danger/10 hover:text-blite-danger"
                >
                  <Ban size={12} />
                  Ban
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
