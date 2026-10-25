import type { GameState } from './game'

export interface TurnAlert {
  key: string
  kind: 'guess' | 'clues'
  message: string
}

export function getTurnAlert(game: GameState, userId: string, started: boolean): TurnAlert | null {
  const { room, pending_guess: pending } = game
  if (room.duo_lobby) return null
  if (room.game_kind === 'ring') return null
  if (game.party) {
    const party = game.party
    return !party.finished && party.turn_user === userId ? {
      key: `${room.id}.${party.kind}.${party.session_id}.${party.turn_number}`,
      kind: 'guess', message: 'Play your turn',
    } : null
  }
  if (room.game_kind === 'dots') {
    const dots = game.dots
    return dots && !dots.finished && dots.turn_user === userId ? {
      key: `${room.id}.dots.${dots.session_id}.${dots.turn_number}`,
      kind: 'guess', message: 'Play your turn',
    } : null
  }
  if (room.game_kind === 'memory') {
    const memory = game.memory
    return memory && !memory.finished && memory.turn_user === userId ? {
      key: `${room.id}.memory.${memory.session_id}.${memory.turn_number}`,
      kind: 'guess', message: 'Play your turn',
    } : null
  }
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
