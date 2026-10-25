import { expect, test } from '@playwright/test'
import { createDatabase } from '../database'
import { connect } from './transport'

function luminance(color: string) {
  const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
    const channel = Number(value) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

test('welcome page names the game and offers accessible play choices across sizes and themes', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext()
  try {
    await connect(context, db)
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Crack the Code', exact: true })).toBeVisible()
    await expect(page.getByLabel('Your name', { exact: true })).toHaveCount(0)
    await expect(page.getByText('6-digit codes', { exact: true })).toBeVisible()
    await expect(page.locator('.landing-demo .tile')).toHaveCount(18)
    await expect(page.locator('.landing-code-row').last().locator('.tile')).toHaveClass(Array(6).fill('tile hit filled'))
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      for (const theme of ['pastel', 'dark']) {
        await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(await page.locator('#landing-title').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(48)
        const caption = await page.locator('.landing-caption').boundingBox()
        const sticker = await page.locator('.landing-sticker').boundingBox()
        expect(sticker!.y).toBeGreaterThanOrEqual(caption!.y + caption!.height)
        for (const name of ['Play with a friend', 'Play solo']) {
          const button = page.getByRole('button', { name, exact: true })
          await expect(button).toBeVisible()
          const colors = await button.evaluate(async element => {
            await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished))
            const style = getComputedStyle(element)
            return { foreground: style.color, background: style.backgroundColor }
          })
          const light = luminance(colors.foreground)
          const dark = luminance(colors.background)
          expect((Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05)).toBeGreaterThanOrEqual(4.5)
          const box = await button.boundingBox()
          expect(box!.height).toBeGreaterThanOrEqual(80)
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width)
          if (width <= 375) expect(box!.y + box!.height).toBeLessThanOrEqual(844)
        }
      }
    }
    await page.getByRole('button', { name: 'Learn the rules', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  } finally { await context.close(); await db.close() }
})

test('friend setup follows the welcome choice, survives reload, and Home clears an invitation', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext()
  try {
    await connect(context, db)
    const page = await context.newPage()
    await page.goto('/?v=landing-check')
    await page.getByRole('button', { name: 'Play with a friend', exact: true }).click()
    await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('play')).toBe('friend')
    expect(new URL(page.url()).searchParams.get('v')).toBe('landing-check')
    await page.reload()
    await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back to home', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Crack the Code', exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.has('play')).toBe(false)
    await page.goto('/?room=ABC123&play=solo')
    await expect(page.getByLabel('Your name', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back to home', exact: true }).click()
    expect(new URL(page.url()).searchParams.has('room')).toBe(false)
    await page.getByRole('button', { name: 'Play solo', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Crack it solo.', exact: true })).toBeVisible()
    await expect(page.getByLabel('Your name', { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Crack it solo.', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back to home', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Crack the Code', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Crack the Code', exact: true })).toBeVisible()
  } finally { await context.close(); await db.close() }
})
