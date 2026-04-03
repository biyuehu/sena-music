import { ConsoleTransport, Logger, LoggerLevel } from '@kotori-bot/logger'

export type AppState = {
  logger: Logger
}

export const logger = new Logger({
  level: LoggerLevel.TRACE,
  label: [],
  transports: new ConsoleTransport()
})
