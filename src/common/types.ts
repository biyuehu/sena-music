import z from 'zod'
import type { ADT } from '@/romi/utils/adt'

export type SongType = ADT<{
  netease: string
  local: string
  bili: string
  youtube: string
  url: string
}>

export const songSourceTypeSchema = z.enum(['netease', 'local', 'bili', 'youtube', 'url'])

export type SongSourceType = z.infer<typeof songSourceTypeSchema>

export const songInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(z.string()),
  cover: z.string(),
  type: songSourceTypeSchema,
  value: z.string(),
  order: z.number()
})

export type SongInfo = z.infer<typeof songInfoSchema>

export interface SongSource {
  url: string
}

export const playListSchema = z.array(songInfoSchema)

export type Playlist = z.infer<typeof playListSchema>

export interface SetSongSourceRequest {
  id: string
  source: SongSourceType
  value: string
}

export interface AddSongRequest {
  name: string
  artists: string[]
  cover: string
  type: SongSourceType
  value: string
}

export interface SetSongOrderRequest {
  id: string
  order: number
}

export interface PlaylistResponse {
  playlist: Playlist
}

export const settingsSchema = z.object({
  playlistId: z.number().int().positive(),
  cacheMaxSize: z.number().nonnegative()
})

export type Settings = z.infer<typeof settingsSchema>
