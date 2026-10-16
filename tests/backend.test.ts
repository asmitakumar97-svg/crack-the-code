import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { asUser, call, createDatabase, launch, roomPair, start, state, user } from './database'
import { validateEntry } from '../src/lib/game'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db?.close() })

describe('Wordle-style, duplicate-safe feedback', () => {
  it.each([
    ['1122', '1111', ['hit', 'hit', 'miss', 'miss']],
    ['1122', '2211', ['present', 'present', 'present', 'present']],
    ['1234', '4444', ['miss', 'miss', 'miss', 'hit']],
    ['MINT', 'TIME', ['present', 'hit', 'present', 'miss']],
    ['AABB', 'ABAA', ['hit', 'present', 'present', 'miss']],
    ['0000', '0000', ['hit', 'hit', 'hit', 'hit']],
    ['TREE', 'EELS', ['present', 'present', 'miss', 'miss']],
    ['TREE', 'TEEM', ['hit', 'present', 'hit', 'miss']],
    ['1211', '1111', ['hit', 'miss', 'hit', 'hit']],
    ['1123', '0111', ['miss', 'hit', 'present', 'miss']],
    ['ABBA', 'BAAA', ['present', 'present', 'miss', 'hit']],
    ['SECRET', 'STREET', ['hit', 'miss', 'present', 'present', 'hit', 'hit']],
    ['SECRET', 'LETTER', ['miss', 'hit', 'present', 'miss', 'hit', 'present']],
    ['BANANA', 'ANANAS', ['present', 'present', 'present', 'present', 'present', 'miss']],
    ['BANANA', 'CABANA', ['miss', 'hit', 'present', 'hit', 'hit', 'hit']],
  ])('scores secret %s / guess %s with exact positions reserved first', async (secret, guess, expected) => {
    const result = await db.query<{ marks: string[] }>('select private.feedback($1,$2) as marks', [secret, guess])
    expect(result.rows[0].marks).toEqual(expected)
  })
  it('matches an independent position-and-frequency oracle for all 6,561 four-item pairs', async () => {
    const codes = Array.from({ length: 81 }, (_, n) => n.toString(3).padStart(4, '0'))
    const results = await db.query<{ secret: string; guess: string; marks: string[] }>(`
      select secret,guess,private.feedback(secret,guess) as marks
      from unnest($1::text[]) as secret cross join unnest($1::text[]) as guess
    `, [codes])
    for (const { secret, guess, marks } of results.rows) {
      const matches = [...'012'].reduce((sum, c) => sum + Math.min([...secret].filter(x => x === c).length, [...guess].filter(x => x === c).length), 0)
      expect(marks.filter(m => m !== 'miss')).toHaveLength(matches)
      const exact = [...guess].map((char, i) => char === secret[i])
      const oracle = [...guess].map((char, i) => {
        if (exact[i]) return 'hit'
        const available = [...secret].filter((c, j) => c === char && !exact[j]).length
        const used = [...guess.slice(0, i + 1)].filter((c, j) => c === char && !exact[j]).length
        return used <= available ? 'present' : 'miss'
      })
      expect(marks).toEqual(oracle)
      expect(marks.every(m => m === 'hit')).toBe(secret === guess)
    }
  })
  it('upgrades saved clues without resetting active matches, secrets or scores', async () => {
    const pair = await roomPair(db)
    await start(db, pair)
    await call(db, pair.a, 'submit_guess', [pair.room, '4433', 1])
    await db.query("update public.guesses set feedback=array['hit','hit','hit','hit'] where room_id=$1", [pair.room])
    const before = await state(db, pair.a, pair.room)
    const sql = await readFile(new URL('../supabase/migrations/202610160004_wordle_feedback.sql', import.meta.url), 'utf8')
    const unlimited = await readFile(new URL('../supabase/migrations/202610160005_six_letter_unlimited.sql', import.meta.url), 'utf8')
    await db.transaction(async tx => { await tx.exec(sql); await tx.exec(unlimited) })
    const after = await state(db, pair.a, pair.room)
    expect(after.room).toEqual({ ...before.room, version: before.room.version + 2 })
    expect(after.players).toEqual(before.players)
    expect(after.own_secret).toBe(before.own_secret)
    expect(after.results).toEqual(before.results)
    expect(after.guesses[0]).toEqual({ ...before.guesses[0], feedback: ['present', 'present', 'present', 'present'] })
  })
  it('restarts legacy Word Lock only and lets an exhausted Number Lock player continue', async () => {
    const number = await roomPair(db)
    await start(db, number)
    for (let attempt = 1; attempt <= 8; attempt++) await call(db, number.a, 'submit_guess', [number.room, '0000', attempt])
    await db.query('update public.players set finished_at=now() where room_id=$1 and user_id=$2', [number.room, number.a])
    const before = await state(db, number.a, number.room)
    const word = await roomPair(db, 'word', 'turns')
    await start(db, word, ['LETTER', 'SECRET'])
    await call(db, word.a, 'submit_guess', [word.room, 'STREET', 1])
    await db.query("update public.secrets set code=case when user_id=$2 then 'MINT' else 'TREE' end where room_id=$1", [word.room, word.a])
    await db.query("update private.pending_guesses set guess='TEEM' where room_id=$1", [word.room])
    const previousWord = await state(db, word.a, word.room)
    const sql = await readFile(new URL('../supabase/migrations/202610160005_six_letter_unlimited.sql', import.meta.url), 'utf8')
    await db.transaction(tx => tx.exec(sql))
    const after = await state(db, number.a, number.room)
    expect(after.room).toEqual({ ...before.room, version: before.room.version + 1 })
    expect(after.guesses).toEqual(before.guesses)
    expect(after.own_secret).toBe('1122')
    expect(after.players.find(p => p.user_id === number.a)?.finished_at).toBeNull()
    await call(db, number.a, 'submit_guess', [number.room, '3344', 9])
    expect((await state(db, number.a, number.room)).results[0].winner_id).toBe(number.a)
    const nextWord = await state(db, word.a, word.room)
    expect(nextWord.room.status).toBe('lobby')
    expect(nextWord.room.match_number).toBe(previousWord.room.match_number + 1)
    expect(nextWord.own_secret).toBeNull()
    expect(nextWord.pending_guess).toBeNull()
    expect(nextWord.players.every(p => !p.ready && !p.secret_ready && p.attempts === 0)).toBe(true)
    expect(nextWord.players.map(p => p.wager)).toEqual(previousWord.players.map(p => p.wager))
    expect((await db.query('select * from public.secrets where room_id=$1', [word.room])).rows).toHaveLength(2)
    await expect(call(db, word.a, 'set_secret', [word.room, 'TREE'])).rejects.toThrow('six-letter')
    await call(db, word.a, 'set_secret', [word.room, 'SECRET'])
  })
})

describe('wagers, consent, authentication and privacy', () => {
  it('requires auth and valid names, modes and stakes', async () => {
    const a = await user(db)
    await expect(call(db, a, 'create_room', ['', 'number'])).rejects.toThrow('Display name')
    await expect(call(db, a, 'create_room', ['Alice', 'symbol'])).rejects.toThrow('Number Lock or Word Lock')
    await expect(call(db, a, 'create_room', ['Alice', 'number', 'money'])).rejects.toThrow('low or high')
    await expect(call(db, '', 'create_room', ['Alice', 'number'])).rejects.toThrow('Sign in')
    await expect(db.transaction(async tx => {
      await tx.exec('set local role anon')
      await tx.query("select public.create_room('Guest','number','low','Coffee','race')")
    })).rejects.toThrow('permission denied')
  })
  it('requires both written bets, and editing either invalidates both agreements', async () => {
    const a = await user(db)
    const b = await user(db)
    const room = await call<string>(db, a, 'create_room', ['Alice', 'number', 'high'])
    const code = (await state(db, a, room)).room.code
    await call(db, b, 'join_room', [code, 'Bob'])
    await expect(call(db, a, 'set_ready', [room, true])).rejects.toThrow('write a bet')
    await call(db, a, 'set_wager', [room, 'You plan a day out.'])
    await call(db, b, 'set_wager', [room, 'You cook dinner.'])
    await call(db, a, 'set_secret', [room, '1122'])
    await call(db, b, 'set_secret', [room, '3344'])
    await call(db, a, 'set_ready', [room, true])
    const oldRevision = (await state(db, a, room)).room.wager_version
    await call(db, b, 'set_wager', [room, 'You choose our next adventure.'])
    expect((await state(db, a, room)).players.every(p => !p.ready)).toBe(true)
    await expect(call(db, a, 'set_ready', [room, true, oldRevision])).rejects.toThrow('bets changed')
    await call(db, a, 'set_ready', [room, true])
    await call(db, b, 'set_ready', [room, true])
    expect((await state(db, a, room)).room.status).toBe('lobby')
    await call(db, a, 'start_round', [room])
    expect((await state(db, a, room)).room.status).toBe('playing')
    await expect(call(db, a, 'set_wager', [room, 'A different bet.'])).rejects.toThrow('locked')
  })
  it('allows only two room members and validates written bets', async () => {
    const pair = await roomPair(db)
    const c = await user(db)
    expect((await call<{ error: string }>(db, c, 'join_room', [pair.code, 'Eve'])).error).toContain('full')
    await expect(call(db, pair.a, 'set_wager', [pair.room, ''])).rejects.toThrow('1–120')
    await expect(call(db, pair.a, 'set_wager', [pair.room, 'x'.repeat(121)])).rejects.toThrow('1–120')
    await call(db, pair.a, 'set_secret', [pair.room, '1234'])
    expect((await state(db, pair.a, pair.room)).own_secret).toBe('1234')
    expect((await state(db, pair.a, pair.room)).room.status).toBe('lobby')
  })
  it('never exposes active opponent secrets, guesses, or draft bets', async () => {
    const pair = await roomPair(db)
    await start(db, pair)
    const c = await user(db)
    await call(db, pair.a, 'submit_guess', [pair.room, '1111', 1])
    const view = await state(db, pair.a, pair.room)
    expect(view.own_secret).toBe('1122')
    expect(view.results).toEqual([])
    expect((await state(db, pair.b, pair.room)).guesses).toEqual([])
    expect((await asUser<{ code: string }>(db, pair.a, 'select code from public.secrets')).rows).toEqual([{ code: '1122' }])
    for (const table of ['rooms', 'players', 'secrets', 'guesses', 'round_results']) {
      expect((await asUser(db, c, `select * from public.${table}`)).rows).toEqual([])
    }
    await expect(state(db, c, pair.room)).rejects.toThrow('not a member')
    await expect(call(db, c, 'set_secret', [pair.room, '0000'])).rejects.toThrow('not a member')
    await expect(asUser(db, pair.a, 'update public.players set score=999 where room_id=$1', [pair.room])).rejects.toThrow('permission denied')
    await expect(asUser(db, pair.a, "insert into public.secrets values($1,$2,1,1,'9999')", [pair.room, pair.a])).rejects.toThrow('permission denied')
    await expect(asUser(db, pair.a, "select private.feedback('1234','1111')")).rejects.toThrow('permission denied')
  })
  it('rate-limits failed joins without rolling back the rate-limit write', async () => {
    const c = await user(db)
    for (let i = 0; i < 30; i++) expect((await call<{ error: string }>(db, c, 'join_room', ['XXXXXX', 'Guest'])).error).toContain('not found')
    expect((await call<{ error: string }>(db, c, 'join_room', ['XXXXXX', 'Guest'])).error).toContain('Too many')
  })
  it('starts neither player before both secrets and the shared start timestamp', async () => {
    const pair = await roomPair(db)
    await call(db, pair.b, 'set_ready', [pair.room, true])
    await expect(call(db, pair.a, 'start_round', [pair.room])).rejects.toThrow('agree to the bets')
    await call(db, pair.a, 'set_ready', [pair.room, true])
    await expect(call(db, pair.a, 'start_round', [pair.room])).rejects.toThrow('lock a secret')
    await call(db, pair.a, 'set_secret', [pair.room, '0011'])
    await expect(call(db, pair.a, 'set_secret', [pair.room, '1234'])).rejects.toThrow('already locked')
    await expect(call(db, pair.a, 'submit_guess', [pair.room, '3344', 1])).rejects.toThrow('not accepting')
    await call(db, pair.b, 'set_secret', [pair.room, '3344'])
    expect((await state(db, pair.a, pair.room)).room.status).toBe('lobby')
    await expect(call(db, pair.b, 'start_round', [pair.room])).rejects.toThrow('Only the room creator')
    await call(db, pair.a, 'start_round', [pair.room])
    const aState = await state(db, pair.a, pair.room)
    const bState = await state(db, pair.b, pair.room)
    expect(aState.room.started_at).toBe(bState.room.started_at)
    expect(Date.parse(aState.room.started_at!)).toBeGreaterThan(Date.parse(aState.server_now))
    await expect(call(db, pair.a, 'submit_guess', [pair.room, '3344', 1])).rejects.toThrow('starts in a moment')
  })
})

describe('first-to-finish races and best of three', () => {
  it('awards an immediate win to the first solve, not the player with fewer attempts', async () => {
    const pair = await roomPair(db)
    await start(db, pair)
    await call(db, pair.a, 'submit_guess', [pair.room, '0000', 1])
    await call(db, pair.a, 'submit_guess', [pair.room, '3344', 2])
    const view = await state(db, pair.a, pair.room)
    expect(view.room.status).toBe('round_over')
    expect(view.results[0].winner_id).toBe(pair.a)
    expect(view.players.find(p => p.user_id === pair.a)?.score).toBe(1)
    expect(view.players.find(p => p.user_id === pair.b)?.attempts).toBe(0)
    expect(view.results[0].reveals[pair.b]).toBe('3344')
    const opponentView = await state(db, pair.b, pair.room)
    expect(opponentView.room.status).toBe('round_over')
    expect(opponentView.results[0]).toEqual(view.results[0])
    expect(opponentView.results[0].reveals).toEqual({ [pair.a]: '1122', [pair.b]: '3344' })
    expect(await call(db, pair.b, 'submit_guess', [pair.room, '1122', 1])).toEqual({ accepted: false, reason: 'round_finished' })
    expect((await state(db, pair.b, pair.room)).players).toEqual(opponentView.players)
    await call(db, pair.a, 'advance_round', [pair.room])
    expect((await state(db, pair.b, pair.room)).room.status).toBe('round_over')
    await call(db, pair.b, 'advance_round', [pair.room])
    const next = await state(db, pair.a, pair.room)
    expect(next.room.status).toBe('setting')
    expect(next.room.round_number).toBe(2)
    expect(next.own_secret).toBeNull()
    await expect(call(db, pair.a, 'submit_guess', [pair.room, '3344', 1])).rejects.toThrow('not accepting')
  })
  it('does not mistake four matching items in a different order for a solve', async () => {
    const pair = await roomPair(db)
    await start(db, pair)
    await call(db, pair.a, 'submit_guess', [pair.room, '4433', 1])
    const view = await state(db, pair.a, pair.room)
    expect(view.guesses[0].feedback).toEqual(['present', 'present', 'present', 'present'])
    expect(view.players.find(p => p.user_id === pair.a)?.solved).toBe(false)
    expect(view.room.status).toBe('playing')
  })
  it('serializes simultaneous exact guesses into one winner', async () => {
    const pair = await roomPair(db)
    await start(db, pair)
    const results = await Promise.all([
      call<{ accepted: boolean }>(db, pair.a, 'submit_guess', [pair.room, '3344', 1]),
      call<{ accepted: boolean }>(db, pair.b, 'submit_guess', [pair.room, '1122', 1]),
    ])
    expect(results.filter(r => r.accepted)).toHaveLength(1)
    const view = await state(db, pair.a, pair.room)
    expect(view.results).toHaveLength(1)
    expect(view.players.filter(p => p.solved)).toHaveLength(1)
    expect(view.players.reduce((sum, p) => sum + p.score, 0)).toBe(1)
  })
  it('allows guesses beyond eight while rejecting duplicate requests', async () => {
    const pair = await roomPair(db)
    await start(db, pair)
    await call(db, pair.a, 'submit_guess', [pair.room, '0000', 1])
    await expect(call(db, pair.a, 'submit_guess', [pair.room, '0000', 1])).rejects.toThrow('out of date')
    for (let i = 2; i <= 20; i++) await call(db, pair.a, 'submit_guess', [pair.room, '0000', i])
    for (let i = 1; i <= 20; i++) await call(db, pair.b, 'submit_guess', [pair.room, '9999', i])
    const view = await state(db, pair.a, pair.room)
    expect(view.room.status).toBe('playing')
    expect(view.results).toEqual([])
    expect(view.players.map(p => p.score)).toEqual([0, 0])
    expect(view.players.every(p => p.finished_at === null)).toBe(true)
    expect(view.guesses).toHaveLength(20)
    await call(db, pair.a, 'submit_guess', [pair.room, '3344', 21])
    expect((await state(db, pair.b, pair.room)).results[0].winner_id).toBe(pair.a)
  })
  it.each([[true, true], [true, false, true]])('ends the match at two wins and resets bets only on rematch: %j', async (...wins) => {
    const pair = await roomPair(db)
    await start(db, pair)
    const originalBets = (await state(db, pair.a, pair.room)).players.map(p => p.wager)
    for (let round = 1; round <= wins.length; round++) {
      const aWins = wins[round - 1]
      await call(db, aWins ? pair.a : pair.b, 'submit_guess', [pair.room, aWins ? '3344' : '1122', 1])
      const view = await state(db, pair.a, pair.room)
      expect(view.room.status).toBe(round === wins.length ? 'match_over' : 'round_over')
      expect(view.players.map(p => p.wager)).toEqual(originalBets)
      await call(db, pair.a, 'advance_round', [pair.room])
      expect((await state(db, pair.a, pair.room)).room.status).toBe(view.room.status)
      await call(db, pair.b, 'advance_round', [pair.room])
      const next = await state(db, pair.a, pair.room)
      expect(next.guesses).toEqual([])
      expect(next.own_secret).toBeNull()
      if (round < wins.length) {
        expect(next.players.every(p => p.ready)).toBe(true)
        await call(db, pair.a, 'set_secret', [pair.room, '1122'])
        await call(db, pair.b, 'set_secret', [pair.room, '3344'])
        await call(db, pair.a, 'start_round', [pair.room])
        await db.query("update public.rooms set started_at=clock_timestamp()-interval '1 second' where id=$1", [pair.room])
      } else {
        expect(next.room.status).toBe('lobby')
        expect(next.room.round_number).toBe(1)
        expect(next.room.match_number).toBe(2)
        expect(next.players.every(p => !p.wager && p.score === 0 && !p.ready)).toBe(true)
        expect(next.results).toEqual([])
      }
    }
  })
  it('rejects requests delayed from an earlier round or match', async () => {
    const pair = await roomPair(db)
    await start(db, pair)
    await call(db, pair.a, 'submit_guess', [pair.room, '3344', 1])
    await call(db, pair.a, 'advance_round', [pair.room])
    await call(db, pair.b, 'advance_round', [pair.room])
    await expect(call(db, pair.a, 'set_secret', [pair.room, '9999', 1, 1])).rejects.toThrow('Round out of date')
    await expect(call(db, pair.a, 'set_wager', [pair.room, 'Old request', 0])).rejects.toThrow('Match out of date')
  })
  it('has no time limit and supports elapsed durations longer than 32-bit milliseconds', async () => {
    const pair = await roomPair(db)
    await start(db, pair)
    await db.query("update public.rooms set started_at=now()-interval '30 days',created_at=now()-interval '31 days' where id=$1", [pair.room])
    await call(db, pair.a, 'heartbeat', [pair.room])
    expect((await state(db, pair.a, pair.room)).room.status).toBe('playing')
    await call(db, pair.a, 'submit_guess', [pair.room, '3344', 1])
    expect((await state(db, pair.a, pair.room)).guesses[0].elapsed_ms).toBeGreaterThan(2_147_483_647)
  })
  it.each([
    ['word', ['LETTER', 'SECRET'], 'STREET', ['hit', 'miss', 'present', 'present', 'hit', 'hit']],
    ['number', ['1122', '3344'], '3333', ['hit', 'hit', 'miss', 'miss']],
  ] as const)('validates and plays %s mode', async (mode, codes, guess, marks) => {
    const pair = await roomPair(db, mode)
    await start(db, pair, [...codes])
    await expect(call(db, pair.a, 'submit_guess', [pair.room, 'XXXXX', 1])).rejects.toThrow('Enter four')
    await call(db, pair.a, 'submit_guess', [pair.room, guess, 1])
    expect((await state(db, pair.a, pair.room)).guesses[0].feedback).toEqual(marks)
  })
  it('contains real six-letter words only, with no shorter legacy entries', async () => {
    const words = (await db.query<{ word: string }>('select word from public.word_bank')).rows.map(r => r.word)
    expect(words.length).toBeGreaterThan(500)
    expect(words).toEqual(expect.arrayContaining(['SECRET', 'LETTER', 'BANANA', 'ORANGE', 'PUZZLE', 'COFFEE']))
    for (const word of words) {
      expect(word).toMatch(/^[A-Z]{6}$/)
      expect(validateEntry('word', word, words)).toBeNull()
    }
    expect(words).not.toContain('APPLE')
    expect(words).not.toContain('MINT')
  })
  it('publishes rooms only, never guesses or secrets', async () => {
    const tables = await db.query<{ tablename: string }>("select tablename from pg_publication_tables where pubname='supabase_realtime'")
    expect(tables.rows.map(r => r.tablename)).toEqual(['rooms'])
  })
})

describe('host-controlled setup and protected manual turns', () => {
  it('requires the host bet at creation and shares the host configuration with the guest', async () => {
    const a = await user(db)
    const b = await user(db)
    await expect(call(db, a, 'create_room', ['Alice', 'number', 'high', '', 'turns'])).rejects.toThrow('Write a bet')
    await expect(call(db, a, 'create_room', ['Alice', 'number', 'high', 'Coffee', 'invalid'])).rejects.toThrow('turn-by-turn')
    const room = await call<string>(db, a, 'create_room', ['Alice', 'word', 'high', 'A day out.', 'turns'])
    const hostState = await state(db, a, room)
    await call(db, b, 'join_room', [hostState.room.code, 'Bob'])
    const guestState = await state(db, b, room)
    expect(guestState.room.stake).toBe('high')
    expect(guestState.room.variant).toBe('turns')
    expect(guestState.room.mode).toBe('word')
    await expect(asUser(db, b, "update public.rooms set stake='low',variant='race' where id=$1", [room])).rejects.toThrow('permission denied')
  })
  it('blocks false, self-authored and replayed hints and never exposes unchecked feedback', async () => {
    const pair = await roomPair(db, 'number', 'turns')
    await start(db, pair)
    expect((await state(db, pair.a, pair.room)).room.turn_user_id).toBe(pair.a)
    await expect(call(db, pair.b, 'submit_guess', [pair.room, '1122', 1])).rejects.toThrow('opponent')
    await call(db, pair.a, 'submit_guess', [pair.room, '3333', 1])
    const attackerState = await state(db, pair.a, pair.room)
    const defenderState = await state(db, pair.b, pair.room)
    const pending = attackerState.pending_guess!
    expect(pending.guess).toBe('3333')
    expect(pending).not.toHaveProperty('feedback')
    expect(attackerState.guesses).toEqual([])
    expect(defenderState.pending_guess).toEqual(pending)
    expect((await asUser(db, pair.a, 'select * from public.guesses where room_id=$1', [pair.room])).rows).toEqual([])
    await expect(asUser(db, pair.a, 'select * from private.pending_guesses')).rejects.toThrow('permission denied')
    await expect(call(db, pair.a, 'submit_guess', [pair.room, '3344', 2])).rejects.toThrow('Wait for')
    await expect(call(db, pair.a, 'submit_hints', [pair.room, pending.id, ['hit', 'hit', 'miss', 'miss']])).rejects.toThrow('secret owner')
    await expect(call(db, pair.b, 'submit_hints', [pair.room, pending.id, ['miss', 'miss', 'miss', 'miss']])).rejects.toThrow('do not match')
    await expect(call(db, pair.b, 'submit_hints', [pair.room, pending.id, ['hit', 'hit']])).rejects.toThrow('do not match')
    expect((await state(db, pair.a, pair.room)).guesses).toEqual([])
    expect((await state(db, pair.a, pair.room)).pending_guess?.id).toBe(pending.id)
    await call(db, pair.b, 'submit_hints', [pair.room, pending.id, ['hit', 'hit', 'miss', 'miss']])
    const checked = await state(db, pair.a, pair.room)
    expect(checked.guesses[0].feedback).toEqual(['hit', 'hit', 'miss', 'miss'])
    expect(checked.pending_guess).toBeNull()
    expect(checked.room.turn_user_id).toBe(pair.b)
    expect((await state(db, pair.b, pair.room)).guesses).toEqual([])
    await expect(call(db, pair.b, 'submit_hints', [pair.room, pending.id, ['hit', 'hit', 'miss', 'miss']])).rejects.toThrow('already been checked')
    await call(db, pair.b, 'submit_guess', [pair.room, '1122', 1])
    expect((await state(db, pair.a, pair.room)).results[0].winner_id).toBe(pair.b)
  })
  it('validates green and yellow manual hints with repeated letters', async () => {
    const pair = await roomPair(db, 'word', 'turns')
    await start(db, pair, ['LETTER', 'SECRET'])
    await call(db, pair.a, 'submit_guess', [pair.room, 'STREET', 1])
    const pending = (await state(db, pair.b, pair.room)).pending_guess!
    await expect(call(db, pair.b, 'submit_hints', [pair.room, pending.id, ['hit', 'miss', 'hit', 'hit']])).rejects.toThrow('do not match')
    await expect(call(db, pair.b, 'submit_hints', [pair.room, pending.id, ['hit', 'present', 'present', 'present', 'hit', 'hit']])).rejects.toThrow('correct positions green')
    await call(db, pair.b, 'submit_hints', [pair.room, pending.id, ['hit', 'miss', 'present', 'present', 'hit', 'hit']])
    expect((await state(db, pair.a, pair.room)).guesses[0].feedback).toEqual(['hit', 'miss', 'present', 'present', 'hit', 'hit'])
  })
  it('alternates the opening player each round and still requires host start', async () => {
    const pair = await roomPair(db, 'number', 'turns')
    await start(db, pair)
    await call(db, pair.a, 'submit_guess', [pair.room, '3344', 1])
    expect((await state(db, pair.a, pair.room)).pending_guess).toBeNull()
    await call(db, pair.a, 'advance_round', [pair.room])
    await call(db, pair.b, 'advance_round', [pair.room])
    await call(db, pair.a, 'set_secret', [pair.room, '1122'])
    await call(db, pair.b, 'set_secret', [pair.room, '3344'])
    expect((await state(db, pair.a, pair.room)).room.status).toBe('setting')
    await launch(db, pair)
    expect((await state(db, pair.a, pair.room)).room.turn_user_id).toBe(pair.b)
  })
  it('alternates unlimited equal turns, rejecting extra turns until the first exact win', async () => {
    const pair = await roomPair(db, 'number', 'turns')
    await start(db, pair)
    for (let attempt = 1; attempt <= 12; attempt++) {
      for (const [guesser, defender, guess] of [[pair.a, pair.b, '0000'], [pair.b, pair.a, '9999']]) {
        await call(db, guesser, 'submit_guess', [pair.room, guess, attempt])
        const pendingState = await state(db, defender, pair.room)
        expect(pendingState.room.status).toBe('playing')
        await call(db, defender, 'submit_hints', [pair.room, pendingState.pending_guess!.id, ['miss', 'miss', 'miss', 'miss']])
        await expect(call(db, guesser, 'submit_guess', [pair.room, guess, attempt + 1])).rejects.toThrow('opponent')
      }
    }
    const final = await state(db, pair.a, pair.room)
    expect(final.room.status).toBe('playing')
    expect(final.results).toEqual([])
    expect(final.players.map(p => p.attempts)).toEqual([12, 12])
    expect(final.guesses).toHaveLength(12)
    expect(final.pending_guess).toBeNull()
    await call(db, pair.a, 'submit_guess', [pair.room, '3344', 13])
    expect((await state(db, pair.b, pair.room)).results[0].winner_id).toBe(pair.a)
    expect(await call(db, pair.b, 'submit_guess', [pair.room, '1122', 13])).toEqual({ accepted: false, reason: 'round_finished' })
  })
})
