export type CloseAction = 'ask' | 'tray' | 'quit'

export interface DesktopShortcut {
  id: string
  name: string
  defaultKey: string
  currentKey: string
  enabled: boolean
}

export interface DesktopLyricSettings {
  enabled: boolean
  locked: boolean
  fontSize: number
  fontFamily: string
  color: string
  playedColor: string
  strokeWidth: number
  strokeColor: string
  shadowBlur: number
  shadowColor: string
  backgroundColor: string
  borderColor: string
  borderWidth: number
  width: number
  height: number
  x?: number
  y?: number
}

export const DEFAULT_DESKTOP_LYRIC_SETTINGS: DesktopLyricSettings = {
  enabled: false,
  locked: false,
  fontSize: 28,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#ffffff',
  playedColor: '#38bdf8',
  strokeWidth: 2,
  strokeColor: '#000000',
  shadowBlur: 6,
  shadowColor: 'rgba(0, 0, 0, 0.85)',
  backgroundColor: 'rgba(15, 23, 42, 0.45)',
  borderColor: 'rgba(255, 255, 255, 0.15)',
  borderWidth: 1,
  width: 800,
  height: 130
}

export const DEFAULT_DESKTOP_SHORTCUTS: DesktopShortcut[] = [
  {
    id: 'toggle',
    name: '播放 / 暂停',
    defaultKey: 'CommandOrControl+Alt+Space',
    currentKey: 'CommandOrControl+Alt+Space',
    enabled: true
  },
  {
    id: 'prev',
    name: '上一首',
    defaultKey: 'CommandOrControl+Alt+Left',
    currentKey: 'CommandOrControl+Alt+Left',
    enabled: true
  },
  {
    id: 'next',
    name: '下一首',
    defaultKey: 'CommandOrControl+Alt+Right',
    currentKey: 'CommandOrControl+Alt+Right',
    enabled: true
  },
  {
    id: 'volumeUp',
    name: '音量增加',
    defaultKey: 'CommandOrControl+Alt+Up',
    currentKey: 'CommandOrControl+Alt+Up',
    enabled: true
  },
  {
    id: 'volumeDown',
    name: '音量减小',
    defaultKey: 'CommandOrControl+Alt+Down',
    currentKey: 'CommandOrControl+Alt+Down',
    enabled: true
  }
]

export interface SenaDesktopBridge {
  isDesktop: boolean
  getShortcuts: () => Promise<DesktopShortcut[]>
  setShortcut: (id: string, key: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
  checkShortcut: (id: string, key: string) => Promise<{ success: boolean; error?: string }>
  resetShortcuts: () => Promise<DesktopShortcut[]>
  getCloseAction?: () => Promise<CloseAction>
  setCloseAction?: (action: CloseAction) => Promise<CloseAction>
  syncPlaybackState: (state: { isPlaying: boolean; title?: string; artist?: string }) => void
  onPlayerCommand: (callback: (command: string) => void) => () => void
  onCloseActionChanged?: (callback: (action: CloseAction) => void) => () => void
  getLyricSettings?: () => Promise<DesktopLyricSettings>
  setLyricSettings?: (settings: Partial<DesktopLyricSettings>) => Promise<DesktopLyricSettings>
  syncLyric?: (data: {
    tracks?: string[]
    text: string
    translation?: string
    subText?: string
    isPlaying: boolean
    title?: string
    artist?: string
  }) => void
  onLyricUpdate?: (
    callback: (data: {
      tracks?: string[]
      text: string
      translation?: string
      subText?: string
      isPlaying: boolean
      title?: string
      artist?: string
    }) => void
  ) => () => void
  onLyricSettingsUpdate?: (callback: (settings: DesktopLyricSettings) => void) => () => void
  sendPlayerCommand?: (command: string) => void
  moveLyricWindow?: (dx: number, dy: number) => void
  onLyricResizing?: (callback: () => void) => () => void
}

declare global {
  interface Window {
    senaDesktop?: SenaDesktopBridge
  }
}

export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false
  if (window.senaDesktop?.isDesktop) return true
  if (typeof navigator !== 'undefined' && navigator.userAgent && /electron/i.test(navigator.userAgent)) return true
  return false
}

export function getDesktopBridge(): SenaDesktopBridge | null {
  if (typeof window !== 'undefined' && window.senaDesktop) {
    return window.senaDesktop
  }
  return null
}
