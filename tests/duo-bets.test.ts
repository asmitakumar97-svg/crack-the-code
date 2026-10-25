import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { BetRecord, SoloKind } from '../src/lib/game'
import { NO_BET } from '../src/lib/game'
import { getTurnAlert, shouldAnnounceTurn } from '../src/lib/turnAlerts'
import { asUser, call, createDatabase, roomPair, start, state, user } from './database'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db.close() })
async function lobby(kind: Exclude<SoloKind, 'code'> = 'memory') {
  const a = await user(db), b = await user(db)
  const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
  await call(db, b, 'join_room', [(await state(db, a, room)).room.code, 'Bob'])
  await call(db, a, 'choose_duo_game', [room, 1, kind, 12, 'animals', 'number', 'turns', 10])
  return { a, b, room }
}
type Pair = Awaited<ReturnType<typeof lobby>>
async function wager(p: Pair, actor: string, text: string) {
  const s = await state(db, actor, p.room)
  await call(db, actor, 'set_duo_wager', [p.room, s.hub!.revision, text])
}
async function begin(p: Pair) {
  const revision = (await state(db, p.a, p.room)).hub!.revision
  await call(db, p.a, 'confirm_duo_game', [p.room, revision])
  await call(db, p.b, 'confirm_duo_game', [p.room, revision])
}
const history = (actor: string, result = 'all', search = '') => call<BetRecord[]>(db, actor, 'get_bet_history', [null, null, search, result])

async function finish(p: Pair, kind: Exclude<SoloKind, 'code'>, winner: string) {
  const other = winner === p.a ? p.b : p.a
  let s = await state(db, winner, p.room)
  if (kind === 'memory') {
    await db.query("update private.memory_games set deck='{0,0,1,1,2,2,3,3,4,4,5,5}',matched='{0,1,2,3,4,5,6,7,8,9}',turn_user=$2,scores=$3 where room_id=$1",
      [p.room, winner, JSON.stringify({ [winner]: 5, [other]: 0 })])
    for (const index of [10, 11]) {
      s = await state(db, winner, p.room)
      await call(db, winner, 'flip_memory_card', [p.room, s.memory!.session_id, s.memory!.moves, index])
    }
  } else if (kind === 'dots') {
    const edges = Array(180).fill(winner), boxes = Array(81).fill(winner)
    edges[0] = null; boxes[0] = null
    await db.query('update private.dots_games set edges=$2,boxes=$3,turn_user=$4,remaining=1,roll_until=null,scores=$5 where room_id=$1',
      [p.room, edges, boxes, winner, JSON.stringify({ [winner]: 80, [other]: 0 })])
    await call(db, winner, 'draw_dots_line', [p.room, s.dots!.session_id, s.dots!.moves, 0])
  } else if (kind === 'ring') {
    const rods = [Array(10).fill(0), Array(10).fill(1), Array(10).fill(2), Array(9).fill(3), [3]]
    await db.query("update private.ring_games set board=jsonb_set(board,$2,$3::jsonb)||jsonb_build_object('started_at',clock_timestamp()-interval '1 minute') where room_id=$1",
      [p.room, ['boards', winner], JSON.stringify(rods)])
    await call(db, winner, 'move_ring', [p.room, s.ring!.session_id, s.ring!.moves[winner], 4, 3, false])
  } else {
    const patch = kind === 'bingo' ? {
      boards: { [winner]: Array.from({ length: 25 }, (_, i) => i + 1), [other]: [1, 7, 13, 19, 25, 6, 12, 18, 24, 5, 11, 17, 23, 4, 10, 16, 22, 3, 9, 15, 21, 2, 8, 14, 20] },
      called: Array.from({ length: 20 }, (_, i) => i + 1), turn_user: winner,
    } : kind === 'cheat' ? {
      hands: { [winner]: [0], [other]: [1] }, turn_user: winner,
    } : {
      secrets: { [winner]: 'CAT', [other]: 'DOG' }, guesses: { [winner]: ['D', 'O'], [other]: [] },
      categories: { [winner]: 'animals', [other]: 'animals' }, ready: [winner, other], turn_user: winner, phase: 'guessing',
    }
    await db.query('update private.party_games set board=board||$2::jsonb where room_id=$1', [p.room, JSON.stringify(patch)])
    const play = async (actor: string, action: string, data: Record<string, unknown>) => {
      const g = (await state(db, actor, p.room)).party!
      await call(db, actor, 'play_party', [p.room, g.session_id, g.moves, action, JSON.stringify(data)])
    }
    if (kind === 'bingo') await play(winner, 'call', { number: 21 })
    else if (kind === 'hangman') await play(winner, 'guess', { letter: 'G' })
    else { await play(winner, 'play', { cards: [0] }); await play(other, 'accept', {}) }
  }
}

describe('optional bets across shared games', () => {
  it('saves only your own bet, clears both confirmations, rejects stale revisions, and freezes agreed bets', async () => {
    const p = await lobby()
    await wager(p, p.a, 'Coffee for me')
    let s = await state(db, p.a, p.room)
    await call(db, p.a, 'confirm_duo_game', [p.room, s.hub!.revision])
    await wager(p, p.b, 'You pick the movie')
    const next = await state(db, p.a, p.room)
    expect(next.hub!.ready).toEqual([])
    expect(next.hub!.wagers).toEqual({ [p.a]: 'Coffee for me', [p.b]: 'You pick the movie' })
    await expect(call(db, p.a, 'confirm_duo_game', [p.room, s.hub!.revision])).rejects.toThrow('settings changed')
    await expect(call(db, p.a, 'set_duo_wager', [p.room, s.hub!.revision, 'Changed'])).rejects.toThrow('changed')
    await wager(p, p.a, '')
    await begin(p)
    s = await state(db, p.b, p.room)
    expect(s.duo_bet!.wagers).toEqual({ [p.a]: '', [p.b]: 'You pick the movie' })
    await expect(wager(p, p.b, 'Change during play')).rejects.toThrow('locked')
    expect(await history(p.a)).toEqual([])
  })

  it('validates length, authorization and private storage without exposing another room or history', async () => {
    const p = await lobby(), outsider = await user(db)
    await expect(wager(p, p.a, 'x'.repeat(121))).rejects.toThrow('120')
    await expect(call(db, p.a, 'set_duo_wager', [p.room, 2, null])).rejects.toThrow('120')
    await expect(call(db, outsider, 'set_duo_wager', [p.room, 2, 'Mine'])).rejects.toThrow('not a member')
    await expect(state(db, outsider, p.room)).rejects.toThrow('not a member')
    for (const table of ['duo_bets', 'duo_choices']) await expect(asUser(db, p.a, `select * from private.${table}`)).rejects.toThrow('permission denied')
    for (const fn of ['confirm_before_duo_bets', 'get_before_duo_bets', 'open_before_duo_bets']) {
      await expect(call(db, p.a, fn, fn.startsWith('confirm') ? [p.room, 2] : [p.room])).rejects.toThrow('permission denied')
    }
  })

  for (const kind of ['memory', 'dots', 'ring', 'bingo', 'cheat', 'hangman'] as const) {
    it.each(['host', 'guest'])(`archives the correct winning bet once for ${kind}, winner=%s`, async seat => {
      const p = await lobby(kind)
      await wager(p, p.a, 'Coffee for Alice')
      await wager(p, p.b, 'Snacks for Bob')
      await begin(p)
      const winner = seat === 'host' ? p.a : p.b, loser = winner === p.a ? p.b : p.a
      await finish(p, kind, winner)
      const won = await history(winner, 'won'), lost = await history(loser, 'lost')
      expect(won).toHaveLength(1)
      expect(won[0]).toMatchObject({ game_kind: kind, won: true, draw: false, bet: seat === 'host' ? 'Coffee for Alice' : 'Snacks for Bob', mode: null, variant: null })
      expect(lost[0]).toMatchObject({ id: won[0].id, won: false, draw: false, bet: won[0].bet })
      expect(await history(await user(db))).toEqual([])
      await db.query('update public.rooms set version=version+1 where id=$1', [p.room])
      expect(await history(winner)).toHaveLength(1)
      await call(db, p.a, 'open_duo_lobby', [p.room])
      expect((await state(db, p.a, p.room)).hub!.wagers).toEqual({})
      await begin(p)
      expect((await state(db, p.a, p.room)).duo_bet!.wagers).toEqual({})
      expect(await history(winner)).toHaveLength(1)
    })
  }

  it('records a draw with no winning bet and retains empty optional bets', async () => {
    const p = await lobby('bingo')
    await begin(p)
    const numbers = Array.from({ length: 25 }, (_, i) => i + 1)
    await db.query("update private.party_games set board=board||jsonb_build_object('boards',$2::jsonb,'called',$3::jsonb) where room_id=$1",
      [p.room, JSON.stringify({ [p.a]: numbers, [p.b]: numbers }), JSON.stringify(numbers.slice(0, 20))])
    const g = (await state(db, p.a, p.room)).party!
    await call(db, p.a, 'play_party', [p.room, g.session_id, g.moves, 'call', '{"number":21}'])
    expect((await history(p.a))[0]).toMatchObject({ draw: true, won: false, bet: '' })
    expect(await history(p.a, 'won')).toEqual([])
    expect(await history(p.a, 'lost')).toEqual([])
  })

  it('supports a no-bet code match without bypassing the existing explicit consent', async () => {
    const p = await roomPair(db)
    await call(db, p.a, 'set_wager', [p.room, NO_BET])
    await call(db, p.b, 'set_wager', [p.room, NO_BET])
    await start(db, p)
    expect((await state(db, p.a, p.room)).players.every(player => player.wager === NO_BET && player.ready)).toBe(true)
  })

  it('keeps the same frontend and server turn key when a Cheat responder accepts then leads', async () => {
    const p = await lobby('cheat')
    await begin(p)
    let s = await state(db, p.a, p.room)
    const g = s.party!
    if (g.kind !== 'cheat') throw new Error('Expected Cheat')
    await call(db, p.a, 'play_party', [p.room, g.session_id, g.moves, 'play', JSON.stringify({ cards: [g.cards[0]] })])
    s = await state(db, p.b, p.room)
    const incoming = getTurnAlert(s, p.b, true)
    const before = (await db.query<{ value: Record<string, string> }>('select private.current_turn_action($1) as value', [p.room])).rows[0].value
    await call(db, p.b, 'play_party', [p.room, s.party!.session_id, s.party!.moves, 'accept', '{}'])
    const next = getTurnAlert(await state(db, p.b, p.room), p.b, true)
    expect(shouldAnnounceTurn(incoming, next)).toBe(false)
    expect((await db.query<{ value: unknown }>('select private.current_turn_action($1) as value', [p.room])).rows[0].value).toEqual(before)
    expect(Object.keys(before).sort()).toEqual(['key', 'kind', 'roomCode', 'user'])
  })
})
