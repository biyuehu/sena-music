import { existsSync, readFileSync } from 'node:fs'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import { logger } from './common'
import { Data } from './data'

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

export interface BiliAudioSource {
  url: string
  mimeType: string
}

interface CacheEntry {
  source: BiliAudioSource
  expireAt: number
}

export namespace BiliFetcher {
  const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const BILIBILI_REFERER = 'https://www.bilibili.com'
  const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

  // 内存缓存：key 为 `${bvid || aid}_${cid}`
  const audioCache = new Map<string, CacheEntry>()

  /**
   * 获取配置的 Cookie（如果有）
   */
  function getCookieHeader(): string {
    try {
      if (existsSync(Data.COOKIES_DATA_FILE)) {
        const content = readFileSync(Data.COOKIES_DATA_FILE, 'utf-8')
        // 如果是 Netscape 格式的 cookies.txt
        const cookies = content
          .split('\n')
          .filter((line) => line.trim() && !line.startsWith('#'))
          .map((line) => {
            const parts = line.split('\t')
            if (parts.length >= 7) {
              return `${parts[5].trim()}=${parts[6].trim()}`
            }
            return ''
          })
          .filter(Boolean)
          .join('; ')
        if (cookies) return cookies
      }
    } catch (e) {
      logger.warn('Failed to read cookies file for Bilibili:', e)
    }
    return ''
  }

  /**
   * 解析用户输入的各种格式（BV号、AV号、视频URL、b23.tv短链接、分P参数）
   */
  export async function parseInput(rawInput: string): Promise<{
    bvid?: string
    aid?: number
    page: number
  }> {
    const input = rawInput.trim()
    let targetStr = input
    let page = 1

    // 1. 检查是否为 b23.tv 短链接并解析重定向
    if (/b23\.tv/i.test(input)) {
      try {
        const urlWithProto = /^https?:\/\//i.test(input) ? input : `https://${input}`
        logger.info(`Resolving Bilibili short url: ${urlWithProto}`)
        const res = await fetch(urlWithProto, {
          method: 'GET',
          redirect: 'follow',
          headers: { 'User-Agent': DEFAULT_USER_AGENT }
        })
        targetStr = res.url || input
        logger.info(`Resolved short url to: ${targetStr}`)
      } catch (e) {
        logger.warn('Failed to resolve b23.tv short link:', e)
      }
    }

    // 2. 提取分P参数 (如 ?p=2, &p=2, :p2, /p2, page=2)
    const pMatch = targetStr.match(/(?:[?&]p=|[?&]page=|[:/ ]p)(\d+)/i)
    if (pMatch?.[1]) {
      page = Math.max(1, parseInt(pMatch[1], 10))
    }

    // 3. 提取 BV 号 (形如 BV14Gg46LEMh)
    const bvMatch = targetStr.match(/(BV[0-9a-zA-Z]{10})/i)
    if (bvMatch?.[1]) {
      return { bvid: bvMatch[1], page }
    }

    // 4. 提取 AV 号 (形如 av170001 或纯数字)
    const avMatch = targetStr.match(/(?:av|aid=)(\d+)/i)
    if (avMatch?.[1]) {
      return { aid: parseInt(avMatch[1], 10), page }
    }

    // 5. 如果是纯数字且无其它前缀
    if (/^\d+$/.test(targetStr)) {
      return { aid: parseInt(targetStr, 10), page }
    }

    return { page }
  }

  /**
   * 获取 B 站视频详情与分P对应的 cid
   */
  export async function getVideoInfo(rawInput: string): Promise<Maybe<BiliVideoInfo>> {
    const { bvid, aid, page } = await parseInput(rawInput)

    if (!bvid && !aid) {
      logger.error(`Unable to parse BV or AV ID from input: "${rawInput}"`)
      return Nothing()
    }

    const query = bvid ? `bvid=${bvid}` : `aid=${aid}`
    const apiUrl = `https://api.bilibili.com/x/web-interface/view?${query}`
    const cookie = getCookieHeader()

    logger.info(`Fetching Bilibili video info: ${apiUrl} (page: ${page})`)

    try {
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Referer: BILIBILI_REFERER,
          ...(cookie ? { Cookie: cookie } : {})
        }
      })

      if (!res.ok) {
        logger.error(`Bilibili view API returned HTTP ${res.status}: ${res.statusText}`)
        return Nothing()
      }

      const json = (await res.json()) as {
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

      if (json.code !== 0 || !json.data) {
        logger.error(`Bilibili view API error: [code ${json.code}] ${json.message || 'Unknown error'}`)
        return Nothing()
      }

      const data = json.data
      const pages = data.pages || []
      const targetPage = pages.find((p) => p.page === page) ||
        pages[0] || {
          cid: data.cid,
          page: 1,
          part: data.title,
          duration: data.duration
        }

      const videoInfo: BiliVideoInfo = {
        bvid: data.bvid,
        aid: data.aid,
        cid: targetPage.cid,
        title: data.title,
        cover: data.pic,
        artist: data.owner?.name || 'Bilibili',
        duration: targetPage.duration || data.duration,
        partName: targetPage.part || data.title,
        page: targetPage.page || 1
      }

      logger.info(`Got Bilibili video info: "${videoInfo.title}" by ${videoInfo.artist} (cid: ${videoInfo.cid})`)
      return Just(videoInfo)
    } catch (err) {
      logger.error('Failed to fetch Bilibili video info:', err)
      return Nothing()
    }
  }

  /**
   * 获取 B 站音频直链 (带缓存)
   */
  export async function getAudioSource(rawInput: string): Promise<Maybe<BiliAudioSource>> {
    const infoResult = await getVideoInfo(rawInput)
    if (infoResult.isNothing()) return Nothing()

    const info = infoResult.value
    const cacheKey = `${info.bvid || info.aid}_${info.cid}`

    // 检查缓存
    const cached = audioCache.get(cacheKey)
    if (cached && cached.expireAt > Date.now()) {
      logger.info(`Using cached Bilibili audio source for ${cacheKey}`)
      return Just(cached.source)
    }

    const cookie = getCookieHeader()
    const query = info.bvid ? `bvid=${info.bvid}&cid=${info.cid}` : `aid=${info.aid}&cid=${info.cid}`
    // fnval=16 表示获取 DASH 格式音频
    const playUrl = `https://api.bilibili.com/x/player/playurl?${query}&fnval=16&fnver=0&fourk=1`

    logger.info(`Fetching Bilibili playurl: ${playUrl}`)

    try {
      const res = await fetch(playUrl, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Referer: BILIBILI_REFERER,
          ...(cookie ? { Cookie: cookie } : {})
        }
      })

      if (!res.ok) {
        logger.error(`Bilibili playurl API returned HTTP ${res.status}: ${res.statusText}`)
        return Nothing()
      }

      const json = (await res.json()) as {
        code: number
        message?: string
        data?: {
          dash?: {
            audio?: Array<{
              id: number
              baseUrl?: string
              base_url?: string
              backupUrl?: string[]
              backup_url?: string[]
              mimeType?: string
              mime_type?: string
            }>
          }
          durl?: Array<{ url: string }>
        }
      }

      if (json.code !== 0 || !json.data) {
        logger.error(`Bilibili playurl API error: [code ${json.code}] ${json.message || 'Unknown error'}`)
        return Nothing()
      }

      let audioUrl = ''
      let mimeType = 'audio/mp4'

      // 优先从 DASH 中选取最高音质音频流
      if (json.data.dash?.audio && json.data.dash.audio.length > 0) {
        const sortedAudios = [...json.data.dash.audio].sort((a, b) => b.id - a.id)
        const bestAudio = sortedAudios[0]
        audioUrl =
          bestAudio.baseUrl || bestAudio.base_url || bestAudio.backupUrl?.[0] || bestAudio.backup_url?.[0] || ''
        mimeType = bestAudio.mimeType || bestAudio.mime_type || 'audio/mp4'
      } else if (json.data.durl && json.data.durl.length > 0) {
        // 兜底降级到 durl
        audioUrl = json.data.durl[0].url
      }

      if (!audioUrl) {
        logger.error('No audio stream found in Bilibili playurl response')
        return Nothing()
      }

      const source: BiliAudioSource = {
        url: audioUrl,
        mimeType
      }

      // 写入缓存
      audioCache.set(cacheKey, {
        source,
        expireAt: Date.now() + CACHE_TTL_MS
      })

      logger.info(`Successfully parsed Bilibili audio source: ${audioUrl.slice(0, 80)}...`)
      return Just(source)
    } catch (err) {
      logger.error('Failed to fetch Bilibili playurl:', err)
      return Nothing()
    }
  }

  /**
   * 代理请求 B 站 CDN 音频流（透传客户端 Range 标头）
   */
  export async function fetchProxyStream(
    audioUrl: string,
    rangeHeader?: string | string[]
  ): Promise<
    Maybe<{
      status: number
      contentType: string
      headers: Record<string, string>
      body: ReadableStream<Uint8Array>
    }>
  > {
    const range = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader

    const requestHeaders: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT,
      Referer: BILIBILI_REFERER
    }

    if (range) {
      requestHeaders.Range = range
    }

    try {
      const res = await fetch(audioUrl, {
        method: 'GET',
        headers: requestHeaders
      })

      if (!res.body) {
        logger.error('Empty response body from Bilibili CDN')
        return Nothing()
      }

      const responseHeaders: Record<string, string> = {
        'Accept-Ranges': 'bytes'
      }

      const contentLength = res.headers.get('content-length')
      if (contentLength) responseHeaders['Content-Length'] = contentLength

      const contentRange = res.headers.get('content-range')
      if (contentRange) responseHeaders['Content-Range'] = contentRange

      const contentType = res.headers.get('content-type') || 'audio/mp4'

      return Just({
        status: res.status,
        contentType,
        headers: responseHeaders,
        body: res.body
      })
    } catch (err) {
      logger.error('Failed to fetch Bilibili audio stream from CDN:', err)
      return Nothing()
    }
  }
}
