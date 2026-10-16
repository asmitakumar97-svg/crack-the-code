import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalBackend } from '../server/local'
import type { GameState } from '../src/lib/game'

async function startServer(dataDir?: string) {
  const backend = await createLocalBackend(dataDir)
  const server = createServer((req, res) => { void backend.handle(req, res) })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No local test server address.')
  const origin = `http://127.0.0.1:${address.port}`
  return {
    origin,
    async close() {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      await backend.close()
    },
  }
}

interface Session { user_id: string; token: string }
async function request<T>(origin: string, path: string, token?: string, args?: Record<string, unknown>) {
  const response = await fetch(`${origin}/__local_game${path}`, {
    method: args === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(args === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: args === undefined ? undefined : JSON.stringify(args),
  })
  return { status: response.status, data: await response.json() as T }
}

describe('real local HTTP backend', () => {
  let server: Awaited<ReturnType<typeof startServer>>
  beforeAll(async () => { server = await startServer() })
  afterAll(async () => { await server?.close() })
  const rpc = <T>(name: string, token: string, args: Record<string, unknown>) => request<T>(server.origin, `/rpc/${name}`, token, args)
  const session = async () => (await request<Session>(server.origin, '/session', undefined, {})).data

  it('is ready, issues separate opaque sessions, and resumes the same identity', async () => {
    expect((await request(server.origin, '/health')).data).toEqual({ backend: 'local', ready: true })
    const a = await session()
    const b = await session()
    expect(a.user_id).not.toBe(b.user_id)
    expect(a.token).toMatch(/^[a-f0-9]{64}$/)
    expect(a.token).not.toBe(b.token)
    expect((await request(server.origin, '/session', a.token, {})).data).toEqual(a)
    expect((await request(server.origin, '/words')).status).toBe(401)
    expect((await request(server.origin, '/words', '0'.repeat(64))).status).toBe(401)
    expect((await request(server.origin, '/session', undefined, { user_id: a.user_id })).status).toBe(400)
    expect((await request(server.origin, '/session', '0'.repeat(64), {})).status).toBe(401)
  })

  it('protects secrets, membership and concurrent identities through the actual SQL permissions', async () => {
    const [a, b, outsider] = await Promise.all([session(), session(), session()])
    const room = (await rpc<string>('create_room', a.token, { p_name: 'Alice', p_mode: 'number', p_stake: 'high', p_wager: 'Coffee for me', p_variant: 'race' })).data
    const initial = (await rpc<GameState>('get_game_state', a.token, { p_room: room })).data
    expect((await rpc('join_room', b.token, { p_name: 'Bob', p_code: initial.room.code })).status).toBe(200)
    expect((await rpc('get_game_state', outsider.token, { p_room: room })).status).toBe(400)
    const version = { p_room: room, p_match: 1, p_round: 1 }
    expect((await rpc('set_secret', a.token, { ...version, p_code: '1122' })).status).toBe(200)
    const before = (await rpc<GameState>('get_game_state', b.token, { p_room: room })).data
    expect(before.own_secret).toBeNull()
    expect(before.results).toEqual([])
    expect(before.players.find(player => player.user_id === a.user_id)?.secret_ready).toBe(true)
    expect((await rpc('set_secret', b.token, { ...version, p_code: '3344' })).status).toBe(200)
    const states = await Promise.all(Array.from({ length: 10 }, (_, index) => rpc<GameState>('get_game_state', index % 2 ? a.token : b.token, { p_room: room })))
    expect(states.map(result => result.data.own_secret)).toEqual(Array.from({ length: 10 }, (_, index) => index % 2 ? '1122' : '3344'))
    expect((await rpc('get_game_state', a.token, { p_room: room, p_user_id: b.user_id })).status).toBe(400)
    expect((await rpc('feedback', a.token, { p_secret: '1122' })).status).toBe(404)
  })

  it('validates word-bank pagination, argument values and cross-origin requests', async () => {
    const a = await session()
    const words = await request<string[]>(server.origin, '/words?offset=0&limit=3', a.token)
    expect(words.status).toBe(200)
    expect(words.data).toHaveLength(3)
    expect(words.data.every(word => /^[A-Z]{6}$/.test(word))).toBe(true)
    expect((await request(server.origin, '/words?offset=-1', a.token)).status).toBe(400)
    expect((await rpc('get_game_state', a.token, { p_room: 'not-a-uuid' })).status).toBe(400)
    const crossOrigin = await fetch(`${server.origin}/__local_game/session`, { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })
    expect(crossOrigin.status).toBe(403)
    const malformed = await fetch(`${server.origin}/__local_game/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json' })
    expect(malformed.status).toBe(400)
    const oversized = await fetch(`${server.origin}/__local_game/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(4096) }) })
    expect(oversized.status).toBe(413)
  })

  it('persists player sessions, rooms and locked secrets across a server restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'crack-code-persistence-'))
    let persistent: Awaited<ReturnType<typeof startServer>> | undefined
    try {
      persistent = await startServer(directory)
      const a = (await request<Session>(persistent.origin, '/session', undefined, {})).data
      const room = (await request<string>(persistent.origin, '/rpc/create_room', a.token, { p_name: 'Saved player', p_mode: 'number', p_stake: 'low', p_wager: 'A snack', p_variant: 'turns' })).data
      await request(persistent.origin, '/rpc/set_secret', a.token, { p_room: room, p_code: '0011', p_match: 1, p_round: 1 })
      await persistent.close()
      persistent = undefined
      persistent = await startServer(directory)
      expect((await request(persistent.origin, '/session', a.token, {})).data).toEqual(a)
      const saved = await request<GameState>(persistent.origin, '/rpc/get_game_state', a.token, { p_room: room })
      expect(saved.status).toBe(200)
      expect(saved.data.own_secret).toBe('0011')
      expect(saved.data.room.variant).toBe('turns')
      expect(saved.data.players[0].name).toBe('Saved player')
    } finally {
      await persistent?.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
