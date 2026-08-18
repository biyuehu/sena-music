import type { SongInfo } from 'src/common/types'
import { type Either, Right } from '@/romi/utils/adt/either'

export function formatTime(s: number) {
  if (Number.isNaN(s)) return '00:00'
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`
}

export async function getSongUrl(song: SongInfo): Promise<Either<string, string>> {
  switch (song.type) {
    case 'netease':
      return Right(`https://music.163.com/song/media/outer/url?id=${song.value || song.id}.mp3`)
    case 'local':
      return Right(`/getLocalAudioFiles?id=${song.id}`)
    case 'bili':
      return Right(`/getBiliAudioFile?id=${song.id}`)
    case 'youtube':
      return Right(`/getYoutubeAudioFile?id=${song.id}`)
    default:
      return Right(song.value)
  }
}
