import { exec } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import { settingsSchema, songSourceTypeSchema } from 'src/common/types'
import z from 'zod'
import { Action, BodyExtracter, QueryExtracter } from '@/romi'
import { Left, Right } from '@/romi/utils/adt/either'
import { stringifyCatchError } from '@/romi/utils/common'
import { type AppState, CONFIG, RUNTIME } from './common'
import { saveConfig } from './config'
import { PLAYLIST_SONG_ORDER_GAP } from './constant'
import { Data } from './data'
import { BiliFetcher } from './fetchers/bilibili'
import { NeteaseFetcher } from './fetchers/netease'

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
        value: z.string()
      })
    )
  ] as const)
  .bind(async ([{ id, source, value }], { logger }) =>
    Data.load().match({
      Right: (playlist) => {
        const songIndex = playlist.findIndex((song) => song.id === id)

        if (songIndex === -1) {
          logger.warn(`Song with id ${id} not found`)
          return Left({ error: `Song with id ${id} not found` })
        }

        const updatedPlaylist = playlist.map((song) => (song.id === id ? { ...song, type: source, value } : song))

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
        logger.error("Failed to load pla'ylist:", err)
        return Left({ error: `Failed to load playlist: ${stringifyCatchError(err)}` })
      }
    })
  )

export const addSongHandler = Action.empty<AppState>()
  .use([
    new BodyExtracter(
      z.object({
        name: z.string(),
        artists: z.array(z.string()),
        cover: z.string(),
        type: songSourceTypeSchema,
        value: z.string()
      })
    )
  ] as const)
  .bind(async ([{ name, artists, cover, type, value }], { logger }) =>
    Data.load().match({
      Right: (playlist) => {
        const newSong = {
          id: randomUUID(),
          name,
          artists,
          cover,
          type,
          value,
          order: 0
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
  // 1. 加载本地歌单
  const localPlaylistResult = Data.load()
  if (localPlaylistResult.isLeft()) {
    logger.error('Failed to load local playlist:', localPlaylistResult.value)
    return Left({ error: `Failed to load local playlist: ${stringifyCatchError(localPlaylistResult.value)}` })
  }
  const localPlaylist = localPlaylistResult.value

  // 2. 从网易云获取最新歌单
  const neteaseResult = await NeteaseFetcher.request()
  if (neteaseResult.isNothing()) {
    logger.error('Failed to fetch playlist from Netease')
    return Left({ error: 'Failed to fetch playlist from Netease' })
  }
  const neteasePlaylist = neteaseResult.value

  // 3. 预处理：建立本地数据的快速索引
  // id.length >= 36 为自定义歌曲 (UUID)
  const isCustom = (id: string) => id.length >= 36
  const localMap = new Map(localPlaylist.map((s) => [s.id, s]))

  // 4. 更新网易云歌曲数据，但保留本地已修改的映射 (type !== 'netease')
  const updatedNeteaseSongs = neteasePlaylist.map((nSong) => {
    const localVersion = localMap.get(nSong.id)
    // 如果本地存在且用户改过映射（比如改成了本地路径或其它 type），则保留本地版
    if (localVersion && localVersion.type !== 'netease') {
      return localVersion
    }
    return { ...nSong } // 否则使用网易云最新元数据
  })

  const newNeteaseIdSet = new Set(updatedNeteaseSongs.map((s) => s.id))

  // 5. 建立自定义歌曲的“锚点”映射
  // key 是网易云歌曲 ID，value 是紧跟在其后的自定义歌曲列表
  // null 键用于存放排在歌单最开头的自定义歌曲
  const customGroups = new Map<string | null, typeof localPlaylist>()
  let lastSeenNeteaseId: string | null = null

  for (const song of localPlaylist) {
    if (isCustom(song.id)) {
      const group = customGroups.get(lastSeenNeteaseId) || []
      group.push(song)
      customGroups.set(lastSeenNeteaseId, group)
    } else if (newNeteaseIdSet.has(song.id)) {
      // 只有在新歌单中依然存在的网易云歌曲才能作为有效的“锚点”
      lastSeenNeteaseId = song.id
    }
    // 如果网易云歌曲被删了，lastSeenNeteaseId 不更新，
    // 那么原本跟在它后面的自定义歌曲会顺延到上一个有效的锚点
  }

  // 6. 线性合并：以网易云新顺序为骨架进行填充
  const mergedPlaylist: typeof localPlaylist = []

  // A. 首先插入原本就在最开头的自定义歌曲
  if (customGroups.has(null)) {
    mergedPlaylist.push(...(customGroups.get(null) ?? []))
  }

  // B. 遍历网易云新歌单，插入歌曲及其随后的自定义歌曲
  for (const nSong of updatedNeteaseSongs) {
    mergedPlaylist.push(nSong)
    if (customGroups.has(nSong.id)) {
      mergedPlaylist.push(...(customGroups.get(nSong.id) ?? []))
    }
  }

  // C. 兜底逻辑：处理那些因为锚点全部消失而“无家可归”的自定义歌曲
  const placedIds = new Set(mergedPlaylist.map((s) => s.id))
  for (const song of localPlaylist) {
    if (isCustom(song.id) && !placedIds.has(song.id)) {
      mergedPlaylist.push(song)
    }
  }

  // 7. 重新生成标准的 order 间隔
  const finalPlaylist = mergedPlaylist.map((song, index) => ({
    ...song,
    order: index * PLAYLIST_SONG_ORDER_GAP
  }))

  // 8. 保存并返回
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

export const getYoutubeAudioUrlHandler = Action.empty<AppState>()
  .use([new BodyExtracter(z.object({ id: z.string() }))] as const)
  .bind(async ([{ id }], { logger }) => {
    const data = Data.load().map((playlist) => playlist.find((song) => song.id === id))
    if (data.isLeft()) {
      logger.error('Failed to load playlist:', data.value)
      return Left({ error: `Failed to load playlist: ${stringifyCatchError(data.value)}` })
    }
    if (data.value === void 0) {
      logger.warn(`Song with id ${id} not found`)
      return Left({ error: `Song with id ${id} not found` })
    }

    if (data.value.type !== 'youtube' || !data.value.value.trim()) {
      logger.warn(`Song with id ${id} is not a YouTube video`)
      return Left({ error: `Song with id ${id} is not a YouTube video` })
    }

    try {
      logger.info(`Getting YouTube audio URL for song with id ${id} ...`)

      const { stdout, stderr } = await promisify(exec)(
        `yt-dlp${existsSync(Data.COOKIES_DATA_FILE) ? ` --cookies "${Data.COOKIES_DATA_FILE}"` : ''} --js-runtimes ${RUNTIME} --remote-components ejs:github --extractor-args "youtube:player_client=web,web_embedded" -g -f bestaudio "${data.value.value}"`,
        {
          maxBuffer: 10 * 1024 * 1024
        }
      )

      if (stderr) logger.warn('Warning from yt-dlp:', stderr.trim())
      logger.info(`Got YouTube audio URL for song with id ${id}: ${stdout.trim()}`)
      return Right({ url: stdout.trim() })
    } catch (err) {
      logger.error('Failed to get audio URL:', err)
      return Left({ error: `Failed to get audio URL: ${stringifyCatchError(err)}` })
    }
  })

export const getBiliAudioFileHandler = Action.empty<AppState>()
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

    if (data.value.type !== 'bili' || !data.value.value.trim()) {
      logger.warn(`Song with id ${id} is not a Bilibili source`)
      return Left({
        type: 'application/json',
        content: JSON.stringify({ error: `Song with id ${id} is not a Bilibili source` }),
        code: 400
      })
    }

    logger.info(`Getting Bilibili audio for song "${data.value.name}" (id: ${id}, value: "${data.value.value}") ...`)

    const audioFilePathResult = await BiliFetcher.getAudioFilePath(data.value.value)
    if (audioFilePathResult.isNothing()) {
      logger.error(`Failed to get Bilibili audio file for song ${id}`)
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
