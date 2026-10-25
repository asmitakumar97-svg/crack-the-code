import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { RingState, SoloBoardState } from '../src/lib/game'
import { asUser, call, createDatabase, state, user } from './database'

interface RingBoard extends RingState {
  solution?: number[]
}
type SoloRing = Extract<SoloBoardState, { kind: 'ring' }>
let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db?.close() })
function move(rods: number[][], code: number) {
  const copy = rods.map(rod => [...rod]), a = Math.floor(code / 5), b = code % 5
  expect(a).not.toBe(b)
  expect(copy[a].length).toBeGreaterThan(0)
  expect(copy[b].length).toBeLessThan(rods.flat().length / 4)
  const colour = copy[a].at(-1)!
  expect(copy[b].length === 0 || copy[b].at(-1) === colour).toBe(true)
  copy[b].push(copy[a].pop()!)
  return copy
}
const sorted = (rods: number[][]) => rods.filter(rod => rod.length === rods.flat().length / 4 && rod.every(colour => colour === rod[0])).length === 4
async function duo() {
  const a = await user(db), b = await user(db)
  const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
  const initial = await state(db, a, room)
  await call(db, b, 'join_room', [initial.room.code, 'Bob'])
  await call(db, a, 'choose_duo_game', [room, initial.hub!.revision, 'ring', 12, 'animals', 'number', 'turns', 10])
  const revision = (await state(db, a, room)).hub!.revision
  await call(db, a, 'confirm_duo_game', [room, revision])
  expect((await state(db, b, room)).room.duo_lobby).toBe(true)
  await call(db, b, 'confirm_duo_game', [room, revision])
  const board = (await db.query<{ board: RingBoard }>('select board from private.ring_games where room_id=$1', [room])).rows[0].board
  return { a, b, room, board }
}
const sharedMove = (p: Awaited<ReturnType<typeof duo>>, player: string, count: number, code: number) =>
  call(db, player, 'move_ring', [p.room, p.board.session_id, count, Math.floor(code / 5), code % 5])
const startShared = (room: string) => db.query("update private.ring_games set board=jsonb_set(board,'{started_at}',to_jsonb(clock_timestamp()-interval '1 second')) where room_id=$1", [room])
const solo = (player: string, difficulty = 'medium') => call<SoloRing>(db, player, 'create_solo_board', ['ring', difficulty, 12, 'animals', 10])
const getSolo = (player: string, id: string) => call<SoloRing>(db, player, 'get_solo_board', [id])
const moveSolo = (g: SoloRing, player: string, code: number, count = g.board.moves[player]) =>
  call<SoloRing>(db, player, 'move_solo_ring', [g.id, count, Math.floor(code / 5), code % 5])

describe('Ring Rush', () => {
  it('generates varied puzzles with exactly 40 beads, 4 colours × 10, 5 rods, one empty rod and a completely legal solution', async () => {
    const puzzles = new Set<string>()
    for (let sample = 0; sample < 100; sample++) {
      const puzzle = (await db.query<{ puzzle: { initial: number[][]; solution: number[] } }>('select private.new_ring_puzzle() as puzzle')).rows[0].puzzle
      expect(puzzle.initial).toHaveLength(5)
      expect(puzzle.initial.map(rod => rod.length).sort((a, b) => a - b)).toEqual([0, 10, 10, 10, 10])
      expect(puzzle.initial.flat()).toHaveLength(40)
      for (let colour = 0; colour < 4; colour++) expect(puzzle.initial.flat().filter(ring => ring === colour)).toHaveLength(10)
      expect(puzzle.initial.filter(rod => new Set(rod).size > 1)).toHaveLength(4)
      expect(puzzle.solution.length).toBeGreaterThanOrEqual(72)
      expect(puzzle.solution.length).toBeLessThanOrEqual(78)
      let rods = puzzle.initial
      for (const code of puzzle.solution) rods = move(rods, code)
      expect(sorted(rods)).toBe(true)
      puzzles.add(JSON.stringify(puzzle.initial))
    }
    expect(puzzles.size).toBeGreaterThan(80)
  })

  it('requires two confirmations, starts both identical boards together and hides the private solution', async () => {
    const p = await duo()
    const game = await state(db, p.a, p.room)
    const ring = game.ring!
    expect(game.room).toMatchObject({ game_kind: 'ring', duo_lobby: false })
    expect(ring.boards[p.a]).toEqual(ring.boards[p.b])
    expect(ring.moves).toEqual({ [p.a]: 0, [p.b]: 0 })
    expect(ring).not.toHaveProperty('solution')
    expect(Date.parse(ring.started_at)).toBeGreaterThan(Date.now())
    await expect(sharedMove(p, p.a, 0, p.board.solution![0])).rejects.toThrow('countdown')
    await expect(call(db, p.a, 'open_duo_lobby', [p.room])).rejects.toThrow('Finish Ring')
    await expect(asUser(db, p.a, 'select * from private.ring_games')).rejects.toThrow('permission denied')
    await expect(call(db, p.a, 'get_before_rings', [p.room])).rejects.toThrow('permission denied')
  })

  it('rejects empty/full/different-colour rods, bounds, stale sessions, duplicate moves and outsiders', async () => {
    const p = await duo()
    await startShared(p.room)
    const rods = p.board.boards[p.a], empty = rods.findIndex(rod => !rod.length), full = rods.findIndex(rod => rod.length)
    const otherFull = rods.findIndex((rod, index) => index !== full && rod.length === 10)
    await expect(sharedMove(p, p.a, 0, empty * 5 + full)).rejects.toThrow('no beads')
    await expect(sharedMove(p, p.a, 0, full * 5 + otherFull)).rejects.toThrow('full')
    await expect(call(db, p.a, 'move_ring', [p.room, p.board.session_id, 0, -1, 0])).rejects.toThrow('different rods')
    await expect(call(db, p.a, 'move_ring', [p.room, crypto.randomUUID(), 0, full, empty])).rejects.toThrow('different ring race')
    await sharedMove(p, p.a, 0, full * 5 + empty)
    const wrong = rods.findIndex((rod, i) => i !== full && rod.length && rod.at(-1) !== rods[full].at(-1))
    await expect(sharedMove(p, p.a, 1, wrong * 5 + empty)).rejects.toThrow('same colour')
    await expect(sharedMove(p, p.a, 0, full * 5 + empty)).rejects.toThrow('rings changed')
    const outsider = await user(db)
    await expect(sharedMove(p, outsider, 0, full * 5 + empty)).rejects.toThrow('not a member')
  })

  it('preserves the five-bead capacity and completion rules of saved 20-ring races', async () => {
    const player = await user(db)
    const rods = [Array(4).fill(0), Array(5).fill(1), Array(5).fill(2), Array(5).fill(3), [0]]
    const board = { boards: { [player]: rods }, moves: { [player]: 0 }, started_at: new Date(Date.now() - 1000).toISOString(), finished: false }
    const next = (await db.query<{ board: RingBoard }>('select private.apply_ring_move($1::jsonb,$2,0,4,0) as board', [JSON.stringify(board), player])).rows[0].board
    expect(next.finished).toBe(true)
    expect(next.winner_id).toBe(player)
    expect(sorted(next.boards[player])).toBe(true)
  })

  it('lets both players move independently, rejects duplicate actions and declares the first verified finish the winner', async () => {
    const p = await duo()
    await startShared(p.room)
    const plan = p.board.solution!
    await Promise.all([sharedMove(p, p.a, 0, plan[0]), sharedMove(p, p.b, 0, plan[0])])
    const duplicates = await Promise.allSettled([0, 1].map(() => sharedMove(p, p.a, 1, plan[1])))
    expect(duplicates.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    for (let i = 2; i < plan.length; i++) await sharedMove(p, p.a, i, plan[i])
    const finished = (await db.query<{ board: RingBoard }>('select board from private.ring_games where room_id=$1', [p.room])).rows[0].board
    expect(finished).toMatchObject({ finished: true, winner_id: p.a })
    expect(sorted(finished.boards[p.a])).toBe(true)
    expect(sorted(finished.boards[p.b])).toBe(false)
    expect(Date.parse(finished.finished_at!)).toBeGreaterThan(Date.parse(finished.started_at))
    await expect(sharedMove(p, p.b, 1, plan[1])).rejects.toThrow('complete')
    await expect(call(db, p.b, 'open_duo_lobby', [p.room])).rejects.toThrow('Only the host')
    await call(db, p.a, 'open_duo_lobby', [p.room])
    expect((await state(db, p.b, p.room)).hub!.ready).toEqual([])
    expect((await db.query('select id from private.turn_push_events')).rows).toEqual([])
  })

  it('restarts only your own rings without changing the clock, opponent or legal action sequence', async () => {
    const p = await duo()
    await startShared(p.room)
    await sharedMove(p, p.a, 0, p.board.solution![0])
    await sharedMove(p, p.b, 0, p.board.solution![0])
    const before = (await state(db, p.a, p.room)).ring!
    await call(db, p.a, 'move_ring', [p.room, p.board.session_id, 1, null, null, true])
    const after = (await state(db, p.a, p.room)).ring!
    expect(after.boards[p.a]).toEqual(p.board.boards[p.a])
    expect(after.boards[p.b]).toEqual(before.boards[p.b])
    expect(after.started_at).toBe(before.started_at)
    expect(after.moves[p.a]).toBe(2)
    expect(after.resets[p.a]).toBe(1)
    await expect(sharedMove(p, p.a, 1, p.board.solution![0])).rejects.toThrow('rings changed')
    await sharedMove(p, p.a, 2, p.board.solution![0])
  })

  it('serializes two competing final moves into exactly one winner', async () => {
    const p = await duo()
    await startShared(p.room)
    let nearFinish = p.board.boards[p.a]
    const plan = p.board.solution!
    for (const code of plan.slice(0, -1)) nearFinish = move(nearFinish, code)
    await db.query("update private.ring_games set board=board||jsonb_build_object('boards',$2::jsonb,'moves',$3::jsonb) where room_id=$1", [
      p.room, JSON.stringify({ [p.a]: nearFinish, [p.b]: nearFinish }), JSON.stringify({ [p.a]: plan.length - 1, [p.b]: plan.length - 1 }),
    ])
    const results = await Promise.allSettled([p.a, p.b].map(player => sharedMove(p, player, plan.length - 1, plan.at(-1)!)))
    expect(results.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    const ring = (await state(db, p.a, p.room)).ring!
    expect([p.a, p.b]).toContain(ring.winner_id)
    expect(Object.values(ring.progress).sort()).toEqual([3, 4])
  })

  it('catches up the computer before restarting only the human board, without changing the race clock', async () => {
    const player = await user(db)
    let g = await solo(player, 'easy')
    const initial = g.board.boards[player]
    const plan = (await db.query<{ solution: number[] }>("select board->'solution' as solution from private.solo_boards where id=$1", [g.id])).rows[0].solution
    await db.query("update private.solo_boards set board=jsonb_set(board,'{started_at}',to_jsonb(clock_timestamp()-interval '100 milliseconds')) where id=$1", [g.id])
    g = await moveSolo(g, player, plan[0])
    await db.query("update private.solo_boards set board=jsonb_set(board,'{started_at}',to_jsonb(clock_timestamp()-interval '3 seconds')) where id=$1", [g.id])
    const started = (await db.query<{ started: string }>("select board->>'started_at' as started from private.solo_boards where id=$1", [g.id])).rows[0].started
    g = await call<SoloRing>(db, player, 'move_solo_ring', [g.id, 1, null, null, true])
    expect(g.board.boards[player]).toEqual(initial)
    expect(g.board.boards[g.computer_id]).toEqual(move(initial, plan[0]))
    expect(g.board.moves[g.computer_id]).toBe(1)
    expect(g.board.moves[player]).toBe(2)
    expect(g.board.resets[player]).toBe(1)
    expect(g.board.started_at).toBe(started)
    expect(g.board).not.toHaveProperty('initial')
    await expect(moveSolo(g, player, plan[0], 1)).rejects.toThrow('rings changed')
  })

  it.each([['easy', 2400], ['medium', 1500], ['hard', 900]] as const)('uses legal %s computer moves at %i ms and catches up fairly after leaving', async (difficulty, pace) => {
    const player = await user(db)
    let g = await solo(player, difficulty)
    expect(g.board.boards[player]).toEqual(g.board.boards[g.computer_id])
    expect(g.board).not.toHaveProperty('solution')
    expect(g.board).not.toHaveProperty('bot_step')
    await expect(moveSolo(g, player, 1)).rejects.toThrow('countdown')
    const raw = (await db.query<{ board: RingBoard }>('select board from private.solo_boards where id=$1', [g.id])).rows[0].board
    await db.query("update private.solo_boards set board=jsonb_set(board,'{started_at}',to_jsonb(clock_timestamp()-interval '1200 milliseconds')) where id=$1", [g.id])
    g = await getSolo(player, g.id)
    expect(g.board.moves[g.computer_id]).toBe(difficulty === 'hard' ? 1 : 0)
    await db.query("update private.solo_boards set board=jsonb_set(board,'{started_at}',to_jsonb(clock_timestamp()-interval '200 seconds')) where id=$1", [g.id])
    g = await getSolo(player, g.id)
    expect(g.status).toBe('finished')
    expect(g.board.winner_id).toBe(g.computer_id)
    expect(g.board.moves[g.computer_id]).toBe(raw.solution!.length)
    expect(sorted(g.board.boards[g.computer_id])).toBe(true)
    expect(Date.parse(g.board.finished_at!) - Date.parse(g.board.started_at)).toBe(raw.solution!.length * pace)
    expect(g.board.moves[player]).toBe(0)
  })

  it('does not let a late human move beat a computer that has already finished', async () => {
    const player = await user(db)
    const g = await solo(player, 'hard')
    const plan = (await db.query<{ solution: number[] }>("select board->'solution' as solution from private.solo_boards where id=$1", [g.id])).rows[0].solution
    await db.query("update private.solo_boards set board=jsonb_set(board,'{started_at}',to_jsonb(clock_timestamp()-interval '200 seconds')) where id=$1", [g.id])
    const result = await moveSolo(g, player, plan[0])
    expect(result.move_accepted).toBe(false)
    expect(result.status).toBe('finished')
    expect(result.board.winner_id).toBe(g.computer_id)
    expect(result.board.moves[player]).toBe(0)
  })

  it('allows a human to win legally and preserves ownership, counts and the saved race', async () => {
    const player = await user(db)
    let g = await solo(player, 'easy')
    const plan = (await db.query<{ solution: number[] }>("select board->'solution' as solution from private.solo_boards where id=$1", [g.id])).rows[0].solution
    await db.query("update private.solo_boards set board=jsonb_set(board,'{started_at}',to_jsonb(clock_timestamp()-interval '100 milliseconds')) where id=$1", [g.id])
    const outsider = await user(db)
    await expect(getSolo(outsider, g.id)).rejects.toThrow('No solo board')
    await expect(moveSolo(g, outsider, plan[0], 0)).rejects.toThrow('No Ring Rush')
    for (const code of plan) g = await moveSolo(g, player, code)
    expect(g.status).toBe('finished')
    expect(g.board.winner_id).toBe(player)
    expect(g.board.moves[player]).toBe(plan.length)
    expect(sorted(g.board.boards[player])).toBe(true)
    expect((await getSolo(player, g.id)).board).toEqual(g.board)
  })
})
