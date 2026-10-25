import { expect, test } from '@playwright/test'
import { createDatabase, roomPair } from '../database'
import { connect } from './transport'

const photo = 'https://lh3.googleusercontent.com/a/test-profile=s96-c'
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#b8d9f4"/><circle cx="32" cy="30" r="18" fill="#735d9d"/></svg>'

test('readable lock brand and character avatars fit mobile and desktop in both themes', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext()
  try {
    await connect(context, db)
    const page = await context.newPage()
    await page.goto('/')
    const avatar = page.locator('.account-button .player-avatar')
    await expect(avatar).toHaveAttribute('aria-label', /avatar for You/)
    const identity = await avatar.getAttribute('aria-label')
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['pastel', 'dark']) {
        await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click()
        await expect(page.locator('.brand-wordmark')).toContainText('Duo Dash')
        expect(await page.locator('.brand-wordmark').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(22)
        expect(await page.locator('.brand-wordmark').evaluate(element => parseFloat(getComputedStyle(element).letterSpacing))).toBeGreaterThanOrEqual(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        for (const selector of ['.brand', '.header-actions']) {
          const box = await page.locator(selector).boundingBox()
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        }
        expect(await page.locator('.brand > img').evaluate(element => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true)
      }
    }
    await page.reload()
    await expect(avatar).toHaveAttribute('aria-label', identity!)
    await page.getByRole('button', { name: 'Player account and bet history', exact: true }).click()
    await expect(page.locator('.account-identity .player-avatar')).toHaveAttribute('aria-label', identity!)
    await expect(page.getByRole('heading', { name: 'Guest player', exact: true })).toBeVisible()
  } finally { await context.close(); await db.close() }
})

test('Google photo appears in the header, account and both room views; failed photos become characters', async ({ browser }) => {
  const db = await createDatabase()
  const pair = await roomPair(db)
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  try {
    await connect(contexts[0], db, false, pair.a, { avatarUrl: photo })
    await connect(contexts[1], db, true, pair.b)
    for (const context of contexts) {
      await context.route(photo, route => route.fulfill({ contentType: 'image/svg+xml', body: image }))
      await context.addInitScript(({ room }) => localStorage.setItem('crack-the-code.room', room), { room: pair.room })
    }
    const pages = await Promise.all(contexts.map(context => context.newPage()))
    for (const page of pages) {
      await page.goto('/')
      await expect(page.locator('.scoreboard .player-avatar img')).toHaveCount(1)
      await expect(page.getByRole('img', { name: "Alice's Google profile photo", exact: true })).toBeVisible()
      await expect(page.locator('.scoreboard .player-avatar svg')).toHaveCount(1)
    }
    await expect(pages[0].locator('.account-button .player-avatar img')).toHaveAttribute('src', photo)
    await expect(pages[1].locator('.account-button .player-avatar svg')).toHaveCount(1)
    await pages[0].getByRole('button', { name: 'Player account and bet history', exact: true }).click()
    await expect(pages[0].locator('.account-identity .player-avatar img')).toHaveAttribute('src', photo)
    await expect(pages[0].getByRole('heading', { name: 'Account connected', exact: true })).toBeVisible()
    await contexts[0].route(photo, route => route.fulfill({ status: 404, body: 'Not found' }))
    await pages[0].reload()
    await expect(pages[0].locator('.account-button .player-avatar svg')).toHaveCount(1)
    await expect(pages[0].locator('.scoreboard .player-avatar svg')).toHaveCount(2)
    await expect(pages[0].getByRole('status').filter({ hasText: 'Profile photo unavailable.' }).first()).toBeAttached()
    await expect(pages[0].getByRole('img', { name: /avatar for Alice/ })).toBeVisible()
    await expect(pages[1].getByRole('img', { name: "Alice's Google profile photo", exact: true })).toBeVisible()
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})
