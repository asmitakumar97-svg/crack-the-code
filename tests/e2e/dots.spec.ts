import { test, expect } from '@playwright/test'
import { call, createDatabase, state } from '../database'
import { connect } from './transport'

test('two players see the same D8 roll, each placed line, turn limits, reload and final tie', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [alice, bob] = await Promise.all(contexts.map(context => connect(context, db)))
    const room = await call<string>(db, alice, 'create_duo_room', ['Alice'])
    const initial = await state(db, alice, room)
    await call(db, bob, 'join_room', [initial.room.code, 'Bob'])
    await Promise.all(contexts.map(context => context.addInitScript(id => localStorage.setItem('crack-the-code.room', id), room)))
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    await Promise.all([a.goto('/'), b.goto('/')])
    await a.getByRole('button', { name: /Dots & Boxes.*An eight-sided/ }).click()
    await a.getByRole('button', { name: '15 by 15 dots', exact: true }).click()
    await expect(b.getByRole('button', { name: '15 by 15 dots', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(b.getByRole('button', { name: '15 by 15 dots', exact: true })).toBeDisabled()
    await a.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(a.getByRole('heading', { name: 'Your turn to roll.' })).toBeVisible()
    await expect(b.getByRole('button', { name: 'Roll D8', exact: true })).toBeDisabled()
    await expect(a.locator('.dots-edge')).toHaveCount(420)
    await expect(a.locator('.dots-dot')).toHaveCount(225)
    const first = a.getByRole('button', { name: 'Horizontal line row 1 column 1', exact: true })
    await expect(first).toBeDisabled()
    await a.getByRole('button', { name: 'Roll D8', exact: true }).click()
    await expect(a.getByRole('heading', { name: 'Alice is rolling…' })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Alice is rolling…' })).toBeVisible()
    await expect(first).toBeDisabled()
    const rolled = (await state(db, alice, room)).dots!.roll!
    await expect(a.locator('.dots-die text')).toHaveText(String(rolled))
    await expect(b.locator('.dots-die text')).toHaveText(String(rolled))
    await expect(first).toBeEnabled()
    await first.click()
    await expect(b.getByRole('button', { name: 'Horizontal line row 1 column 1, drawn by Alice', exact: true })).toHaveClass(/drawn/)
    for (let edge = 1; edge < rolled; edge++) {
      await a.getByRole('button', { name: `Horizontal line row 1 column ${edge + 1}`, exact: true }).click()
    }
    await expect(b.getByRole('heading', { name: 'Your turn to roll.' })).toBeVisible()
    await expect(a.getByRole('button', { name: 'Roll D8', exact: true })).toBeDisabled()
    await b.reload()
    await expect(b.getByRole('heading', { name: 'Your turn to roll.' })).toBeVisible()
    await expect(b.locator('.dots-edge.drawn')).toHaveCount(rolled)
    await b.screenshot({ path: test.info().outputPath('dots-mobile.png'), fullPage: true })
    const edges: (string | null)[] = Array(420).fill(alice)
    edges[419] = null
    const boxes = Array.from({ length: 196 }, (_, i) => i < 98 ? alice : i < 195 ? bob : null)
    await db.query('update private.dots_games set edges=$2,boxes=$3,scores=$4,moves=moves+1 where room_id=$1', [room, edges, boxes, JSON.stringify({ [alice]: 98, [bob]: 97 })])
    await expect(b.locator('.dots-edge.drawn')).toHaveCount(419)
    await b.getByRole('button', { name: 'Roll D8', exact: true }).click()
    const last = b.getByRole('button', { name: 'Vertical line row 14 column 15', exact: true })
    await expect(last).toBeEnabled()
    await expect(b.locator('.dots-roll-copy')).toContainText('1 line left for Bob.')
    await last.click()
    for (const page of [a, b]) {
      await expect(page.getByRole('heading', { name: 'A brilliant tie.' })).toBeVisible()
      await expect(page.getByText('98 boxes', { exact: true })).toHaveCount(2)
      await expect(page.locator('.dots-box')).toHaveCount(196)
    }
    await expect(b.getByRole('button', { name: 'Choose the next game', exact: true })).toHaveCount(0)
    await a.getByRole('button', { name: 'Choose the next game', exact: true }).click()
    await expect(b.getByRole('heading', { name: 'What’s the mood?' })).toBeVisible()
    await a.getByRole('button', { name: /Memory Match.*Flip, remember/ }).click()
    await a.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(b.getByRole('group', { name: 'Memory Match board' })).toBeVisible()
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})

test('all board sizes support zoom, keyboard drawing, both themes and mobile without page overflow', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } })
  try {
    const alice = await connect(context, db)
    const bob = crypto.randomUUID()
    await db.query('insert into auth.users(id) values($1)', [bob])
    const room = await call<string>(db, alice, 'create_duo_room', ['Alice'])
    const initial = await state(db, alice, room)
    await call(db, bob, 'join_room', [initial.room.code, 'Bob'])
    await context.addInitScript(id => localStorage.setItem('crack-the-code.room', id), room)
    const page = await context.newPage()
    for (const size of [10, 12, 15]) {
      const current = await state(db, alice, room)
      await call(db, alice, 'choose_duo_game', [room, current.hub!.revision, 'dots', 12, 'animals', 'number', 'turns', size])
      const revision = (await state(db, alice, room)).hub!.revision
      await call(db, alice, 'confirm_duo_game', [room, revision])
      await call(db, bob, 'confirm_duo_game', [room, revision])
      await page.goto('/')
      await expect(page.locator('.dots-edge')).toHaveCount(2 * size * (size - 1))
      await expect(page.locator('.dots-dot')).toHaveCount(size ** 2)
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        for (const theme of ['pastel', 'dark']) {
          await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        }
      }
      await page.setViewportSize({ width: 320, height: 844 })
      const before = await page.locator('.dots-grid').evaluate(el => el.getBoundingClientRect().width)
      await page.getByRole('button', { name: 'Zoom in board', exact: true }).click()
      expect(await page.locator('.dots-grid').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(before)
      await page.getByRole('button', { name: 'Zoom out board', exact: true }).click()
      await page.getByRole('button', { name: 'Roll D8', exact: true }).click()
      const first = page.getByRole('button', { name: 'Horizontal line row 1 column 1', exact: true })
      await expect(first).toBeEnabled()
      await first.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.dots-edge.drawn')).toHaveCount(1)
      await db.query('update private.dots_games set finished=true where room_id=$1', [room])
      await call(db, alice, 'open_duo_lobby', [room])
    }
  } finally { await context.close(); await db.close() }
})
