import { describe, expect, it } from 'bun:test'
import { QQFetcher } from '../src/server/fetchers/qq'

describe('QQFetcher', () => {
  const testMid = '002TTnfc13TkgO'
  const testUrl = `https://y.qq.com/n/ryqq/songDetail/${testMid}`
  const testId = 728722164

  describe('parseInput', () => {
    it('should parse raw 14-char songmid', () => {
      const result = QQFetcher.parseInput(testMid)
      expect(result.songmid).toBe(testMid)
    })

    it('should parse full QQ Music songDetail URL with mid', () => {
      const result = QQFetcher.parseInput(testUrl)
      expect(result.songmid).toBe(testMid)
    })

    it('should parse URL with songmid parameter', () => {
      const result = QQFetcher.parseInput(`https://i.y.qq.com/v8/playsong.html?songmid=${testMid}`)
      expect(result.songmid).toBe(testMid)
    })

    it('should parse pure numeric songid', () => {
      const result = QQFetcher.parseInput(String(testId))
      expect(result.songid).toBe(testId)
    })
  })

  describe('getSongDetail', () => {
    it('should fetch song detail by songmid', async () => {
      const result = await QQFetcher.getSongDetail(testMid)
      expect(result.isJust()).toBe(true)

      if (result.isJust()) {
        const detail = result.value
        expect(detail.mid).toBe(testMid)
        expect(detail.name).toBe('时过境迁')
        expect(detail.artists.length).toBeGreaterThan(0)
        expect(detail.cover).toContain('http')
      }
    })
  })

  describe('getPlayUrl', () => {
    it('should fetch direct play url for valid song', async () => {
      const result = await QQFetcher.getPlayUrl(testMid)
      expect(result.isJust()).toBe(true)

      if (result.isJust()) {
        const url = result.value
        expect(url.startsWith('http')).toBe(true)
        expect(url).toContain('.m4a')
      }
    })
  })

  describe('request playlist', () => {
    it('should fetch playlist tracks', async () => {
      const result = await QQFetcher.request('8543787720')
      expect(result.isJust()).toBe(true)

      if (result.isJust()) {
        const playlist = result.value
        expect(playlist.length).toBeGreaterThan(0)
        expect(playlist[0].type).toBe('qq')
        expect(playlist[0].name.length).toBeGreaterThan(0)
      }
    })
  })
})
