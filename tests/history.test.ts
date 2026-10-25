import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { asUser, call, createDatabase, roomPair, start, state, user } from './database'
import type { BetRecord } from '../src/lib/game'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db?.close() })

const history = (id: string, search = '', result = 'won', before: BetRecord | null = null) =>
  call<BetRecord[]>(db, id, 'get_bet_history', [before?.completed_at ?? null, before?.id ?? null, search, result])

async function finish(pair: Awaited<ReturnType<typeof roomPair>>) {
  for (let round = 1; round <= 2; round++) {
    await start(db, pair)
    await call(db, pair.a, 'submit_guess', [pair.room, '334456', 1])
    if (round === 1) {
      await call(db, pair.a, 'advance_round', [pair.room])
      await call(db, pair.b, 'advance_round', [pair.room])
    }
  }
}

describe('private, immutable bet history', () => {
  it('archives a completed match once and retains the original bet, names and scores after rematch', async () => {
    const pair = await roomPair(db)
    expect(await history(pair.a)).toEqual([])
    await finish(pair)
    const records = await history(pair.a)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ opponent_id: pair.b, opponent_name: 'Bob', won: true, draw: false, bet: 'You make me a coffee.', your_score: 2, opponent_score: 0 })
    const loser = await history(pair.b, '', 'lost')
    expect(loser[0]).toMatchObject({ id: records[0].id, opponent_id: pair.a, opponent_name: 'Alice', won: false, bet: records[0].bet, your_score: 0, opponent_score: 2 })
    expect(await history(pair.b)).toEqual([])
    expect(await history(pair.a, 'bob')).toEqual(records)
    expect(await history(pair.a, 'Someone else')).toEqual([])
    await db.query("update public.rooms set version=version+1 where id=$1", [pair.room])
    await call(db, pair.a, 'advance_round', [pair.room])
    await call(db, pair.b, 'advance_round', [pair.room])
    await call(db, pair.a, 'set_wager', [pair.room, 'A completely different bet.'])
    expect((await state(db, pair.a, pair.room)).players.every(player => player.score === 0)).toBe(true)
    expect(await history(pair.a)).toEqual(records)
    const table = await asUser<{ count: number }>(db, pair.a, 'select count(*)::integer as count from public.bet_history where room_id=$1', [pair.room])
    expect(table.rows[0].count).toBe(1)
  })

  it('allows only the two participants to read and prevents players from forging or editing history', async () => {
    const pair = await roomPair(db)
    await finish(pair)
    const outsider = await user(db)
    expect(await history(outsider, '', 'all')).toEqual([])
    expect((await asUser(db, outsider, 'select * from public.bet_history where room_id=$1', [pair.room])).rows).toEqual([])
    await expect(asUser(db, pair.a, 'update public.bet_history set host_score=99 where room_id=$1', [pair.room])).rejects.toThrow('permission denied')
    await expect(asUser(db, pair.a, 'delete from public.bet_history where room_id=$1', [pair.room])).rejects.toThrow('permission denied')
    await expect(asUser(db, pair.a, 'insert into public.bet_history(room_id) values($1)', [pair.room])).rejects.toThrow('permission denied')
    await expect(asUser(db, outsider, 'select private.archive_match($1)', [pair.room])).rejects.toThrow('permission denied')
    await expect(db.transaction(async tx => {
      await tx.exec('set local role anon')
      await tx.query('select public.get_bet_history()')
    })).rejects.toThrow('permission denied')
    const records = await history(pair.a)
    expect(Object.keys(records[0]).sort()).toEqual(['bet', 'completed_at', 'draw', 'game_kind', 'id', 'mode', 'opponent_id', 'opponent_name', 'opponent_score', 'variant', 'won', 'your_score'].sort())
  })

  it('paginates every record without losing same-time matches and validates filters and cursors', async () => {
    const pair = await roomPair(db)
    await db.query(`
      insert into public.bet_history(room_id,match_number,host_id,guest_id,host_name,guest_name,
        host_wager,guest_wager,host_score,guest_score,winner_id,mode,variant,completed_at)
      select $1,n,$2,$3,'Alice','Bob','Coffee','Snack',2,0,$2,'number','race','2026-10-16T12:00:00Z'
      from generate_series(1,30) n
    `, [pair.room, pair.a, pair.b])
    const first = await history(pair.a)
    expect(first).toHaveLength(26)
    const next = await history(pair.a, '', 'won', first[24])
    expect(next).toHaveLength(5)
    expect(new Set([...first.slice(0, 25), ...next].map(item => item.id)).size).toBe(30)
    await expect(call(db, pair.a, 'get_bet_history', [null, null, '', 'invalid'])).rejects.toThrow('Choose won, lost or all')
    await expect(call(db, pair.a, 'get_bet_history', [first[0].completed_at, null, '', 'won'])).rejects.toThrow('cursor is incomplete')
    await expect(history(pair.a, 'x'.repeat(81))).rejects.toThrow('at most 80')
  })

  it('expands the dictionary idempotently without changing an active room or its secret', async () => {
    const pair = await roomPair(db, 'word')
    await start(db, pair, ['APPLES', 'NORMAL'])
    const before = await state(db, pair.a, pair.room)
    const migration = await readFile(new URL('../supabase/migrations/202610160007_expanded_dictionary.sql', import.meta.url), 'utf8')
    const count = (await db.query<{ count: number }>('select count(*)::integer as count from public.word_bank')).rows[0].count
    await db.exec(migration)
    const after = await state(db, pair.a, pair.room)
    expect(after.room).toEqual(before.room)
    expect(after.players).toEqual(before.players)
    expect(after.own_secret).toBe('APPLES')
    expect((await db.query<{ count: number }>('select count(*)::integer as count from public.word_bank')).rows[0].count).toBe(count)
  })
})
