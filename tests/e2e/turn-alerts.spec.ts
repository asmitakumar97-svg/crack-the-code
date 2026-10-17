import { expect, test, type BrowserContext } from '@playwright/test'
import { call, createDatabase, launch, roomPair, state } from '../database'
import { connect } from './transport'

async function mockAlerts(context: BrowserContext, permission: 'granted' | 'denied' = 'granted') {
  await context.addInitScript(({ permission }) => {
    const events: { body?: string; tag?: string }[] = []
    let sounds = 0
    Object.defineProperty(window, '__turnAlertTest', { value: { events, get sounds() { return sounds } } })
    Object.defineProperty(document, 'hasFocus', { value: () => false })
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static permission = permission
      static requestPermission = async () => permission
      constructor(_title: string, options: { body?: string; tag?: string }) { events.push(options) }
      close() {}
    } })
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: class {
      state = 'running'
      currentTime = 0
      destination = {}
      resume() { return Promise.resolve() }
      close() { this.state = 'closed'; return Promise.resolve() }
      createOscillator() {
        return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() { sounds++ }, stop() {} }
      }
      createGain() {
        return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }
      }
    } })
  }, { permission })
}
async function counts(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const test = Reflect.get(window, '__turnAlertTest') as { events: { body: string }[]; sounds: number }
    return { events: test.events, sounds: test.sounds }
  })
}

test('opt-in turn alerts notify the defender once, reveal no guess, and do not alert after your own clues', async ({ browser }) => {
  const db = await createDatabase()
  const pair = await roomPair(db, 'number', 'turns')
  const context = await browser.newContext({ viewport: { width: 375, height: 844 } })
  try {
    await connect(context, db, true, pair.b)
    await mockAlerts(context)
    await context.addInitScript(room => localStorage.setItem('crack-the-code.room', room), pair.room)
    await call(db, pair.a, 'set_secret', [pair.room, '1122'])
    await call(db, pair.b, 'set_secret', [pair.room, '3344'])
    await launch(db, pair)
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Enable turn alerts', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Turn alerts on · disable', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect((await counts(page)).events).toHaveLength(0)
    await call(db, pair.a, 'submit_guess', [pair.room, '0000', 1])
    await expect(page.getByRole('heading', { name: 'Your clues, please.', exact: true })).toBeVisible()
    await expect.poll(async () => (await counts(page)).events.length).toBe(1)
    expect((await counts(page)).sounds).toBe(1)
    expect(JSON.stringify((await counts(page)).events)).not.toMatch(/0000|1122|3344|Alice|Bob/)
    await db.query('update public.rooms set version=version+1 where id=$1', [pair.room])
    await page.getByRole('button', { name: 'Use dark theme', exact: true }).click()
    expect((await counts(page)).events).toHaveLength(1)
    await page.getByRole('button', { name: 'Check & send hints', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your turn.', exact: true })).toBeVisible()
    expect((await counts(page)).events).toHaveLength(1)
    await page.getByRole('button', { name: 'Turn alerts on · disable', exact: true }).click()
    await page.getByLabel('Your guess', { exact: true }).fill('0000')
    await page.getByRole('button', { name: 'Try code', exact: true }).click()
    const pending = (await state(db, pair.a, pair.room)).pending_guess!
    await call(db, pair.a, 'submit_hints', [pair.room, pending.id, Array(4).fill('miss')])
    await call(db, pair.a, 'submit_guess', [pair.room, '0001', 2])
    await expect(page.getByRole('heading', { name: 'Your clues, please.', exact: true })).toBeVisible()
    expect((await counts(page)).events).toHaveLength(1)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Enable turn alerts', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect((await counts(page)).events).toHaveLength(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await context.close(); await db.close() }
})

test('blocked notifications retain sound alerts and clearly explain the permission and phone setup', async ({ browser }) => {
  const db = await createDatabase()
  const pair = await roomPair(db, 'number', 'turns')
  const context = await browser.newContext()
  try {
    await connect(context, db, true, pair.a)
    await mockAlerts(context, 'denied')
    await context.addInitScript(room => localStorage.setItem('crack-the-code.room', room), pair.room)
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Enable turn alerts', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Browser notifications are not allowed')
    await expect(page.getByRole('button', { name: 'Turn alerts on · disable', exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Enable phone notifications', exact: true })).toBeDisabled()
    await expect(page.getByText('Phone notifications need server setup', { exact: false })).toBeVisible()
  } finally { await context.close(); await db.close() }
})

test('notification links open the authorized target room instead of a different saved room', async ({ browser }) => {
  const db = await createDatabase()
  const pair = await roomPair(db, 'number', 'turns')
  const context = await browser.newContext()
  try {
    await connect(context, db, true, pair.a)
    const target = await call<string>(db, pair.a, 'create_room', ['Alice', 'number', 'low', '', 'turns'])
    const code = (await state(db, pair.a, target)).room.code
    await context.addInitScript(room => localStorage.setItem('crack-the-code.room', room), pair.room)
    const page = await context.newPage()
    await page.goto(`/?room=${code}&notificationRoom=${target}`)
    await expect(page.locator('.room-code-block.large strong')).toHaveText(code)
    expect(await page.evaluate(() => localStorage.getItem('crack-the-code.room'))).toBe(target)
    await page.getByRole('button', { name: 'Go home', exact: true }).click()
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Crack the Code', exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.has('notificationRoom')).toBe(false)
  } finally { await context.close(); await db.close() }
})
