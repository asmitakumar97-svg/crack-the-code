import { afterAll, beforeAll, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SoloKind } from '../src/lib/game'
import { getBoardActivity, getPlayerActivity } from '../src/lib/playerTurns'
import { call, createDatabase, launch, roomPair, start, state, user } from './database'

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db.close() })
async function begin(kind: Exclude<SoloKind, 'code'>) {
  const a = await user(db), b = await user(db)
  const room = await call<string>(db, a, 'create_duo_room', ['Alice'])
  await call(db, b, 'join_room', [(await state(db, a, room)).room.code, 'Bob'])
  await call(db, a, 'choose_duo_game', [room, 1, kind, 12, 'animals', 'number', 'turns', 10])
  await call(db, a, 'confirm_duo_game', [room, 2])
  await call(db, b, 'confirm_duo_game', [room, 2])
  return { a, b, room }
}

it.each(['memory', 'dots', 'bingo', 'cheat'] as const)('indicates the server-selected player in %s, not the local viewer', async kind => {
  const p = await begin(kind)
  for (const viewer of [p.a, p.b]) {
    const g = await state(db, viewer, p.room)
    expect(getPlayerActivity(g, p.a).active).toBe(true)
    expect(getPlayerActivity(g, p.b)).toEqual({ active: false, label: 'Waiting' })
  }
  const g = await state(db, p.a, p.room)
  const board = g.memory ?? g.dots ?? g.party!
  expect(getBoardActivity({ ...board, finished: true }, p.a)).toEqual({ active: false, label: 'Game complete' })
})

it('highlights both racers through the countdown and race, but neither after completion', async () => {
  const p = await begin('ring'), g = await state(db, p.a, p.room), board = g.ring!
  for (const actor of [p.a, p.b]) {
    expect(getPlayerActivity(g, actor)).toEqual({ active: true, label: 'Get ready' })
    expect(getBoardActivity(board, actor, Date.parse(board.started_at) + 1)).toEqual({ active: true, label: 'Racing together' })
    expect(getBoardActivity({ ...board, finished: true }, actor).active).toBe(false)
  }
})

it('highlights each Hangman setter until locked, then only the current guesser', async () => {
  const p = await begin('hangman')
  let g = await state(db, p.a, p.room)
  for (const actor of [p.a, p.b]) expect(getPlayerActivity(g, actor)).toEqual({ active: true, label: 'Choose your word' })
  await call(db, p.a, 'play_party', [p.room, g.party!.session_id, g.party!.moves, 'secret', '{"category":"animals","word":"CAT"}'])
  g = await state(db, p.b, p.room)
  expect(getPlayerActivity(g, p.a)).toEqual({ active: false, label: 'Word locked' })
  expect(getPlayerActivity(g, p.b).active).toBe(true)
  await call(db, p.b, 'play_party', [p.room, g.party!.session_id, g.party!.moves, 'secret', '{"category":"animals","word":"DOG"}'])
  g = await state(db, p.a, p.room)
  expect(getPlayerActivity(g, p.a)).toEqual({ active: true, label: 'Guess a letter' })
  expect(getPlayerActivity(g, p.b).active).toBe(false)
})

it('keeps the Cheat responder highlighted when changing from bluff response to playing cards', async () => {
  const p = await begin('cheat')
  let g = await state(db, p.a, p.room)
  if (g.party!.kind !== 'cheat') throw new Error('Expected Cheat')
  await call(db, p.a, 'play_party', [p.room, g.party!.session_id, g.party!.moves, 'play', JSON.stringify({ cards: [g.party!.cards[0]] })])
  g = await state(db, p.b, p.room)
  expect(getPlayerActivity(g, p.b)).toEqual({ active: true, label: 'Accept or call bluff' })
  await call(db, p.b, 'play_party', [p.room, g.party!.session_id, g.party!.moves, 'accept', '{}'])
  g = await state(db, p.a, p.room)
  expect(getPlayerActivity(g, p.b)).toEqual({ active: true, label: 'Play your cards' })
  expect(getPlayerActivity(g, p.a).active).toBe(false)
})

it('switches Number Lock characters between choosing secrets, guessing and giving clues', async () => {
  const p = await roomPair(db, 'number', 'turns')
  let g = await state(db, p.a, p.room)
  expect(getPlayerActivity(g, p.a)).toEqual({ active: true, label: 'Choose your secret' })
  await call(db, p.a, 'set_secret', [p.room, '112256'])
  await call(db, p.b, 'set_secret', [p.room, '334456'])
  g = await state(db, p.a, p.room)
  expect(getPlayerActivity(g, p.a)).toEqual({ active: true, label: 'Review the bets' })
  await launch(db, p)
  g = await state(db, p.a, p.room)
  expect(getPlayerActivity(g, p.a)).toEqual({ active: true, label: 'Make your guess' })
  expect(getPlayerActivity(g, p.b).active).toBe(false)
  await call(db, p.a, 'submit_guess', [p.room, '000000', 1])
  g = await state(db, p.b, p.room)
  expect(getPlayerActivity(g, p.a)).toEqual({ active: false, label: 'Waiting for clues' })
  expect(getPlayerActivity(g, p.b)).toEqual({ active: true, label: 'Give your clues' })
})

it('highlights both Word Lock racers during simultaneous guessing and stops at the round end', async () => {
  const p = await roomPair(db, 'word', 'race')
  await start(db, p, ['SECRET', 'PLANET'])
  const g = await state(db, p.a, p.room)
  for (const actor of [p.a, p.b]) expect(getPlayerActivity(g, actor)).toEqual({ active: true, label: 'Guessing together' })
  await call(db, p.a, 'submit_guess', [p.room, 'PLANET', 1])
  const finished = await state(db, p.a, p.room)
  for (const actor of [p.a, p.b]) expect(getPlayerActivity(finished, actor).active).toBe(false)
})
