import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  Server,
  Channel,
  Message,
  ServerMember,
  Role,
  DMChannel,
  Invite,
  UserProfile,
  ChannelKey,
  FriendRequest,
  Friendship,
  Pin,
  Ban,
  Block,
  LinkPreviewData,
  KeyBundlePayload,
  RemoteKeyBundle,
  RecoveryBlobData,
  AuditLog,
} from '@shared/types'

import { PRODUCTION_URL } from './config'

function getApiUrl(): string {
  const isElectron = typeof window !== 'undefined' && !!window.api
  const viteUrl = import.meta.env.VITE_API_URL

  // Skip relative URLs in Electron (file:// origin can't resolve them)
  if (viteUrl && !(isElectron && viteUrl.startsWith('/'))) return viteUrl

  // Check localStorage override first (allows user to configure)
  const override = typeof window !== 'undefined' && localStorage.getItem('blite_backend_url')
  if (override) return `${override}/api`

  // For Electron, always use production URL (it's running as installed app)
  if (isElectron) {
    return `${PRODUCTION_URL}/api`
  }

  // Web browser defaults to localhost for development
  return 'http://localhost:3001/api'
}

const API_URL = getApiUrl()

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

// Attach JWT to all requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auth
export const authAPI = {
  register: (data: RegisterRequest) =>
    api.post<AuthResponse>('/auth/register', data).then((r) => r.data),

  login: (data: LoginRequest) =>
    api.post<AuthResponse>('/auth/login', data).then((r) => r.data),

  me: () =>
    api.get<AuthResponse>('/auth/me').then((r) => r.data)
}

// Servers
export const serverAPI = {
  list: () =>
    api.get<Server[]>('/servers').then((r) => r.data),

  get: (serverId: string) =>
    api.get<Server>(`/servers/${serverId}`).then((r) => r.data),

  create: (name: string, iconUrl?: string) =>
    api.post<{ server: Server; channel: Channel }>('/servers', { name, iconUrl }).then((r) => r.data),

  update: (serverId: string, data: Partial<Server>) =>
    api.put<Server>(`/servers/${serverId}`, data).then((r) => r.data),

  delete: (serverId: string) =>
    api.delete(`/servers/${serverId}`).then((r) => r.data),

  join: (inviteCode: string) =>
    api.post<{ server: Server }>('/servers/join', { code: inviteCode }).then((r) => r.data),

  leave: (serverId: string) =>
    api.post(`/servers/${serverId}/leave`).then((r) => r.data),

  getMembers: (serverId: string) =>
    api.get<{ members: ServerMember[] }>(`/servers/${serverId}/members`).then((r) => r.data.members),

  kickMember: (serverId: string, userId: string) =>
    api.delete(`/servers/${serverId}/members/${userId}`).then((r) => r.data)
}

// Channels
export const channelAPI = {
  list: (serverId: string) =>
    api.get<{ channels: Channel[] }>(`/servers/${serverId}/channels`).then((r) => r.data.channels),

  create: (serverId: string, name: string, type: string, categoryId?: string) =>
    api.post<{ channel: Channel }>(`/servers/${serverId}/channels`, { name, type, categoryId }).then((r) => r.data.channel),

  update: (channelId: string, data: Partial<Channel>) =>
    api.put<{ channel: Channel }>(`/channels/${channelId}`, data).then((r) => r.data.channel),

  delete: (channelId: string) =>
    api.delete(`/channels/${channelId}`).then((r) => r.data)
}

// Messages
export const messageAPI = {
  list: (channelId: string, before?: string, limit = 50, signal?: AbortSignal) =>
    api.get<{ messages: Message[]; hasMore: boolean }>(`/channels/${channelId}/messages`, {
      params: { before, limit },
      signal
    }).then((r) => r.data),
}

// Roles
export const roleAPI = {
  list: (serverId: string) =>
    api.get<Role[]>(`/servers/${serverId}/roles`).then((r) => r.data),

  create: (serverId: string, data: { name: string; color: string; permissions: number }) =>
    api.post<Role>(`/servers/${serverId}/roles`, data).then((r) => r.data),

  update: (roleId: string, data: Partial<Role>) =>
    api.put<Role>(`/roles/${roleId}`, data).then((r) => r.data),

  delete: (roleId: string) =>
    api.delete(`/roles/${roleId}`).then((r) => r.data),

  assignRole: (serverId: string, userId: string, roleId: string) =>
    api.post(`/servers/${serverId}/members/${userId}/role`, { roleId }).then((r) => r.data)
}

// DMs
export const dmAPI = {
  list: () =>
    api.get<{ dmChannels: DMChannel[] }>('/dms').then((r) => r.data.dmChannels),

  create: (userId: string) =>
    api.post<{ dmChannel: DMChannel }>('/dms', { userId }).then((r) => r.data.dmChannel),

  createGroup: (userIds: string[]) =>
    api.post<{ dmChannel: DMChannel }>('/dms/group', { userIds }).then((r) => r.data.dmChannel)
}

// Invites
export const inviteAPI = {
  create: (serverId: string, maxUses?: number, expiresIn?: number) =>
    api.post<{ invite: Invite }>(`/servers/${serverId}/invites`, { maxUses, expiresIn }).then((r) => r.data.invite),

  get: (code: string) =>
    api.get<{ invite: any }>(`/invites/${code}`).then((r) => r.data.invite)
}

// Users
export const userAPI = {
  getProfile: (userId: string) =>
    api.get<{ user: UserProfile }>(`/users/${userId}`).then((r) => r.data.user),

  getPublicKey: (userId: string) =>
    api.get<{ publicKey: string; userId: string; username: string }>(`/users/${userId}/key`).then((r) => r.data),

  search: (query: string) =>
    api.get<{ users: UserProfile[] }>('/users/search', { params: { q: query } }).then((r) => r.data.users),

  updateProfile: (data: { displayName?: string; avatarUrl?: string; customStatus?: string; phoneNumber?: string; bio?: string; bannerUrl?: string }) =>
    api.put<{ user: UserProfile }>('/users/me', data).then((r) => r.data.user)
}

// Friends
export const friendAPI = {
  list: () =>
    api.get<Friendship[]>('/friends').then((r) => r.data),

  sendRequest: (username: string) =>
    api.post<{ request?: FriendRequest; friendship?: Friendship; autoAccepted?: boolean }>('/friends/request', { username }).then((r) => r.data),

  getIncomingRequests: () =>
    api.get<FriendRequest[]>('/friends/requests/incoming').then((r) => r.data),

  getOutgoingRequests: () =>
    api.get<FriendRequest[]>('/friends/requests/outgoing').then((r) => r.data),

  acceptRequest: (requestId: string) =>
    api.post<Friendship>(`/friends/request/${requestId}/accept`).then((r) => r.data),

  rejectRequest: (requestId: string) =>
    api.post(`/friends/request/${requestId}/reject`).then((r) => r.data),

  removeFriend: (friendId: string) =>
    api.delete(`/friends/${friendId}`).then((r) => r.data),
}

// Channel Keys (E2E)
export const channelKeyAPI = {
  getKey: (channelId: string, senderId?: string) =>
    api.get<ChannelKey>(`/channels/${channelId}/key`, { params: senderId ? { senderId } : undefined }).then((r) => r.data),

  setKeys: (channelId: string, keys: { userId: string; encryptedKey: string }[], senderId?: string) =>
    api.post(`/channels/${channelId}/keys`, { keys, senderId }).then((r) => r.data)
}

// E2EE Key Management
export const keyAPI = {
  uploadBundle: (bundle: KeyBundlePayload) =>
    api.post('/keys/bundle', bundle).then((r) => r.data),

  getBundle: (userId: string) =>
    api.get<RemoteKeyBundle>(`/keys/bundle/${userId}`).then((r) => r.data),

  uploadPrekeys: (prekeys: Array<{ keyId: number; publicKey: string }>) =>
    api.post('/keys/prekeys', { prekeys }).then((r) => r.data),

  getPrekeyCount: () =>
    api.get<{ count: number }>('/keys/prekeys/count').then((r) => r.data.count),

  uploadRecovery: (data: RecoveryBlobData) =>
    api.post('/keys/recovery', data).then((r) => r.data),

  getRecovery: () =>
    api.get<RecoveryBlobData>('/keys/recovery').then((r) => r.data),
}

// File Upload
export const uploadAPI = {
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ file: { url: string; filename: string; size: number; mimetype: string } }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then((r) => r.data.file)
  },

  uploadEncrypted: (blob: Blob) => {
    const file = new File([blob], `${Date.now()}.enc`, { type: 'application/octet-stream' })
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ file: { url: string; filename: string; size: number; mimetype: string } }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then((r) => r.data.file)
  }
}

// Pins
export const pinAPI = {
  pin: (channelId: string, messageId: string) =>
    api.post<{ pin: Pin }>(`/channels/${channelId}/pins`, { messageId }).then((r) => r.data.pin),

  unpin: (channelId: string, messageId: string) =>
    api.delete(`/channels/${channelId}/pins/${messageId}`).then((r) => r.data),

  list: (channelId: string) =>
    api.get<{ pins: Pin[] }>(`/channels/${channelId}/pins`).then((r) => r.data.pins),
}

// Search
export const searchAPI = {
  search: (channelId: string, query: string) =>
    api.get<{ messages: Message[] }>(`/channels/${channelId}/search`, { params: { q: query } }).then((r) => r.data.messages),
}

// Moderation
export const moderationAPI = {
  kick: (serverId: string, userId: string) =>
    api.delete(`/servers/${serverId}/members/${userId}`).then((r) => r.data),

  ban: (serverId: string, userId: string, reason?: string) =>
    api.post<{ ban: Ban }>(`/servers/${serverId}/bans`, { userId, reason }).then((r) => r.data.ban),

  unban: (serverId: string, userId: string) =>
    api.delete(`/servers/${serverId}/bans/${userId}`).then((r) => r.data),

  listBans: (serverId: string) =>
    api.get<{ bans: Ban[] }>(`/servers/${serverId}/bans`).then((r) => r.data.bans),
}

// Read positions
export const readAPI = {
  markRead: (channelId: string, messageId?: string) =>
    api.post(`/channels/${channelId}/read`, { messageId }).then((r) => r.data),

  getPositions: () =>
    api.get<{ positions: { channelId: string; lastReadMessageId: string | null; lastReadAt: string }[] }>('/read-positions').then((r) => r.data.positions),
}

// Blocks
export const blockAPI = {
  block: (userId: string) =>
    api.post<{ block: Block }>('/blocks', { userId }).then((r) => r.data.block),

  unblock: (userId: string) =>
    api.delete(`/blocks/${userId}`).then((r) => r.data),

  list: () =>
    api.get<{ blocks: Block[] }>('/blocks').then((r) => r.data.blocks),
}

// Link Previews
export const linkPreviewAPI = {
  fetch: (url: string) =>
    api.post<{ preview: LinkPreviewData }>('/messages/link-preview', { url }).then((r) => r.data.preview),
}

// Audit Log
export const auditLogAPI = {
  list: (serverId: string, params?: { page?: number; limit?: number; action?: string }) =>
    api.get<{ logs: AuditLog[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }>(
      `/servers/${serverId}/audit-log`,
      { params }
    ).then((r) => r.data),
}

export default api
