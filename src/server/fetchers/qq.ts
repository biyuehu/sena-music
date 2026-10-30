import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { z } from 'zod'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import type { Playlist } from '../../common/types'
import { pruneCache } from '../cache'
import { CONFIG, logger } from '../common'
import { PLAYLIST_SONG_ORDER_GAP } from '../constant'
import { Data } from '../data'

export interface QQSongDetail {
  id: string
  mid: string
  name: string
  artists: string[]
  cover: string
}

const qqPlaylistSchema = z.object({
  code: z.number(),
  cdlist: z
    .array(
      z.object({
        disstid: z.string().optional(),
        dissname: z.string().optional(),
        songlist: z
          .array(
            z.object({
              songid: z.number().optional(),
              songmid: z.string(),
              songname: z.string(),
              singer: z
                .array(z.object({ name: z.string() }))
                .optional()
                .default([]),
              albummid: z.string().optional().default('')
            })
          )
          .optional()
          .default([])
      })
    )
    .optional()
    .default([])
})

const qqSingleSongSchema = z.object({
  code: z.number(),
  data: z
    .array(
      z.object({
        id: z.number(),
        mid: z.string(),
        name: z.string(),
        singer: z
          .array(z.object({ name: z.string() }))
          .optional()
          .default([]),
        album: z
          .object({
            mid: z.string().optional().default('')
          })
          .optional()
          .default({ mid: '' })
      })
    )
    .optional()
    .default([])
})

const qqVkeyResponseSchema = z.object({
  code: z.number(),
  req_0: z.object({
    code: z.number(),
    data: z.object({
      sip: z.array(z.string()).optional().default([]),
      midurlinfo: z
        .array(
          z.object({
            songmid: z.string(),
            purl: z.string().optional().default('')
          })
        )
        .optional()
        .default([])
    })
  })
})

export namespace QQFetcher {
  const COMMON_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Referer: 'https://y.qq.com/'
  }

  export function parseInput(rawInput: string): { songmid?: string; songid?: number } {
    const input = rawInput.trim()

    // 匹配 URL 中的 songDetail/002TTnfc13TkgO 或 songDetail/728722164
    const detailMatch = input.match(/songDetail\/([0-9a-zA-Z]+)/i)
    if (detailMatch?.[1]) {
      const val = detailMatch[1]
      if (/^\d+$/.test(val)) return { songid: parseInt(val, 10) }
      return { songmid: val }
    }

    // 匹配 songmid 参数
    const midMatch = input.match(/[?&]songmid=([0-9a-zA-Z]+)/i)
    if (midMatch?.[1]) return { songmid: midMatch[1] }

    // 匹配 songid 参数
    const idMatch = input.match(/[?&]songid=(\d+)/i)
    if (idMatch?.[1]) return { songid: parseInt(idMatch[1], 10) }

    // 纯数字 ID
    if (/^\d+$/.test(input)) return { songid: parseInt(input, 10) }

    // 纯字母数字 mid (通常 14 位，如 002TTnfc13TkgO)
    if (/^[0-9a-zA-Z]{14}$/.test(input)) return { songmid: input }

    // 兜底提取连续 14 位字符
    const midSub = input.match(/([0-9a-zA-Z]{14})/)
    if (midSub?.[1]) return { songmid: midSub[1] }

    return {}
  }

  /**
   * 获取单曲详细信息
   */
  export async function getSongDetail(rawInput: string): Promise<Maybe<QQSongDetail>> {
    const { songmid, songid } = parseInput(rawInput)
    if (!songmid && !songid) {
      logger.error(`Unable to parse QQ Music song mid or id from input: "${rawInput}"`)
      return Nothing()
    }

    const query = songmid ? `songmid=${songmid}` : `songid=${songid}`
    try {
      const res = await fetch(`https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?${query}&format=json`, {
        headers: COMMON_HEADERS
      })

      if (!res.ok) {
        logger.error(`QQ Music single song API returned HTTP ${res.status}: ${res.statusText}`)
        return Nothing()
      }

      const json = qqSingleSongSchema.parse(await res.json())
      const song = json.data[0]
      if (!song) {
        logger.warn(`No song data found for input: "${rawInput}"`)
        return Nothing()
      }

      return Just({
        id: String(song.id),
        mid: song.mid,
        name: song.name,
        artists: song.singer.map((s) => s.name),
        cover: song.album.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${song.album.mid}.jpg` : ''
      })
    } catch (err) {
      logger.error('Failed to fetch QQ Music song detail:', err)
      return Nothing()
    }
  }

  /**
   * 获取 QQ 音乐真实可播放的直链 (vkey purl)
   */
  export async function getPlayUrl(rawInput: string): Promise<Maybe<string>> {
    let { songmid, songid } = parseInput(rawInput)

    if (!songmid && songid) {
      const detail = await getSongDetail(String(songid))
      if (detail.isJust()) {
        songmid = detail.value.mid
      }
    }

    if (!songmid) {
      logger.error(`Unable to resolve songmid for QQ Music input: "${rawInput}"`)
      return Nothing()
    }

    const body = {
      comm: { uin: '0', format: 'json', ct: 24, cv: 0 },
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid: '10000',
          songmid: [songmid],
          songtype: [0],
          uin: '0',
          loginflag: 1,
          platform: '20'
        }
      }
    }

    try {
      const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        headers: COMMON_HEADERS,
        body: JSON.stringify(body)
      })

      if (!res.ok) {
        logger.error(`QQ Music musicu API returned HTTP ${res.status}: ${res.statusText}`)
        return Nothing()
      }

      const json = qqVkeyResponseSchema.parse(await res.json())
      const midInfo = json.req_0.data.midurlinfo[0]
      if (!midInfo?.purl) {
        logger.warn(`No available play url for QQ Music song "${songmid}" (VIP or copyright restricted)`)
        return Nothing()
      }

      const sip = json.req_0.data.sip[0] || 'http://aqqmusic.tc.qq.com/'
      const playUrl = `${sip}${midInfo.purl}`
      return Just(playUrl)
    } catch (err) {
      logger.error('Failed to get QQ Music play url:', err)
      return Nothing()
    }
  }

  function cacheFilePath(songmid: string): string {
    return join(Data.CACHE_DIRECTORY, `qq+${songmid}.mp3`)
  }

  function transcodeToMp3(directUrl: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      fetch(directUrl, { headers: COMMON_HEADERS })
        .then((upstream) => {
          if (!upstream.ok || !upstream.body) {
            logger.error(`Failed to fetch QQ Music audio stream for transcoding: HTTP ${upstream.status}`)
            resolve(false)
            return
          }

          const ffmpeg = spawn('ffmpeg', [
            '-y',
            '-i',
            'pipe:0',
            '-f',
            'mp3',
            '-acodec',
            'libmp3lame',
            '-ab',
            '192k',
            outputPath
          ])
          const inputStream = Readable.fromWeb(upstream.body as unknown as NodeReadableStream<Uint8Array>)

          ffmpeg.stdin.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EPIPE' || err.code === 'ECONNRESET') inputStream.destroy()
          })
          inputStream.pipe(ffmpeg.stdin)

          ffmpeg.on('close', (code) => resolve(code === 0))
          ffmpeg.on('error', (err) => {
            logger.error('Failed to spawn ffmpeg for QQ Music:', err)
            resolve(false)
          })
        })
        .catch((err) => {
          logger.error('Failed to fetch QQ Music audio stream for transcoding:', err)
          resolve(false)
        })
    })
  }

  /**
   * 获取 QQ 音乐音频本地缓存文件路径
   */
  export async function getAudioFilePath(rawInput: string): Promise<Maybe<string>> {
    let { songmid, songid } = parseInput(rawInput)
    if (!songmid && songid) {
      const detail = await getSongDetail(String(songid))
      if (detail.isJust()) {
        songmid = detail.value.mid
      }
    }

    if (!songmid) {
      logger.error(`Unable to parse QQ Music song mid or id from input: "${rawInput}"`)
      return Nothing()
    }

    const filePath = cacheFilePath(songmid)
    const lockPath = `${filePath}.lock`

    if (existsSync(filePath) && !existsSync(lockPath)) {
      logger.info(`Using cached QQ Music audio file for ${songmid}`)
      return Just(filePath)
    }

    if (existsSync(lockPath)) {
      logger.info(`Waiting for ongoing transcode of QQ Music ${songmid} ...`)
      const waited = await new Promise<boolean>((resolve) => {
        const startedAt = Date.now()
        const timer = setInterval(() => {
          if (!existsSync(lockPath)) {
            clearInterval(timer)
            resolve(true)
          } else if (Date.now() - startedAt > 30_000) {
            clearInterval(timer)
            resolve(false)
          }
        }, 500)
      })
      if (!waited) {
        logger.error(`Timed out waiting for transcode of QQ Music ${songmid}`)
        return Nothing()
      }
      if (existsSync(filePath)) return Just(filePath)
      return Nothing()
    }

    const playUrlResult = await getPlayUrl(songmid)
    if (playUrlResult.isNothing()) return Nothing()

    if (!existsSync(Data.CACHE_DIRECTORY)) mkdirSync(Data.CACHE_DIRECTORY, { recursive: true })

    writeFileSync(lockPath, '1')

    try {
      logger.info(`Downloading and transcoding QQ Music audio for ${songmid} ...`)
      const success = await transcodeToMp3(playUrlResult.value, filePath)
      if (!success) {
        logger.error(`Failed to download and transcode QQ Music audio for ${songmid}`)
        return Nothing()
      }

      logger.info(`Cached QQ Music audio for ${songmid} at ${filePath}`)
      setTimeout(() => pruneCache(CONFIG.cacheMaxSize * 1024 * 1024), 0)
      return Just(filePath)
    } finally {
      if (existsSync(lockPath)) unlinkSync(lockPath)
    }
  }

  /**
   * 模仿 NeteaseFetcher.request，拉取 QQ 音乐歌单的所有歌曲
   */
  export async function request(playlistId: number | string): Promise<Maybe<Playlist>> {
    const dissId = String(playlistId).trim()
    if (!dissId) {
      logger.error('No playlist ID provided for QQ Music')
      return Nothing()
    }

    try {
      const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${dissId}&format=json&g_tk=5381`
      const res = await fetch(url, {
        headers: COMMON_HEADERS
      })

      if (!res.ok) {
        logger.error(`QQ Music playlist API returned HTTP ${res.status}: ${res.statusText}`)
        return Nothing()
      }

      const json = qqPlaylistSchema.parse(await res.json())
      const cd = json.cdlist[0]
      if (!cd?.songlist || cd.songlist.length === 0) {
        logger.warn(`No tracks found in QQ Music playlist ${dissId}`)
        return Just([])
      }

      logger.record(`Total tracks in QQ Music playlist ${dissId}: ${cd.songlist.length}`)

      const playlist: Playlist = cd.songlist.map((song, index) => ({
        id: song.songmid || String(song.songid),
        name: song.songname,
        artists: song.singer.map((s) => s.name),
        cover: song.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${song.albummid}.jpg` : '',
        type: 'qq' as const,
        value: song.songmid || String(song.songid),
        order: index * PLAYLIST_SONG_ORDER_GAP
      }))

      return Just(playlist)
    } catch (err) {
      logger.error('Failed to fetch QQ Music playlist songs:', err)
      return Nothing()
    }
  }
}
