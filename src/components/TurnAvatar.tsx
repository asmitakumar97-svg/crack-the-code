import type { BoardGame } from '../lib/game'
import type { PlayerActivity } from '../lib/playerTurns'
import { PlayerAvatar } from './PlayerAvatar'

export function TurnAvatar({ player, host, activity, online }: {
  player: BoardGame['players'][number]
  host: boolean
  activity: PlayerActivity
  online?: boolean
}) {
  return <span className={`turn-character ${host ? 'turn-mint' : 'turn-amber'} ${activity.active ? 'active' : ''}`} aria-current={activity.active ? 'true' : undefined}>
    <span className="avatar"><PlayerAvatar identity={player.user_id} name={player.name} photoUrl={player.avatar_url} />{online !== undefined && <i className={`status-dot ${online ? '' : 'offline-dot'}`} />}</span>
    <small className="turn-character-label">{activity.label}</small>
  </span>
}
