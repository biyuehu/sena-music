import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('senaDesktop', {
  isDesktop: true,
  getShortcuts: () => ipcRenderer.invoke('desktop:get-shortcuts'),
  setShortcut: (id: string, key: string, enabled: boolean) =>
    ipcRenderer.invoke('desktop:set-shortcut', { id, key, enabled }),
  checkShortcut: (id: string, key: string) => ipcRenderer.invoke('desktop:check-shortcut', { id, key }),
  resetShortcuts: () => ipcRenderer.invoke('desktop:reset-shortcuts'),
  getCloseToTray: () => ipcRenderer.invoke('desktop:get-close-to-tray'),
  setCloseToTray: (enabled: boolean) => ipcRenderer.invoke('desktop:set-close-to-tray', enabled),
  syncPlaybackState: (state: { isPlaying: boolean; title?: string; artist?: string }) =>
    ipcRenderer.send('desktop:sync-playback-state', state),
  onPlayerCommand: (callback: (command: string) => void) => {
    const listener = (_: unknown, command: string) => callback(command)
    ipcRenderer.on('player-command', listener)
    return () => {
      ipcRenderer.removeListener('player-command', listener)
    }
  }
})
