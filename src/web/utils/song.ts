import { type Either, Right } from '@/romi/utils/adt/either'
import type { SongInfo } from '../../common/types'

export async function getSongUrl(song: SongInfo): Promise<Either<string, string>> {
  switch (song.type) {
    case 'netease':
      return Right(`https://music.163.com/song/media/outer/url?id=${song.value || song.id}.mp3`)
    case 'local':
      return Right(`/getLocalAudioFiles?id=${song.id}`)
    case 'bili':
      return Right(
        song.value
          ? `/getBiliAudioFile?id=${encodeURIComponent(song.id)}&v=${encodeURIComponent(song.value)}`
          : `/getBiliAudioFile?id=${encodeURIComponent(song.id)}`
      )
    case 'youtube':
      return Right(`/getYoutubeAudioFile?id=${song.id}`)
    case 'qq':
      return Right(`/getQQAudioFile?id=${song.id}`)
    default:
      return Right(song.value)
  }
}

export function getRandomNextIndex(length: number, currentIndex: number): number {
  if (length <= 1) return 0
  const next = Math.floor(Math.random() * (length - 1))
  return currentIndex >= 0 && next >= currentIndex ? next + 1 : next
}
