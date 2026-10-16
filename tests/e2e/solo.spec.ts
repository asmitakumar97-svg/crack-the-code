import { expect, test, type Page } from '@playwright/test'
import { createDatabase } from '../database'
import { connect } from './transport'

async function start(page: Page, mode: string, timed = false) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Play solo', exact: true }).click()
  await page.getByRole('button', { name: mode, exact: true }).click()
  if (timed) await page.getByRole('button', { name: /^3-minute timer/ }).click()
  await page.getByRole('button', { name: 'Start solo puzzle', exact: true }).click()
  await expect(page.getByLabel('Your guess', { exact: true })).toBeVisible()
}
async function guess(page: Page, value: string) {
  await page.getByLabel('Your guess', { exact: true }).fill(value)
  await page.getByRole('button', { name: /^Try (code|word)$/, exact: true }).click()
}

test('solo word clues are automatic, duplicate-safe, unrestricted and recover after reload', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true })
  try {
    await connect(context, db)
    const page = await context.newPage()
    await start(page, 'Word Lock')
    await db.exec("update private.solo_games set answer='SECRET'")
    await expect(page.getByLabel('Time remaining')).toHaveCount(0)
    await expect(page.getByRole('group', { name: 'Your word', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Lock my secret', exact: true })).toHaveCount(0)
    await guess(page, 'STREET')
    await expect(page.locator('.history-row .tile')).toHaveClass(['tile hit filled', 'tile miss filled', 'tile present filled', 'tile present filled', 'tile hit filled', 'tile hit filled'])
    await guess(page, 'NORMAL')
    await expect(page.locator('.history-row')).toHaveCount(2)
    await guess(page, 'XXXXXX')
    await expect(page.getByRole('alert')).toContainText('real six-letter word')
    await expect(page.locator('.history-row')).toHaveCount(2)
    await page.reload()
    await expect(page.locator('.history-row')).toHaveCount(2)
    await expect(page.getByLabel('Your guess', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Use dark theme', exact: true }).click()
    await guess(page, 'SECRET')
    await expect(page.getByRole('heading', { name: 'You cracked it!', exact: true })).toBeVisible()
    await expect(page.locator('.solo-reveal .tile')).toHaveText([...'SECRET'])
    await expect(page.getByLabel('Your guess', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Play again', exact: true }).click()
    await expect(page.getByLabel('Your guess', { exact: true })).toBeVisible()
    await expect(page.locator('.history-row')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await context.close(); await db.close() }
})

test('solo number mode stops at exactly six guesses and reveals the code', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext()
  try {
    await connect(context, db)
    const page = await context.newPage()
    await start(page, 'Number Lock')
    await db.exec("update private.solo_games set answer='0011'")
    for (let attempt = 1; attempt <= 6; attempt++) {
      await guess(page, '0000')
      await expect(page.locator('.history-row')).toHaveCount(attempt)
      if (attempt < 6) await expect(page.getByLabel('Your guess', { exact: true })).toHaveValue('')
    }
    await expect(page.getByRole('heading', { name: 'Out of guesses.', exact: true })).toBeVisible()
    await expect(page.getByLabel('Your guess', { exact: true })).toHaveCount(0)
    await expect(page.locator('.solo-reveal .tile')).toHaveText([...'0011'])
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Out of guesses.', exact: true })).toBeVisible()
    await expect(page.locator('.history-row')).toHaveCount(6)
  } finally { await context.close(); await db.close() }
})

test('solo timer has unlimited guesses, survives navigation and reload, and stops at the server deadline', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext()))
  try {
    const id = await connect(contexts[0], db)
    await connect(contexts[1], db, true, id)
    const page = await contexts[0].newPage()
    await start(page, 'Number Lock', true)
    await db.exec("update private.solo_games set answer='9999'")
    const deadline = (await db.query<{ deadline: string }>('select deadline::text from private.solo_games')).rows[0].deadline
    for (let attempt = 1; attempt <= 9; attempt++) {
      await guess(page, '0000')
      await expect(page.locator('.history-row')).toHaveCount(attempt)
      await expect(page.getByLabel('Your guess', { exact: true })).toHaveValue('')
    }
    await expect(page.getByLabel('Time remaining')).toBeVisible()
    await page.getByRole('button', { name: 'Back to home', exact: true }).click()
    await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Play solo', exact: true }).click()
    await expect(page.locator('.history-row')).toHaveCount(9)
    await page.reload()
    await expect(page.locator('.history-row')).toHaveCount(9)
    expect((await db.query<{ deadline: string }>('select deadline::text from private.solo_games')).rows[0].deadline).toBe(deadline)
    const otherSession = await contexts[1].newPage()
    await otherSession.goto('/')
    await otherSession.getByRole('button', { name: 'Play solo', exact: true }).click()
    await expect(otherSession.locator('.history-row')).toHaveCount(9)
    await db.exec("update private.solo_games set started_at=clock_timestamp()-interval '180 seconds',deadline=clock_timestamp()")
    await page.reload()
    for (const view of [page, otherSession]) {
      await expect(view.getByRole('heading', { name: 'Time’s up.', exact: true })).toBeVisible()
      await expect(view.getByLabel('Your guess', { exact: true })).toHaveCount(0)
      await expect(view.locator('.solo-reveal .tile')).toHaveText([...'9999'])
    }
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})

test('friend invitation opens multiplayer even after the player previously chose solo', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext()
  try {
    await connect(context, db)
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Play solo', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Crack it solo.', exact: true })).toBeVisible()
    await page.goto('/?room=ABC123')
    await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play with a friend', exact: true })).toHaveAttribute('aria-pressed', 'true')
  } finally { await context.close(); await db.close() }
})
