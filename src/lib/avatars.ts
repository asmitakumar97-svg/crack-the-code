import type { User } from '@supabase/supabase-js'

const characters = [
  { kind: 'robot', name: 'Bolt the robot' },
  { kind: 'cat', name: 'Mochi the cat' },
  { kind: 'fox', name: 'Scout the fox' },
  { kind: 'owl', name: 'Echo the owl' },
] as const
const palettes = [
  { background: '#d9f3e5', face: '#8ed7b2' },
  { background: '#efe5fc', face: '#c6acf0' },
  { background: '#ffead8', face: '#f3bb87' },
  { background: '#dfeefd', face: '#9fc8f0' },
] as const

export function getCharacter(identity: string) {
  let hash = 2166136261
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  return { ...characters[hash % characters.length], ...palettes[Math.floor(hash / characters.length) % palettes.length] }
}

export function safeGooglePhoto(value: unknown): string | null {
  return typeof value === 'string' && !/\s/.test(value) && /^https:\/\/([a-zA-Z0-9-]+\.)*googleusercontent\.com\/[^\s]+$/.test(value) ? value : null
}

export function getGooglePhoto(user: User | null): string | null {
  if (!user || user.is_anonymous) return null
  const providers: unknown = user.app_metadata.providers
  if (!(user.app_metadata.provider === 'google' || Array.isArray(providers) && providers.includes('google'))) return null
  return safeGooglePhoto(user.user_metadata.avatar_url) ?? safeGooglePhoto(user.user_metadata.picture)
}
