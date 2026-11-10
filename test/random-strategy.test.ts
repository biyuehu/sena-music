import { describe, expect, it } from 'bun:test'
import { getRandomNextIndex } from '../src/web/utils/song'

describe('Random Strategy & History Stack', () => {
  it('getRandomNextIndex should return 0 when length <= 1', () => {
    expect(getRandomNextIndex(0, -1)).toBe(0)
    expect(getRandomNextIndex(1, 0)).toBe(0)
  })

  it('getRandomNextIndex should never return currentIndex when length > 1', () => {
    const length = 5
    for (let currentIndex = 0; currentIndex < length; currentIndex++) {
      for (let i = 0; i < 50; i++) {
        const next = getRandomNextIndex(length, currentIndex)
        expect(next).toBeGreaterThanOrEqual(0)
        expect(next).toBeLessThan(length)
        expect(next).not.toBe(currentIndex)
      }
    }
  })

  it('getRandomNextIndex should cover all indices except currentIndex', () => {
    const length = 4
    const currentIndex = 1
    const seen = new Set<number>()

    for (let i = 0; i < 200; i++) {
      seen.add(getRandomNextIndex(length, currentIndex))
    }

    expect(seen.has(0)).toBe(true)
    expect(seen.has(1)).toBe(false)
    expect(seen.has(2)).toBe(true)
    expect(seen.has(3)).toBe(true)
  })

  it('should correctly simulate random history stack behavior', () => {
    const playlist = [
      { id: 'song-0', name: 'Song 0' },
      { id: 'song-1', name: 'Song 1' },
      { id: 'song-2', name: 'Song 2' },
      { id: 'song-3', name: 'Song 3' }
    ]

    const randomHistory: string[] = []
    let isPlayingFromHistory = false
    let currentIndex = 0

    function play(index: number) {
      if (!isPlayingFromHistory && currentIndex >= 0 && currentIndex !== index) {
        randomHistory.push(playlist[currentIndex].id)
      }
      isPlayingFromHistory = false
      currentIndex = index
    }

    function next(fixedNextIndex?: number) {
      const nextIndex = fixedNextIndex ?? getRandomNextIndex(playlist.length, currentIndex)
      play(nextIndex)
    }

    function prev() {
      while (randomHistory.length > 0) {
        const prevId = randomHistory.pop()
        if (!prevId) continue
        const targetIndex = playlist.findIndex((s) => s.id === prevId)
        if (targetIndex !== -1 && targetIndex !== currentIndex) {
          isPlayingFromHistory = true
          play(targetIndex)
          return
        }
      }
      play((currentIndex - 1 + playlist.length) % playlist.length)
    }

    // Step 1: Start at song 0, next to 2
    next(2)
    expect(currentIndex).toBe(2)
    expect(randomHistory).toEqual(['song-0'])

    // Step 2: Next to 3
    next(3)
    expect(currentIndex).toBe(3)
    expect(randomHistory).toEqual(['song-0', 'song-2'])

    // Step 3: Next to 1
    next(1)
    expect(currentIndex).toBe(1)
    expect(randomHistory).toEqual(['song-0', 'song-2', 'song-3'])

    // Step 4: Prev should go back to 3 (remembered!)
    prev()
    expect(currentIndex).toBe(3)
    expect(randomHistory).toEqual(['song-0', 'song-2'])

    // Step 5: Prev should go back to 2 (remembered!)
    prev()
    expect(currentIndex).toBe(2)
    expect(randomHistory).toEqual(['song-0'])

    // Step 6: Prev should go back to 0 (remembered!)
    prev()
    expect(currentIndex).toBe(0)
    expect(randomHistory).toEqual([])

    // Step 7: History exhausted, fallback to previous in playlist (3)
    prev()
    expect(currentIndex).toBe(3)
  })
})
