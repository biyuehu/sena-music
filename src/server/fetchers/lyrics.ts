import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import type { LyricResult, SongInfo } from '../../common/types'
import { logger } from '../common'
import { Data } from '../data'

const neteaseLyricSchema = z.object({
  nolyric: z.boolean().optional(),
  uncollected: z.boolean().optional(),
  pureMusic: z.boolean().optional(),
  lrc: z.object({ lyric: z.string().optional() }).optional(),
  tlyric: z.object({ lyric: z.string().optional() }).optional(),
  romalrc: z.object({ lyric: z.string().optional() }).optional()
})

const qqLyricSchema = z.object({
  code: z.number().optional(),
  retcode: z.number().optional(),
  lyric: z.string().optional().default(''),
  trans: z.string().optional().default('')
})

export namespace LyricFetcher {
  const NETEASE_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Referer: 'https://music.163.com'
  }

  const QQ_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Referer: 'https://y.qq.com/'
  }

  function cacheFilePath(songId: string): string {
    return join(Data.CACHE_DIRECTORY, `lyric+${songId}.json`)
  }

  /**
   * 从网易云接口拉取三轨歌词（原文、翻译、罗马音）
   */
  export async function fetchNeteaseLyric(songId: string | number): Promise<Maybe<LyricResult>> {
    const id = String(songId).trim()
    if (!id || !/^\d+$/.test(id)) return Nothing()

    try {
      const url = `https://music.163.com/api/song/lyric?id=${id}&lv=-1&kv=-1&tv=-1&rv=-1`
      const res = await fetch(url, { headers: NETEASE_HEADERS })
      if (!res.ok) {
        logger.error(`NetEase lyric API returned HTTP ${res.status}`)
        return Nothing()
      }

      const json = neteaseLyricSchema.parse(await res.json())

      // 纯音乐判断
      if (json.nolyric || json.pureMusic) {
        return Just({ status: 'pure_music' })
      }

      const original = (json.lrc?.lyric ?? '').trim()
      if (!original || json.uncollected) {
        return Just({ status: 'no_lyric' })
      }

      if (/纯音乐，请欣赏|纯音乐/i.test(original)) {
        return Just({ status: 'pure_music' })
      }

      const translation = (json.tlyric?.lyric ?? '').trim()
      const romaji = (json.romalrc?.lyric ?? '').trim()

      return Just({
        status: 'ok',
        original,
        translation: translation || void 0,
        romaji: romaji || void 0
      })
    } catch (err) {
      logger.error('Failed to fetch NetEase lyric:', err)
      return Nothing()
    }
  }

  /**
   * 从 QQ 音乐接口拉取歌词与翻译
   */
  export async function fetchQQLyric(rawInput: string): Promise<Maybe<LyricResult>> {
    const input = rawInput.trim()
    // 匹配 14 位 mid，或直接使用
    const midMatch = input.match(/[0-9a-zA-Z]{14}/)
    const songmid = midMatch ? midMatch[0] : input
    if (!songmid) return Nothing()

    try {
      const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=1`
      const res = await fetch(url, { headers: QQ_HEADERS })
      if (!res.ok) {
        logger.error(`QQ Music lyric API returned HTTP ${res.status}`)
        return Nothing()
      }

      const json = qqLyricSchema.parse(await res.json())
      let original = (json.lyric ?? '').trim()
      let translation = (json.trans ?? '').trim()

      // 如果返回是 base64
      if (original && !original.includes('[')) {
        try {
          original = Buffer.from(original, 'base64').toString('utf-8').trim()
        } catch {
          // ignore
        }
      }
      if (translation && !translation.includes('[')) {
        try {
          translation = Buffer.from(translation, 'base64').toString('utf-8').trim()
        } catch {
          // ignore
        }
      }

      if (!original) {
        return Just({ status: 'no_lyric' })
      }

      if (/纯音乐/i.test(original)) {
        return Just({ status: 'pure_music' })
      }

      return Just({
        status: 'ok',
        original,
        translation: translation || void 0
      })
    } catch (err) {
      logger.error('Failed to fetch QQ Music lyric:', err)
      return Nothing()
    }
  }

  /**
   * 尝试从网易云按歌曲名称与歌手搜索最佳匹配的歌曲 ID
   */
  export async function searchNeteaseSongId(name: string, artists: string[]): Promise<Maybe<number>> {
    const keyword = `${name} ${artists.join(' ')}`.trim()
    if (!keyword) return Nothing()

    try {
      const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&limit=1`
      const res = await fetch(url, { headers: NETEASE_HEADERS })
      if (!res.ok) return Nothing()

      const json = (await res.json()) as { result?: { songs?: Array<{ id: number; name: string }> } }
      const matched = json.result?.songs?.[0]
      if (matched?.id) return Just(matched.id)
      return Nothing()
    } catch (err) {
      logger.warn('Failed to search song ID from NetEase:', err)
      return Nothing()
    }
  }

  /**
   * 探测本地 LRC 文件
   */
  export function fetchLocalLyric(filePath: string): Maybe<LyricResult> {
    const candidatePaths = [filePath.replace(/\.[^/.]+$/, '.lrc'), filePath]
    for (const p of candidatePaths) {
      if (p.endsWith('.lrc') && existsSync(p)) {
        try {
          const original = readFileSync(p, 'utf-8').trim()
          if (!original) return Just({ status: 'no_lyric' })
          return Just({ status: 'ok', original })
        } catch {
          // ignore
        }
      }
    }
    return Nothing()
  }

  /**
   * 综合调度获取某首歌曲的歌词
   */
  export async function getLyric(song: SongInfo): Promise<LyricResult> {
    const config = song.lyricConfig
    const offset = config?.offset ?? 0

    // 1. 若显式指定无歌词
    if (config?.type === 'none') {
      return { status: 'no_lyric', offset }
    }

    // 2. 若显式指定自定义歌词
    if (config?.type === 'custom') {
      const custom = Data.loadCustomLyric(song.id)
      if (custom.isJust()) {
        const { original, translation, romaji } = custom.value
        if (!original?.trim()) return { status: 'no_lyric', offset }
        return {
          status: 'ok',
          original: original.trim(),
          translation: translation?.trim() || void 0,
          romaji: romaji?.trim() || void 0,
          offset
        }
      }
      return { status: 'no_lyric', offset }
    }

    // 3. 检查本地缓存（非 custom 模式下生效）
    const cacheFile = cacheFilePath(song.id)
    if (existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(readFileSync(cacheFile, 'utf-8')) as LyricResult
        return { ...cached, offset: config?.offset ?? cached.offset ?? 0 }
      } catch {
        // ignore broken cache
      }
    }

    let result: Maybe<LyricResult> = Nothing()

    // 4. 根据明确指定的歌词类型拉取
    if (config?.type === 'netease' && config.value?.trim()) {
      result = await fetchNeteaseLyric(config.value.trim())
    } else if (config?.type === 'qq' && config.value?.trim()) {
      result = await fetchQQLyric(config.value.trim())
    } else if (config?.type === 'local' && config.value?.trim()) {
      result = fetchLocalLyric(config.value.trim())
    }

    // 5. 若未命中或处于 auto 模式
    if (result.isNothing()) {
      // 原则是：只要不是用户自己新增的歌曲（比如网易云歌单原本有的，id < 36，或 type === 'netease'），默认直接走网易云
      const isOriginalNeteaseSong = song.id.length < 36 || song.type === 'netease'
      const neteaseId = song.type === 'netease' ? song.value || song.id : song.id

      if (isOriginalNeteaseSong && /^\d+$/.test(neteaseId)) {
        logger.info(`Fetching default NetEase lyrics for song ${song.name} (${neteaseId}) ...`)
        result = await fetchNeteaseLyric(neteaseId)
      } else if (song.type === 'qq') {
        const qqMid = song.value || song.id
        logger.info(`Fetching default QQ Music lyrics for song ${song.name} (${qqMid}) ...`)
        result = await fetchQQLyric(qqMid)
      } else if (song.type === 'local' && song.value) {
        result = fetchLocalLyric(song.value)
      }

      // 如果依然没找到，尝试按歌曲名与歌手进行网易云匹配兜底
      if (result.isNothing() || result.value.status === 'no_lyric') {
        const searchedId = await searchNeteaseSongId(song.name, song.artists)
        if (searchedId.isJust()) {
          logger.info(`Matched NetEase song ID ${searchedId.value} for "${song.name}" by "${song.artists.join(', ')}"`)
          result = await fetchNeteaseLyric(searchedId.value)
        }
      }
    }

    const finalResult: LyricResult = result.unwrapOrElse(() => ({ status: 'no_lyric' as const }))
    finalResult.offset = offset

    // 写入本地缓存
    if (finalResult.status === 'ok' || finalResult.status === 'pure_music') {
      try {
        if (!existsSync(Data.CACHE_DIRECTORY)) mkdirSync(Data.CACHE_DIRECTORY, { recursive: true })
        writeFileSync(cacheFile, JSON.stringify(finalResult, null, 2), 'utf-8')
      } catch (e) {
        logger.warn('Failed to write lyric cache:', e)
      }
    }

    return finalResult
  }
}
