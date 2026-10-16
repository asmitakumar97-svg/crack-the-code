import type { PGlite } from '@electric-sql/pglite'
import { asPlayer, openGameDatabase } from '../server/database'
import type { GameState, Mode, Variant } from '../src/lib/game'

export const createDatabase = () => openGameDatabase()

export async function user(db: PGlite) {
  const id = crypto.randomUUID()
  await db.query('insert into auth.users(id) values($1)', [id])
  return id
}
export const asUser = asPlayer
export async function call<T>(db: PGlite, id: string, fn: string, args: unknown[] = []): Promise<T> {
  if (!/^[a-z_]+$/.test(fn)) throw new Error('Invalid RPC name')
  if (fn === 'create_room' && args.length === 2) args = [...args, 'low']
  if (fn === 'create_room' && args.length === 3) args = [...args, 'You make me a coffee.', 'race']
  if (fn === 'set_ready' && args.length === 2) {
    const current = await state(db, id, String(args[0]))
    args = [...args, current.room.wager_version]
  }
  if (fn === 'set_wager' && args.length === 2) {
    const current = await state(db, id, String(args[0]))
    args = [...args, current.room.match_number]
  }
  const roundArgCounts: Record<string, number> = { set_secret: 2, submit_guess: 3, advance_round: 1, submit_hints: 3 }
  if (roundArgCounts[fn] === args.length) {
    const current = await state(db, id, String(args[0]))
    args = [...args, current.room.match_number, current.room.round_number]
  }
  if (fn === 'start_round' && args.length === 1) {
    const current = await state(db, id, String(args[0]))
    args = [...args, current.room.match_number, current.room.round_number, current.room.wager_version]
  }
  const result = await asUser<{ result: T }>(db, id, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args)
  return result.rows[0].result
}
export const state = (db: PGlite, id: string, room: string) => call<GameState>(db, id, 'get_game_state', [room])

export async function roomPair(db: PGlite, mode: Mode = 'number', variant: Variant = 'race') {
  const a = await user(db)
  const b = await user(db)
  const room = await call<string>(db, a, 'create_room', ['Alice', mode, 'low', 'You make me a coffee.', variant])
  const code = (await state(db, a, room)).room.code
  await call(db, b, 'join_room', [code, 'Bob'])
  await call(db, a, 'set_wager', [room, 'You make me a coffee.'])
  await call(db, b, 'set_wager', [room, 'You bring me a snack.'])
  return { a, b, room, code }
}
export async function start(db: PGlite, pair: { a: string; b: string; room: string }, codes = ['1122', '3344']) {
  await call(db, pair.a, 'set_secret', [pair.room, codes[0]])
  await call(db, pair.b, 'set_secret', [pair.room, codes[1]])
  await launch(db, pair)
}
export async function launch(db: PGlite, pair: { a: string; b: string; room: string }) {
  await call(db, pair.b, 'set_ready', [pair.room, true])
  await call(db, pair.a, 'start_round', [pair.room])
  await db.query("update public.rooms set started_at=clock_timestamp()-interval '1 second' where id=$1", [pair.room])
}
