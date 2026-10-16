import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/hosted',
  fullyParallel: false,
  workers: 1,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  timeout: 90000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:4174', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'http://supabase.test', VITE_SUPABASE_ANON_KEY: 'test-public-key' },
  },
})
