import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, call, createDatabase, state, user } from './database'
import { getTurnAlert } from '../src/lib/turnAlerts'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db?.close() })

async function pair(size = 10) {
  const a = await user(db), b = await user(db)
  const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
  const initial = await state(db, a, room)
  await call(db, b, 'join_room', [initial.room.code, 'Bob'])
  await call(db, a, 'choose_duo_game', [room, initial.hub!.revision, 'dots', 12, 'animals', 'number', 'turns', size])
  const current = await state(db, a, room)
  await call(db, a, 'confirm_duo_game', [room, current.hub!.revision])
  expect((await state(db, b, room)).dots).toBeUndefined()
  await call(db, b, 'confirm_duo_game', [room, current.hub!.revision])
  return { a, b, room }
}
async function dots(room: string, player: string) { return (await state(db, player, room)).dots! }
async function roll(room: string, player: string) {
  const d = await dots(room, player)
  await call(db, player, 'roll_dots_dice', [room, d.session_id, d.moves])
  return dots(room, player)
}
async function draw(room: string, player: string, edge: number) {
  const d = await dots(room, player)
  await call(db, player, 'draw_dots_line', [room, d.session_id, d.moves, edge])
  return dots(room, player)
}
const settle = (room: string) => db.query("update private.dots_games set roll_until=clock_timestamp()-interval '1 second' where room_id=$1", [room])

describe('shared D8 Dots & Boxes', () => {
  it.each([10, 12, 15])('starts a %i-dot board only after both players confirm', async size => {
    const p = await pair(size)
    const game = await state(db, p.b, p.room)
    expect(game.room).toMatchObject({ game_kind: 'dots', duo_lobby: false })
    expect(game.dots).toMatchObject({ dots: size, turn_user: p.a, remaining: 0, roll: null, finished: false })
    expect(game.dots!.edges).toEqual(Array(2 * size * (size - 1)).fill(null))
    expect(game.dots!.boxes).toEqual(Array((size - 1) ** 2).fill(null))
    expect(game.own_secret).toBeNull()
    expect(game.guesses).toEqual([])
    expect(game.pending_guess).toBeNull()
    expect(game.results).toEqual([])
    await expect(call(db, p.a, 'open_duo_lobby', [p.room])).rejects.toThrow('Finish Dots')
    await expect(call(db, p.b, 'open_duo_lobby', [p.room])).rejects.toThrow('Only the host')
    await expect(call(db, p.a, 'set_secret', [p.room, '123456'])).rejects.toThrow('not active')
  })

  it('rejects invalid board sizes and clears confirmations when the size changes', async () => {
    const a = await user(db), b = await user(db)
    const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
    let current = await state(db, a, room)
    await call(db, b, 'join_room', [current.room.code, 'Bob'])
    const choose = (player: string, size: number | null) => call(db, player, 'choose_duo_game', [room, current.hub!.revision, 'dots', 12, 'animals', 'number', 'turns', size])
    await expect(choose(a, 11)).rejects.toThrow('valid game')
    await expect(choose(a, null)).rejects.toThrow('valid game')
    await expect(choose(b, 15)).rejects.toThrow('Only the host')
    await call(db, a, 'confirm_duo_game', [room, current.hub!.revision])
    const previous = current.hub!.revision
    await choose(a, 15)
    current = await state(db, b, room)
    expect(current.hub!.ready).toEqual([])
    expect(current.hub!.dots).toBe(15)
    await expect(call(db, b, 'confirm_duo_game', [room, previous])).rejects.toThrow('settings changed')
  })

  it('uses one server roll of 1–8, shares its timestamps/result and disallows early, repeated and out-of-turn actions', async () => {
    const p = await pair()
    await expect(draw(p.room, p.a, 0)).rejects.toThrow('Roll the eight-sided')
    await expect(roll(p.room, p.b)).rejects.toThrow('friend')
    const before = await dots(p.room, p.a)
    const rolled = await roll(p.room, p.a)
    expect(rolled.roll).toBeGreaterThanOrEqual(1)
    expect(rolled.roll).toBeLessThanOrEqual(8)
    expect(rolled.remaining).toBe(rolled.roll)
    expect(rolled.roll_user).toBe(p.a)
    expect(rolled.roll_number).toBe(1)
    expect(await dots(p.room, p.b)).toEqual(rolled)
    expect(Date.parse(rolled.roll_until!)).toBeGreaterThan(Date.now())
    await expect(roll(p.room, p.a)).rejects.toThrow('remaining lines')
    await expect(draw(p.room, p.a, 0)).rejects.toThrow('finish rolling')
    await expect(call(db, p.a, 'roll_dots_dice', [p.room, before.session_id, before.moves])).rejects.toThrow('board changed')
    await settle(p.room)
    await expect(draw(p.room, p.a, -1)).rejects.toThrow('neighbouring')
    await expect(draw(p.room, p.a, 180)).rejects.toThrow('neighbouring')
    const drawn = await draw(p.room, p.a, 0)
    expect(drawn.edges[0]).toBe(p.a)
    expect(drawn.remaining).toBe(rolled.remaining - 1)
    if (drawn.remaining) await expect(draw(p.room, p.a, 0)).rejects.toThrow('already drawn')
    else expect(drawn.turn_user).toBe(p.b)
    await expect(draw(p.room, p.b, 1)).rejects.toThrow(drawn.remaining ? 'friend' : 'Roll')
  })

  it('claims a box with its fourth side and two boxes with one shared edge, without a bonus turn or roll', async () => {
    for (const two of [false, true]) {
      const p = await pair()
      const edges: (string | null)[] = Array(180).fill(null)
      for (const edge of two ? [0, 1, 9, 10, 90, 92] : [0, 9, 90]) edges[edge] = p.b
      await db.query('update private.dots_games set edges=$2,remaining=1,roll=1 where room_id=$1', [p.room, edges])
      const d = await draw(p.room, p.a, 91)
      expect(d.scores).toEqual({ [p.a]: two ? 2 : 1, [p.b]: 0 })
      expect(d.boxes[0]).toBe(p.a)
      expect(d.boxes[1]).toBe(two ? p.a : null)
      expect(d.turn_user).toBe(p.b)
      expect(d.remaining).toBe(0)
      expect(d.turn_number).toBe(2)
      expect(d.roll_number).toBe(0)
      await expect(draw(p.room, p.a, 2)).rejects.toThrow('friend')
    }
  })

  it('keeps remaining lines after scoring and alerts only when the turn changes', async () => {
    const p = await pair()
    const edges: (string | null)[] = Array(180).fill(null)
    for (const edge of [0, 9, 90]) edges[edge] = p.b
    await db.query('update private.dots_games set edges=$2,remaining=2,roll=2 where room_id=$1', [p.room, edges])
    const alert = getTurnAlert(await state(db, p.a, p.room), p.a, true)
    await draw(p.room, p.a, 91)
    expect(getTurnAlert(await state(db, p.a, p.room), p.a, true)).toEqual(alert)
    expect((await dots(p.room, p.a)).remaining).toBe(1)
    await draw(p.room, p.a, 1)
    expect(getTurnAlert(await state(db, p.a, p.room), p.a, true)).toBeNull()
    expect(getTurnAlert(await state(db, p.b, p.room), p.b, true)?.key).toContain('.dots.')
  })

  it('serializes concurrent/replayed rolls and lines and restricts access to members', async () => {
    const p = await pair()
    let d = await dots(p.room, p.a)
    const rolls = await Promise.allSettled([0, 1].map(() => call(db, p.a, 'roll_dots_dice', [p.room, d.session_id, d.moves])))
    expect(rolls.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    await settle(p.room)
    d = await dots(p.room, p.a)
    const lines = await Promise.allSettled([0, 1].map(() => call(db, p.a, 'draw_dots_line', [p.room, d.session_id, d.moves, 0])))
    expect(lines.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((await dots(p.room, p.b)).edges.filter(Boolean)).toHaveLength(1)
    const outsider = await user(db)
    await expect(state(db, outsider, p.room)).rejects.toThrow('not a member')
    await expect(call(db, outsider, 'roll_dots_dice', [p.room, d.session_id, d.moves])).rejects.toThrow('not a member')
    await expect(asUser(db, p.a, 'select * from private.dots_games')).rejects.toThrow('permission denied')
    for (const fn of ['get_code_or_memory_state', 'confirm_code_or_memory', 'open_code_or_memory_lobby']) {
      await expect(call(db, p.a, fn, fn.startsWith('confirm') ? [p.room, 1] : [p.room])).rejects.toThrow('permission denied')
    }
  })

  it('finishes a complete board through legal turns with correct scores and can start another game in the same room', async () => {
    const p = await pair()
    let d = await dots(p.room, p.a)
    while (!d.finished) {
      const player = d.turn_user
      d = await roll(p.room, player)
      await settle(p.room)
      while (d.remaining > 0 && !d.finished) d = await draw(p.room, player, d.edges.indexOf(null))
    }
    expect(d.edges.every(Boolean)).toBe(true)
    expect(d.boxes.every(Boolean)).toBe(true)
    expect(Object.values(d.scores).reduce((a, b) => a + b)).toBe(81)
    for (const player of [p.a, p.b]) expect(d.scores[player]).toBe(d.boxes.filter(owner => owner === player).length)
    expect(getTurnAlert(await state(db, p.a, p.room), d.turn_user, true)).toBeNull()
    await expect(roll(p.room, d.turn_user)).rejects.toThrow('complete')
    const oldSession = d.session_id
    await call(db, p.a, 'open_duo_lobby', [p.room])
    const current = await state(db, p.a, p.room)
    await call(db, p.a, 'confirm_duo_game', [p.room, current.hub!.revision])
    await call(db, p.b, 'confirm_duo_game', [p.room, current.hub!.revision])
    d = await dots(p.room, p.a)
    expect(d.session_id).not.toBe(oldSession)
    expect(d.edges.every(edge => edge === null)).toBe(true)
    await expect(call(db, p.a, 'roll_dots_dice', [p.room, oldSession, 0])).rejects.toThrow('board changed')
  })

  it('caps the last roll to available edges, permits a tie and preserves completed box owners', async () => {
    const p = await pair(15)
    const edges = Array<string | null>(420).fill(p.a)
    edges[419] = null
    const boxes = Array.from({ length: 196 }, (_, i) => i < 98 ? p.a : i < 195 ? p.b : null)
    await db.query('update private.dots_games set edges=$2,boxes=$3,turn_user=$4,scores=$5 where room_id=$1', [p.room, edges, boxes, p.b, JSON.stringify({ [p.a]: 98, [p.b]: 97 })])
    const d = await roll(p.room, p.b)
    expect(d.remaining).toBe(1)
    await settle(p.room)
    const finished = await draw(p.room, p.b, 419)
    expect(finished.finished).toBe(true)
    expect(finished.scores).toEqual({ [p.a]: 98, [p.b]: 98 })
    expect(finished.boxes.slice(0, 195)).toEqual(boxes.slice(0, 195))
  })

  it('queues one phone alert per incoming turn, not for a roll or individual lines', async () => {
    await db.exec(`
      create schema net;
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint
        language sql as $$select 1::bigint$$;
      insert into private.push_settings(public_key,dispatch_url,dispatch_token)
        values('public','https://wxmrxcnfivgkmhdhedwf.supabase.co/functions/v1/turn-push',repeat('x',40));
    `)
    const a = await user(db), b = await user(db)
    for (const player of [a, b]) await call(db, player, 'save_push_subscription', [`https://web.push.apple.com/${player}`, 'B'.repeat(87), 'a'.repeat(22)])
    const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
    const initial = await state(db, a, room)
    await call(db, b, 'join_room', [initial.room.code, 'Bob'])
    await call(db, a, 'choose_duo_game', [room, initial.hub!.revision, 'dots', 12, 'animals', 'number', 'turns', 10])
    const revision = (await state(db, a, room)).hub!.revision
    await call(db, a, 'confirm_duo_game', [room, revision])
    await call(db, b, 'confirm_duo_game', [room, revision])
    const jobs = async () => (await db.query<{ user_id: string; action_key: string }>('select user_id,action_key from private.turn_push_events where room_id=$1 order by created_at', [room])).rows
    expect(await jobs()).toHaveLength(1)
    let d = await roll(room, a)
    expect(await jobs()).toHaveLength(1)
    await settle(room)
    while (d.remaining) {
      d = await draw(room, a, d.edges.indexOf(null))
      expect(await jobs()).toHaveLength(d.remaining ? 1 : 2)
    }
    expect((await jobs())[1]).toMatchObject({ user_id: b })
    expect((await jobs())[1].action_key).toContain('.dots.')
    await call(db, b, 'heartbeat', [room])
    expect(await jobs()).toHaveLength(2)
  })
})
