import { randomUUID } from 'node:crypto'
import z from 'zod'
import { Action, BodyExtracter, QueryExtracter } from '@/romi'
import { Left, Right } from '@/romi/utils/adt/either'
import { stringifyCatchError } from '@/romi/utils/common'
import {
  autoMatchBiliSongRequestSchema,
  saveCustomLyricSchema,
  searchBiliSongRequestSchema,
  settingsSchema,
  songLyricConfigSchema,
  songSourceTypeSchema
} from '../common/types'
import { getCacheInfo, pruneCache } from './cache'
import { type AppState, CONFIG } from './common'
import { saveConfig } from './config'
import { PLAYLIST_SONG_ORDER_GAP } from './constant'
import { Data } from './data'
import { BiliFetcher } from './fetchers/bilibili'
import { LyricFetcher } from './fetchers/lyrics'
import { NeteaseFetcher } from './fetchers/netease'
import { QQFetcher } from './fetchers/qq'
import { YoutubeFetcher } from './fetchers/youtube'

export const getPlaylistHandler = Action.empty<AppState>().bind(async (_data, { logger }) =>
  Data.load().match({
    Right: (playlist) => Right({ playlist }),
    Left: (err) => {
      logger.error('Failed to load playlist:', err)
      return Left({ error: stringifyCatchError(err) })
    }
  })
)

export const setSongSourceHandler = Action.empty<AppState>()
  .use([
    new BodyExtracter(
      z.object({
        id: z.string(),
        source: songSourceTypeSchema,
        value: z.string(),
        lyricConfig: songLyricConfigSchema.optional()
      })
    )
  ] as const)
  .bind(async ([{ id, source, value, lyricConfig }], { logger }) => {
    if (source === 'bili' && value.trim()) {
      logger.info(`Pre-caching Bilibili audio for song ${id} (${value}) ...`)
      const audioResult = await BiliFetcher.getAudioFilePath(value.trim())
      if (audioResult.isNothing()) {
        logger.warn(`Failed to pre-cache Bilibili audio for song ${id} (${value}), continuing to save`)
      }
    }

    return Data.load().match({
      Right: (playlist) => {
        const songIndex = playlist.findIndex((song) => song.id === id)

        if (songIndex === -1) {
          logger.warn(`Song with id ${id} not found`)
          return Left({ error: `Song with id ${id} not found` })
        }

        const updatedPlaylist = playlist.map((song) =>
          song.id === id
            ? { ...song, type: source, value, ...(lyricConfig !== undefined ? { lyricConfig } : {}) }
            : song
        )

        try {
          Data.save(updatedPlaylist)
          logger.info(`Updated source for song ${id} to ${source}`)
          return Right({ playlist: updatedPlaylist })
        } catch (err) {
          logger.error('Failed to save playlist:', err)
          return Left({ error: `Failed to save playlist: ${stringifyCatchError(err)}` })
        }
      },
      Left: (err) => {
        logger.error('Failed to load playlist:', err)
        return Left({ error: `Failed to load playlist: ${stringifyCatchError(err)}` })
      }
    })
  })

export const addSongHandler = Action.empty<AppState>()
  .use([
    new BodyExtracter(
      z.object({
        name: z.string(),
        artists: z.array(z.string()),
        cover: z.string(),
        type: songSourceTypeSchema,
        value: z.string(),
        lyricConfig: songLyricConfigSchema.optional()
      })
    )
  ] as const)
  .bind(async ([{ name, artists, cover, type, value, lyricConfig }], { logger }) =>
    Data.load().match({
      Right: (playlist) => {
        const newSong = {
          id: randomUUID(),
          name,
          artists,
          cover,
          type,
          value,
          order: 0,
          ...(lyricConfig !== undefined ? { lyricConfig } : {})
        }

        const updatedPlaylist = [newSong, ...playlist].map((song, index) => ({
          ...song,
          order: index * PLAYLIST_SONG_ORDER_GAP
        }))

        try {
          Data.save(updatedPlaylist)
          logger.info(`Added new song: ${name} by ${artists.join(', ')}`)
          return Right({ playlist: updatedPlaylist })
        } catch (err) {
          logger.error('Failed to save playlist:', err)
          return Left({ error: `Failed to save playlist: ${stringifyCatchError(err)}` })
        }
      },
      Left: (err) => {
        logger.error('Failed to load playlist:', err)
        return Left({ error: `Failed to load playlist: ${stringifyCatchError(err)}` })
      }
    })
  )

export const setSongOrderHandler = Action.empty<AppState>()
  .use([
    new BodyExtracter(
      z.object({
        id: z.string(),
        order: z.number()
      })
    )
  ] as const)
  .bind(async ([{ id, order }], { logger }) =>
    Data.load().match({
      Right: (playlist) => {
        const targetIndex = playlist.findIndex((song) => song.id === id)

        if (targetIndex === -1) {
          logger.warn(`Song with id ${id} not found`)
          return Left({ error: `Song with id ${id} not found` })
        }

        if (order < 0) {
          logger.warn(`Invalid order value: ${order}`)
          return Left({ error: `Order must be non-negative` })
        }

        const targetSong = playlist[targetIndex]
        const otherSongs = playlist.filter((song) => song.id !== id)
        const sortedOtherSongs = [...otherSongs].sort((a, b) => a.order - b.order)

        const insertIndex = Math.min(Math.floor(order / PLAYLIST_SONG_ORDER_GAP), sortedOtherSongs.length)

        const updatedPlaylist = [
          ...sortedOtherSongs.slice(0, insertIndex),
          targetSong,
          ...sortedOtherSongs.slice(insertIndex)
        ].map((song, index) => ({
          ...song,
          order: index * PLAYLIST_SONG_ORDER_GAP
        }))

        try {
          Data.save(updatedPlaylist)
          logger.info(`Reordered song ${id} to position ${insertIndex}`)
          return Right({ playlist: updatedPlaylist })
        } catch (err) {
          logger.error('Failed to save playlist:', err)
          return Left({ error: `Failed to save playlist: ${stringifyCatchError(err)}` })
        }
      },
      Left: (err) => {
        logger.error('Failed to load playlist:', err)
        return Left({ error: `Failed to load playlist: ${stringifyCatchError(err)}` })
      }
    })
  )

export const removeSongHandler = Action.empty<AppState>()
  .use([new BodyExtracter(z.object({ id: z.string() }))] as const)
  .bind(async ([{ id }], { logger }) =>
    Data.load().match({
      Right: (playlist) => {
        const targetIndex = playlist.findIndex((song) => song.id === id)

        if (targetIndex === -1) {
          logger.warn(`Song with id ${id} not found`)
          return Left({ error: `Song with id ${id} not found` })
        }

        const updatedPlaylist = [...playlist.slice(0, targetIndex), ...playlist.slice(targetIndex + 1)]

        try {
          Data.save(updatedPlaylist)
          logger.info(`Removed song with id ${id}`)
          return Right({ playlist: updatedPlaylist })
        } catch (err) {
          logger.error('Failed to save playlist:', err)
          return Left({ error: `Failed to save playlist: ${stringifyCatchError(err)}` })
        }
      },
      Left: (err) => {
        logger.error('Failed to load playlist:', err)
        return Left({ error: `Failed to load playlist: ${stringifyCatchError(err)}` })
      }
    })
  )

export const syncHandler = Action.empty<AppState>().bind(async (_data, { logger }) => {
  const localPlaylistResult = Data.load()
  if (localPlaylistResult.isLeft()) {
    logger.error('Failed to load local playlist:', localPlaylistResult.value)
    return Left({ error: `Failed to load local playlist: ${stringifyCatchError(localPlaylistResult.value)}` })
  }
  const localPlaylist = localPlaylistResult.value

  const neteaseResult = await NeteaseFetcher.request()
  if (neteaseResult.isNothing()) {
    logger.error('Failed to fetch playlist from Netease')
    return Left({ error: 'Failed to fetch playlist from Netease' })
  }
  const neteasePlaylist = neteaseResult.value

  const isCustom = (id: string) => id.length >= 36
  const localMap = new Map(localPlaylist.map((s) => [s.id, s]))

  const updatedNeteaseSongs = neteasePlaylist.map((nSong) => {
    const localVersion = localMap.get(nSong.id)
    if (localVersion && localVersion.type !== 'netease') return localVersion
    return { ...nSong }
  })

  const newNeteaseIdSet = new Set(updatedNeteaseSongs.map((s) => s.id))

  const customGroups = new Map<string | null, typeof localPlaylist>()
  let lastSeenNeteaseId: string | null = null

  for (const song of localPlaylist) {
    if (isCustom(song.id)) {
      const group = customGroups.get(lastSeenNeteaseId) || []
      group.push(song)
      customGroups.set(lastSeenNeteaseId, group)
    } else if (newNeteaseIdSet.has(song.id)) {
      lastSeenNeteaseId = song.id
    }
  }

  const mergedPlaylist: typeof localPlaylist = []

  if (customGroups.has(null)) {
    mergedPlaylist.push(...(customGroups.get(null) ?? []))
  }

  for (const nSong of updatedNeteaseSongs) {
    mergedPlaylist.push(nSong)
    if (customGroups.has(nSong.id)) {
      mergedPlaylist.push(...(customGroups.get(nSong.id) ?? []))
    }
  }

  const placedIds = new Set(mergedPlaylist.map((s) => s.id))
  for (const song of localPlaylist) {
    if (isCustom(song.id) && !placedIds.has(song.id)) {
      mergedPlaylist.push(song)
    }
  }

  const finalPlaylist = mergedPlaylist.map((song, index) => ({
    ...song,
    order: index * PLAYLIST_SONG_ORDER_GAP
  }))

  try {
    Data.save(finalPlaylist)
    logger.info(`Sync success: ${localPlaylist.length} -> ${finalPlaylist.length} songs.`)
    return Right({ playlist: finalPlaylist })
  } catch (err) {
    logger.error('Save failed:', stringifyCatchError(err))
    return Left({ error: 'Save failed' })
  }
})

export const getLocalAudioFilesHandler = Action.empty<AppState>()
  .use([new QueryExtracter(z.object({ id: z.string() }))] as const)
  .bind(async ([{ id }], { logger }) =>
    Data.load().match({
      Right: (playlist) => {
        const targetSong = playlist.find((song) => song.id === id)
        if (!targetSong) {
          logger.warn(`Song with id ${id} not found`)
          return Left({ type: 'application/json', content: JSON.stringify({ error: `Song with id ${id} not found` }) })
        }

        if (targetSong.type !== 'local' || !targetSong.value.trim()) {
          logger.warn(`Song with id ${id} is not a local file`)
          return Left({
            type: 'application/json',
            content: JSON.stringify({ error: `Song with id ${id} is not a local file` })
          })
        }
        logger.info(`Serving song with id ${id} as a local file: ${targetSong.value}`)
        return Right({
          type: 'audio/mpeg',
          path: targetSong.value,
          headers: {
            'Accept-Ranges': 'bytes'
          }
        })
      },
      Left: (err) => {
        logger.error('Failed to load playlist:', err)
        return Left({
          type: 'application/json',
          content: JSON.stringify(`Failed to load playlist: ${stringifyCatchError(err)}`)
        })
      }
    })
  )

export const getYoutubeAudioFileHandler = Action.empty<AppState>()
  .use([new QueryExtracter(z.object({ id: z.string() }))] as const)
  .bind(async ([{ id }], { logger }) => {
    const data = Data.load().map((playlist) => playlist.find((song) => song.id === id))
    if (data.isLeft()) {
      logger.error('Failed to load playlist:', data.value)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Failed to load playlist: ${stringifyCatchError(data.value)}` }),
        code: 500
      })
    }
    if (data.value === void 0) {
      logger.warn(`Song with id ${id} not found`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Song with id ${id} not found` }),
        code: 404
      })
    }

    if (data.value.type !== 'youtube' || !data.value.value.trim()) {
      logger.warn(`Song with id ${id} is not a YouTube video`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Song with id ${id} is not a YouTube video` }),
        code: 400
      })
    }

    logger.info(`Getting YouTube audio for song "${data.value.name}" (id: ${id}, value: "${data.value.value}") ...`)

    const audioFilePathResult = await YoutubeFetcher.getAudioFilePath(data.value.value)
    if (audioFilePathResult.isNothing()) {
      logger.error(`Failed to get YouTube audio file for song ${id}`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: 'Failed to get YouTube audio file' }),
        code: 502
      })
    }

    return Right({
      type: 'audio/mpeg',
      path: audioFilePathResult.value,
      headers: {
        'Accept-Ranges': 'bytes'
      }
    })
  })

export const getBiliAudioFileHandler = Action.empty<AppState>()
  .use([new QueryExtracter(z.object({ id: z.string(), v: z.string().optional() }))] as const)
  .bind(async ([{ id, v }], { logger }) => {
    const data = Data.load().map((playlist) => playlist.find((song) => song.id === id))
    if (data.isLeft()) {
      logger.error('Failed to load playlist:', data.value)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Failed to load playlist: ${stringifyCatchError(data.value)}` }),
        code: 500
      })
    }
    if (data.value === void 0) {
      logger.warn(`Song with id ${id} not found`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Song with id ${id} not found` }),
        code: 404
      })
    }

    const bvid = (v || data.value.value || '').trim()
    if (!bvid) {
      logger.warn(`Song with id ${id} does not have a Bilibili BV ID`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Song with id ${id} does not have a Bilibili BV ID` }),
        code: 400
      })
    }

    logger.info(`Getting Bilibili audio for song "${data.value.name}" (id: ${id}, value: "${bvid}") ...`)

    const audioFilePathResult = await BiliFetcher.getAudioFilePath(bvid)
    if (audioFilePathResult.isNothing()) {
      logger.error(`Failed to get Bilibili audio file for song ${id} (${bvid})`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: 'Failed to get Bilibili audio file' }),
        code: 502
      })
    }

    return Right({
      type: 'audio/mpeg',
      path: audioFilePathResult.value,
      headers: {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, must-revalidate'
      }
    })
  })

export const getQQAudioFileHandler = Action.empty<AppState>()
  .use([new QueryExtracter(z.object({ id: z.string() }))] as const)
  .bind(async ([{ id }], { logger }) => {
    const data = Data.load().map((playlist) => playlist.find((song) => song.id === id))
    if (data.isLeft()) {
      logger.error('Failed to load playlist:', data.value)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Failed to load playlist: ${stringifyCatchError(data.value)}` }),
        code: 500
      })
    }
    if (data.value === void 0) {
      logger.warn(`Song with id ${id} not found`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Song with id ${id} not found` }),
        code: 404
      })
    }

    if (data.value.type !== 'qq' || (!data.value.value.trim() && !data.value.id.trim())) {
      logger.warn(`Song with id ${id} is not a QQ Music source`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Song with id ${id} is not a QQ Music source` }),
        code: 400
      })
    }

    const songValue = data.value.value.trim() || data.value.id.trim()
    logger.info(`Getting QQ Music audio for song "${data.value.name}" (id: ${id}, value: "${songValue}") ...`)

    const audioFilePathResult = await QQFetcher.getAudioFilePath(songValue)
    if (audioFilePathResult.isNothing()) {
      logger.error(`Failed to get QQ Music audio file for song ${id}`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: 'Failed to get QQ Music audio file' }),
        code: 502
      })
    }

    return Right({
      type: 'audio/mpeg',
      path: audioFilePathResult.value,
      headers: {
        'Accept-Ranges': 'bytes'
      }
    })
  })

export const getSettingsHandler = Action.empty<AppState>().bind(async (_data, { logger }) => {
  logger.info('Getting settings')
  return Right({ playlistId: CONFIG.playlistId, cacheMaxSize: CONFIG.cacheMaxSize })
})

export const setSettingsHandler = Action.empty<AppState>()
  .use([new BodyExtracter(settingsSchema)] as const)
  .bind(async ([{ playlistId, cacheMaxSize }], { logger }) => {
    try {
      saveConfig({ playlistId, cacheMaxSize })
      logger.info(`Updated settings: playlistId=${playlistId}, cacheMaxSize=${cacheMaxSize}`)
      return Right({ playlistId, cacheMaxSize })
    } catch (err) {
      logger.error('Failed to save settings:', err)
      return Left({ error: `Failed to save settings: ${stringifyCatchError(err)}` })
    }
  })

export const getCacheInfoHandler = Action.empty<AppState>().bind(async (_data, { logger }) => {
  logger.info('Getting cache info')
  return Right(getCacheInfo())
})

export const cleanCacheHandler = Action.empty<AppState>().bind(async (_data, { logger }) => {
  logger.info('Cleaning cache')
  pruneCache(0)
  return Right(getCacheInfo())
})

export const getLyricHandler = Action.empty<AppState>()
  .use([new BodyExtracter(z.object({ id: z.string() }))] as const)
  .bind(async ([{ id }], { logger }) => {
    const data = Data.load().map((playlist) => playlist.find((song) => song.id === id))
    if (data.isLeft()) {
      logger.error('Failed to load playlist:', data.value)
      return Left({ error: `Failed to load playlist: ${stringifyCatchError(data.value)}` })
    }
    const song = data.value
    if (!song) {
      logger.warn(`Song with id ${id} not found`)
      return Left({ error: `Song with id ${id} not found` })
    }

    const lyric = await LyricFetcher.getLyric(song)
    return Right(lyric)
  })

export const saveCustomLyricHandler = Action.empty<AppState>()
  .use([new BodyExtracter(saveCustomLyricSchema)] as const)
  .bind(async ([{ id, original, translation, romaji }], { logger }) => {
    try {
      Data.saveCustomLyric(id, { original, translation, romaji })
      logger.info(`Saved custom lyric for song ${id}`)
      return Right({ success: true })
    } catch (err) {
      logger.error(`Failed to save custom lyric for song ${id}:`, err)
      return Left({ error: `Failed to save custom lyric: ${stringifyCatchError(err)}` })
    }
  })

export const searchBiliSongHandler = Action.empty<AppState>()
  .use([new BodyExtracter(searchBiliSongRequestSchema)] as const)
  .bind(async ([{ keyword }], { logger }) => {
    logger.info(`Searching Bilibili for keyword: "${keyword}"`)
    const result = await BiliFetcher.searchVideos(keyword)
    return result.match({
      Just: (results) => Right({ results }),
      Nothing: () => Left({ error: 'Failed to search Bilibili videos' })
    })
  })

export const autoMatchBiliSongHandler = Action.empty<AppState>()
  .use([new BodyExtracter(autoMatchBiliSongRequestSchema)] as const)
  .bind(async ([{ songId }], { logger }) => {
    logger.info(`Auto-matching Bilibili audio for song: ${songId}`)
    const playlistRes = Data.load()
    if (playlistRes.isLeft()) {
      logger.error('Failed to load playlist:', playlistRes.value)
      return Left({ error: `Failed to load playlist: ${stringifyCatchError(playlistRes.value)}` })
    }

    const playlist = playlistRes.value
    const targetSong = playlist.find((s) => s.id === songId)
    if (!targetSong) {
      logger.warn(`Song with id ${songId} not found`)
      return Left({ error: `Song with id ${songId} not found` })
    }

    const matchRes = await BiliFetcher.matchBestVideo(targetSong.name, targetSong.artists)
    if (matchRes.isNothing()) {
      logger.warn(`No suitable Bilibili match found for song "${targetSong.name}"`)
      return Left({ error: `No suitable Bilibili match found for song "${targetSong.name}"` })
    }

    const { best, score } = matchRes.value
    logger.info(`Auto-matched song "${targetSong.name}" to Bilibili ${best.bvid} (${best.title}) with score ${score}`)
    const updatedPlaylist = playlist.map((s) =>
      s.id === songId ? { ...s, type: 'bili' as const, value: best.bvid } : s
    )
    try {
      Data.save(updatedPlaylist)
      // Pre-warm the cache so instant playback succeeds
      await BiliFetcher.getAudioFilePath(best.bvid)
      return Right({
        matched: best,
        score,
        playlist: updatedPlaylist
      })
    } catch (err) {
      logger.error('Failed to save playlist after auto-matching Bilibili:', err)
      return Left({ error: `Failed to save playlist: ${stringifyCatchError(err)}` })
    }
  })
