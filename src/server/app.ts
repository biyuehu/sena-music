import { createApp } from '@/romi'
import type { InferRouteToClientRoute } from '@/romi/client'
import { appRoute } from './apis'
import { type AppState, CONFIG, logger } from './common'
import { NeteaseFetcher } from './fetcher'

export type AppRouter = InferRouteToClientRoute<typeof appRoute>

createApp<AppState>(appRoute, {
  state: () => ({
    logger
  })
}).listen(CONFIG.port, () => {
  logger.info(`Server is running at http://localhost:${CONFIG.port}`)
  NeteaseFetcher.init()
})
