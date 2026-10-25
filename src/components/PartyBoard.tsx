import { useState } from 'react'
import { Check, EyeOff, Trophy } from 'lucide-react'
import { PARTY_GAMES, type BoardController, type BoardGame, type PartyState } from '../lib/game'
import { getBoardActivity } from '../lib/playerTurns'
import { TurnAvatar } from './TurnAvatar'

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const suits = ['♠', '♥', '♦', '♣']
const suitNames = ['spades', 'hearts', 'diamonds', 'clubs']
const categories = ['animals', 'food', 'places', 'nature']
const bingoGroups = Array.from({ length: 12 }, (_, line) => Array.from({ length: 5 }, (_, cell) =>
  line < 5 ? line * 5 + cell : line < 10 ? cell * 5 + line - 5 : line === 10 ? cell * 6 : 4 + cell * 4))

function PlayingCard({ card }: { card: number }) {
  return <span className={`playing-card ${Math.floor(card / 13) === 1 || Math.floor(card / 13) === 2 ? 'red' : ''}`}><strong>{ranks[card % 13]}</strong><span aria-hidden="true">{suits[Math.floor(card / 13)]}</span></span>
}

function HangmanDrawing({ misses }: { misses: number }) {
  const parts = [
    <circle key="head" className="hangman-part" cx="130" cy="52" r="14" />,
    <path key="body" className="hangman-part" d="M130 66V110" />,
    <path key="left-arm" className="hangman-part" d="M130 80 106 96" />,
    <path key="right-arm" className="hangman-part" d="m130 80 24 16" />,
    <path key="left-leg" className="hangman-part" d="m130 110-20 30" />,
    <path key="right-leg" className="hangman-part" d="m130 110 20 30" />,
  ]
  return <figure className="hangman-drawing">
    <svg viewBox="0 0 200 180" role="img" aria-label={`Hangman: ${misses} of 6 wrong guesses`} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path className="hangman-scaffold" d="M22 162H178M50 162V16H130V38M50 42 76 16" />
      {parts.slice(0, misses)}
    </svg>
    <figcaption>Your guesses · {misses} / 6 wrong</figcaption>
  </figure>
}

export function PartyBoard({ controller, game, party, disabled }: { controller: BoardController; game: BoardGame; party: PartyState; disabled: boolean }) {
  const me = controller.userId
  const opponent = game.players.find(player => player.user_id !== me)!
  const myTurn = party.turn_user === me && !party.finished
  const blocked = disabled || party.finished
  const definition = PARTY_GAMES.find(entry => entry.id === party.kind)!
  const [selection, setSelection] = useState<{ move: number; cards: number[] } | null>(null)
  const selected = selection?.move === party.moves ? selection.cards : []
  const [category, setCategory] = useState('animals')
  const [word, setWord] = useState('')
  const act = (action: string, data: Record<string, unknown>) => controller.mutate('play_party', {
    p_session: party.session_id, p_move: party.moves, p_action: action, p_data: data,
  })
  const winner = game.players.find(player => player.user_id === party.winner_id)
  const title = party.finished ? !party.winner_id ? 'A perfect tie.' : party.winner_id === me ? 'You win!' : `${winner?.name} wins!` :
    party.kind === 'hangman' && party.phase === 'setting' ? 'Lock your secret word.' : myTurn ? 'Your turn.' : `${opponent.name} is playing.`
  return <section className={`panel party-game party-${party.kind}`}>
    <span className="eyebrow">{definition.name.toUpperCase()} · {definition.detail}</span>
    <h1 aria-live="polite">{title}</h1>
    <details className="party-rules"><summary>How to play {definition.name}</summary><p>{definition.rules}</p></details>
    <div className="party-scores">{game.players.map(player => <div className={getBoardActivity(party, player.user_id).active ? 'active' : ''} key={player.user_id}>
      <TurnAvatar player={player} host={player.user_id === game.room.host_id} activity={getBoardActivity(party, player.user_id)} />
      <strong>{party.winner_id === player.user_id && <Trophy size={16} />}{player.user_id === me ? 'You' : player.name}</strong>
      <span>{party.kind === 'bingo' ? `${Math.min(5, party.lines[player.user_id])} / 5 lines` : party.kind === 'cheat' ? `${party.hand_counts[player.user_id]} cards` : `${6 - party.misses[player.user_id]} / 6 chances left`}</span>
      {party.kind === 'bingo' && <div className="bingo-word" role="group" aria-label={`${player.name}: ${Math.min(5, party.lines[player.user_id])} of five Bingo lines`}>{[...'BINGO'].map((letter, index) => <span key={letter} className={party.lines[player.user_id] > index ? 'complete' : ''} aria-label={`${letter}${party.lines[player.user_id] > index ? ', crossed out' : ', not crossed out'}`}>{letter}</span>)}</div>}
    </div>)}</div>
    {party.kind === 'bingo' && <>
      {party.finished && party.winner_id && <p className="bingo-celebration" role="status">BINGO! {party.winner_id === me ? 'You completed' : `${winner?.name} completed`} five lines.</p>}
      {party.finished && !party.winner_id && <p className="bingo-celebration" role="status">BINGO! Both players completed five lines.</p>}
      <p id="bingo-instructions">{myTurn ? 'Choose an uncalled number. It will be marked on both boards.' : 'Your board marks automatically when a number is called.'}</p>
      <div className="bingo-board" role="group" aria-label="Your Bingo board" aria-describedby="bingo-instructions">{party.numbers.map((number, index) => {
        const marked = party.called.includes(number)
        const line = bingoGroups.some(group => group.includes(index) && group.every(cell => party.called.includes(party.numbers[cell])))
        return <button key={number} className={`${marked ? 'marked' : ''} ${line ? 'completed-line' : ''}`} aria-label={`Number ${number}${marked ? ', called' : ''}`} disabled={blocked || !myTurn || marked} onClick={() => { void act('call', { number }) }}>{number}{marked && <Check size={12} aria-hidden="true" />}</button>
      })}</div>
      <p className="party-call-log" aria-live="polite">Called: {party.called.length ? party.called.join(' · ') : 'No numbers yet.'}</p>
    </>}
    {party.kind === 'cheat' && <>
      <div className="cheat-table"><span className="eyebrow">NEXT CLAIM: {ranks[party.rank - 1]}</span><p>{party.pile_count} cards in the face-down pile</p>
        {party.phase === 'challenge' && party.last_play && <><div className="cheat-backs" aria-hidden="true">{Array.from({ length: party.last_play.count }, (_, index) => <span key={index}><EyeOff size={23} />dd</span>)}</div><p>{party.last_play.player === me ? 'You claim' : `${opponent.name} claims`} {party.last_play.count} × {ranks[party.last_play.rank - 1]}.</p><div className="party-actions"><button className="button primary" disabled={blocked || !myTurn} onClick={() => { void act('accept', {}) }}>Accept</button><button className="button secondary" disabled={blocked || !myTurn} onClick={() => { void act('challenge', {}) }}>Call bluff</button></div></>}
        {party.reveal && <div className="party-reveal" key={`${party.session_id}-${party.moves}`} role="status"><strong>{party.reveal.truthful ? 'It was the truth!' : 'Bluff caught!'}</strong><div className="cheat-revealed">{party.reveal.cards.map(card => <PlayingCard key={card} card={card} />)}</div><p>{party.reveal.recipient === me ? 'You take' : `${opponent.name} takes`} the pile.</p></div>}
      </div>
      <h2>Your private hand</h2><p>Select one to four cards. Their faces stay hidden unless the play is challenged.</p>
      <div className="cheat-hand" role="group" aria-label="Your cards">{[...party.cards].sort((a, b) => a % 13 - b % 13 || a - b).map(card => <button key={card} aria-label={`${ranks[card % 13]} of ${suitNames[Math.floor(card / 13)]}`} aria-pressed={selected.includes(card)} disabled={blocked || !myTurn || party.phase !== 'play' || selected.length === 4 && !selected.includes(card)} onClick={() => setSelection({ move: party.moves, cards: selected.includes(card) ? selected.filter(value => value !== card) : [...selected, card] })}><PlayingCard card={card} /></button>)}</div>
      {party.phase === 'play' && <button className="button primary full" disabled={blocked || !myTurn || selected.length === 0} onClick={() => { void act('play', { cards: selected }) }}>Play {selected.length || '1–4'} cards as {ranks[party.rank - 1]}</button>}
    </>}
    {party.kind === 'hangman' && (party.phase === 'setting' ? party.ready.includes(me) ? <p className="notice" role="status">Your word is locked. Waiting for {opponent.name}.</p> : <form className="hangman-setting" onSubmit={event => { event.preventDefault(); void act('secret', { category, word }) }}>
      <label htmlFor="hangman-category">Word category</label><select id="hangman-category" disabled={blocked} value={category} onChange={event => setCategory(event.target.value)}>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <label htmlFor="hangman-word">Your secret word · 3–12 letters</label><input id="hangman-word" type="text" autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} minLength={3} maxLength={12} pattern="[A-Za-z]{3,12}" required disabled={blocked} value={word} onChange={event => setWord(event.target.value.toUpperCase())} />
      <div className="party-actions"><button className="button primary" disabled={blocked}>Lock my word</button><button type="button" className="button secondary" disabled={blocked} onClick={() => { void act('secret', { category, word: null }) }}>Pick a word for me</button></div>
      <p>You can see your word while typing. Your opponent cannot see it until the duel ends. Both players guess on alternating turns.</p>
    </form> : <>
      <HangmanDrawing misses={party.misses[me]} />
      <span className="eyebrow">YOUR WORD TO SOLVE · {party.categories[opponent.user_id]}</span>
      <div className="hangman-pattern" role="group" aria-label={`Your word to solve: ${[...party.patterns[me]].join(' ')}`}>{[...party.patterns[me]].map((letter, index) => <span key={index}>{letter === '_' ? '' : letter}</span>)}</div>
      <div className="hangman-chances" aria-label={`${6 - party.misses[me]} chances remaining`}>{Array.from({ length: 6 }, (_, index) => <span className={index < 6 - party.misses[me] ? 'remaining' : ''} key={index} aria-hidden="true" />)}</div>
      <div className="hangman-keyboard" role="group" aria-label="Guess a letter">{[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => <button key={letter} className={party.guesses[me].includes(letter) ? party.patterns[me].includes(letter) ? 'hit' : 'miss' : ''} disabled={blocked || !myTurn || party.guesses[me].includes(letter)} onClick={() => { void act('guess', { letter }) }}>{letter}</button>)}</div>
      <p className="party-call-log">{opponent.name}’s progress: {[...party.patterns[opponent.user_id]].join(' ')}</p>
      {party.finished && party.reveals && <div className="party-reveal" role="status">{game.players.map(player => <p key={player.user_id}>{player.user_id === me ? 'Your secret' : `${player.name}’s secret`}: <strong>{party.reveals![player.user_id]}</strong></p>)}</div>}
    </>)}
  </section>
}
