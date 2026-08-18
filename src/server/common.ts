import { ConsoleTransport, Logger, LoggerLevel } from '@kotori-bot/logger'
import { CONFIG } from './config'

export type AppState = {
  logger: Logger
}

export const logger = new Logger({
  level: LoggerLevel.TRACE,
  label: [],
  transports: new ConsoleTransport()
})

export { CONFIG }

export const RUNTIME = process.versions.bun ? 'bun' : 'node'
