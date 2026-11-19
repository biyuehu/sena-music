import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('senaDesktop', {
  isDesktop: true,
  getShortcuts: () => ipcRenderer.invoke('desktop:get-shortcuts'),
  setShortcut: (id: string, key: string, enabled: boolean) =>
    ipcRenderer.invoke('desktop:set-shortcut', { id, key, enabled }),
  checkShortcut: (id: string, key: string) => ipcRenderer.invoke('desktop:check-shortcut', { id, key }),
  resetShortcuts: () => ipcRenderer.invoke('desktop:reset-shortcuts'),
  getCloseAction: () => ipcRenderer.invoke('desktop:get-close-action'),
  setCloseAction: (action: 'ask' | 'tray' | 'quit') => ipcRenderer.invoke('desktop:set-close-action', action),
  syncPlaybackState: (state: { isPlaying: boolean; title?: string; artist?: string }) =>
    ipcRenderer.send('desktop:sync-playback-state', state),
  onPlayerCommand: (callback: (command: string) => void) => {
    const listener = (_: unknown, command: string) => callback(command)
    ipcRenderer.on('player-command', listener)
    return () => {
      ipcRenderer.removeListener('player-command', listener)
    }
  },
  onCloseActionChanged: (callback: (action: string) => void) => {
    const listener = (_: unknown, action: string) => callback(action)
    ipcRenderer.on('desktop:close-action-changed', listener)
    return () => {
      ipcRenderer.removeListener('desktop:close-action-changed', listener)
    }
  },
  getLyricSettings: () => ipcRenderer.invoke('desktop:get-lyric-settings'),
  setLyricSettings: (settings: unknown) => ipcRenderer.invoke('desktop:set-lyric-settings', settings),
  syncLyric: (data: unknown) => ipcRenderer.send('desktop:sync-lyric', data),
  onLyricUpdate: (callback: (data: unknown) => void) => {
    const listener = (_: unknown, data: unknown) => callback(data)
    ipcRenderer.on('desktop:lyric-update', listener)
    return () => {
      ipcRenderer.removeListener('desktop:lyric-update', listener)
    }
  },
  onLyricSettingsUpdate: (callback: (settings: unknown) => void) => {
    const listener = (_: unknown, settings: unknown) => callback(settings)
    ipcRenderer.on('desktop:lyric-settings-update', listener)
    return () => {
      ipcRenderer.removeListener('desktop:lyric-settings-update', listener)
    }
  },
  sendPlayerCommand: (command: unknown) => ipcRenderer.send('desktop:send-player-command', command),
  moveLyricWindow: (dx: number, dy: number) => ipcRenderer.send('desktop:move-lyric-window', { dx, dy }),
  onLyricResizing: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('desktop:lyric-resizing', listener)
    return () => {
      ipcRenderer.removeListener('desktop:lyric-resizing', listener)
    }
  }
})

try {
  window.dispatchEvent(new CustomEvent('sena-desktop-ready'))
} catch {}
