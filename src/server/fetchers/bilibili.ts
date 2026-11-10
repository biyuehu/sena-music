import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import type { BiliSearchResultItem } from '../../common/types'
import { pruneCache } from '../cache'
import { CONFIG, logger } from '../common'
import { Data } from '../data'

export type BiliSearchResult = BiliSearchResultItem

export interface BiliVideoInfo {
  bvid: string
  aid: number
  cid: number
  title: string
  cover: string
  artist: string
  duration: number
  partName: string
  page: number
}

export namespace BiliFetcher {
  const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  const BILIBILI_REFERER = 'https://www.bilibili.com/'
  const COMMON_HEADERS = {
    'User-Agent': DEFAULT_USER_AGENT,
    Referer: BILIBILI_REFERER,
    Origin: 'https://www.bilibili.com',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive'
  }

  const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38,
    41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
    20, 34, 44, 52
  ]

  const WBI_KEY_CACHE_MS = 10 * 60 * 1000
  let wbiCache: { key: string; expireAt: number } | null = null

  function getMixinKey(orig: string): string {
    return MIXIN_KEY_ENC_TAB.map((i) => orig.charAt(i))
      .join('')
      .slice(0, 32)
  }

  function getCookieHeader(): string {
    try {
      if (!existsSync(Data.COOKIES_DATA_FILE)) return ''
      const cookies = readFileSync(Data.COOKIES_DATA_FILE, 'utf-8')
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'))
        .map((line) => line.split('\t'))
        .filter((parts) => parts.length >= 7)
        .map((parts) => `${parts[5].trim()}=${parts[6].trim()}`)
        .join('; ')
      return cookies
    } catch (e) {
      logger.warn('Failed to read cookies file for Bilibili:', e)
      return ''
    }
  }

  async function getWbiMixinKey(cookie: string): Promise<string> {
    if (wbiCache && wbiCache.expireAt > Date.now()) return wbiCache.key
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: { ...COMMON_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }
    })
    const text = await res.text()
    let json: { data?: { wbi_img?: { img_url: string; sub_url: string } } }
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`nav API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
    }
    const wbiImg = json.data?.wbi_img
    if (!wbiImg) throw new Error(`Unable to get wbi_img from nav API: ${JSON.stringify(json)}`)

    const imgKey = wbiImg.img_url.split('/').pop()?.split('.')[0] ?? ''
    const subKey = wbiImg.sub_url.split('/').pop()?.split('.')[0] ?? ''
    const key = getMixinKey(imgKey + subKey)
    wbiCache = { key, expireAt: Date.now() + WBI_KEY_CACHE_MS }
    return key
  }

  function encWbi(params: Record<string, string | number>, mixinKey: string): Record<string, string> {
    const withTime: Record<string, string | number> = { ...params, wts: Math.round(Date.now() / 1000) }
    const query = Object.keys(withTime)
      .sort()
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(withTime[key]).replace(/[!'()*]/g, ''))}`)
      .join('&')
    const wRid = createHash('md5')
      .update(query + mixinKey)
      .digest('hex')
    return { ...Object.fromEntries(Object.entries(withTime).map(([k, v]) => [k, String(v)])), w_rid: wRid }
  }

  export async function parseInput(rawInput: string): Promise<{ bvid?: string; aid?: number; page: number }> {
    const input = rawInput.trim()
    let targetStr = input
    let page = 1

    if (/b23\.tv/i.test(input)) {
      try {
        const res = await fetch(/^https?:\/\//i.test(input) ? input : `https://${input}`, {
          method: 'GET',
          redirect: 'follow',
          headers: COMMON_HEADERS
        })
        targetStr = res.url || input
      } catch (e) {
        logger.warn('Failed to resolve b23.tv short link:', e)
      }
    }

    const pMatch = targetStr.match(/(?:[?&]p=|[?&]page=|[:/ ]p)(\d+)/i)
    if (pMatch?.[1]) page = Math.max(1, parseInt(pMatch[1], 10))

    const bvMatch = targetStr.match(/(BV[0-9a-zA-Z]{10})/i)
    if (bvMatch?.[1]) return { bvid: bvMatch[1], page }

    const avMatch = targetStr.match(/(?:av|aid=)(\d+)/i)
    if (avMatch?.[1]) return { aid: parseInt(avMatch[1], 10), page }

    if (/^\d+$/.test(targetStr)) return { aid: parseInt(targetStr, 10), page }

    return { page }
  }

  export async function getVideoInfo(rawInput: string): Promise<Maybe<BiliVideoInfo>> {
    const { bvid, aid, page } = await parseInput(rawInput)
    if (!bvid && !aid) {
      logger.error(`Unable to parse BV or AV ID from input: "${rawInput}"`)
      return Nothing()
    }

    const query = bvid ? `bvid=${bvid}` : `aid=${aid}`
    const cookie = getCookieHeader()

    try {
      const res = await fetch(`https://api.bilibili.com/x/web-interface/view?${query}`, {
        headers: { ...COMMON_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }
      })

      if (!res.ok) {
        logger.error(`Bilibili view API returned HTTP ${res.status}: ${res.statusText}`)
        return Nothing()
      }

      const text = await res.text()
      let json: {
        code: number
        message?: string
        data?: {
          bvid: string
          aid: number
          cid: number
          title: string
          pic: string
          duration: number
          owner?: { name: string }
          pages?: Array<{ cid: number; page: number; part: string; duration: number }>
        }
      }
      try {
        json = JSON.parse(text)
      } catch {
        logger.error(`Bilibili view API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
        return Nothing()
      }

      if (json.code !== 0 || !json.data) {
        logger.error(`Bilibili view API error: [code ${json.code}] ${json.message || 'Unknown error'}`)
        return Nothing()
      }

      const data = json.data
      const pages = data.pages || []
      const targetPage = pages.find((p) => p.page === page) ??
        pages[0] ?? { cid: data.cid, page: 1, part: data.title, duration: data.duration }

      return Just({
        bvid: data.bvid,
        aid: data.aid,
        cid: targetPage.cid,
        title: data.title,
        cover: data.pic,
        artist: data.owner?.name || 'Bilibili',
        duration: targetPage.duration || data.duration,
        partName: targetPage.part || data.title,
        page: targetPage.page || 1
      })
    } catch (err) {
      logger.error('Failed to fetch Bilibili video info:', err)
      return Nothing()
    }
  }

  async function fetchAudioDirectUrl(info: BiliVideoInfo): Promise<Maybe<string>> {
    const cookie = getCookieHeader()

    try {
      const mixinKey = await getWbiMixinKey(cookie)
      const signed = encWbi({ bvid: info.bvid, cid: info.cid, fnval: 16, fnver: 0, fourk: 1 }, mixinKey)
      const playUrl = `https://api.bilibili.com/x/player/wbi/playurl?${new URLSearchParams(signed).toString()}`

      logger.info(`Fetching Bilibili playurl (WBI signed): bvid=${info.bvid} cid=${info.cid}`)

      const res = await fetch(playUrl, {
        headers: { ...COMMON_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }
      })

      if (!res.ok) {
        logger.error(`Bilibili playurl API returned HTTP ${res.status}: ${res.statusText}`)
        return Nothing()
      }

      const text = await res.text()
      let json: {
        code: number
        message?: string
        data?: {
          dash?: { audio?: Array<{ id: number; baseUrl?: string; base_url?: string; bandwidth?: number }> }
          durl?: Array<{ url: string }>
        }
      }
      try {
        json = JSON.parse(text)
      } catch {
        logger.error(`Bilibili playurl API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
        return Nothing()
      }

      if (json.code !== 0 || !json.data) {
        logger.error(`Bilibili playurl API error: [code ${json.code}] ${json.message || 'Unknown error'}`)
        return Nothing()
      }

      if (json.data.dash?.audio && json.data.dash.audio.length > 0) {
        const best = [...json.data.dash.audio].sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0))[0]
        const url = best.baseUrl || best.base_url
        if (url) return Just(url)
      }

      if (json.data.durl && json.data.durl.length > 0) return Just(json.data.durl[0].url)

      logger.error('No audio stream found in Bilibili playurl response')
      return Nothing()
    } catch (err) {
      logger.error('Failed to fetch Bilibili playurl:', err)
      return Nothing()
    }
  }

  function cacheFilePath(bvid: string): string {
    return join(Data.CACHE_DIRECTORY, `bili+${bvid}.mp3`)
  }

  function transcodeToMp3(directUrl: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      fetch(directUrl, { headers: COMMON_HEADERS })
        .then((upstream) => {
          if (!upstream.ok || !upstream.body) {
            logger.error(`Failed to fetch Bilibili audio stream for transcoding: HTTP ${upstream.status}`)
            resolve(false)
            return
          }

          const ffmpeg = spawn('ffmpeg', [
            '-y',
            '-f',
            'mov',
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
            logger.error('Failed to spawn ffmpeg:', err)
            resolve(false)
          })
        })
        .catch((err) => {
          logger.error('Failed to fetch Bilibili audio stream for transcoding:', err)
          resolve(false)
        })
    })
  }

  export async function getAudioFilePath(rawInput: string): Promise<Maybe<string>> {
    const infoResult = await getVideoInfo(rawInput)
    if (infoResult.isNothing()) return Nothing()

    const info = infoResult.value
    const filePath = cacheFilePath(info.bvid)
    const lockPath = `${filePath}.lock`

    if (existsSync(filePath) && !existsSync(lockPath)) {
      logger.info(`Using cached Bilibili audio file for ${info.bvid}`)
      return Just(filePath)
    }

    if (existsSync(lockPath)) {
      logger.info(`Waiting for ongoing transcode of ${info.bvid} ...`)
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
        logger.error(`Timed out waiting for transcode of ${info.bvid}`)
        return Nothing()
      }
      if (existsSync(filePath)) return Just(filePath)
      return Nothing()
    }

    const directUrlResult = await fetchAudioDirectUrl(info)
    if (directUrlResult.isNothing()) return Nothing()

    if (!existsSync(Data.CACHE_DIRECTORY)) mkdirSync(Data.CACHE_DIRECTORY, { recursive: true })

    writeFileSync(lockPath, '1')

    try {
      logger.info(`Downloading and transcoding Bilibili audio for ${info.bvid} ...`)
      const success = await transcodeToMp3(directUrlResult.value, filePath)
      if (!success) {
        logger.error(`Failed to download and transcode Bilibili audio for ${info.bvid}`)
        return Nothing()
      }

      logger.info(`Cached Bilibili audio for ${info.bvid} at ${filePath}`)
      setTimeout(() => pruneCache(CONFIG.cacheMaxSize * 1024 * 1024), 0)
      return Just(filePath)
    } finally {
      if (existsSync(lockPath)) unlinkSync(lockPath)
    }
  }

  export function parseDurationStr(duration: string | number | undefined): number {
    if (typeof duration === 'number') return duration
    if (!duration) return 0
    const parts = duration.split(':').map((p) => parseInt(p, 10))
    if (parts.some((p) => Number.isNaN(p))) return 0
    if (parts.length === 2) {
      return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
    }
    if (parts.length === 3) {
      return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
    }
    return parseInt(duration, 10) || 0
  }

  export function formatDurationSeconds(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds))
    const m = Math.floor(s / 60)
    const remainingS = s % 60
    if (m >= 60) {
      const h = Math.floor(m / 60)
      const remainingM = m % 60
      return `${h}:${remainingM.toString().padStart(2, '0')}:${remainingS.toString().padStart(2, '0')}`
    }
    return `${m.toString().padStart(2, '0')}:${remainingS.toString().padStart(2, '0')}`
  }

  export function scoreCandidate(
    candidate: BiliSearchResult,
    songName: string,
    artists: string[],
    targetDuration?: number
  ): number {
    let score = 0
    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_—·.,!?'"()（）[\]【】]/g, '')
    const candTitleNorm = norm(candidate.title)
    const candAuthorNorm = norm(candidate.author)
    const songNameNorm = norm(songName)

    if (candTitleNorm.includes(songNameNorm)) {
      score += 40
      if (candTitleNorm === songNameNorm) {
        score += 15
      }
    } else {
      const words = songName.toLowerCase().split(/\s+/).filter(Boolean)
      if (words.length > 1) {
        const matchedWords = words.filter((w) => candidate.title.toLowerCase().includes(w))
        score += Math.round((matchedWords.length / words.length) * 30)
      }
    }

    for (const artist of artists) {
      const artistNorm = norm(artist)
      if (!artistNorm) continue
      if (candAuthorNorm.includes(artistNorm)) {
        score += 30
        break
      }
      if (candTitleNorm.includes(artistNorm)) {
        score += 20
        break
      }
    }

    if (targetDuration && targetDuration > 0 && candidate.duration > 0) {
      const diff = Math.abs(candidate.duration - targetDuration)
      if (diff <= 3) {
        score += 30
      } else if (diff <= 8) {
        score += 20
      } else if (diff <= 15) {
        score += 10
      } else if (diff > 60) {
        score -= 25
      }
    }

    if (/(?:official|mv|完整版|原曲|音频|无损|高音质|单曲)/i.test(candidate.title)) {
      score += 10
    }

    const negativePattern =
      /(?:翻唱|cover|remix|改编|鬼畜|钢琴|吉他|伴奏|instrumental|inst|教程|教学|混剪|mad|amv|现场版|live|reaction|解说|纯伴奏|歌词排版|utau|ai|虚拟歌姬)/i
    if (negativePattern.test(candidate.title) && !negativePattern.test(songName)) {
      score -= 30
    }

    if (candidate.play >= 100_000) {
      score += 10
    } else if (candidate.play >= 10_000) {
      score += 5
    }

    return score
  }

  export async function searchVideos(keyword: string, page = 1, pageSize = 20): Promise<Maybe<BiliSearchResult[]>> {
    const cleanKeyword = keyword.trim()
    if (!cleanKeyword) return Just([])

    const cookie = getCookieHeader()
    let mixinKey: string
    try {
      mixinKey = await getWbiMixinKey(cookie)
    } catch (e) {
      logger.warn('Failed to get WBI mixin key for Bilibili search:', e)
      return Nothing()
    }

    const queryParams = encWbi(
      {
        search_type: 'video',
        keyword: cleanKeyword,
        page,
        page_size: pageSize,
        order: 'totalrank'
      },
      mixinKey
    )

    const queryString = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    try {
      const res = await fetch(`https://api.bilibili.com/x/web-interface/wbi/search/type?${queryString}`, {
        headers: { ...COMMON_HEADERS, ...(cookie ? { Cookie: cookie } : {}) }
      })

      if (!res.ok) {
        logger.error(`Bilibili search API returned HTTP ${res.status}: ${res.statusText}`)
        return Nothing()
      }

      const json = (await res.json()) as {
        code: number
        message?: string
        data?: {
          result?: Array<{
            bvid: string
            title: string
            author: string
            pic: string
            duration: string
            play: number | string
          }>
        }
      }

      if (json.code !== 0 || !json.data || !Array.isArray(json.data.result)) {
        return Just([])
      }

      const results: BiliSearchResult[] = json.data.result.map((item) => {
        const cleanTitle = (item.title || '').replace(/<[^>]+>/g, '').trim()
        const rawPic = item.pic || ''
        const pic = rawPic.startsWith('//') ? `https:${rawPic}` : rawPic
        const durSec = parseDurationStr(item.duration)
        const playCount = typeof item.play === 'number' ? item.play : parseInt(String(item.play), 10) || 0

        return {
          bvid: item.bvid,
          title: cleanTitle,
          author: item.author || 'Bilibili',
          pic,
          duration: durSec,
          durationStr: formatDurationSeconds(durSec),
          play: playCount
        }
      })

      return Just(results)
    } catch (err) {
      logger.error('Failed to search Bilibili videos:', err)
      return Nothing()
    }
  }

  export async function matchBestVideo(
    songName: string,
    artists: string[],
    targetDuration?: number
  ): Promise<Maybe<{ best: BiliSearchResult; score: number; candidates: BiliSearchResult[] }>> {
    const primaryKeyword = `${songName} ${artists[0] || ''}`.trim()
    const searchRes = await searchVideos(primaryKeyword, 1, 15)

    let candidates: BiliSearchResult[] = []
    searchRes.match({
      Just: (res) => {
        candidates = res
      },
      Nothing: () => {}
    })

    if (candidates.length === 0) {
      const cleanName = songName.replace(/[(（[【].*?[)）\]】]/g, '').trim()
      if (cleanName && cleanName !== primaryKeyword) {
        const fallbackRes = await searchVideos(cleanName, 1, 10)
        fallbackRes.match({
          Just: (res) => {
            candidates = res
          },
          Nothing: () => {}
        })
      }
    }

    if (candidates.length === 0) return Nothing()

    const scored = candidates.map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, songName, artists, targetDuration)
    }))

    scored.sort((a, b) => b.score - a.score)

    const top = scored[0]
    if (top && top.score >= 50) {
      return Just({ best: top.candidate, score: top.score, candidates })
    }

    return Nothing()
  }
}
