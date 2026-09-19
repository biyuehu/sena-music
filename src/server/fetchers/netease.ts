import { existsSync, mkdirSync } from 'node:fs'
import { z } from 'zod'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import type { Playlist } from '../../common/types'
import { CONFIG, logger } from '../common'
import { PLAYLIST_SONG_ORDER_GAP } from '../constant'
import { Data } from '../data'

const playlistResponseSchema = z.object({
  playlist: z.object({
    trackIds: z.array(z.object({ id: z.number() }))
  })
})

const songDetailSchema = z.object({
  songs: z.array(
    z.object({
      name: z.string(),
      id: z.number(),
      ar: z
        .array(z.object({ name: z.string() }))
        .optional()
        .default([]),
      al: z.object({ picUrl: z.string() }).optional().default({ picUrl: '' })
    })
  )
})

export namespace NeteaseFetcher {
  export async function request(): Promise<Maybe<Playlist>> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      referer: 'https://music.163.com'
    }

    try {
      const trackIds = playlistResponseSchema.parse(
        await fetch(`https://music.163.com/api/v6/playlist/detail?id=${CONFIG.playlistId}&n=100000&s=8`, {
          method: 'POST',
          headers
        }).then((res) => res.json())
      ).playlist.trackIds
      logger.record(`Total tracks in playlist: ${trackIds.length}`)

      if (trackIds.length === 0) {
        logger.warn('No tracks found in playlist')
        return Just([])
      }

      const songResponse = songDetailSchema.parse(
        await fetch('https://music.163.com/api/v3/song/detail', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            c: JSON.stringify(trackIds.map((item) => ({ id: item.id })))
          }).toString()
        }).then((res) => res.json())
      )

      logger.record('Batch song response songs count:', songResponse.songs.length)

      return Just(
        songResponse.songs.map(
          (song, index) =>
            ({
              id: String(song.id),
              name: song.name,
              artists: song.ar.map((artist) => artist.name),
              cover: song.al.picUrl,
              type: 'netease',
              value: '',
              order: index * PLAYLIST_SONG_ORDER_GAP
            }) as const
        )
      )
    } catch (err) {
      logger.error('Failed to fetch playlist all songs:', err)
      return Nothing()
    }
  }

  export async function init(): Promise<void> {
    if (existsSync(Data.PLAYLIST_DATA_FILE)) return
    if (!existsSync(Data.DATA_DIRECTORY)) mkdirSync(Data.DATA_DIRECTORY)

    Data.save((await request()).unwrapOr([]))
  }
}
