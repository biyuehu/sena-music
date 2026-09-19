import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import { pruneCache } from '../cache'
import { CONFIG, logger, RUNTIME } from '../common'
import { Data } from '../data'

export namespace YoutubeFetcher {
  function extractVideoId(input: string): Maybe<string> {
    const trimmed = input.trim()
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^[a-zA-Z0-9_-]{11}$/
    ]
    for (const pattern of patterns) {
      const match = trimmed.match(pattern)
      if (match?.[1]) return Just(match[1])
    }
    return Nothing()
  }

  function cacheFilePath(videoId: string): string {
    return join(Data.CACHE_DIRECTORY, `youtube+${videoId}.mp3`)
  }

  function downloadAndTranscode(videoId: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const tempPath = join(Data.CACHE_DIRECTORY, `youtube+${videoId}.tmp`)
      const ytDlpArgs = [
        ...(existsSync(Data.COOKIES_DATA_FILE) ? ['--cookies', Data.COOKIES_DATA_FILE] : []),
        '--js-runtimes',
        RUNTIME,
        '--remote-components',
        'ejs:github',
        '--extractor-args',
        'youtube:player_client=web,web_embedded',
        '-f',
        'bestaudio',
        '-o',
        tempPath,
        videoId
      ]

      const ytDlp = spawn('yt-dlp', ytDlpArgs)

      let ytDlpError = ''
      ytDlp.stderr.on('data', (data) => {
        ytDlpError += data.toString()
      })

      ytDlp.on('close', (code) => {
        if (code !== 0 || !existsSync(tempPath)) {
          logger.error(`yt-dlp failed with code ${code}: ${ytDlpError.trim()}`)
          resolve(false)
          return
        }

        const ffmpeg = spawn('ffmpeg', [
          '-y',
          '-i',
          tempPath,
          '-f',
          'mp3',
          '-acodec',
          'libmp3lame',
          '-ab',
          '192k',
          outputPath
        ])

        let ffmpegError = ''
        ffmpeg.stderr.on('data', (data) => {
          ffmpegError += data.toString()
        })

        ffmpeg.on('close', (ffmpegCode) => {
          if (existsSync(tempPath)) unlinkSync(tempPath)
          if (ffmpegCode !== 0) {
            logger.error(`ffmpeg failed with code ${ffmpegCode}: ${ffmpegError.trim()}`)
          } else {
            logger.info(`ffmpeg transcode completed`)
          }
          resolve(ffmpegCode === 0)
        })

        ffmpeg.on('error', (err) => {
          logger.error('Failed to spawn ffmpeg:', err)
          if (existsSync(tempPath)) unlinkSync(tempPath)
          resolve(false)
        })
      })

      ytDlp.on('error', (err) => {
        logger.error('Failed to spawn yt-dlp:', err)
        resolve(false)
      })
    })
  }

  export async function getAudioFilePath(rawInput: string): Promise<Maybe<string>> {
    const videoIdResult = extractVideoId(rawInput)
    if (videoIdResult.isNothing()) {
      logger.error(`Unable to parse YouTube video ID from input: "${rawInput}"`)
      return Nothing()
    }

    const videoId = videoIdResult.value
    const filePath = cacheFilePath(videoId)
    const lockPath = `${filePath}.lock`

    if (existsSync(filePath) && !existsSync(lockPath)) {
      logger.info(`Using cached YouTube audio file for ${videoId}`)
      return Just(filePath)
    }

    if (existsSync(lockPath)) {
      logger.info(`Waiting for ongoing transcode of ${videoId} ...`)
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
        logger.error(`Timed out waiting for transcode of ${videoId}`)
        return Nothing()
      }
      if (existsSync(filePath)) return Just(filePath)
      return Nothing()
    }

    if (!existsSync(Data.CACHE_DIRECTORY)) mkdirSync(Data.CACHE_DIRECTORY, { recursive: true })

    writeFileSync(lockPath, '1')

    try {
      logger.info(`Downloading and transcoding YouTube audio for ${videoId} ...`)
      const success = await downloadAndTranscode(videoId, filePath)
      if (!success) {
        logger.error(`Failed to download and transcode YouTube audio for ${videoId}`)
        return Nothing()
      }

      logger.info(`Cached YouTube audio for ${videoId} at ${filePath}`)
      setTimeout(() => pruneCache(CONFIG.cacheMaxSize * 1024 * 1024), 0)
      return Just(filePath)
    } catch (err) {
      logger.error(`Unexpected error during YouTube transcode for ${videoId}:`, err)
      return Nothing()
    } finally {
      if (existsSync(lockPath)) unlinkSync(lockPath)
    }
  }
}
