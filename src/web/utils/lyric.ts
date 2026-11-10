export interface ParsedLyricLine {
  time: number
  original: string
  translation?: string
  romaji?: string
}

export interface LyricDisplayPreference {
  original: boolean
  translation: boolean
  romaji: boolean
}

const LYRIC_PREFERENCE_STORAGE_KEY = 'sena_lyric_display_preference'

export function getStoredLyricPreference(): LyricDisplayPreference {
  try {
    const raw = localStorage.getItem(LYRIC_PREFERENCE_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return {
    original: true,
    translation: true,
    romaji: true
  }
}

export function saveStoredLyricPreference(pref: LyricDisplayPreference): void {
  try {
    localStorage.setItem(LYRIC_PREFERENCE_STORAGE_KEY, JSON.stringify(pref))
  } catch {
    // ignore
  }
}

export function parseSingleLrc(lrcText: string): Array<{ time: number; text: string }> {
  if (!lrcText?.trim()) return []

  const lines = lrcText.split('\n')
  const result: Array<{ time: number; text: string }> = []
  const timeRegex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (/^\[(ti|ar|al|by|offset):/i.test(trimmed)) continue

    const matches = [...trimmed.matchAll(timeRegex)]
    if (matches.length === 0) continue

    const text = trimmed.replace(timeRegex, '').trim()
    for (const match of matches) {
      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      const millis = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0
      const time = minutes * 60 + seconds + millis / 1000
      result.push({ time, text })
    }
  }

  return result.sort((a, b) => a.time - b.time)
}

export function mergeThreeTrackLyrics(
  originalLrc?: string,
  translationLrc?: string,
  romajiLrc?: string,
  offsetMs = 0
): ParsedLyricLine[] {
  const originalParsed = parseSingleLrc(originalLrc ?? '')
  if (originalParsed.length === 0) return []

  const transParsed = parseSingleLrc(translationLrc ?? '')
  const romajiParsed = parseSingleLrc(romajiLrc ?? '')

  const offsetSec = offsetMs / 1000

  const findMatch = (list: Array<{ time: number; text: string }>, targetTime: number): string | undefined => {
    let bestText: string | undefined
    let minDiff = 0.25
    for (const item of list) {
      const diff = Math.abs(item.time - targetTime)
      if (diff < minDiff && item.text) {
        minDiff = diff
        bestText = item.text
      }
    }
    return bestText
  }

  return originalParsed.map((item) => {
    const translation = findMatch(transParsed, item.time)
    const romaji = findMatch(romajiParsed, item.time)
    return {
      time: Math.max(0, item.time + offsetSec),
      original: item.text,
      translation,
      romaji
    }
  })
}

export function findActiveLyricIndex(lyrics: ParsedLyricLine[], currentTime: number): number {
  if (lyrics.length === 0 || currentTime < lyrics[0].time) return -1

  let low = 0
  let high = lyrics.length - 1
  let best = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (lyrics[mid].time <= currentTime) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return best
}
