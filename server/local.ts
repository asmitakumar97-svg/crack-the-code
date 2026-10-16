import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { asPlayer, openGameDatabase } from './database'

const RPCS = {
  create_room: ['p_name', 'p_mode', 'p_stake', 'p_wager', 'p_variant'],
  join_room: ['p_code', 'p_name'],
  set_wager: ['p_room', 'p_wager', 'p_match'],
  set_ready: ['p_room', 'p_ready', 'p_wager_version'],
  set_secret: ['p_room', 'p_code', 'p_match', 'p_round'],
  start_round: ['p_room', 'p_match', 'p_round', 'p_wager_version'],
  submit_guess: ['p_room', 'p_guess', 'p_attempt', 'p_match', 'p_round'],
  submit_hints: ['p_room', 'p_guess_id', 'p_marks', 'p_match', 'p_round'],
  advance_round: ['p_room', 'p_match', 'p_round'],
  heartbeat: ['p_room'],
  get_game_state: ['p_room'],
  get_bet_history: ['p_before', 'p_before_id', 'p_search', 'p_result'],
  create_solo_game: ['p_mode', 'p_challenge'],
  get_solo_game: ['p_game'],
  submit_solo_guess: ['p_game', 'p_guess', 'p_attempt'],
} satisfies Record<string, string[]>

class RequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RequestError(415, 'Send a JSON request.')
  req.setEncoding('utf8')
  let text = ''
  for await (const chunk of req) {
    if (typeof chunk !== 'string') throw new RequestError(400, 'Invalid request body.')
    text += chunk
    if (Buffer.byteLength(text) > 4096) throw new RequestError(413, 'The game request is too large.')
  }
  let value: unknown
  try { value = JSON.parse(text) }
  catch { throw new RequestError(400, 'Invalid JSON request.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, 'Send a JSON object.')
  return value as Record<string, unknown>
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export async function createLocalBackend(dataDir?: string) {
  const db = await openGameDatabase(dataDir)
  const signupLimits = new Map<string, { count: number; until: number }>()

  async function identity(req: IncomingMessage) {
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
    if (!token) throw new RequestError(401, 'A valid local player session is required.')
    const { rows } = await db.query<{ user_id: string }>('select user_id from local_server.sessions where token_hash=$1 and expires_at > now()', [hash(token)])
    if (!rows.length) throw new RequestError(401, 'Your local session expired or the database was reset. Open a new private browser window or clear browser storage to create a new player.')
    return { id: rows[0].user_id, token }
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin
    if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) throw new RequestError(403, 'Cross-origin local game requests are not allowed.')
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname.replace(/^\/__local_game/, '')
    if (path === '/health' && req.method === 'GET') {
      await db.query('select 1')
      send(res, 200, { backend: 'local', ready: true })
      return
    }
    if (path === '/session' && req.method === 'POST') {
      const args = await body(req)
      if (Object.keys(args).length) throw new RequestError(400, 'Local sessions do not accept a player identity.')
      if (req.headers.authorization) {
        const session = await identity(req)
        send(res, 200, { user_id: session.id, token: session.token })
        return
      }
      const ip = req.socket.remoteAddress ?? 'unknown'
      const now = Date.now()
      for (const [key, value] of signupLimits) if (value.until <= now) signupLimits.delete(key)
      const limit = signupLimits.get(ip) ?? { count: 0, until: now + 3600000 }
      if (limit.count >= 40) throw new RequestError(429, 'Too many new local players. Reuse an existing browser session or try again later.')
      limit.count++
      signupLimits.set(ip, limit)
      const id = randomUUID()
      const token = randomBytes(32).toString('hex')
      await db.transaction(async tx => {
        await tx.query('insert into auth.users(id) values($1)', [id])
        await tx.query('insert into local_server.sessions(token_hash,user_id) values($1,$2)', [hash(token), id])
      })
      send(res, 200, { user_id: id, token })
      return
    }
    const { id } = await identity(req)
    if (path === '/words' && req.method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 1000)
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RequestError(400, 'Invalid word bank page.')
      const { rows } = await asPlayer<{ word: string }>(db, id, 'select word from public.word_bank where is_answer order by word limit $1 offset $2', [limit, offset])
      send(res, 200, rows.map(row => row.word))
      return
    }
    const name = path.match(/^\/rpc\/([a-z_]+)$/)?.[1]
    if (req.method !== 'POST' || !name || !Object.hasOwn(RPCS, name)) throw new RequestError(404, 'Unknown local game endpoint.')
    const parameters = RPCS[name as keyof typeof RPCS]
    const args = await body(req)
    if (Object.keys(args).length !== parameters.length || parameters.some(key => !Object.hasOwn(args, key))) throw new RequestError(400, 'Invalid game request arguments.')
    const sql = `select public.${name}(${parameters.map((key, i) => `${key} => $${i + 1}`).join(',')}) as result`
    const { rows } = await asPlayer<{ result: unknown }>(db, id, sql, parameters.map(key => args[key]))
    send(res, 200, rows[0].result)
  }

  return {
    handle: async (req: IncomingMessage, res: ServerResponse) => {
      try { await route(req, res) }
      catch (error) {
        if (error instanceof RequestError) send(res, error.status, { message: error.message })
        else if (error instanceof Error && 'code' in error && error.code === 'P0001') send(res, 400, { message: error.message })
        else if (error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('22')) send(res, 400, { message: 'Invalid game request values.' })
        else {
          console.error('Local multiplayer request failed:', error instanceof Error ? error.message : 'Unknown server error')
          send(res, 500, { message: 'The local game server failed. Check the development terminal.' })
        }
      }
    },
    close: () => db.close(),
  }
}

export type LocalBackend = Awaited<ReturnType<typeof createLocalBackend>>
