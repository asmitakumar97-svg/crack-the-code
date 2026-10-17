import { localPlay, rpc } from './supabase'
export const phonePushConfigured = import.meta.env.VITE_PHONE_PUSH_ENABLED === 'true'

export function phonePushSupported() {
  return !localPlay && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushRegistration() {
  if (!phonePushSupported()) return null
  const scope = new URL(import.meta.env.BASE_URL, location.origin).href
  const registration = await navigator.serviceWorker.getRegistration(scope)
  return registration?.scope === scope ? registration : null
}

export async function disablePhonePush() {
  const registration = await getPushRegistration()
  if (!registration) return
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await rpc('remove_push_subscription', { p_endpoint: subscription.endpoint })
  for (const notification of await registration.getNotifications()) notification.close()
  if (!await subscription.unsubscribe()) throw new Error('The browser could not remove this device’s push subscription. Please retry.')
}

export async function enablePhonePush(permission: Promise<NotificationPermission>) {
  if (!phonePushSupported()) throw new Error('Phone push is unavailable here. On iPhone, open the game in Safari, choose Share → Add to Home Screen, then open it from that icon. iOS 16.4 or later is required.')
  if (await permission !== 'granted') throw new Error('Allow notifications in this device’s site settings to enable phone push.')
  const settings = await rpc<{ publicKey: string } | null>('get_push_settings')
  if (!settings) throw new Error('Phone push is not configured on the server yet. Open-game sound alerts are still available.')
  const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  if (!registration.active) {
    await new Promise<void>((resolve, reject) => {
      const worker = registration.installing ?? registration.waiting
      if (!worker) { reject(new Error('The notification service worker did not start. Reload and try again.')); return }
      const changed = () => {
        if (worker.state === 'activated') { worker.removeEventListener('statechange', changed); resolve() }
        else if (worker.state === 'redundant') { worker.removeEventListener('statechange', changed); reject(new Error('The notification service worker could not activate.')) }
      }
      worker.addEventListener('statechange', changed)
      changed()
    })
  }
  const bytes = Uint8Array.from(atob(settings.publicKey.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0))
  const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
    userVisibleOnly: true, applicationServerKey: bytes,
  })
  const keys = subscription.toJSON().keys
  if (!keys?.p256dh || !keys.auth) throw new Error('The browser returned an incomplete push subscription.')
  await rpc('save_push_subscription', { p_endpoint: subscription.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth })
}
