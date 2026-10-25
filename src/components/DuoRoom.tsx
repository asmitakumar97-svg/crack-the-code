import { useState } from 'react'
import { ArrowLeft, Check, CircleDot, Copy, Dices, Grid2X2, LockKeyhole, Users } from 'lucide-react'
import type { useGame } from '../hooks/useGame'
import { MODES, type GameState, type HubState } from '../lib/game'
import { PlayerAvatar } from './PlayerAvatar'
import { TurnAlerts } from './TurnAlerts'
import { DotsBoard } from './DotsBoard'
import { MemoryBoard } from './MemoryBoard'
import { BoardSettings } from './BoardSettings'
import { RingBoard } from './RingBoard'

type Controller = ReturnType<typeof useGame>

export function DuoEntry({ controller, onHome }: { controller: Controller; onHome: () => void }) {
  const invite = new URLSearchParams(location.search).get('room') ?? ''
  const [name, setName] = useState(() => localStorage.getItem('crack-the-code.name') ?? '')
  const [code, setCode] = useState(invite)
  const [joining, setJoining] = useState(Boolean(invite))
  const [error, setError] = useState('')
  const enter = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (joining && !/^[A-F0-9]{6}$/.test(code)) { setError('Enter a six-character room code.'); return }
    try {
      localStorage.setItem('crack-the-code.name', name.trim())
      if (joining) await controller.joinRoom(name.trim(), code)
      else await controller.createDuoRoom(name.trim())
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save your player name.') }
  }
  return <section className="panel duo-entry">
    <button className="text-button" onClick={onHome}><ArrowLeft size={16} />Back to home</button>
    <span className="eyebrow">ONE ROOM. TWO PLAYERS. ALL THE FUN.</span>
    <h1>Your favourite +1.</h1><p>Create one private room, then choose what to play together.</p>
    <div className="tabs" role="tablist" aria-label="Duo room action">
      <button role="tab" aria-selected={!joining} onClick={() => setJoining(false)}>Create room</button>
      <button role="tab" aria-selected={joining} onClick={() => setJoining(true)}>Join room</button>
    </div>
    <form onSubmit={event => { void enter(event) }}>
      <label htmlFor="duo-name">Your name</label>
      <input id="duo-name" required maxLength={20} autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} />
      {joining && <><label htmlFor="duo-code">Room code</label><input id="duo-code" required maxLength={6} autoComplete="off" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))} /></>}
      {error && <p role="alert" className="field-error">{error}</p>}
      <button className="button primary full" disabled={controller.busy || !name.trim()}><Users size={17} />{joining ? 'Join Duo room' : 'Create Duo room'}</button>
    </form>
  </section>
}

export function DuoRoom({ controller, game, onHome }: { controller: Controller; game: GameState; onHome: () => void }) {
  const [copyError, setCopyError] = useState('')
  const [copied, setCopied] = useState(false)
  const me = game.players.find(player => player.user_id === controller.userId)!
  const host = game.room.host_id === me.user_id
  const blocked = controller.busy || controller.connection === 'offline'
  const copy = async () => {
    try {
      const url = new URL(location.href)
      url.search = ''; url.hash = ''; url.searchParams.set('room', game.room.code); url.searchParams.set('play', 'duo')
      await navigator.clipboard.writeText(url.href)
      setCopyError(''); setCopied(true)
    } catch { setCopyError('Could not copy. Share the room code instead.') }
  }
  return <section className="duo-room">
    <div className="game-nav"><button className="text-button" onClick={onHome}><ArrowLeft size={16} />Home</button><span>YOUR DUO ROOM</span><strong>{game.room.code}</strong></div>
    <div className="duo-players">{game.players.map(player => <div key={player.user_id}>
      <PlayerAvatar identity={player.user_id} name={player.name} photoUrl={player.avatar_url} />
      <strong>{player.name}{player.user_id === me.user_id ? ' · you' : ''}</strong>
      <small>{player.user_id === game.room.host_id ? 'Host' : 'Player 2'}</small>
    </div>)}{game.players.length < 2 && <div><Users size={32} /><strong>Waiting for your +1</strong><small>Share your room code</small></div>}</div>
    {controller.connection === 'offline' && <p role="status" className="notice">You’re offline. Reconnecting…</p>}
    {game.room.duo_lobby && game.hub ? <>
      <div className="duo-room-heading"><div><span className="eyebrow">PICK YOUR NEXT LITTLE RIVALRY</span><h1>What’s the mood?</h1></div><button className="button secondary" onClick={() => { void copy() }}><Copy size={16} />{copied ? 'Invite copied' : 'Invite your +1'}</button></div>
      {copyError && <p role="alert" className="field-error">{copyError}</p>}
      <DuoChoices controller={controller} game={game} choice={game.hub} host={host} disabled={blocked} />
    </> : game.ring ? <>
      <RingBoard key={game.ring.session_id} controller={controller} game={game} ring={game.ring} disabled={blocked} />
      {game.ring.finished && (host ? <button className="button primary full" disabled={blocked} onClick={() => { void controller.mutate('open_duo_lobby') }}>Choose the next game</button> : <p className="notice">Your host can choose the next game. You’ll both confirm before it starts.</p>)}
    </> : game.dots ? <>
      <TurnAlerts game={game} userId={me.user_id} started />
      <DotsBoard controller={controller} game={game} dots={game.dots} disabled={blocked} />
      {game.dots.finished && (host ? <button className="button primary full" disabled={blocked} onClick={() => { void controller.mutate('open_duo_lobby') }}>Choose the next game</button> : <p className="notice">Your host can choose the next game. You’ll both confirm before it starts.</p>)}
    </> : game.memory ? <>
      <TurnAlerts game={game} userId={me.user_id} started />
      <MemoryBoard controller={controller} game={game} memory={game.memory} disabled={blocked} />
      {game.memory.finished && (host ? <button className="button primary full" disabled={blocked} onClick={() => { void controller.mutate('open_duo_lobby') }}>Choose the next game</button> : <p className="notice">Your host can choose the next game. You’ll both confirm before it starts.</p>)}
    </> : <p role="alert" className="field-error">The shared game could not be loaded. Reload to reconnect.</p>}
  </section>
}

function DuoChoices({ controller, game, choice, host, disabled }: { controller: Controller; game: GameState; choice: HubState; host: boolean; disabled: boolean }) {
  const update = (patch: Partial<HubState>) => {
    const next = { ...choice, ...patch }
    void controller.mutate('choose_duo_game', { p_revision: choice.revision, p_game: next.selected, p_tiles: next.tiles, p_theme: next.theme, p_mode: next.mode, p_variant: next.variant, p_dots: next.dots ?? 10 })
  }
  const confirmed = choice.ready.includes(controller.userId)
  return <>
    <div className="duo-game-picker" role="group" aria-label="Choose a game">
      <button className={`panel duo-game-card ${choice.selected === 'code' ? 'selected' : ''}`} aria-pressed={choice.selected === 'code'} disabled={!host || disabled} onClick={() => update({ selected: 'code' })}>
        <LockKeyhole size={30} /><span className="eyebrow">LOGIC & FRIENDLY RIVALRY</span><h2>Crack the Code</h2><p>Secret digits. Clever words. Your next aha.</p><small>Number Lock · Word Lock</small>
      </button>
      <button className={`panel duo-game-card ${choice.selected === 'memory' ? 'selected' : ''}`} aria-pressed={choice.selected === 'memory'} disabled={!host || disabled} onClick={() => update({ selected: 'memory' })}>
        <Grid2X2 size={30} /><span className="eyebrow">A LITTLE FOCUS. A LITTLE LUCK.</span><h2>Memory Match</h2><p>Flip, remember, and find your perfect pairs.</p><small>12, 16 or 24 tiles · 4 picture themes</small>
      </button>
      <button className={`panel duo-game-card ${choice.selected === 'dots' ? 'selected' : ''}`} aria-pressed={choice.selected === 'dots'} disabled={!host || disabled} onClick={() => update({ selected: 'dots' })}>
        <Dices size={30} /><span className="eyebrow">ROLL. CONNECT. CLAIM.</span><h2>Dots &amp; Boxes</h2><p>An eight-sided dice. A shared board. Make your lines count.</p><small>10, 12 or 15 dots per side · most boxes wins</small>
      </button>
      <button className={`panel duo-game-card ${choice.selected === 'ring' ? 'selected' : ''}`} aria-pressed={choice.selected === 'ring'} disabled={!host || disabled} onClick={() => update({ selected: 'ring' })}>
        <CircleDot size={30} /><span className="eyebrow">SORT YOUR COLOURS. FIND YOUR FLOW.</span><h2>Ring Rush</h2><p>Same shuffled rings. Your own rods. Fastest sorter wins.</p><small>20 rings · 4 colours · 5 rods</small>
      </button>
    </div>
    <section className="panel duo-settings">
      <h2>{choice.selected === 'memory' ? 'Make it your match.' : 'Set the challenge.'}</h2>
      {!host && <p>The host chooses the settings. Confirm when you’re happy with them.</p>}
      {choice.selected === 'ring' ? <p>Race on identical, solvable boards after a shared countdown. Move one top ring onto an empty rod or the same colour; each rod holds five rings. Sort four complete colour stacks first to win. See your friend’s progress live. You can restart your own rings if stuck, but the timer keeps running.</p> : choice.selected !== 'code' ? <BoardSettings kind={choice.selected} options={{ ...choice, dots: choice.dots ?? 10 }} disabled={!host || disabled} onChange={update} /> : <>
        <fieldset disabled={!host || disabled}><legend>Code type</legend><div className="duo-options">{(['number', 'word'] as const).map(mode => <button key={mode} aria-pressed={choice.mode === mode} onClick={() => update({ mode })}>{MODES[mode].name}</button>)}</div></fieldset>
        <fieldset disabled={!host || disabled}><legend>Play style</legend><div className="duo-options">{(['turns', 'race'] as const).map(variant => <button key={variant} aria-pressed={choice.variant === variant} onClick={() => update({ variant })}>{variant === 'turns' ? 'Take turns' : 'Live race'}</button>)}</div></fieldset>
        <p>Choose private secrets and agree your bets next. First to crack the code wins; best of three rounds.</p>
      </>}
      <div className="duo-consent" aria-live="polite">{game.players.map(player => <span key={player.user_id}>{choice.ready.includes(player.user_id) ? <Check size={16} /> : <Users size={16} />}{player.name}: {choice.ready.includes(player.user_id) ? 'ready' : 'reviewing'}</span>)}</div>
      <button className="button primary full" disabled={disabled || confirmed || game.players.length !== 2} onClick={() => { void controller.mutate('confirm_duo_game', { p_revision: choice.revision }) }}>{confirmed ? 'Ready · waiting for your +1' : 'Confirm & play together'}</button>
      <small>Changing any setting clears both confirmations. Nobody starts without the other.</small>
    </section>
  </>
}
