import type { GameState } from './game'

export interface TurnAlert {
  key: string
  kind: 'guess' | 'clues'
  message: string
}

export function getTurnAlert(game: GameState, userId: string, started: boolean): TurnAlert | null {
  const { room, pending_guess: pending } = game
  if (room.variant !== 'turns' || room.status !== 'playing' || !started) return null
  const me = game.players.find(player => player.user_id === userId)
  if (!me) return null
  const prefix = `${room.id}.${room.match_number}.${room.round_number}`
  if (pending) {
    return pending.user_id === userId ? null : {
      key: `${prefix}.clues.${pending.id}`, kind: 'clues',
      message: 'Play your turn',
    }
  }
  return room.turn_user_id === userId ? {
    key: `${prefix}.guess.${game.players.map(player => `${player.user_id}:${player.attempts}`).sort().join('.')}`,
    kind: 'guess', message: 'Play your turn',
  } : null
}

export function shouldAnnounceTurn(previous: TurnAlert | null, next: TurnAlert | null) {
  return next !== null && previous?.key !== next.key && !(previous?.kind === 'clues' && next.kind === 'guess')
}
