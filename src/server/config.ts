import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, stringify } from 'smol-toml'
import z from 'zod'

const configSchema = z.object({
  port: z.number().int().positive(),
  dataDirectory: z.string(),
  playlistId: z.number().int().positive(),
  cacheDirectory: z.string(),
  cacheMaxSize: z.number().nonnegative()
})

export type Config = z.infer<typeof configSchema>

export const DEFAULT_CONFIG: Config = {
  port: 6120,
  dataDirectory: 'data',
  playlistId: 2653919517,
  cacheDirectory: 'cache',
  cacheMaxSize: 2048
}

const CONFIG_FILE = join(process.cwd(), 'music.toml')

function initConfigFile(): void {
  if (existsSync(CONFIG_FILE)) return

  // In packaged electron environment, copy template from process.resourcesPath if present
  const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    const template = join(resourcesPath, 'music.toml')
    if (existsSync(template)) {
      copyFileSync(template, CONFIG_FILE)
      return
    }
  }

  // Otherwise generate standard default music.toml
  writeFileSync(CONFIG_FILE, stringify(DEFAULT_CONFIG))
}

function loadConfig(): Config {
  initConfigFile()
  try {
    return configSchema.parse(parse(readFileSync(CONFIG_FILE, 'utf-8')))
  } catch {
    writeFileSync(CONFIG_FILE, stringify(DEFAULT_CONFIG))
    return { ...DEFAULT_CONFIG }
  }
}

export const CONFIG: Config = loadConfig()

export function saveConfig(patch: Pick<Config, 'playlistId' | 'cacheMaxSize'>): void {
  Object.assign(CONFIG, patch)
  writeFileSync(CONFIG_FILE, stringify(CONFIG))
}
