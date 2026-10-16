import { createClient } from '@supabase/supabase-js'
import type { GameState } from './game'
import { authenticateLocal, localRequest } from './local'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
function validUrl(value: string | undefined): boolean {
  if (!value || value.includes('YOUR_PROJECT')) return false
  try { return ['http:', 'https:'].includes(new URL(value).protocol) }
  catch { return false }
}
export const localPlay = import.meta.env.VITE_LOCAL_GAME === true
const cloudConfigured = Boolean(validUrl(url) && key && !key.includes('YOUR_'))
export const configured = localPlay || cloudConfigured
export const supabase = !localPlay && cloudConfigured ? createClient(url, key) : null
export const roomStorageKey = localPlay ? 'crack-the-code.local.room' : 'crack-the-code.room'

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (localPlay) return localRequest<T>(`/rpc/${name}`, args)
  if (!supabase) throw new Error('Connect Supabase first. See the setup instructions in README.md.')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

let authPromise: Promise<string> | undefined
export function authenticate(): Promise<string> {
  if (authPromise) return authPromise
  authPromise = (async () => {
    if (localPlay) return authenticateLocal()
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) throw error
    if (session) return session.user.id
    const { data, error: signInError } = await supabase.auth.signInAnonymously()
    if (signInError) throw new Error(`Could not sign in: ${signInError.message}. Enable anonymous sign-ins in Supabase Authentication.`)
    if (!data.user) throw new Error('Sign-in returned no user. Please try again.')
    return data.user.id
  })().catch(error => { authPromise = undefined; throw error })
  return authPromise
}
export const getState = (roomId: string) => rpc<GameState>('get_game_state', { p_room: roomId })

export async function loadWordPage(offset: number): Promise<string[]> {
  if (localPlay) return localRequest<string[]>(`/words?offset=${offset}&limit=1000`)
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('word_bank').select('word').order('word').range(offset, offset + 999)
  if (error) throw new Error(`Could not load word bank: ${error.message}. Reopen the room to retry.`)
  return (data ?? []).map((row: { word: string }) => row.word)
}
