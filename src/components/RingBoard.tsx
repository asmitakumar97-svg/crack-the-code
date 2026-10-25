import { useEffect, useState } from 'react'
import { RotateCcw, Timer, Trophy } from 'lucide-react'
import { formatTime, type BoardController, type BoardGame, type RingState } from '../lib/game'

const colours = ['Blue', 'Green', 'Pink', 'Yellow']

export function RingBoard({ controller, game, ring, disabled }: { controller: BoardController; game: BoardGame; ring: RingState; disabled: boolean }) {
  const [now, setNow] = useState(Date.now())
  const [selection, setSelection] = useState<{ rod: number; move: number } | null>(null)
  useEffect(() => {
    if (ring.finished) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [ring.finished])
  const me = controller.userId
  const rods = ring.boards[me]
  const opponent = game.players.find(player => player.user_id !== me)!
  const countdown = Math.max(0, Math.ceil((Date.parse(ring.started_at) - now - controller.clockOffset) / 1000))
  const elapsed = Math.max(0, ((ring.finished_at ? Date.parse(ring.finished_at) : now + controller.clockOffset) - Date.parse(ring.started_at)) / 1000)
  const source = !ring.finished && selection?.move === ring.moves[me] ? selection.rod : null
  const blocked = disabled || countdown > 0 || ring.finished
  const winner = game.players.find(player => player.user_id === ring.winner_id)
  const receive = (to: number) => source !== null && source !== to && rods[to].length < 5 &&
    (rods[to].length === 0 || rods[to].at(-1) === rods[source].at(-1))
  const choose = async (rod: number) => {
    if (source === rod) { setSelection(null); return }
    if (source === null) { setSelection({ rod, move: ring.moves[me] }); return }
    const accepted = await controller.mutate('move_ring', { p_session: ring.session_id, p_move: ring.moves[me], p_from: source, p_to: rod, p_reset: false })
    if (accepted) setSelection(null)
  }
  return <section className="panel ring-game">
    <span className="eyebrow">RING RUSH · 20 RINGS · 5 RODS</span>
    <h1 aria-live="polite">{ring.finished ? ring.winner_id === me ? 'You win!' : `${winner?.name} wins!` : countdown ? `Get ready: ${countdown}` : 'Sort your colours. Beat the clock.'}</h1>
    <div className="ring-race-stats">
      <span><Timer size={18} /><strong role="timer" aria-label="Race time">{formatTime(elapsed)}</strong></span>
      <span>{ring.moves[me] - ring.resets[me]} moves · {ring.resets[me]} restarts</span>
    </div>
    <div className="ring-progress" aria-label="Race progress">{game.players.map(player => <div key={player.user_id}>
      <strong>{ring.winner_id === player.user_id && <Trophy size={16} />}{player.user_id === me ? 'You' : player.name}</strong>
      <span>{ring.progress[player.user_id]} / 4 colours sorted</span>
      <span>{ring.moves[player.user_id] - ring.resets[player.user_id]} moves</span>
      <progress max={4} value={ring.progress[player.user_id]} aria-label={`${player.user_id === me ? 'Your' : player.name} sorting progress`} />
    </div>)}</div>
    <p id="ring-instructions">Move one top ring at a time onto an empty rod or the same colour. Each rod holds five. Sort all four colours to win.</p>
    <p className="ring-selection" role="status">{blocked ? ring.finished ? 'Race complete. Every move was checked by the server.' : countdown ? 'Both boards start together after the countdown.' : 'Saving your move…' : source === null ? 'Tap a rod to lift its top ring.' : `Ring lifted from rod ${source + 1}. Tap a highlighted rod, or tap rod ${source + 1} to cancel.`}</p>
    <div className="ring-rods" role="group" aria-label="Your ring rods" aria-describedby="ring-instructions">
      {rods.map((rod, index) => <button key={index} className={`ring-rod ${source === index ? 'selected' : ''} ${receive(index) ? 'can-receive' : ''}`} aria-label={`Rod ${index + 1}, ${rod.length} rings${rod.length ? `, top ${colours[rod.at(-1)!]}` : ', empty'}`} aria-description={`Bottom to top: ${rod.length ? rod.map(colour => colours[colour]).join(', ') : 'empty'}`} aria-pressed={source === index} disabled={blocked || (source === null ? rod.length === 0 : source !== index && !receive(index))} onClick={() => { void choose(index) }}>
        <span className="ring-pole" aria-hidden="true" />
        <span className="ring-stack" aria-hidden="true">{rod.map((colour, level) => <span key={level} className={`ring-piece ring-colour-${colour} ${source === index && level === rod.length - 1 ? 'lifted' : ''}`}><span>{String.fromCharCode(65 + colour)}</span></span>)}</span>
        <span className="ring-rod-label">{index + 1}<small>{rod.length}/5</small></span>
      </button>)}
    </div>
    <div className="ring-legend" aria-label="Ring colours">{colours.map((colour, index) => <span key={colour}><i className={`ring-colour-${index}`} aria-hidden="true">{String.fromCharCode(65 + index)}</i>{colour}</span>)}</div>
    {!ring.finished && <div className="ring-reset"><button className="button secondary" disabled={blocked} onClick={() => { void controller.mutate('move_ring', { p_session: ring.session_id, p_move: ring.moves[me], p_from: null, p_to: null, p_reset: true }) }}><RotateCcw size={16} />Restart my rings</button><small>Same puzzle. The timer and {opponent.name} keep going.</small></div>}
    {ring.finished && <p className="notice">{ring.winner_id === me ? 'All four colours sorted first.' : `${opponent.name} sorted all four colours first.`} Winning time: {formatTime(elapsed)}.</p>}
  </section>
}
