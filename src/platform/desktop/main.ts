import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

function preparePackagedEnvironment(): void {
  const userData = app.getPath('userData')
  mkdirSync(userData, { recursive: true })
  const configFile = join(userData, 'music.toml')
  if (!existsSync(configFile)) copyFileSync(join(process.resourcesPath, 'music.toml'), configFile)
  process.chdir(userData)
  process.env.NODE_ENV = 'production'
  process.env.SENA_ASSETS_DIR = join(process.resourcesPath, 'dist')
}

let mainWindow: BrowserWindow | undefined

async function createWindow(): Promise<BrowserWindow> {
  if (app.isPackaged) preparePackagedEnvironment()
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Sena Music',
    show: false
  })
  window.setMenu(null)
  window.once('ready-to-show', () => window.show())
  if (!app.isPackaged)
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        window.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
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
  app.setAppUserModelId('com.himeno-sena.music')
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore()
    mainWindow?.focus()
  })
  app.whenReady().then(async () => {
    mainWindow = await createWindow()
  })
  app.on('window-all-closed', () => app.quit())
} else app.quit()
