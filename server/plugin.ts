import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { createLocalBackend, type LocalBackend } from './local'

export function localGamePlugin(): Plugin {
  let backend: LocalBackend | undefined
  return {
    name: 'local-multiplayer',
    async configureServer(server) {
      backend = await createLocalBackend(process.env.LOCAL_GAME_DATA_DIR ?? resolve('.local-game'))
      const active = backend
      server.middlewares.use('/__local_game', (req, res) => {
        void active.handle(req, res)
      })
      server.config.logger.info('Local multiplayer ready. Rooms are saved on this Mac; use a private browser window for player 2.')
    },
    async closeBundle() { await backend?.close() },
  }
}
