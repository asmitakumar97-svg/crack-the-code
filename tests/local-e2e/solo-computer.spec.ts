import { expect, test } from '@playwright/test'

for (const kind of ['memory', 'dots'] as const) {
  test(`real local solo ${kind} starts without a room and saves moves across reloads`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 844 } })
    try {
      const page = await context.newPage()
      await page.goto(`/?play=solo&soloGame=${kind}`)
      await expect(page.getByText('Local solo play', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'medium computer', exact: true }).click()
      await page.getByRole('button', { name: 'Play against computer', exact: true }).click()
      if (kind === 'memory') {
        await expect(page.locator('.memory-tile')).toHaveCount(16)
        await page.getByRole('button', { name: 'Card 1: face down', exact: true }).click()
        await expect(page.locator('.memory-tile img')).toHaveCount(1)
        const label = await page.locator('.memory-tile').first().getAttribute('aria-label')
        await page.reload()
        await expect(page.locator('.memory-tile').first()).toHaveAttribute('aria-label', label!)
      } else {
        await expect(page.locator('.dots-edge')).toHaveCount(180)
        await page.getByRole('button', { name: 'Roll D8', exact: true }).click()
        const line = page.getByRole('button', { name: 'Horizontal line row 1 column 1', exact: true })
        await expect(line).toBeEnabled()
        const roll = Number(await page.locator('.dots-die text').textContent())
        for (let i = 0; i < roll; i++) await page.getByRole('button', { name: `Horizontal line row 1 column ${i + 1}`, exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Computer is rolling…', exact: true })).toBeVisible()
        await expect(page.locator('.dots-edge.drawn')).not.toHaveCount(roll)
        await page.reload()
        await expect(page.getByRole('button', { name: 'Horizontal line row 1 column 1, drawn by You', exact: true })).toBeDisabled()
      }
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    } finally { await context.close() }
  })
}
