-- Migration: Add performance indexes
-- Run this SQL file against your SQLite database to add the indexes
-- sqlite3 server/data/blite.db < server/src/db/add_indexes_migration.sql

-- Index for messages by sender (for user message history queries)
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages(sender_id);

-- Index for messages by channel (for channel message queries)
CREATE INDEX IF NOT EXISTS messages_channel_id_idx ON messages(channel_id);

-- Composite index for reactions (for reaction lookups and updates)
CREATE INDEX IF NOT EXISTS reactions_message_user_emoji_idx ON reactions(message_id, user_id, emoji);

-- Composite index for bans by server and user (for ban checks)
CREATE INDEX IF NOT EXISTS bans_server_user_idx ON bans(server_id, user_id);

-- Index for bans by user (for cross-server ban queries)
CREATE INDEX IF NOT EXISTS bans_user_id_idx ON bans(user_id);
