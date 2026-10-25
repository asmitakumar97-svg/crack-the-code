import { expect, test } from '@playwright/test'
import { createDatabase } from '../database'
import { connect } from './transport'

test('solo Memory Match offers difficulty, plays a private computer turn, recovers and replays', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext({ viewport: { width: 320, height: 844 } })
  try {
    const player = await connect(context, db)
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Play solo', exact: true }).click()
    await page.getByRole('button', { name: /^Memory Match You vs computer$/ }).click()
    await expect(page.getByRole('heading', { name: 'Memory Match · solo', exact: true })).toBeVisible()
    await expect(page.getByLabel('Your name', { exact: true })).toHaveCount(0)
    for (const level of ['easy', 'medium', 'hard']) {
      await page.getByRole('button', { name: `${level} computer`, exact: true }).click()
      await expect(page.getByRole('button', { name: `${level} computer`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
    await page.getByRole('button', { name: '12 tiles', exact: true }).click()
    await page.getByRole('button', { name: 'florals', exact: true }).click()
    await page.getByRole('button', { name: 'Play against computer', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your turn to flip.', exact: true })).toBeVisible()
    await expect(page.locator('.memory-tile img')).toHaveCount(0)
    const saved = (await db.query<{ id: string; deck: number[] }>("select id,board->'deck' as deck from private.solo_boards where user_id=$1", [player])).rows[0]
    const other = saved.deck.findIndex(value => value !== saved.deck[0])
    await page.getByRole('button', { name: 'Card 1: face down', exact: true }).click()
    await page.getByRole('button', { name: `Card ${other + 1}: face down`, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Take a good look…', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Computer is flipping.', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Card.*face down$/ }).first()).toBeDisabled()
    await expect.poll(async () => (await db.query<{ moves: number }>("select (board->>'moves')::integer as moves from private.solo_boards where id=$1", [saved.id])).rows[0].moves).toBeGreaterThanOrEqual(3)
    await page.reload()
    await expect(page.locator('.memory-tile')).toHaveCount(12)
    expect(new URL(page.url()).searchParams.get('soloGame')).toBe('memory')
    const computer = '00000000-0000-0000-0000-000000000000'
    const lastPair = saved.deck.flatMap((value, index) => value === saved.deck[0] ? [index] : [])
    const matched = saved.deck.flatMap((_, index) => lastPair.includes(index) ? [] : [index])
    await db.query(`update private.solo_boards set board=board||jsonb_build_object('turn_user',$2::text,'matched',$3::jsonb,'flipped','[]'::jsonb,
      'reveal_until',null,'scores',$4::jsonb),next_action_at=null,version=version+1 where id=$1`,
    [saved.id, player, JSON.stringify(matched), JSON.stringify({ [player]: 3, [computer]: 2 })])
    await expect(page.getByRole('heading', { name: 'Your turn to flip.', exact: true })).toBeVisible()
    for (const index of lastPair) await page.getByRole('button', { name: `Card ${index + 1}: face down`, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'You win!', exact: true })).toBeVisible()
    await expect(page.getByText('4 pairs', { exact: true })).toBeVisible()
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.setViewportSize({ width: 320, height: 844 })
    await page.screenshot({ path: test.info().outputPath('solo-memory-mobile.png'), fullPage: true })
    await page.getByRole('button', { name: 'Play again', exact: true }).click()
    await expect(page.getByRole('button', { name: 'hard computer', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '12 tiles', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Play against computer', exact: true }).click()
    await expect(page.locator('.memory-tile img')).toHaveCount(0)
    expect((await db.query('select id from public.rooms')).rows).toEqual([])
    await page.getByRole('button', { name: 'Back to home', exact: true }).click()
    expect(new URL(page.url()).searchParams.has('soloGame')).toBe(false)
    await expect(page.getByRole('heading', { name: 'Duo Dash', exact: true })).toBeVisible()
  } finally { await context.close(); await db.close() }
})

test('solo Dots & Boxes rolls and draws for the computer, persists and completes a capped final turn', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const player = await connect(context, db)
    const page = await context.newPage()
    await page.goto('/?play=solo&soloGame=dots')
    await page.getByRole('button', { name: 'easy computer', exact: true }).click()
    await page.getByRole('button', { name: '10 by 10 dots', exact: true }).click()
    await page.getByRole('button', { name: 'Play against computer', exact: true }).click()
    await expect(page.locator('.dots-edge')).toHaveCount(180)
    await page.getByRole('button', { name: 'Roll D8', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'You are rolling…', exact: true })).toBeVisible()
    const first = page.getByRole('button', { name: 'Horizontal line row 1 column 1', exact: true })
    await expect(first).toBeEnabled()
    const roll = Number(await page.locator('.dots-die text').textContent())
    for (let i = 0; i < roll; i++) await page.getByRole('button', { name: `Horizontal line row 1 column ${i + 1}`, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Computer is rolling…', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Roll D8', exact: true })).toBeDisabled()
    await expect(page.locator('.dots-edge.drawn')).not.toHaveCount(roll)
    const saved = (await db.query<{ id: string; computer: string }>("select id,board->>'turn_user' as computer from private.solo_boards where user_id=$1", [player])).rows[0]
    await page.reload()
    await expect(page.locator('.dots-edge')).toHaveCount(180)
    await expect(page.locator('.solo-computer-status')).toContainText('easy')
    const computer = '00000000-0000-0000-0000-000000000000'
    const edges: (string | null)[] = Array(180).fill(computer)
    edges[179] = null
    const boxes = Array.from({ length: 81 }, (_, i) => i < 40 ? player : i < 80 ? computer : null)
    await db.query(`update private.solo_boards set board=board||jsonb_build_object('turn_user',$2::text,'edges',$3::jsonb,'boxes',$4::jsonb,
      'scores',$5::jsonb,'remaining',0,'roll_until',null),next_action_at=null,version=version+1 where id=$1`,
    [saved.id, player, JSON.stringify(edges), JSON.stringify(boxes), JSON.stringify({ [player]: 40, [computer]: 40 })])
    await expect(page.locator('.dots-edge.drawn')).toHaveCount(179)
    await expect(page.getByRole('heading', { name: 'Your turn to roll.', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Roll D8', exact: true }).click()
    const last = page.getByRole('button', { name: 'Vertical line row 9 column 10', exact: true })
    await expect(last).toBeEnabled()
    await expect(page.locator('.dots-roll-copy')).toContainText('1 line left for You.')
    await last.click()
    await expect(page.getByRole('heading', { name: 'You win!', exact: true })).toBeVisible()
    await expect(page.getByText('41 boxes', { exact: true })).toBeVisible()
    await expect(page.locator('.dots-box')).toHaveCount(81)
    await page.screenshot({ path: test.info().outputPath('solo-dots-mobile.png'), fullPage: true })
    await page.getByRole('button', { name: 'Play again', exact: true }).click()
    await expect(page.getByRole('button', { name: 'easy computer', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: /^Crack the Code A puzzle just for you$/ }).click()
    await expect(page.getByRole('heading', { name: 'Crack it solo.', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Start solo puzzle', exact: true }).click()
    await expect(page.getByLabel('Your guess', { exact: true })).toBeVisible()
  } finally { await context.close(); await db.close() }
})
