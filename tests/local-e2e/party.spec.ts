import { expect, test } from '@playwright/test'

for (const kind of ['bingo', 'cheat', 'hangman']) {
  test(`real local ${kind} starts, accepts a player action, advances the computer and saves on reload`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 844 } })
    try {
      const page = await context.newPage()
      await page.goto(`/?play=solo&soloGame=${kind}`)
      await page.getByRole('button', { name: 'easy computer', exact: true }).click()
      await page.getByRole('button', { name: 'Play against computer', exact: true }).click()
      await expect(page.locator(`.party-${kind}`)).toBeVisible()
      if (kind === 'bingo') {
        await page.getByRole('button', { name: 'Number 1', exact: true }).click()
        await expect(page.locator('.party-call-log')).toContainText('1')
        await expect(page.locator('.bingo-board .marked')).not.toHaveCount(1)
      } else if (kind === 'cheat') {
        await page.locator('.cheat-hand button').first().click()
        await page.getByRole('button', { name: 'Play 1 cards as A', exact: true }).click()
        await expect(page.locator('.cheat-table')).toContainText('You claim 1 × A')
        await expect(page.locator('.cheat-table')).not.toContainText('You claim 1 × A')
      } else {
        await page.getByLabel('Your secret word · 3–12 letters', { exact: true }).fill('MOON')
        await page.getByRole('button', { name: 'Lock my word', exact: true }).click()
        await page.getByRole('button', { name: 'Z', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'Computer is playing.', exact: true })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Your turn.', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Z', exact: true })).toBeDisabled()
      }
      await page.reload()
      await expect(page.locator(`.party-${kind}`)).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    } finally { await context.close() }
  })
}
