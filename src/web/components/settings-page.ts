import './theme-toggle'
import './toast'
import { html, type TemplateResult } from 'lit-html'
import { batch, defineComponent, State } from '@/romi/web'
import type { Settings } from '../../common/types'
import { httpClient } from '../service/client'
import {
  type CloseAction,
  DEFAULT_DESKTOP_SHORTCUTS,
  type DesktopShortcut,
  getDesktopBridge,
  isDesktopApp
} from '../service/desktop'
import {
  applyColorScheme,
  applyTheme,
  type ColorScheme,
  getEffectiveTheme,
  getStoredColorScheme,
  getStoredTheme,
  initTheme,
  THEME_COLORS,
  type Theme
} from '../service/theme'
import { Cache } from '../utils/cache'
import { getAppRoute } from '../utils/router'
import { showToast } from './toast'

defineComponent(
  'settings-page',
  {
    loading: State(true),
    saving: State(false),
    playlistId: State(0),
    cacheMaxSize: State(0),
    apiBaseUrl: State(''),
    initial: State<Settings>({ playlistId: 0, cacheMaxSize: 0 }),
    isDark: State(getEffectiveTheme() === 'dark'),
    autoNextOnError: State(true),
    autoMatchBiliOnError: State(true),
    colorScheme: State<ColorScheme>(getStoredColorScheme()),
    theme: State<Theme>('auto'),
    cacheSize: State(0),
    cachePath: State(''),
    cleaningCache: State(false),
    visualizerEnabled: State(true),
    isDesktop: State(isDesktopApp()),
    closeAction: State<CloseAction>('ask'),
    closeToTray: State(true),
    desktopShortcuts: State<DesktopShortcut[]>(isDesktopApp() ? [...DEFAULT_DESKTOP_SHORTCUTS] : []),
    recordingActionId: State<string | null>(null)
  },
  {
    useGlobalStyles: true,
    styles: /* css */ `
      :host {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        width: 100%;
      }
    `,
    connectedCallback: (host): (() => void) => {
      initTheme()
      host.apiBaseUrl = Cache.get<string>('api-base-url').unwrapOr('')
      host.autoNextOnError = Cache.get<boolean>('auto-next-on-error').unwrapOr(true)
      host.autoMatchBiliOnError = Cache.get<boolean>('auto-match-bili-on-error').unwrapOr(true)
      host.visualizerEnabled = Cache.get<boolean>('visualizer-enabled').unwrapOr(true)
      host.colorScheme = getStoredColorScheme()
      host.theme = getStoredTheme()

      const cachedPlaylistId = Cache.get<number>('server-playlist-id')
      const cachedCacheMaxSize = Cache.get<number>('server-cache-max-size')
      const hasCached = cachedPlaylistId.isJust() && cachedCacheMaxSize.isJust()
      if (hasCached) {
        const cachedSettings = {
          playlistId: cachedPlaylistId.value,
          cacheMaxSize: cachedCacheMaxSize.value
        }
        host.initial = cachedSettings
        host.playlistId = cachedSettings.playlistId
        host.cacheMaxSize = cachedSettings.cacheMaxSize
        host.loading = false
      } else {
        host.loading = true
      }

      httpClient
        .getSettings()
        .then((result) =>
          result.match({
            Right: (settings) => {
              host.initial = settings
              host.playlistId = settings.playlistId
              host.cacheMaxSize = settings.cacheMaxSize
              Cache.set('server-playlist-id', settings.playlistId, 86400 * 30)
              Cache.set('server-cache-max-size', settings.cacheMaxSize, 86400 * 30)
            },
            Left: ({ error }) => {
              if (!hasCached) {
                showToast(`加载设置失败：${error}`, 'error')
              }
            }
          })
        )
        .finally(() => {
          host.loading = false
        })

      const loadCacheInfo = (): void => {
        httpClient.getCacheInfo().then((result) =>
          result.match({
            Right: (info) => {
              batch(() => {
                host.cacheSize = info.sizeBytes
                host.cachePath = info.path
              })
            },
            Left: ({ error }) => {
              if (getAppRoute() === 'settings') {
                showToast(`加载缓存信息失败：${error}`, 'error')
              }
            }
          })
        )
      }

      loadCacheInfo()

      const handleRouteChange = (): void => {
        if (getAppRoute() === 'settings') {
          loadCacheInfo()
        }
      }

      const handleThemeChange = (e: Event): void => {
        const detail = (e as CustomEvent<{ theme: string; effective: 'light' | 'dark' }>).detail
        host.isDark = detail.effective === 'dark'
        host.theme = detail.theme as Theme
      }
      document.addEventListener('theme-change', handleThemeChange)
      window.addEventListener('hashchange', handleRouteChange)
      window.addEventListener('popstate', handleRouteChange)

      const initDesktopConfig = (): void => {
        if (isDesktopApp()) {
          host.isDesktop = true
          if (host.desktopShortcuts.length === 0) {
            host.desktopShortcuts = [...DEFAULT_DESKTOP_SHORTCUTS]
          }
          const bridge = getDesktopBridge()
          if (bridge) {
            bridge.getCloseAction?.().then((action) => {
              if (action) host.closeAction = action
            })
            bridge.getCloseToTray().then((val) => {
              host.closeToTray = val
            })
            bridge.getShortcuts().then((list) => {
              if (list && list.length > 0) {
                host.desktopShortcuts = list
              }
            })
            bridge.onCloseActionChanged?.((action) => {
              host.closeAction = action
            })
          }
        }
      }

      const handleDesktopReady = (): void => {
        initDesktopConfig()
      }
      window.addEventListener('sena-desktop-ready', handleDesktopReady)

      if (isDesktopApp()) {
        host.isDesktop = true
        initDesktopConfig()
        const timer = setInterval(() => {
          if (getDesktopBridge()) {
            initDesktopConfig()
            clearInterval(timer)
          }
        }, 100)
        setTimeout(() => clearInterval(timer), 5000)
      }

      const handleShortcutKeyDown = async (e: KeyboardEvent): Promise<void> => {
        if (!host.recordingActionId) return
        e.preventDefault()
        e.stopPropagation()

        if (e.key === 'Escape') {
          host.recordingActionId = null
          return
        }

        const bridge = getDesktopBridge()
        if (!bridge) return

        if (e.key === 'Backspace' || e.key === 'Delete') {
          const res = await bridge.setShortcut(host.recordingActionId, '', false)
          if (res.success) {
            host.desktopShortcuts = await bridge.getShortcuts()
            showToast('快捷键已清除', 'info')
          }
          host.recordingActionId = null
          return
        }

        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

        const parts: string[] = []
        if (e.ctrlKey) parts.push('CommandOrControl')
        if (e.altKey) parts.push('Alt')
        if (e.shiftKey) parts.push('Shift')
        if (e.metaKey && !e.ctrlKey) parts.push('Super')

        let keyName = e.code
        if (keyName.startsWith('Key')) keyName = keyName.slice(3)
        else if (keyName.startsWith('Digit')) keyName = keyName.slice(5)
        else if (keyName === 'Space') keyName = 'Space'
        else if (keyName.startsWith('Arrow')) keyName = keyName.slice(5)
        else keyName = e.key.toUpperCase()

        const accelerator = [...parts, keyName].join('+')

        const check = await bridge.checkShortcut(host.recordingActionId, accelerator)
        if (!check.success) {
          showToast(check.error || '快捷键冲突或不合法', 'error')
          return
        }

        const saveRes = await bridge.setShortcut(host.recordingActionId, accelerator, true)
        if (saveRes.success) {
          host.desktopShortcuts = await bridge.getShortcuts()
          showToast('快捷键已更新', 'success')
          host.recordingActionId = null
        } else {
          showToast(saveRes.error || '保存快捷键失败', 'error')
        }
      }

      window.addEventListener('keydown', handleShortcutKeyDown, true)

      return () => {
        window.removeEventListener('sena-desktop-ready', handleDesktopReady)
        document.removeEventListener('theme-change', handleThemeChange)
        window.removeEventListener('hashchange', handleRouteChange)
        window.removeEventListener('popstate', handleRouteChange)
        window.removeEventListener('keydown', handleShortcutKeyDown, true)
      }
    },
    render: (host): TemplateResult => {
      const changed = host.playlistId !== host.initial.playlistId || host.cacheMaxSize !== host.initial.cacheMaxSize

      const save = (): void => {
        Cache.set('api-base-url', host.apiBaseUrl.trim(), 86400 * 365)
        if (!changed) return void showToast('设置已保存', 'success')
        host.saving = true
        httpClient
          .setSettings({ playlistId: host.playlistId, cacheMaxSize: host.cacheMaxSize })
          .then((result) =>
            result.match({
              Right: (settings) => {
                host.initial = settings
                Cache.set('server-playlist-id', settings.playlistId, 86400 * 30)
                Cache.set('server-cache-max-size', settings.cacheMaxSize, 86400 * 30)
                showToast('设置已保存', 'success')
              },
              Left: ({ error }) => showToast(`保存失败：${error}`, 'error')
            })
          )
          .finally(() => {
            host.saving = false
          })
      }

      const themeOptions: Array<{ value: Theme; label: string }> = [
        { value: 'light', label: '亮色' },
        { value: 'dark', label: '暗色' },
        { value: 'auto', label: '跟随系统' }
      ]

      const activeColor = THEME_COLORS.find((c) => c.id === host.colorScheme)
      const currentColor = (host.isDark ? activeColor?.dark : activeColor?.light) || 'var(--lx-accent)'

      const colorOptions = THEME_COLORS.map((c) => ({
        value: c.id,
        label: c.name,
        color: host.isDark ? c.dark : c.light
      }))

      return html`
        <div class="flex flex-col flex-1 h-full min-h-0 bg-[var(--lx-main)] text-[var(--lx-text)] font-sans overflow-hidden">
          <main class="flex-1 flex flex-col min-w-0 min-h-0">
            <div class="flex-none flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--lx-border)] bg-[var(--lx-bg-alt)]">
              <span class="font-bold text-sm">设置</span>
              <theme-toggle></theme-toggle>
            </div>

            <div class="flex-1 overflow-y-auto no-scrollbar min-h-0 p-6">
              ${
                host.loading
                  ? html`<div class="flex items-center justify-center h-full opacity-30 gap-2">
                      <div class="i-carbon-renew animate-spin text-2xl"></div>
                      <span class="text-sm">加载中...</span>
                    </div>`
                  : html`
                    <div class="max-w-md flex flex-col gap-5">
                      <label class="flex flex-col gap-1.5">
                        <span class="text-xs font-bold opacity-70">网易云歌单 ID</span>
                        <input
                          type="number"
                          .value=${host.playlistId.toString()}
                          @input=${(e: Event) => (host.playlistId = Number((e.target as HTMLInputElement).value))}
                        />
                      </label>

                      <label class="flex flex-col gap-1.5">
                        <span class="text-xs font-bold opacity-70">缓存最大容量 (MB)</span>
                        <input
                          type="number"
                          .value=${host.cacheMaxSize.toString()}
                          @input=${(e: Event) => (host.cacheMaxSize = Number((e.target as HTMLInputElement).value))}
                        />
                      </label>

                      <label class="flex flex-col gap-1.5">
                        <span class="text-xs font-bold opacity-70">额外请求地址（可选）</span>
                        <input
                          type="text"
                          placeholder="http://localhost:2000"
                          .value=${host.apiBaseUrl}
                          @input=${(e: Event) => (host.apiBaseUrl = (e.target as HTMLInputElement).value)}
                        />
                        <span class="text-[11px] opacity-40">留空则使用当前站点地址，修改后需刷新页面生效</span>
                      </label>

                      <button
                        @click=${() => save()}
                        class="mt-2 flex items-center justify-center gap-2 px-4 py-2.5 rounded text-sm bg-[var(--lx-accent)] text-white w-fit"
                      >
                        <div class="i-carbon-save ${host.saving ? 'animate-pulse' : ''}"></div>
                        <span>${host.saving ? '保存中...' : '保存设置'}</span>
                      </button>

                      <div class="border-t border-[var(--lx-border)] pt-5 mt-2">
                        <span class="text-xs font-bold opacity-50 uppercase tracking-wider">缓存管理</span>
                      </div>
                      
                      <div class="flex flex-col gap-3 text-sm">
                        <div class="flex flex-col gap-1">
                          <span class="text-xs font-bold opacity-70">缓存目录</span>
                          <span class="font-mono text-[11px] opacity-80 break-all select-text bg-[var(--lx-bg-alt)] p-2 rounded">${host.cachePath || '-'}</span>
                        </div>
                        <div class="flex flex-col gap-1">
                          <span class="text-xs font-bold opacity-70">当前大小</span>
                          <span class="opacity-80">${host.cachePath ? `${(host.cacheSize / 1024 / 1024).toFixed(2)} MB` : '-'}</span>
                        </div>
                        <button
                          @click=${() => {
                            if (host.cleaningCache) return
                            host.cleaningCache = true
                            httpClient
                              .cleanCache()
                              .then((result) => {
                                result.match({
                                  Right: (info) => {
                                    batch(() => {
                                      host.cacheSize = info.sizeBytes
                                      host.cachePath = info.path
                                    })
                                    showToast('清理成功', 'success')
                                  },
                                  Left: ({ error }) => showToast(`清理失败：${error}`, 'error')
                                })
                              })
                              .finally(() => {
                                host.cleaningCache = false
                              })
                          }}
                          class="mt-2 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--lx-bg-alt)] hover:bg-[var(--lx-hover)] border border-solid border-[var(--lx-border)] text-[var(--lx-text)] shadow-sm hover:shadow transition-all w-fit cursor-pointer active:scale-95 disabled:opacity-50"
                        >
                          <div class="i-carbon-trash-can text-sm opacity-70 ${host.cleaningCache ? 'animate-pulse' : ''}"></div>
                          <span>${host.cleaningCache ? '清理中...' : '一键清理'}</span>
                        </button>
                      </div>

                      <div class="border-t border-[var(--lx-border)] pt-5 mt-2">
                        <span class="text-xs font-bold opacity-50 uppercase tracking-wider">外观与播放</span>
                      </div>

                      <label class="flex items-center justify-between gap-3 cursor-pointer">
                        <div class="flex flex-col gap-0.5">
                          <span class="text-xs font-bold opacity-70">网易云源播放失败自动尝试匹配 B站音源</span>
                          <span class="text-[11px] opacity-40">播放遇到版权或 VIP 限制失败时，自动搜索 B站匹配最佳音源并应用</span>
                        </div>
                        <input
                          type="checkbox"
                          class="w-4 h-4 cursor-pointer"
                          .checked=${host.autoMatchBiliOnError}
                          @change=${(e: Event) => {
                            host.autoMatchBiliOnError = (e.target as HTMLInputElement).checked
                            Cache.set('auto-match-bili-on-error', host.autoMatchBiliOnError, 86400 * 365)
                          }}
                        />
                      </label>

                      <label class="flex items-center justify-between gap-3 cursor-pointer">
                        <span class="text-xs font-bold opacity-70">播放失败时自动切换到下一首</span>
                        <input
                          type="checkbox"
                          class="w-4 h-4 cursor-pointer"
                          .checked=${host.autoNextOnError}
                          @change=${(e: Event) => {
                            host.autoNextOnError = (e.target as HTMLInputElement).checked
                            Cache.set('auto-next-on-error', host.autoNextOnError, 86400 * 365)
                          }}
                        />
                      </label>

                      <label class="flex items-center justify-between gap-3 cursor-pointer">
                        <div class="flex flex-col gap-0.5">
                          <span class="text-xs font-bold opacity-70">全屏音频可视化背景</span>
                          <span class="text-[11px] opacity-40">在全屏播放器背景显示随音乐律动的动态光影效果</span>
                        </div>
                        <input
                          type="checkbox"
                          class="w-4 h-4 cursor-pointer"
                          .checked=${host.visualizerEnabled}
                          @change=${(e: Event) => {
                            host.visualizerEnabled = (e.target as HTMLInputElement).checked
                            Cache.set('visualizer-enabled', host.visualizerEnabled, 86400 * 365)
                            document.dispatchEvent(
                              new CustomEvent('visualizer-toggle', { detail: { enabled: host.visualizerEnabled } })
                            )
                          }}
                        />
                      </label>

                      <label class="flex flex-col gap-1.5">
                        <span class="text-xs font-bold opacity-70">主题</span>
                        <select
                          @change=${(e: Event) => {
                            const value = (e.target as HTMLSelectElement).value as Theme
                            host.theme = value
                            applyTheme(value)
                          }}
                        >
                          ${themeOptions.map(
                            (opt) =>
                              html`<option value=${opt.value} ?selected=${host.theme === opt.value}>${opt.label}</option>`
                          )}
                        </select>
                      </label>

                      <label class="flex flex-col gap-1.5">
                        <span class="text-xs font-bold opacity-70">配色方案</span>
                        <select
                          style="color: ${currentColor}; font-weight: 600;"
                          @change=${(e: Event) => {
                            const value = (e.target as HTMLSelectElement).value as ColorScheme
                            host.colorScheme = value
                            applyColorScheme(value)
                          }}
                        >
                          ${colorOptions.map(
                            (opt) =>
                              html`<option
                                value=${opt.value}
                                style="color: ${opt.color}; font-weight: 600; background-color: var(--lx-bg-alt);"
                                ?selected=${host.colorScheme === opt.value}
                              >
                                ● ${opt.label}
                              </option>`
                          )}
                        </select>
                      </label>

                      ${
                        host.isDesktop
                          ? html`
                            <div class="border-t border-[var(--lx-border)] pt-5 mt-2">
                              <span class="text-xs font-bold opacity-50 uppercase tracking-wider">桌面设置</span>
                            </div>

                            <div class="flex flex-col gap-2">
                              <div class="flex flex-col gap-0.5">
                                <span class="text-xs font-bold opacity-70">关闭主面板时的操作</span>
                                <span class="text-[11px] opacity-40">点击右上角关闭按钮时的默认行为（可在弹窗中勾选“记住选择”或在此修改）</span>
                              </div>
                              <div class="grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  class="text-xs py-2 px-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
                                    host.closeAction === 'ask'
                                      ? 'bg-[var(--lx-accent)] text-white border-[var(--lx-accent)] font-semibold'
                                      : 'bg-[var(--lx-bg-alt)] hover:bg-[var(--lx-hover)] border-[var(--lx-border)] text-[var(--lx-text)]'
                                  }"
                                  @click=${async () => {
                                    host.closeAction = 'ask'
                                    const bridge = getDesktopBridge()
                                    if (bridge?.setCloseAction) {
                                      await bridge.setCloseAction('ask')
                                      showToast('已设为：关闭时每次询问', 'info')
                                    }
                                  }}
                                >
                                  每次询问
                                </button>
                                <button
                                  type="button"
                                  class="text-xs py-2 px-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
                                    host.closeAction === 'tray'
                                      ? 'bg-[var(--lx-accent)] text-white border-[var(--lx-accent)] font-semibold'
                                      : 'bg-[var(--lx-bg-alt)] hover:bg-[var(--lx-hover)] border-[var(--lx-border)] text-[var(--lx-text)]'
                                  }"
                                  @click=${async () => {
                                    host.closeAction = 'tray'
                                    const bridge = getDesktopBridge()
                                    if (bridge?.setCloseAction) {
                                      await bridge.setCloseAction('tray')
                                      showToast('已设为：最小化到托盘并在后台运行', 'info')
                                    }
                                  }}
                                >
                                  最小化到托盘
                                </button>
                                <button
                                  type="button"
                                  class="text-xs py-2 px-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
                                    host.closeAction === 'quit'
                                      ? 'bg-[var(--lx-accent)] text-white border-[var(--lx-accent)] font-semibold'
                                      : 'bg-[var(--lx-bg-alt)] hover:bg-[var(--lx-hover)] border-[var(--lx-border)] text-[var(--lx-text)]'
                                  }"
                                  @click=${async () => {
                                    host.closeAction = 'quit'
                                    const bridge = getDesktopBridge()
                                    if (bridge?.setCloseAction) {
                                      await bridge.setCloseAction('quit')
                                      showToast('已设为：直接退出程序', 'info')
                                    }
                                  }}
                                >
                                  直接退出程序
                                </button>
                              </div>
                            </div>

                            <div class="flex flex-col gap-2 mt-1">
                              <div class="flex items-center justify-between">
                                <div class="flex flex-col gap-0.5">
                                  <span class="text-xs font-bold opacity-70">全局快捷键</span>
                                  <span class="text-[11px] opacity-40">在其他窗口或全屏程序下依然可盲操控制播放（支持自定义与冲突检测）</span>
                                </div>
                                <button
                                  type="button"
                                  class="text-xs px-2.5 py-1 rounded bg-[var(--lx-bg-alt)] hover:bg-[var(--lx-hover)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors cursor-pointer"
                                  @click=${async () => {
                                    const bridge = getDesktopBridge()
                                    if (bridge) {
                                      const reset = await bridge.resetShortcuts()
                                      if (reset) {
                                        host.desktopShortcuts = reset
                                        host.recordingActionId = null
                                        showToast('全局快捷键已恢复默认', 'success')
                                      }
                                    }
                                  }}
                                >
                                  恢复默认
                                </button>
                              </div>

                              <div class="space-y-2 mt-1">
                                ${host.desktopShortcuts.map((item) => {
                                  const isRecording = host.recordingActionId === item.id
                                  const formatAccelerator = (acc: string): string => {
                                    if (!acc) return '未设置'
                                    return acc
                                      .replace(/CommandOrControl/gi, 'Ctrl')
                                      .replace(/Control/gi, 'Ctrl')
                                      .replace(/\+/g, ' + ')
                                  }
                                  return html`
                                    <div
                                      class="flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
                                        isRecording
                                          ? 'border-[var(--lx-accent)] bg-[var(--lx-hover)]'
                                          : 'border-[var(--lx-border)] bg-[var(--lx-bg-alt)]'
                                      }"
                                    >
                                      <div class="flex flex-col gap-0.5 min-w-0 pr-2">
                                        <span class="text-xs font-semibold text-[var(--lx-text)]">${item.name}</span>
                                        <span class="text-[11px] font-mono ${isRecording ? 'text-[var(--lx-accent)] font-medium animate-pulse' : 'opacity-60'}">
                                          ${
                                            isRecording
                                              ? '请在键盘上按下新快捷键组合（Esc取消，Backspace清除）...'
                                              : formatAccelerator(item.currentKey)
                                          }
                                        </span>
                                      </div>
                                      <div class="flex items-center gap-2 flex-none">
                                        <input
                                          type="checkbox"
                                          class="w-4 h-4 cursor-pointer"
                                          title="${item.enabled ? '已启用该快捷键' : '已禁用该快捷键'}"
                                          .checked=${item.enabled}
                                          @change=${async (e: Event) => {
                                            const checked = (e.target as HTMLInputElement).checked
                                            const bridge = getDesktopBridge()
                                            if (bridge) {
                                              const res = await bridge.setShortcut(item.id, item.currentKey, checked)
                                              if (res.success) {
                                                host.desktopShortcuts = await bridge.getShortcuts()
                                                showToast(
                                                  `已${checked ? '启用' : '禁用'}「${item.name}」快捷键`,
                                                  'info'
                                                )
                                              } else {
                                                showToast(res.error || '设置失败', 'error')
                                              }
                                            }
                                          }}
                                        />
                                        <button
                                          type="button"
                                          class="text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                                            isRecording
                                              ? 'bg-[var(--lx-accent)] text-white border-[var(--lx-accent)]'
                                              : 'bg-[var(--lx-main)] hover:bg-[var(--lx-hover)] border-[var(--lx-border)] text-[var(--lx-text)]'
                                          }"
                                          @click=${() => {
                                            host.recordingActionId = isRecording ? null : item.id
                                          }}
                                        >
                                          ${isRecording ? '取消' : '修改'}
                                        </button>
                                      </div>
                                    </div>
                                  `
                                })}
                              </div>
                            </div>
                          `
                          : ''
                      }
                    </div>
                  `
              }
            </div>
          </main>
        </div>
      `
    }
  }
)
