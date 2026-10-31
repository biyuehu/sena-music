import z from 'zod'
import type { ADT } from '@/romi/utils/adt'

export type SongType = ADT<{
  netease: string
  local: string
  bili: string
  youtube: string
  url: string
  qq: string
}>

export const songSourceTypeSchema = z.enum(['netease', 'local', 'bili', 'youtube', 'url', 'qq'])

export type SongSourceType = z.infer<typeof songSourceTypeSchema>

export const songLyricSourceTypeSchema = z.enum(['auto', 'netease', 'qq', 'local', 'custom', 'none'])
export type SongLyricSourceType = z.infer<typeof songLyricSourceTypeSchema>

export const songLyricConfigSchema = z.object({
  type: songLyricSourceTypeSchema,
  value: z.string().optional(),
  offset: z.number().optional()
})
export type SongLyricConfig = z.infer<typeof songLyricConfigSchema>

export const songInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(z.string()),
  cover: z.string(),
  type: songSourceTypeSchema,
  value: z.string(),
  order: z.number(),
  lyricConfig: songLyricConfigSchema.optional()
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
  lyricConfig?: SongLyricConfig
}

export interface AddSongRequest {
  name: string
  artists: string[]
  cover: string
  type: SongSourceType
  value: string
  lyricConfig?: SongLyricConfig
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

export const cacheInfoSchema = z.object({
  path: z.string(),
  sizeBytes: z.number().nonnegative()
})

export type CacheInfo = z.infer<typeof cacheInfoSchema>

export const lyricStatusSchema = z.enum(['ok', 'pure_music', 'no_lyric'])
export type LyricStatus = z.infer<typeof lyricStatusSchema>

export const lyricResultSchema = z.object({
  status: lyricStatusSchema,
  original: z.string().optional(),
  translation: z.string().optional(),
  romaji: z.string().optional(),
  offset: z.number().optional()
})
export type LyricResult = z.infer<typeof lyricResultSchema>

export const saveCustomLyricSchema = z.object({
  id: z.string(),
  original: z.string().optional().default(''),
  translation: z.string().optional().default(''),
  romaji: z.string().optional().default('')
})
export type SaveCustomLyricRequest = z.infer<typeof saveCustomLyricSchema>
