import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { TRAY_ICON_DATA_URL } from './assets'
import {
  checkShortcutConflict,
  DEFAULT_SHORTCUTS,
  loadShortcuts,
  registerAllShortcuts,
  type ShortcutItem,
  saveShortcuts
} from './shortcuts'

function preparePackagedEnvironment(): void {
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  mkdirSync(join(userData, 'cache'), { recursive: true })
  mkdirSync(join(userData, 'data'), { recursive: true })
  const configFile = join(userData, 'music.toml')
  if (!existsSync(configFile)) copyFileSync(join(process.resourcesPath, 'music.toml'), configFile)
  process.chdir(userData)
  process.env.NODE_ENV = 'production'
  process.env.SENA_ASSETS_DIR = join(process.resourcesPath, 'dist')
}

const SETTINGS_FILE = 'desktop-settings.json'

function loadCloseToTray(userData: string): boolean {
  try {
    const file = join(userData, SETTINGS_FILE)
    if (!existsSync(file)) return true
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    return typeof parsed.closeToTray === 'boolean' ? parsed.closeToTray : true
  } catch {
    return true
  }
}

function saveCloseToTray(userData: string, closeToTray: boolean): void {
  try {
    const file = join(userData, SETTINGS_FILE)
    writeFileSync(file, JSON.stringify({ closeToTray }, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save desktop settings:', err)
  }
}

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let isQuitting = false
let closeToTray = true
let currentShortcuts: ShortcutItem[] = []
let currentPlaybackState = { isPlaying: false, title: '', artist: '' }

function updateTrayMenu(): void {
  if (!tray || !mainWindow) return
  const titleText = currentPlaybackState.title
    ? `${currentPlaybackState.isPlaying ? '正在播放' : '已暂停'}：${currentPlaybackState.title}${
        currentPlaybackState.artist ? ` - ${currentPlaybackState.artist}` : ''
      }`
    : 'Sena Music'

  tray.setToolTip(titleText)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: titleText,
      enabled: false
    },
    { type: 'separator' },
    {
      label: currentPlaybackState.isPlaying ? '暂停' : '播放',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player-command', 'toggle')
        }
      }
    },
    {
      label: '上一首',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player-command', 'prev')
        }
      }
    },
    {
      label: '下一首',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player-command', 'next')
        }
      }
    },
    { type: 'separator' },
    {
      label: mainWindow?.isVisible() ? '隐藏主界面' : '显示主界面',
      click: () => {
        if (!mainWindow) return
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: '退出 Sena Music',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}

function setupTray(window: BrowserWindow): void {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  updateTrayMenu()

  tray.on('click', () => {
    if (window.isVisible()) {
      if (window.isFocused()) {
        window.hide()
      } else {
        window.focus()
      }
    } else {
      window.show()
      window.focus()
    }
  })
}

function setupIpcHandlers(userData: string): void {
  ipcMain.handle('desktop:get-shortcuts', () => currentShortcuts)

  ipcMain.handle('desktop:check-shortcut', (_event, { id, key }: { id: string; key: string }) =>
    checkShortcutConflict(id, key, currentShortcuts)
  )

  ipcMain.handle(
    'desktop:set-shortcut',
    (_event, { id, key, enabled }: { id: string; key: string; enabled: boolean }) => {
      const check = checkShortcutConflict(id, key, currentShortcuts)
      if (!check.success) return check

      currentShortcuts = currentShortcuts.map((s) => (s.id === id ? { ...s, currentKey: key.trim(), enabled } : s))
      saveShortcuts(userData, currentShortcuts)
      registerAllShortcuts(mainWindow, currentShortcuts)
      return { success: true }
    }
  )

  ipcMain.handle('desktop:reset-shortcuts', () => {
    currentShortcuts = DEFAULT_SHORTCUTS.map((s) => ({ ...s }))
    saveShortcuts(userData, currentShortcuts)
    registerAllShortcuts(mainWindow, currentShortcuts)
    return currentShortcuts
  })

  ipcMain.handle('desktop:get-close-to-tray', () => closeToTray)

  ipcMain.handle('desktop:set-close-to-tray', (_event, enabled: boolean) => {
    closeToTray = enabled
    saveCloseToTray(userData, closeToTray)
    return closeToTray
  })

  ipcMain.on(
    'desktop:sync-playback-state',
    (_event, state: { isPlaying: boolean; title?: string; artist?: string }) => {
      currentPlaybackState = {
        isPlaying: Boolean(state.isPlaying),
        title: state.title || '',
        artist: state.artist || ''
      }
      updateTrayMenu()
    }
  )
}

async function createWindow(): Promise<BrowserWindow> {
  if (app.isPackaged) preparePackagedEnvironment()
  const userData = app.getPath('userData')
  closeToTray = loadCloseToTray(userData)
  currentShortcuts = loadShortcuts(userData)

  const currentDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const preloadPath = join(currentDir, 'preload.js')

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Sena Music',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.setMenu(null)
  window.once('ready-to-show', () => window.show())

  window.on('close', (event) => {
    if (!isQuitting && closeToTray) {
      event.preventDefault()
      window.hide()
    }
  })

  if (!app.isPackaged)
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    })

  setupTray(window)
  setupIpcHandlers(userData)
  registerAllShortcuts(window, currentShortcuts)

  try {
    const { CONFIG } = await import('../../server/config')
    await import('../../server/app')
    await window.loadURL(`http://localhost:${CONFIG.port}`)
  } catch (error) {
    console.error('Failed to start:', error)
    await window.loadURL(`data:text/html,${encodeURIComponent(`<pre>${String(error)}</pre>`)}`)
  }
  return window
}

if (app.requestSingleInstanceLock()) {
  app.setAppUserModelId('com.himenosena.music')
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
    mainWindow?.focus()
  })

  app.whenReady().then(async () => {
    mainWindow = await createWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && (!closeToTray || isQuitting)) {
      app.quit()
    }
  })
} else app.quit()
