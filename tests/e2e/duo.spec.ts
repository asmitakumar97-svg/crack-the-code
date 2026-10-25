import { test, expect } from '@playwright/test'
import { call, createDatabase, state } from '../database'
import { connect } from './transport'

test('two mobile players choose tiles and theme, confirm, flip safely and switch games in the same room', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [alice, bob] = await Promise.all(contexts.map(context => connect(context, db)))
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    await a.goto('/')
    await a.getByRole('button', { name: 'Create or join a Duo room' }).click()
    await a.getByLabel('Your name', { exact: true }).fill('Alice')
    await a.getByRole('button', { name: 'Create Duo room' }).click()
    await expect(a.getByRole('heading', { name: 'What’s the mood?' })).toBeVisible()
    await expect(a.getByRole('button', { name: 'Confirm & play together' })).toBeDisabled()
    const room = (await db.query<{ id: string; code: string }>('select id,code from public.rooms')).rows[0]
    await b.goto(`/?room=${room.code}&play=duo`)
    await b.getByLabel('Your name', { exact: true }).fill('Bob')
    await b.getByRole('button', { name: 'Join Duo room' }).click()
    await expect(b.getByRole('heading', { name: 'What’s the mood?' })).toBeVisible()
    await a.getByRole('button', { name: /Memory Match.*Flip, remember/ }).click()
    await a.getByRole('button', { name: '24 tiles', exact: true }).click()
    await a.getByRole('button', { name: 'patterns', exact: true }).click()
    await expect(b.getByRole('button', { name: '24 tiles', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(b.getByRole('button', { name: 'patterns', exact: true })).toBeDisabled()
    await a.screenshot({ path: test.info().outputPath('duo-lobby-mobile.png'), fullPage: true })
    await a.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(a.getByRole('button', { name: 'Ready · waiting for your +1' })).toBeDisabled()
    await b.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(a.getByRole('group', { name: 'Memory Match board' })).toBeVisible()
    await expect(a.locator('.memory-tile')).toHaveCount(24)
    await expect(a.locator('.memory-tile img')).toHaveCount(0)
    await expect(a.locator('.memory-card-mark')).toHaveCount(24)
    expect(await a.locator('.memory-tile').allTextContents()).toEqual(Array(24).fill(''))
    expect(await a.locator('.memory-card-mark').first().evaluate(node => getComputedStyle(node).backgroundImage)).toContain('/duo.svg')
    await expect(a.getByRole('button', { name: 'Card 1: face down', exact: true })).toBeEnabled()
    await expect(b.getByRole('heading', { name: 'Alice is flipping.' })).toBeVisible()
    await expect(a.locator('.memory-player')).toHaveCount(2)
    await expect(a.locator('.memory-player .player-avatar')).toHaveCount(2)
    await expect(a.locator('.memory-player.active')).toContainText('Alice')
    await expect(b.locator('.memory-player.active')).toHaveClass(/memory-mint/)
    for (const avatar of await a.locator('.memory-player .player-avatar').all()) {
      const bounds = await avatar.boundingBox()
      expect(bounds!.width).toBe(52)
      expect(bounds!.height).toBe(52)
    }
    const playerBounds = await a.locator('.memory-scores').boundingBox()
    const instructionsBounds = await a.locator('#memory-instructions').boundingBox()
    expect(playerBounds!.height).toBeLessThan(180)
    expect(instructionsBounds!.y).toBeGreaterThanOrEqual(playerBounds!.y + playerBounds!.height)
    expect(await a.locator('.memory-player.active .player-avatar').evaluate(node => getComputedStyle(node).boxShadow)).not.toBe('none')
    const values = (await db.query<{ deck: number[] }>('select deck from private.memory_games')).rows[0].deck
    const other = values.findIndex(value => value !== values[0])
    await a.getByRole('button', { name: 'Card 1: face down', exact: true }).click()
    await expect(b.locator('.memory-tile img')).toHaveCount(1)
    await expect(b.locator('.memory-tile.face-up')).toHaveClass(/memory-mint/)
    await a.getByRole('button', { name: `Card ${other + 1}: face down`, exact: true }).click()
    await expect(a.locator('.memory-tile img')).toHaveCount(2)
    await expect(a.locator('.memory-tile.memory-mint')).toHaveCount(2)
    await expect(b.getByRole('heading', { name: 'Your turn to flip.' })).toBeVisible()
    await expect(b.locator('.memory-tile img')).toHaveCount(0)
    await expect(b.locator('.memory-player.active')).toContainText('Bob')
    await expect(b.locator('.memory-player.active')).toHaveClass(/memory-amber/)
    await b.reload()
    await expect(b.getByRole('heading', { name: 'Your turn to flip.' })).toBeVisible()
    expect((await state(db, bob, room.id)).memory!.scores).toEqual({ [alice]: 0, [bob]: 0 })
    for (const value of new Set(values)) {
      for (const index of values.flatMap((card, i) => card === value ? [i] : [])) {
        const memory = (await state(db, bob, room.id)).memory!
        await call(db, bob, 'flip_memory_card', [room.id, memory.session_id, memory.moves, index])
      }
    }
    await a.reload()
    await b.reload()
    await expect(a.getByRole('heading', { name: 'Bob wins!' })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Bob wins!' })).toBeVisible()
    await expect(a.locator('.memory-tile.matched')).toHaveCount(24)
    await expect(a.locator('.memory-tile.matched.memory-amber')).toHaveCount(24)
    await expect(b.locator('.memory-tile.matched.memory-amber')).toHaveCount(24)
    await a.screenshot({ path: test.info().outputPath('memory-mobile.png'), fullPage: true })
    expect(await a.locator('.memory-tile img').evaluateAll(imgs => imgs.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0))).toBe(true)
    await a.getByRole('button', { name: 'Choose the next game', exact: true }).click()
    await expect(b.getByRole('heading', { name: 'What’s the mood?' })).toBeVisible()
    await a.getByRole('button', { name: /Crack the Code.*Secret digits/ }).click()
    await a.getByRole('button', { name: 'Confirm & play together' }).click()
    await a.getByRole('button', { name: 'Word Lock', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Confirm & play together' })).toBeEnabled()
    await expect(b.getByRole('button', { name: 'Word Lock', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(b.locator('.duo-consent')).toContainText('Alice: reviewing')
    await a.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByRole('button', { name: 'Confirm & play together' }).click()
    for (const page of [a, b]) {
      await expect(page.getByLabel('Your secret word', { exact: true })).toBeVisible()
      await expect(page.getByText(room.code, { exact: true }).first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    expect((await state(db, alice, room.id)).players.map(player => player.user_id)).toEqual([alice, bob])
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})

test('Memory Match themes load locally, controls fit mobile and failed artwork is reported', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } })
  try {
    const alice = await connect(context, db)
    const bob = crypto.randomUUID()
    await db.query('insert into auth.users(id) values($1)', [bob])
    const room = await call<string>(db, alice, 'create_duo_room', ['Alice'])
    const code = (await state(db, alice, room)).room.code
    await call(db, bob, 'join_room', [code, 'Bob'])
    await context.addInitScript(id => localStorage.setItem('crack-the-code.room', id), room)
    const page = await context.newPage()
    await page.route('**/memory/patterns/*.jpg', route => route.abort())
    await page.goto('/')
    await page.getByRole('button', { name: /Memory Match.*Flip, remember/ }).click()
    for (const theme of ['paintings', 'florals', 'animals', 'patterns']) {
      await page.getByRole('button', { name: theme, exact: true }).click()
      await expect(page.getByRole('button', { name: theme, exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
    await page.getByRole('button', { name: '12 tiles', exact: true }).click()
    await expect(page.getByRole('button', { name: '12 tiles', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const current = await state(db, alice, room)
    await page.getByRole('button', { name: 'Confirm & play together' }).click()
    await call(db, bob, 'confirm_duo_game', [room, current.hub!.revision])
    await expect(page.locator('.memory-tile')).toHaveCount(12)
    await page.getByRole('button', { name: 'Card 1: face down', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('A picture could not load')
    await expect(page.locator('.memory-image-error')).toHaveCount(1)
    await expect(page.locator('.memory-art-title')).toHaveCount(0)
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['dark', 'pastel']) {
        await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
  } finally { await context.close(); await db.close() }
})
