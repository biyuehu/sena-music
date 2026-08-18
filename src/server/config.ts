import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, stringify } from 'smol-toml'
import z from 'zod'

const configSchema = z.object({
  port: z.number().int().positive(),
  db: z.object({
    host: z.string(),
    port: z.number().int().positive(),
    user: z.string(),
    password: z.string(),
    database: z.string()
  }),
  dataDirectory: z.string(),
  playlistId: z.number().int().positive(),
  cacheDirectory: z.string(),
  cacheMaxSize: z.number().nonnegative()
})

export type Config = z.infer<typeof configSchema>

const CONFIG_FILE = join(process.cwd(), 'music.toml')

export const CONFIG: Config = configSchema.parse(parse(readFileSync(CONFIG_FILE, 'utf-8')))

export function saveConfig(patch: Pick<Config, 'playlistId' | 'cacheMaxSize'>): void {
  Object.assign(CONFIG, patch)
  writeFileSync(CONFIG_FILE, stringify(CONFIG))
}
