import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, call, createDatabase, user } from './database'
import type { Difficulty, DotsState, SoloBoardState } from '../src/lib/game'

let db: PGlite
type ComputerState = Extract<SoloBoardState, { kind: 'memory' | 'dots' }>
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db?.close() })
const get = (id: string, player: string) => call<ComputerState>(db, player, 'get_solo_board', [id])
const start = (player: string, kind = 'memory', difficulty = 'medium', tiles = 12, dots = 10) =>
  call<ComputerState>(db, player, 'create_solo_board', [kind, difficulty, tiles, 'animals', dots])
const play = (g: ComputerState, player: string, action: string, index: number | null = null) =>
  call<ComputerState>(db, player, 'play_solo_board', [g.id, g.version, action, index])
async function fast(id: string) {
  await db.query(`update private.solo_boards set next_action_at=case when next_action_at is null then null else clock_timestamp()-interval '1 second' end,
    board=case when kind='memory' and board->>'reveal_until' is not null then jsonb_set(board,'{reveal_until}',to_jsonb(clock_timestamp()-interval '1 second'))
      when kind='dots' and board->>'roll_until' is not null then jsonb_set(board,'{roll_until}',to_jsonb(clock_timestamp()-interval '1 second')) else board end where id=$1`, [id])
}
async function deck(id: string) { return (await db.query<{ deck: number[] }>("select (board->'deck') as deck from private.solo_boards where id=$1", [id])).rows[0].deck }

describe('private solo computer matches', () => {
  it.each(['easy', 'medium', 'hard'])('creates private %s games without a room, second identity or hidden-deck disclosure', async difficulty => {
    const player = await user(db)
    const g = await start(player, 'memory', difficulty, 24)
    expect(g).toMatchObject({ kind: 'memory', difficulty, status: 'playing', next_action_at: null })
    if (g.kind !== 'memory') throw new Error('Expected memory')
    expect(g.board.cards).toEqual(Array(24).fill(null))
    expect(g.board.scores).toEqual({ [player]: 0, [g.computer_id]: 0 })
    expect(g).not.toHaveProperty('knowledge')
    expect(g.board).not.toHaveProperty('deck')
    expect(g.board).not.toHaveProperty('flipped')
    expect((await db.query('select id from public.rooms')).rows).toEqual([])
    expect((await db.query('select id from auth.users where id=$1', [g.computer_id])).rows).toEqual([])
    const outsider = await user(db)
    await expect(get(g.id, outsider)).rejects.toThrow('No solo board')
    await expect(play(g, outsider, 'flip', 0)).rejects.toThrow('No solo board')
    await expect(asUser(db, player, 'select * from private.solo_boards')).rejects.toThrow('permission denied')
    await expect(asUser(db, player, 'select private.computer_id()')).rejects.toThrow('permission denied')
  })

  it('rejects invalid settings/actions, stale versions, early rolls and repeated cards', async () => {
    const player = await user(db)
    await expect(start(player, 'memory', 'expert')).rejects.toThrow('valid solo')
    await expect(start(player, 'memory', 'easy', 13)).rejects.toThrow('valid solo')
    await expect(start(player, 'dots', 'easy', 12, 11)).rejects.toThrow('valid solo')
    let g = await start(player)
    await expect(play(g, player, 'line', 0)).rejects.toThrow('valid action')
    await expect(play(g, player, 'flip', -1)).rejects.toThrow('board')
    const old = g
    g = await play(g, player, 'flip', 0)
    await expect(play(old, player, 'flip', 1)).rejects.toThrow('board changed')
    await expect(play(g, player, 'flip', 0)).rejects.toThrow('different card')
    g = await start(player, 'dots')
    await expect(play(g, player, 'line', 0)).rejects.toThrow('Roll')
    g = await play(g, player, 'roll')
    expect(g.kind === 'dots' && g.board.roll! >= 1 && g.board.roll! <= 8).toBe(true)
    await expect(play(g, player, 'roll')).rejects.toThrow('remaining lines')
    await expect(play(g, player, 'line', 0)).rejects.toThrow('finish rolling')
  })

  it.each([['easy', 4], ['medium', 8], ['hard', 12]] as const)('%s remembers at most %i observed cards', async (difficulty, capacity) => {
    const player = await user(db)
    const g = await start(player, 'memory', difficulty)
    for (let i = 0; i < 12; i++) {
      await db.query('update private.solo_boards set knowledge=private.remember_card(solo_boards,$2) where id=$1', [g.id, i])
    }
    const knowledge = (await db.query<{ knowledge: { index: number; value: number }[] }>('select knowledge from private.solo_boards where id=$1', [g.id])).rows[0].knowledge
    expect(knowledge).toHaveLength(capacity)
    expect(knowledge.map(card => card.index)).toEqual(Array.from({ length: capacity }, (_, i) => 12 - capacity + i))
    const values = await deck(g.id)
    for (const card of knowledge) expect(card.value).toBe(values[card.index])
  })

  it('learns only revealed cards, waits for a mismatch, and performs one visible computer flip per due step', async () => {
    const player = await user(db)
    let g = await start(player, 'memory', 'hard')
    const values = await deck(g.id)
    const other = values.findIndex(value => value !== values[0])
    g = await play(g, player, 'flip', 0)
    let knowledge = (await db.query<{ knowledge: { index: number }[] }>('select knowledge from private.solo_boards where id=$1', [g.id])).rows[0].knowledge
    expect(knowledge.map(card => card.index)).toEqual([0])
    g = await play(g, player, 'flip', other)
    expect(g.board.turn_user).toBe(g.computer_id)
    await expect(play(g, player, 'flip', 1)).rejects.toThrow('computer')
    expect((await get(g.id, player)).version).toBe(g.version)
    await fast(g.id)
    expect((await call<SoloBoardState>(db, player, 'get_solo_board', [null])).version).toBe(g.version)
    const first = await get(g.id, player)
    expect(first.version).toBe(g.version + 1)
    if (first.kind !== 'memory') throw new Error('Expected memory')
    expect(first.board.cards.filter(card => card !== null)).toHaveLength(1)
    knowledge = (await db.query<{ knowledge: { index: number }[] }>('select knowledge from private.solo_boards where id=$1', [g.id])).rows[0].knowledge
    expect(knowledge).toHaveLength(3)
    expect((await get(g.id, player)).version).toBe(first.version)
    expect(first.board).not.toHaveProperty('deck')
  })

  it('uses remembered pairs without depending on the values of unseen cards', async () => {
    const player = await user(db)
    const g = await start(player, 'memory', 'hard')
    const values = await deck(g.id)
    const mate = values.findIndex((value, i) => i > 0 && value === values[0])
    await db.query('update private.solo_boards set knowledge=$2 where id=$1', [g.id, JSON.stringify([{ index: 0, value: values[0] }, { index: mate, value: values[0] }])])
    for (let i = 0; i < 8; i++) {
      const result = (await db.query<{ card: number }>('select private.computer_memory_card(solo_boards) as card from private.solo_boards where id=$1', [g.id])).rows[0].card
      expect([0, mate]).toContain(result)
    }
    const changed = values.map((value, index) => index === 0 || index === mate ? value : 99)
    await db.query("update private.solo_boards set board=jsonb_set(board,'{deck}',$2) where id=$1", [g.id, JSON.stringify(changed)])
    const result = (await db.query<{ card: number }>('select private.computer_memory_card(solo_boards) as card from private.solo_boards where id=$1', [g.id])).rows[0].card
    expect([0, mate]).toContain(result)
  })

  it.each(['easy', 'medium', 'hard'] as const)('finishes Memory Match against a legal %s opponent with accurate scores', async difficulty => {
    const player = await user(db)
    let g = await start(player, 'memory', difficulty)
    const values = await deck(g.id)
    g = await play(g, player, 'flip', 0)
    g = await play(g, player, 'flip', values.findIndex(value => value !== values[0]))
    let steps = 0
    while (g.status === 'playing' && steps++ < 100) {
      await fast(g.id)
      g = await get(g.id, player)
      if (g.kind !== 'memory') throw new Error('Expected memory')
      if (g.board.turn_user !== player || g.board.finished) continue
      await fast(g.id)
      const memory = g.board
      const index = values.findIndex((_, i) => !memory.matched.includes(i))
      const mate = values.findIndex((value, i) => i !== index && value === values[index])
      g = await play(g, player, 'flip', index)
      g = await play(g, player, 'flip', mate)
    }
    expect(g.status).toBe('finished')
    if (g.kind !== 'memory') throw new Error('Expected memory')
    expect(g.board.cards).toEqual(values)
    expect(Object.values(g.board.scores).reduce((a, b) => a + b)).toBe(6)
    expect(g.next_action_at).toBeNull()
    await expect(play(g, player, 'flip', 0)).rejects.toThrow('complete')
  })

  it('Medium claims available boxes and Hard also avoids gifting a third side', async () => {
    const player = await user(db)
    const g = await start(player, 'dots')
    if (g.kind !== 'dots') throw new Error('Expected dots')
    const d: DotsState = { ...g.board, edges: Array(180).fill(null) }
    for (const edge of [0, 9, 90]) d.edges[edge] = player
    const choose = async (difficulty: Difficulty) => (await db.query<{ edge: number }>('select private.computer_dots_edge(jsonb_populate_record(null::private.dots_games,$1),$2) as edge', [JSON.stringify(d), difficulty])).rows[0].edge
    expect(await choose('medium')).toBe(91)
    expect(await choose('hard')).toBe(91)
    expect(d.edges[await choose('easy')]).toBeNull()
    d.edges[90] = null
    for (let i = 0; i < 8; i++) expect([90, 91]).not.toContain(await choose('hard'))
  })

  it.each(['easy', 'medium', 'hard'] as const)('completes all D8 boxes against a %s computer, preserving legal turns and dice budgets', async difficulty => {
    const player = await user(db)
    let g = await start(player, 'dots', difficulty)
    let steps = 0
    while (g.status === 'playing' && steps++ < 300) {
      await fast(g.id)
      if (g.board.turn_user === player) {
        if (g.kind !== 'dots') throw new Error('Expected dots')
        g = await play(g, player, g.board.remaining ? 'line' : 'roll', g.board.remaining ? g.board.edges.indexOf(null) : null)
      } else {
        const before = g
        g = await get(g.id, player)
        expect(g.board.moves).toBe(before.board.moves + 1)
      }
    }
    expect(g.status).toBe('finished')
    if (g.kind !== 'dots') throw new Error('Expected dots')
    expect(g.board.edges.every(Boolean)).toBe(true)
    expect(g.board.boxes.every(Boolean)).toBe(true)
    expect(Object.values(g.board.scores).reduce((a, b) => a + b)).toBe(81)
    for (const id of [player, g.computer_id]) expect(g.board.scores[id]).toBe(g.board.boxes.filter(owner => owner === id).length)
    expect(g.next_action_at).toBeNull()
  })

  it('persists across reads, serializes duplicate actions and replaces only the owner’s active computer game', async () => {
    const player = await user(db)
    let g = await start(player)
    const results = await Promise.allSettled([0, 1].map(() => play(g, player, 'flip', 0)))
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    g = await get(g.id, player)
    expect(g.board.moves).toBe(1)
    expect((await get(g.id, player)).board).toEqual(g.board)
    const code = await call<{ id: string }>(db, player, 'create_solo_game', ['number', 'attempts'])
    const outsider = await user(db)
    const theirGame = await start(outsider)
    const next = await start(player, 'dots')
    expect((await get(g.id, player)).status).toBe('abandoned')
    expect((await get(theirGame.id, outsider)).status).toBe('playing')
    expect((await call<{ status: string }>(db, player, 'get_solo_game', [code.id])).status).toBe('playing')
    expect((await call<SoloBoardState>(db, player, 'get_solo_board', [null])).id).toBe(next.id)
    expect((await db.query('select id from private.turn_push_events')).rows).toEqual([])
  })
})
