import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type BrowserWindow, globalShortcut } from 'electron'

export interface ShortcutItem {
  id: string
  name: string
  defaultKey: string
  currentKey: string
  enabled: boolean
}

export const DEFAULT_SHORTCUTS: ShortcutItem[] = [
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

const SHORTCUTS_FILENAME = 'desktop-shortcuts.json'

export function loadShortcuts(userDataDir: string): ShortcutItem[] {
  const filePath = join(userDataDir, SHORTCUTS_FILENAME)
  if (!existsSync(filePath)) return [...DEFAULT_SHORTCUTS]

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const saved: Partial<ShortcutItem>[] = JSON.parse(raw)
    return DEFAULT_SHORTCUTS.map((def) => {
      const match = saved.find((s) => s.id === def.id)
      if (!match) return { ...def }
      return {
        ...def,
        currentKey: typeof match.currentKey === 'string' ? match.currentKey : def.defaultKey,
        enabled: typeof match.enabled === 'boolean' ? match.enabled : def.enabled
      }
    })
  } catch (err) {
    console.error('Failed to parse desktop shortcuts configuration:', err)
    return [...DEFAULT_SHORTCUTS]
  }
}

export function saveShortcuts(userDataDir: string, shortcuts: ShortcutItem[]): void {
  const filePath = join(userDataDir, SHORTCUTS_FILENAME)
  try {
    writeFileSync(filePath, JSON.stringify(shortcuts, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save desktop shortcuts configuration:', err)
  }
}

export function checkShortcutConflict(
  actionId: string,
  accelerator: string,
  shortcuts: ShortcutItem[]
): { success: boolean; error?: string } {
  const cleanKey = accelerator.trim()
  if (!cleanKey) return { success: true }

  // 1. 检查是否与当前应用内其他启用的快捷键冲突
  const internalConflict = shortcuts.find(
    (s) => s.id !== actionId && s.enabled && s.currentKey.trim().toLowerCase() === cleanKey.toLowerCase()
  )
  if (internalConflict) {
    return { success: false, error: `与已有快捷键「${internalConflict.name}」冲突` }
  }

  // 2. 检查是否已被其他应用或系统占用
  const isAlreadyRegistered = globalShortcut.isRegistered(cleanKey)
  const isCurrentActionKey = shortcuts.find(
    (s) => s.id === actionId && s.enabled && s.currentKey.trim().toLowerCase() === cleanKey.toLowerCase()
  )
  if (isAlreadyRegistered && !isCurrentActionKey) {
    return { success: false, error: '该快捷键已被系统或其他应用程序占用' }
  }

  // 3. 尝试在 Electron 中预注册测试其合法性
  try {
    const testRegistered = globalShortcut.register(cleanKey, () => {})
    if (!testRegistered) {
      return { success: false, error: '快捷键注册失败，可能不合法或与系统保留键冲突' }
    }
    globalShortcut.unregister(cleanKey)
  } catch (err) {
    return { success: false, error: `快捷键格式不合法：${(err as Error).message || String(err)}` }
  }

  return { success: true }
}

export function registerAllShortcuts(mainWindow: BrowserWindow | undefined, shortcuts: ShortcutItem[]): void {
  globalShortcut.unregisterAll()

  for (const item of shortcuts) {
    if (!item.enabled || !item.currentKey.trim()) continue

    try {
      const ok = globalShortcut.register(item.currentKey.trim(), () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('player-command', item.id)
        }
      })
      if (!ok) {
        console.warn(`Failed to register global shortcut for ${item.id}: ${item.currentKey}`)
      }
    } catch (err) {
      console.warn(`Error registering global shortcut for ${item.id}:`, err)
    }
  }
}
