export type CloseAction = 'ask' | 'tray' | 'quit'

export interface DesktopShortcut {
  id: string
  name: string
  defaultKey: string
  currentKey: string
  enabled: boolean
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
  getCloseToTray: () => Promise<boolean>
  setCloseToTray: (enabled: boolean) => Promise<void>
  syncPlaybackState: (state: { isPlaying: boolean; title?: string; artist?: string }) => void
  onPlayerCommand: (callback: (command: string) => void) => () => void
  onCloseActionChanged?: (callback: (action: CloseAction) => void) => () => void
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
