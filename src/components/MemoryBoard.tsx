import { useEffect, useState } from 'react'
import { Check, ImageOff, Trophy } from 'lucide-react'
import type { BoardController, BoardGame, MemoryState } from '../lib/game'
import images from '../lib/memory-images.json'
import { PlayerAvatar } from './PlayerAvatar'

export function MemoryBoard({ controller, game, memory, disabled }: { controller: BoardController; game: BoardGame; memory: MemoryState; disabled: boolean }) {
  const [now, setNow] = useState(Date.now())
  const [failedPictures, setFailedPictures] = useState<Set<string>>(() => new Set())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 150); return () => clearInterval(timer) }, [])
  const waiting = Boolean(memory.reveal_until && Date.parse(memory.reveal_until) > now + controller.clockOffset)
  const yourTurn = memory.turn_user === controller.userId
  const turnPlayer = game.players.find(player => player.user_id === memory.turn_user)!
  const highest = Math.max(...Object.values(memory.scores))
  const winners = game.players.filter(player => memory.scores[player.user_id] === highest)
  const playerColour = (id: string | undefined) => id ? id === game.room.host_id ? 'memory-mint' : 'memory-amber' : ''
  return <section className="panel memory-game">
    <span className="eyebrow">MEMORY MATCH · {memory.theme} · {memory.cards.length} TILES</span>
    <h1 aria-live="polite">{memory.finished ? winners.length === 2 ? 'A perfect tie.' : winners[0].name === 'You' ? 'You win!' : `${winners[0].name} wins!` : waiting ? 'Take a good look…' : yourTurn ? 'Your turn to flip.' : `${turnPlayer.name} is flipping.`}</h1>
    <div className="memory-scores" aria-label="Players and current turn">{game.players.map(player => {
      const active = player.user_id === memory.turn_user && !memory.finished
      return <div key={player.user_id} className={`memory-player ${playerColour(player.user_id)} ${active ? 'active' : ''}`} aria-current={active ? 'true' : undefined}>
        <PlayerAvatar identity={player.user_id} name={player.name} photoUrl={player.avatar_url} />
        <strong>{player.name}{player.user_id === controller.userId && player.name !== 'You' ? ' · you' : ''}</strong>
        <span>{memory.scores[player.user_id] ?? 0} pairs</span>
        <small>{memory.finished ? winners.includes(player) ? <><Trophy size={14} />Winner</> : 'Game complete' : active ? waiting ? 'Up next' : 'Flipping now' : 'Waiting'}</small>
      </div>
    })}</div>
    <p id="memory-instructions">{memory.finished ? 'Every pair found. Ready for another game?' : 'Flip two cards. Matching pairs stay yours and earn another turn.'}</p>
    {failedPictures.size > 0 && <p className="field-error" role="alert">A picture could not load. Check your connection and reload to retry.</p>}
    <div className={`memory-board memory-board-${memory.cards.length}`} role="group" aria-label="Memory Match board" aria-describedby="memory-instructions">
      {memory.cards.map((storedCard, index) => {
        const card = memory.reveal_until && !waiting && !memory.matched.includes(index) ? null : storedCard
        const artwork = card === null ? null : images[memory.theme][card]
        const matched = memory.matched.includes(index)
        const owner = artwork ? game.players.find(player => player.user_id === memory.owners?.[index]) : undefined
        return <button key={`${memory.session_id}-${index}`} className={`memory-tile ${artwork ? 'face-up' : ''} ${matched ? 'matched' : ''} ${playerColour(owner?.user_id)}`} aria-label={`Card ${index + 1}${artwork ? `: ${artwork.title}${matched ? ', matched' : ''}${owner ? `, ${matched ? 'pair won' : 'flipped'} by ${owner.name}` : ''}` : ': face down'}`} disabled={disabled || waiting || !yourTurn || memory.finished || Boolean(artwork)} onClick={() => { void controller.mutate('flip_memory_card', { p_session: memory.session_id, p_move: memory.moves, p_index: index }) }}>
          {artwork ? <>{failedPictures.has(artwork.path) ? <ImageOff className="memory-image-error" size={32} aria-hidden="true" /> : <img src={`${import.meta.env.BASE_URL}${artwork.path}`} alt="" onError={() => setFailedPictures(previous => new Set(previous).add(artwork.path))} />}{matched && <Check className="memory-match-check" size={20} />}</> : <span className="memory-card-mark" aria-hidden="true" />}
        </button>
      })}
    </div>
    <details className="memory-credits"><summary>Picture credits · public-domain art</summary><p>Images from The Cleveland Museum of Art, released under CC0. Downloaded locally so gameplay doesn’t depend on an image service.</p><ul>{images[memory.theme].slice(0, memory.cards.length / 2).map(artwork => <li key={artwork.id}><a href={artwork.source} target="_blank" rel="noreferrer">{artwork.title}</a> · CC0</li>)}</ul></details>
  </section>
}
