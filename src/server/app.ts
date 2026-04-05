import { existsSync } from 'node:fs'
import { createApp } from '@/romi'
import type { InferRouteToClientRoute } from '@/romi/client'
import { appRoute } from './apis'
import { type AppState, CONFIG, logger, RUNTIME } from './common'
import { Data } from './data'
import { NeteaseFetcher } from './fetcher'

export type AppRouter = InferRouteToClientRoute<typeof appRoute>

export function bootstrap() {
  logger.info(`Loading data file at ${Data.PLAYLIST_DATA_FILE} ...`)
  NeteaseFetcher.init()
  logger.info(`Current runtime: ${RUNTIME}`)
  if (existsSync(Data.COOKIES_DATA_FILE)) {
    logger.info(`${Data.COOKIES_DATA_FILE} is found.`)
  } else {
    logger.warn(`${Data.COOKIES_DATA_FILE} is not found, may lead to failure when getting YouTube audio URL.`)
  }

  createApp<AppState>(appRoute, {
    state: () => ({
      logger
    })
  }).listen(CONFIG.port, () => {
    logger.info
    logger.info(`Server is running at http://localhost:${CONFIG.port}`)
  })
}

bootstrap()
