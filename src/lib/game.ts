export type Mode = 'number' | 'word'
export type Variant = 'race' | 'turns'
export type Mark = 'hit' | 'present' | 'miss'
export type Stake = 'low' | 'high'
export type Phase = 'lobby' | 'setting' | 'playing' | 'round_over' | 'match_over'
export type SoloChallenge = 'attempts' | 'timed'
export type PartyKind = 'bingo' | 'cheat' | 'hangman'
export type SoloKind = 'code' | 'memory' | 'dots' | 'ring' | PartyKind
export const NO_BET = 'Just for fun - no bet.'
export const GAME_NAMES: Record<SoloKind, string> = {
  code: 'Crack the Code', memory: 'Memory Match', dots: 'Dots & Boxes', ring: 'Ring Rush',
  bingo: 'Bingo', cheat: 'Cheat', hangman: 'Hangman',
}
export const PARTY_GAMES = [
  { id: 'bingo', name: 'Bingo', detail: '25 numbers · five lines to win', rules: 'Different shuffled 5×5 boards. Take turns calling an uncalled number from 1 to 25; each call marks both boards. Complete five rows, columns or diagonals first. If both reach five on the same call, it is a draw.', solo: 'Easy calls randomly. Medium builds promising lines. Hard gives more weight to nearly completed lines. The computer uses only its own board and the public called numbers.' },
  { id: 'cheat', name: 'Cheat', detail: 'Hidden cards · call the bluff', rules: 'A 52-card deck, 26 cards each. Claims cycle Ace through King. Play 1–4 cards face down as the required rank; your opponent accepts or calls your bluff. A caught liar takes the pile; a wrong caller takes it. The responder leads the next rank. Empty your hand and survive the final challenge to win.', solo: 'The computer plays from its own hand and never inspects yours or face-down plays. Hard calls bluffs more often; all levels call claims made impossible by the cards in their own hand.' },
  { id: 'hangman', name: 'Hangman', detail: 'Secret words · alternating guesses', rules: 'Both players privately lock a 3–12-letter word and category, or request a random word. Then alternate guessing one letter in each other’s word, even after correct guesses. First to solve wins; six wrong letters loses. Pick a new theme or custom word in the next game.', solo: 'Easy guesses random letters and sets shorter words. Medium uses common-letter frequency. Hard considers the category and revealed pattern, never your secret word. Both players still alternate guesses.' },
] as const
export function isPartyKind(kind: string | undefined): kind is PartyKind {
  return kind === 'bingo' || kind === 'cheat' || kind === 'hangman'
}
export type Difficulty = 'easy' | 'medium' | 'hard'
export interface BoardController {
  userId: string
  clockOffset: number
  mutate: (name: string, args?: Record<string, unknown>) => Promise<boolean>
}
export interface BoardGame {
  room: { host_id: string }
  players: { user_id: string; name: string; avatar_url?: string | null }[]
}
export interface BoardOptions {
  tiles: 12 | 16 | 24
  theme: MemoryTheme
  dots: 10 | 12 | 15
}
export type SoloBoardState = {
  id: string
  difficulty: Difficulty
  status: 'playing' | 'finished' | 'abandoned'
  version: number
  server_now: string
  next_action_at: string | null
  computer_id: string
  move_accepted?: boolean
} & ({ kind: 'memory'; board: MemoryState } | { kind: 'dots'; board: DotsState } | { kind: 'ring'; board: RingState } |
  { kind: 'bingo'; board: BingoState } | { kind: 'cheat'; board: CheatState } | { kind: 'hangman'; board: HangmanState })
interface PartyBase {
  session_id: string
  moves: number
  turn_number: number
  turn_user: string | null
  finished: boolean
  winner_id: string | null
  finished_at: string | null
  a: string
  b: string
}
export interface BingoState extends PartyBase {
  kind: 'bingo'
  numbers: number[]
  called: number[]
  lines: Record<string, number>
}
export interface CheatState extends PartyBase {
  kind: 'cheat'
  cards: number[]
  hand_counts: Record<string, number>
  pile_count: number
  rank: number
  phase: 'play' | 'challenge'
  last_play: { player: string; count: number; rank: number } | null
  reveal: { cards: number[]; truthful: boolean; recipient: string } | null
}
export interface HangmanState extends PartyBase {
  kind: 'hangman'
  phase: 'setting' | 'guessing'
  ready: string[]
  own_word: string | null
  categories: Record<string, string>
  patterns: Record<string, string>
  misses: Record<string, number>
  guesses: Record<string, string[]>
  reveals?: Record<string, string>
}
export type PartyState = BingoState | CheatState | HangmanState
export interface RingState {
  session_id: string
  boards: Record<string, number[][]>
  moves: Record<string, number>
  resets: Record<string, number>
  progress: Record<string, number>
  started_at: string
  finished: boolean
  winner_id: string | null
  finished_at: string | null
}

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
  game_kind?: SoloKind
  duo_lobby?: boolean
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
  hub?: HubState
  memory?: MemoryState
  dots?: DotsState
  ring?: RingState
  party?: PartyState
  duo_bet?: { session_id: string; wagers: Record<string, string> }
}
export interface HubState {
  revision: number
  selected: SoloKind
  tiles: 12 | 16 | 24
  theme: MemoryTheme
  mode: Mode
  variant: Variant
  ready: string[]
  dots?: 10 | 12 | 15
  wagers?: Record<string, string>
}
export interface DotsState {
  session_id: string
  dots: 10 | 12 | 15
  edges: (string | null)[]
  boxes: (string | null)[]
  scores: Record<string, number>
  turn_user: string
  turn_number: number
  moves: number
  roll: number | null
  roll_user: string | null
  roll_number: number
  roll_until: string | null
  remaining: number
  finished: boolean
}
export type MemoryTheme = 'paintings' | 'florals' | 'animals' | 'patterns'
export interface MemoryState {
  session_id: string
  moves: number
  turn_number: number
  turn_user: string
  scores: Record<string, number>
  finished: boolean
  reveal_until: string | null
  theme: MemoryTheme
  cards: (number | null)[]
  matched: number[]
  owners?: Record<string, string>
}
interface BetRecordBase {
  id: string
  completed_at: string
  opponent_id: string
  opponent_name: string
  won: boolean
  draw: boolean
  bet: string
  your_score: number
  opponent_score: number
}
export type BetRecord = BetRecordBase & (
  { game_kind?: 'code'; mode: Mode; variant: Variant } |
  { game_kind: Exclude<SoloKind, 'code'>; mode: null; variant: null }
)
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
