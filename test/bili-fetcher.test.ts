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

  describe('duration and candidate scoring', () => {
    it('should parse duration string correctly', () => {
      expect(BiliFetcher.parseDurationStr('03:45')).toBe(225)
      expect(BiliFetcher.parseDurationStr('01:02:03')).toBe(3723)
      expect(BiliFetcher.parseDurationStr(120)).toBe(120)
      expect(BiliFetcher.parseDurationStr('')).toBe(0)
    })

    it('should format duration seconds correctly', () => {
      expect(BiliFetcher.formatDurationSeconds(225)).toBe('03:45')
      expect(BiliFetcher.formatDurationSeconds(3723)).toBe('1:02:03')
      expect(BiliFetcher.formatDurationSeconds(0)).toBe('00:00')
    })

    it('should score candidate correctly based on title, artist, duration and penalties', () => {
      const goodCandidate = {
        bvid: 'BV1234567890',
        title: 'ヨルシカ - だから僕は音楽を辞めた (Official Video)',
        author: 'ヨルシカ Official',
        pic: 'https://i0.hdslb.com/bfs/archive/test.jpg',
        duration: 245,
        durationStr: '04:05',
        play: 500000
      }
      const score = BiliFetcher.scoreCandidate(goodCandidate, 'だから僕は音楽を辞めた', ['ヨルシカ'], 245)
      expect(score).toBeGreaterThanOrEqual(80)

      const coverCandidate = {
        bvid: 'BV9876543210',
        title: '【翻唱】だから僕は音楽を辞めた / 歌ってみた',
        author: '路人歌手',
        pic: 'https://i0.hdslb.com/bfs/archive/test2.jpg',
        duration: 240,
        durationStr: '04:00',
        play: 500
      }
      const coverScore = BiliFetcher.scoreCandidate(coverCandidate, 'だから僕は音乐を辞めた', ['ヨルシカ'], 245)
      expect(score).toBeGreaterThan(coverScore)
    })
  })

  describe('searchVideos and matchBestVideo', () => {
    it('should search videos with keyword', async () => {
      const result = await BiliFetcher.searchVideos('ヨルシカ', 1, 5)
      expect(result.isJust()).toBe(true)
      if (result.isJust()) {
        const list = result.value
        expect(Array.isArray(list)).toBe(true)
        if (list.length > 0) {
          expect(list[0].bvid).toBeDefined()
          expect(list[0].title).toBeDefined()
          expect(list[0].durationStr).toBeDefined()
        }
      }
    })

    it('should match best video for known song', async () => {
      const result = await BiliFetcher.matchBestVideo('だから僕は音楽を辞めた', ['ヨルシカ'])
      expect(result.isJust()).toBe(true)
      if (result.isJust()) {
        const { best, score } = result.value
        expect(best.bvid).toBeDefined()
        expect(score).toBeGreaterThanOrEqual(50)
      }
    })
  })
})
