import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock3, LoaderCircle, RotateCcw, Trophy } from 'lucide-react'
import { configured, rpc, soloStorageKey } from '../lib/supabase'
import { formatTime, MODES, type Mode, type SoloChallenge, type SoloState } from '../lib/game'
import { CodeEntry } from './CodeEntry'
import { HistoryPanel } from './HistoryPanel'
import { Legend, Tiles } from './Tiles'

export function SoloGame({ userId, mode, challenge, onModeChange, onChallengeChange, onHelp, onHome }: {
  userId: string; mode: Mode; challenge: SoloChallenge
  onModeChange: (mode: Mode) => void; onChallengeChange: (challenge: SoloChallenge) => void; onHelp: () => void; onHome: () => void
}) {
  const [game, setGame] = useState<SoloState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(Date.now())
  const currentId = useRef<string | null>(null)
  const mounted = useRef(true)
  const pending = useRef(false)
  const storageKey = `${soloStorageKey}.${userId}`
  const accept = useCallback((next: SoloState) => {
    currentId.current = next.id
    localStorage.setItem(storageKey, next.id)
    setOffset(Date.parse(next.server_now) - Date.now())
    setGame(old => old?.id === next.id && old.version > next.version ? old : next)
  }, [storageKey])
  const refresh = useCallback(async (id: string | null) => {
    const next = await rpc<SoloState | null>('get_solo_game', { p_game: id })
    if (!mounted.current || currentId.current !== id) return
    if (next) accept(next)
    else setGame(null)
    setError('')
  }, [accept])
  useEffect(() => {
    mounted.current = true
    if (!userId) return () => { mounted.current = false }
    setLoading(true)
    setGame(null)
    void (async () => {
      try {
        currentId.current = localStorage.getItem(storageKey)
        await refresh(currentId.current)
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : 'Could not load your solo puzzle.')
      } finally {
        if (mounted.current) setLoading(false)
      }
    })()
    return () => { mounted.current = false }
  }, [userId, storageKey, refresh])
  useEffect(() => {
    if (!game) return
    onModeChange(game.mode)
    onChallengeChange(game.challenge)
  }, [game?.mode, game?.challenge, onModeChange, onChallengeChange])
  const remaining = game?.deadline ? Math.max(0, Math.ceil((Date.parse(game.deadline) - now - offset) / 1000)) : null
  const expired = remaining === 0 && game?.status === 'playing'
  useEffect(() => {
    if (!game || game.status !== 'playing') return
    const tick = setInterval(() => setNow(Date.now()), 250)
    const reload = () => { void refresh(game.id).catch(err => { if (mounted.current) setError(err instanceof Error ? err.message : 'Could not sync your puzzle. Retrying…') }) }
    const poll = setInterval(reload, 3000)
    const visible = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('online', reload)
    document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(tick); clearInterval(poll); window.removeEventListener('online', reload); document.removeEventListener('visibilitychange', visible) }
  }, [game?.id, game?.status, refresh])
  useEffect(() => {
    if (expired && game) void refresh(game.id).catch(err => { if (mounted.current) setError(err instanceof Error ? err.message : 'Could not check the timer. Retrying…') })
  }, [expired, game?.id, refresh])
  const start = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const next = await rpc<SoloState>('create_solo_game', { p_mode: mode, p_challenge: challenge })
      if (mounted.current) { accept(next); setNow(Date.now()) }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not start your solo puzzle.')
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const submit = async (guess: string) => {
    if (pending.current || !game) return false
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await rpc<{ accepted: boolean; game: SoloState }>('submit_solo_guess', { p_game: game.id, p_guess: guess, p_attempt: game.guesses.length + 1 })
      if (mounted.current) accept(result.game)
      return result.accepted
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Could not submit your guess.')
      return false
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const setup = () => {
    try {
      localStorage.removeItem(storageKey)
      currentId.current = null
      setGame(null)
      setError('')
    } catch { setError('This browser could not clear the saved puzzle. Please try again.') }
  }
  if (!configured) return <section className="panel solo-setup"><h1>Connect to play solo.</h1><p role="alert" className="field-error">Configure Supabase or run the local game server before starting a puzzle.</p></section>
  return <section className="solo-shell">
    <button className="text-button" onClick={onHome}>Back to home</button>
    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="button secondary" disabled={busy} onClick={() => { void refresh(currentId.current).catch(err => setError(err instanceof Error ? err.message : 'Could not reload your puzzle.')) }}>Retry</button></div>}
    {loading ? <div className="panel loading-panel"><LoaderCircle className="spin mint" /><h1>Opening solo play…</h1></div> : !game ? <div className="panel solo-setup">
      <span className="eyebrow">JUST YOU AND THE PUZZLE</span><h1>Crack it solo.</h1><p>No room, no bets. The game chooses a hidden answer and checks every guess.</p>
      <div className="mode-picker" aria-label="Solo puzzle type">{(['number', 'word'] as const).map(value => <button className={mode === value ? 'active' : ''} aria-pressed={mode === value} key={value} onClick={() => onModeChange(value)}>{MODES[value].name}</button>)}</div>
      <div className="variant-picker" aria-label="Solo challenge"><button className={challenge === 'attempts' ? 'selected' : ''} aria-pressed={challenge === 'attempts'} onClick={() => onChallengeChange('attempts')}><strong>6 guesses</strong><small>No time limit</small></button><button className={challenge === 'timed' ? 'selected' : ''} aria-pressed={challenge === 'timed'} onClick={() => onChallengeChange('timed')}><strong>3-minute timer</strong><small>Unlimited guesses</small></button></div>
      <Legend /><p className="solo-rules">{mode === 'word' ? 'Find a real six-letter word. Any valid word is allowed, even if it ignores earlier clues.' : 'Find a four-digit code. Leading zeros and repeated digits are allowed.'} {challenge === 'timed' ? 'The timer keeps running if you leave or reload.' : 'Solve in six guesses or fewer.'}</p>
      <button className="button primary full" disabled={busy || !userId} onClick={() => { void start() }}>{busy ? 'Starting…' : 'Start solo puzzle'}</button>
    </div> : <>
      {game.status !== 'playing' && <div className={`panel winner-screen solo-result ${game.status === 'won' ? 'you-won' : ''}`}>
        <span className="winner-icon"><Trophy size={36} /></span><span className="eyebrow">SOLO PUZZLE COMPLETE</span><h1>{game.status === 'won' ? 'You cracked it!' : game.status === 'abandoned' ? 'A new puzzle replaced this one.' : game.challenge === 'timed' ? 'Time’s up.' : 'Out of guesses.'}</h1>
        <p>{game.guesses.length} {game.guesses.length === 1 ? 'guess' : 'guesses'} · {formatTime((Date.parse(game.finished_at ?? game.server_now) - Date.parse(game.started_at)) / 1000)}</p>
        <div className="solo-reveal"><span>The secret {game.mode === 'word' ? 'word' : 'code'}</span><Tiles mode={game.mode} value={game.secret ?? ''} length={MODES[game.mode].length} animated /></div>
        <button className="button primary full" disabled={busy} onClick={() => { void start() }}><RotateCcw size={16} />{busy ? 'Starting…' : 'Play again'}</button><button className="text-button" disabled={busy} onClick={setup}>Change solo challenge</button>
      </div>}
      <div className={`arena-layout arena-${game.mode} solo-arena`}>
        {game.status === 'playing' && <div className="panel input-panel"><div className="arena-heading"><h1>Crack this {game.mode === 'word' ? 'word' : 'code'}.</h1>{remaining !== null ? <span className="elapsed solo-timer" aria-label="Time remaining"><Clock3 size={15} />{formatTime(remaining)}</span> : <span className="turn-badge">6 guesses</span>}</div>
          <p className="solo-private-note">The answer stays hidden until you finish.</p>
          <CodeEntry key={game.id} mode={game.mode} words={[]} guesses={game.guesses} busy={busy || expired} onSubmit={submit} />
          {expired && <p role="status">Time is up. Checking your result…</p>}
          <div className="progress-line"><span>Guesses: {game.guesses.length}{game.max_guesses ? ` / ${game.max_guesses}` : ''}</span><span>{game.challenge === 'timed' ? 'Unlimited guesses' : `${6 - game.guesses.length} remaining`}</span></div>
        </div>}
        <HistoryPanel mode={game.mode} guesses={game.guesses} timed={game.challenge === 'timed'} onHelp={onHelp} />
      </div>
    </>}
  </section>
}
