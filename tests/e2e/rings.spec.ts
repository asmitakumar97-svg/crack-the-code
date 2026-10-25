import { expect, test } from '@playwright/test'
import { call, createDatabase, state } from '../database'
import { connect } from './transport'

function apply(rods: number[][], code: number) {
  const next = rods.map(rod => [...rod])
  next[code % 5].push(next[Math.floor(code / 5)].pop()!)
  return next
}

test('shared Ring Rush starts identical mobile boards, synchronizes moves/restarts, preserves reloads and declares a winner', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 320, height: 844 } })))
  try {
    const [alice, bob] = await Promise.all(contexts.map(context => connect(context, db)))
    const room = await call<string>(db, alice, 'create_duo_room', ['Alice'])
    const initial = await state(db, alice, room)
    await call(db, bob, 'join_room', [initial.room.code, 'Bob'])
    await Promise.all(contexts.map(context => context.addInitScript(id => localStorage.setItem('crack-the-code.room', id), room)))
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    await Promise.all([a.goto('/'), b.goto('/')])
    await a.getByRole('button', { name: /Ring Rush.*Same shuffled rings/ }).click()
    await expect(b.getByRole('button', { name: /Ring Rush.*Same shuffled rings/ })).toHaveAttribute('aria-pressed', 'true')
    await a.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByRole('button', { name: 'Confirm & play together' }).click()
    await expect(a.getByRole('heading', { name: /^Get ready:/ })).toBeVisible()
    await expect(a.locator('.ring-piece')).toHaveCount(20)
    await expect(a.locator('.ring-rod')).toHaveCount(5)
    await expect(a.getByRole('button', { name: 'Restart my rings', exact: true })).toBeDisabled()
    const raw = (await db.query<{ board: { boards: Record<string, number[][]>; solution: number[] } }>('select board from private.ring_games where room_id=$1', [room])).rows[0].board
    expect(await a.locator('.ring-rod').evaluateAll(rods => rods.map(rod => rod.getAttribute('aria-description')))).toEqual(await b.locator('.ring-rod').evaluateAll(rods => rods.map(rod => rod.getAttribute('aria-description'))))
    const first = raw.solution[0]
    const source = a.locator('.ring-rod').nth(Math.floor(first / 5)), target = a.locator('.ring-rod').nth(first % 5)
    await expect(source).toBeEnabled()
    await source.click()
    await expect(source).toHaveAttribute('aria-pressed', 'true')
    await expect(a.locator('.ring-piece.lifted')).toHaveCount(1)
    await expect(target).toHaveClass(/can-receive/)
    await target.click()
    await expect(b.locator('.ring-progress > div').first()).toContainText('1 moves')
    await a.getByRole('button', { name: 'Restart my rings', exact: true }).click()
    await expect(a.locator('.ring-race-stats')).toContainText('1 moves · 1 restarts')
    await b.locator('.ring-rod').nth(Math.floor(first / 5)).click()
    await b.locator('.ring-rod').nth(first % 5).click()
    await expect(a.locator('.ring-progress > div').nth(1)).toContainText('1 moves')
    await a.reload()
    await expect(a.locator('.ring-race-stats')).toContainText('1 moves · 1 restarts')
    await expect(a.locator('.ring-piece')).toHaveCount(20)
    let rods = raw.boards[alice]
    for (const code of raw.solution.slice(0, -1)) rods = apply(rods, code)
    const count = raw.solution.length + 1
    await db.query("update private.ring_games set board=jsonb_set(jsonb_set(board,array['boards',$2],$3::jsonb),array['moves',$2],to_jsonb($4::integer)) where room_id=$1", [room, alice, JSON.stringify(rods), count])
    await db.query('update public.rooms set version=version+1 where id=$1', [room])
    await expect(a.locator('.ring-race-stats')).toContainText(`${count - 1} moves`)
    const last = raw.solution.at(-1)!
    await a.locator('.ring-rod').nth(Math.floor(last / 5)).click()
    await a.locator('.ring-rod').nth(last % 5).click()
    await expect(a.getByRole('heading', { name: 'You win!', exact: true })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Alice wins!', exact: true })).toBeVisible()
    await expect(b.locator('.ring-progress > div').first()).toContainText('4 / 4 colours sorted')
    for (const width of [320, 390, 768, 1280]) {
      await a.setViewportSize({ width, height: 844 })
      for (const theme of ['dark', 'pastel']) {
        await a.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click()
        expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
    await a.setViewportSize({ width: 320, height: 844 })
    await a.screenshot({ path: test.info().outputPath('ring-rush-mobile.png'), fullPage: true })
    await a.getByRole('button', { name: 'Choose the next game', exact: true }).click()
    await expect(b.getByRole('heading', { name: 'What’s the mood?' })).toBeVisible()
    await expect(a.getByRole('button', { name: 'Enable turn alerts', exact: true })).toHaveCount(0)
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})

test('solo Ring Rush supports difficulty, real computer progress, late-return loss, replay and a human win', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext({ viewport: { width: 375, height: 844 } })
  try {
    const player = await connect(context, db)
    const page = await context.newPage()
    await page.goto('/?play=solo&soloGame=ring')
    await expect(page.getByRole('heading', { name: 'Ring Rush · solo', exact: true })).toBeVisible()
    for (const difficulty of ['easy', 'medium', 'hard']) {
      await page.getByRole('button', { name: `${difficulty} computer`, exact: true }).click()
      await expect(page.getByRole('button', { name: `${difficulty} computer`, exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
    await page.getByRole('button', { name: 'Play against computer', exact: true }).click()
    await expect(page.locator('.ring-piece')).toHaveCount(20)
    const saved = (await db.query<{ id: string; board: { boards: Record<string, number[][]>; solution: number[] } }>('select id,board from private.solo_boards where user_id=$1', [player])).rows[0]
    const first = saved.board.solution[0]
    await expect(page.locator('.ring-rod').nth(Math.floor(first / 5))).toBeEnabled()
    await page.locator('.ring-rod').nth(Math.floor(first / 5)).focus()
    await page.keyboard.press('Enter')
    await page.locator('.ring-rod').nth(first % 5).click()
    await expect(page.locator('.ring-race-stats')).toContainText('1 moves')
    await expect(page.locator('.ring-progress > div').nth(1)).not.toContainText('0 moves')
    await page.reload()
    await expect(page.locator('.ring-race-stats')).toContainText('1 moves')
    await db.query("update private.solo_boards set board=jsonb_set(board,'{started_at}',to_jsonb(clock_timestamp()-interval '200 seconds')) where id=$1", [saved.id])
    await expect(page.getByRole('heading', { name: 'Computer wins!', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Play again', exact: true }).click()
    await expect(page.getByRole('button', { name: 'hard computer', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'easy computer', exact: true }).click()
    await page.getByRole('button', { name: 'Play against computer', exact: true }).click()
    await expect(page.getByRole('heading', { name: /^Get ready:/ })).toBeVisible()
    const next = (await db.query<{ id: string; board: { boards: Record<string, number[][]>; solution: number[] } }>("select id,board from private.solo_boards where user_id=$1 and status='playing'", [player])).rows[0]
    let rods = next.board.boards[player]
    for (const code of next.board.solution.slice(0, -1)) rods = apply(rods, code)
    await db.query("update private.solo_boards set board=jsonb_set(jsonb_set(jsonb_set(board,array['boards',$2],$3::jsonb),array['moves',$2],to_jsonb($4::integer)),'{started_at}',to_jsonb(clock_timestamp()-interval '100 milliseconds')),version=version+1 where id=$1", [next.id, player, JSON.stringify(rods), next.board.solution.length - 1])
    await expect(page.locator('.ring-race-stats')).toContainText(`${next.board.solution.length - 1} moves`)
    const last = next.board.solution.at(-1)!
    await page.locator('.ring-rod').nth(Math.floor(last / 5)).click()
    await page.locator('.ring-rod').nth(last % 5).click()
    await expect(page.getByRole('heading', { name: 'You win!', exact: true })).toBeVisible()
    await expect(page.locator('.ring-progress > div').first()).toContainText('4 / 4 colours sorted')
    await page.screenshot({ path: test.info().outputPath('ring-solo-mobile.png'), fullPage: true })
    expect((await db.query('select id from public.rooms')).rows).toEqual([])
  } finally { await context.close(); await db.close() }
})
