import { describe, expect, it } from 'bun:test'
import { BiliFetcher } from '../src/server/fetchers/bilibili'

describe('BiliFetcher', () => {
  const testUrl = 'https://www.bilibili.com/video/BV14Gg46LEMh'
  const testBvid = 'BV14Gg46LEMh'

  describe('parseInput', () => {
    it('should parse full bilibili video URL', async () => {
      const result = await BiliFetcher.parseInput(testUrl)
      expect(result.bvid).toBe(testBvid)
      expect(result.page).toBe(1)
    })

    it('should parse raw BV ID', async () => {
      const result = await BiliFetcher.parseInput(testBvid)
      expect(result.bvid).toBe(testBvid)
      expect(result.page).toBe(1)
    })

    it('should parse URL with ?p=2 part parameter', async () => {
      const result = await BiliFetcher.parseInput(`${testUrl}?p=2`)
      expect(result.bvid).toBe(testBvid)
      expect(result.page).toBe(2)
    })

    it('should parse AV id', async () => {
      const result = await BiliFetcher.parseInput('av170001')
      expect(result.aid).toBe(170001)
      expect(result.page).toBe(1)
    })
  })

  describe('getVideoInfo', () => {
    it('should fetch video metadata for test URL', async () => {
      const result = await BiliFetcher.getVideoInfo(testUrl)
      expect(result.isJust()).toBe(true)

      if (result.isJust()) {
        const info = result.value
        expect(info.bvid).toBe(testBvid)
        expect(info.cid).toBeGreaterThan(0)
        expect(info.title.length).toBeGreaterThan(0)
        expect(info.artist.length).toBeGreaterThan(0)
        expect(info.cover.length).toBeGreaterThan(0)
        console.log(`[Test] Fetched video: "${info.title}" by ${info.artist}, CID: ${info.cid}`)
      }
    })
  })

  describe('getAudioFilePath', () => {
    it('should get audio file path for test URL', async () => {
      const result = await BiliFetcher.getAudioFilePath(testUrl)
      expect(result.isJust()).toBe(true)

      if (result.isJust()) {
        const filePath = result.value
        expect(filePath.endsWith('.mp3')).toBe(true)
        console.log(`[Test] Audio file path: ${filePath}`)
      }
    })
  })
})
