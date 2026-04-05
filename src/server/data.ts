import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Playlist, playListSchema } from 'src/common/types'
import { type Either, Left } from '@/romi/utils/adt/either'
import { safeParse, toError } from '@/romi/utils/common'
import { CONFIG } from './common'
import { PLAYLIST_DATA_FILENAME } from './constant'

export namespace Data {
  export const DATA_DIRECTORY = join(process.cwd(), CONFIG.dataDirectory)
  export const PLAYLIST_DATA_FILE = join(DATA_DIRECTORY, PLAYLIST_DATA_FILENAME)
  export const COOKIES_DATA_FILE = join(CONFIG.dataDirectory, 'cookies.txt')

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
}
