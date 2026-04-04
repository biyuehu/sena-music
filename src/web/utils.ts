import type { SongInfo } from 'src/common/types'

export function formatTime(s: number) {
  if (Number.isNaN(s)) return '00:00'
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`
}

export function getSongUrl(song: SongInfo): string {
  switch (song.type) {
    case 'netease':
      return `https://music.163.com/song/media/outer/url?id=${song.value || song.id}.mp3`
    case 'local':
      return `/getAudioFiles?id=${song.id}`
    default:
      return song.value
  }
}
