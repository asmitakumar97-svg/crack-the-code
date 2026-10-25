import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { PartyKind, SoloBoardState } from '../src/lib/game'
import { asUser, call, createDatabase, state, user } from './database'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db.close() })
async function duo(kind: PartyKind) {
  const a = await user(db), b = await user(db)
  const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
  const initial = await state(db, a, room)
  await call(db, b, 'join_room', [initial.room.code, 'Bob'])
  await call(db, a, 'choose_duo_game', [room, initial.hub!.revision, kind, 12, 'animals', 'number', 'turns', 10])
  const revision = (await state(db, a, room)).hub!.revision
  await call(db, a, 'confirm_duo_game', [room, revision])
  expect((await state(db, a, room)).room.duo_lobby).toBe(true)
  await call(db, b, 'confirm_duo_game', [room, revision])
  return { a, b, room }
}
type Duo = Awaited<ReturnType<typeof duo>>
const get = async (p: Duo, actor: string = p.a) => (await state(db, actor, p.room)).party!
async function play(p: Duo, actor: string, action: string, data: Record<string, unknown>, count?: number) {
  const g = await get(p, actor)
  await call(db, actor, 'play_party', [p.room, g.session_id, count ?? g.moves, action, JSON.stringify(data)])
  return get(p, actor)
}
const seed = (p: Duo, patch: Record<string, unknown>) => db.query('update private.party_games set board=board||$2::jsonb where room_id=$1', [p.room, JSON.stringify(patch)])
type SoloParty = Extract<SoloBoardState, { kind: PartyKind }>
const createSolo = (actor: string, kind: PartyKind, level = 'medium') => call<SoloParty>(db, actor, 'create_solo_board', [kind, level, 12, 'animals', 10])
const getSolo = (actor: string, id: string | null) => call<SoloParty>(db, actor, 'get_solo_board', [id])
const soloPlay = (actor: string, g: SoloParty, action: string, data: Record<string, unknown>) => call<SoloParty>(db, actor, 'play_solo_party', [g.id, g.board.moves, action, JSON.stringify(data)])
const due = (id: string) => db.query("update private.solo_boards set next_action_at=clock_timestamp()-interval '100 seconds' where id=$1", [id])
const oracleLines = (numbers: number[], called: number[]) => Array.from({ length: 12 }, (_, line) => Array.from({ length: 5 }, (_, cell) =>
  line < 5 ? line * 5 + cell : line < 10 ? cell * 5 + line - 5 : line === 10 ? cell * 6 : 4 + cell * 4))
  .filter(indices => indices.every(index => called.includes(numbers[index]))).length

describe('Bingo', () => {
  it('deals independent 1–25 boards, hides the opponent layout and marks both boards on alternate calls', async () => {
    const p = await duo('bingo'), a = await get(p), b = await get(p, p.b)
    if (a.kind !== 'bingo' || b.kind !== 'bingo') throw new Error('Expected Bingo')
    expect([...a.numbers].sort((x, y) => x - y)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1))
    expect(a.numbers).not.toEqual(b.numbers)
    expect(a).not.toHaveProperty('boards')
    await expect(play(p, p.b, 'call', { number: 1 })).rejects.toThrow('opponent')
    await play(p, p.a, 'call', { number: 1 })
    expect((await get(p, p.b))).toMatchObject({ called: [1], turn_user: p.b })
    await expect(play(p, p.b, 'call', { number: 1 })).rejects.toThrow('already called')
    await expect(play(p, p.b, 'call', { number: 26 })).rejects.toThrow('1 to 25')
    await expect(play(p, p.b, 'call', { number: 2 }, 0)).rejects.toThrow('board changed')
  })

  it('counts horizontal, vertical and both diagonal lines against an independent oracle', async () => {
    const numbers = Array.from({ length: 25 }, (_, i) => i + 1)
    for (const called of [[1, 7, 13, 19, 25], [5, 9, 13, 17, 21], numbers.slice(0, 10), [1, 6, 11, 16, 21], numbers]) {
      const value = (await db.query<{ n: number }>('select private.bingo_lines($1::jsonb,$2::jsonb) as n', [JSON.stringify(numbers), JSON.stringify(called)])).rows[0].n
      expect(value).toBe(oracleLines(numbers, called))
    }
  })

  it('finishes at five lines, resolves same-call finishes as draws and allows only the host to switch', async () => {
    const p = await duo('bingo')
    const numbers = Array.from({ length: 25 }, (_, i) => i + 1)
    await seed(p, { boards: { [p.a]: numbers, [p.b]: numbers } })
    let g = await get(p)
    for (let n = 1; n <= 25 && !g.finished; n++) g = await play(p, g.turn_user!, 'call', { number: n })
    expect(g.finished).toBe(true)
    expect(g.winner_id).toBeNull()
    if (g.kind !== 'bingo') throw new Error('Expected Bingo')
    expect(g.lines[p.a]).toBeGreaterThanOrEqual(5)
    await expect(play(p, p.a, 'call', { number: 25 })).rejects.toThrow('complete')
    await expect(call(db, p.b, 'open_duo_lobby', [p.room])).rejects.toThrow('host')
    await call(db, p.a, 'open_duo_lobby', [p.room])
    expect((await state(db, p.a, p.room)).room.duo_lobby).toBe(true)
  })

  it('awards the player who reaches five first when the same call leaves the other player below five', async () => {
    const p = await duo('bingo')
    const a = Array.from({ length: 25 }, (_, i) => i + 1)
    const b = [1, 7, 13, 19, 25, 6, 12, 18, 24, 5, 11, 17, 23, 4, 10, 16, 22, 3, 9, 15, 21, 2, 8, 14, 20]
    await seed(p, { boards: { [p.a]: a, [p.b]: b } })
    let g = await get(p)
    for (let n = 1; n <= 21; n++) g = await play(p, g.turn_user!, 'call', { number: n })
    expect(g).toMatchObject({ finished: true, winner_id: p.a, lines: { [p.a]: 6, [p.b]: 2 } })
  })
})

describe('Cheat', () => {
  it('deals all 52 unique cards and exposes only your hand, public counts and face-down claims', async () => {
    const p = await duo('cheat'), a = await get(p), b = await get(p, p.b)
    if (a.kind !== 'cheat' || b.kind !== 'cheat') throw new Error('Expected Cheat')
    expect(a.cards).toHaveLength(26)
    expect(b.cards).toHaveLength(26)
    expect([...a.cards, ...b.cards].sort((x, y) => x - y)).toEqual(Array.from({ length: 52 }, (_, i) => i))
    await play(p, p.a, 'play', { cards: a.cards.slice(0, 2) })
    const seen = await get(p, p.b)
    expect(seen).toMatchObject({ phase: 'challenge', pile_count: 2, last_play: { player: p.a, count: 2, rank: 1 } })
    for (const key of ['hands', 'pile', 'pending']) expect(seen).not.toHaveProperty(key)
    expect(seen).toHaveProperty('reveal', null)
    await expect(play(p, p.a, 'accept', {})).rejects.toThrow('opponent')
    await expect(asUser(db, p.b, 'select * from private.party_games')).rejects.toThrow('permission denied')
  })

  it.each([true, false])('assigns the pile correctly when the challenged claim is truthful=%s', async truthful => {
    const p = await duo('cheat')
    await seed(p, { hands: { [p.a]: truthful ? [0, 13] : [1, 2], [p.b]: [4] }, pile: [3, 5] })
    await play(p, p.a, 'play', { cards: [truthful ? 0 : 1] })
    const incoming = await get(p, p.b)
    const g = await play(p, p.b, 'challenge', {})
    expect(g).toMatchObject({ phase: 'play', rank: 2, turn_user: p.b, pile_count: 0, reveal: { truthful, cards: [truthful ? 0 : 1], recipient: truthful ? p.b : p.a } })
    expect(g.turn_number).toBe(incoming.turn_number)
    if (g.kind !== 'cheat') throw new Error('Expected Cheat')
    expect(g.hand_counts[truthful ? p.b : p.a]).toBe(4)
  })

  it.each(['accept', 'challenge'])('waits for the last truthful card to survive %s before declaring victory', async response => {
    const p = await duo('cheat')
    await seed(p, { hands: { [p.a]: [0], [p.b]: [1] } })
    expect((await play(p, p.a, 'play', { cards: [0] })).finished).toBe(false)
    expect(await play(p, p.b, response, {})).toMatchObject({ finished: true, winner_id: p.a })
  })

  it('rejects foreign, repeated, empty and oversized card selections and catches a last-card bluff', async () => {
    const p = await duo('cheat')
    await seed(p, { hands: { [p.a]: [1, 2, 3, 4, 5], [p.b]: [0] } })
    for (const cards of [[], [0], [1, 1], [1, 2, 3, 4, 5]]) await expect(play(p, p.a, 'play', { cards })).rejects.toThrow('one to four')
    await seed(p, { hands: { [p.a]: [1], [p.b]: [0] } })
    await play(p, p.a, 'play', { cards: [1] })
    const g = await play(p, p.b, 'challenge', {})
    expect(g).toMatchObject({ finished: false, hand_counts: { [p.a]: 1 }, reveal: { truthful: false } })
  })

  it('plays a full 52-card game with exact card conservation and a final accepted empty hand', async () => {
    const p = await duo('cheat')
    let g = await get(p)
    for (let step = 0; step < 110 && !g.finished; step++) {
      const actor = g.turn_user!
      const view = await get(p, actor)
      if (view.kind !== 'cheat') throw new Error('Expected Cheat')
      if (view.phase === 'challenge') g = await play(p, actor, 'accept', {})
      else {
        const matching = view.cards.filter(card => card % 13 + 1 === view.rank).slice(0, 4)
        g = await play(p, actor, 'play', { cards: matching.length ? matching : view.cards.slice(0, 1) })
      }
      const raw = (await db.query<{ board: { hands: Record<string, number[]>; pile: number[] } }>('select board from private.party_games where room_id=$1', [p.room])).rows[0].board
      expect([...raw.hands[p.a], ...raw.hands[p.b], ...raw.pile].sort((x, y) => x - y)).toEqual(Array.from({ length: 52 }, (_, i) => i))
    }
    expect(g.finished).toBe(true)
    if (g.kind !== 'cheat') throw new Error('Expected Cheat')
    expect(g.hand_counts[g.winner_id!]).toBe(0)
  })
})

describe('Hangman', () => {
  async function words(p: Duo) {
    await play(p, p.a, 'secret', { category: 'nature', word: 'MOON' }, 0)
    return play(p, p.b, 'secret', { category: 'animals', word: 'CAT' }, 0)
  }
  it('accepts simultaneous private words without false stale conflicts and alternates even correct guesses', async () => {
    const p = await duo('hangman')
    await expect(play(p, p.a, 'secret', { category: 'animals', word: 'A B' })).rejects.toThrow('3–12')
    await words(p)
    const a = await get(p), b = await get(p, p.b)
    expect(a).toMatchObject({ phase: 'guessing', own_word: 'MOON', patterns: { [p.a]: '___', [p.b]: '____' }, turn_user: p.a })
    expect(b).toHaveProperty('own_word', 'CAT')
    expect(a).not.toHaveProperty('secrets')
    expect(a).not.toHaveProperty('reveals')
    await expect(play(p, p.a, 'secret', { category: 'nature', word: 'RAIN' })).rejects.toThrow('already locked')
    expect(await play(p, p.a, 'guess', { letter: 'C' })).toMatchObject({ turn_user: p.b, patterns: { [p.a]: 'C__' } })
    await expect(play(p, p.a, 'guess', { letter: 'A' })).rejects.toThrow('opponent')
    await play(p, p.b, 'guess', { letter: 'M' })
    await expect(play(p, p.a, 'guess', { letter: 'C' })).rejects.toThrow('already guessed')
  })

  it('reveals words only after a verified solve and handles repeated letters', async () => {
    const p = await duo('hangman')
    await words(p)
    for (const letter of ['M', 'O', 'N']) {
      await play(p, p.a, 'guess', { letter: ['Z', 'X', 'V'][['M', 'O', 'N'].indexOf(letter)] })
      await play(p, p.b, 'guess', { letter })
    }
    expect(await get(p)).toMatchObject({ finished: true, winner_id: p.b, patterns: { [p.b]: 'MOON' }, reveals: { [p.a]: 'MOON', [p.b]: 'CAT' } })
  })

  it('ends at exactly six wrong letters, supports category words and rejects invalid categories', async () => {
    const p = await duo('hangman')
    await expect(play(p, p.a, 'secret', { category: 'unknown', word: 'CAT' })).rejects.toThrow('category')
    await words(p)
    for (const [index, letter] of ['B', 'D', 'E', 'F', 'G', 'H'].entries()) {
      await play(p, p.a, 'guess', { letter })
      if (index < 5) await play(p, p.b, 'guess', { letter: ['Z', 'X', 'V', 'U', 'W'][index] })
    }
    expect(await get(p)).toMatchObject({ finished: true, winner_id: p.b, misses: { [p.a]: 6 } })
    const q = await duo('hangman')
    await play(q, q.a, 'secret', { category: 'food', word: null })
    const g = await get(q)
    if (g.kind !== 'hangman') throw new Error('Expected Hangman')
    expect(g.own_word).toMatch(/^[A-Z]{3,12}$/)
    expect(g.ready).toEqual([q.a])
  })
})

describe('Party computer games', () => {
  it.each(['easy', 'medium', 'hard'])('finishes legal Bingo at %s and uses only the explicit game polling loop', async level => {
    const player = await user(db)
    let g = await createSolo(player, 'bingo', level)
    for (let step = 0; step < 25 && g.status === 'playing'; step++) {
      if (g.kind !== 'bingo') throw new Error('Expected Bingo')
      if (g.board.turn_user === player) {
        const called = g.board.called
        g = await soloPlay(player, g, 'call', { number: g.board.numbers.find(n => !called.includes(n)) })
      }
      else {
        await due(g.id)
        const discovered = await getSolo(player, null)
        expect(discovered.board.moves).toBe(g.board.moves)
        g = await getSolo(player, g.id)
      }
    }
    expect(g.status).toBe('finished')
    if (g.kind !== 'bingo') throw new Error('Expected Bingo')
    expect(Math.max(...Object.values(g.board.lines))).toBeGreaterThanOrEqual(5)
  })

  it.each(['bingo', 'cheat', 'hangman'] as const)('isolates %s owners, rejects stale sessions and preserves saved state', async kind => {
    const player = await user(db), outsider = await user(db)
    const g = await createSolo(player, kind)
    await expect(getSolo(outsider, g.id)).rejects.toThrow('No solo board')
    await expect(soloPlay(outsider, g, 'call', { number: 1 })).rejects.toThrow('No game')
    expect((await getSolo(player, g.id)).board).toEqual(g.board)
    const next = await createSolo(player, kind)
    await expect(soloPlay(player, g, 'call', { number: 1 })).rejects.toThrow('replaced')
    expect(next.id).not.toBe(g.id)
    const p = await duo(kind)
    const current = await get(p)
    await expect(call(db, p.a, 'play_party', [p.room, crypto.randomUUID(), current.moves, 'call', '{}'])).rejects.toThrow('different game')
    await expect(call(db, outsider, 'get_game_state', [p.room])).rejects.toThrow('member')
    await expect(call(db, p.a, 'open_duo_lobby', [p.room])).rejects.toThrow('Finish')
  })

  it.each(['easy', 'medium', 'hard'])('resolves the %s computer challenge legally without exposing hidden cards or fast-forwarding turns', async level => {
    const player = await user(db)
    let g = await createSolo(player, 'cheat', level)
    await db.query("update private.solo_boards set board=jsonb_set(board,'{hands}',$2::jsonb) where id=$1", [g.id, JSON.stringify({ [player]: [0], [g.computer_id]: [1] })])
    g = await soloPlay(player, g, 'play', { cards: [0] })
    expect(g.status).toBe('playing')
    expect((await getSolo(player, g.id)).board.moves).toBe(g.board.moves)
    await due(g.id)
    g = await getSolo(player, g.id)
    expect(g.status).toBe('finished')
    expect(g.board).toMatchObject({ winner_id: player })
    expect(g.board).not.toHaveProperty('hands')
  })

  it.each(['easy', 'medium', 'hard'])('completes a human Hangman win against %s with alternating legal computer guesses', async level => {
    const player = await user(db)
    let g = await createSolo(player, 'hangman', level)
    g = await soloPlay(player, g, 'secret', { category: 'nature', word: 'MOON' })
    await db.query("update private.solo_boards set board=jsonb_set(board,array['secrets',$2],'\"CAT\"'::jsonb) where id=$1", [g.id, g.computer_id])
    for (const letter of ['C', 'A', 'T']) {
      g = await soloPlay(player, g, 'guess', { letter })
      if (g.status !== 'finished') {
        expect(g.board.turn_user).toBe(g.computer_id)
        await due(g.id)
        g = await getSolo(player, g.id)
        expect(g.board.turn_user).toBe(player)
      }
    }
    expect(g.status).toBe('finished')
    expect(g.board).toMatchObject({ winner_id: player, reveals: { [g.computer_id]: 'CAT', [player]: 'MOON' } })
  })

  it('chooses hard Hangman guesses from public patterns, not from the hidden target word', async () => {
    const player = await user(db)
    let g = await createSolo(player, 'hangman', 'hard')
    g = await soloPlay(player, g, 'secret', { category: 'nature', word: 'MOON' })
    g = await soloPlay(player, g, 'guess', { letter: 'Z' })
    const raw = (await db.query<{ board: { secrets: Record<string, string> } }>('select board from private.solo_boards where id=$1', [g.id])).rows[0].board
    const first = (await db.query<{ action: unknown }>("select private.party_bot($1::jsonb,'hard') as action", [JSON.stringify(raw)])).rows[0].action
    const altered = { ...raw, secrets: { ...raw.secrets, [player]: 'RAIN' } }
    const second = (await db.query<{ action: unknown }>("select private.party_bot($1::jsonb,'hard') as action", [JSON.stringify(altered)])).rows[0].action
    expect(first).toEqual(second)
    await due(g.id)
    const next = await getSolo(player, g.id)
    expect(next.board.moves).toBe(g.board.moves + 1)
    expect(next.board.turn_user).toBe(player)
  })
})
