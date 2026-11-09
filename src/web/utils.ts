import { type Either, Right } from '@/romi/utils/adt/either'
import type { SongInfo } from '../common/types'

export interface DesktopShortcut {
  id: string
  name: string
  defaultKey: string
  currentKey: string
  enabled: boolean
}

export interface SenaDesktopBridge {
  isDesktop: boolean
  getShortcuts: () => Promise<DesktopShortcut[]>
  setShortcut: (id: string, key: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
  checkShortcut: (id: string, key: string) => Promise<{ success: boolean; error?: string }>
  resetShortcuts: () => Promise<DesktopShortcut[]>
  getCloseToTray: () => Promise<boolean>
  setCloseToTray: (enabled: boolean) => Promise<void>
  syncPlaybackState: (state: { isPlaying: boolean; title?: string; artist?: string }) => void
  onPlayerCommand: (callback: (command: string) => void) => () => void
}

declare global {
  interface Window {
    senaDesktop?: SenaDesktopBridge
  }
}

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.senaDesktop?.isDesktop)
}

export function getDesktopBridge(): SenaDesktopBridge | null {
  if (isDesktopApp()) {
    return window.senaDesktop ?? null
  }
  return null
}

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
