import { useEffect, useState } from 'react'
import { Dices, Minus, Plus, Trophy } from 'lucide-react'
import type { BoardController, BoardGame, DotsState } from '../lib/game'
import { getBoardActivity } from '../lib/playerTurns'
import { TurnAvatar } from './TurnAvatar'

export function DotsBoard({ controller, game, dots, disabled }: { controller: BoardController; game: BoardGame; dots: DotsState; disabled: boolean }) {
  const [now, setNow] = useState(Date.now())
  const [spacing, setSpacing] = useState(44)
  const serverNow = now + controller.clockOffset
  const rolling = Boolean(dots.roll_until && Date.parse(dots.roll_until) > serverNow)
  useEffect(() => {
    if (!rolling) return
    const timer = setInterval(() => setNow(Date.now()), 80)
    return () => clearInterval(timer)
  }, [rolling])
  const yourTurn = dots.turn_user === controller.userId
  const turnPlayer = game.players.find(player => player.user_id === dots.turn_user)!
  const roller = game.players.find(player => player.user_id === dots.roll_user)
  const shownRoll = rolling ? 1 + Math.floor(serverNow / 80) % 8 : dots.roll
  const highest = Math.max(...Object.values(dots.scores))
  const winners = game.players.filter(player => dots.scores[player.user_id] === highest)
  const canDraw = yourTurn && dots.remaining > 0 && !rolling && !disabled && !dots.finished
  const totalEdges = dots.edges.length
  const filled = dots.edges.filter(Boolean).length
  const colour = (id: string | null) => id === game.room.host_id ? 'dots-player-a' : 'dots-player-b'
  const draw = (edge: number) => { void controller.mutate('draw_dots_line', { p_session: dots.session_id, p_move: dots.moves, p_edge: edge }) }
  const size = 48 + (dots.dots - 1) * spacing
  const horizontalCount = dots.dots * (dots.dots - 1)
  return <section className="panel dots-game">
    <span className="eyebrow">DOTS &amp; BOXES · {dots.dots} × {dots.dots} DOTS · D8 EDITION</span>
    <h1 aria-live="polite">{dots.finished ? winners.length === 2 ? 'A brilliant tie.' : winners[0].name === 'You' ? 'You win!' : `${winners[0].name} wins!` : rolling ? roller?.name === 'You' ? 'You are rolling…' : `${roller?.name} is rolling…` : yourTurn ? dots.remaining ? 'Make your lines count.' : 'Your turn to roll.' : `${turnPlayer.name}’s turn.`}</h1>
    <div className="memory-scores dots-scores">{game.players.map(player => <span key={player.user_id} className={`${colour(player.user_id)} ${player.user_id === dots.turn_user && !dots.finished ? 'active' : ''}`}>
      <TurnAvatar player={player} host={player.user_id === game.room.host_id} activity={getBoardActivity(dots, player.user_id, serverNow)} />
      {dots.finished && winners.includes(player) && <Trophy size={16} />}<span className="dots-player-key" aria-hidden="true">{player.user_id === game.room.host_id ? 'A' : 'B'}</span>{player.name}<strong>{dots.scores[player.user_id]} boxes</strong>
    </span>)}</div>
    <div className="dots-roll-panel">
      <div className={`dots-die ${rolling ? 'rolling' : ''}`} aria-hidden="true">
        <svg viewBox="0 0 100 110"><path d="M50 3 94 34 86 82 50 107 14 82 6 34Z" /><path d="m50 3 36 79H14Zm0 104L6 34h88Z" /><text x="50" y="63">{shownRoll ?? '8'}</text></svg>
      </div>
      <div className="dots-roll-copy">
        <strong role="status">{rolling ? 'Rolling the eight-sided dice…' : dots.roll ? `${roller?.name} rolled ${dots.roll}` : 'One roll. Up to eight lines.'}</strong>
        <p aria-live="polite">{dots.finished ? 'All boxes claimed.' : rolling ? 'Both players see the same roll.' : dots.remaining ? `${dots.remaining} ${dots.remaining === 1 ? 'line' : 'lines'} left for ${turnPlayer.name}.` : 'Roll once, draw your lines, then pass.'}</p>
        <button className="button primary" disabled={disabled || !yourTurn || dots.remaining > 0 || rolling || dots.finished} onClick={() => { void controller.mutate('roll_dots_dice', { p_session: dots.session_id, p_move: dots.moves }) }}><Dices size={18} />Roll D8</button>
      </div>
    </div>
    <p id="dots-instructions">Tap a gap between two neighbouring dots to draw a line. The fourth side claims the box. Boxes earn points, not extra rolls.</p>
    <div className="dots-board-toolbar">
      <span>{filled} / {totalEdges} lines</span>
      <div role="group" aria-label="Board zoom">
        <button aria-label="Zoom out board" disabled={spacing <= 32} onClick={() => setSpacing(value => Math.max(32, value - 12))}><Minus size={16} /></button>
        <span>{Math.round(spacing / 44 * 100)}%</span>
        <button aria-label="Zoom in board" disabled={spacing >= 80} onClick={() => setSpacing(value => Math.min(80, value + 12))}><Plus size={16} /></button>
      </div>
    </div>
    <small>Scroll the board sideways or down to reach every dot. Zoom in for bigger targets.</small>
    <div className="dots-board-scroll" tabIndex={0} role="region" aria-label="Scrollable Dots & Boxes board" aria-describedby="dots-instructions">
      <div className="dots-grid" style={{ width: size, height: size }} role="group" aria-label="Dots & Boxes lines">
        {dots.boxes.map((owner, index) => owner && <span key={`box-${index}`} role="img" aria-label={`Box ${index + 1} claimed by ${game.players.find(player => player.user_id === owner)!.name}`} className={`dots-box ${colour(owner)}`} style={{ left: 24 + index % (dots.dots - 1) * spacing, top: 24 + Math.floor(index / (dots.dots - 1)) * spacing, width: spacing, height: spacing }}>{owner === game.room.host_id ? 'A' : 'B'}</span>)}
        {dots.edges.map((owner, index) => {
          const horizontal = index < horizontalCount
          const offset = horizontal ? index : index - horizontalCount
          const row = Math.floor(offset / (horizontal ? dots.dots - 1 : dots.dots))
          const col = offset % (horizontal ? dots.dots - 1 : dots.dots)
          return <button key={`${dots.session_id}-${index}`} aria-label={`${horizontal ? 'Horizontal' : 'Vertical'} line row ${row + 1} column ${col + 1}${owner ? `, drawn by ${game.players.find(player => player.user_id === owner)!.name}` : ''}`} className={`dots-edge ${horizontal ? 'horizontal' : 'vertical'} ${owner ? `drawn ${colour(owner)}` : ''}`} disabled={!canDraw || Boolean(owner)} onClick={() => draw(index)} style={{ left: 24 + col * spacing + (horizontal ? 6 : -12), top: 24 + row * spacing + (horizontal ? -12 : 6), width: horizontal ? spacing - 12 : 24, height: horizontal ? 24 : spacing - 12 }} />
        })}
        {Array.from({ length: dots.dots ** 2 }, (_, index) => <span key={`dot-${index}`} className="dots-dot" aria-hidden="true" style={{ left: 24 + index % dots.dots * spacing, top: 24 + Math.floor(index / dots.dots) * spacing }} />)}
      </div>
    </div>
  </section>
}
