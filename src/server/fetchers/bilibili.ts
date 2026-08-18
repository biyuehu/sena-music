import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import { logger } from '../common'
import { Data } from '../data'

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

  /**
   * 获取 B 站音频本地缓存文件路径。
   * 缓存优先；未命中时取直链，用 ffmpeg 转码为静态 MP3 落盘，转码期间用 lock 文件避免重复拉流。
   */
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
      return Just(filePath)
    } finally {
      if (existsSync(lockPath)) unlinkSync(lockPath)
    }
  }
}
