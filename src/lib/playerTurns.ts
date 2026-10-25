import type { DotsState, GameState, MemoryState, PartyState, RingState } from './game'

export interface PlayerActivity {
  active: boolean
  label: string
}

export function getBoardActivity(board: MemoryState | DotsState | RingState | PartyState, player: string, now = Date.now()): PlayerActivity {
  if (board.finished) return { active: false, label: 'Game complete' }
  if ('boards' in board) return { active: true, label: Date.parse(board.started_at) > now ? 'Get ready' : 'Racing together' }
  if ('kind' in board && board.kind === 'hangman' && board.phase === 'setting') {
    return board.ready.includes(player) ? { active: false, label: 'Word locked' } : { active: true, label: 'Choose your word' }
  }
  if (board.turn_user !== player) return { active: false, label: 'Waiting' }
  if ('kind' in board) return { active: true, label: board.kind === 'bingo' ? 'Call a number' : board.kind === 'cheat' ? board.phase === 'challenge' ? 'Accept or call bluff' : 'Play your cards' : 'Guess a letter' }
  if ('remaining' in board) return { active: true, label: board.roll_until && Date.parse(board.roll_until) > now ? 'Rolling the dice' : board.remaining ? 'Draw your lines' : 'Roll the dice' }
  return { active: true, label: board.reveal_until && Date.parse(board.reveal_until) > now ? 'Up next' : 'Flip your tiles' }
}

export function getPlayerActivity(game: GameState, playerId: string, now = Date.parse(game.server_now)): PlayerActivity {
  if (game.room.duo_lobby) return { active: false, label: game.hub?.ready.includes(playerId) ? 'Ready' : 'Reviewing' }
  const board = game.memory ?? game.dots ?? game.ring ?? game.party
  if (board) return getBoardActivity(board, playerId, now)
  const player = game.players.find(value => value.user_id === playerId)
  if (!player) return { active: false, label: 'Waiting to join' }
  if (game.room.status === 'lobby' || game.room.status === 'setting') {
    if (!player.secret_ready) return { active: true, label: 'Choose your secret' }
    return { active: !player.ready, label: player.ready ? 'Ready' : 'Review the bets' }
  }
  if (game.room.status !== 'playing') return { active: false, label: game.room.status === 'match_over' ? 'Match complete' : 'Round complete' }
  if (game.room.started_at && Date.parse(game.room.started_at) > now) return { active: false, label: 'Get ready' }
  if (player.finished_at) return { active: false, label: 'Finished guessing' }
  if (game.room.variant === 'race') return { active: true, label: 'Guessing together' }
  if (game.pending_guess) return game.pending_guess.user_id !== playerId ? { active: true, label: 'Give your clues' } : { active: false, label: 'Waiting for clues' }
  return game.room.turn_user_id === playerId ? { active: true, label: 'Make your guess' } : { active: false, label: 'Waiting' }
}
