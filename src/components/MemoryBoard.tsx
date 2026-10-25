import { useEffect, useState } from 'react'
import { Check, Trophy } from 'lucide-react'
import type { BoardController, BoardGame, MemoryState } from '../lib/game'
import images from '../lib/memory-images.json'

export function MemoryBoard({ controller, game, memory, disabled }: { controller: BoardController; game: BoardGame; memory: MemoryState; disabled: boolean }) {
  const [now, setNow] = useState(Date.now())
  const [imageError, setImageError] = useState(false)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 150); return () => clearInterval(timer) }, [])
  const waiting = Boolean(memory.reveal_until && Date.parse(memory.reveal_until) > now + controller.clockOffset)
  const yourTurn = memory.turn_user === controller.userId
  const turnPlayer = game.players.find(player => player.user_id === memory.turn_user)!
  const highest = Math.max(...Object.values(memory.scores))
  const winners = game.players.filter(player => memory.scores[player.user_id] === highest)
  return <section className="panel memory-game">
    <span className="eyebrow">MEMORY MATCH · {memory.theme} · {memory.cards.length} TILES</span>
    <h1 aria-live="polite">{memory.finished ? winners.length === 2 ? 'A perfect tie.' : winners[0].name === 'You' ? 'You win!' : `${winners[0].name} wins!` : waiting ? 'Take a good look…' : yourTurn ? 'Your turn to flip.' : `${turnPlayer.name} is flipping.`}</h1>
    <div className="memory-scores">{game.players.map(player => <span key={player.user_id} className={player.user_id === memory.turn_user && !memory.finished ? 'active' : ''}>{memory.finished && winners.includes(player) && <Trophy size={16} />}{player.name}<strong>{memory.scores[player.user_id] ?? 0} pairs</strong></span>)}</div>
    <p id="memory-instructions">{memory.finished ? 'Every pair found. Ready for another game?' : 'Flip two cards. Matching pairs stay yours and earn another turn.'}</p>
    {imageError && <p className="field-error" role="alert">A picture could not load. Its artwork title is shown instead. Check your connection and reload to retry.</p>}
    <div className={`memory-board memory-board-${memory.cards.length}`} role="group" aria-label="Memory Match board" aria-describedby="memory-instructions">
      {memory.cards.map((storedCard, index) => {
        const card = memory.reveal_until && !waiting && !memory.matched.includes(index) ? null : storedCard
        const artwork = card === null ? null : images[memory.theme][card]
        const matched = memory.matched.includes(index)
        return <button key={`${memory.session_id}-${index}`} className={`memory-tile ${artwork ? 'face-up' : ''} ${matched ? 'matched' : ''}`} aria-label={`Card ${index + 1}${artwork ? `: ${artwork.title}${matched ? ', matched' : ''}` : ': face down'}`} disabled={disabled || waiting || !yourTurn || memory.finished || Boolean(artwork)} onClick={() => { void controller.mutate('flip_memory_card', { p_session: memory.session_id, p_move: memory.moves, p_index: index }) }}>
          {artwork ? <><img src={`${import.meta.env.BASE_URL}${artwork.path}`} alt="" onError={event => { event.currentTarget.style.display = 'none'; setImageError(true) }} /><span className="memory-art-title">{artwork.title}</span>{matched && <Check className="memory-match-check" size={20} />}</> : <><span className="memory-card-mark" aria-hidden="true">dd</span><small>{index + 1}</small></>}
        </button>
      })}
    </div>
    <details className="memory-credits"><summary>Picture credits · public-domain art</summary><p>Images from The Cleveland Museum of Art, released under CC0. Downloaded locally so gameplay doesn’t depend on an image service.</p><ul>{images[memory.theme].slice(0, memory.cards.length / 2).map(artwork => <li key={artwork.id}><a href={artwork.source} target="_blank" rel="noreferrer">{artwork.title}</a> · CC0</li>)}</ul></details>
  </section>
}
