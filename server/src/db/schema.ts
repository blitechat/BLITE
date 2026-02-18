import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

// ─── Users ──────────────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  email: text('email').unique(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  publicKey: text('public_key'),
  phoneNumber: text('phone_number'),
  status: text('status', { enum: ['online', 'idle', 'dnd', 'offline'] }).notNull().default('offline'),
  customStatus: text('custom_status'),
  signingKey: text('signing_key'),
  bio: text('bio'),
  bannerUrl: text('banner_url'),
  createdAt: text('created_at').notNull(),
});

// ─── Servers ────────────────────────────────────────────────────────────────
export const servers = sqliteTable('servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  iconUrl: text('icon_url'),
  ownerId: text('owner_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
});

// ─── Channels ───────────────────────────────────────────────────────────────
export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['text', 'voice', 'category'] }).notNull().default('text'),
  categoryId: text('category_id'),
  position: integer('position').notNull().default(0),
  messageExpiry: text('message_expiry').default('never'),
  createdAt: text('created_at').notNull(),
});

// ─── Messages ───────────────────────────────────────────────────────────────
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull(),
  senderId: text('sender_id').notNull().references(() => users.id),
  encryptedContent: text('encrypted_content').notNull(),
  nonce: text('nonce'),
  type: text('type', { enum: ['text', 'file', 'system'] }).notNull().default('text'),
  replyToId: text('reply_to_id'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
  editedAt: text('edited_at'),
}, (table) => ({
  senderIdIdx: index('messages_sender_id_idx').on(table.senderId),
  channelIdIdx: index('messages_channel_id_idx').on(table.channelId),
}));

// ─── Server Members ─────────────────────────────────────────────────────────
export const serverMembers = sqliteTable('server_members', {
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  roleId: text('role_id'),
  nickname: text('nickname'),
  joinedAt: text('joined_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.serverId, table.userId] }),
}));

// ─── Roles ──────────────────────────────────────────────────────────────────
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').default('#99aab5'),
  permissions: integer('permissions').notNull().default(0),
  position: integer('position').notNull().default(0),
});

// ─── DM Channels ────────────────────────────────────────────────────────────
export const dmChannels = sqliteTable('dm_channels', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['dm', 'group_dm'] }).notNull().default('dm'),
  createdAt: text('created_at').notNull(),
});

// ─── DM Participants ────────────────────────────────────────────────────────
export const dmParticipants = sqliteTable('dm_participants', {
  dmChannelId: text('dm_channel_id').notNull().references(() => dmChannels.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.dmChannelId, table.userId] }),
}));

// ─── Channel Keys (E2EE) ───────────────────────────────────────────────────
export const channelKeys = sqliteTable('channel_keys', {
  channelId: text('channel_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  senderId: text('sender_id').notNull().default(''),
  encryptedKey: text('encrypted_key').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.channelId, table.userId, table.senderId] }),
}));

// ─── Invites ────────────────────────────────────────────────────────────────
export const invites = sqliteTable('invites', {
  code: text('code').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  creatorId: text('creator_id').notNull().references(() => users.id),
  uses: integer('uses').notNull().default(0),
  maxUses: integer('max_uses').default(0),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
});

// ─── Friend Requests ───────────────────────────────────────────────────────
export const friendRequests = sqliteTable('friend_requests', {
  id: text('id').primaryKey(),
  senderId: text('sender_id').notNull().references(() => users.id),
  receiverId: text('receiver_id').notNull().references(() => users.id),
  status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull().default('pending'),
  createdAt: text('created_at').notNull(),
});

// ─── Friendships ───────────────────────────────────────────────────────────
export const friendships = sqliteTable('friendships', {
  userId: text('user_id').notNull().references(() => users.id),
  friendId: text('friend_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.friendId] }),
}));

// ─── Reactions ──────────────────────────────────────────────────────────────
export const reactions = sqliteTable('reactions', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  emoji: text('emoji').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  messageUserEmojiIdx: index('reactions_message_user_emoji_idx').on(table.messageId, table.userId, table.emoji),
}));

// ─── Pins ───────────────────────────────────────────────────────────────────
export const pins = sqliteTable('pins', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull(),
  channelId: text('channel_id').notNull(),
  pinnedBy: text('pinned_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
});

// ─── Bans ───────────────────────────────────────────────────────────────────
export const bans = sqliteTable('bans', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  bannedBy: text('banned_by').notNull().references(() => users.id),
  reason: text('reason'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  serverUserIdx: index('bans_server_user_idx').on(table.serverId, table.userId),
  userIdIdx: index('bans_user_id_idx').on(table.userId),
}));

// ─── Blocks ─────────────────────────────────────────────────────────────────
export const blocks = sqliteTable('blocks', {
  blockerId: text('blocker_id').notNull().references(() => users.id),
  blockedId: text('blocked_id').notNull().references(() => users.id),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.blockerId, table.blockedId] }),
}));

// ─── Read Positions ─────────────────────────────────────────────────────────
export const readPositions = sqliteTable('read_positions', {
  channelId: text('channel_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  lastReadMessageId: text('last_read_message_id'),
  lastReadAt: text('last_read_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.channelId, table.userId] }),
}));

// ─── Prekey Bundles (E2EE X3DH) ────────────────────────────────────────────
export const prekeyBundles = sqliteTable('prekey_bundles', {
  userId: text('user_id').primaryKey().references(() => users.id),
  identityKey: text('identity_key').notNull(),
  signingKey: text('signing_key').notNull(),
  signedPreKey: text('signed_pre_key').notNull(),
  signedPreKeyId: integer('signed_pre_key_id').notNull(),
  signedPreKeySig: text('signed_pre_key_sig').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── One-Time Prekeys (E2EE X3DH) ──────────────────────────────────────────
export const oneTimePrekeys = sqliteTable('one_time_prekeys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  keyId: integer('key_id').notNull(),
  publicKey: text('public_key').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  userIdIdx: index('otp_user_id_idx').on(table.userId),
}));

// ─── Recovery Keys (E2EE) ──────────────────────────────────────────────────
export const recoveryKeys = sqliteTable('recovery_keys', {
  userId: text('user_id').primaryKey().references(() => users.id),
  encryptedBlob: text('encrypted_blob').notNull(),
  nonce: text('nonce').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── Audit Logs ────────────────────────────────────────────────────────────
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  targetId: text('target_id'),
  targetType: text('target_type'),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  serverIdIdx: index('audit_logs_server_id_idx').on(table.serverId),
}));

// ─── Feedback ───────────────────────────────────────────────────────────────
export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  username: text('username').notNull(),
  type: text('type').notNull(), // 'bug' | 'feature' | 'general'
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  createdAt: text('created_at').notNull(),
});

// ─── Push Subscriptions ───────────────────────────────────────────────────
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  userIdIdx: index('push_subscriptions_user_id_idx').on(table.userId),
}));
