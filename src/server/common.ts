import { ConsoleTransport, Logger, LoggerLevel } from '@kotori-bot/logger'

export type AppState = {
  logger: Logger
}

export const logger = new Logger({
  level: LoggerLevel.TRACE,
  label: [],
  transports: new ConsoleTransport()
})

export const CONFIG = {
  port: 3000,
  db: {
    host: 'localhost',
    port: 5432,
    user: 'user',
    password: 'password',
    database: 'database'
  },
  dataDirectory: 'data',
  playlistId: 2653919517
}
