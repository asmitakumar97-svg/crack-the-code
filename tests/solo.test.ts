import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, call, createDatabase, user } from './database'
import type { SoloState } from '../src/lib/game'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db?.close() })

async function puzzle(mode = 'number', challenge = 'attempts') {
  const player = await user(db)
  const game = await call<SoloState>(db, player, 'create_solo_game', [mode, challenge])
  return { player, game }
}
const submit = (player: string, game: SoloState, guess: string | null, attempt: number | null) =>
  call<{ accepted: boolean; reason?: string; game: SoloState }>(db, player, 'submit_solo_guess', [game.id, guess, attempt])

describe('protected, server-validated solo puzzles', () => {
  it.each([
    ['number', '0011', '0000', ['hit', 'hit', 'miss', 'miss']],
    ['word', 'SECRET', 'STREET', ['hit', 'miss', 'present', 'present', 'hit', 'hit']],
  ] as const)('hides the %s answer, checks duplicate clues and reveals only after completion', async (mode, answer, guess, marks) => {
    const { player, game } = await puzzle(mode)
    expect(game).toMatchObject({ mode, challenge: 'attempts', status: 'playing', guesses: [], secret: null, deadline: null, max_guesses: 6, version: 1 })
    expect(game).not.toHaveProperty('answer')
    await db.query('update private.solo_games set answer=$2 where id=$1', [game.id, answer])
    const result = await submit(player, game, guess, 1)
    expect(result.accepted).toBe(true)
    expect(result.game.secret).toBeNull()
    expect(result.game.guesses[0].feedback).toEqual(marks)
    const solved = await submit(player, game, ` ${answer.toLowerCase()} `, 2)
    expect(solved).toMatchObject({ accepted: true, game: { status: 'won', secret: answer, version: 3 } })
    expect(solved.game.finished_at).not.toBeNull()
    const late = await submit(player, game, guess, 3)
    expect(late).toMatchObject({ accepted: false, reason: 'puzzle_finished', game: { status: 'won' } })
    expect(late.game.guesses).toHaveLength(2)
  })

  it('allows exactly six accepted guesses and does not accept a seventh after losing', async () => {
    const { player, game } = await puzzle()
    await db.query("update private.solo_games set answer='9999' where id=$1", [game.id])
    for (let attempt = 1; attempt <= 6; attempt++) {
      const result = await submit(player, game, '0000', attempt)
      expect(result.accepted).toBe(true)
      expect(result.game.status).toBe(attempt === 6 ? 'lost' : 'playing')
      expect(result.game.guesses).toHaveLength(attempt)
      expect(result.game.secret).toBe(attempt === 6 ? '9999' : null)
    }
    const seventh = await submit(player, game, '9999', 7)
    expect(seventh.accepted).toBe(false)
    expect(seventh.game.status).toBe('lost')
    expect(seventh.game.guesses).toHaveLength(6)
  })

  it('starts a fixed 180-second timer, accepts more than six guesses, and rejects a late solve', async () => {
    const { player, game } = await puzzle('number', 'timed')
    expect(game.max_guesses).toBeNull()
    expect(Date.parse(game.deadline!) - Date.parse(game.started_at)).toBe(180000)
    await db.query("update private.solo_games set answer='9999' where id=$1", [game.id])
    for (let attempt = 1; attempt <= 12; attempt++) {
      const result = await submit(player, game, '0000', attempt)
      expect(result).toMatchObject({ accepted: true, game: { status: 'playing', deadline: game.deadline, secret: null } })
    }
    await db.query("update private.solo_games set started_at=clock_timestamp()-interval '181 seconds',deadline=clock_timestamp()-interval '1 second' where id=$1", [game.id])
    const late = await submit(player, game, '9999', 13)
    expect(late).toMatchObject({ accepted: false, reason: 'time_expired', game: { status: 'lost', secret: '9999' } })
    expect(late.game.guesses).toHaveLength(12)
    expect(late.game.finished_at).toBe(late.game.deadline)
  })

  it('resumes the same active puzzle across sessions without resetting its deadline and finalizes expired reloads', async () => {
    const { player, game } = await puzzle('word', 'timed')
    const resume = await call<SoloState>(db, player, 'get_solo_game', [null])
    expect(resume).toMatchObject({ id: game.id, deadline: game.deadline, started_at: game.started_at, secret: null })
    await db.query("update private.solo_games set started_at=clock_timestamp()-interval '180 seconds',deadline=clock_timestamp() where id=$1", [game.id])
    const expired = await call<SoloState>(db, player, 'get_solo_game', [game.id])
    expect(expired).toMatchObject({ id: game.id, status: 'lost', version: 2 })
    expect(expired.secret).toMatch(/^[A-Z]{6}$/)
    const again = await call<SoloState>(db, player, 'get_solo_game', [game.id])
    expect(again.version).toBe(2)
    expect(await call(db, player, 'get_solo_game', [null])).toBeNull()
  })

  it('does not consume attempts for invalid guesses and accepts words that ignore earlier clues', async () => {
    const { player, game } = await puzzle('word')
    await db.query("update private.solo_games set answer='SECRET' where id=$1", [game.id])
    await expect(submit(player, game, 'XXXXXX', 1)).rejects.toThrow('real six-letter word')
    await expect(submit(player, game, null, 1)).rejects.toThrow('real six-letter word')
    await expect(submit(player, game, 'SECRET', 2)).rejects.toThrow('guesses changed')
    await expect(submit(player, game, 'SECRET', null)).rejects.toThrow('guesses changed')
    expect((await call<SoloState>(db, player, 'get_solo_game', [game.id])).guesses).toEqual([])
    await submit(player, game, 'STREET', 1)
    const result = await submit(player, game, 'NORMAL', 2)
    expect(result.game.guesses.map(guess => guess.guess)).toEqual(['STREET', 'NORMAL'])
  })

  it('isolates players and denies direct access or anonymous RPC execution', async () => {
    const { player, game } = await puzzle()
    const outsider = await user(db)
    await expect(call(db, outsider, 'get_solo_game', [game.id])).rejects.toThrow('No solo puzzle was found')
    await expect(submit(outsider, game, '0000', 1)).rejects.toThrow('No solo puzzle was found')
    expect(await call(db, outsider, 'get_solo_game', [null])).toBeNull()
    await expect(asUser(db, player, 'select * from private.solo_games')).rejects.toThrow('permission denied')
    await expect(asUser(db, player, "update private.solo_games set answer='0000' where id=$1", [game.id])).rejects.toThrow('permission denied')
    await expect(db.transaction(async tx => {
      await tx.exec('set local role anon')
      await tx.query("select public.create_solo_game('number','attempts')")
    })).rejects.toThrow('permission denied')
  })

  it('keeps only one active puzzle per player and validates mode/challenge choices', async () => {
    const { player, game } = await puzzle()
    await expect(call(db, player, 'create_solo_game', ['invalid', 'attempts'])).rejects.toThrow('Choose Number Lock')
    await expect(call(db, player, 'create_solo_game', ['word', null])).rejects.toThrow('Choose six guesses')
    const next = await call<SoloState>(db, player, 'create_solo_game', ['word', 'timed'])
    expect(next.id).not.toBe(game.id)
    expect((await call<SoloState>(db, player, 'get_solo_game', [game.id])).status).toBe('abandoned')
    expect((await call<SoloState>(db, player, 'get_solo_game', [null])).id).toBe(next.id)
    expect((await db.query<{ count: number }>("select count(*)::integer as count from private.solo_games where user_id=$1 and status='playing'", [player])).rows[0].count).toBe(1)
  })

  it('uses the original common-word answer pool without restricting the expanded guess dictionary', async () => {
    const result = await db.query<{ answers: number; total: number }>('select count(*) filter(where is_answer)::integer as answers,count(*)::integer as total from public.word_bank')
    expect(result.rows[0].answers).toBe(761)
    expect(result.rows[0].total).toBeGreaterThan(11000)
    const { game } = await puzzle('word')
    const answer = (await db.query<{ answer: string }>('select answer from private.solo_games where id=$1', [game.id])).rows[0].answer
    expect((await db.query('select word from public.word_bank where word=$1 and is_answer', [answer])).rows).toHaveLength(1)
  })
})
