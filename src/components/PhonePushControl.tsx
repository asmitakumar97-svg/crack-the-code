import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { disablePhonePush, enablePhonePush, getPushRegistration, phonePushConfigured, phonePushSupported } from '../lib/push'
import { localPlay, rpc } from '../lib/supabase'

export function PhonePushControl({ onChange }: { onChange: (enabled: boolean) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(phonePushConfigured)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!phonePushConfigured) return
    void getPushRegistration().then(async registration => {
      const subscription = await registration?.pushManager.getSubscription()
      const status = subscription ? await rpc<{ enabled: boolean; lastError: string | null }>('get_push_subscription_status', { p_endpoint: subscription.endpoint }) : null
      if (active) {
        setEnabled(Boolean(status?.enabled))
        onChange(Boolean(status?.enabled))
        if (status?.lastError) setError(status.lastError)
      }
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not check this device’s notifications.') })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [onChange])
  const toggle = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (enabled) await disablePhonePush()
      else await enablePhonePush(phonePushSupported() ? Notification.requestPermission() : Promise.resolve('denied'))
      setEnabled(!enabled)
      onChange(!enabled)
      setMessage(enabled ? 'Phone notifications are off on this device.' : 'Phone notifications are on for this player and device. Delivery depends on your device’s notification and Focus settings.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change phone notifications.')
    } finally { setBusy(false) }
  }
  return <div className="phone-push-control">
    <button className="button secondary" disabled={busy || checking || localPlay || !phonePushConfigured} aria-pressed={enabled} onClick={() => { void toggle() }}><Smartphone size={16} />{checking ? 'Checking phone alerts…' : busy ? 'Updating phone alerts…' : enabled ? 'Phone notifications on · disable' : 'Enable phone notifications'}</button>
    <p>{localPlay ? 'Phone push needs the hosted game, not the local development server.' : !phonePushConfigured ? 'Phone notifications need server setup before they can be enabled. Open-game turn alerts are available now.' : 'For alerts while using another app. On iPhone: Safari → Share → Add to Home Screen, then enable here from the Home Screen app.'}</p>
    {message && <p role="status">{message}</p>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>
}
