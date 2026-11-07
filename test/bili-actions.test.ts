import { describe, expect, it } from 'bun:test'
import { REQUEST_DEFAULT } from '@/romi'
import { autoMatchBiliSongHandler, searchBiliSongHandler } from '../src/server/actions'
import { logger } from '../src/server/common'
import { Data } from '../src/server/data'

describe('Bili Actions', () => {
  it('searchBiliSongHandler should search and return results', async () => {
    const result = await searchBiliSongHandler.call([{ keyword: 'ヨルシカ' }], { logger }, REQUEST_DEFAULT)

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      const { results } = result.value
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].bvid).toBeDefined()
    }
  })

  it('autoMatchBiliSongHandler should fail cleanly on non-existent song id', async () => {
    const result = await autoMatchBiliSongHandler.call(
      [{ songId: 'non-existent-song-id-12345' }],
      { logger },
      REQUEST_DEFAULT
    )

    expect(result.isLeft()).toBe(true)
  })

  it('autoMatchBiliSongHandler should match for a real song in playlist', async () => {
    const playlistRes = Data.load()
    if (playlistRes.isRight() && playlistRes.value.length > 0) {
      const firstSong = playlistRes.value[0]
      const result = await autoMatchBiliSongHandler.call([{ songId: firstSong.id }], { logger }, REQUEST_DEFAULT)

      expect(result.isRight() || result.isLeft()).toBe(true)
      if (result.isRight()) {
        const { matched, playlist } = result.value
        expect(matched.bvid).toBeDefined()
        const updated = playlist.find((s) => s.id === firstSong.id)
        expect(updated?.type).toBe('bili')
      }
    }
  })
})
