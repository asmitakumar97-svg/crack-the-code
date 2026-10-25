export type Mode = 'number' | 'word'
export type Variant = 'race' | 'turns'
export type Mark = 'hit' | 'present' | 'miss'
export type Stake = 'low' | 'high'
export type Phase = 'lobby' | 'setting' | 'playing' | 'round_over' | 'match_over'
export type SoloChallenge = 'attempts' | 'timed'

export const MODES = {
  number: { name: 'Number Lock', label: '01', length: 6, sample: ['3', '7', '1', '9', '0', '2'], detail: '6 digits', keys: '1234567890', description: 'Choose a secret six-digit code. Repeats and leading zeros are allowed.' },
  word: { name: 'Word Lock', label: '02', length: 6, sample: ['S', 'E', 'C', 'R', 'E', 'T'], detail: '6-letter words', keys: 'QWERTYUIOPASDFGHJKLZXCVBNM', description: 'Choose a six-letter word, or let us pick one.' },
} satisfies Record<Mode, { name: string; label: string; length: number; sample: string[]; detail: string; keys: string; description: string }>

export interface Player {
  user_id: string
  avatar_url?: string | null
  name: string
  seat: number
  score: number
  ready: boolean
  attempts: number
  solved: boolean
  finished_at: string | null
  next_ready: boolean
  last_seen: string
  secret_ready: boolean
  wager: string
}
export interface Room {
  id: string
  code: string
  host_id: string
  mode: Mode
  status: Phase
  round_number: number
  match_number: number
  version: number
  stake: Stake
  wager_version: number
  variant: Variant
  turn_user_id: string | null
  started_at: string | null
}
export interface Guess {
  id: string
  guess: string
  feedback: Mark[]
  attempt: number
  elapsed_ms: number
}
export interface RoundResult {
  round_number: number
  match_number: number
  reveals: Record<string, string>
  winner_id: string | null
  reason: string
  stats: Record<string, { attempts: number; solved: boolean; elapsed_ms: number | null }>
}
export interface GameState {
  room: Room
  players: Player[]
  guesses: Guess[]
  pending_guess: { id: string; user_id: string; guess: string; attempt: number } | null
  own_secret: string | null
  results: RoundResult[]
  server_now: string
}
export interface BetRecord {
  id: string
  completed_at: string
  mode: Mode
  variant: Variant
  opponent_id: string
  opponent_name: string
  won: boolean
  draw: boolean
  bet: string
  your_score: number
  opponent_score: number
}
export interface SoloState {
  id: string
  mode: Mode
  challenge: SoloChallenge
  status: 'playing' | 'won' | 'lost' | 'abandoned'
  guesses: Guess[]
  started_at: string
  deadline: string | null
  finished_at: string | null
  max_guesses: number | null
  version: number
  secret: string | null
  server_now: string
}
export function displayItem(_mode: Mode, value: string) {
  return value
}
export function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  if (safe >= 3600) return `${Math.floor(safe / 3600)}:${Math.floor(safe % 3600 / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
}
export function validateEntry(mode: Mode, value: string): string | null {
  if (value.length !== MODES[mode].length) return `Enter exactly ${MODES[mode].length} ${mode === 'word' ? 'letters' : 'digits'}.`
  if (![...value].every(c => MODES[mode].keys.includes(c))) return 'That code contains an unavailable character.'
  return null
}

export function getFeedback(secret: string, guess: string): Mark[] {
  if (!secret.length || secret.length !== guess.length) throw new Error('The secret and guess must have the same nonzero length.')
  const remaining = new Map<string, number>()
  const marks: Mark[] = [...guess].map((item, i) => {
    if (item === secret[i]) return 'hit'
    remaining.set(secret[i], (remaining.get(secret[i]) ?? 0) + 1)
    return 'miss'
  })
  return marks.map((mark, i) => {
    if (mark === 'hit') return mark
    const copies = remaining.get(guess[i]) ?? 0
    if (!copies) return 'miss'
    remaining.set(guess[i], copies - 1)
    return 'present'
  })
}

export function getKeyboardMarks(guesses: Guess[]): Record<string, Mark> {
  const known = new Map<string, { copies: number; positions: Set<number> }>()
  for (const guess of guesses) {
    const matches = new Map<string, number>()
    for (const [index, char] of [...guess.guess].entries()) {
      let info = known.get(char)
      if (!info) {
        info = { copies: 0, positions: new Set<number>() }
        known.set(char, info)
      }
      const mark = guess.feedback[index]
      if (mark === 'hit') info.positions.add(index)
      if (mark === 'hit' || mark === 'present') matches.set(char, (matches.get(char) ?? 0) + 1)
    }
    for (const [char, copies] of matches) {
      const info = known.get(char)!
      info.copies = Math.max(info.copies, copies)
    }
  }
  return Object.fromEntries([...known].map(([char, info]) => [
    char, info.copies === 0 ? 'miss' : info.positions.size >= info.copies ? 'hit' : 'present',
  ]))
}

export function generateSecret(mode: Mode, words: string[]): string {
  if (mode === 'word' && words.length === 0) throw new Error('The dictionary is not ready yet. Try again in a moment.')
  const randomIndex = (length: number) => {
    const bytes = new Uint32Array(1)
    const limit = Math.floor(0x100000000 / length) * length
    do { crypto.getRandomValues(bytes) } while (bytes[0] >= limit)
    return bytes[0] % length
  }
  return mode === 'word' ? words[randomIndex(words.length)] :
    Array.from({ length: MODES.number.length }, () => String(randomIndex(10))).join('')
}
