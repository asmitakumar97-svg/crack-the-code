import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SoloBoardState } from '../src/lib/game'
import { call, createDatabase, state, user } from './database'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db.close() })
async function memory() {
  const a = await user(db), b = await user(db)
  const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
  await call(db, b, 'join_room', [(await state(db, a, room)).room.code, 'Bob'])
  await call(db, a, 'choose_duo_game', [room, 1, 'memory', 12, 'animals', 'number', 'turns', 10])
  await call(db, a, 'confirm_duo_game', [room, 2])
  await call(db, b, 'confirm_duo_game', [room, 2])
  await db.query("update private.memory_games set deck='{0,0,1,1,2,2,3,3,4,4,5,5}' where room_id=$1", [room])
  return { a, b, room }
}
async function flip(room: string, actor: string, index: number) {
  const m = (await state(db, actor, room)).memory!
  await call(db, actor, 'flip_memory_card', [room, m.session_id, m.moves, index])
}
it('tracks both players’ own flips and pairs, and retains their colours in both sessions after reload', async () => {
  const p = await memory()
  expect((await state(db, p.a, p.room)).memory!.owners).toEqual({})
  await flip(p.room, p.a, 0)
  await flip(p.room, p.a, 1)
  await flip(p.room, p.a, 2)
  await flip(p.room, p.a, 4)
  const mismatch = (await state(db, p.b, p.room)).memory!
  expect(mismatch.turn_user).toBe(p.b)
  expect(mismatch.owners).toEqual({ 0: p.a, 1: p.a, 2: p.a, 4: p.a })
  await db.query("update private.memory_games set reveal_until=clock_timestamp()-interval '1 second' where room_id=$1", [p.room])
  expect((await state(db, p.b, p.room)).memory!.owners).toEqual({ 0: p.a, 1: p.a })
  await flip(p.room, p.b, 2)
  await flip(p.room, p.b, 3)
  for (const actor of [p.a, p.b]) expect((await state(db, actor, p.room)).memory!.owners).toEqual({ 0: p.a, 1: p.a, 2: p.b, 3: p.b })
})
it('clears ownership on a new shuffled session without inventing owners for legacy pairs', async () => {
  const p = await memory()
  for (let i = 0; i < 12; i++) await flip(p.room, p.a, i)
  expect(Object.keys((await state(db, p.a, p.room)).memory!.owners!)).toHaveLength(12)
  await call(db, p.a, 'open_duo_lobby', [p.room])
  const revision = (await state(db, p.a, p.room)).hub!.revision
  await call(db, p.a, 'confirm_duo_game', [p.room, revision])
  await call(db, p.b, 'confirm_duo_game', [p.room, revision])
  expect((await state(db, p.a, p.room)).memory!.owners).toEqual({})
  await db.query("update private.memory_games set matched='{0,1}',owners='{}',flipped='{2}' where room_id=$1", [p.room])
  expect((await state(db, p.a, p.room)).memory!.owners).toEqual({ 2: p.a })
})
it('persists human and computer ownership in solo games without exposing expired face-down flips', async () => {
  const actor = await user(db)
  type SoloMemory = Extract<SoloBoardState, { kind: 'memory' }>
  let g = await call<SoloMemory>(db, actor, 'create_solo_board', ['memory', 'hard', 12, 'animals', 10])
  await db.query("update private.solo_boards set board=jsonb_set(board,'{deck}','[0,0,1,1,2,2,3,3,4,4,5,5]') where id=$1", [g.id])
  for (const index of [0, 1, 2, 4]) g = await call<SoloMemory>(db, actor, 'play_solo_board', [g.id, g.version, 'flip', index])
  await db.query("update private.solo_boards set next_action_at=clock_timestamp()-interval '1 second',board=jsonb_set(board,'{reveal_until}',to_jsonb(clock_timestamp()-interval '1 second')) where id=$1", [g.id])
  g = await call<SoloMemory>(db, actor, 'get_solo_board', [g.id])
  expect(g.board.owners![0]).toBe(actor)
  expect(g.board.owners![1]).toBe(actor)
  expect(Object.values(g.board.owners!).filter(owner => owner === g.computer_id)).toHaveLength(1)
  expect(Object.keys(g.board.owners!)).toHaveLength(3)
  const saved = await call<SoloMemory>(db, actor, 'get_solo_board', [null])
  expect(saved.board.owners).toEqual(g.board.owners)
})
