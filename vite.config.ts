import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { localGamePlugin } from './server/plugin'

export default defineConfig(({ command, mode }) => {
  const local = command === 'serve' && mode === 'local-play'
  return {
    plugins: [react(), tailwindcss(), ...(local ? [localGamePlugin()] : [])],
    define: { 'import.meta.env.VITE_LOCAL_GAME': JSON.stringify(local) },
    test: { include: ['tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 },
  }
})
