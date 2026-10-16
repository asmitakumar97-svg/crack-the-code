import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { User } from '@supabase/supabase-js'
import type { PGlite } from '@electric-sql/pglite'
import { getCharacter, getGooglePhoto, safeGooglePhoto } from '../src/lib/avatars'
import { asUser, createDatabase, roomPair, state, user } from './database'

const photo = 'https://lh3.googleusercontent.com/a/example=s96-c'
const invalidPhotos = [
  '', 'http://lh3.googleusercontent.com/a/test', 'javascript:alert(1)', 'data:image/png;base64,test',
  'https://lh3.googleusercontent.com.evil.example/a/test', 'https://evil.example/googleusercontent.com/a/test',
  'https://googleusercontent.com@evil.example/a/test', 'https://user@lh3.googleusercontent.com/a/test',
  'https://lh3.googleusercontent.com:443/a/test', 'https://lh3.googleusercontent.com',
  `${photo}\n`, `${photo} other`, ` ${photo}`,
]
function account(overrides: Partial<User> = {}): User {
  return { id: 'test-player', aud: 'authenticated', created_at: '2026-10-16T00:00:00Z', is_anonymous: false,
    app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { avatar_url: photo }, ...overrides }
}

describe('Google photos and stable character avatars', () => {
  it('accepts only HTTPS Google photo hosts, not arbitrary URLs or non-string metadata', () => {
    expect(safeGooglePhoto(photo)).toBe(photo)
    expect(safeGooglePhoto('https://googleusercontent.com/a/test')).toBe('https://googleusercontent.com/a/test')
    for (const value of [...invalidPhotos, null, undefined, {}, [photo], 42]) expect(safeGooglePhoto(value)).toBeNull()
  })
  it('uses Google metadata only for signed-in Google identities, with picture as a fallback', () => {
    expect(getGooglePhoto(account())).toBe(photo)
    expect(getGooglePhoto(account({ app_metadata: { provider: 'email', providers: ['email', 'google'] } }))).toBe(photo)
    expect(getGooglePhoto(account({ user_metadata: { avatar_url: 'https://evil.example/a', picture: photo } }))).toBe(photo)
    expect(getGooglePhoto(account({ is_anonymous: true }))).toBeNull()
    expect(getGooglePhoto(account({ app_metadata: { provider: 'email', providers: ['email'] } }))).toBeNull()
    expect(getGooglePhoto(account({ app_metadata: { providers: [] } }))).toBeNull()
    expect(getGooglePhoto(null)).toBeNull()
  })
  it('assigns a stable character and palette per identity, independent of display name', () => {
    expect(getCharacter('player-1')).toEqual(getCharacter('player-1'))
    const variants = new Set(Array.from({ length: 100 }, (_, i) => JSON.stringify(getCharacter(`player-${i}`))))
    expect(variants.size).toBeGreaterThanOrEqual(12)
    expect(getCharacter('')).toHaveProperty('name')
  })
})

let db: PGlite
beforeAll(async () => { db = await createDatabase() })
afterAll(async () => { await db?.close() })
async function metadata(id: string, data: unknown, app: unknown = { provider: 'google' }, anonymous = false) {
  await db.query('update auth.users set raw_user_meta_data=$2,raw_app_meta_data=$3,is_anonymous=$4 where id=$1',
    [id, JSON.stringify(data), JSON.stringify(app), anonymous])
}
describe('participant-only profile photos', () => {
  it('shares only the approved photo with both room participants, never the full Google profile', async () => {
    const pair = await roomPair(db)
    await metadata(pair.a, { avatar_url: photo, email: 'private@example.test', full_name: 'Private Google Name', secret_field: 'not-public' })
    for (const id of [pair.a, pair.b]) {
      const game = await state(db, id, pair.room)
      expect(game.players.find(player => player.user_id === pair.a)?.avatar_url).toBe(photo)
      expect(game.players.find(player => player.user_id === pair.b)?.avatar_url).toBeNull()
      expect(JSON.stringify(game)).not.toMatch(/private@example|Private Google Name|not-public|raw_user_meta_data/)
    }
    const outsider = await user(db)
    await expect(state(db, outsider, pair.room)).rejects.toThrow(/not a member/)
    await expect(asUser(db, outsider, 'select private.google_avatar($1)', [pair.a])).rejects.toThrow(/permission denied/)
    await expect(asUser(db, outsider, 'select raw_user_meta_data from auth.users')).rejects.toThrow(/permission denied/)
  })
  it('rejects anonymous or non-Google metadata and supports the picture fallback', async () => {
    const pair = await roomPair(db)
    await metadata(pair.a, { avatar_url: photo }, { provider: 'google' }, true)
    expect((await state(db, pair.b, pair.room)).players[0].avatar_url).toBeNull()
    await metadata(pair.a, { avatar_url: photo }, { provider: 'email', providers: { google: true } })
    expect((await state(db, pair.b, pair.room)).players[0].avatar_url).toBeNull()
    await metadata(pair.a, { avatar_url: 'https://evil.example/a', picture: photo }, { provider: 'email', providers: ['google'] })
    expect((await state(db, pair.b, pair.room)).players[0].avatar_url).toBe(photo)
  })
  it.each(invalidPhotos)('rejects unapproved server photo URL %s', async value => {
    const pair = await roomPair(db)
    await metadata(pair.a, { avatar_url: value })
    expect((await state(db, pair.b, pair.room)).players[0].avatar_url).toBeNull()
  })
})
