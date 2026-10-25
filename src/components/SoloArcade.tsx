import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { ArrowLeft, Bot, CircleDot, Dices, Grid2X2, Grid3X3, Layers3, LoaderCircle, LockKeyhole, SpellCheck } from 'lucide-react'
import { configured, rpc, soloStorageKey } from '../lib/supabase'
import { isPartyKind, PARTY_GAMES, type BoardController, type BoardOptions, type Difficulty, type SoloBoardState, type SoloKind } from '../lib/game'
import { SoloGame } from './SoloGame'
import { BoardSettings } from './BoardSettings'
import { DotsBoard } from './DotsBoard'
import { MemoryBoard } from './MemoryBoard'
import { RingBoard } from './RingBoard'
import { PartyBoard } from './PartyBoard'

export function SoloArcade(props: ComponentProps<typeof SoloGame>) {
  const [kind, setKind] = useState<SoloKind>(() => {
    const selected = new URLSearchParams(location.search).get('soloGame') ?? ''
    return selected === 'memory' || selected === 'dots' || selected === 'ring' || isPartyKind(selected) ? selected : 'code'
  })
  const [navigationError, setNavigationError] = useState('')
  const select = (next: SoloKind) => {
    setKind(next)
    try {
      const url = new URL(location.href)
      url.searchParams.set('soloGame', next)
      history.replaceState(null, '', url)
      setNavigationError('')
    } catch { setNavigationError('Your game changed, but the browser could not save this page address. Reloading may return to Crack the Code.') }
  }
  return <section className="solo-arcade">
    <div className="solo-game-picker" role="group" aria-label="Solo games">
      {([{ id: 'code', name: 'Crack the Code', Icon: LockKeyhole }, { id: 'memory', name: 'Memory Match', Icon: Grid2X2 }, { id: 'dots', name: 'Dots & Boxes', Icon: Dices }, { id: 'ring', name: 'Ring Rush', Icon: CircleDot }, { id: 'bingo', name: 'Bingo', Icon: Grid3X3 }, { id: 'cheat', name: 'Cheat', Icon: Layers3 }, { id: 'hangman', name: 'Hangman', Icon: SpellCheck }] as const).map(({ id, name, Icon }) => <button key={id} aria-pressed={kind === id} onClick={() => select(id)}><Icon size={21} /><strong>{name}</strong><small>{id === 'code' ? 'A puzzle just for you' : 'You vs computer'}</small></button>)}
    </div>
    {navigationError && <p role="alert" className="field-error">{navigationError}</p>}
    {kind === 'code' ? <SoloGame {...props} /> : <ComputerGame key={`${props.userId}.${kind}`} userId={props.userId} kind={kind} onHome={props.onHome} />}
  </section>
}

function ComputerGame({ userId, kind, onHome }: { userId: string; kind: Exclude<SoloKind, 'code'>; onHome: () => void }) {
  const partyDefinition = PARTY_GAMES.find(entry => entry.id === kind)
  const [game, setGame] = useState<SoloBoardState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [options, setOptions] = useState<BoardOptions>({ tiles: 16, theme: 'animals', dots: 10 })
  const currentId = useRef<string | null>(null)
  const mounted = useRef(true)
  const pending = useRef(false)
  const syncing = useRef(false)
  const storageKey = `${soloStorageKey}.board.${userId}.${kind}`
  const accept = useCallback((next: SoloBoardState) => {
    if (next.kind !== kind) throw new Error('The server returned a different solo game. Choose a new game to continue.')
    localStorage.setItem(storageKey, next.id)
    currentId.current = next.id
    setGame(previous => previous?.id === next.id && previous.version > next.version ? previous : next)
    setOffset(Date.parse(next.server_now) - Date.now())
  }, [kind, storageKey])
  const refresh = useCallback(async (id: string | null) => {
    const next = await rpc<SoloBoardState | null>('get_solo_board', { p_game: id })
    if (!mounted.current || currentId.current !== id) return
    if (next?.kind === kind) accept(next)
    else if (id) throw new Error('The saved board belongs to a different solo game. Choose a new game to continue.')
    else setGame(null)
    setError('')
  }, [accept, kind])
  useEffect(() => {
    mounted.current = true
    if (!userId) return () => { mounted.current = false }
    void (async () => {
      try {
        currentId.current = localStorage.getItem(storageKey)
        await refresh(currentId.current)
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load your computer game.')
      } finally { if (mounted.current) setLoading(false) }
    })()
    return () => { mounted.current = false }
  }, [userId, storageKey, refresh])
  const computerTurn = Boolean(game && (game.kind === 'ring' || game.board.turn_user === game.computer_id))
  useEffect(() => {
    if (!game || game.status !== 'playing') return
    const id = game.id
    const tick = async () => {
      if (syncing.current || pending.current || !navigator.onLine) return
      syncing.current = true
      try { await refresh(id) }
      catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Could not sync the computer turn. Retrying…') }
      finally { syncing.current = false }
    }
    const timer = setInterval(() => { void tick() }, computerTurn ? 400 : 3000)
    const visible = () => { if (document.visibilityState === 'visible') void tick() }
    window.addEventListener('online', tick)
    document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(timer); window.removeEventListener('online', tick); document.removeEventListener('visibilitychange', visible) }
  }, [game?.id, game?.status, computerTurn, refresh])
  const start = async () => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try {
      const next = await rpc<SoloBoardState>('create_solo_board', { p_kind: kind, p_difficulty: difficulty, p_tiles: options.tiles, p_theme: options.theme, p_dots: options.dots })
      if (mounted.current) accept(next)
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Could not start your computer game.') }
    finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const mutate: BoardController['mutate'] = async (name, args = {}) => {
    if (pending.current || !game) return false
    pending.current = true; setBusy(true); setError('')
    try {
      let next: SoloBoardState
      if (game.kind === 'bingo' || game.kind === 'cheat' || game.kind === 'hangman') {
        if (name !== 'play_party' || typeof args.p_move !== 'number' || typeof args.p_action !== 'string' || !args.p_data || typeof args.p_data !== 'object' || Array.isArray(args.p_data)) throw new Error('Choose an available action on the board.')
        next = await rpc<SoloBoardState>('play_solo_party', { p_game: game.id, p_move: args.p_move, p_action: args.p_action, p_data: args.p_data })
      } else if (game.kind === 'ring') {
        const reset = args.p_reset === true
        if (name !== 'move_ring' || typeof args.p_move !== 'number' || !reset && (typeof args.p_from !== 'number' || typeof args.p_to !== 'number')) throw new Error('Choose a ring and a destination rod.')
        next = await rpc<SoloBoardState>('move_solo_ring', { p_game: game.id, p_move: args.p_move, p_from: reset ? null : args.p_from, p_to: reset ? null : args.p_to, p_reset: reset })
      } else {
        const actions: Record<string, string> = { flip_memory_card: 'flip', roll_dots_dice: 'roll', draw_dots_line: 'line' }
        const action = actions[name]
        if (!action) throw new Error('That action is not available in solo play.')
        const index = action === 'roll' ? null : action === 'flip' ? args.p_index : args.p_edge
        if (index !== null && typeof index !== 'number') throw new Error('Choose a card or line on the board.')
        next = await rpc<SoloBoardState>('play_solo_board', { p_game: game.id, p_version: game.version, p_action: action, p_index: index })
      }
      if (mounted.current) accept(next)
      return next.move_accepted !== false
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not save your move.')
      return false
    } finally { pending.current = false; if (mounted.current) setBusy(false) }
  }
  const setup = () => {
    try {
      localStorage.removeItem(storageKey)
      currentId.current = null
      setGame(null); setError('')
    } catch { setError('This browser could not clear the saved board. Please try again.') }
  }
  const boardController: BoardController = { userId, clockOffset: offset, mutate }
  const boardGame = { room: { host_id: userId }, players: [{ user_id: userId, name: 'You' }, { user_id: game?.computer_id ?? '', name: 'Computer' }] }
  return <section className="solo-shell">
    <button className="text-button" onClick={onHome}><ArrowLeft size={16} />Back to home</button>
    {error && <div role="alert" className="error-banner"><span>{error}</span><button className="button secondary" disabled={busy} onClick={() => { void refresh(currentId.current).catch(err => setError(err instanceof Error ? err.message : 'Could not reload your game.')) }}>Retry</button></div>}
    {!configured ? <p role="alert" className="field-error">Connect Supabase or run the local game server to play against the computer.</p> : loading ? <div className="panel loading-panel"><LoaderCircle className="spin mint" /><h1>Opening solo play…</h1></div> : !game ? <section className="panel duo-settings">
      <span className="eyebrow">YOUR RIVAL IS READY WHEN YOU ARE</span><h1>{partyDefinition?.name ?? (kind === 'memory' ? 'Memory Match' : kind === 'ring' ? 'Ring Rush' : 'Dots & Boxes')} · solo</h1><p>No room or second player needed. Play against the computer.</p>
      <fieldset disabled={busy}><legend>Computer difficulty</legend><div className="duo-options">{(['easy', 'medium', 'hard'] as const).map(level => <button key={level} aria-label={`${level} computer`} aria-pressed={difficulty === level} onClick={() => setDifficulty(level)}>{level}</button>)}</div></fieldset>
      <p>{partyDefinition?.solo ?? (kind === 'memory' ? 'Easy remembers 4 revealed cards, Medium remembers 8, and Hard remembers every revealed card. No difficulty can see face-down cards.' : kind === 'ring' ? 'Race on identical, solvable boards. Easy moves every 2.4 seconds, Medium every 1.5 seconds, and Hard every 0.9 seconds. The computer makes only legal moves. The timer and computer keep racing if you leave.' : 'Easy draws randomly. Medium looks for boxes it can claim. Hard also avoids giving away easy boxes. Every difficulty uses the same fair eight-sided dice.')}</p>
      {kind === 'memory' || kind === 'dots' ? <BoardSettings kind={kind} options={options} disabled={busy} onChange={patch => setOptions(previous => ({ ...previous, ...patch }))} /> : <p>{partyDefinition?.rules ?? '40 beads: four colours with ten beads each, on five rods holding ten each. Move only the top bead onto an empty rod or the same colour. Sort all four colours first to win.'}</p>}
      <small>Starting a new computer game replaces your unfinished computer game. Crack the Code puzzles are saved separately.</small>
      <button className="button primary full" disabled={busy || !userId} onClick={() => { void start() }}><Bot size={18} />{busy ? 'Starting…' : 'Play against computer'}</button>
    </section> : <>
      <div className="solo-computer-status"><span><Bot size={18} />You vs Computer · {game.difficulty}</span><button className="text-button" disabled={busy} onClick={setup}>Choose a new game</button></div>
      <p className="notice">{game.kind === 'ring' ? 'The race timer and computer keep going if you leave or reload. Restarting your beads does not reset either.' : 'Computer turns play one move at a time while this game is open. Leaving saves the board; return to resume.'}</p>
      {game.status === 'abandoned' && <p role="status" className="notice">This game was replaced by another computer game. Choose a new game to play again.</p>}
      {game.kind === 'memory' ? <MemoryBoard controller={boardController} game={boardGame} memory={game.board} disabled={busy || game.status !== 'playing'} /> : game.kind === 'ring' ? <RingBoard controller={boardController} game={boardGame} ring={game.board} disabled={busy || game.status !== 'playing'} /> : game.kind === 'dots' ? <DotsBoard controller={boardController} game={boardGame} dots={game.board} disabled={busy || game.status !== 'playing'} /> : <PartyBoard key={game.board.session_id} controller={boardController} game={boardGame} party={game.board} disabled={busy || game.status !== 'playing'} />}
      {game.status === 'finished' && <button className="button primary full" disabled={busy} onClick={() => { setDifficulty(game.difficulty); setOptions(previous => game.kind === 'memory' ? { ...previous, tiles: game.board.cards.length === 12 ? 12 : game.board.cards.length === 24 ? 24 : 16, theme: game.board.theme } : game.kind === 'dots' ? { ...previous, dots: game.board.dots } : previous); setup() }}>Play again</button>}
    </>}
  </section>
}
