import React, { useEffect, useState } from 'react'
import UserAvatar from '@renderer/components/user/UserAvatar'
import UserPopover from '@renderer/components/user/UserPopover'
import { useServerStore } from '@renderer/stores/serverStore'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { useVoiceStore } from '@renderer/stores/voiceStore'
import { serverAPI, roleAPI } from '@renderer/services/api'
import type { ServerMember, Role, UserProfile, UserStatus } from '@shared/types'

export default function MemberSidebar() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const membersMap = useServerStore((s) => s.members)
  const rolesMap = useServerStore((s) => s.roles)
  const setMembers = useServerStore((s) => s.setMembers)
  const setRoles = useServerStore((s) => s.setRoles)
  const presences = usePresenceStore((s) => s.presences)
  const activeSpeakerId = useVoiceStore((s) => s.activeSpeakerId)
  const [popover, setPopover] = useState<{ user: UserProfile; x: number; y: number } | null>(null)

  const members = activeServerId ? membersMap[activeServerId] || [] : []
  const roles = activeServerId ? rolesMap[activeServerId] || [] : []

  useEffect(() => {
    if (!activeServerId) return

    const loadData = async () => {
      try {
        const [fetchedMembers, fetchedRoles] = await Promise.all([
          serverAPI.getMembers(activeServerId),
          roleAPI.list(activeServerId).catch(() => []),
        ])
        setMembers(activeServerId, fetchedMembers)
        setRoles(activeServerId, fetchedRoles)
      } catch (err) {
        console.error('Failed to load members:', err)
      }
    }

    // Always load fresh data when server changes
    loadData()
  }, [activeServerId, setMembers, setRoles])

  // Group members by role and status
  const roleGroups = groupMembersByRole(members, roles, presences)

  const handleMemberClick = (member: ServerMember, e: React.MouseEvent) => {
    if (member.user) {
      setPopover({ user: member.user, x: e.clientX - 280, y: e.clientY })
    }
  }

  const totalCount = members.length

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 flex-shrink-0">
        <p className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide">
          Members -- {totalCount}
        </p>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {roleGroups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="text-xs font-semibold text-blite-text-muted uppercase tracking-wide px-2 mb-1">
              {group.label} -- {group.members.length}
            </p>
            {group.members.map((member) => {
              const displayName = member.nickname || member.user?.displayName || 'Unknown'
              const status = presences[member.userId] || 'offline'
              const role = roles.find((r) => r.id === member.roleId)
              const isSpeaking = activeSpeakerId === member.userId

              return (
                <button
                  key={member.userId}
                  onClick={(e) => handleMemberClick(member, e)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-blite-bg-hover transition-all group ${isSpeaking ? 'bg-blite-success/10' : ''}`}
                >
                  <UserAvatar
                    username={displayName}
                    avatarUrl={member.user?.avatarUrl}
                    status={status}
                    size="sm"
                    showStatus={true}
                    className={isSpeaking ? 'ring-2 ring-blite-success rounded-full' : ''}
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <p
                      className="text-sm truncate"
                      style={{ color: isSpeaking ? 'var(--blite-success)' : (role?.color || 'var(--blite-text-primary)') }}
                    >
                      {displayName}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* User Popover */}
      {popover && (
        <UserPopover
          user={popover.user}
          onClose={() => setPopover(null)}
          position={{ x: popover.x, y: popover.y }}
          serverId={activeServerId}
        />
      )}
    </div>
  )
}

interface MemberGroup {
  label: string
  members: ServerMember[]
}

function groupMembersByRole(
  members: ServerMember[],
  roles: Role[],
  presences: Record<string, UserStatus>
): MemberGroup[] {
  const groups: MemberGroup[] = []

  // Sort roles by position
  const sortedRoles = [...roles].sort((a, b) => b.position - a.position)

  // Online members first within each group
  const sortByStatus = (a: ServerMember, b: ServerMember): number => {
    const statusPriority: Record<UserStatus, number> = {
      online: 0,
      idle: 1,
      dnd: 2,
      offline: 3,
    }
    const aStatus = presences[a.userId] || 'offline'
    const bStatus = presences[b.userId] || 'offline'
    return statusPriority[aStatus] - statusPriority[bStatus]
  }

  // Group by role
  const assigned = new Set<string>()

  for (const role of sortedRoles) {
    const roleMembers = members
      .filter((m) => m.roleId === role.id && !assigned.has(m.userId))
      .sort(sortByStatus)

    if (roleMembers.length > 0) {
      groups.push({ label: role.name, members: roleMembers })
      roleMembers.forEach((m) => assigned.add(m.userId))
    }
  }

  // Online members without role
  const onlineNoRole = members
    .filter((m) => {
      if (assigned.has(m.userId)) return false
      const status = presences[m.userId] || 'offline'
      return status !== 'offline'
    })
    .sort(sortByStatus)

  if (onlineNoRole.length > 0) {
    groups.push({ label: 'Online', members: onlineNoRole })
    onlineNoRole.forEach((m) => assigned.add(m.userId))
  }

  // Offline members
  const offlineMembers = members
    .filter((m) => !assigned.has(m.userId))
    .sort(sortByStatus)

  if (offlineMembers.length > 0) {
    groups.push({ label: 'Offline', members: offlineMembers })
  }

  return groups
}
