import { afterEach, beforeEach, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
import { call, createDatabase, roomPair, start, state, user } from './database'
import { getFeedback, type SoloState } from '../src/lib/game'

let db: PGlite
beforeEach(async () => { db = await createDatabase() })
afterEach(async () => { await db?.close() })

it('restarts unfinished legacy number games without losing scores, bets, completed history or word games', async () => {
  const oldRules = await readFile(new URL('../supabase/migrations/202610160005_six_letter_unlimited.sql', import.meta.url), 'utf8')
  const oldSolo = await readFile(new URL('../supabase/migrations/202610160009_solo.sql', import.meta.url), 'utf8')
  await db.exec(oldRules.slice(oldRules.indexOf('create or replace function private.validate_code'), oldRules.indexOf('create or replace function public.set_ready')))
  await db.exec(`
    alter table private.solo_games drop constraint solo_games_check1;
    alter table private.solo_games add constraint solo_games_check1
      check ((mode='number' and answer ~ '^[0-9]{4}$') or (mode='word' and answer ~ '^[A-Z]{6}$'));
  `)
  await db.exec(oldSolo.slice(oldSolo.indexOf('create function public.create_solo_game'), oldSolo.indexOf('create function public.submit_solo_guess')).replace('create function', 'create or replace function'))

  const active = await roomPair(db, 'number', 'turns')
  await start(db, active, ['1122', '3344'])
  await call(db, active.a, 'submit_guess', [active.room, '3344', 1])
  await call(db, active.a, 'advance_round', [active.room])
  await call(db, active.b, 'advance_round', [active.room])
  await start(db, active, ['1122', '3344'])
  await call(db, active.b, 'submit_guess', [active.room, '0000', 1])
  const before = await state(db, active.a, active.room)

  const completed = await roomPair(db)
  await start(db, completed, ['1122', '3344'])
  await call(db, completed.a, 'submit_guess', [completed.room, '3344', 1])
  await call(db, completed.a, 'advance_round', [completed.room])
  await call(db, completed.b, 'advance_round', [completed.room])
  await start(db, completed, ['1122', '3344'])
  await call(db, completed.a, 'submit_guess', [completed.room, '3344', 1])
  const finished = await state(db, completed.a, completed.room)
  const history = await db.query('select * from public.bet_history')

  const word = await roomPair(db, 'word', 'turns')
  await start(db, word, ['LETTER', 'SECRET'])
  await call(db, word.a, 'submit_guess', [word.room, 'STREET', 1])
  const wordBefore = await state(db, word.a, word.room)
  const solos = []
  for (const challenge of ['attempts', 'timed']) {
    const player = await user(db)
    const game = await call<SoloState>(db, player, 'create_solo_game', ['number', challenge])
    await db.query("update private.solo_games set answer='9999' where id=$1", [game.id])
    await call(db, player, 'submit_solo_guess', [game.id, '0000', 1])
    solos.push({ player, game })
  }
  const owner = await user(db)
  const oldCompleted = await call<SoloState>(db, owner, 'create_solo_game', ['number', 'attempts'])
  const answer = (await db.query<{ answer: string }>('select answer from private.solo_games where id=$1', [oldCompleted.id])).rows[0].answer
  await call(db, owner, 'submit_solo_guess', [oldCompleted.id, answer, 1])
  const soloBefore = await call<SoloState>(db, owner, 'get_solo_game', [oldCompleted.id])

  const migration = await readFile(new URL('../supabase/migrations/202610170012_six_digit_numbers.sql', import.meta.url), 'utf8')
  await db.transaction(tx => tx.exec(migration))
  const after = await state(db, active.a, active.room)
  expect(after.room).toEqual({ ...before.room, status: 'setting', started_at: null, turn_user_id: null, version: before.room.version + 1 })
  expect(after.players.map(p => [p.score, p.wager, p.ready])).toEqual(before.players.map(p => [p.score, p.wager, p.ready]))
  expect(after.players.every(p => !p.secret_ready && p.attempts === 0 && !p.solved && !p.next_ready)).toBe(true)
  expect(after.own_secret).toBeNull()
  expect(after.pending_guess).toBeNull()
  expect(after.guesses).toEqual([])
  expect(after.results).toEqual(before.results)
  const finishedAfter = await state(db, completed.a, completed.room)
  expect(finishedAfter.room).toEqual(finished.room)
  expect(finishedAfter.players).toEqual(finished.players)
  expect(finishedAfter.guesses).toEqual(finished.guesses)
  expect(finishedAfter.results).toEqual(finished.results)
  expect((await db.query('select * from public.bet_history')).rows).toEqual(history.rows)
  const wordAfter = await state(db, word.a, word.room)
  expect(wordAfter.room).toEqual(wordBefore.room)
  expect(wordAfter.players).toEqual(wordBefore.players)
  expect(wordAfter.pending_guess).toEqual(wordBefore.pending_guess)

  for (const { player, game } of solos) {
    const restarted = await call<SoloState>(db, player, 'get_solo_game', [game.id])
    expect(restarted).toMatchObject({ id: game.id, status: 'playing', guesses: [], secret: null, version: 3 })
    if (restarted.deadline) expect(Date.parse(restarted.deadline) - Date.parse(restarted.started_at)).toBe(180000)
    const stored = await db.query<{ answer: string }>('select answer from private.solo_games where id=$1', [game.id])
    expect(stored.rows[0].answer).toMatch(/^\d{6}$/)
    await expect(call(db, player, 'submit_solo_guess', [game.id, '1234', 1])).rejects.toThrow('six digits')
  }
  const soloAfter = await call<SoloState>(db, owner, 'get_solo_game', [oldCompleted.id])
  expect({ ...soloAfter, server_now: soloBefore.server_now }).toEqual(soloBefore)
  await expect(call(db, active.a, 'set_secret', [active.room, '1234'])).rejects.toThrow('six digits')
  await start(db, active, ['001122', '112233'])
  await call(db, active.b, 'submit_guess', [active.room, '131223', 1])
  const pending = (await state(db, active.a, active.room)).pending_guess!
  await call(db, active.a, 'submit_hints', [active.room, pending.id, getFeedback('001122', pending.guess)])
  expect((await state(db, active.b, active.room)).guesses[0].feedback).toHaveLength(6)
})

it('generates six-digit solo answers and rejects short or non-digit guesses without consuming attempts', async () => {
  const player = await user(db)
  const game = await call<SoloState>(db, player, 'create_solo_game', ['number', 'attempts'])
  const stored = await db.query<{ answer: string }>('select answer from private.solo_games where id=$1', [game.id])
  expect(stored.rows[0].answer).toMatch(/^\d{6}$/)
  for (const guess of ['1234', '12345', '1234567', '12345A']) {
    await expect(call(db, player, 'submit_solo_guess', [game.id, guess, 1])).rejects.toThrow('six digits')
  }
  expect((await call<SoloState>(db, player, 'get_solo_game', [game.id])).guesses).toEqual([])
  await db.query("update private.solo_games set answer='001122' where id=$1", [game.id])
  const result = await call<{ game: SoloState }>(db, player, 'submit_solo_guess', [game.id, '010101', 1])
  expect(result.game.guesses[0].feedback).toEqual(['hit', 'present', 'present', 'hit', 'miss', 'miss'])
})
