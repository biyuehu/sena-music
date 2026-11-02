import { describe, expect, it } from 'bun:test'
import { NeteaseFetcher } from '../src/server/fetchers/netease'

describe('NeteaseFetcher', () => {
  it('should fetch tracks from configured NetEase playlist', async () => {
    const res = await NeteaseFetcher.request()
    expect(res.isJust()).toBe(true)

    if (res.isJust()) {
      const playlist = res.value
      expect(Array.isArray(playlist)).toBe(true)
      expect(playlist.length).toBeGreaterThan(0)

      const first = playlist[0]
      expect(first.id.length).toBeGreaterThan(0)
      expect(first.name.length).toBeGreaterThan(0)
      expect(first.type).toBe('netease')
      expect(Array.isArray(first.artists)).toBe(true)
      console.log(
        `[Test] NetEase playlist fetched: ${playlist.length} tracks. First track: "${first.name}" by ${first.artists.join(', ')}`
      )
    }
  })
})
