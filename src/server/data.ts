import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Either, Left } from '@/romi/utils/adt/either'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import { safeParse, toError } from '@/romi/utils/common'
import { type Playlist, playListSchema } from '../common/types'
import { CONFIG } from './common'
import { PLAYLIST_DATA_FILENAME } from './constant'

export namespace Data {
  export const DATA_DIRECTORY = join(process.cwd(), CONFIG.dataDirectory)
  export const PLAYLIST_DATA_FILE = join(DATA_DIRECTORY, PLAYLIST_DATA_FILENAME)
  export const COOKIES_DATA_FILE = join(DATA_DIRECTORY, 'cookies.txt')
  export const CACHE_DIRECTORY = join(process.cwd(), CONFIG.cacheDirectory)
  export const LYRICS_DIRECTORY = join(DATA_DIRECTORY, 'lyrics')

  export function save(playlist: Playlist): void {
    writeFileSync(PLAYLIST_DATA_FILE, JSON.stringify(playlist, null, 2))
  }

  export function load(): Either<Error, Playlist> {
    try {
      return safeParse(readFileSync(PLAYLIST_DATA_FILE, 'utf-8'), playListSchema)
    } catch (err) {
      return Left(toError(err))
    }
  }

  export function saveCustomLyric(
    id: string,
    lyric: { original?: string; translation?: string; romaji?: string }
  ): void {
    if (!existsSync(LYRICS_DIRECTORY)) mkdirSync(LYRICS_DIRECTORY, { recursive: true })
    const file = join(LYRICS_DIRECTORY, `${id}.json`)
    writeFileSync(file, JSON.stringify(lyric, null, 2), 'utf-8')
  }

  export function loadCustomLyric(id: string): Maybe<{ original?: string; translation?: string; romaji?: string }> {
    const file = join(LYRICS_DIRECTORY, `${id}.json`)
    if (!existsSync(file)) return Nothing()
    try {
      const content = JSON.parse(readFileSync(file, 'utf-8'))
      return Just(content)
    } catch {
      return Nothing()
    }
  }
}
