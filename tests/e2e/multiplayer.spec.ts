import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import type { PGlite } from '@electric-sql/pglite'
import { asUser, createDatabase, user } from '../database'

// Test-only transport backed by the actual migrations, roles and RPCs.
async function connect(context: BrowserContext, db: PGlite) {
  const id = await user(db)
  const token = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    'test-signature',
  ].join('.')
  await context.route('http://supabase.test/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    try {
      let result: unknown
      if (url.pathname.startsWith('/auth/')) {
        result = { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user: { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} } }
      } else if (url.pathname === '/rest/v1/word_bank') {
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 1000)
        result = (await asUser<{ word: string }>(db, id, 'select word from public.word_bank order by word limit $1 offset $2', [limit, offset])).rows
      } else if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const fn = url.pathname.split('/').at(-1)!
        if (!['create_room', 'join_room', 'set_wager', 'set_ready', 'set_secret', 'start_round', 'submit_guess', 'submit_hints', 'advance_round', 'heartbeat', 'get_game_state'].includes(fn)) throw new Error('Unknown RPC')
        const entries = Object.entries(request.postDataJSON() ?? {})
        if (entries.some(([key]) => !/^p_[a-z_]+$/.test(key))) throw new Error('Invalid argument')
        const sql = `select public.${fn}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(',')}) as result`
        result = (await asUser<{ result: unknown }>(db, id, sql, entries.map(([, value]) => value))).rows[0].result
      } else throw new Error(`Unexpected request: ${url.pathname}`)
      await route.fulfill({ json: result, headers: { 'Access-Control-Allow-Origin': '*' } })
    } catch (err) {
      await route.fulfill({ status: 400, json: { message: err instanceof Error ? err.message : 'Test transport error', code: 'P0001' } })
    }
  })
  await context.routeWebSocket('**/realtime/v1/websocket*', ws => ws.close())
  return id
}

async function secret(page: Page, code: string) {
  await page.getByLabel(/^Your secret (code|word)$/).fill(code)
  await page.getByRole('button', { name: 'Lock my secret' }).click()
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
  await a.getByLabel('Your name', { exact: true }).fill('Alice')
  await a.getByRole('button', { name: 'Next', exact: true }).click()
  await a.getByRole('button', { name: mode, exact: true }).click()
  await a.getByRole('button', { name: new RegExp(`^${style}`) }).click()
  await a.getByRole('button', { name: 'Next · your room' }).click()
  await a.getByRole('button', { name: 'High stakes', exact: true }).click()
  await a.getByLabel('Your bet', { exact: true }).fill('You make me a coffee.')
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
  await b.getByLabel('Your bet', { exact: true }).fill('You bring me a snack.')
  await b.getByRole('button', { name: 'Save bet', exact: true }).click()
  for (const page of [a, b]) {
    await expect(page.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Agree & choose secret', exact: true }).click()
    await expect(page.getByLabel(/^Your secret (code|word)$/)).toBeVisible()
    await expect(page.getByLabel('Match bets', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Agree & choose secret', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Word bank', exact: true })).toHaveCount(0)
    if (mode === 'Word Lock') {
      expect(await page.locator('.keyboard-word .key').first().evaluate(key => key.getBoundingClientRect().height)).toBeGreaterThanOrEqual(58)
      expect(await page.locator('.keyboard-word .key').first().evaluate(key => parseFloat(getComputedStyle(key).fontSize))).toBeGreaterThanOrEqual(15)
    }
  }
  return [a, b]
}
async function launchRound(a: Page, b: Page, aCode: string, bCode: string, turns = false) {
  await expect(a.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
  await secret(a, aCode)
  await expect(a.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
  await secret(b, bCode)
  await expect(b.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
  await a.getByRole('button', { name: /^Start (game|round)$/ }).click()
  await expect(a.getByText('You both start together.')).toBeVisible()
  await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
  if (!turns) await expect(b.getByLabel('Your guess', { exact: true })).toBeVisible()
}

for (const mode of ['Number Lock', 'Word Lock']) test(`random secret selection stays private until locked in ${mode}`, async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b] = await createPair(contexts, db, mode)
    const input = a.getByLabel(/^Your secret (code|word)$/)
    await expect(a.getByRole('button', { name: 'Lock my secret' })).toBeDisabled()
    await a.getByRole('button', { name: 'Choose for me' }).click()
    const draft = await input.inputValue()
    expect(draft).toMatch(mode === 'Word Lock' ? /^[A-Z]{6}$/ : /^[0-9]{4}$/)
    if (mode === 'Word Lock') expect((await db.query('select word from public.word_bank where word=$1', [draft])).rows).toHaveLength(1)
    expect((await db.query('select * from public.secrets')).rows).toHaveLength(0)
    await expect(b.getByLabel(/^Your secret (code|word)$/)).toHaveValue('')
    await expect(a.locator('.code-entry .tile')).toHaveText([...draft])
    await expect(input).toHaveAttribute('type', 'text')
    await a.reload()
    await expect(input).toHaveValue('')
    await a.getByRole('button', { name: 'Choose for me' }).click()
    await a.getByRole('button', { name: 'Delete last character' }).click()
    await expect(input).toHaveValue(mode === 'Word Lock' ? /^.{5}$/ : /^.{3}$/)
    await a.getByRole('button', { name: 'Choose for me' }).click()
    const locked = await input.inputValue()
    await a.getByRole('button', { name: 'Lock my secret' }).click()
    await expect(a.getByRole('heading', { name: 'Your secret is locked.' })).toBeVisible()
    expect((await db.query<{ code: string }>('select code from public.secrets')).rows).toEqual([{ code: locked }])
    await expect(a.getByRole('button', { name: 'Choose for me' })).toHaveCount(0)
    await b.getByRole('button', { name: 'Choose for me' }).click()
    await b.getByRole('button', { name: 'Lock my secret' }).click()
    await a.getByRole('button', { name: /^Start (game|round)$/ }).click()
    await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
    for (const page of [a, b]) {
      await expect(page.getByRole('button', { name: 'Choose for me' })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  } finally { await Promise.all(contexts.map(c => c.close())); await db.close() }
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
      await launchRound(a, b, '1122', '3344')
      await expect(a.getByLabel('Elapsed time')).toBeVisible()
      if (round === 1) {
        await guess(a, '3333')
        await expect(a.getByLabel('Guess history').getByLabel('3, correct position', { exact: true })).toHaveCount(2)
        await expect(a.getByLabel('Guess history').getByLabel('3, no match', { exact: true })).toHaveCount(2)
        await expect(a.getByRole('button', { name: '3', exact: true })).toHaveClass('key hit')
        await b.getByLabel('Your guess', { exact: true }).fill('9999')
        expect((await db.query('select * from public.guesses where user_id=(select user_id from public.players where name=$1)', ['Bob'])).rows).toHaveLength(0)
        await b.reload()
        await expect(b.getByLabel('Your guess', { exact: true })).toHaveValue('')
      }
      await guess(round === 2 ? b : a, round === 2 ? '1122' : '3344')
      const phase = round === 3 ? 'MATCH COMPLETE' : `ROUND ${round} COMPLETE`
      await expect(a.getByText(phase, { exact: true })).toBeVisible()
      await expect(b.getByText(phase, { exact: true })).toBeVisible()
      for (const page of [a, b]) {
        await expect(page.getByLabel('Your guess', { exact: true })).toHaveCount(0)
        await expect(page.locator('.reveal-card .tile')).toHaveText(page === a ? [...'11223344'] : [...'33441122'])
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
    await expect(a.getByLabel('Your bet', { exact: true })).toHaveValue('')
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
        await expect(a.getByRole('alert')).toHaveText("That word is not in this game's dictionary. Try another six-letter word.")
        await a.getByLabel('Your guess', { exact: true }).fill('')
      for (const char of 'STREET') await a.getByRole('button', { name: char, exact: true }).click()
      await a.getByRole('button', { name: /^Try (code|word)$/ }).click()
      await expect(a.locator('.history-row .tile.filled')).toHaveCount(6)
      await expect(a.locator('.history-row .tile')).toHaveClass([
        'tile hit filled', 'tile miss filled', 'tile present filled', 'tile present filled', 'tile hit filled', 'tile hit filled',
      ])
      await expect(a.getByRole('button', { name: 'T', exact: true })).toHaveClass('key hit')
      await expect(a.getByRole('button', { name: 'R', exact: true })).toHaveClass('key present')
      await expect(a.getByRole('button', { name: 'E', exact: true })).toHaveClass('key hit')
      await guess(a, 'LETTER')
      await expect(a.locator('.history-row').last().locator('.tile')).toHaveClass([
        'tile miss filled', 'tile hit filled', 'tile present filled', 'tile miss filled', 'tile hit filled', 'tile present filled',
      ])
      await expect(a.getByRole('button', { name: 'T', exact: true })).toHaveClass('key hit')
      for (let attempt = 3; attempt <= 10; attempt++) await guess(a, 'STREET')
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

test('turn-by-turn Word Lock rejects false manual hints, recovers pending guesses and alternates play', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 320, height: 900 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b] = await createPair(contexts, db, 'Word Lock', 'Take turns')
    await launchRound(a, b, 'LETTER', 'SECRET', true)
    await expect(a.getByLabel('Elapsed time')).toHaveCount(0)
    await expect(b.getByLabel('Your guess', { exact: true })).toHaveCount(0)
    await guess(a, 'STREET')
    await expect(b.getByLabel('Mark clues')).toBeVisible()
    await b.reload()
    await expect(b.getByLabel('Mark clues')).toBeVisible()
    await b.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(b.getByRole('alert')).toContainText('Those hints do not match your secret')
    await expect(a.locator('.history-row')).toHaveCount(0)
    for (const [index, letter, clicks] of [[1, 'S', 2], [3, 'R', 1], [4, 'E', 1], [5, 'E', 2], [6, 'T', 2]] as const) {
      for (let i = 0; i < clicks; i++) await b.getByRole('button', { name: `Clue ${index}: ${letter}`, exact: true }).click()
    }
    await b.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(b.getByLabel('Your guess', { exact: true })).toBeVisible()
    await expect(a.getByLabel('Guess history').getByLabel('E, correct position', { exact: true })).toHaveCount(1)
    await expect(a.getByLabel('Guess history').getByLabel('E, wrong position', { exact: true })).toHaveCount(1)
    await guess(b, 'BETTER')
    await expect(a.getByLabel('Mark clues')).toBeVisible()
    for (const [index, letter, clicks] of [[2, 'E', 2], [3, 'T', 2], [4, 'T', 2], [5, 'E', 2], [6, 'R', 2]] as const) {
      for (let i = 0; i < clicks; i++) await a.getByRole('button', { name: `Clue ${index}: ${letter}`, exact: true }).click()
    }
    await a.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
    await guess(a, 'SECRET')
    for (const page of [a, b]) {
      await expect(page.getByText('ROUND 1 COMPLETE', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
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
      await expect(page.getByRole('heading', { name: 'What’s your name?' })).toBeVisible()
      await expect(page.getByLabel('Your bet', { exact: true })).toHaveCount(0)
      const inputSize = await page.getByLabel('Your name', { exact: true }).evaluate(e => getComputedStyle(e).fontSize)
      expect(inputSize).toBe('16px')
      await page.getByLabel('Your name', { exact: true }).fill('Alice')
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await page.getByRole('button', { name: 'Word Lock', exact: true }).click()
      await expect(page.getByLabel('Word Lock example')).toBeVisible()
      await expect(page.getByLabel('Word Lock instructions')).toContainText('pick a secret six-letter word.')
      await expect(page.getByLabel('Word Lock example').getByLabel('Code tiles')).toHaveCount(2)
      await page.getByRole('button', { name: 'How to play' }).click()
      await expect(page.getByRole('dialog')).toHaveAccessibleName('How to play Word Lock')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Symbol Cipher', exact: true })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 100)).toBe(true)
      await page.getByRole('button', { name: 'Next · your room' }).click()
      await page.getByRole('button', { name: 'High stakes', exact: true }).click()
      await expect(page.getByLabel('Your bet', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Word Lock instructions')).toHaveCount(0)
    } finally { await db.close() }
  } finally { await context.close() }
})

test('bet agreement appears only on bets, and start appears only on the ready code screen', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 } })))
  try {
    const [a, b] = await createPair(contexts, db)
    await secret(a, '1122')
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
    await secret(b, '3344')
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
    await a.getByRole('tab', { name: 'The bets', exact: true }).click()
    await expect(a.getByLabel('Match bets', { exact: true })).toBeVisible()
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
    await a.getByRole('button', { name: 'Continue to my secret', exact: true }).click()
    await b.getByRole('tab', { name: 'The bets', exact: true }).click()
    await b.getByLabel('Your bet', { exact: true }).fill('You choose our next film.')
    await b.getByRole('button', { name: 'Save bet', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
    await a.getByRole('button', { name: 'Review and agree to the bets', exact: true }).click()
    for (const page of [a, b]) await page.getByRole('button', { name: 'Agree & choose secret', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
    await expect(b.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(0)
  } finally { await Promise.all(contexts.map(context => context.close())); await db.close() }
})

test('both players submit exact guesses together and see one winner without an error', async ({ browser }) => {
  const db = await createDatabase()
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b] = await createPair(contexts, db)
    await launchRound(a, b, '1122', '3344')
    await a.getByLabel('Your guess', { exact: true }).fill('3344')
    await b.getByLabel('Your guess', { exact: true }).fill('1122')
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
