import { existsSync } from 'node:fs'
import type { Server } from 'node:http'
import { createApp } from '@/romi'
import type { InferRouteToClientRoute } from '@/romi/client'
import { appRoute } from './apis'
import { pruneCache } from './cache'
import { type AppState, CONFIG, logger, RUNTIME } from './common'
import { Data } from './data'
import { NeteaseFetcher } from './fetchers/netease'

export type AppRouter = InferRouteToClientRoute<typeof appRoute>

export function startServer(
  initialPort: number = CONFIG.port,
  maxAttempts: number = 20
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    let currentPort = initialPort
    let attempts = 0

    function tryListen() {
      const server = createApp<AppState>(appRoute, {
        state: () => ({
          logger
        })
      })

      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener('error', onError)
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          logger.warn(`Port ${currentPort} is already in use. Retrying on port ${currentPort + 1} ...`)
          attempts++
          currentPort++
          tryListen()
        } else {
          logger.error(`Failed to start server on port ${currentPort}: ${err.message}`)
          reject(err)
        }
      }

      server.once('error', onError)

      server.listen(currentPort, () => {
        server.removeListener('error', onError)
        CONFIG.port = currentPort
        logger.info(`Server is running at http://localhost:${currentPort}`)
        resolve({ server, port: currentPort })
      })
    }

    tryListen()
  })
}

export async function bootstrap(initialPort: number = CONFIG.port): Promise<{ server: Server; port: number }> {
  logger.info(`Loading data file at ${Data.PLAYLIST_DATA_FILE} ...`)
  NeteaseFetcher.init()
  pruneCache(CONFIG.cacheMaxSize * 1024 * 1024)
  logger.info(`Current runtime: ${RUNTIME}`)
  if (existsSync(Data.COOKIES_DATA_FILE)) {
    logger.info(`${Data.COOKIES_DATA_FILE} is found.`)
  } else {
    logger.warn(`${Data.COOKIES_DATA_FILE} is not found, may lead to failure when getting YouTube audio URL.`)
  }

  return startServer(initialPort)
}

const isElectron = typeof process !== 'undefined' && Boolean(process.versions?.electron)
if (!isElectron) {
  bootstrap().catch((err) => {
    logger.error('Failed to start server:', err)
    process.exit(1)
  })
}
