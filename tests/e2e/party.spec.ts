import { expect, test, type Browser, type Page } from '@playwright/test'
import type { PGlite } from '@electric-sql/pglite'
import type { PartyKind } from '../../src/lib/game'
import { call, createDatabase, state } from '../database'
import { connect } from './transport'

async function shared(browser: Browser, kind: PartyKind, run: (fixture: { db: PGlite; a: Page; b: Page; alice: string; bob: string; room: string }) => Promise<void>) {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 375, height: 844 } })))
  try {
    const [alice, bob] = await Promise.all(contexts.map(context => connect(context, db)))
    const room = await call<string>(db, alice, 'create_duo_room', ['Alice'])
    await call(db, bob, 'join_room', [(await state(db, alice, room)).room.code, 'Bob'])
    await Promise.all(contexts.map(context => context.addInitScript(id => localStorage.setItem('crack-the-code.room', id), room)))
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    await Promise.all([a.goto('/'), b.goto('/')])
    const name = { bingo: 'Bingo', cheat: 'Cheat', hangman: 'Hangman' }[kind]
    await a.locator('.duo-game-card').filter({ has: a.getByRole('heading', { name, exact: true }) }).click()
    await expect(b.locator('.duo-game-card').filter({ has: b.getByRole('heading', { name, exact: true }) })).toHaveAttribute('aria-pressed', 'true')
    await a.getByRole('button', { name: 'Confirm & play together', exact: true }).click()
    await expect(b.locator('.duo-consent')).toContainText('Alice: ready')
    await b.getByRole('button', { name: 'Confirm & play together', exact: true }).click()
    await expect(a.locator(`.party-${kind}`)).toBeVisible()
    await expect(b.locator(`.party-${kind}`)).toBeVisible()
    await expect(a.locator('.party-scores .turn-character')).toHaveCount(2)
    await expect(a.locator('.party-scores .turn-character.active')).toHaveCount(kind === 'hangman' ? 2 : 1)
    await run({ db, a, b, alice, bob, room })
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
}

test('Bingo synchronizes alternating calls, restores marks, counts five lines and resolves a shared finish', async ({ browser }) => {
  await shared(browser, 'bingo', async ({ db, a, b, alice, bob, room }) => {
    await expect(a.locator('.bingo-board button')).toHaveCount(25)
    await expect(a.locator('.bingo-word')).toHaveCount(2)
    await expect(a.locator('.bingo-word .complete')).toHaveCount(0)
    await expect(b.getByRole('button', { name: 'Number 1', exact: true })).toBeDisabled()
    await a.getByRole('button', { name: 'Number 1', exact: true }).click()
    await expect(b.getByRole('button', { name: 'Number 1, called', exact: true })).toBeDisabled()
    await expect(b.locator('.party-scores .turn-character.active')).toHaveClass(/turn-amber/)
    await b.getByRole('button', { name: 'Number 2', exact: true }).click()
    await expect(a.locator('.party-call-log')).toContainText('1 · 2')
    await a.reload()
    await expect(a.getByRole('button', { name: 'Number 2, called', exact: true })).toBeDisabled()
    const numbers = Array.from({ length: 25 }, (_, i) => i + 1)
    const scattered = [1, 7, 13, 19, 25, 6, 12, 18, 24, 5, 11, 17, 23, 4, 10, 16, 22, 3, 9, 15, 21, 2, 8, 14, 20]
    await db.query("update private.party_games set board=board||jsonb_build_object('boards',$2::jsonb,'called',$3::jsonb) where room_id=$1",
      [room, JSON.stringify({ [alice]: numbers, [bob]: scattered }), JSON.stringify(numbers.slice(0, 15))])
    await db.query('update public.rooms set version=version+1 where id=$1', [room])
    for (const page of [a, b]) {
      await expect(page.getByRole('group', { name: 'Alice: 3 of five Bingo lines', exact: true }).locator('.complete')).toHaveCount(3)
      await expect(page.getByRole('group', { name: 'Bob: 0 of five Bingo lines', exact: true }).locator('.complete')).toHaveCount(0)
    }
    await db.query("update private.party_games set board=board||jsonb_build_object('boards',$2::jsonb,'called',$3::jsonb,'turn_user',$4::text,'moves',20,'turn_number',21) where room_id=$1",
      [room, JSON.stringify({ [alice]: numbers, [bob]: numbers }), JSON.stringify(numbers.slice(0, 20)), alice])
    await db.query('update public.rooms set version=version+1 where id=$1', [room])
    await expect(a.locator('.party-scores')).toContainText('4 / 5 lines')
    await a.getByRole('button', { name: 'Number 21', exact: true }).click()
    await expect(a.getByRole('heading', { name: 'A perfect tie.', exact: true })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'A perfect tie.', exact: true })).toBeVisible()
    await expect(a.locator('.bingo-word').first().locator('.complete')).toHaveCount(5)
    await expect(a.locator('.bingo-word').nth(1).locator('.complete')).toHaveCount(5)
    await expect(a.locator('.bingo-celebration')).toHaveText('BINGO! Both players completed five lines.')
    await expect(a.locator('.party-scores .turn-character.active')).toHaveCount(0)
    await a.screenshot({ path: test.info().outputPath('bingo-mobile.png'), fullPage: true })
    await a.getByRole('button', { name: 'Choose the next game', exact: true }).click()
    await expect(b.getByRole('heading', { name: 'What’s the mood?', exact: true })).toBeVisible()
  })
})

test('Cheat keeps hands private, animates a caught bluff and waits for the final challenge before winning', async ({ browser }) => {
  await shared(browser, 'cheat', async ({ db, a, b, alice, bob, room }) => {
    await expect(a.locator('.cheat-hand button')).toHaveCount(26)
    await expect(b.locator('.cheat-hand button')).toHaveCount(26)
    await db.query("update private.party_games set board=jsonb_set(board,'{hands}',$2::jsonb) where room_id=$1", [room, JSON.stringify({ [alice]: [1, 13], [bob]: [0] })])
    await db.query('update public.rooms set version=version+1 where id=$1', [room])
    await expect(a.locator('.cheat-hand button')).toHaveCount(2)
    await a.getByRole('button', { name: '2 of spades', exact: true }).click()
    await a.getByRole('button', { name: 'Play 1 cards as A', exact: true }).click()
    await expect(b.locator('.cheat-table')).toContainText('Alice claims 1 × A')
    await expect(b.getByRole('button', { name: '2 of spades', exact: true })).toHaveCount(0)
    await b.getByRole('button', { name: 'Call bluff', exact: true }).click()
    await expect(a.locator('.party-reveal')).toContainText('Bluff caught!')
    await expect(a.locator('.cheat-hand button')).toHaveCount(2)
    const current = (await state(db, alice, room)).party!
    await db.query("update private.party_games set board=board||jsonb_build_object('hands',$2::jsonb,'pile','[]'::jsonb,'turn_user',$3::text,'phase','play','rank',1,'moves',$4::integer,'reveal',null) where room_id=$1",
      [room, JSON.stringify({ [alice]: [0], [bob]: [1] }), alice, current.moves + 1])
    await db.query('update public.rooms set version=version+1 where id=$1', [room])
    await expect(a.locator('.cheat-hand button')).toHaveCount(1)
    await a.getByRole('button', { name: 'A of spades', exact: true }).click()
    await a.getByRole('button', { name: 'Play 1 cards as A', exact: true }).click()
    await expect(a.getByRole('heading', { name: 'You win!', exact: true })).toHaveCount(0)
    await b.reload()
    await b.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(a.getByRole('heading', { name: 'You win!', exact: true })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Alice wins!', exact: true })).toBeVisible()
    await a.screenshot({ path: test.info().outputPath('cheat-mobile.png'), fullPage: true })
  })
})

test('Hangman locks both private custom words, alternates letters, restores guesses and reveals only at the finish', async ({ browser }) => {
  await shared(browser, 'hangman', async ({ a, b }) => {
    await a.getByLabel('Word category', { exact: true }).selectOption('nature')
    await a.getByLabel('Your secret word · 3–12 letters', { exact: true }).fill('MOON')
    await expect(a.getByLabel('Your secret word · 3–12 letters', { exact: true })).toHaveAttribute('type', 'text')
    await expect(a.getByLabel('Your secret word · 3–12 letters', { exact: true })).toHaveValue('MOON')
    await expect(b.getByLabel('Your secret word · 3–12 letters', { exact: true })).toHaveValue('')
    await a.getByRole('button', { name: 'Lock my word', exact: true }).click()
    await expect(a.getByText('Your word is locked.', { exact: false })).toBeVisible()
    await b.getByLabel('Your secret word · 3–12 letters', { exact: true }).fill('CAT')
    await b.getByRole('button', { name: 'Lock my word', exact: true }).click()
    await expect(a.locator('.hangman-pattern > span')).toHaveCount(3)
    await expect(a.getByRole('img', { name: 'Hangman: 0 of 6 wrong guesses', exact: true })).toBeVisible()
    await expect(a.locator('.hangman-part')).toHaveCount(0)
    await expect(b.getByRole('button', { name: 'M', exact: true })).toBeDisabled()
    await a.getByRole('button', { name: 'C', exact: true }).click()
    await expect(b.getByRole('heading', { name: 'Your turn.', exact: true })).toBeVisible()
    await b.getByRole('button', { name: 'M', exact: true }).click()
    await a.reload()
    await expect(a.getByRole('button', { name: 'C', exact: true })).toBeDisabled()
    await a.getByRole('button', { name: 'A', exact: true }).click()
    await b.getByRole('button', { name: 'O', exact: true }).click()
    await expect(b.locator('.hangman-pattern')).toContainText('MOO')
    await expect(a.locator('.party-reveal')).toHaveCount(0)
    await a.getByRole('button', { name: 'T', exact: true }).click()
    await expect(a.getByRole('heading', { name: 'You win!', exact: true })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Alice wins!', exact: true })).toBeVisible()
    await expect(a.locator('.party-reveal')).toContainText('CAT')
    await expect(b.locator('.party-reveal')).toContainText('MOON')
    await a.screenshot({ path: test.info().outputPath('hangman-mobile.png'), fullPage: true })
  })
})

test('Hangman draws one body part per wrong guess, keeps separate progress and restores all six after a loss', async ({ browser }) => {
  await shared(browser, 'hangman', async ({ a, b }) => {
    await a.getByLabel('Your secret word · 3–12 letters', { exact: true }).fill('MOON')
    await a.getByRole('button', { name: 'Lock my word', exact: true }).click()
    await b.getByLabel('Your secret word · 3–12 letters', { exact: true }).fill('CAT')
    await b.getByRole('button', { name: 'Lock my word', exact: true }).click()
    const wrongLetters = ['Z', 'X', 'Q', 'V', 'J', 'K']
    for (let i = 0; i < wrongLetters.length; i++) {
      await a.getByRole('button', { name: wrongLetters[i], exact: true }).click()
      await expect(a.locator('.hangman-part')).toHaveCount(i + 1)
      await expect(b.locator('.hangman-part')).toHaveCount(i)
      if (i < 5) await b.getByRole('button', { name: wrongLetters[i], exact: true }).click()
    }
    await expect(a.getByRole('heading', { name: 'Bob wins!', exact: true })).toBeVisible()
    await expect(a.getByRole('img', { name: 'Hangman: 6 of 6 wrong guesses', exact: true })).toBeVisible()
    await a.reload()
    await expect(a.locator('.hangman-part')).toHaveCount(6)
    for (const theme of ['dark', 'pastel']) {
      await a.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click()
      for (const width of [320, 390, 768]) {
        await a.setViewportSize({ width, height: 844 })
        expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
    await a.screenshot({ path: test.info().outputPath('hangman-six-misses-mobile.png'), fullPage: true, animations: 'disabled' })
  })
})

for (const kind of ['bingo', 'cheat', 'hangman'] as const) {
  test(`solo ${kind} supports difficulty, a real computer action, reload and both mobile themes`, async ({ browser }) => {
    const db = await createDatabase()
    const context = await browser.newContext({ viewport: { width: 320, height: 844 } })
    try {
      const player = await connect(context, db)
      const page = await context.newPage()
      await page.goto(`/?play=solo&soloGame=${kind}`)
      for (const level of ['easy', 'medium', 'hard']) {
        await page.getByRole('button', { name: `${level} computer`, exact: true }).click()
        await expect(page.getByRole('button', { name: `${level} computer`, exact: true })).toHaveAttribute('aria-pressed', 'true')
      }
      await page.getByRole('button', { name: 'Play against computer', exact: true }).click()
      await expect(page.locator(`.party-${kind}`)).toBeVisible()
      if (kind === 'hangman') {
        await page.getByLabel('Your secret word · 3–12 letters', { exact: true }).fill('MOON')
        await page.getByRole('button', { name: 'Lock my word', exact: true }).click()
        await page.getByRole('button', { name: 'Z', exact: true }).click()
      } else if (kind === 'bingo') await page.getByRole('button', { name: 'Number 1', exact: true }).click()
      else {
        await page.locator('.cheat-hand button').first().click()
        await page.getByRole('button', { name: 'Play 1 cards as A', exact: true }).click()
      }
      await expect.poll(async () => (await db.query<{ moves: number }>("select (board->>'moves')::integer as moves from private.solo_boards where user_id=$1 and status='playing'", [player])).rows[0]?.moves ?? 0).toBeGreaterThanOrEqual(kind === 'hangman' ? 4 : 2)
      await page.reload()
      await expect(page.locator(`.party-${kind}`)).toBeVisible()
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        for (const theme of ['pastel', 'dark']) {
          await page.getByRole('button', { name: `Use ${theme} theme`, exact: true }).click()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        }
      }
      await expect(page.getByRole('alert')).toHaveCount(0)
      await page.setViewportSize({ width: 320, height: 844 })
      await page.screenshot({ path: test.info().outputPath(`solo-${kind}-mobile.png`), fullPage: true })
      expect((await db.query('select id from public.rooms')).rows).toEqual([])
    } finally { await context.close(); await db.close() }
  })
}
