import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, call, createDatabase, state, user } from './database'
import { getTurnAlert } from '../src/lib/turnAlerts'
import images from '../src/lib/memory-images.json'
import { access } from 'node:fs/promises'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db?.close() })

async function duo() {
  const a = await user(db), b = await user(db)
  const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
  const code = (await state(db, a, room)).room.code
  await call(db, b, 'join_room', [code, 'Bob'])
  return { a, b, room, code }
}
async function choose(pair: Awaited<ReturnType<typeof duo>>, game = 'memory', tiles = 12, theme = 'animals') {
  const current = await state(db, pair.a, pair.room)
  await call(db, pair.a, 'choose_duo_game', [pair.room, current.hub!.revision, game, tiles, theme, 'number', 'turns'])
  return state(db, pair.a, pair.room)
}
async function confirm(pair: Awaited<ReturnType<typeof duo>>) {
  const current = await state(db, pair.a, pair.room)
  await call(db, pair.a, 'confirm_duo_game', [pair.room, current.hub!.revision])
  await call(db, pair.b, 'confirm_duo_game', [pair.room, current.hub!.revision])
  return state(db, pair.a, pair.room)
}
async function flip(room: string, player: string, index: number) {
  const current = await state(db, player, room)
  const m = current.memory!
  await call(db, player, 'flip_memory_card', [room, m.session_id, m.moves, index])
  return state(db, player, room)
}
const deck = async (room: string) => (await db.query<{ deck: number[] }>('select deck from private.memory_games where room_id=$1', [room])).rows[0].deck
async function solve(room: string, player: string) {
  const values = await deck(room)
  for (const value of new Set(values)) {
    const positions = values.flatMap((card, i) => card === value ? [i] : [])
    await flip(room, player, positions[0])
    await flip(room, player, positions[1])
  }
}

describe('shared Duo rooms and private memory state', () => {
  it('requires two member confirmations, invalidates consent on settings changes, and restricts settings to the host', async () => {
    const pair = await duo()
    const current = await choose(pair)
    expect(current.room.duo_lobby).toBe(true)
    expect(current.memory).toBeUndefined()
    await expect(call(db, pair.b, 'choose_duo_game', [pair.room, current.hub!.revision, 'memory', 16, 'florals', 'word', 'turns'])).rejects.toThrow('Only the host')
    await call(db, pair.a, 'confirm_duo_game', [pair.room, current.hub!.revision])
    expect((await state(db, pair.b, pair.room)).hub!.ready).toEqual([pair.a])
    const next = await choose(pair, 'memory', 24, 'patterns')
    expect(next.hub!.ready).toEqual([])
    await expect(call(db, pair.b, 'confirm_duo_game', [pair.room, current.hub!.revision])).rejects.toThrow('settings changed')
    await expect(call(db, pair.a, 'choose_duo_game', [pair.room, next.hub!.revision, 'memory', 15, 'patterns', 'number', 'turns'])).rejects.toThrow('valid game')
    const playing = await confirm(pair)
    expect(playing.memory!.cards).toHaveLength(24)
    expect(playing.memory!.cards.every(card => card === null)).toBe(true)
    expect(playing.room.duo_lobby).toBe(false)
    await expect(call(db, pair.a, 'confirm_duo_game', [pair.room, next.hub!.revision])).rejects.toThrow('already started')
  })

  it.each([12, 16, 24])('creates exactly %i hidden cards containing two copies of every pair', async tiles => {
    const pair = await duo()
    await choose(pair, 'memory', tiles)
    const current = await confirm(pair)
    const values = await deck(pair.room)
    expect(new Set(values).size).toBe(tiles / 2)
    for (const value of new Set(values)) expect(values.filter(card => card === value)).toHaveLength(2)
    expect(current.memory!.cards).toEqual(Array(tiles).fill(null))
    expect(current.memory).not.toHaveProperty('deck')
    expect(current.memory).not.toHaveProperty('answer')
    const outsider = await user(db)
    await expect(state(db, outsider, pair.room)).rejects.toThrow('not a member')
    for (const table of ['memory_games', 'duo_choices']) {
      await expect(asUser(db, pair.a, `select * from private.${table}`)).rejects.toThrow('permission denied')
    }
    await expect(call(db, pair.a, 'get_code_game_state', [pair.room])).rejects.toThrow('permission denied')
    await expect(call(db, pair.a, 'set_secret', [pair.room, '001122'])).rejects.toThrow('not active')
  })

  it('keeps revealed cards visible for 1.5 seconds, rejects early/duplicate/replayed flips, and passes mismatches to the opponent', async () => {
    const pair = await duo()
    await choose(pair)
    const current = await confirm(pair)
    const values = await deck(pair.room)
    const other = values.findIndex(value => value !== values[0])
    const initial = current.memory!
    await expect(flip(pair.room, pair.b, 0)).rejects.toThrow('friend')
    await expect(flip(pair.room, pair.a, -1)).rejects.toThrow('board')
    const first = await flip(pair.room, pair.a, 0)
    expect(first.memory!.cards.filter(card => card !== null)).toHaveLength(1)
    expect((await state(db, pair.b, pair.room)).memory!.cards[0]).toBe(values[0])
    await expect(flip(pair.room, pair.a, 0)).rejects.toThrow('different card')
    await expect(call(db, pair.a, 'flip_memory_card', [pair.room, initial.session_id, initial.moves, other])).rejects.toThrow('board changed')
    const second = await flip(pair.room, pair.a, other)
    expect(second.memory!.turn_user).toBe(pair.b)
    expect(second.memory!.cards.filter(card => card !== null)).toHaveLength(2)
    expect(second.memory!.reveal_until).not.toBeNull()
    await expect(flip(pair.room, pair.b, 1)).rejects.toThrow('turn back over')
    await db.query("update private.memory_games set reveal_until=clock_timestamp()-interval '1 second' where room_id=$1", [pair.room])
    expect((await state(db, pair.b, pair.room)).memory!.cards.every(card => card === null)).toBe(true)
    const next = await flip(pair.room, pair.b, 0)
    expect(next.memory!.cards.filter(card => card !== null)).toHaveLength(1)
    await expect(call(db, pair.a, 'open_duo_lobby', [pair.room])).rejects.toThrow('Finish Memory')
    await call(db, pair.a, 'heartbeat', [pair.room])
  })

  it('scores pairs, gives extra turns without duplicate alerts, completes and switches games in the same room', async () => {
    const pair = await duo()
    await choose(pair, 'memory', 12, 'florals')
    const playing = await confirm(pair)
    const values = await deck(pair.room)
    const match = values.findIndex((value, index) => index > 0 && value === values[0])
    const originalAlert = getTurnAlert(playing, pair.a, true)
    await flip(pair.room, pair.a, 0)
    const matched = await flip(pair.room, pair.a, match)
    expect(matched.memory!.scores[pair.a]).toBe(1)
    expect(matched.memory!.turn_user).toBe(pair.a)
    expect(getTurnAlert(matched, pair.a, true)).toEqual(originalAlert)
    await expect(flip(pair.room, pair.a, 0)).rejects.toThrow('already been found')
    for (const value of new Set(values.filter(value => value !== values[0]))) {
      const positions = values.flatMap((card, index) => card === value ? [index] : [])
      await flip(pair.room, pair.a, positions[0])
      await flip(pair.room, pair.a, positions[1])
    }
    const finished = await state(db, pair.b, pair.room)
    expect(finished.memory).toMatchObject({ finished: true, scores: { [pair.a]: 6, [pair.b]: 0 } })
    expect(finished.memory!.cards).toEqual(values)
    expect(getTurnAlert(finished, pair.a, true)).toBeNull()
    await expect(flip(pair.room, pair.a, 1)).rejects.toThrow('complete')
    await expect(call(db, pair.b, 'open_duo_lobby', [pair.room])).rejects.toThrow('Only the host')
    await call(db, pair.a, 'open_duo_lobby', [pair.room])
    await choose(pair, 'code')
    const codeGame = await confirm(pair)
    expect(codeGame.room).toMatchObject({ id: pair.room, code: pair.code, game_kind: 'code', duo_lobby: false, status: 'lobby' })
    expect(codeGame.players.map(player => player.user_id)).toEqual([pair.a, pair.b])
    await call(db, pair.a, 'set_secret', [pair.room, '001122'])
    await expect(call(db, pair.a, 'open_duo_lobby', [pair.room])).rejects.toThrow('Finish the current')
  })

  it('serializes concurrent flips and refuses stale requests from an earlier game', async () => {
    const pair = await duo()
    await choose(pair)
    const current = await confirm(pair)
    const m = current.memory!
    const results = await Promise.allSettled([0, 1].map(index => call(db, pair.a, 'flip_memory_card', [pair.room, m.session_id, m.moves, index])))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const values = await deck(pair.room)
    const first = (await state(db, pair.a, pair.room)).memory!.cards.findIndex(card => card !== null)
    const match = values.findIndex((value, index) => index !== first && value === values[first])
    await flip(pair.room, pair.a, match)
    for (const value of new Set(values.filter(value => value !== values[first]))) {
      for (const index of values.flatMap((card, i) => card === value ? [i] : [])) await flip(pair.room, pair.a, index)
    }
    await call(db, pair.a, 'open_duo_lobby', [pair.room])
    await choose(pair, 'memory', 16, 'paintings')
    const next = await confirm(pair)
    expect(next.memory!.session_id).not.toBe(m.session_id)
    await expect(call(db, pair.a, 'flip_memory_card', [pair.room, m.session_id, 0, 0])).rejects.toThrow('board changed')
    expect(next.memory!.scores).toEqual({ [pair.a]: 0, [pair.b]: 0 })
  })

  it('records tied scores and does not let a single player start', async () => {
    const player = await user(db)
    const room = await call<string>(db, player, 'create_duo_room', ['Solo'])
    await expect(call(db, player, 'confirm_duo_game', [room, 1])).rejects.toThrow('Wait for your friend')
    const pair = await duo()
    await choose(pair)
    await confirm(pair)
    const values = await deck(pair.room)
    const pairs = [...new Set(values)]
    for (const value of pairs.slice(0, 3)) {
      for (const index of values.flatMap((card, i) => card === value ? [i] : [])) await flip(pair.room, pair.a, index)
    }
    const rest = values.flatMap((value, index) => pairs.slice(3).includes(value) ? [index] : [])
    await flip(pair.room, pair.a, rest[0])
    await flip(pair.room, pair.a, rest.find(index => values[index] !== values[rest[0]])!)
    await db.query("update private.memory_games set reveal_until=clock_timestamp()-interval '1 second' where room_id=$1", [pair.room])
    for (const value of pairs.slice(3)) {
      for (const index of values.flatMap((card, i) => card === value ? [i] : [])) await flip(pair.room, pair.b, index)
    }
    expect((await state(db, pair.a, pair.room)).memory).toMatchObject({ finished: true, scores: { [pair.a]: 3, [pair.b]: 3 } })
  })

  it('preserves code game state while exposing the hub only on explicit host choice', async () => {
    const pair = await duo()
    await choose(pair, 'code')
    const current = await confirm(pair)
    expect(current.room.game_kind).toBe('code')
    expect(current.room.status).toBe('lobby')
    await call(db, pair.a, 'open_duo_lobby', [pair.room])
    expect((await state(db, pair.b, pair.room)).hub!.ready).toEqual([])
    await choose(pair)
    await confirm(pair)
    await solve(pair.room, pair.a)
    await call(db, pair.a, 'open_duo_lobby', [pair.room])
    expect((await state(db, pair.b, pair.room)).room.code).toBe(pair.code)
  })

  it('queues one private push for an incoming memory turn, not for flips or earned extra turns', async () => {
    await db.exec(`
      create schema net;
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint
        language sql as $$select 1::bigint$$;
      insert into private.push_settings(public_key,dispatch_url,dispatch_token)
        values('public','https://wxmrxcnfivgkmhdhedwf.supabase.co/functions/v1/turn-push',repeat('x',40));
    `)
    const pair = await duo()
    for (const player of [pair.a, pair.b]) {
      await call(db, player, 'save_push_subscription', [`https://web.push.apple.com/${player}`, 'B'.repeat(87), 'a'.repeat(22)])
    }
    await choose(pair)
    await confirm(pair)
    const jobs = async () => (await db.query<{ id: string; user_id: string; kind: string; action_key: string }>(
      'select id,user_id,kind,action_key from private.turn_push_events where room_id=$1 order by created_at', [pair.room])).rows
    expect(await jobs()).toHaveLength(1)
    const values = await deck(pair.room)
    const match = values.findIndex((value, index) => index > 0 && value === values[0])
    await flip(pair.room, pair.a, 0)
    await flip(pair.room, pair.a, match)
    expect(await jobs()).toHaveLength(1)
    const rest = values.flatMap((value, index) => value !== values[0] ? [index] : [])
    await flip(pair.room, pair.a, rest[0])
    await flip(pair.room, pair.a, rest.find(index => values[index] !== values[rest[0]])!)
    const events = await jobs()
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({ user_id: pair.b, kind: 'guess' })
    expect(events[1].action_key).toContain('.memory.')
    const result = await db.transaction(async tx => {
      await tx.exec('set local role service_role')
      return tx.query<{ event: { roomId: string; kind: string; skipped?: boolean } }>('select public.claim_turn_push($1) as event', [events[1].id])
    })
    expect(result.rows[0].event).toMatchObject({ roomId: pair.room, kind: 'guess' })
    expect(result.rows[0].event.skipped).not.toBe(true)
  })
})

it('ships twelve distinct CC0 artworks per theme with local images and source credits', async () => {
  for (const works of Object.values(images)) {
    expect(works).toHaveLength(12)
    expect(new Set(works.map(work => work.id)).size).toBe(12)
    for (const work of works) {
      expect(work.license).toBe('CC0')
      expect(work.source).toMatch(/^https:\/\/clevelandart.org\/art\//)
      await access(new URL(`../public/${work.path}`, import.meta.url))
    }
  }
})
