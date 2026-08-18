import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from './common'
import { Data } from './data'

export function pruneCache(maxSizeBytes: number): void {
  if (!existsSync(Data.CACHE_DIRECTORY)) return

  const entries = readdirSync(Data.CACHE_DIRECTORY)
    .map((name) => {
      const filePath = join(Data.CACHE_DIRECTORY, name)
      const stat = statSync(filePath)
      return { filePath, size: stat.size, mtime: stat.mtimeMs }
    })
    .sort((a, b) => a.mtime - b.mtime)

  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0)
  if (totalSize <= maxSizeBytes) {
    logger.info(`Cache size ${(totalSize / 1024 / 1024).toFixed(2)}MB is within limit`)
    return
  }

  logger.warn(`Cache size ${(totalSize / 1024 / 1024).toFixed(2)}MB exceeds limit, pruning ...`)

  const targetSize = maxSizeBytes * 0.9
  let currentSize = totalSize
  for (const entry of entries) {
    if (currentSize <= targetSize) break
    unlinkSync(entry.filePath)
    currentSize -= entry.size
    logger.info(`Pruned cached file: ${entry.filePath}`)
  }
}