import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { LogIn, LogOut, RefreshCw } from 'lucide-react'
import { googleAuthEnabled, localPlay, rpc, supabase } from '../lib/supabase'
import { GAME_NAMES, MODES, NO_BET, type BetRecord } from '../lib/game'
import { getGooglePhoto } from '../lib/avatars'
import { PlayerAvatar } from './PlayerAvatar'
import { disablePhonePush } from '../lib/push'

export function PlayerPanel({ userId, inRoom, user }: { userId: string; inRoom: boolean; user: User | null }) {
  const [authBusy, setAuthBusy] = useState(false)
  const [error, setError] = useState('')
  const signedIn = Boolean(user && !user.is_anonymous)
  const accountAction = async (signOut: boolean) => {
    if (!supabase || inRoom || (!signOut && !googleAuthEnabled)) {
      setError(inRoom ? 'Finish your match and return Home before changing accounts.' : 'Google sign-in has not been configured.')
      return
    }
    setAuthBusy(true)
    setError('')
    try {
      await disablePhonePush()
      const redirectTo = new URL(import.meta.env.BASE_URL, location.origin).href
      if (signOut) {
        const { error } = await supabase.auth.signOut({ scope: 'local' })
        if (error) throw error
        location.assign(redirectTo)
      } else {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } } })
        if (error) throw error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change accounts. Please try again.')
      setAuthBusy(false)
    }
  }
  return <div className="player-panel">
    <section className="account-card">
      <div className="account-identity"><PlayerAvatar identity={userId} name="You" photoUrl={getGooglePhoto(user)} large /><div><span className="eyebrow">YOUR PLAYER</span><h2>{signedIn ? 'Account connected' : localPlay ? 'Local player' : 'Guest player'}</h2></div></div>
      <p>{signedIn ? 'Your completed matches and bets follow this account across devices.' : 'Guest history belongs to this browser identity. Sign in before playing to save future wins across devices. Guest history is not merged into a Google account.'}</p>
      {!localPlay && <button className="button secondary full" disabled={authBusy || inRoom || !userId || !signedIn && !googleAuthEnabled} onClick={() => { void accountAction(signedIn) }}>{signedIn ? <LogOut size={16} /> : <LogIn size={16} />}{authBusy ? 'Opening…' : signedIn ? 'Sign out on this device' : 'Sign in with Google'}</button>}
      {inRoom && <p className="account-note">Finish your match and return Home before changing accounts.</p>}
      {!localPlay && !googleAuthEnabled && !signedIn && <p className="account-note">Google sign-in is not configured yet. Guest play and private history still work.</p>}
      {localPlay && <p className="account-note">Google accounts require the hosted Supabase game, not the local development server.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
    <BetHistory userId={userId} />
  </div>
}

function BetHistory({ userId }: { userId: string }) {
  const [items, setItems] = useState<BetRecord[]>([])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState<{ search: string; result: 'won' | 'lost' | 'all' }>({ search: '', result: 'won' })
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)
  const searchId = useId()
  const load = useCallback(async (before: BetRecord | null) => {
    if (!userId) return
    const sequence = ++request.current
    setLoading(true)
    setError('')
    try {
      const rows = await rpc<BetRecord[]>('get_bet_history', { p_before: before?.completed_at ?? null, p_before_id: before?.id ?? null, p_search: query.search, p_result: query.result })
      if (request.current !== sequence) return
      setItems(old => before ? [...old, ...rows.slice(0, 25)] : rows.slice(0, 25))
      setHasMore(rows.length > 25)
    } catch (err) {
      if (request.current === sequence) setError(err instanceof Error ? err.message : 'Could not load your bet history.')
    } finally {
      if (request.current === sequence) setLoading(false)
    }
  }, [query, userId])
  useEffect(() => {
    setItems([])
    setHasMore(false)
    void load(null)
    return () => { request.current++ }
  }, [load])
  return <section className="bet-history" aria-label="Your bet history">
    <div className="history-heading"><h2>Your bet history</h2><button className="icon-button" aria-label="Refresh bet history" disabled={loading || !userId} onClick={() => { void load(null) }}><RefreshCw size={17} /></button></div>
    <p>Completed matches only. Search an opponent to see your trail together.</p>
    <form className="history-filters" onSubmit={event => { event.preventDefault(); setQuery(old => ({ ...old, search: search.trim() })) }}>
      <label htmlFor={searchId}>Opponent name</label>
      <input id={searchId} type="search" maxLength={80} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search your opponents" />
      <select aria-label="Bet history result" value={query.result} onChange={event => {
        const result = event.target.value
        if (result === 'won' || result === 'lost' || result === 'all') setQuery(old => ({ ...old, result }))
        else setError('Choose won, lost or all bets.')
      }}><option value="won">Bets you won</option><option value="lost">Bets you lost</option><option value="all">All results</option></select>
      <button type="submit" className="button secondary" disabled={!userId}>Search bets</button>
    </form>
    {error && <p role="alert" className="field-error">{error}</p>}
    {loading && <p role="status">Loading bet history…</p>}
    {!loading && !error && !items.length && <p className="empty-history">No completed matches match this filter yet.</p>}
    <div className="bet-history-list">{items.map(item => <article className="bet-history-card" key={item.id}>
      <div><strong>{item.draw ? 'Draw' : item.won ? 'You won' : 'You lost'} against {item.opponent_name}</strong><span>{item.your_score} – {item.opponent_score}</span></div>
      <small>{item.mode === null ? GAME_NAMES[item.game_kind] : `${MODES[item.mode].name} · ${item.variant === 'race' ? 'Live race' : 'Take turns'}`} · <time dateTime={item.completed_at}>{new Date(item.completed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></small>
      {item.draw ? <p>No bet won.</p> : !item.bet || item.bet === NO_BET ? <p>No bet for this win.</p> : <blockquote>{item.bet}</blockquote>}
    </article>)}</div>
    {hasMore && <button className="button secondary full" disabled={loading} onClick={() => { void load(items.at(-1) ?? null) }}>Load older bets</button>}
  </section>
}
