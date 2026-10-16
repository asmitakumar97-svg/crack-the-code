import { expect, test } from '@playwright/test'

test('real local solo word challenge stops after six guesses and can restart without a room', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Play solo', exact: true }).click()
  await page.getByRole('button', { name: 'Word Lock', exact: true }).click()
  await page.getByRole('button', { name: 'Start solo puzzle', exact: true }).click()
  for (let attempt = 1; attempt <= 6; attempt++) {
    await expect(page.getByLabel('Your guess', { exact: true })).toBeVisible()
    await page.getByLabel('Your guess', { exact: true }).fill('FRUITS')
    await page.getByRole('button', { name: 'Try word', exact: true }).click()
    await expect(page.locator('.history-row')).toHaveCount(attempt)
    if (attempt < 6) await expect(page.getByLabel('Your guess', { exact: true })).toHaveValue('')
    if (attempt === 2) {
      await page.reload()
      await expect(page.locator('.history-row')).toHaveCount(2)
    }
  }
  await expect(page.getByRole('heading', { name: 'Out of guesses.', exact: true })).toBeVisible()
  await expect(page.locator('.solo-reveal .tile')).toHaveCount(6)
  await expect(page.getByLabel('Your guess', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Play again', exact: true }).click()
  await expect(page.getByLabel('Your guess', { exact: true })).toBeVisible()
  await expect(page.locator('.history-row')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to home', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Crack the Code', exact: true })).toBeVisible()
})

test('real local timed solo keeps accepting valid words beyond six guesses', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Play solo', exact: true }).click()
  await page.getByRole('button', { name: 'Word Lock', exact: true }).click()
  await page.getByRole('button', { name: /^3-minute timer/ }).click()
  await page.getByRole('button', { name: 'Start solo puzzle', exact: true }).click()
  for (let attempt = 1; attempt <= 9; attempt++) {
    await page.getByLabel('Your guess', { exact: true }).fill('FRUITS')
    await page.getByRole('button', { name: 'Try word', exact: true }).click()
    await expect(page.locator('.history-row')).toHaveCount(attempt)
    await expect(page.getByLabel('Your guess', { exact: true })).toHaveValue('')
  }
  await page.reload()
  await expect(page.locator('.history-row')).toHaveCount(9)
  await expect(page.getByLabel('Time remaining')).toBeVisible()
})
