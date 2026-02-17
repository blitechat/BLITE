/**
 * Clean Database Script
 * Deletes all user accounts and associated data
 */
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(__dirname, '..', 'data', 'blite.db')

async function cleanDatabase() {
  console.log('🧹 Starting database cleanup...')
  console.log('Database path:', DB_PATH)

  const db = new Database(DB_PATH)

  try {
    // Delete all data from tables (in correct order to respect foreign keys)
    const tables = [
      'reactions',
      'read_positions',
      'pins',
      'blocks',
      'bans',
      'messages',
      'channel_keys',
      'channels',
      'invites',
      'roles',
      'server_members',
      'servers',
      'dm_participants',
      'dm_channels',
      'friendships',
      'friend_requests',
      'recovery_keys',
      'one_time_prekeys',
      'prekey_bundles',
      'users',
    ]

    for (const table of tables) {
      console.log(`  - Deleting from ${table}...`)
      try {
        db.prepare(`DELETE FROM ${table}`).run()
      } catch (err: any) {
        console.warn(`    ⚠ Warning: Could not delete from ${table}: ${err.message}`)
      }
    }

    // Reset sqlite_sequence for auto-increment tables
    console.log('  - Resetting auto-increment sequences...')
    db.prepare('DELETE FROM sqlite_sequence').run()

    console.log('✅ Database cleaned successfully!')
    console.log('All user accounts and associated data have been deleted.')

    db.close()
  } catch (error) {
    console.error('❌ Error cleaning database:', error)
    db.close()
    process.exit(1)
  }

  process.exit(0)
}

// Run the cleanup
cleanDatabase()
