import { expect, test, type BrowserContext } from '@playwright/test'
import { createECDH } from 'node:crypto'
import { call, createDatabase, roomPair } from '../database'
import { connect } from '../e2e/transport'

async function device(context: BrowserContext, permission: 'granted' | 'denied') {
  await context.addInitScript(({ permission }) => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test-device'
    let subscribed = localStorage.getItem('test-push-subscribed') === 'true'
    const subscription = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } }),
      unsubscribe: async () => { subscribed = false; localStorage.removeItem('test-push-subscribed'); return true },
    }
    const registration = { scope: new URL('/', location.origin).href, active: {}, getNotifications: async () => [], pushManager: {
      getSubscription: async () => subscribed ? subscription : null,
      subscribe: async (options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => {
        if (!options.userVisibleOnly || options.applicationServerKey.length !== 65) throw new Error('Invalid subscription options')
        subscribed = true
        localStorage.setItem('test-push-subscribed', 'true')
        return subscription
      },
    } }
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} })
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static permission = 'default'
      static requestPermission = async () => permission
    } })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      getRegistration: async () => subscribed ? registration : undefined,
      register: async (url: string, options: { scope: string }) => {
        if (url !== '/sw.js' || options.scope !== '/') throw new Error('Incorrect worker scope')
        return registration
      },
    } })
  }, { permission })
}

test('phone opt-in persists only an authorized subscription, restores after reload and disables cleanly', async ({ browser }) => {
  const db = await createDatabase()
  const pair = await roomPair(db, 'number', 'turns')
  const context = await browser.newContext({ viewport: { width: 375, height: 844 } })
  try {
    const ecdh = createECDH('prime256v1')
    const publicKey = ecdh.generateKeys().toString('base64url')
    await db.query("insert into private.push_settings(public_key,dispatch_url,dispatch_token) values($1,'https://wxmrxcnfivgkmhdhedwf.supabase.co/functions/v1/turn-push',repeat('x',40))", [publicKey])
    await connect(context, db, true, pair.a)
    await device(context, 'granted')
    await context.addInitScript(room => localStorage.setItem('crack-the-code.room', room), pair.room)
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Enable phone notifications', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Phone notifications on · disable', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect((await db.query<{ user_id: string }>('select user_id from private.push_subscriptions')).rows).toEqual([{ user_id: pair.a }])
    await page.reload()
    await expect(page.getByRole('button', { name: 'Phone notifications on · disable', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Phone notifications on · disable', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Enable phone notifications', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect((await db.query('select * from private.push_subscriptions')).rows).toHaveLength(0)
    expect(await call(db, pair.a, 'get_push_subscription_status', ['https://fcm.googleapis.com/fcm/send/test-device'])).toHaveProperty('enabled', false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await context.close(); await db.close() }
})

test('phone permission denial never registers a device or shows success', async ({ browser }) => {
  const db = await createDatabase()
  const pair = await roomPair(db, 'number', 'turns')
  const context = await browser.newContext()
  try {
    await connect(context, db, true, pair.a)
    await device(context, 'denied')
    await context.addInitScript(room => localStorage.setItem('crack-the-code.room', room), pair.room)
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Enable phone notifications', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Allow notifications')
    await expect(page.getByRole('button', { name: 'Enable phone notifications', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect((await db.query('select * from private.push_subscriptions')).rows).toHaveLength(0)
  } finally { await context.close(); await db.close() }
})
