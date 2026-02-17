import Database from 'better-sqlite3';
import path from 'path';
import { DB_PATH } from '../config';

console.log('🔄 Resetting all accounts...');
console.log(`📁 Database: ${DB_PATH}`);

// Create database connection
const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF'); // Temporarily disable foreign keys for clean deletion

try {
  // Delete all data from all tables
  console.log('🗑️  Deleting all data...');

  // List of all tables to clear
  const tables = [
    'push_subscriptions',
    'audit_logs',
    'recovery_keys',
    'one_time_prekeys',
    'prekey_bundles',
    'read_positions',
    'blocks',
    'bans',
    'pins',
    'reactions',
    'friendships',
    'friend_requests',
    'invites',
    'channel_keys',
    'dm_participants',
    'dm_channels',
    'roles',
    'server_members',
    'messages',
    'channels',
    'servers',
    'users'
  ];

  // Delete from each table, skip if table doesn't exist
  for (const table of tables) {
    try {
      db.prepare(`DELETE FROM ${table}`).run();
      console.log(`   ✓ Cleared ${table}`);
    } catch (error: any) {
      if (error.message?.includes('no such table')) {
        console.log(`   ⊘ Skipped ${table} (table doesn't exist)`);
      } else {
        throw error;
      }
    }
  }

  // Verify deletion
  let userCount = 0;
  let serverCount = 0;
  let messageCount = 0;

  try {
    userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    serverCount = (db.prepare('SELECT COUNT(*) as count FROM servers').get() as { count: number }).count;
    messageCount = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;
  } catch (error: any) {
    // Tables don't exist, which means 0 records
    if (!error.message?.includes('no such table')) {
      throw error;
    }
  }

  console.log('\n✅ Reset complete!');
  console.log(`   Users: ${userCount}`);
  console.log(`   Servers: ${serverCount}`);
  console.log(`   Messages: ${messageCount}`);
  console.log('\n🎉 All accounts have been wiped from the platform.');

} catch (error) {
  console.error('❌ Error during reset:', error);
  process.exit(1);
} finally {
  db.pragma('foreign_keys = ON'); // Re-enable foreign keys
  db.close();
}
