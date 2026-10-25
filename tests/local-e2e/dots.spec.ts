import { expect, test } from '@playwright/test'

test('real local D8 game shares dice, placed lines and the next turn between two players', async ({ browser }) => {
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
    await a.getByRole('button', { name: /Dots & Boxes.*An eight-sided/ }).click()
    await a.getByRole('button', { name: '12 by 12 dots', exact: true }).click()
    await expect(b.getByRole('button', { name: '12 by 12 dots', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await a.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(a.locator('.dots-edge')).toHaveCount(264)
    await a.getByRole('button', { name: 'Roll D8', exact: true }).click()
    await expect(b.getByRole('heading', { name: 'Alice is rolling…' })).toBeVisible()
    const first = a.getByRole('button', { name: 'Horizontal line row 1 column 1', exact: true })
    await expect(first).toBeEnabled()
    const roll = Number(await a.locator('.dots-die text').textContent())
    expect(roll).toBeGreaterThanOrEqual(1)
    expect(roll).toBeLessThanOrEqual(8)
    await expect(b.locator('.dots-die text')).toHaveText(String(roll))
    for (let index = 1; index <= roll; index++) {
      await a.getByRole('button', { name: `Horizontal line row 1 column ${index}`, exact: true }).click()
      await expect(b.locator('.dots-edge.drawn')).toHaveCount(index)
    }
    await expect(b.getByRole('heading', { name: 'Your turn to roll.' })).toBeVisible()
    await b.reload()
    await expect(b.locator('.dots-edge.drawn')).toHaveCount(roll)
    await expect(b.getByRole('heading', { name: 'Your turn to roll.' })).toBeVisible()
    for (const page of [a, b]) {
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  } finally { await Promise.all(contexts.map(context => context.close())) }
})
