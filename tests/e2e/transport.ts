import type { BrowserContext } from '@playwright/test'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, user } from '../database'

// Test-only transport backed by the actual migrations, roles and RPCs.
export async function connect(context: BrowserContext, db: PGlite, anonymous = true, existingId?: string, profile: { avatarUrl?: string } = {}) {
  const id = existingId ?? await user(db)
  const appMetadata = anonymous ? {} : { provider: 'google', providers: ['google'] }
  const userMetadata = profile.avatarUrl ? { avatar_url: profile.avatarUrl } : {}
  await db.query('update auth.users set is_anonymous=$2,raw_app_meta_data=$3,raw_user_meta_data=$4 where id=$1', [id, anonymous, JSON.stringify(appMetadata), JSON.stringify(userMetadata)])
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    'test-signature',
  ].join('.')
  await context.route('http://supabase.test/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    try {
      let result: unknown
      if (url.pathname.startsWith('/auth/')) {
        result = { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user: { id, aud: 'authenticated', role: 'authenticated', is_anonymous: anonymous, created_at: new Date().toISOString(), app_metadata: appMetadata, user_metadata: userMetadata } }
      } else if (url.pathname === '/rest/v1/word_bank') {
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 1000)
        result = (await asUser<{ word: string }>(db, id, 'select word from public.word_bank where is_answer order by word limit $1 offset $2', [limit, offset])).rows
      } else if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const fn = url.pathname.split('/').at(-1)!
        if (!['create_duo_room', 'open_duo_lobby', 'choose_duo_game', 'confirm_duo_game', 'set_duo_wager', 'flip_memory_card', 'roll_dots_dice', 'draw_dots_line', 'move_ring', 'move_solo_ring', 'play_party', 'play_solo_party', 'create_room', 'join_room', 'set_wager', 'set_ready', 'set_secret', 'start_round', 'submit_guess', 'submit_hints', 'advance_round', 'heartbeat', 'get_game_state', 'get_bet_history', 'create_solo_game', 'get_solo_game', 'submit_solo_guess', 'create_solo_board', 'get_solo_board', 'play_solo_board', 'get_push_settings', 'save_push_subscription', 'remove_push_subscription', 'get_push_subscription_status'].includes(fn)) throw new Error('Unknown RPC')
        const entries = Object.entries(request.postDataJSON() ?? {})
        if (entries.some(([key]) => !/^p_[a-z][a-z0-9_]*$/.test(key))) throw new Error('Invalid argument')
        const sql = `select public.${fn}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(',')}) as result`
        result = (await asUser<{ result: unknown }>(db, id, sql, entries.map(([, value]) => value))).rows[0].result
      } else throw new Error(`Unexpected request: ${url.pathname}`)
      await route.fulfill({ json: result, headers: { 'Access-Control-Allow-Origin': '*' } })
    } catch (err) {
      await route.fulfill({ status: 400, json: { message: err instanceof Error ? err.message : 'Test transport error', code: 'P0001' } })
    }
  })
  await context.routeWebSocket('**/realtime/v1/websocket*', ws => ws.close())
  return id
}
