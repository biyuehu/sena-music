import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { APP_ICON_DATA_URL, TRAY_ICON_DATA_URL } from './assets'
import {
  checkShortcutConflict,
  DEFAULT_SHORTCUTS,
  loadShortcuts,
  registerAllShortcuts,
  type ShortcutItem,
  saveShortcuts,
  unregisterShortcutKey
} from './shortcuts'

function preparePackagedEnvironment(): void {
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  mkdirSync(join(userData, 'cache'), { recursive: true })
  mkdirSync(join(userData, 'data'), { recursive: true })
  process.chdir(userData)
  process.env.NODE_ENV = 'production'
  process.env.SENA_ASSETS_DIR = join(process.resourcesPath, 'dist')
}

const SETTINGS_FILE = 'desktop-settings.json'

export type CloseAction = 'ask' | 'tray' | 'quit'

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

const DEFAULT_LYRIC_SETTINGS: DesktopLyricSettings = {
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

interface DesktopSettings {
  closeAction?: CloseAction
  lyric?: DesktopLyricSettings
}

function loadDesktopSettings(userData: string): DesktopSettings {
  try {
    const file = join(userData, SETTINGS_FILE)
    if (!existsSync(file)) return { closeAction: 'ask', lyric: { ...DEFAULT_LYRIC_SETTINGS } }
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    let closeAction: CloseAction = 'ask'
    if (parsed.closeAction === 'ask' || parsed.closeAction === 'tray' || parsed.closeAction === 'quit') {
      closeAction = parsed.closeAction
    }
    const lyric = parsed.lyric ? { ...DEFAULT_LYRIC_SETTINGS, ...parsed.lyric } : { ...DEFAULT_LYRIC_SETTINGS }
    return { closeAction, lyric }
  } catch {
    return { closeAction: 'ask', lyric: { ...DEFAULT_LYRIC_SETTINGS } }
  }
}

function saveDesktopSettings(userData: string, settings: DesktopSettings): void {
  try {
    const file = join(userData, SETTINGS_FILE)
    const action = settings.closeAction ?? closeAction
    const lyric = settings.lyric ?? currentLyricSettings
    writeFileSync(
      file,
      JSON.stringify(
        {
          closeAction: action,
          lyric
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
let lyricWindow: BrowserWindow | undefined
let tray: Tray | undefined
let isQuitting = false
let closeAction: CloseAction = 'ask'
let currentShortcuts: ShortcutItem[] = []
let currentLyricSettings: DesktopLyricSettings = { ...DEFAULT_LYRIC_SETTINGS }
let currentLyricData: unknown = null
let isMovingLyricWindow = false
let moveLyricTimer: NodeJS.Timeout | undefined
let currentPlaybackState = { isPlaying: false, title: '', artist: '' }

function applyLyricSettings(newSettings: Partial<DesktopLyricSettings>, userData: string): DesktopLyricSettings {
  currentLyricSettings = { ...currentLyricSettings, ...newSettings }
  saveDesktopSettings(userData, { closeAction, lyric: currentLyricSettings })

  if (lyricWindow && !lyricWindow.isDestroyed()) {
    if (currentLyricSettings.enabled) {
      if (!lyricWindow.isVisible()) lyricWindow.showInactive()
      lyricWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      lyricWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      lyricWindow.moveTop()
    } else lyricWindow.hide()

    if (currentLyricSettings.locked) lyricWindow.setIgnoreMouseEvents(true, { forward: true })
    else lyricWindow.setIgnoreMouseEvents(false)

    lyricWindow.webContents.send('desktop:lyric-settings-update', currentLyricSettings)
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop:lyric-settings-update', currentLyricSettings)
  }

  updateTrayMenu()
  return currentLyricSettings
}

function updateTrayMenu(): void {
  if (!tray) return
  const titleText = currentPlaybackState.title
    ? `${currentPlaybackState.isPlaying ? '正在播放' : '已暂停'}：${currentPlaybackState.title}${
        currentPlaybackState.artist ? ` - ${currentPlaybackState.artist}` : ''
      }`
    : '星之声音乐'

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
      label: currentLyricSettings.enabled ? '隐藏桌面歌词' : '显示桌面歌词',
      click: () => {
        applyLyricSettings({ enabled: !currentLyricSettings.enabled }, app.getPath('userData'))
      }
    },
    {
      label: currentLyricSettings.locked ? '解锁桌面歌词' : '锁定桌面歌词',
      enabled: currentLyricSettings.enabled,
      click: () => {
        applyLyricSettings({ locked: !currentLyricSettings.locked }, app.getPath('userData'))
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
      label: '跟星奏再见',
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
      const cleanKey = (key || '').trim()
      const oldItem = currentShortcuts.find((s) => s.id === id)

      // If clearing or disabling, unregister old shortcut immediately
      if (!enabled || !cleanKey) {
        if (oldItem?.currentKey) {
          unregisterShortcutKey(oldItem.currentKey)
        }
        currentShortcuts = currentShortcuts.map((s) =>
          s.id === id ? { ...s, currentKey: cleanKey, enabled: false } : s
        )
        saveShortcuts(userData, currentShortcuts)
        registerAllShortcuts(mainWindow, currentShortcuts)
        return { success: true }
      }

      // Explicitly unregister old key before conflict check and updating
      if (oldItem?.currentKey && oldItem.currentKey.toLowerCase() !== cleanKey.toLowerCase()) {
        unregisterShortcutKey(oldItem.currentKey)
      }

      const check = checkShortcutConflict(id, cleanKey, currentShortcuts)
      if (!check.success) {
        // Restore registrations if conflict check failed
        registerAllShortcuts(mainWindow, currentShortcuts)
        return check
      }

      currentShortcuts = currentShortcuts.map((s) => (s.id === id ? { ...s, currentKey: cleanKey, enabled } : s))
      saveShortcuts(userData, currentShortcuts)
      registerAllShortcuts(mainWindow, currentShortcuts)
      return { success: true }
    }
  )

  ipcMain.handle('desktop:reset-shortcuts', () => {
    // Unregister all existing shortcut keys first
    for (const item of currentShortcuts) {
      if (item.currentKey) {
        unregisterShortcutKey(item.currentKey)
      }
    }
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

  ipcMain.handle('desktop:get-lyric-settings', () => currentLyricSettings)

  ipcMain.handle('desktop:set-lyric-settings', (_event, settings: Partial<DesktopLyricSettings>) =>
    applyLyricSettings(settings, userData)
  )

  ipcMain.on('desktop:sync-lyric', (_event, data: unknown) => {
    currentLyricData = data
    if (lyricWindow && !lyricWindow.isDestroyed() && currentLyricSettings.enabled) {
      lyricWindow.webContents.send('desktop:lyric-update', data)
    }
  })

  ipcMain.on('desktop:send-player-command', (_event, command: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('player-command', command)
    }
  })

  ipcMain.on('desktop:move-lyric-window', (_event, { dx, dy }: { dx: number; dy: number }) => {
    if (lyricWindow && !lyricWindow.isDestroyed()) {
      isMovingLyricWindow = true
      if (moveLyricTimer) clearTimeout(moveLyricTimer)
      moveLyricTimer = setTimeout(() => {
        isMovingLyricWindow = false
      }, 250)
      const [x, y] = lyricWindow.getPosition()
      const width = currentLyricSettings.width || 800
      const height = currentLyricSettings.height || 130
      lyricWindow.setBounds({
        x: Math.round(x + dx),
        y: Math.round(y + dy),
        width,
        height
      })
    }
  })
}

function createLyricWindow(preloadPath: string, port: number): void {
  if (lyricWindow && !lyricWindow.isDestroyed()) return

  const { width = 800, height = 130, x, y, locked = false } = currentLyricSettings

  lyricWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 400,
    minHeight: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  lyricWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  lyricWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (locked) lyricWindow.setIgnoreMouseEvents(true, { forward: true })

  lyricWindow.on('blur', () => {
    if (currentLyricSettings.enabled && lyricWindow && !lyricWindow.isDestroyed()) {
      lyricWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      lyricWindow.moveTop()
    }
  })

  setInterval(() => {
    if (currentLyricSettings.enabled && lyricWindow && !lyricWindow.isDestroyed()) {
      if (!lyricWindow.isAlwaysOnTop()) {
        lyricWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      }
      lyricWindow.moveTop()
    }
  }, 2000)

  lyricWindow.on('moved', () => {
    if (!lyricWindow || lyricWindow.isDestroyed()) return
    const [nx, ny] = lyricWindow.getPosition()
    currentLyricSettings = { ...currentLyricSettings, x: nx, y: ny }
    saveDesktopSettings(app.getPath('userData'), { closeAction, lyric: currentLyricSettings })
  })

  lyricWindow.on('resize', () => {
    if (!lyricWindow || lyricWindow.isDestroyed() || currentLyricSettings.locked || isMovingLyricWindow) return
    lyricWindow.webContents.send('desktop:lyric-resizing')
  })

  lyricWindow.on('will-resize', () => {
    if (!lyricWindow || lyricWindow.isDestroyed() || currentLyricSettings.locked || isMovingLyricWindow) return
    lyricWindow.webContents.send('desktop:lyric-resizing')
  })

  lyricWindow.on('resized', () => {
    if (!lyricWindow || lyricWindow.isDestroyed() || isMovingLyricWindow) return
    const [nw, nh] = lyricWindow.getSize()
    currentLyricSettings = { ...currentLyricSettings, width: nw, height: nh }
    saveDesktopSettings(app.getPath('userData'), { closeAction, lyric: currentLyricSettings })
  })

  lyricWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      applyLyricSettings({ enabled: false }, app.getPath('userData'))
    }
  })

  lyricWindow.webContents.on('did-finish-load', () => {
    if (!lyricWindow || lyricWindow.isDestroyed()) return
    lyricWindow.webContents.send('desktop:lyric-settings-update', currentLyricSettings)
    if (currentLyricData) {
      lyricWindow.webContents.send('desktop:lyric-update', currentLyricData)
    }
  })

  lyricWindow.loadURL(`http://localhost:${port}/desktop-lyric.html`)

  if (currentLyricSettings.enabled) {
    lyricWindow.once('ready-to-show', () => {
      lyricWindow?.showInactive()
      lyricWindow?.setAlwaysOnTop(true, 'screen-saver', 1)
      lyricWindow?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      lyricWindow?.moveTop()
    })
  }
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
  currentLyricSettings = settings.lyric ?? { ...DEFAULT_LYRIC_SETTINGS }
  currentShortcuts = loadShortcuts(userData)

  const preloadPath = getPreloadPath()

  const appIcon = nativeImage.createFromDataURL(APP_ICON_DATA_URL)

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production'

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '星之声 ⭐ Sena Music',
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

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      window.setFullScreen(!window.isFullScreen())
      event.preventDefault()
      return
    }

    if (isDev && input.type === 'keyDown') {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    }
  })

  if (!isDev) {
    window.webContents.on('devtools-opened', () => {
      window.webContents.closeDevTools()
    })
  }

  // Intercept window.open and <a target="_blank"> to open in default system browser
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Prevent renderer from navigating away to external websites within the electron window
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        if (!parsed.hostname.includes('localhost') && !parsed.hostname.includes('127.0.0.1')) {
          event.preventDefault()
          shell.openExternal(navigationUrl)
        }
      }
    } catch {
      // ignore invalid URLs
    }
  })

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

    event.preventDefault()
    const result = await dialog.showMessageBox(window, {
      type: 'question',
      title: '星之声音乐',
      message: '关闭星奏',
      detail: '请选择关闭窗口时的操作：',
      buttons: ['最小化到系统托盘', '直接退出程序', '取消'],
      defaultId: 0,
      cancelId: 2,
      checkboxLabel: '记住我的选择，不再询问',
      checkboxChecked: false,
      noLink: true
    })

    if (result.response === 2) {
      return
    }

    const remember = result.checkboxChecked
    if (result.response === 0) {
      if (remember) {
        closeAction = 'tray'
        saveDesktopSettings(userData, { closeAction })
        window.webContents.send('desktop:close-action-changed', closeAction)
      }
      window.hide()
    } else if (result.response === 1) {
      if (remember) {
        closeAction = 'quit'
        saveDesktopSettings(userData, { closeAction })
      }
      isQuitting = true
      app.quit()
    }
  })

  window.on('focus', () => {
    if (currentLyricSettings.enabled && lyricWindow && !lyricWindow.isDestroyed()) {
      lyricWindow.setAlwaysOnTop(true, 'screen-saver', 1)
      lyricWindow.moveTop()
    }
  })

  setupTray(window)
  setupIpcHandlers(userData)
  registerAllShortcuts(window, currentShortcuts)

  try {
    const { CONFIG } = await import('../../server/config')
    const { bootstrap } = await import('../../server/app')
    const { port } = await bootstrap(CONFIG.port)
    createLyricWindow(preloadPath, port)
    await window.loadURL(`http://localhost:${port}`)
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
    if (lyricWindow && !lyricWindow.isDestroyed()) lyricWindow.destroy()
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
