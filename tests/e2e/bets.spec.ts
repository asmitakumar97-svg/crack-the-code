import { expect, test } from '@playwright/test'
import { call, createDatabase, state } from '../database'
import { connect } from './transport'

test('optional game bets synchronize, invalidate consent, lock during play and appear in private history', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 320, height: 844 } })))
  try {
    const [alice, bob] = await Promise.all(contexts.map(context => connect(context, db)))
    const room = await call<string>(db, alice, 'create_duo_room', ['Alice'])
    await call(db, bob, 'join_room', [(await state(db, alice, room)).room.code, 'Bob'])
    await Promise.all(contexts.map(context => context.addInitScript(id => localStorage.setItem('crack-the-code.room', id), room)))
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    await Promise.all([a.goto('/'), b.goto('/')])
    await a.locator('.duo-game-card').filter({ has: a.getByRole('heading', { name: 'Bingo', exact: true }) }).click()
    await a.getByLabel('Your game bet', { exact: true }).fill('You make me coffee.')
    await expect(a.getByRole('button', { name: 'Confirm & play together', exact: true })).toBeDisabled()
    await a.getByRole('button', { name: 'Save game bet', exact: true }).click()
    await expect(b.getByLabel('Proposed game bets')).toContainText('You make me coffee.')
    await a.getByRole('button', { name: 'Confirm & play together', exact: true }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByLabel('Your game bet', { exact: true }).fill('You bring snacks.')
    await b.getByRole('button', { name: 'Save game bet', exact: true }).click()
    await expect(a.locator('.duo-consent')).toContainText('Alice: reviewing')
    await a.getByRole('button', { name: 'Confirm & play together', exact: true }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByRole('button', { name: 'Confirm & play together', exact: true }).click()
    await expect(a.getByLabel('Agreed game bets')).toContainText('You bring snacks.')
    await expect(b.getByLabel('Your game bet', { exact: true })).toHaveCount(0)
    await a.reload()
    await expect(a.getByLabel('Agreed game bets')).toContainText('You make me coffee.')
    const numbers = Array.from({ length: 25 }, (_, i) => i + 1)
    const other = [1, 7, 13, 19, 25, 6, 12, 18, 24, 5, 11, 17, 23, 4, 10, 16, 22, 3, 9, 15, 21, 2, 8, 14, 20]
    await db.query("update private.party_games set board=board||jsonb_build_object('boards',$2::jsonb,'called',$3::jsonb) where room_id=$1",
      [room, JSON.stringify({ [alice]: numbers, [bob]: other }), JSON.stringify(numbers.slice(0, 20))])
    await db.query('update public.rooms set version=version+1 where id=$1', [room])
    await expect(a.locator('.party-scores')).toContainText('4 / 5 lines')
    await a.getByRole('button', { name: 'Number 21', exact: true }).click()
    await expect(a.getByLabel('Agreed game bets').locator('.winning-bet')).toContainText('You make me coffee.')
    await expect(b.getByLabel('Agreed game bets').locator('.winning-bet')).toContainText('Alice')
    await a.screenshot({ path: test.info().outputPath('bingo-bet-mobile.png'), fullPage: true, animations: 'disabled' })
    await a.getByRole('button', { name: 'Player account and bet history', exact: true }).click()
    await expect(a.locator('.bet-history-card')).toHaveCount(1)
    await expect(a.locator('.bet-history-card')).toContainText('Bingo')
    await expect(a.locator('.bet-history-card')).toContainText('You make me coffee.')
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})
