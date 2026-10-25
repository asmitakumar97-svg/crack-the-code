import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import type { PGlite } from '@electric-sql/pglite'
import { call, createDatabase, roomPair as backendPair, start as startGame } from '../database'
import { connect } from './transport'

async function secret(page: Page, code: string) {
  await page.getByLabel(/^Your secret (code|word)$/).fill(code)
  await page.getByRole('button', { name: 'Lock my secret' }).click()
  await expect(page.getByRole('tab', { name: 'The bets', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Match bets', { exact: true })).toBeVisible()
}
async function guess(page: Page, code: string) {
  const input = page.getByLabel('Your guess', { exact: true })
  await expect(input).toBeVisible()
  await input.fill(code)
  await page.getByRole('button', { name: /^Try (code|word)$/ }).click()
  await expect(input.and(page.locator('[value=""]')).or(page.locator('.winner-screen')).or(page.locator('.pending-state'))).toBeVisible()
}
async function createPair(contexts: BrowserContext[], db: PGlite, mode = 'Number Lock', style = 'Live race') {
  await Promise.all(contexts.map(c => connect(c, db)))
  const [a, b] = await Promise.all(contexts.map(c => c.newPage()))
  await a.goto('/')
  await a.getByRole('button', { name: 'Play with a friend', exact: true }).click()
  await a.getByLabel('Your name', { exact: true }).fill('Alice')
  await a.getByRole('button', { name: 'Next', exact: true }).click()
  await a.getByRole('button', { name: mode, exact: true }).click()
  await a.getByRole('button', { name: new RegExp(`^${style}`) }).click()
  await a.getByRole('button', { name: 'Next · your room' }).click()
  await a.getByRole('button', { name: 'High stakes', exact: true }).click()
  await expect(a.getByLabel('Your bet', { exact: true })).toHaveCount(0)
  await a.getByRole('button', { name: 'Create private room' }).click()
  await expect(a.getByRole('heading', { name: 'Your private room.' })).toBeVisible()
  const code = (await db.query<{ code: string }>('select code from public.rooms')).rows[0].code
  await b.goto(`/?room=${code}`)
  await b.getByLabel('Your name', { exact: true }).fill('Bob')
  await b.getByRole('button', { name: 'Next', exact: true }).click()
  await b.getByRole('button', { name: 'Next · your room' }).click()
  await b.getByRole('button', { name: 'Join private room' }).click()
  await expect(b.getByRole('heading', { name: 'Your private room.' })).toBeVisible()
  await expect(b.locator('.stake-badge')).toHaveText('High stakes')
  for (const page of [a, b]) {
    await expect(page.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'The bets', exact: true })).toBeDisabled()
    await expect(page.getByLabel(/^Your secret (code|word)$/)).toBeVisible()
    await expect(page.getByLabel('Match bets', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Agree to bets', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Word bank', exact: true })).toHaveCount(0)
    if (mode === 'Word Lock') {
      expect(await page.locator('.keyboard-word .key').first().evaluate(key => key.getBoundingClientRect().height)).toBeGreaterThanOrEqual(58)
      expect(await page.locator('.keyboard-word .key').first().evaluate(key => parseFloat(getComputedStyle(key).fontSize))).toBeGreaterThanOrEqual(15)
    }
  }
  return [a, b]
}
async function agreeBets(a: Page, b: Page) {
  for (const [index, page] of [a, b].entries()) {
    const input = page.getByLabel('Your bet', { exact: true })
    if (await input.count() && !(await input.inputValue())) {
      await input.fill(index === 0 ? 'You make me a coffee.' : 'You bring me a snack.')
      await page.getByRole('button', { name: 'Save bet', exact: true }).click()
    }
  }
  for (const page of [a, b]) {
    const agree = page.getByRole('button', { name: 'Agree to bets', exact: true })
    if (await agree.count()) await agree.click()
  }
}
async function launchRound(a: Page, b: Page, aCode: string, bCode: string, turns = false) {
  await expect(a.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
  await secret(a, aCode)
  await expect(a.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
  await secret(b, bCode)
  await agreeBets(a, b)
  await expect(b.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
  await a.getByRole('button', { name: /^Start (game|round)$/ }).click()
  await expect(a.getByText('You both start together.')).toBeVisible()
  await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
  await expect(a.locator('.scoreboard .turn-character.active')).toHaveCount(turns ? 1 : 2)
  if (!turns) await expect(b.getByLabel('Your guess', { exact: true })).toBeVisible()
}

for (const mode of ['Number Lock', 'Word Lock']) test(`random secret selection stays private until locked in ${mode}`, async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b] = await createPair(contexts, db, mode)
    const input = a.getByLabel(/^Your secret (code|word)$/)
    await expect(a.getByRole('button', { name: 'Lock my secret' })).toBeDisabled()
    if (mode === 'Number Lock') {
      await expect(input).toHaveAttribute('maxlength', '6')
      await input.fill('1234')
      await expect(a.getByRole('button', { name: 'Lock my secret' })).toBeDisabled()
      await expect(a.locator('.code-entry .tile')).toHaveCount(6)
    }
    if (mode === 'Word Lock') {
      await input.fill('XXXXXX')
      await a.getByRole('button', { name: 'Lock my secret' }).click()
      await expect(a.getByRole('alert')).toContainText('real six-letter word')
      await expect(a.getByRole('tab', { name: 'My secret', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(a.getByLabel('Match bets', { exact: true })).toHaveCount(0)
    }
    await a.getByRole('button', { name: 'Choose for me' }).click()
    const draft = await input.inputValue()
    expect(draft).toMatch(mode === 'Word Lock' ? /^[A-Z]{6}$/ : /^[0-9]{6}$/)
    if (mode === 'Word Lock') expect((await db.query('select word from public.word_bank where word=$1', [draft])).rows).toHaveLength(1)
    expect((await db.query('select * from public.secrets')).rows).toHaveLength(0)
    await expect(b.getByLabel(/^Your secret (code|word)$/)).toHaveValue('')
    await expect(a.locator('.code-entry .tile')).toHaveText([...draft])
    await expect(input).toHaveAttribute('type', 'text')
    await a.reload()
    await expect(input).toHaveValue('')
    await a.getByRole('button', { name: 'Choose for me' }).click()
    await a.getByRole('button', { name: 'Delete last character' }).click()
    await expect(input).toHaveValue(/^.{5}$/)
    await a.getByRole('button', { name: 'Choose for me' }).click()
    const locked = await input.inputValue()
    await a.getByRole('button', { name: 'Lock my secret' }).click()
    await expect(a.getByLabel('Match bets', { exact: true })).toBeVisible()
    await expect(a.locator('.own-secret .tile')).toHaveText([...locked])
    expect((await db.query<{ code: string }>('select code from public.secrets')).rows).toEqual([{ code: locked }])
    await expect(a.getByRole('button', { name: 'Choose for me' })).toHaveCount(0)
    await b.getByRole('button', { name: 'Choose for me' }).click()
    await b.getByRole('button', { name: 'Lock my secret' }).click()
    await agreeBets(a, b)
    await a.getByRole('button', { name: /^Start (game|round)$/ }).click()
    await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
    for (const page of [a, b]) {
      await expect(page.getByRole('button', { name: 'Choose for me' })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  } finally { await Promise.all(contexts.map(c => c.close())); await db.close() }
})

test('pastel and dark themes persist and the private player panel explains Google setup', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true })
  try {
    await connect(context, db)
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'pastel')
    await expect(page.getByRole('button', { name: 'Use pastel theme', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Use dark theme', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'Use pastel theme', exact: true }).click()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'pastel')
    await page.getByRole('button', { name: 'Player account and bet history', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your player & bets', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeDisabled()
    await expect(page.getByText('Google sign-in is not configured yet. Guest play and private history still work.', { exact: true })).toBeVisible()
    await expect(page.getByText('No completed matches match this filter yet.', { exact: true })).toBeVisible()
    await context.route('**/rest/v1/rpc/get_bet_history', route => route.fulfill({ status: 503, json: { message: 'History temporarily unavailable.' } }))
    await page.getByRole('button', { name: 'Refresh bet history', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('History temporarily unavailable.')
    await expect(page.getByText('No completed matches match this filter yet.', { exact: true })).toHaveCount(0)
    await context.unroute('**/rest/v1/rpc/get_bet_history')
    await page.getByRole('button', { name: 'Refresh bet history', exact: true }).click()
    await expect(page.getByText('No completed matches match this filter yet.', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await context.close(); await db.close() }
})

test('account-backed history follows the same signed-in identity across isolated sessions', async ({ browser }) => {
  const db = await createDatabase()
  const pair = await backendPair(db)
  for (let round = 1; round <= 2; round++) {
    await startGame(db, pair)
    await call(db, pair.a, 'submit_guess', [pair.room, '334456', 1])
    if (round === 1) for (const id of [pair.a, pair.b]) await call(db, id, 'advance_round', [pair.room])
  }
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    for (const [index, context] of contexts.entries()) {
      await connect(context, db, false, index < 2 ? pair.a : undefined)
      const page = await context.newPage()
      await page.goto('/')
      await page.getByRole('button', { name: 'Player account and bet history', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Account connected', exact: true })).toBeVisible()
      if (index < 2) {
        await expect(page.locator('.bet-history-card')).toHaveCount(1)
        await expect(page.locator('.bet-history-card')).toContainText('You won against Bob')
        await expect(page.locator('.bet-history-card blockquote')).toHaveText('You make me a coffee.')
      } else {
        await page.getByLabel('Bet history result', { exact: true }).selectOption('all')
        await expect(page.getByText('No completed matches match this filter yet.', { exact: true })).toBeVisible()
      }
    }
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})

test('cancelled Google redirects display an explicit error rather than a successful sign-in', async ({ browser }) => {
  const db = await createDatabase()
  const context = await browser.newContext()
  try {
    await connect(context, db)
    const page = await context.newPage()
    for (const separator of ['?', '#']) {
      await page.goto(`/${separator}error=access_denied&error_description=Google%20login%20cancelled`)
      await expect(page.getByRole('alert')).toContainText('Google login cancelled')
    }
  } finally { await context.close(); await db.close() }
})

test('isolated iPhone sessions agree bets, race simultaneously for three rounds, and rematch', async ({ browser }) => {
  test.setTimeout(120000)
  const db = await createDatabase()
  const contexts = await Promise.all([390, 375].map(width => browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })))
  const errors: string[] = []
  try {
    const [a, b] = await createPair(contexts, db)
    for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message))
    for (let round = 1; round <= 3; round++) {
      await launchRound(a, b, '112256', '334456')
      await expect(a.getByLabel('Elapsed time')).toBeVisible()
      if (round === 1) {
        await guess(a, '333333')
        await expect(a.getByLabel('Guess history').getByLabel('3, correct position', { exact: true })).toHaveCount(2)
        await expect(a.getByLabel('Guess history').getByLabel('3, no match', { exact: true })).toHaveCount(4)
        await expect(a.getByRole('button', { name: '3', exact: true })).toHaveClass('key hit')
        await b.getByLabel('Your guess', { exact: true }).fill('999999')
        expect((await db.query('select * from public.guesses where user_id=(select user_id from public.players where name=$1)', ['Bob'])).rows).toHaveLength(0)
        await b.reload()
        await expect(b.getByLabel('Your guess', { exact: true })).toHaveValue('')
      }
      await guess(round === 2 ? b : a, round === 2 ? '112256' : '334456')
      const phase = round === 3 ? 'MATCH COMPLETE' : `ROUND ${round} COMPLETE`
      await expect(a.getByText(phase, { exact: true })).toBeVisible()
      await expect(b.getByText(phase, { exact: true })).toBeVisible()
      for (const page of [a, b]) {
        await expect(page.getByLabel('Your guess', { exact: true })).toHaveCount(0)
        await expect(page.locator('.reveal-card .tile')).toHaveText(page === a ? [...'112256334456'] : [...'334456112256'])
      }
      if (round === 3) {
        await expect(a.getByRole('heading', { name: 'You win the match!' })).toBeVisible()
        await expect(a.locator('.winning-bet blockquote')).toHaveText('You make me a coffee.')
        await expect(a.locator('.confetti i')).toHaveCount(24)
        expect(await a.locator('.confetti i').first().evaluate(e => getComputedStyle(e).animationName)).toBe('confetti-fall')
      }
      const label = round === 3 ? 'New match · new bets' : `Ready for round ${round + 1}`
      await a.getByRole('button', { name: label }).click()
      await expect(a.getByRole('button', { name: 'Waiting for your friend…' })).toBeDisabled()
      await expect(b.getByText(phase, { exact: true })).toBeVisible()
      await b.getByRole('button', { name: label }).click()
    }
    await expect(a.getByRole('heading', { name: 'Your private room.' })).toBeVisible()
    await expect(a.getByLabel('Your secret code', { exact: true })).toHaveValue('')
    await expect(a.getByRole('tab', { name: 'The bets', exact: true })).toBeDisabled()
    expect((await db.query<{ wager: string }>('select wager from public.players')).rows.every(p => p.wager === '')).toBe(true)
    const room = (await db.query<{ match_number: number; round_number: number }>('select match_number,round_number from public.rooms')).rows[0]
    expect(room).toEqual({ match_number: 2, round_number: 1 })
    for (const page of [a, b]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } finally { await Promise.all(contexts.map(c => c.close())); await db.close() }
})

test('Word Lock validates real words and supports virtual-key races', async ({ browser }) => {
    const db = await createDatabase()
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1280, height: 900 } })))
    try {
      const [a, b] = await createPair(contexts, db, 'Word Lock')
      await launchRound(a, b, 'LETTER', 'SECRET')
        await a.getByLabel('Your guess', { exact: true }).fill('XXXXXX')
        await a.getByRole('button', { name: 'Try word' }).click()
        await expect(a.getByRole('alert')).toContainText('real six-letter word')
        await a.getByLabel('Your guess', { exact: true }).fill('')
      for (const char of 'STREET') await a.getByRole('button', { name: char, exact: true }).click()
      await a.getByRole('button', { name: /^Try (code|word)$/ }).click()
      await expect(a.locator('.history-row .tile.filled')).toHaveCount(6)
      await expect(a.locator('.history-row .tile')).toHaveClass([
        'tile hit filled', 'tile miss filled', 'tile present filled', 'tile present filled', 'tile hit filled', 'tile hit filled',
      ])
      await expect(a.getByRole('button', { name: 'T', exact: true })).toHaveClass('key hit')
      await expect(a.getByRole('button', { name: 'R', exact: true })).toHaveClass('key present')
      await expect(a.getByRole('button', { name: 'E', exact: true })).toHaveClass('key present')
      await guess(a, 'NORMAL')
      await guess(a, 'FRUITS')
      await guess(a, 'APPLES')
      await expect(a.locator('.history-row')).toHaveCount(4)
      await guess(a, 'LETTER')
      await expect(a.locator('.history-row').last().locator('.tile')).toHaveClass([
        'tile miss filled', 'tile hit filled', 'tile present filled', 'tile miss filled', 'tile hit filled', 'tile present filled',
      ])
      await expect(a.getByRole('button', { name: 'T', exact: true })).toHaveClass('key hit')
      for (let attempt = 6; attempt <= 10; attempt++) await guess(a, 'STREET')
      await expect(a.locator('.history-row')).toHaveCount(10)
      await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
      await expect(a.locator('.progress-line')).toContainText('Your guesses: 10')
      await expect(a.getByRole('button', { name: 'Word bank', exact: true })).toHaveCount(0)
      await guess(a, 'SECRET')
      await expect(a.getByRole('heading', { name: 'You cracked it first!' })).toBeVisible()
      await expect(b.getByRole('heading', { name: 'Alice cracked it first!' })).toBeVisible()
      for (const page of [a, b]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    } finally { await Promise.all(contexts.map(c => c.close())); await db.close() }
})

for (const [mode, ownSecret, rivalSecret, firstGuess, secondGuess] of [
  ['Word Lock', 'LETTER', 'SECRET', 'STREET', 'BETTER'],
  ['Number Lock', '514413', '012314', '043114', '614413'],
]) test(`turn-by-turn ${mode} auto-colours selections, catches missed clues and alternates play`, async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 320, height: 900 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b] = await createPair(contexts, db, mode, 'Take turns')
    await launchRound(a, b, ownSecret, rivalSecret, true)
    let hintRequests = 0
    b.on('request', request => { if (request.url().endsWith('/rpc/submit_hints')) hintRequests++ })
    await expect(a.getByLabel('Elapsed time')).toHaveCount(0)
    await expect(b.getByLabel('Your guess', { exact: true })).toHaveCount(0)
    await guess(a, firstGuess)
    await expect(b.getByLabel('Mark clues')).toBeVisible()
    await expect(b.locator('.scoreboard .turn-character.active')).toHaveClass(/turn-amber/)
    await expect(b.locator('.scoreboard .turn-character.active')).toContainText('Give your clues')
    await b.reload()
    await expect(b.getByLabel('Mark clues')).toBeVisible()
    await b.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(b.getByRole('alert')).toContainText('You missed 5 matching clues at positions 1, 3, 4, 5, 6')
    await expect(b.getByLabel('Mark clues').locator('[aria-invalid="true"]')).toHaveCount(5)
    expect(hintRequests).toBe(0)
    await expect(a.locator('.history-row')).toHaveCount(0)
    const invalidTile = b.getByRole('button', { name: `Clue 2: ${firstGuess[1]}`, exact: true })
    await invalidTile.click()
    await expect(b.getByRole('alert')).toContainText(`Position 2 (${firstGuess[1]}) has no unused match`)
    await expect(invalidTile).toHaveClass('tile miss')
    await expect(invalidTile).toHaveAttribute('aria-pressed', 'false')
    for (const [index, mark] of [[4, 'present'], [6, 'hit'], [1, 'hit'], [3, 'present'], [5, 'hit']] as const) {
      const tile = b.getByRole('button', { name: `Clue ${index}: ${firstGuess[index - 1]}`, exact: true })
      await tile.click()
      await expect(tile).toHaveClass(`tile ${mark}`)
      await expect(tile).toHaveAttribute('aria-pressed', 'true')
    }
    await b.getByRole('button', { name: `Clue 5: ${firstGuess[4]}`, exact: true }).click()
    await b.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(b.getByRole('alert')).toContainText('You missed 1 matching clue at position 5')
    expect(hintRequests).toBe(0)
    await b.getByRole('button', { name: `Clue 5: ${firstGuess[4]}`, exact: true }).click()
    await expect(b.getByRole('alert')).toHaveCount(0)
    await b.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(b.getByLabel('Your guess', { exact: true })).toBeVisible()
    expect(hintRequests).toBe(1)
    await expect(a.getByLabel('Guess history').getByLabel(`${firstGuess[4]}, correct position`, { exact: true })).toHaveCount(1)
    await expect(a.getByLabel('Guess history').getByLabel(`${firstGuess[4]}, wrong position`, { exact: true })).toHaveCount(1)
    await guess(b, secondGuess)
    await expect(a.getByLabel('Mark clues')).toBeVisible()
    for (const index of [2, 3, 4, 5, 6]) {
      await a.getByRole('button', { name: `Clue ${index}: ${secondGuess[index - 1]}`, exact: true }).click()
    }
    await a.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
    await guess(a, rivalSecret)
    for (const page of [a, b]) {
      await expect(page.getByText('ROUND 1 COMPLETE', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  } finally { await Promise.all(contexts.map(c => c.close())); await db.close() }
})

test('turn-by-turn Number Lock accepts all-grey clues and rejects exhausted duplicate selections', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b] = await createPair(contexts, db, 'Number Lock', 'Take turns')
    await launchRound(a, b, '111256', '221156', true)
    await guess(a, '000000')
    await expect(b.getByLabel('Mark clues')).toBeVisible()
    await b.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(b.getByLabel('Your guess', { exact: true })).toBeVisible()
    await expect(a.locator('.history-row .tile')).toHaveClass(Array(6).fill('tile miss filled'))
    await guess(b, '111111')
    await expect(a.getByLabel('Mark clues')).toBeVisible()
    await a.getByRole('button', { name: 'Clue 4: 1', exact: true }).click()
    await expect(a.getByRole('alert')).toContainText('Position 4 (1) has no unused match')
    for (const index of [3, 1, 2]) {
      const tile = a.getByRole('button', { name: `Clue ${index}: 1`, exact: true })
      await tile.click()
      await expect(tile).toHaveClass('tile hit')
    }
    await a.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
    await expect(b.locator('.history-row .tile')).toHaveClass(['tile hit filled', 'tile hit filled', 'tile hit filled', 'tile miss filled', 'tile miss filled', 'tile miss filled'])
    await guess(a, '221156')
    for (const page of [a, b]) {
      await expect(page.getByText('ROUND 1 COMPLETE', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Your guess', { exact: true })).toHaveCount(0)
    }
  } finally { await Promise.all(contexts.map(c => c.close())); await db.close() }
})

test('landing instructions and illustrations follow the selected mode', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  try {
    const db = await createDatabase()
    await connect(context, db)
    try {
      const page = await context.newPage()
      await page.goto('/')
      await page.getByRole('button', { name: 'Play with a friend', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'What’s your name?' })).toBeVisible()
      await expect(page.getByLabel('Your bet', { exact: true })).toHaveCount(0)
      const inputSize = await page.getByLabel('Your name', { exact: true }).evaluate(e => getComputedStyle(e).fontSize)
      expect(inputSize).toBe('16px')
      await page.getByLabel('Your name', { exact: true }).fill('Alice')
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await page.getByRole('button', { name: 'Word Lock', exact: true }).click()
      await expect(page.getByLabel('Word Lock example')).toBeVisible()
      await expect(page.getByLabel('Word Lock instructions')).toContainText('Pick a secret six-letter word.')
      await expect(page.getByLabel('Word Lock example').getByLabel('Code tiles')).toHaveCount(2)
      await page.getByRole('button', { name: 'How to play' }).click()
      await expect(page.getByRole('dialog')).toHaveAccessibleName('How to play Word Lock')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Symbol Cipher', exact: true })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 100)).toBe(true)
      await page.getByRole('button', { name: 'Next · your room' }).click()
      await page.getByRole('button', { name: 'High stakes', exact: true }).click()
      await expect(page.getByLabel('Your bet', { exact: true })).toHaveCount(0)
      await expect(page.getByLabel('Word Lock instructions')).toHaveCount(0)
    } finally { await db.close() }
  } finally { await context.close() }
})

test('locking secrets opens bets automatically and agreement and start stay on bets', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })))
  try {
    const [a, b] = await createPair(contexts, db)
    await secret(a, '112256')
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
    await secret(b, '334456')
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
    await agreeBets(a, b)
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
    await a.reload()
    await expect(a.getByRole('tab', { name: 'The bets', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
    await a.getByRole('tab', { name: 'My secret', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
    await expect(a.getByRole('button', { name: 'Agree to bets', exact: true })).toHaveCount(0)
    await a.getByRole('button', { name: 'Continue to bets', exact: true }).click()
    await b.getByLabel('Your bet', { exact: true }).fill('You choose our next film.')
    await b.getByRole('button', { name: 'Save bet', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
    for (const page of [a, b]) await page.getByRole('button', { name: 'Agree to bets', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
    await expect(b.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})

test('both players submit exact guesses together and see one winner without an error', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b] = await createPair(contexts, db)
    await launchRound(a, b, '112256', '334456')
    await a.getByLabel('Your guess', { exact: true }).fill('334456')
    await b.getByLabel('Your guess', { exact: true }).fill('112256')
    await Promise.all([a, b].map(page => page.getByRole('button', { name: 'Try code' }).click()))
    for (const page of [a, b]) {
      await expect(page.getByText('ROUND 1 COMPLETE', { exact: true })).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    }
    const result = await db.query('select * from public.round_results')
    expect(result.rows).toHaveLength(1)
    const solved = await db.query('select * from public.players where solved')
    expect(solved.rows).toHaveLength(1)
  } finally { await Promise.all(contexts.map(c => c.close())); await db.close() }
})
