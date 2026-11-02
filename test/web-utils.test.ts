import { describe, expect, it } from 'bun:test'
import type { SongInfo } from '../src/common/types'
import { formatTime, getSongUrl } from '../src/web/utils'

describe('Web Utils', () => {
  describe('formatTime', () => {
    it('should format seconds into mm:ss format', () => {
      expect(formatTime(0)).toBe('00:00')
      expect(formatTime(9)).toBe('00:09')
      expect(formatTime(65)).toBe('01:05')
      expect(formatTime(599)).toBe('09:59')
      expect(formatTime(600)).toBe('10:00')
      expect(formatTime(3665)).toBe('61:05')
    })

    it('should handle NaN gracefully', () => {
      expect(formatTime(Number.NaN)).toBe('00:00')
    })

    it('should truncate float seconds', () => {
      expect(formatTime(65.8)).toBe('01:05')
      expect(formatTime(0.4)).toBe('00:00')
    })
  })

  describe('getSongUrl', () => {
    const baseSong: SongInfo = {
      id: 'test-song-id-123',
      name: 'Test Song',
      artists: ['Artist A'],
      cover: 'http://example.com/cover.jpg',
      type: 'netease',
      value: '',
      order: 1000
    }

    it('should resolve netease song url using id when value is empty', async () => {
      const song: SongInfo = { ...baseSong, type: 'netease', id: '123456', value: '' }
      const res = await getSongUrl(song)
      expect(res.isRight()).toBe(true)
      expect(res.unwrap()).toBe('https://music.163.com/song/media/outer/url?id=123456.mp3')
    })

    it('should resolve netease song url using value when provided', async () => {
      const song: SongInfo = { ...baseSong, type: 'netease', id: 'custom-uuid', value: '987654' }
      const res = await getSongUrl(song)
      expect(res.isRight()).toBe(true)
      expect(res.unwrap()).toBe('https://music.163.com/song/media/outer/url?id=987654.mp3')
    })

    it('should resolve local song endpoint', async () => {
      const song: SongInfo = { ...baseSong, type: 'local', id: 'my-local-song' }
      const res = await getSongUrl(song)
      expect(res.isRight()).toBe(true)
      expect(res.unwrap()).toBe('/getLocalAudioFiles?id=my-local-song')
    })

    it('should resolve bili song endpoint', async () => {
      const song: SongInfo = { ...baseSong, type: 'bili', id: 'bili-song-1' }
      const res = await getSongUrl(song)
      expect(res.isRight()).toBe(true)
      expect(res.unwrap()).toBe('/getBiliAudioFile?id=bili-song-1')
    })

    it('should resolve youtube song endpoint', async () => {
      const song: SongInfo = { ...baseSong, type: 'youtube', id: 'yt-song-1' }
      const res = await getSongUrl(song)
      expect(res.isRight()).toBe(true)
      expect(res.unwrap()).toBe('/getYoutubeAudioFile?id=yt-song-1')
    })

    it('should resolve qq song endpoint', async () => {
      const song: SongInfo = { ...baseSong, type: 'qq', id: 'qq-song-1' }
      const res = await getSongUrl(song)
      expect(res.isRight()).toBe(true)
      expect(res.unwrap()).toBe('/getQQAudioFile?id=qq-song-1')
    })

    it('should resolve url type directly to value', async () => {
      const song: SongInfo = { ...baseSong, type: 'url', value: 'https://cdn.example.com/audio.mp3' }
      const res = await getSongUrl(song)
      expect(res.isRight()).toBe(true)
      expect(res.unwrap()).toBe('https://cdn.example.com/audio.mp3')
    })
  })
})
