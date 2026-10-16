import { useCallback, useEffect, useRef, useState } from 'react'
import { authenticate, configured, getState, loadWordPage, localPlay, roomStorageKey, rpc, supabase } from '../lib/supabase'
import type { GameState, Mode, Stake, Variant } from '../lib/game'

const STORAGE_KEY = roomStorageKey
export function useGame() {
  const [roomId, setRoomId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  const [game, setGame] = useState<GameState | null>(null)
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(Boolean(roomId && configured))
  const [error, setError] = useState('')
  const [syncError, setSyncError] = useState('')
  const [connection, setConnection] = useState<'connecting' | 'live' | 'polling' | 'offline'>('connecting')
  const [words, setWords] = useState<string[]>([])
  const [clockOffset, setClockOffset] = useState(0)
  const pending = useRef(false)
  const currentRoom = useRef(roomId)
  currentRoom.current = roomId

  const refresh = useCallback(async (id: string) => {
    const state = await getState(id)
    if (currentRoom.current !== id) return
    setClockOffset(Date.parse(state.server_now) - Date.now())
    setGame(previous => previous?.room.id === id && previous.room.version > state.room.version ? previous : state)
    setSyncError('')
  }, [])

  useEffect(() => {
    if (!configured) return
    let active = true
    void authenticate().then(id => {
      if (!active) return
      setUserId(id)
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not initialize your session.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!userId) return
    let active = true
    const load = async () => {
      const bank: string[] = []
      for (let offset = 0; ; offset += 1000) {
        const page = await loadWordPage(offset)
        if (!active) return
        bank.push(...page)
        if (page.length < 1000) break
      }
      setWords(bank)
    }
    void load().catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load dictionary.') })
    return () => { active = false }
  }, [userId, roomId])

  useEffect(() => {
    if (!roomId || !configured || !userId || (!localPlay && !supabase)) return
    let active = true
    const report = (err: unknown) => {
      if (active) setSyncError(err instanceof Error ? err.message : 'Connection interrupted. Retrying…')
    }
    setLoading(true)
    setConnection(navigator.onLine ? localPlay ? 'polling' : 'connecting' : 'offline')
    void refresh(roomId).catch(report).finally(() => { if (active) setLoading(false) })
    const channel = supabase?.channel(`room-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => { void refresh(roomId).catch(report) })
      .subscribe(status => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          setConnection('live')
          void refresh(roomId).catch(report)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection(navigator.onLine ? 'polling' : 'offline')
        }
      })
    let ticking = false
    const tick = async () => {
      if (!active || ticking || !navigator.onLine) return
      ticking = true
      try {
        await rpc('heartbeat', { p_room: roomId })
        if (active) await refresh(roomId)
      } catch (err) { report(err) }
      finally { ticking = false }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, localPlay ? 1000 : 5000)
    const online = () => {
      setConnection('polling')
      void tick()
    }
    const offline = () => setConnection('offline')
    const visible = () => { if (document.visibilityState === 'visible') void tick() }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visible)
      if (channel) void supabase?.removeChannel(channel)
    }
  }, [roomId, userId, refresh])

  const action = async (operation: () => Promise<void>) => {
    if (pending.current) return false
    pending.current = true
    setBusy(true)
    setError('')
    try { await operation(); return true }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please retry.'); return false }
    finally { pending.current = false; setBusy(false) }
  }
  const enterRoom = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id)
    currentRoom.current = id
    setGame(null)
    setLoading(true)
    setRoomId(id)
  }
  const createRoom = (name: string, mode: Mode, stake: Stake, variant: Variant) => action(async () => {
    const id = await authenticate()
    setUserId(id)
    enterRoom(await rpc<string>('create_room', { p_name: name, p_mode: mode, p_stake: stake, p_wager: '', p_variant: variant }))
  })
  const joinRoom = (name: string, code: string) => action(async () => {
    const id = await authenticate()
    setUserId(id)
    const result = await rpc<{ room_id?: string; error?: string }>('join_room', { p_code: code, p_name: name })
    if (result.error) throw new Error(result.error)
    if (!result.room_id) throw new Error('No room was returned. Please retry.')
    enterRoom(result.room_id)
  })
  const mutate = (name: string, args: Record<string, unknown> = {}) => action(async () => {
    if (!roomId) throw new Error('Join a room first.')
    const roundArgs = ['set_secret', 'submit_guess', 'advance_round', 'start_round', 'submit_hints'].includes(name) && game
      ? { p_match: game.room.match_number, p_round: game.room.round_number } : {}
    const wagerArgs = ['set_ready', 'start_round'].includes(name) && game ? { p_wager_version: game.room.wager_version }
      : name === 'set_wager' && game ? { p_match: game.room.match_number } : {}
    const result = await rpc<{ accepted?: boolean; reason?: string } | null>(name, { p_room: roomId, ...roundArgs, ...wagerArgs, ...args })
    if (name === 'submit_guess' && result?.accepted !== true && result?.reason !== 'round_finished') {
      throw new Error('The server did not accept your guess. Please retry.')
    }
    await refresh(roomId)
  })
  const home = () => {
    localStorage.removeItem(STORAGE_KEY)
    currentRoom.current = null
    setRoomId(null)
    setGame(null)
    setError('')
    setSyncError('')
    setLoading(false)
  }
  return { roomId, game, userId, busy, loading, error, syncError, connection, words, clockOffset, createRoom, joinRoom, mutate, home, dismissError: () => setError('') }
}
