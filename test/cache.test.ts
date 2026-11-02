import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCacheInfo, pruneCache } from '../src/server/cache'
import { Data } from '../src/server/data'

describe('Server Cache', () => {
  const testFileName = 'test-dummy-cache-file.tmp'
  const testFilePath = join(Data.CACHE_DIRECTORY, testFileName)
  const testLockName = 'test-dummy.lock'
  const testLockPath = join(Data.CACHE_DIRECTORY, testLockName)

  beforeAll(() => {
    if (!existsSync(Data.CACHE_DIRECTORY)) {
      mkdirSync(Data.CACHE_DIRECTORY, { recursive: true })
    }
  })

  afterAll(() => {
    if (existsSync(testFilePath)) unlinkSync(testFilePath)
    if (existsSync(testLockPath)) unlinkSync(testLockPath)
  })

  it('should get cache info with valid path and non-negative size', () => {
    const info = getCacheInfo()
    expect(info.path).toBe(Data.CACHE_DIRECTORY)
    expect(info.sizeBytes).toBeGreaterThanOrEqual(0)
  })

  it('should ignore .lock files when calculating total size', () => {
    const initialSize = getCacheInfo().sizeBytes

    // Create a 1KB dummy file
    writeFileSync(testFilePath, Buffer.alloc(1024, 'a'))
    expect(getCacheInfo().sizeBytes).toBe(initialSize + 1024)

    // Create a lock file (should be ignored by size calculation)
    writeFileSync(testLockPath, Buffer.alloc(2048, 'b'))
    expect(getCacheInfo().sizeBytes).toBe(initialSize + 1024)
  })

  it('should remove stale .lock files when pruneCache is called', () => {
    writeFileSync(testLockPath, '1')
    expect(existsSync(testLockPath)).toBe(true)

    // Prune with a large max size
    pruneCache(1024 * 1024 * 1024)

    // Stale lock file should be unlinked
    expect(existsSync(testLockPath)).toBe(false)
  })
})
