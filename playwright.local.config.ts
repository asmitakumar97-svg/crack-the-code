import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/local-e2e',
  outputDir: './test-results/local',
  workers: 1,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  timeout: 90000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:4175', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev:local -- --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/__local_game/health',
    reuseExistingServer: false,
    env: { LOCAL_GAME_DATA_DIR: 'memory://' },
  },
})
