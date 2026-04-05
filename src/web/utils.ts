import type { SongInfo } from 'src/common/types'
import { YOUTUBE_AUDIO_URL_EXPIRATION_SECONDS } from 'src/server/constant'
import { type Either, Right } from '@/romi/utils/adt/either'
import { Cache } from './cache'
import { httpClient } from './client'
import type { showToast } from './components/toast'

export function formatTime(s: number) {
  if (Number.isNaN(s)) return '00:00'
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`
}

export async function getSongUrl(song: SongInfo, show?: typeof showToast): Promise<Either<string, string>> {
  switch (song.type) {
    case 'netease':
      return Right(`https://music.163.com/song/media/outer/url?id=${song.value || song.id}.mp3`)
    case 'local':
      return Right(`/getLocalAudioFiles?id=${song.id}`)
    case 'youtube':
      return await (async () => {
        const key = `youtube-url-${song.value}`
        const cache = Cache.get<string>(key)
        if (cache.isJust()) return Right(cache.value)
        if (show) show(`解析 YouTube 音频地址中...`)
        return (await httpClient.getYoutubeAudioUrl({ id: song.id }))
          .map(({ url }) => {
            Cache.set(key, url, YOUTUBE_AUDIO_URL_EXPIRATION_SECONDS)
            return url
          })
          .mapLeft(({ error }) => error)
      })()
    default:
      return Right(song.value)
  }
}
