import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, call, createDatabase, launch, roomPair, state, user } from './database'
import { getTurnAlert, shouldAnnounceTurn } from '../src/lib/turnAlerts'
import type { GameState } from '../src/lib/game'
import { getFeedback } from '../src/lib/game'

let db: PGlite
const endpoint = (suffix = crypto.randomUUID()) => `https://fcm.googleapis.com/fcm/send/${suffix}`
const key = 'B'.repeat(87)
const auth = 'a'.repeat(22)
beforeAll(async () => {
  db = await createDatabase()
  await db.exec(`
    create schema net;
    create table net.requests(body jsonb);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
    begin insert into net.requests(body) values(body); return 1; end $$;
    insert into private.push_settings(public_key,dispatch_url,dispatch_token)
      values('public-key','https://wxmrxcnfivgkmhdhedwf.supabase.co/functions/v1/turn-push',repeat('x',40));
  `)
})
afterAll(async () => { await db?.close() })
function service<T>(sql: string, args: unknown[] = []) {
  return db.transaction(async tx => {
    await tx.exec('set local role service_role')
    return tx.query<T>(sql, args)
  })
}
async function subscription(id: string, url = endpoint()) {
  await call(db, id, 'save_push_subscription', [url, key, auth])
  return url
}
async function activePair(mode: 'number' | 'word' = 'number', variant: 'turns' | 'race' = 'turns') {
  const pair = await roomPair(db, mode, variant)
  await subscription(pair.a)
  await subscription(pair.b)
  await call(db, pair.a, 'set_secret', [pair.room, mode === 'number' ? '1122' : 'LETTER'])
  await call(db, pair.b, 'set_secret', [pair.room, mode === 'number' ? '3344' : 'SECRET'])
  await launch(db, pair)
  return pair
}
interface Job { eventId: string; roomId: string; kind: string; subscriptions: { id: string; endpoint: string }[]; skipped?: boolean }
async function claim(id: string) {
  return (await service<{ result: Job | null }>('select public.claim_turn_push($1) as result', [id])).rows[0].result
}
async function latest(room: string) {
  return (await db.query<{ id: string }>('select id from private.turn_push_events where room_id=$1 order by created_at desc,id desc limit 1', [room])).rows[0].id
}
async function guess(pair: { a: string; room: string }, value = '0000') {
  await call(db, pair.a, 'submit_guess', [pair.room, value, 1])
  return state(db, pair.a, pair.room)
}

describe('private push subscriptions', () => {
  it('exposes only the public key and keeps device credentials owner-only', async () => {
    const owner = await user(db)
    const other = await user(db)
    const url = await subscription(owner)
    expect(await call(db, owner, 'get_push_settings')).toEqual({ publicKey: 'public-key' })
    expect(await call(db, owner, 'get_push_subscription_status', [url])).toEqual({ enabled: true, lastError: null })
    expect(await call(db, other, 'get_push_subscription_status', [url])).toEqual({ enabled: false, lastError: null })
    await call(db, other, 'remove_push_subscription', [url])
    expect(await call(db, owner, 'get_push_subscription_status', [url])).toHaveProperty('enabled', true)
    for (const table of ['push_subscriptions', 'push_settings', 'turn_push_events']) {
      await expect(asUser(db, other, `select * from private.${table}`)).rejects.toThrow(/permission denied/)
    }
    await expect(call(db, owner, 'claim_turn_push', [null])).rejects.toThrow(/permission denied/)
    await expect(call(db, owner, 'finish_turn_push', [crypto.randomUUID(), []])).rejects.toThrow(/permission denied/)
    await call(db, owner, 'remove_push_subscription', [url])
    expect(await call(db, owner, 'get_push_subscription_status', [url])).toHaveProperty('enabled', false)
  })
  it.each([
    'http://fcm.googleapis.com/a', 'https://evil.example/a', 'https://127.0.0.1/a',
    'https://fcm.googleapis.com.evil.example/a', 'https://fcm.googleapis.com@evil.example/a',
    'https://user@fcm.googleapis.com/a', 'https://fcm.googleapis.com:443/a', 'https://web.push.apple.com/a\n',
  ])('rejects unsupported destinations %s', async url => {
    await expect(subscription(await user(db), url)).rejects.toThrow(/unsupported push subscription/)
  })
  it('requires subscription keys, limits devices, and transfers only with matching device keys', async () => {
    const owner = await user(db)
    const other = await user(db)
    const url = await subscription(owner)
    await expect(call(db, other, 'save_push_subscription', [url, 'C'.repeat(87), auth])).rejects.toThrow(/subscription changed/)
    await call(db, other, 'save_push_subscription', [url, key, auth])
    expect(await call(db, owner, 'get_push_subscription_status', [url])).toHaveProperty('enabled', false)
    expect(await call(db, other, 'get_push_subscription_status', [url])).toHaveProperty('enabled', true)
    await expect(call(db, other, 'save_push_subscription', [endpoint(), null, auth])).rejects.toThrow(/unsupported/)
    for (let i = 0; i < 10; i++) await subscription(owner)
    await expect(subscription(owner)).rejects.toThrow(/Ten devices/)
  })
})

describe('turn transitions and notification jobs', () => {
  it.each(['number', 'word'] as const)('queues %s clues once for the defender, never secret data or the same player’s follow-up guess', async mode => {
    const pair = await activePair(mode)
    const before = (await db.query<{ count: number }>('select count(*)::int as count from private.turn_push_events where room_id=$1', [pair.room])).rows[0].count
    const pending = (await guess(pair, mode === 'number' ? '0000' : 'FRUITS')).pending_guess!
    const id = await latest(pair.room)
    const event = await claim(id)
    expect(event).toMatchObject({ eventId: id, roomId: pair.room, kind: 'clues' })
    expect(event!.subscriptions).toHaveLength(1)
    expect(JSON.stringify(event)).not.toMatch(/FRUITS|0000|1122|3344|SECRET|LETTER/)
    await db.query('update public.rooms set version=version+1 where id=$1', [pair.room])
    expect((await db.query<{ count: number }>('select count(*)::int as count from private.turn_push_events where room_id=$1', [pair.room])).rows[0].count).toBe(before + 1)
    await call(db, pair.b, 'submit_hints', [pair.room, pending.id, getFeedback(mode === 'number' ? '3344' : 'SECRET', pending.guess)])
    expect((await db.query<{ count: number }>('select count(*)::int as count from private.turn_push_events where room_id=$1', [pair.room])).rows[0].count).toBe(before + 1)
  })
  it('skips stale jobs, does not queue races or solved rounds, and authorizes notification links', async () => {
    const pair = await activePair()
    const initial = await latest(pair.room)
    await guess(pair)
    expect(await claim(initial)).toEqual({ skipped: true })
    const current = await latest(pair.room)
    await db.query("update public.rooms set status='round_over' where id=$1", [pair.room])
    expect(await claim(current)).toEqual({ skipped: true })
    const race = await activePair('number', 'race')
    await guess(race)
    expect((await db.query('select * from private.turn_push_events where room_id=$1', [race.room])).rows).toHaveLength(0)
    const solved = await activePair()
    await guess(solved, '3344')
    expect((await db.query('select * from private.turn_push_events where room_id=$1 and kind=$2', [solved.room, 'clues'])).rows).toHaveLength(0)
    await expect(state(db, await user(db), pair.room)).rejects.toThrow(/not a member/)
  })
  it('claims once, retries failures without resending successes, and removes expired devices', async () => {
    const pair = await activePair()
    await subscription(pair.b)
    await guess(pair)
    const id = await latest(pair.room)
    const job = (await claim(id))!
    expect(job.subscriptions).toHaveLength(2)
    expect(await claim(id)).toBeNull()
    await service('select public.finish_turn_push($1,$2)', [id, JSON.stringify([{ id: job.subscriptions[0].id, status: 201 }, { id: job.subscriptions[1].id, status: 503 }])])
    await db.query("update private.turn_push_events set available_at=now()-interval '1 second' where id=$1", [id])
    const retry = (await claim(id))!
    expect(retry.subscriptions).toHaveLength(1)
    expect(retry.subscriptions[0].id).toBe(job.subscriptions[1].id)
    await service('select public.finish_turn_push($1,$2)', [id, JSON.stringify([{ id: retry.subscriptions[0].id, status: 410 }])])
    expect((await db.query<{ status: string }>('select status from private.turn_push_events where id=$1', [id])).rows[0].status).toBe('sent')
    expect((await db.query('select id from private.push_subscriptions where id=$1', [retry.subscriptions[0].id])).rows).toHaveLength(0)
  })
  it('caps failures and exposes a safe delivery error only to the recipient', async () => {
    const pair = await activePair()
    const url = await subscription(pair.b)
    await guess(pair)
    const id = await latest(pair.room)
    for (let attempt = 0; attempt < 3; attempt++) {
      await db.query("update private.turn_push_events set available_at=now()-interval '1 second' where id=$1", [id])
      const job = (await claim(id))!
      await service('select public.finish_turn_push($1,$2)', [id, JSON.stringify(job.subscriptions.map(s => ({ id: s.id, status: 503 })))])
    }
    expect((await db.query<{ status: string }>('select status from private.turn_push_events where id=$1', [id])).rows[0].status).toBe('failed')
    expect(await call(db, pair.b, 'get_push_subscription_status', [url])).toHaveProperty('lastError', expect.stringContaining('could not deliver'))
    expect(await call(db, pair.a, 'get_push_subscription_status', [url])).toHaveProperty('lastError', null)
  })
  it('open-game alerts deduplicate polling, ignore races and waiting, and avoid alerting after your own hint submission', async () => {
    const pair = await activePair()
    const before = await state(db, pair.b, pair.room)
    expect(getTurnAlert(before, pair.b, true)).toBeNull()
    expect(getTurnAlert(before, pair.a, false)).toBeNull()
    const pending = await guess(pair)
    const action = getTurnAlert(pending, pair.b, true)
    expect(action?.kind).toBe('clues')
    expect(getTurnAlert(pending, pair.a, true)).toBeNull()
    expect(shouldAnnounceTurn(null, action)).toBe(true)
    expect(shouldAnnounceTurn(action, action)).toBe(false)
    await call(db, pair.b, 'submit_hints', [pair.room, pending.pending_guess!.id, Array(4).fill('miss')])
    const next = getTurnAlert(await state(db, pair.b, pair.room), pair.b, true)
    expect(next?.kind).toBe('guess')
    expect(shouldAnnounceTurn(action, next)).toBe(false)
    expect(getTurnAlert({ ...pending, room: { ...pending.room, variant: 'race' } } satisfies GameState, pair.b, true)).toBeNull()
  })
})
