import { expect, test, type Page } from '@playwright/test'

async function nameAndInstructions(page: Page, name: string, mode = 'Number Lock', turns = false, invite = '') {
  await page.goto(invite ? `/?room=${invite}` : '/')
  await expect(page.getByText('Local multiplayer', { exact: true })).toBeVisible()
  await page.getByLabel('Your name', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: mode, exact: true }).click()
  if (turns) await page.getByRole('button', { name: /^Take turns/ }).click()
  await page.getByRole('button', { name: 'Next · your room' }).click()
}

async function roomPair(a: Page, b: Page, mode = 'Number Lock', turns = false) {
  await nameAndInstructions(a, 'Alice', mode, turns)
  await a.getByRole('button', { name: 'High stakes', exact: true }).click()
  await expect(a.getByLabel('Your bet', { exact: true })).toHaveCount(0)
  await expect(a.getByText(/Next: enter your private/)).toBeVisible()
  await a.getByRole('button', { name: 'Create private room' }).click()
  await expect(a.getByRole('tab', { name: 'The bets', exact: true })).toBeDisabled()
  const code = await a.locator('.room-code-block.large strong').innerText()
  await nameAndInstructions(b, 'Bob', mode, turns, code)
  await b.getByRole('button', { name: 'Join private room' }).click()
  await expect(b.locator('.stake-badge')).toHaveText('High stakes')
  for (const page of [a, b]) {
    await expect(page.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
    await expect(page.getByLabel(/^Your secret (code|word)$/)).toBeVisible()
    await expect(page.getByLabel('Match bets', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Word bank', exact: true })).toHaveCount(0)
  }
}

async function start(a: Page, b: Page) {
  for (const [index, page] of [a, b].entries()) {
    await expect(page.getByRole('tab', { name: 'The bets', exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.getByLabel('Your bet', { exact: true }).fill(index === 0 ? 'You make me coffee.' : 'You bring a snack.')
    await page.getByRole('button', { name: 'Save bet', exact: true }).click()
  }
  for (const page of [a, b]) await page.getByRole('button', { name: 'Agree to bets', exact: true }).click()
  await expect(b.getByRole('button', { name: /^Start (game|round)$/ })).toHaveCount(0)
  await a.getByRole('button', { name: /^Start (game|round)$/ }).click()
  await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
}

for (const mode of ['Number Lock', 'Word Lock']) test(`real local ${mode} creates rooms, chooses private secrets and finishes a round`, async ({ browser }) => {
  const contexts = await Promise.all([320, 390].map(width => browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })))
  const errors: string[] = []
  try {
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message))
    await roomPair(a, b, mode)
    const secrets: string[] = []
    for (const page of [a, b]) {
      const input = page.getByLabel(/^Your secret (code|word)$/)
      const typed = mode === 'Word Lock' ? 'SECRET' : '0011'
      await input.fill(typed)
      await expect(input).toHaveAttribute('type', 'text')
      await expect(page.locator('.code-entry .tile')).toHaveText([...typed])
      await expect(page.getByRole('button', { name: /^(Show|Hide) secret$/ })).toHaveCount(0)
      await page.getByRole('button', { name: 'Choose for me' }).click()
      secrets.push(await input.inputValue())
      await expect(page.locator('.code-entry .tile')).toHaveText([...secrets.at(-1)!])
      expect(secrets.at(-1)).toMatch(mode === 'Word Lock' ? /^[A-Z]{6}$/ : /^\d{4}$/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Lock my secret' }).click()
      await expect(page.getByLabel('Match bets', { exact: true })).toBeVisible()
      await expect(page.locator('.own-secret .tile')).toHaveText([...secrets.at(-1)!])
    }
    await a.reload()
    await expect(a.getByLabel('Match bets', { exact: true })).toBeVisible()
    await expect(a.locator('.own-secret .tile')).toHaveText([...secrets[0]])
    await start(a, b)
    for (const [index, page] of [a, b].entries()) {
      const ownSecret = page.getByRole('group', { name: mode === 'Word Lock' ? 'Your word' : 'Your code', exact: true })
      await expect(ownSecret).toBeVisible()
      await expect(ownSecret.locator('.tile')).toHaveText([...secrets[index]])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await expect(a.getByLabel('Elapsed time')).toBeVisible()
    await expect(a.getByRole('button', { name: 'Choose for me' })).toHaveCount(0)
    await a.getByLabel('Your guess', { exact: true }).fill(secrets[1])
    await a.getByRole('button', { name: /^Try (code|word)$/ }).click()
    await expect(a.getByRole('heading', { name: 'You cracked it first!' })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Alice cracked it first!' })).toBeVisible()
    await expect(a.getByRole('alert')).toHaveCount(0)
    await expect(b.getByRole('alert')).toHaveCount(0)
    expect(errors).toEqual([])
  } finally { await Promise.all(contexts.map(context => context.close())) }
})

test('real local turns auto-colour selected clues and block missed matches before sending', async ({ browser }) => {
  const contexts = await Promise.all([320, 390].map(width => browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b] = await Promise.all(contexts.map(context => context.newPage()))
    await roomPair(a, b, 'Word Lock', true)
    for (const [index, page] of [a, b].entries()) {
      await page.getByLabel('Your secret word', { exact: true }).fill(index === 0 ? 'LETTER' : 'SECRET')
      await page.getByRole('button', { name: 'Lock my secret' }).click()
    }
    await start(a, b)
    await expect(b.getByLabel('Your guess', { exact: true })).toHaveCount(0)
    await a.getByLabel('Your guess', { exact: true }).fill('STREET')
    await a.getByRole('button', { name: 'Try word' }).click()
    await expect(b.getByLabel('Mark clues')).toBeVisible()
    await expect(b.getByRole('group', { name: 'Your word', exact: true }).locator('.tile')).toHaveText([...'SECRET'])
    await b.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(b.getByRole('alert')).toContainText('You missed 5 matching clues at positions 1, 3, 4, 5, 6')
    await expect(a.locator('.history-row')).toHaveCount(0)
    await b.reload()
    await expect(b.getByLabel('Mark clues')).toBeVisible()
    await expect(b.getByRole('group', { name: 'Your word', exact: true }).locator('.tile')).toHaveText([...'SECRET'])
    await b.getByRole('button', { name: 'Clue 2: T', exact: true }).click()
    await expect(b.getByRole('alert')).toContainText('has no unused match')
    for (const [index, letter] of [[1, 'S'], [3, 'R'], [4, 'E'], [5, 'E'], [6, 'T']] as const) {
      await b.getByRole('button', { name: `Clue ${index}: ${letter}`, exact: true }).click()
    }
    await expect(b.getByLabel('Mark clues').locator('.tile')).toHaveClass(['tile hit', 'tile miss', 'tile present', 'tile present', 'tile hit', 'tile hit'])
    for (const page of [a, b]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await b.getByRole('button', { name: 'Check & send hints' }).click()
    await expect(b.getByLabel('Your guess', { exact: true })).toBeVisible()
    await expect(a.getByLabel('Guess history').getByLabel('E, correct position', { exact: true })).toHaveCount(1)
    await expect(a.getByLabel('Guess history').getByLabel('E, wrong position', { exact: true })).toHaveCount(1)
    await expect(a.getByLabel('Your guess', { exact: true })).toHaveCount(0)
    await b.getByLabel('Your guess', { exact: true }).fill('LETTER')
    await b.getByRole('button', { name: 'Try word' }).click()
    await expect(b.getByRole('heading', { name: 'You cracked it first!' })).toBeVisible()
    await expect(a.getByRole('heading', { name: 'Bob cracked it first!' })).toBeVisible()
    await expect(b.getByLabel('Elapsed time')).toHaveCount(0)
  } finally { await Promise.all(contexts.map(context => context.close())) }
})

test('real local completed bets remain private and visible after rematch in either theme', async ({ browser }) => {
  const contexts = await Promise.all([320, 390, 360].map(width => browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true })))
  try {
    const [a, b, outsider] = await Promise.all(contexts.map(context => context.newPage()))
    await roomPair(a, b)
    for (let round = 1; round <= 2; round++) {
      for (const [index, page] of [a, b].entries()) {
        await page.getByLabel('Your secret code', { exact: true }).fill(index === 0 ? '1112' : '3344')
        await page.getByRole('button', { name: 'Lock my secret', exact: true }).click()
      }
      if (round === 1) await start(a, b)
      else {
        await a.getByRole('button', { name: 'Start round', exact: true }).click()
        await expect(a.getByLabel('Your guess', { exact: true })).toBeVisible()
      }
      await a.getByLabel('Your guess', { exact: true }).fill('3344')
      await a.getByRole('button', { name: 'Try code', exact: true }).click()
      if (round === 1) for (const page of [a, b]) await page.getByRole('button', { name: 'Ready for round 2', exact: true }).click()
    }
    await expect(a.getByRole('heading', { name: 'You win the match!', exact: true })).toBeVisible()
    await b.getByRole('button', { name: 'Use dark theme', exact: true }).click()
    for (const [index, page] of [a, b].entries()) {
      await page.getByRole('button', { name: 'Player account and bet history', exact: true }).click()
      await expect(page.getByText('Google accounts require the hosted Supabase game, not the local development server.', { exact: true })).toBeVisible()
      if (index) await page.getByLabel('Bet history result', { exact: true }).selectOption('lost')
      await expect(page.locator('.bet-history-card')).toHaveCount(1)
      await expect(page.locator('.bet-history-card')).toContainText(index ? 'You lost against Alice' : 'You won against Bob')
      await expect(page.locator('.bet-history-card blockquote')).toHaveText('You make me coffee.')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
    }
    for (const page of [a, b]) await page.getByRole('button', { name: 'New match · new bets', exact: true }).click()
    await expect(a.getByLabel('Your secret code', { exact: true })).toBeVisible()
    await a.getByRole('button', { name: 'Player account and bet history', exact: true }).click()
    await expect(a.locator('.bet-history-card blockquote')).toHaveText('You make me coffee.')
    await a.getByLabel('Opponent name', { exact: true }).fill('Nobody')
    await a.getByRole('button', { name: 'Search bets', exact: true }).click()
    await expect(a.locator('.bet-history-card')).toHaveCount(0)
    await expect(a.getByText('No completed matches match this filter yet.', { exact: true })).toBeVisible()
    await outsider.goto('/')
    await outsider.getByRole('button', { name: 'Player account and bet history', exact: true }).click()
    await outsider.getByLabel('Bet history result', { exact: true }).selectOption('all')
    await expect(outsider.getByText('No completed matches match this filter yet.', { exact: true })).toBeVisible()
  } finally { await Promise.all(contexts.map(context => context.close())) }
})
