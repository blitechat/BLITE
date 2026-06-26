import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import type { Express } from 'express'

// Build an in-memory db before any mocks run so the factory can reference it
vi.mock('../db/connection', async () => {
  const { default: Database } = await import('better-sqlite3')
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const schema = await import('../db/schema')

  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS recovery_keys (
      user_id    TEXT PRIMARY KEY,
      encrypted_blob TEXT NOT NULL,
      nonce      TEXT NOT NULL,
      salt       TEXT,
      iterations INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  return { db: drizzle(sqlite, { schema }) }
})

// Bypass JWT auth and inject a fixed test user
vi.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'test-user-id',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@test.com',
      phoneNumber: null,
      avatarUrl: null,
      publicKey: null,
      signingKey: null,
      status: 'offline',
      customStatus: null,
    }
    next()
  },
}))

// These imports resolve to the mocked versions
import { db } from '../db/connection'
import { recoveryKeys } from '../db/schema'
import keysRouter from './keys'

function buildApp(): Express {
  const app = express()
  app.use(express.json())
  app.use('/', keysRouter)
  return app
}

beforeEach(async () => {
  await db.delete(recoveryKeys)
})

describe('POST /recovery', () => {
  it('stores encrypted, nonce, salt, and iterations', async () => {
    const app = buildApp()
    const res = await request(app).post('/recovery').send({
      encrypted: 'enc-data',
      nonce: 'nonce-data',
      salt: 'salt-data',
      iterations: 100000,
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const [row] = await db.select().from(recoveryKeys)
    expect(row.encryptedBlob).toBe('enc-data')
    expect(row.nonce).toBe('nonce-data')
    expect(row.salt).toBe('salt-data')
    expect(row.iterations).toBe(100000)
  })

  it('stores a blob without salt or iterations (legacy upload)', async () => {
    const app = buildApp()
    const res = await request(app).post('/recovery').send({
      encrypted: 'enc-data',
      nonce: 'nonce-data',
    })

    expect(res.status).toBe(200)

    const [row] = await db.select().from(recoveryKeys)
    expect(row.encryptedBlob).toBe('enc-data')
    expect(row.salt).toBeNull()
    expect(row.iterations).toBeNull()
  })

  it('overwrites an existing blob and preserves the new salt', async () => {
    const app = buildApp()

    await request(app).post('/recovery').send({
      encrypted: 'enc-v1',
      nonce: 'nonce-v1',
      salt: 'salt-v1',
      iterations: 100000,
    })

    await request(app).post('/recovery').send({
      encrypted: 'enc-v2',
      nonce: 'nonce-v2',
      salt: 'salt-v2',
      iterations: 200000,
    })

    const rows = await db.select().from(recoveryKeys)
    expect(rows).toHaveLength(1)
    expect(rows[0].encryptedBlob).toBe('enc-v2')
    expect(rows[0].salt).toBe('salt-v2')
    expect(rows[0].iterations).toBe(200000)
  })

  it('returns 400 when encrypted is missing', async () => {
    const app = buildApp()
    const res = await request(app).post('/recovery').send({ nonce: 'nonce-data' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when nonce is missing', async () => {
    const app = buildApp()
    const res = await request(app).post('/recovery').send({ encrypted: 'enc-data' })
    expect(res.status).toBe(400)
  })
})

describe('GET /recovery', () => {
  it('returns encrypted, nonce, salt, and iterations for a PBKDF2 blob', async () => {
    const app = buildApp()

    await request(app).post('/recovery').send({
      encrypted: 'enc-data',
      nonce: 'nonce-data',
      salt: 'salt-data',
      iterations: 100000,
    })

    const res = await request(app).get('/recovery')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      encrypted: 'enc-data',
      nonce: 'nonce-data',
      salt: 'salt-data',
      iterations: 100000,
    })
  })

  it('returns only encrypted and nonce for a legacy blob (no salt)', async () => {
    const app = buildApp()

    await request(app).post('/recovery').send({
      encrypted: 'enc-data',
      nonce: 'nonce-data',
    })

    const res = await request(app).get('/recovery')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      encrypted: 'enc-data',
      nonce: 'nonce-data',
    })
    expect(res.body.salt).toBeUndefined()
    expect(res.body.iterations).toBeUndefined()
  })

  it('returns 404 when no blob exists', async () => {
    const app = buildApp()
    const res = await request(app).get('/recovery')
    expect(res.status).toBe(404)
  })
})
