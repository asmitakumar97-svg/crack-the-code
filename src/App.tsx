import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCheck, CircleHelp, Clock3, CodeXml, Copy, Flame, Leaf, LoaderCircle, LockKeyhole, Repeat2, Trophy, Users, WifiOff, X } from 'lucide-react'
import { useGame } from './hooks/useGame'
import { formatTime, MODES, type GameState, type Mark, type Mode, type Player, type Variant } from './lib/game'
import { CLUES, Legend, Tiles } from './components/Tiles'
import { CodeEntry } from './components/CodeEntry'
import { ScreenSteps, SetupFlow } from './components/SetupFlow'
import { localPlay } from './lib/supabase'

type Controller = ReturnType<typeof useGame>

export default function App() {
  const controller = useGame()
  const [help, setHelp] = useState(false)
  const [homeMode, setHomeMode] = useState<Mode>('number')
  const [homeVariant, setHomeVariant] = useState<Variant>('race')
  const { roomId, game, loading, error, syncError } = controller
  return <div className="app-shell">
    <header className="site-header"><div className="brand"><span className="brand-icon"><CodeXml size={23} /></span><span>crack<span className="brand-light">the</span>code<span className="mint">.</span></span></div><button className="icon-button" aria-label="How to play" onClick={() => setHelp(true)}><CircleHelp size={20} /></button></header>
    <main>
      {localPlay && <div className="local-play-notice" role="status"><strong>Local multiplayer</strong><span>Player 2: open this address in a private browser window. Updates every second.</span></div>}
      {(error || syncError) && <div className="error-banner" role="alert"><span>{error || syncError}</span>{error && <button className="icon-button" aria-label="Dismiss error" onClick={controller.dismissError}><X size={17} /></button>}</div>}
      {!roomId ? <SetupFlow controller={controller} mode={homeMode} setMode={setHomeMode} variant={homeVariant} setVariant={setHomeVariant} /> : !game ? <section className="panel loading-panel">{loading ? <LoaderCircle className="spin mint" size={28} /> : <WifiOff size={28} />}<h1>{loading ? 'Opening your room…' : 'Couldn’t connect'}</h1><button className="button secondary" onClick={controller.home}>Back</button></section> : <Game controller={controller} game={game} onHelp={() => setHelp(true)} />}
    </main>
    {help && <Rules mode={game?.room.mode ?? homeMode} turns={(game?.room.variant ?? homeVariant) === 'turns'} onClose={() => setHelp(false)} />}
  </div>
}

function Game({ controller, game, onHelp }: { controller: Controller; game: GameState; onHelp: () => void }) {
  const { room, players } = game
  const me = players.find(player => player.user_id === controller.userId)!
  const opponent = players.find(player => player.user_id !== controller.userId)
  const [now, setNow] = useState(Date.now())
  const [leave, setLeave] = useState(false)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer) }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [room.status, room.round_number])
  const serverNow = now + controller.clockOffset
  const countdown = room.started_at ? Math.max(0, Math.ceil((Date.parse(room.started_at) - serverNow) / 1000)) : 0
  const elapsed = room.started_at ? Math.max(0, (serverNow - Date.parse(room.started_at)) / 1000) : 0
  const opponentOnline = opponent && serverNow - Date.parse(opponent.last_seen) < 20000
  const preparing = room.status === 'lobby' || room.status === 'setting'
  return <section className="game-shell"><ScreenSteps current={preparing ? 3 : 4} />
    <div className="game-nav"><button className="icon-button" aria-label="Go home" onClick={() => setLeave(true)}><ArrowLeft size={19} /></button><span>{MODES[room.mode].name} · {room.variant === 'race' ? 'Live race' : 'Take turns'}</span><RoomCode code={room.code} /></div>
    <div className="scoreboard"><PlayerBadge player={me} you online={controller.connection !== 'offline'} /><div className="score-center"><div><strong>{me.score}</strong><span>:</span><strong>{opponent?.score ?? 0}</strong></div><small>{room.status === 'lobby' ? 'BEST OF THREE' : `ROUND ${room.round_number} / 3`}</small></div>{opponent ? <PlayerBadge player={opponent} online={Boolean(opponentOnline)} /> : <div className="player-badge"><span className="avatar empty"><Users size={21} /></span><strong>Waiting…</strong></div>}</div>
    {controller.connection === 'offline' && <div className="notice"><WifiOff size={16} />You’re offline. Reconnecting…</div>}
    {opponent && !opponentOnline && <div className="notice"><WifiOff size={16} />{opponent.name} is reconnecting.</div>}
    {preparing ? <RoomStage key={`${room.match_number}-${room.round_number}`} controller={controller} game={game} me={me} opponent={opponent} /> :
      room.status === 'playing' ? countdown > 0 ? <section className="panel countdown-screen" aria-live="polite"><span className="eyebrow">THE HOST STARTED THE ROUND</span><h1>Get ready.</h1><strong className="countdown-number" key={countdown}>{countdown}</strong><p>You both start together.</p><OwnSecret game={game} /></section> : <Arena key={`${room.match_number}-${room.round_number}`} controller={controller} game={game} me={me} opponent={opponent!} elapsed={elapsed} onHelp={onHelp} /> :
        <Results game={game} me={me} opponent={opponent!} controller={controller} />}
    {leave && <Modal title="Leave the table?" onClose={() => setLeave(false)}><p>Your match stays saved. Rejoin with this browser and the room code.</p><div className="modal-actions"><button className="button secondary" onClick={() => setLeave(false)}>Stay</button><button className="button primary" onClick={controller.home}>Home</button></div></Modal>}
  </section>
}

function RoomStage({ controller, game, me, opponent }: { controller: Controller; game: GameState; me: Player; opponent?: Player }) {
  const { room } = game
  const [task, setTask] = useState<'bet' | 'secret'>(me.wager ? 'secret' : 'bet')
  const [wager, setWager] = useState(me.wager)
  const host = room.host_id === me.user_id
  const bothBets = Boolean(me.wager && opponent?.wager)
  const dirtyBet = task === 'bet' && wager.trim() !== me.wager
  const startable = Boolean(bothBets && me.secret_ready && opponent?.secret_ready && opponent.ready && !dirtyBet)
  return <section className="panel room-stage">
    <div className="room-stage-heading"><h1>{room.status === 'setting' ? `Set up round ${room.round_number}.` : 'Your private room.'}</h1><span className="stake-badge">{room.stake === 'high' ? <Flame size={14} /> : <Leaf size={14} />}{room.stake === 'high' ? 'High stakes' : 'Low stakes'}</span></div>
    {!opponent && <div className="share-strip"><span>Invite your friend</span><RoomCode code={room.code} large /><InviteButton code={room.code} /></div>}
    {room.status === 'lobby' && <div className="room-task-tabs" role="tablist" aria-label="Room setup"><button role="tab" aria-selected={task === 'bet'} className={task === 'bet' ? 'active' : ''} onClick={() => setTask('bet')}>The bets {bothBets && <Check size={13} />}</button><button role="tab" aria-selected={task === 'secret'} className={task === 'secret' ? 'active' : ''} onClick={() => setTask('secret')}>My secret {me.secret_ready && <Check size={13} />}</button></div>}
    {task === 'bet' && room.status === 'lobby' ? <div className="room-bet-editor"><label htmlFor="room-wager">If you win the match…</label><textarea id="room-wager" aria-label="Your bet" rows={2} maxLength={120} value={wager} onChange={e => setWager(e.target.value)} placeholder={room.stake === 'high' ? 'You plan our next adventure.' : 'You make me a coffee.'} /><button className="button secondary full" disabled={controller.busy || !wager.trim()} onClick={() => {
      void controller.mutate('set_wager', { p_wager: wager.trim() }).then(ok => { if (ok) setTask('secret') })
    }}>Save bet & choose secret <ArrowRight size={16} /></button></div> : me.secret_ready ? <div className="room-secret-locked"><LockKeyhole size={23} className="mint" /><h2>Your secret is locked.</h2><Tiles mode={room.mode} value={game.own_secret ?? ''} length={4} /></div> : <div className="room-secret-entry"><p>{MODES[room.mode].description}</p><CodeEntry mode={room.mode} secret words={controller.words} busy={controller.busy || controller.connection === 'offline'} onSubmit={code => controller.mutate('set_secret', { p_code: code })} /></div>}
    {(me.secret_ready || task === 'bet') && <div className="agreed-bets" aria-label="Match bets"><div><span>If you win</span><strong>{me.wager || 'Write your bet'}</strong></div><div><span>If {opponent?.name ?? 'your friend'} wins</span><strong>{opponent?.wager || (opponent ? 'They’re writing their bet…' : 'Waiting for your friend…')}</strong></div></div>}
    {me.secret_ready && <>{host ? <button className="button primary full" disabled={controller.busy || !startable} onClick={() => { void controller.mutate('start_round') }}>Agree & start {room.status === 'lobby' ? 'game' : 'round'} <ArrowRight size={18} /></button> : <button className={`button ${me.ready ? 'secondary' : 'primary'} full`} disabled={controller.busy || !bothBets || dirtyBet} onClick={() => { void controller.mutate('set_ready', { p_ready: !me.ready }) }}>{me.ready ? <Check size={18} /> : null}{me.ready ? 'Ready · waiting for the host' : 'Agree to bets & ready'}</button>}
    <p className="room-ready-note">{host ? startable ? 'Both secrets are locked. You can start.' : !opponent ? 'The game starts when your friend is ready.' : !opponent.secret_ready ? `${opponent.name} is choosing a secret.` : `Waiting for ${opponent.name} to get ready.` : 'Only the room creator can start the round.'}</p></>}
  </section>
}

function PlayerBadge({ player, you = false, online }: { player: Player; you?: boolean; online: boolean }) {
  return <div className="player-badge"><span className={`avatar ${you ? '' : 'opponent-avatar'}`}>{player.name.slice(0, 1).toUpperCase()}<i className={`status-dot ${online ? '' : 'offline-dot'}`} /></span><strong>{player.name}{you && <small>you</small>}</strong></div>
}

function RoomCode({ code, large = false }: { code: string; large?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setError(''); setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch { setError('Copy unavailable. Copy the code manually.') }
  }
  return <div className={`room-code-block ${large ? 'large' : ''}`}><div><strong>{code}</strong><button className="icon-button" aria-label="Copy room code" onClick={() => { void copy() }}>{copied ? <CheckCheck size={17} /> : <Copy size={17} />}</button></div>{error && <small role="alert">{error}</small>}</div>
}

function InviteButton({ code }: { code: string }) {
  const [message, setMessage] = useState('')
  const copy = async () => {
    const url = new URL(location.href)
    url.search = ''; url.hash = ''; url.searchParams.set('room', code)
    try { await navigator.clipboard.writeText(url.toString()); setMessage('Link copied') }
    catch { setMessage('Share the room code instead.') }
  }
  return <div className="invite-link"><button className="text-button" onClick={() => { void copy() }}>Copy invite link <Copy size={14} /></button>{message && <small role="status">{message}</small>}</div>
}

function OwnSecret({ game }: { game: GameState }) {
  const label = game.room.mode === 'word' ? 'Your word' : 'Your code'
  return <div className="own-secret" role="group" aria-label={label}><div><strong><LockKeyhole size={13} />{label}</strong><small>Only on your screen</small></div><Tiles mode={game.room.mode} value={game.own_secret ?? ''} length={4} /></div>
}

function Arena({ controller, game, me, opponent, elapsed, onHelp }: { controller: Controller; game: GameState; me: Player; opponent: Player; elapsed: number; onHelp: () => void }) {
  const pending = game.pending_guess
  const myTurn = game.room.variant === 'race' || game.room.turn_user_id === me.user_id
  const canGuess = !pending && myTurn && me.attempts < 8
  return <div className="arena-layout">
    <section className="panel input-panel"><div className="arena-heading"><h1>{pending && pending.user_id !== me.user_id ? 'Your clues, please.' : canGuess ? game.room.variant === 'race' ? 'Beat them to it.' : 'Your turn.' : 'Over to your rival.'}</h1>{game.room.variant === 'race' ? <span className="elapsed" aria-label="Elapsed time"><Clock3 size={13} />{formatTime(elapsed)}</span> : <span className="turn-badge"><Repeat2 size={14} />Take turns</span>}</div>
      <OwnSecret game={game} />
      {pending && pending.user_id !== me.user_id ? <HintEditor key={pending.id} controller={controller} game={game} /> :
        pending ? <div className="waiting-state pending-state"><Tiles mode={game.room.mode} value={pending.guess} length={4} /><p>{opponent.name} is marking your clues.</p><LoaderCircle className="spin mint" size={20} /></div> :
          canGuess ? <CodeEntry mode={game.room.mode} words={controller.words} guesses={game.guesses} busy={controller.busy || controller.connection === 'offline'} onSubmit={value => controller.mutate('submit_guess', { p_guess: value, p_attempt: me.attempts + 1 })} /> :
            <div className="waiting-state"><LockKeyhole size={28} /><p>{me.attempts === 8 ? 'All eight guesses are in.' : `${opponent.name} is choosing a guess.`}</p><LoaderCircle className="spin mint" size={20} /></div>}
      <div className="progress-line"><span>You: {me.attempts}/8</span><span>{opponent.name}: {opponent.attempts}/8</span></div>
    </section>
    <section className="panel history-panel"><div className="history-heading"><h2>Your guesses</h2><button className="icon-button" aria-label="Explain clues" onClick={onHelp}><CircleHelp size={17} /></button></div><Legend /><div className="guess-history" aria-label="Guess history" aria-live="polite">
      {game.guesses.length === 0 ? <p className="empty-history">Your checked clues will appear here.</p> : game.guesses.map(guess => <div className="history-row" key={guess.id}><span>{guess.attempt}</span><Tiles mode={game.room.mode} value={guess.guess} marks={guess.feedback} length={4} animated /><small>{game.room.variant === 'race' ? formatTime(guess.elapsed_ms / 1000) : `#${guess.attempt}`}</small></div>)}
    </div></section>
  </div>
}

function HintEditor({ controller, game }: { controller: Controller; game: GameState }) {
  const [marks, setMarks] = useState<Mark[]>(['miss', 'miss', 'miss', 'miss'])
  const pending = game.pending_guess!
  return <div className="hint-editor"><span className="hint-label">Your secret · for your eyes only</span><Tiles mode={game.room.mode} value={game.own_secret ?? ''} length={4} /><p>Tap each {game.room.mode === 'word' ? 'letter' : 'digit'} to cycle grey → yellow → green.</p>
    <Legend />
    <div className="manual-hints" aria-label="Mark clues">{[...pending.guess].map((item, i) => <button key={i} className={`tile ${marks[i]}`} aria-label={`Clue ${i + 1}: ${item}`} aria-description={CLUES[marks[i]].label} disabled={controller.busy} onClick={() => setMarks(old => old.map((mark, j) => i === j ? mark === 'miss' ? 'present' : mark === 'present' ? 'hit' : 'miss' : mark))}>{item}<small aria-hidden="true">{CLUES[marks[i]].symbol}</small></button>)}</div>
    <p className="hint-check-note">Mark green positions first, then remaining copies yellow from left to right. Only correct hints can be sent.</p>
    <button className="button primary full" disabled={controller.busy || controller.connection === 'offline'} onClick={() => { void controller.mutate('submit_hints', { p_guess_id: pending.id, p_marks: marks }) }}>Check & send hints <CheckCheck size={17} /></button>
  </div>
}

function Results({ game, me, opponent, controller }: { game: GameState; me: Player; opponent: Player; controller: Controller }) {
  const result = game.results.find(item => item.round_number === game.room.round_number)
  if (!result) return <section className="panel loading-panel"><LoaderCircle className="spin" /><h1>Checking the result…</h1></section>
  const matchOver = game.room.status === 'match_over'
  const winnerId = matchOver ? me.score === opponent.score ? null : me.score > opponent.score ? me.user_id : opponent.user_id : result.winner_id
  const winner = winnerId === me.user_id ? me : winnerId === opponent.user_id ? opponent : null
  const youWon = winnerId === me.user_id
  return <section className={`panel winner-screen ${youWon ? 'you-won' : ''}`} key={`${game.room.match_number}-${game.room.round_number}`}>
    {winner && <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--x': `${(i * 43) % 100}%`, '--delay': `${(i % 6) * .12}s`, '--color': i % 2 ? '#efc16d' : '#8af0cb' } as CSSProperties} />)}</div>}
    <span className="winner-icon"><Trophy size={40} /></span><span className="eyebrow">{matchOver ? 'MATCH COMPLETE' : `ROUND ${game.room.round_number} COMPLETE`}</span>
    <h1>{winner ? youWon ? matchOver ? 'You win the match!' : 'You cracked it first!' : `${winner.name} ${matchOver ? 'wins the match!' : 'cracked it first!'}` : 'It’s a draw.'}</h1>
    <p>{matchOver ? `${me.score} – ${opponent.score}` : winner ? `Round to ${youWon ? 'you' : winner.name}.` : 'Both players used all eight guesses.'}</p>
    {matchOver && <div className="winning-bet"><span>{winner ? `${youWon ? 'Your' : `${winner.name}’s`} winning bet` : 'No bet won this time'}</span>{winner && <blockquote>{winner.wager}</blockquote>}</div>}
    <div className="reveal-grid">{[me, opponent].map(player => <div className="reveal-card" key={player.user_id}><span>{player.user_id === me.user_id ? 'Your secret' : `${player.name}’s secret`}</span><Tiles mode={game.room.mode} value={result.reveals[player.user_id] ?? ''} length={4} animated /></div>)}</div>
    {!matchOver && <p>Guessing has stopped for both players. Both must be ready before the next round.</p>}
    <button className="button primary full" disabled={controller.busy || me.next_ready} onClick={() => { void controller.mutate('advance_round') }}>{me.next_ready ? <Check size={18} /> : <ArrowRight size={18} />}{me.next_ready ? 'Waiting for your friend…' : matchOver ? 'New match · new bets' : `Ready for round ${game.room.round_number + 1}`}</button>
  </section>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => { const previous = document.activeElement; ref.current?.showModal(); return () => { if (previous instanceof HTMLElement) previous.focus() } }, [])
  return <dialog ref={ref} aria-labelledby={titleId} className="modal panel" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose() }}><div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>
}

function Rules({ mode, turns, onClose }: { mode: Mode; turns: boolean; onClose: () => void }) {
  return <Modal title={`How to play ${MODES[mode].name}`} onClose={onClose}><p>{MODES[mode].description} The room creator starts after both secrets are locked and both bets agreed.</p><Legend /><p>Green means the correct item in the correct position. Yellow means it belongs elsewhere. Grey means no unmatched copy remains. Green positions count first; extra matching copies count left to right.</p><p>{turns ? 'Take turns guessing. The secret owner marks the clues; the server checks every hint before sending it. The first player alternates each round.' : 'Both players guess simultaneously. The visible timer tracks elapsed time only.'}</p><p>Eight guesses, no time limit. The first exact answer stops guessing for both players and reveals both secrets. Both choose to continue, lock new secrets, and wait for the host to start the next round. Best of three; a tied match means no bet is won.</p><button className="button primary full" onClick={onClose}>Got it <Check size={17} /></button></Modal>
}
