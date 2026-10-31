import { describe, expect, it } from 'bun:test'
import type { SongInfo } from '../src/common/types'
import { LyricFetcher } from '../src/server/fetchers/lyrics'

describe('LyricFetcher', () => {
  it('should fetch three-track lyrics (original, translation, romaji) for Japanese song on NetEase', async () => {
    // 536622304 是 Lemon
    const res = await LyricFetcher.fetchNeteaseLyric(536622304)
    expect(res.isJust()).toBe(true)
    if (res.isJust()) {
      const lyric = res.value
      expect(lyric.status).toBe('ok')
      expect(lyric.original?.includes('米津玄師')).toBe(true)
      expect(lyric.translation?.length).toBeGreaterThan(0)
      expect(lyric.romaji?.length).toBeGreaterThan(0)
      console.log('[Test] Japanese 3-track lyrics successfully fetched!')
    }
  })

  it('should fetch lyrics for QQ Music song', async () => {
    const res = await LyricFetcher.fetchQQLyric('002TTnfc13TkgO')
    expect(res.isJust()).toBe(true)
    if (res.isJust()) {
      expect(res.value.status).toBe('ok')
      expect(res.value.original?.includes('苏艺馨')).toBe(true)
      console.log('[Test] QQ Music lyrics successfully fetched!')
    }
  })

  it('should auto-fetch NetEase lyrics for non-custom songs', async () => {
    const song: SongInfo = {
      id: '536622304',
      name: 'Lemon',
      artists: ['米津玄師'],
      cover: '',
      type: 'bili', // 即使改成 B 站，但保留网易云原始 ID 时依然默认走网易云三轨！
      value: 'BV14Gg46LEMh',
      order: 0
    }
    const lyric = await LyricFetcher.getLyric(song)
    expect(lyric.status).toBe('ok')
    expect(lyric.romaji?.length).toBeGreaterThan(0)
  })
})
