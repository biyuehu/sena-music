import { createApp } from '@/romi'
import type { InferRouteToClientRoute } from '@/romi/client'
import { appRoute } from './apis'
import { type AppState, logger } from './common'

export type AppRouter = InferRouteToClientRoute<typeof appRoute>

createApp<AppState>(appRoute, {
  state: () => ({
    logger
  })
}).listen(3000, () => logger.info('Server is running at http://localhost:3000'))
