import { randomUUID } from 'node:crypto'
import { sleep } from 'bun'
import { songSourceTypeSchema } from 'src/common/types'
import z from 'zod'
import { Action, BodyExtracter } from '@/romi'
import { Left, Right } from '@/romi/utils/adt/either'
import { stringifyCatchError } from '@/romi/utils/common'
import type { AppState } from './common'
import { PLAYLIST_SONG_ORDER_GAP } from './constant'
import { Data } from './data'
import { NeteaseFetcher } from './fetcher'

export const getPlaylistHandler = Action.empty<AppState>().bind(async (_data, { logger }) =>
  Data.load().match({
    Right: (playlist) => Right({ playlist }),
    Left: (err) => {
      logger.error(err)
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
  .bind(async ([data], { logger }) => {
    const { id, source, value } = data

    return Data.load().match({
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
          logger.error(`Failed to save playlist: ${stringifyCatchError(err)}`)
          return Left({ error: `Failed to save playlist: ${stringifyCatchError(err)}` })
        }
      },
      Left: (err) => {
        logger.error(`Failed to load playlist: ${stringifyCatchError(err)}`)
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
        value: z.string()
      })
    )
  ] as const)
  .bind(async ([data], { logger }) => {
    const { name, artists, cover, type, value } = data

    return Data.load().match({
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
          logger.error(`Failed to save playlist: ${stringifyCatchError(err)}`)
          return Left({ error: `Failed to save playlist: ${stringifyCatchError(err)}` })
        }
      },
      Left: (err) => {
        logger.error(`Failed to load playlist: ${stringifyCatchError(err)}`)
        return Left({ error: `Failed to load playlist: ${stringifyCatchError(err)}` })
      }
    })
  })

export const setSongOrderHandler = Action.empty<AppState>()
  .use([
    new BodyExtracter(
      z.object({
        id: z.string(),
        order: z.number()
      })
    )
  ] as const)
  .bind(async ([data], { logger }) => {
    const { id, order } = data

    return Data.load().match({
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
          logger.error(`Failed to save playlist: ${stringifyCatchError(err)}`)
          return Left({ error: `Failed to save playlist: ${stringifyCatchError(err)}` })
        }
      },
      Left: (err) => {
        logger.error(`Failed to load playlist: ${stringifyCatchError(err)}`)
        return Left({ error: `Failed to load playlist: ${stringifyCatchError(err)}` })
      }
    })
  })

export const syncHandler = Action.empty<AppState>().bind(async (_data, { logger }) => {
  try {
    // 1. 加载本地歌单
    const localPlaylistResult = Data.load()

    if (localPlaylistResult.isLeft()) {
      logger.error(`Failed to load local playlist: ${stringifyCatchError(localPlaylistResult.value)}`)
      return Left({ error: `Failed to load local playlist: ${stringifyCatchError(localPlaylistResult.value)}` })
    }

    const localPlaylist = localPlaylistResult.value
    logger.info(`Loaded local playlist with ${localPlaylist.length} songs`)

    // 2. 从网易云获取最新歌单
    const neteaseResult = await NeteaseFetcher.request()

    if (neteaseResult.isNothing()) {
      logger.error('Failed to fetch playlist from Netease')
      return Left({ error: 'Failed to fetch playlist from Netease' })
    }

    const neteasePlaylist = neteaseResult.unwrap()
    logger.info(`Fetched ${neteasePlaylist.length} songs from Netease`)

    // 3. 分离本地歌单中的自定义歌曲和网易云歌曲
    const customSongs = localPlaylist.filter((song) => song.type !== 'netease')
    const localNeteaseSongs = localPlaylist.filter((song) => song.type === 'netease')

    logger.info(`Found ${customSongs.length} custom songs, ${localNeteaseSongs.length} Netease songs in local playlist`)

    // 4. 创建网易云歌曲的ID映射
    const neteaseSongMap = new Map(neteasePlaylist.map((song) => [song.id, song]))
    const localNeteaseSongMap = new Map(localNeteaseSongs.map((song) => [song.id, song]))

    // 5. 合并逻辑：
    // a. 保留所有自定义歌曲（保持原有order）
    // b. 对于网易云歌曲：
    //    - 如果本地有修改过的映射（type不是netease），保留本地版本
    //    - 否则使用网易云的最新数据
    //    - 如果网易云已删除该歌曲，则从合并结果中移除

    // 首先收集所有需要保留的歌曲
    const songsToKeep = new Map<string, (typeof localPlaylist)[0]>()

    // 添加自定义歌曲
    customSongs.forEach((song) => {
      songsToKeep.set(song.id, song)
    })

    // 处理网易云歌曲
    neteasePlaylist.forEach((neteaseSong) => {
      const localSong = localNeteaseSongMap.get(neteaseSong.id)

      if (localSong) {
        // 如果本地有这首歌，检查是否有自定义映射
        if (localSong.type !== 'netease') {
          // 保留本地修改过的版本
          songsToKeep.set(localSong.id, localSong)
        } else {
          // 使用网易云的最新数据，但保持原有的order（如果存在）
          const order = localSong.order
          songsToKeep.set(neteaseSong.id, { ...neteaseSong, order })
        }
      } else {
        // 网易云新增的歌曲
        songsToKeep.set(neteaseSong.id, neteaseSong)
      }
    })

    // 6. 转换为数组并按order排序
    const mergedSongs = Array.from(songsToKeep.values()).sort((a, b) => a.order - b.order)

    // 7. 重新分配order值，确保满足gap要求
    const reorderedPlaylist = mergedSongs.map((song, index) => ({
      ...song,
      order: index * PLAYLIST_SONG_ORDER_GAP
    }))

    // 8. 保存合并后的歌单
    try {
      Data.save(reorderedPlaylist)

      const addedCount = reorderedPlaylist.length - localPlaylist.length
      const removedCount = localPlaylist.length - reorderedPlaylist.length

      logger.info(
        `Sync completed: ${reorderedPlaylist.length} total songs ` +
          `(${addedCount > 0 ? `+${addedCount} added` : ''}${removedCount > 0 ? `-${removedCount} removed` : ''})`
      )

      return Right({ playlist: reorderedPlaylist })
    } catch (err) {
      logger.error(`Failed to save synced playlist: ${stringifyCatchError(err)}`)
      return Left({ error: `Failed to save synced playlist: ${stringifyCatchError(err)}` })
    }
  } catch (err) {
    logger.error(`Sync failed: ${stringifyCatchError(err)}`)
    return Left({ error: `Sync failed: ${stringifyCatchError(err)}` })
  }
})
