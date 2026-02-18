// ===== User Types =====
export interface User {
  id: string
  username: string
  displayName: string
  email: string | null
  phoneNumber: string | null
  avatarUrl: string | null
  publicKey: string
  signingKey?: string | null
  bio?: string | null
  bannerUrl?: string | null
  status: UserStatus
  customStatus: string | null
  createdAt: number
}

export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline'

export interface UserProfile {
  id: string
  username: string
  displayName: string
  phoneNumber: string | null
  avatarUrl: string | null
  publicKey: string
  signingKey?: string | null
  bio?: string | null
  bannerUrl?: string | null
  status: UserStatus
  customStatus: string | null
}

// ===== Auth Types =====
export interface AuthResponse {
  token: string
  user: User
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  username: string
  email?: string
  password: string
  displayName: string
  publicKey: string
  phoneNumber?: string
  signingKey?: string
  keyBundle?: KeyBundlePayload
}

// ===== E2EE Key Bundle Types =====
export interface KeyBundlePayload {
  identityKey: string
  signingKey: string
  signedPreKey: string
  signedPreKeyId: number
  signedPreKeySig: string
  oneTimePreKeys: Array<{ keyId: number; publicKey: string }>
}

export interface RemoteKeyBundle {
  identityKey: string
  signingKey: string
  signedPreKey: string
  signedPreKeyId: number
  signedPreKeySig: string
  oneTimePreKey?: string
  oneTimePreKeyId?: number
}

export interface RecoveryBlobData {
  encrypted: string
  nonce: string
}

// ===== Server Types =====
export interface Server {
  id: string
  name: string
  iconUrl: string | null
  ownerId: string
  createdAt: number
}

export interface ServerWithChannels extends Server {
  channels: Channel[]
  members: ServerMember[]
}

// ===== Channel Types =====
export interface Channel {
  id: string
  serverId: string
  name: string
  type: ChannelType
  categoryId: string | null
  position: number
  messageExpiry?: string
  createdAt: number
}

export type ChannelType = 'text' | 'voice' | 'category'

// ===== Message Types =====
export interface Message {
  id: string
  channelId: string
  senderId: string
  encryptedContent: string
  nonce: string
  type: MessageType
  replyToId?: string | null
  replyTo?: ReplyToMessage | null
  reactions?: ReactionGroup[]
  isPinned?: boolean
  expiresAt?: string | null
  createdAt: number
  editedAt: number | null
  // Client-side only (after decryption)
  content?: string
  sender?: UserProfile
  linkPreviews?: LinkPreviewData[]
}

export interface ReplyToMessage {
  id: string
  senderId: string
  encryptedContent: string
  nonce: string
  sender?: UserProfile
  content?: string
}

export interface ReactionGroup {
  emoji: string
  count: number
  userIds: string[]
}

export interface LinkPreviewData {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

export type MessageType = 'text' | 'file' | 'system'

export interface SendMessagePayload {
  channelId: string
  encrypted: string
  nonce: string
  type: MessageType
  replyToId?: string
}

// ===== Pin Types =====
export interface Pin {
  id: string
  messageId: string
  channelId: string
  pinnedBy: string
  createdAt: string
  message?: Message
}

// ===== Ban Types =====
export interface Ban {
  id: string
  serverId: string
  userId: string
  bannedBy: string
  reason?: string
  createdAt: string
  user?: UserProfile
}

// ===== Block Types =====
export interface Block {
  blockerId: string
  blockedId: string
  createdAt: string
  user?: UserProfile
}

// ===== Server Members =====
export interface ServerMember {
  serverId: string
  userId: string
  roleId: string | null
  nickname: string | null
  joinedAt: number
  user?: UserProfile
  role?: Role
}

// ===== Roles & Permissions =====
export interface Role {
  id: string
  serverId: string
  name: string
  color: string
  permissions: number
  position: number
}

export const Permissions = {
  ADMIN: 1 << 0,
  MANAGE_SERVER: 1 << 1,
  MANAGE_CHANNELS: 1 << 2,
  MANAGE_ROLES: 1 << 3,
  KICK_MEMBERS: 1 << 4,
  BAN_MEMBERS: 1 << 5,
  SEND_MESSAGES: 1 << 6,
  READ_MESSAGES: 1 << 7,
  ATTACH_FILES: 1 << 8,
  MANAGE_MESSAGES: 1 << 9,
  CONNECT_VOICE: 1 << 10,
  SPEAK_VOICE: 1 << 11,
  CREATE_INVITES: 1 << 12,
} as const

export function hasPermission(userPerms: number, perm: number): boolean {
  if (userPerms & Permissions.ADMIN) return true
  return (userPerms & perm) !== 0
}

// ===== DM Types =====
export interface DMChannel {
  id: string
  type: 'dm' | 'group_dm'
  createdAt: number
  participants?: UserProfile[]
  lastMessage?: Message
}

// ===== Invite Types =====
export interface Invite {
  code: string
  serverId: string
  creatorId: string
  uses: number
  maxUses: number
  expiresAt: number | null
  createdAt: number
  server?: Server
}

// ===== Channel Keys =====
export interface ChannelKey {
  channelId: string
  userId: string
  encryptedKey: string
}

// ===== Socket Events =====
export interface TypingEvent {
  channelId: string
  userId: string
  typing: boolean
}

export interface PresenceEvent {
  userId: string
  status: UserStatus
}

export interface FileAttachment {
  id: string
  filename: string
  size: number
  mimeType: string
  url: string
}

// ===== Friend Types =====
export interface FriendRequest {
  id: string
  senderId: string
  receiverId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  sender?: UserProfile
  receiver?: UserProfile
}

export interface Friendship {
  userId: string
  friendId: string
  createdAt: string
  friend?: UserProfile
}

// ===== Audit Log Types =====
export interface AuditLog {
  id: string
  serverId: string
  userId: string
  action: string
  targetId: string | null
  targetType: string | null
  metadata: string | null
  createdAt: string
  user?: UserProfile
}
