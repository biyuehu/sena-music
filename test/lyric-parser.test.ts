import { describe, expect, it } from 'bun:test'
import { findActiveLyricIndex, mergeThreeTrackLyrics, parseSingleLrc } from '../src/web/utils/lyric'

describe('Lyric Parser', () => {
  const original = `[ti:Lemon]
[ar:米津玄師]
[00:00.851]夢ならばどれほどよかったでしょう
[00:06.650]未だにあなたのことを夢にみる`

  const trans = `[00:00.851]如果这一切都是梦境该有多好
[00:06.650]至今仍能与你在梦中相遇`

  const romaji = `[00:00.851]yu me na ra ba do re ho do yo ka tta de
[00:06.650]i ma da ni a na ta no ko to wo yu me ni mi ru`

  it('should parse single LRC correctly', () => {
    const list = parseSingleLrc(original)
    expect(list.length).toBe(2)
    expect(list[0].text).toBe('夢ならばどれほどよかったでしょう')
    expect(list[0].time).toBeCloseTo(0.851, 2)
  })

  it('should merge three tracks accurately', () => {
    const merged = mergeThreeTrackLyrics(original, trans, romaji, 500)
    expect(merged.length).toBe(2)
    expect(merged[0].original).toBe('夢ならばどれほどよかったでしょう')
    expect(merged[0].translation).toBe('如果这一切都是梦境该有多好')
    expect(merged[0].romaji?.startsWith('yu me')).toBe(true)
    expect(merged[0].time).toBeCloseTo(1.351, 2)
  })

  it('should find active lyric index', () => {
    const merged = mergeThreeTrackLyrics(original, trans, romaji)
    expect(findActiveLyricIndex(merged, 0)).toBe(-1)
    expect(findActiveLyricIndex(merged, 2.0)).toBe(0)
    expect(findActiveLyricIndex(merged, 8.0)).toBe(1)
  })
})
