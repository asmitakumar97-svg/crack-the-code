import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testDir: './tests/push-e2e',
  outputDir: './test-results/push',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4176' },
  webServer: {
    command: 'npm run dev -- --port 4176 --strictPort',
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'http://supabase.test', VITE_SUPABASE_ANON_KEY: 'test-public-key', VITE_PHONE_PUSH_ENABLED: 'true' },
  },
})
