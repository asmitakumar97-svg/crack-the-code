import { expect, test } from '@playwright/test'

test('real local Duo room starts Memory Match and shares revealed cards across independent players', async ({ browser }) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 375, height: 844 } })))
  try {
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    await a.goto('/')
    await a.getByRole('button', { name: 'Create or join a Duo room' }).click()
    await a.getByLabel('Your name', { exact: true }).fill('Alice')
    await a.getByRole('button', { name: 'Create Duo room' }).click()
    await expect(a.getByRole('heading', { name: 'What’s the mood?' })).toBeVisible()
    const code = await a.locator('.game-nav strong').innerText()
    await b.goto(`/?room=${code}&play=duo`)
    await b.getByLabel('Your name', { exact: true }).fill('Bob')
    await b.getByRole('button', { name: 'Join Duo room' }).click()
    await a.getByRole('button', { name: /Memory Match.*Flip, remember/ }).click()
    await a.getByRole('button', { name: '16 tiles', exact: true }).click()
    await a.getByRole('button', { name: 'paintings', exact: true }).click()
    await expect(b.getByRole('button', { name: 'paintings', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await a.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(a.locator('.memory-tile')).toHaveCount(16)
    await a.getByRole('button', { name: 'Card 1: face down', exact: true }).click()
    await expect(b.locator('.memory-tile img')).toHaveCount(1)
    const artwork = await a.locator('.memory-tile').first().getAttribute('aria-label')
    await expect(b.locator('.memory-tile').first()).toHaveAttribute('aria-label', artwork!)
    await a.reload()
    await expect(a.locator('.memory-tile').first()).toHaveAttribute('aria-label', artwork!)
    await expect(a.locator('.game-nav strong')).toHaveText(code)
    for (const page of [a, b]) {
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  } finally { await Promise.all(contexts.map(context => context.close())) }
})
