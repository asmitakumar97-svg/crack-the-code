import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import type { GameState } from '../lib/game'
import { getTurnAlert, shouldAnnounceTurn } from '../lib/turnAlerts'
import { PhonePushControl } from './PhonePushControl'

export function TurnAlerts({ game, userId, started }: { game: GameState; userId: string; started: boolean }) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [phonePush, setPhonePush] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  const notification = useRef<Notification | null>(null)
  const alive = useRef(true)
  const current = getTurnAlert(game, userId, started)
  const previous = useRef(current)
  useEffect(() => {
    alive.current = true
    const clear = () => { notification.current?.close(); notification.current = null }
    const visible = () => { if (document.visibilityState === 'visible' && document.hasFocus()) clear() }
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      alive.current = false
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
      clear()
      const context = audio.current
      audio.current = null
      if (context && context.state !== 'closed') void context.close().catch(err => console.error('Could not close turn-alert audio.', err))
    }
  }, [])
  useEffect(() => {
    const before = previous.current
    previous.current = current
    notification.current?.close()
    notification.current = null
    if (!enabled || !shouldAnnounceTurn(before, current) || !current) return
    setNotice(current.message)
    const sound = async () => {
      const context = audio.current
      if (!context || context.state === 'closed') return
      try {
        if (context.state === 'suspended') await context.resume()
        if (!alive.current || context !== audio.current) return
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.connect(gain)
        gain.connect(context.destination)
        const time = context.currentTime
        oscillator.frequency.setValueAtTime(660, time)
        oscillator.frequency.setValueAtTime(880, time + 0.12)
        gain.gain.setValueAtTime(0, time)
        gain.gain.linearRampToValueAtTime(0.12, time + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35)
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
        oscillator.start(time)
        oscillator.stop(time + 0.36)
      } catch (err) {
        if (alive.current) setError(`Turn sound could not play. ${err instanceof Error ? err.message : 'Try enabling alerts again.'}`)
      }
    }
    void sound()
    if (!phonePush && (document.visibilityState === 'hidden' || !document.hasFocus()) && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const alert = new Notification('Crack the Code', {
          body: current.message, tag: `crack-the-code.${game.room.id}`,
          icon: new URL(`${import.meta.env.BASE_URL}favicon.svg?v=lock-tiles`, location.origin).href,
          silent: true,
        })
        notification.current = alert
        alert.onclick = () => { window.focus(); alert.close() }
        alert.onerror = () => { if (alive.current) setError('The browser could not show the turn notification. Sound and in-game alerts are still available.') }
      } catch (err) {
        setError(`Browser notification unavailable. ${err instanceof Error ? err.message : 'Sound and in-game alerts are still available.'}`)
      }
    }
  }, [current?.key, enabled, game.room.id, phonePush])
  const toggle = async () => {
    if (busy) return
    if (enabled) {
      setEnabled(false)
      setNotice('')
      setError('')
      notification.current?.close()
      notification.current = null
      return
    }
    setBusy(true)
    setError('')
    const messages: string[] = []
    let permission: Promise<NotificationPermission> | null = null
    try {
      if ('Notification' in window && Notification.permission === 'default') permission = Notification.requestPermission().catch(err => {
        messages.push(`The notification permission request failed. ${err instanceof Error ? err.message : 'Check browser settings.'}`)
        return 'denied' as const
      })
    } catch (err) {
      messages.push(`Notification permission is unavailable. ${err instanceof Error ? err.message : 'Check browser settings.'}`)
    }
    try {
      if ('AudioContext' in window) {
        const context = audio.current ?? new AudioContext()
        audio.current = context
        await context.resume()
      } else messages.push('Sound is not supported by this browser.')
    } catch (err) {
      messages.push(`Sound could not be enabled. ${err instanceof Error ? err.message : 'Check browser settings.'}`)
    }
    try {
      if (!('Notification' in window)) messages.push('Browser notifications are unavailable here. On iPhone, this open-page feature may only provide sound and in-game alerts.')
      else {
        const result = permission ? await permission : Notification.permission
        if (result !== 'granted') messages.push('Browser notifications are not allowed. Sound and in-game alerts still work; change your browser’s site permissions to allow notifications.')
      }
    } catch (err) {
      messages.push(`Browser notifications could not be enabled. ${err instanceof Error ? err.message : 'Check browser settings.'}`)
    }
    if (!alive.current) return
    setEnabled(true)
    setBusy(false)
    setNotice('Turn alerts are on for this visit. Keep the game open; browser notifications appear when you’re in another tab or window.')
    setError(messages.join(' '))
  }
  return <section className="turn-alerts" aria-label="Turn alerts">
    <button className="button secondary" aria-pressed={enabled} disabled={busy} onClick={() => { void toggle() }}>{enabled ? <BellOff size={16} /> : <Bell size={16} />}{busy ? 'Enabling alerts…' : enabled ? 'Turn alerts on · disable' : 'Enable turn alerts'}</button>
    <p role="status" aria-live="polite">{notice || 'Get a sound and an optional browser notification when your opponent needs your next move. Enable again after reloading.'}</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    <PhonePushControl onChange={setPhonePush} />
  </section>
}
