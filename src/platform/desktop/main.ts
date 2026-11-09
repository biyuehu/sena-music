import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { APP_ICON_DATA_URL, TRAY_ICON_DATA_URL } from './assets'
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

export type CloseAction = 'ask' | 'tray' | 'quit'

interface DesktopSettings {
  closeAction?: CloseAction
  closeToTray?: boolean
}

function loadDesktopSettings(userData: string): DesktopSettings {
  try {
    const file = join(userData, SETTINGS_FILE)
    if (!existsSync(file)) return { closeAction: 'ask' }
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    let closeAction: CloseAction = 'ask'
    if (parsed.closeAction === 'ask' || parsed.closeAction === 'tray' || parsed.closeAction === 'quit') {
      closeAction = parsed.closeAction
    } else if (typeof parsed.closeToTray === 'boolean') {
      closeAction = parsed.closeToTray ? 'tray' : 'quit'
    }
    return { closeAction }
  } catch {
    return { closeAction: 'ask' }
  }
}

function saveDesktopSettings(userData: string, settings: DesktopSettings): void {
  try {
    const file = join(userData, SETTINGS_FILE)
    const action = settings.closeAction || 'ask'
    writeFileSync(
      file,
      JSON.stringify(
        {
          closeAction: action,
          closeToTray: action === 'tray'
        },
        null,
        2
      ),
      'utf-8'
    )
  } catch (err) {
    console.error('Failed to save desktop settings:', err)
  }
}

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let isQuitting = false
let closeAction: CloseAction = 'ask'
let currentShortcuts: ShortcutItem[] = []
let currentPlaybackState = { isPlaying: false, title: '', artist: '' }

function updateTrayMenu(): void {
  if (!tray) return
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
      label: mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() ? '隐藏主界面' : '显示主界面',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
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
  mainWindow = window
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL).resize({ width: 24, height: 24 })
  tray = new Tray(icon)
  updateTrayMenu()

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow.focus()
      }
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  tray.on('right-click', () => {
    updateTrayMenu()
    tray?.popUpContextMenu()
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

  ipcMain.handle('desktop:get-close-action', () => closeAction)

  ipcMain.handle('desktop:set-close-action', (_event, action: CloseAction) => {
    closeAction = action
    saveDesktopSettings(userData, { closeAction })
    return closeAction
  })

  ipcMain.handle('desktop:get-close-to-tray', () => closeAction === 'tray')

  ipcMain.handle('desktop:set-close-to-tray', (_event, enabled: boolean) => {
    closeAction = enabled ? 'tray' : 'ask'
    saveDesktopSettings(userData, { closeAction })
    return closeAction === 'tray'
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

function getPreloadPath(): string {
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const appPath = app.getAppPath()
  const candidates = [
    join(appPath, 'dist/desktop/preload.cjs'),
    join(process.cwd(), 'dist/desktop/preload.cjs'),
    join(currentDir, 'preload.cjs'),
    join(currentDir, 'dist/desktop/preload.cjs'),
    join(appPath, 'dist/desktop/preload.js'),
    join(process.cwd(), 'dist/desktop/preload.js'),
    join(currentDir, 'preload.js')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return join(currentDir, 'preload.cjs')
}

async function createWindow(): Promise<BrowserWindow> {
  if (app.isPackaged) preparePackagedEnvironment()
  const userData = app.getPath('userData')
  const settings = loadDesktopSettings(userData)
  closeAction = settings.closeAction || 'ask'
  currentShortcuts = loadShortcuts(userData)

  const preloadPath = getPreloadPath()

  const appIcon = nativeImage.createFromDataURL(APP_ICON_DATA_URL)

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production'

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Sena Music',
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev
    }
  })

  mainWindow = window
  window.webContents.on('preload-error', (_event, scriptPath, error) => {
    console.error(`[Preload Error] ${scriptPath}:`, error)
  })
  window.setMenu(null)
  window.once('ready-to-show', () => window.show())

  if (isDev) {
    window.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))
      ) {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  } else {
    window.webContents.on('devtools-opened', () => {
      window.webContents.closeDevTools()
    })
  }

  window.on('close', async (event) => {
    if (isQuitting) return

    if (closeAction === 'tray') {
      event.preventDefault()
      window.hide()
      return
    }

    if (closeAction === 'quit') {
      isQuitting = true
      app.quit()
      return
    }

    // 默认或每次询问
    event.preventDefault()
    const result = await dialog.showMessageBox(window, {
      type: 'question',
      title: 'Sena Music',
      message: '关闭 Sena Music',
      detail: '请选择关闭窗口时的操作：',
      buttons: ['最小化到系统托盘', '直接退出程序', '取消'],
      defaultId: 0,
      cancelId: 2,
      checkboxLabel: '记住我的选择，不再询问',
      checkboxChecked: false,
      noLink: true
    })

    if (result.response === 2) {
      // 取消操作
      return
    }

    const remember = result.checkboxChecked
    if (result.response === 0) {
      // 最小化到托盘
      if (remember) {
        closeAction = 'tray'
        saveDesktopSettings(userData, { closeAction })
        window.webContents.send('desktop:close-action-changed', closeAction)
      }
      window.hide()
    } else if (result.response === 1) {
      // 直接退出
      if (remember) {
        closeAction = 'quit'
        saveDesktopSettings(userData, { closeAction })
      }
      isQuitting = true
      app.quit()
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
    if (process.platform !== 'darwin' && (closeAction === 'quit' || isQuitting)) {
      app.quit()
    }
  })
} else app.quit()
