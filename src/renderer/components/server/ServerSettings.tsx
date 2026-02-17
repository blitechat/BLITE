import React, { useState, useEffect, useRef } from 'react'
import { Settings, Users, Shield, Link, Trash2, Loader2, Plus, X, Check, Copy, Upload, ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@renderer/components/common/Modal'
import UserAvatar from '@renderer/components/user/UserAvatar'
import { useUIStore } from '@renderer/stores/uiStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useServerStore } from '@renderer/stores/serverStore'
import { usePresenceStore } from '@renderer/stores/presenceStore'
import { serverAPI, roleAPI, inviteAPI, channelAPI, uploadAPI, auditLogAPI } from '@renderer/services/api'
import { getAssetUrl } from '@renderer/services/config'
import type { Role, Invite, ServerMember, AuditLog } from '@shared/types'
import { Permissions } from '@shared/types'

type SettingsTab = 'overview' | 'roles' | 'members' | 'invites' | 'audit-log'

export default function ServerSettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview')
  const closeModal = useUIStore((s) => s.closeModal)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const servers = useServerStore((s) => s.servers)
  const activeServer = servers.find((s) => s.id === activeServerId)

  if (!activeServer || !activeServerId) return null

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Settings size={16} /> },
    { id: 'roles', label: 'Roles', icon: <Shield size={16} /> },
    { id: 'members', label: 'Members', icon: <Users size={16} /> },
    { id: 'invites', label: 'Invites', icon: <Link size={16} /> },
    { id: 'audit-log', label: 'Audit Log', icon: <ScrollText size={16} /> },
  ]

  return (
    <Modal title={`${activeServer.name} - Settings`} onClose={closeModal} width="max-w-3xl">
      <div className="flex gap-4 min-h-[450px] -mx-2">
        {/* Sidebar */}
        <div className="w-40 flex-shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-blite-bg-active text-blite-text-primary'
                  : 'text-blite-text-secondary hover:bg-blite-bg-hover hover:text-blite-text-primary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto max-h-[450px] pr-2">
          {activeTab === 'overview' && <OverviewTab serverId={activeServerId} />}
          {activeTab === 'roles' && <RolesTab serverId={activeServerId} />}
          {activeTab === 'members' && <MembersTab serverId={activeServerId} />}
          {activeTab === 'invites' && <InvitesTab serverId={activeServerId} />}
          {activeTab === 'audit-log' && <AuditLogTab serverId={activeServerId} />}
        </div>
      </div>
    </Modal>
  )
}

function OverviewTab({ serverId }: { serverId: string }) {
  const servers = useServerStore((s) => s.servers)
  const server = servers.find((s) => s.id === serverId)
  const currentUser = useAuthStore((s) => s.user)
  const removeServer = useServerStore((s) => s.removeServer)
  const updateServer = useServerStore((s) => s.updateServer)
  const closeModal = useUIStore((s) => s.closeModal)
  const [name, setName] = useState(server?.name || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploadingIcon, setUploadingIcon] = useState(false)
  const iconInputRef = useRef<HTMLInputElement>(null)

  const isOwner = server?.ownerId === currentUser?.id

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingIcon(true)
    try {
      const uploaded = await uploadAPI.upload(file)
      await serverAPI.update(serverId, { iconUrl: uploaded.url } as any)
      updateServer(serverId, { iconUrl: uploaded.url })
    } catch (err) {
      console.error('Failed to upload server icon:', err)
    } finally {
      setUploadingIcon(false)
      if (iconInputRef.current) iconInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await serverAPI.update(serverId, { name: name.trim() })
    } catch (err) {
      console.error('Failed to update server:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await serverAPI.delete(serverId)
      removeServer(serverId)
      closeModal()
    } catch (err) {
      console.error('Failed to delete server:', err)
    } finally {
      setDeleting(false)
    }
  }

  if (!server) return null

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide mb-3">
          Room Overview
        </h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative group">
            <div className="w-20 h-20 rounded-lg gradient-accent flex items-center justify-center text-2xl font-bold text-white glow-accent overflow-hidden">
              {server.iconUrl ? (
                <img src={getAssetUrl(server.iconUrl)} alt={server.name} className="w-full h-full rounded-lg object-cover" />
              ) : (
                server.name.charAt(0).toUpperCase()
              )}
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                disabled={uploadingIcon}
                className="absolute inset-0 rounded-lg bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploadingIcon ? (
                  <Loader2 size={20} className="text-white animate-spin" />
                ) : (
                  <Upload size={20} className="text-white" />
                )}
              </button>
            )}
            <input
              ref={iconInputRef}
              type="file"
              accept="image/*"
              onChange={handleIconUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-blite-text-secondary uppercase tracking-wide mb-1.5">
          Room Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
          disabled={!isOwner}
        />
      </div>

      {isOwner && (
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          Save Changes
        </button>
      )}

      {isOwner && (
        <div className="border-t border-blite-border pt-4">
          <h3 className="text-sm font-semibold text-blite-danger uppercase tracking-wide mb-2">
            Danger Zone
          </h3>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn-danger flex items-center gap-2"
            >
              <Trash2 size={14} />
              Delete Room
            </button>
          ) : (
            <div className="p-3 bg-blite-danger/10 border border-blite-danger/30 rounded-md">
              <p className="text-sm text-blite-danger mb-3">
                Are you sure? This action cannot be undone. All channels and messages will be permanently deleted.
              </p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={deleting} className="btn-danger flex items-center gap-2 text-sm">
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Yes, Delete Room
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RolesTab({ serverId }: { serverId: string }) {
  const rolesMap = useServerStore((s) => s.roles)
  const setRoles = useServerStore((s) => s.setRoles)
  const [roles, setLocalRoles] = useState<Role[]>(rolesMap[serverId] || [])
  const [creating, setCreating] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleColor, setNewRoleColor] = useState('#7c3aed')
  const [newRolePerms, setNewRolePerms] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadRoles()
  }, [serverId])

  const loadRoles = async () => {
    try {
      const fetched = await roleAPI.list(serverId)
      setLocalRoles(fetched)
      setRoles(serverId, fetched)
    } catch {
      // May not have permission
    }
  }

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return
    setLoading(true)
    try {
      const role = await roleAPI.create(serverId, {
        name: newRoleName.trim(),
        color: newRoleColor,
        permissions: newRolePerms,
      })
      setLocalRoles((prev) => [...prev, role])
      setRoles(serverId, [...roles, role])
      setNewRoleName('')
      setCreating(false)
    } catch (err) {
      console.error('Failed to create role:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    try {
      await roleAPI.delete(roleId)
      const updated = roles.filter((r) => r.id !== roleId)
      setLocalRoles(updated)
      setRoles(serverId, updated)
    } catch (err) {
      console.error('Failed to delete role:', err)
    }
  }

  const handleUpdateRole = async (roleId: string, data: Partial<Role>) => {
    try {
      const updated = await roleAPI.update(roleId, data)
      const newRoles = roles.map((r) => (r.id === roleId ? updated : r))
      setLocalRoles(newRoles)
      setRoles(serverId, newRoles)
    } catch (err) {
      console.error('Failed to update role:', err)
    }
  }

  const permissionFlags = [
    { key: 'ADMIN', label: 'Administrator', value: Permissions.ADMIN },
    { key: 'MANAGE_SERVER', label: 'Manage Server', value: Permissions.MANAGE_SERVER },
    { key: 'MANAGE_CHANNELS', label: 'Manage Channels', value: Permissions.MANAGE_CHANNELS },
    { key: 'MANAGE_ROLES', label: 'Manage Roles', value: Permissions.MANAGE_ROLES },
    { key: 'KICK_MEMBERS', label: 'Kick Members', value: Permissions.KICK_MEMBERS },
    { key: 'BAN_MEMBERS', label: 'Ban Members', value: Permissions.BAN_MEMBERS },
    { key: 'SEND_MESSAGES', label: 'Send Messages', value: Permissions.SEND_MESSAGES },
    { key: 'MANAGE_MESSAGES', label: 'Manage Messages', value: Permissions.MANAGE_MESSAGES },
    { key: 'CREATE_INVITES', label: 'Create Invites', value: Permissions.CREATE_INVITES },
  ]

  const togglePerm = (perm: number) => {
    setNewRolePerms((prev) => prev ^ perm)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide">
          Roles ({roles.length})
        </h3>
        <button
          onClick={() => setCreating(!creating)}
          className="btn-primary text-xs flex items-center gap-1 py-1.5 px-3"
        >
          <Plus size={12} />
          New Role
        </button>
      </div>

      {creating && (
        <div className="p-4 glass rounded-lg space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-blite-text-muted mb-1">Name</label>
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="input-field text-sm"
                placeholder="Role name"
                autoFocus
              />
            </div>
            <div className="w-24">
              <label className="block text-xs text-blite-text-muted mb-1">Color</label>
              <input
                type="color"
                value={newRoleColor}
                onChange={(e) => setNewRoleColor(e.target.value)}
                className="w-full h-[38px] rounded-md cursor-pointer border border-blite-glass-border bg-blite-bg-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-blite-text-muted mb-2">Permissions</label>
            <div className="grid grid-cols-2 gap-1.5">
              {permissionFlags.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-center gap-2 text-xs text-blite-text-secondary cursor-pointer hover:text-blite-text-primary"
                >
                  <input
                    type="checkbox"
                    checked={(newRolePerms & perm.value) !== 0}
                    onChange={() => togglePerm(perm.value)}
                    className="rounded border-blite-border"
                  />
                  {perm.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreateRole}
              disabled={!newRoleName.trim() || loading}
              className="btn-primary text-xs flex items-center gap-1 py-1.5 px-3"
            >
              {loading && <Loader2 size={12} className="animate-spin" />}
              Create
            </button>
            <button onClick={() => setCreating(false)} className="btn-secondary text-xs py-1.5 px-3">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Role list */}
      <div className="space-y-2">
        {roles.map((role) => (
          <RoleItem
            key={role.id}
            role={role}
            permissionFlags={permissionFlags}
            onUpdate={handleUpdateRole}
            onDelete={handleDeleteRole}
          />
        ))}
        {roles.length === 0 && (
          <p className="text-sm text-blite-text-muted text-center py-4">No roles created yet.</p>
        )}
      </div>
    </div>
  )
}

function RoleItem({
  role,
  permissionFlags,
  onUpdate,
  onDelete,
}: {
  role: Role
  permissionFlags: { key: string; label: string; value: number }[]
  onUpdate: (roleId: string, data: Partial<Role>) => Promise<void>
  onDelete: (roleId: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [editName, setEditName] = useState(role.name)
  const [editColor, setEditColor] = useState(role.color)
  const [editPerms, setEditPerms] = useState(role.permissions)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(role.id, {
      name: editName.trim() || role.name,
      color: editColor,
      permissions: editPerms,
    })
    setSaving(false)
    setExpanded(false)
  }

  return (
    <div className="glass rounded-md overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-blite-bg-hover transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />
          <span className="text-sm text-blite-text-primary">{role.name}</span>
          <span className="text-xs text-blite-text-muted font-mono">pos: {role.position}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(role.id) }}
          className="p-1 text-blite-text-muted hover:text-blite-danger transition-colors"
          title="Delete role"
        >
          <X size={14} />
        </button>
      </div>
      {expanded && (
        <div className="p-3 pt-0 space-y-3 border-t border-blite-border">
          <div className="flex gap-3 mt-3">
            <div className="flex-1">
              <label className="block text-xs text-blite-text-muted mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs text-blite-text-muted mb-1">Color</label>
              <input
                type="color"
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
                className="w-full h-[38px] rounded-md cursor-pointer border border-blite-glass-border bg-blite-bg-input"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-blite-text-muted mb-2">Permissions</label>
            <div className="grid grid-cols-2 gap-1.5">
              {permissionFlags.map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-center gap-2 text-xs text-blite-text-secondary cursor-pointer hover:text-blite-text-primary"
                >
                  <input
                    type="checkbox"
                    checked={(editPerms & perm.value) !== 0}
                    onChange={() => setEditPerms(p => p ^ perm.value)}
                    className="rounded border-blite-border"
                  />
                  {perm.label}
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-xs flex items-center gap-1 py-1.5 px-3"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save Role
          </button>
        </div>
      )}
    </div>
  )
}

function MembersTab({ serverId }: { serverId: string }) {
  const membersMap = useServerStore((s) => s.members)
  const setMembers = useServerStore((s) => s.setMembers)
  const roles = useServerStore((s) => s.roles[serverId] || [])
  const presences = usePresenceStore((s) => s.presences)
  const currentUser = useAuthStore((s) => s.user)
  const servers = useServerStore((s) => s.servers)
  const server = servers.find((s) => s.id === serverId)
  const [members, setLocalMembers] = useState<ServerMember[]>(membersMap[serverId] || [])

  useEffect(() => {
    loadMembers()
  }, [serverId])

  const loadMembers = async () => {
    try {
      const fetched = await serverAPI.getMembers(serverId)
      setLocalMembers(fetched)
      setMembers(serverId, fetched)
    } catch {
      // May not have permission
    }
  }

  const handleKick = async (userId: string) => {
    try {
      await serverAPI.kickMember(serverId, userId)
      const updated = members.filter((m) => m.userId !== userId)
      setLocalMembers(updated)
      setMembers(serverId, updated)
    } catch (err) {
      console.error('Failed to kick member:', err)
    }
  }

  const handleAssignRole = async (userId: string, roleId: string) => {
    try {
      await roleAPI.assignRole(serverId, userId, roleId)
      const updated = members.map((m) =>
        m.userId === userId ? { ...m, roleId: roleId || null } : m
      )
      setLocalMembers(updated)
      setMembers(serverId, updated)
    } catch (err) {
      console.error('Failed to assign role:', err)
    }
  }

  const isOwner = server?.ownerId === currentUser?.id

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide">
        Members ({members.length})
      </h3>

      <div className="space-y-1">
        {members.map((member) => {
          const role = roles.find((r) => r.id === member.roleId)
          const status = presences[member.userId] || 'offline'
          const displayName = member.nickname || member.user?.displayName || 'Unknown'

          return (
            <div
              key={member.userId}
              className="flex items-center justify-between p-2 rounded-md hover:bg-blite-bg-hover transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <UserAvatar
                  username={displayName}
                  avatarUrl={member.user?.avatarUrl}
                  status={status}
                  size="sm"
                />
                <div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: role?.color || 'var(--blite-text-primary)' }}
                  >
                    {displayName}
                  </span>
                  {role && (
                    <span className="ml-2 text-xs text-blite-text-muted">{role.name}</span>
                  )}
                </div>
              </div>

              {isOwner && member.userId !== currentUser?.id && (
                <div className="flex items-center gap-2">
                  <select
                    value={member.roleId || ''}
                    onChange={(e) => handleAssignRole(member.userId, e.target.value)}
                    className="text-xs input-field w-28 py-1"
                  >
                    <option value="">No Role</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleKick(member.userId)}
                    className="px-2 py-1 text-xs text-blite-danger hover:bg-blite-danger/10 rounded-md transition-colors"
                  >
                    Kick
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InvitesTab({ serverId }: { serverId: string }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setLoading(false)
  }, [serverId])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const invite = await inviteAPI.create(serverId)
      setInvites((prev) => [...prev, invite])
    } catch (err) {
      console.error('Failed to create invite:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(`https://blite.chat/invite/${code}`)
    } catch {
      // Fallback
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide">
          Invites
        </h3>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="btn-primary text-xs flex items-center gap-1 py-1.5 px-3"
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Create Invite
        </button>
      </div>

      <div className="space-y-2">
        {invites.map((invite) => (
          <div
            key={invite.code}
            className="flex items-center justify-between p-3 glass rounded-md"
          >
            <div>
              <p className="text-sm text-blite-text-primary font-mono">{invite.code}</p>
              <p className="text-xs text-blite-text-muted">
                {invite.uses} uses
                {invite.maxUses > 0 && ` / ${invite.maxUses} max`}
                {invite.expiresAt && ` - Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
              </p>
            </div>
            <button
              onClick={() => handleCopy(invite.code)}
              className="p-2 text-blite-text-muted hover:text-blite-text-primary hover:bg-blite-bg-hover rounded-md transition-colors"
              title="Copy invite link"
            >
              <Copy size={14} />
            </button>
          </div>
        ))}
        {invites.length === 0 && !loading && (
          <p className="text-sm text-blite-text-muted text-center py-4">
            No active invites. Create one to invite others.
          </p>
        )}
      </div>
    </div>
  )
}

const AUDIT_ACTIONS = [
  'SERVER_UPDATE',
  'CHANNEL_CREATE',
  'CHANNEL_UPDATE',
  'CHANNEL_DELETE',
  'MEMBER_KICK',
  'MEMBER_BAN',
  'MEMBER_UNBAN',
  'ROLE_CREATE',
  'ROLE_UPDATE',
  'ROLE_DELETE',
  'ROLE_ASSIGN',
]

function AuditLogTab({ serverId }: { serverId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLogs()
  }, [serverId, page, actionFilter])

  const loadLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await auditLogAPI.list(serverId, {
        page,
        limit: 25,
        action: actionFilter || undefined,
      })
      setLogs(result.logs)
      setTotalPages(result.pagination.totalPages)
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setError('Admin permission required to view audit logs.')
      } else {
        setError('Failed to load audit logs.')
      }
    } finally {
      setLoading(false)
    }
  }

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString()
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <ScrollText size={32} className="mx-auto text-blite-text-muted mb-2" />
        <p className="text-sm text-blite-text-muted">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blite-text-secondary uppercase tracking-wide">
          Audit Log
        </h3>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
          className="text-xs input-field w-40"
        >
          <option value="">All Actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>{formatAction(a)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-blite-text-muted" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-blite-text-muted text-center py-8">No audit log entries found.</p>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => {
            let details = ''
            if (log.metadata) {
              try {
                const meta = JSON.parse(log.metadata)
                details = Object.entries(meta)
                  .filter(([, v]) => v != null)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')
              } catch { /* ignore */ }
            }
            return (
              <div key={log.id} className="p-2.5 glass rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      username={log.user?.displayName || 'Unknown'}
                      avatarUrl={log.user?.avatarUrl}
                      size="xs"
                    />
                    <span className="text-sm font-medium text-blite-text-primary">
                      {log.user?.displayName || 'Unknown'}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blite-bg-hover text-blite-text-secondary font-mono">
                      {formatAction(log.action)}
                    </span>
                  </div>
                  <span className="text-xs text-blite-text-muted">{formatTime(log.createdAt)}</span>
                </div>
                {details && (
                  <p className="text-xs text-blite-text-muted mt-1 ml-8">{details}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1 rounded hover:bg-blite-bg-hover disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-blite-text-secondary">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1 rounded hover:bg-blite-bg-hover disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
