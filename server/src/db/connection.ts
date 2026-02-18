import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DB_PATH } from '../config';
import * as schema from './schema';

// Ensure the data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create the SQLite connection
const sqlite = new Database(DB_PATH);

// Optimize SQLite for better performance
sqlite.pragma('journal_mode = WAL');          // Write-Ahead Logging for concurrency
sqlite.pragma('foreign_keys = ON');           // Enforce foreign key constraints
sqlite.pragma('synchronous = NORMAL');        // Balance between safety and speed
sqlite.pragma('cache_size = -64000');         // 64MB cache (negative = KB)
sqlite.pragma('temp_store = MEMORY');         // Store temp tables in memory
sqlite.pragma('mmap_size = 268435456');       // Memory-mapped I/O (256MB)
sqlite.pragma('page_size = 4096');            // Optimal page size
sqlite.pragma('wal_autocheckpoint = 1000');   // Checkpoint every 1000 pages

console.log('[Database] SQLite optimizations applied');

// Create all tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    public_key TEXT,
    status TEXT NOT NULL DEFAULT 'offline',
    custom_status TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon_url TEXT,
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    category_id TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    sender_id TEXT NOT NULL REFERENCES users(id),
    encrypted_content TEXT NOT NULL,
    nonce TEXT,
    type TEXT NOT NULL DEFAULT 'text',
    created_at TEXT NOT NULL,
    edited_at TEXT
  );

  CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    role_id TEXT,
    nickname TEXT,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#99aab5',
    permissions INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS dm_channels (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'dm',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dm_participants (
    dm_channel_id TEXT NOT NULL REFERENCES dm_channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    PRIMARY KEY (dm_channel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS channel_keys (
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    sender_id TEXT NOT NULL DEFAULT '',
    encrypted_key TEXT NOT NULL,
    PRIMARY KEY (channel_id, user_id, sender_id)
  );

  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    creator_id TEXT NOT NULL REFERENCES users(id),
    uses INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    expires_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES users(id),
    receiver_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friendships (
    user_id TEXT NOT NULL REFERENCES users(id),
    friend_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_channels_server_id ON channels(server_id);
  CREATE INDEX IF NOT EXISTS idx_server_members_user_id ON server_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_server_members_server_id ON server_members(server_id);
  CREATE INDEX IF NOT EXISTS idx_dm_participants_user_id ON dm_participants(user_id);
  CREATE INDEX IF NOT EXISTS idx_invites_server_id ON invites(server_id);
  CREATE INDEX IF NOT EXISTS idx_roles_server_id ON roles(server_id);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);
  CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);

  CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS pins (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL UNIQUE,
    channel_id TEXT NOT NULL,
    pinned_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bans (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    banned_by TEXT NOT NULL REFERENCES users(id),
    reason TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(server_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id),
    blocked_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS read_positions (
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    last_read_message_id TEXT,
    last_read_at TEXT NOT NULL,
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
  CREATE INDEX IF NOT EXISTS idx_pins_channel_id ON pins(channel_id);
  CREATE INDEX IF NOT EXISTS idx_bans_server_id ON bans(server_id);
  CREATE INDEX IF NOT EXISTS idx_read_positions_user_id ON read_positions(user_id);

  -- E2EE: Prekey bundles for X3DH key agreement
  CREATE TABLE IF NOT EXISTS prekey_bundles (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    identity_key TEXT NOT NULL,
    signing_key TEXT NOT NULL,
    signed_pre_key TEXT NOT NULL,
    signed_pre_key_id INTEGER NOT NULL,
    signed_pre_key_sig TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- E2EE: One-time prekeys for X3DH
  CREATE TABLE IF NOT EXISTS one_time_prekeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    key_id INTEGER NOT NULL,
    public_key TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_otp_user_id ON one_time_prekeys(user_id);

  -- E2EE: Recovery keys for device migration
  CREATE TABLE IF NOT EXISTS recovery_keys (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    encrypted_blob TEXT NOT NULL,
    nonce TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Migration: add phone_number column to users table
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN phone_number TEXT`);
} catch (e: any) {
  // Ignore "duplicate column name" error on reruns
  if (!e.message?.includes('duplicate column')) throw e;
}

// Migration: add reply_to_id column to messages table
try {
  sqlite.exec(`ALTER TABLE messages ADD COLUMN reply_to_id TEXT`);
} catch (e: any) {
  if (!e.message?.includes('duplicate column')) throw e;
}

// Migration: add signing_key column to users table
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN signing_key TEXT`);
} catch (e: any) {
  if (!e.message?.includes('duplicate column')) throw e;
}

// Migration: add bio and banner_url columns to users table
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN bio TEXT`);
} catch (e: any) {
  if (!e.message?.includes('duplicate column')) throw e;
}
try {
  sqlite.exec(`ALTER TABLE users ADD COLUMN banner_url TEXT`);
} catch (e: any) {
  if (!e.message?.includes('duplicate column')) throw e;
}

// Migration: add message_expiry column to channels table
try {
  sqlite.exec(`ALTER TABLE channels ADD COLUMN message_expiry TEXT DEFAULT 'never'`);
} catch (e: any) {
  if (!e.message?.includes('duplicate column')) throw e;
}

// Migration: add expires_at column to messages table
try {
  sqlite.exec(`ALTER TABLE messages ADD COLUMN expires_at TEXT`);
} catch (e: any) {
  if (!e.message?.includes('duplicate column')) throw e;
}

// Migration: create audit_logs table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    target_id TEXT,
    target_type TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_logs_server_id ON audit_logs(server_id);
`);

// Migration: create feedback table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    username TEXT NOT NULL,
    type TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
`);

// Migration: create push_subscriptions table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
`);

// Create the Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

export default db;
