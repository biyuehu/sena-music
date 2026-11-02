import { afterAll, describe, expect, it } from 'bun:test'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Data } from '../src/server/data'

describe('Data Module', () => {
  const testId = '__test_custom_lyric_id__'
  const lyricFilePath = join(Data.LYRICS_DIRECTORY, `${testId}.json`)

  afterAll(() => {
    if (existsSync(lyricFilePath)) unlinkSync(lyricFilePath)
  })

  it('should return Nothing for non-existent custom lyric', () => {
    const lyric = Data.loadCustomLyric('non_existent_id_99999999')
    expect(lyric.isNothing()).toBe(true)
  })

  it('should save and load custom lyric correctly', () => {
    const testLyric = {
      original: '[00:01.00] Test original lyric',
      translation: '[00:01.00] 测试翻译歌词',
      romaji: '[00:01.00] tesuto romaji'
    }

    Data.saveCustomLyric(testId, testLyric)
    expect(existsSync(lyricFilePath)).toBe(true)

    const loaded = Data.loadCustomLyric(testId)
    expect(loaded.isJust()).toBe(true)
    expect(loaded.unwrap()).toEqual(testLyric)
  })

  it('should successfully load existing playlist data', () => {
    const playlistRes = Data.load()
    expect(playlistRes.isRight()).toBe(true)
    const playlist = playlistRes.unwrap()
    expect(Array.isArray(playlist)).toBe(true)
  })
})
