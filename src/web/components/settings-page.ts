import './theme-toggle'
import './toast'
import { html, type TemplateResult } from 'lit-html'
import { batch, defineComponent, State } from '@/romi/web'
import type { Settings } from '../../common/types'
import { httpClient } from '../service/client'
import {
  type CloseAction,
  DEFAULT_DESKTOP_LYRIC_SETTINGS,
  DEFAULT_DESKTOP_SHORTCUTS,
  type DesktopLyricSettings,
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
import { Storage } from '../utils/storage'
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
    coverColorBgEnabled: State(true),
    isDesktop: State(isDesktopApp()),
    closeAction: State<CloseAction>('ask'),
    desktopShortcuts: State<DesktopShortcut[]>(isDesktopApp() ? [...DEFAULT_DESKTOP_SHORTCUTS] : []),
    desktopLyricSettings: State<DesktopLyricSettings>(DEFAULT_DESKTOP_LYRIC_SETTINGS),
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
      :host([hidden]),
      :host(.hidden) {
        display: none !important;
      }
    `,
    connectedCallback: (host): (() => void) => {
      initTheme()
      host.apiBaseUrl = Storage.get<string>('api-base-url').unwrapOr('')
      host.autoNextOnError = Storage.get<boolean>('auto-next-on-error').unwrapOr(true)
      host.autoMatchBiliOnError = Storage.get<boolean>('auto-match-bili-on-error').unwrapOr(true)
      host.visualizerEnabled = Storage.get<boolean>('visualizer-enabled').unwrapOr(true)
      host.coverColorBgEnabled = Storage.get<boolean>('cover-color-bg-enabled').unwrapOr(true)
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

      let lastCacheInfoTime = 0
      const loadCacheInfo = (force = false): void => {
        const now = Date.now()
        if (!force && host.cacheSize > 0 && now - lastCacheInfoTime < 30000) {
          return
        }
        lastCacheInfoTime = now
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
            bridge.getShortcuts().then((list) => {
              if (list && list.length > 0) {
                host.desktopShortcuts = list
              }
            })
            bridge.onCloseActionChanged?.((action) => {
              host.closeAction = action
            })
            bridge.getLyricSettings?.().then((s) => {
              if (s) host.desktopLyricSettings = s
            })
            bridge.onLyricSettingsUpdate?.((s) => {
              if (s) host.desktopLyricSettings = s
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
        Storage.set('api-base-url', host.apiBaseUrl.trim())
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

      const updateLyricSetting = async (partial: Partial<DesktopLyricSettings>): Promise<void> => {
        host.desktopLyricSettings = { ...host.desktopLyricSettings, ...partial }
        const bridge = getDesktopBridge()
        if (bridge?.setLyricSettings) {
          const res = await bridge.setLyricSettings(partial)
          if (res) host.desktopLyricSettings = res
        }
      }

      const fontOptions = [
        { value: 'system-ui, -apple-system, sans-serif', label: '系统默认' },
        { value: '"Microsoft YaHei", sans-serif', label: '微软雅黑' },
        { value: '"Source Han Sans CN", "Noto Sans SC", sans-serif', label: '思源黑体' },
        { value: '"PingFang SC", "STHeiti", sans-serif', label: '苹方 / 华文黑体' },
        { value: '"STKaiti", "KaiTi", serif', label: '楷体' },
        { value: 'custom', label: '自定义字体...' }
      ]

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
                    <div class="max-w-2xl flex flex-col gap-5">
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
                          placeholder="http://localhost:6120"
                          .value=${host.apiBaseUrl}
                          @input=${(e: Event) => (host.apiBaseUrl = (e.target as HTMLInputElement).value)}
                        />
                        <span class="text-[11px] opacity-40">留空在移动端默认连接 http://localhost:6120，修改后保存生效</span>
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

                      <label class="flex items-center justify-between gap-4 cursor-pointer select-none">
                        <div class="flex-1 min-w-0 flex flex-col gap-0.5 pr-2">
                          <span class="text-xs font-bold opacity-70">网易云源播放失败自动尝试匹配 B站音源</span>
                          <span class="text-[11px] opacity-40 leading-relaxed">播放遇到版权或 VIP 限制失败时，自动搜索 B站匹配最佳音源并应用</span>
                        </div>
                        <input
                          type="checkbox"
                          class="w-4 h-4 shrink-0 cursor-pointer accent-[var(--lx-accent)]"
                          .checked=${host.autoMatchBiliOnError}
                          @change=${(e: Event) => {
                            host.autoMatchBiliOnError = (e.target as HTMLInputElement).checked
                            Storage.set('auto-match-bili-on-error', host.autoMatchBiliOnError)
                          }}
                        />
                      </label>

                      <label class="flex items-center justify-between gap-4 cursor-pointer select-none">
                        <div class="flex-1 min-w-0 flex flex-col gap-0.5 pr-2">
                          <span class="text-xs font-bold opacity-70">播放失败时自动切换到下一首</span>
                        </div>
                        <input
                          type="checkbox"
                          class="w-4 h-4 shrink-0 cursor-pointer accent-[var(--lx-accent)]"
                          .checked=${host.autoNextOnError}
                          @change=${(e: Event) => {
                            host.autoNextOnError = (e.target as HTMLInputElement).checked
                            Storage.set('auto-next-on-error', host.autoNextOnError)
                          }}
                        />
                      </label>

                      <label class="flex items-center justify-between gap-4 cursor-pointer select-none">
                        <div class="flex-1 min-w-0 flex flex-col gap-0.5 pr-2">
                          <span class="text-xs font-bold opacity-70">全屏音频可视化背景</span>
                          <span class="text-[11px] opacity-40 leading-relaxed">在全屏播放器背景显示随音乐律动的动态光影效果</span>
                        </div>
                        <input
                          type="checkbox"
                          class="w-4 h-4 shrink-0 cursor-pointer accent-[var(--lx-accent)]"
                          .checked=${host.visualizerEnabled}
                          @change=${(e: Event) => {
                            host.visualizerEnabled = (e.target as HTMLInputElement).checked
                            Storage.set('visualizer-enabled', host.visualizerEnabled)
                            document.dispatchEvent(
                              new CustomEvent('visualizer-toggle', { detail: { enabled: host.visualizerEnabled } })
                            )
                          }}
                        />
                      </label>

                      <label class="flex items-center justify-between gap-4 cursor-pointer select-none">
                        <div class="flex-1 min-w-0 flex flex-col gap-0.5 pr-2">
                          <span class="text-xs font-bold opacity-70">全屏封面色彩背景</span>
                          <span class="text-[11px] opacity-40 leading-relaxed">在全屏播放器背景根据当前歌曲封面主色调变换氛围色彩</span>
                        </div>
                        <input
                          type="checkbox"
                          class="w-4 h-4 shrink-0 cursor-pointer accent-[var(--lx-accent)]"
                          .checked=${host.coverColorBgEnabled}
                          @change=${(e: Event) => {
                            host.coverColorBgEnabled = (e.target as HTMLInputElement).checked
                            Storage.set('cover-color-bg-enabled', host.coverColorBgEnabled)
                            document.dispatchEvent(
                              new CustomEvent('cover-color-bg-toggle', {
                                detail: { enabled: host.coverColorBgEnabled }
                              })
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
                                          class="w-4 h-4 shrink-0 cursor-pointer accent-[var(--lx-accent)]"
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

                            <div class="flex flex-col gap-3 mt-3 pt-3 border-t border-[var(--lx-border)]">
                              <div class="flex items-center justify-between">
                                <div class="flex flex-col gap-0.5">
                                  <span class="text-xs font-bold opacity-70">桌面歌词</span>
                                  <span class="text-[11px] opacity-40">浮动在桌面上的半透明置顶歌词，支持鼠标穿透锁定与样式自定义</span>
                                </div>
                                <button
                                  type="button"
                                  class="text-xs px-2.5 py-1 rounded bg-[var(--lx-bg-alt)] hover:bg-[var(--lx-hover)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors cursor-pointer"
                                  @click=${() => updateLyricSetting(DEFAULT_DESKTOP_LYRIC_SETTINGS)}
                                >
                                  恢复默认
                                </button>
                              </div>

                              <div class="flex flex-col gap-2.5 bg-[var(--lx-bg-alt)] p-3.5 rounded-lg border border-[var(--lx-border)]">
                                <div class="flex items-center justify-between">
                                  <span class="text-xs font-semibold">开启桌面歌词</span>
                                  <input
                                    type="checkbox"
                                    class="w-4 h-4 cursor-pointer accent-[var(--lx-accent)]"
                                    .checked=${host.desktopLyricSettings.enabled}
                                    @change=${(e: Event) => updateLyricSetting({ enabled: (e.target as HTMLInputElement).checked })}
                                  />
                                </div>

                                <div class="flex items-center justify-between">
                                  <div class="flex flex-col">
                                    <span class="text-xs font-semibold">锁定桌面歌词</span>
                                    <span class="text-[10px] opacity-50">锁定后鼠标点击直接穿透到下层程序，避免影响游戏或日常操作</span>
                                  </div>
                                  <input
                                    type="checkbox"
                                    class="w-4 h-4 cursor-pointer accent-[var(--lx-accent)]"
                                    .checked=${host.desktopLyricSettings.locked}
                                    @change=${(e: Event) => updateLyricSetting({ locked: (e.target as HTMLInputElement).checked })}
                                  />
                                </div>

                                <div class="flex flex-col gap-1.5 pt-1 border-t border-[var(--lx-border)]">
                                  <div class="flex justify-between items-center">
                                    <span class="text-xs font-semibold">字体</span>
                                    <select
                                      class="text-xs py-1 px-2 rounded bg-[var(--lx-main)] border border-[var(--lx-border)] text-[var(--lx-text)]"
                                      @change=${(e: Event) => {
                                        const val = (e.target as HTMLSelectElement).value
                                        if (val !== 'custom') updateLyricSetting({ fontFamily: val })
                                      }}
                                    >
                                      ${fontOptions.map(
                                        (f) =>
                                          html`<option
                                            value=${f.value}
                                            ?selected=${f.value !== 'custom' ? host.desktopLyricSettings.fontFamily === f.value : !fontOptions.slice(0, 5).some((o) => o.value === host.desktopLyricSettings.fontFamily)}
                                          >
                                            ${f.label}
                                          </option>`
                                      )}
                                    </select>
                                  </div>
                                  ${
                                    !fontOptions
                                      .slice(0, 5)
                                      .some((o) => o.value === host.desktopLyricSettings.fontFamily)
                                      ? html`
                                        <input
                                          type="text"
                                          class="text-xs py-1 px-2 rounded bg-[var(--lx-main)] border border-[var(--lx-border)] text-[var(--lx-text)]"
                                          placeholder="请输入自定义字体名称，如 Consolas, 'Fira Code' 等"
                                          .value=${host.desktopLyricSettings.fontFamily}
                                          @change=${(e: Event) => updateLyricSetting({ fontFamily: (e.target as HTMLInputElement).value.trim() })}
                                        />
                                      `
                                      : ''
                                  }
                                </div>

                                <div class="flex flex-col gap-1.5 pt-1">
                                  <div class="flex justify-between items-center text-xs">
                                    <span class="font-semibold">字号大小</span>
                                    <span class="font-mono text-[var(--lx-accent)] font-bold">${host.desktopLyricSettings.fontSize}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="18"
                                    max="56"
                                    step="1"
                                    class="w-full h-1.5 bg-[var(--lx-border)] rounded-lg appearance-none cursor-pointer accent-[var(--lx-accent)]"
                                    .value=${host.desktopLyricSettings.fontSize.toString()}
                                    @input=${(e: Event) => updateLyricSetting({ fontSize: Number((e.target as HTMLInputElement).value) })}
                                  />
                                </div>

                                <div class="flex flex-col gap-1 pt-1">
                                  <span class="text-[11px] font-semibold opacity-80">歌词文字颜色</span>
                                  <div class="flex items-center gap-2">
                                    <input
                                      type="color"
                                      class="w-7 h-7 rounded border border-[var(--lx-border)] cursor-pointer bg-transparent"
                                      .value=${host.desktopLyricSettings.color}
                                      @input=${(e: Event) => updateLyricSetting({ color: (e.target as HTMLInputElement).value })}
                                    />
                                    <span class="text-xs font-mono opacity-60">${host.desktopLyricSettings.color}</span>
                                  </div>
                                </div>

                                <div class="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--lx-border)]">
                                  <div class="flex flex-col gap-1">
                                    <div class="flex justify-between items-center text-xs">
                                      <span class="font-semibold">文字描边粗细</span>
                                      <span class="font-mono text-[var(--lx-accent)] font-bold">${host.desktopLyricSettings.strokeWidth}px</span>
                                    </div>
                                    <input
                                      type="range"
                                      min="0"
                                      max="8"
                                      step="0.5"
                                      class="w-full h-1.5 bg-[var(--lx-border)] rounded-lg appearance-none cursor-pointer accent-[var(--lx-accent)]"
                                      .value=${host.desktopLyricSettings.strokeWidth.toString()}
                                      @input=${(e: Event) => updateLyricSetting({ strokeWidth: Number((e.target as HTMLInputElement).value) })}
                                    />
                                  </div>
                                  <div class="flex flex-col gap-1">
                                    <span class="text-[11px] font-semibold opacity-80">文字描边颜色</span>
                                    <div class="flex items-center gap-2">
                                      <input
                                        type="color"
                                        class="w-7 h-7 rounded border border-[var(--lx-border)] cursor-pointer bg-transparent"
                                        .value=${host.desktopLyricSettings.strokeColor.startsWith('#') ? host.desktopLyricSettings.strokeColor : '#000000'}
                                        @input=${(e: Event) => updateLyricSetting({ strokeColor: (e.target as HTMLInputElement).value })}
                                      />
                                      <input
                                        type="text"
                                        class="text-xs py-0.5 px-1.5 rounded bg-[var(--lx-main)] border border-[var(--lx-border)] font-mono text-[var(--lx-text)] w-24"
                                        .value=${host.desktopLyricSettings.strokeColor}
                                        @change=${(e: Event) => updateLyricSetting({ strokeColor: (e.target as HTMLInputElement).value.trim() })}
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div class="grid grid-cols-2 gap-3 pt-1">
                                  <div class="flex flex-col gap-1">
                                    <div class="flex justify-between items-center text-xs">
                                      <span class="font-semibold">阴影模糊大小</span>
                                      <span class="font-mono text-[var(--lx-accent)] font-bold">${host.desktopLyricSettings.shadowBlur}px</span>
                                    </div>
                                    <input
                                      type="range"
                                      min="0"
                                      max="20"
                                      step="1"
                                      class="w-full h-1.5 bg-[var(--lx-border)] rounded-lg appearance-none cursor-pointer accent-[var(--lx-accent)]"
                                      .value=${host.desktopLyricSettings.shadowBlur.toString()}
                                      @input=${(e: Event) => updateLyricSetting({ shadowBlur: Number((e.target as HTMLInputElement).value) })}
                                    />
                                  </div>
                                  <div class="flex flex-col gap-1">
                                    <span class="text-[11px] font-semibold opacity-80">文字阴影颜色</span>
                                    <div class="flex items-center gap-2">
                                      <input
                                        type="color"
                                        class="w-7 h-7 rounded border border-[var(--lx-border)] cursor-pointer bg-transparent"
                                        .value=${host.desktopLyricSettings.shadowColor.startsWith('#') ? host.desktopLyricSettings.shadowColor : '#000000'}
                                        @input=${(e: Event) => updateLyricSetting({ shadowColor: (e.target as HTMLInputElement).value })}
                                      />
                                      <input
                                        type="text"
                                        class="text-xs py-0.5 px-1.5 rounded bg-[var(--lx-main)] border border-[var(--lx-border)] font-mono text-[var(--lx-text)] w-24"
                                        .value=${host.desktopLyricSettings.shadowColor}
                                        @change=${(e: Event) => updateLyricSetting({ shadowColor: (e.target as HTMLInputElement).value.trim() })}
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div class="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--lx-border)]">
                                  <div class="flex flex-col gap-1">
                                    <div class="flex justify-between items-center text-xs">
                                      <span class="font-semibold">悬浮窗边框宽度</span>
                                      <span class="font-mono text-[var(--lx-accent)] font-bold">${host.desktopLyricSettings.borderWidth}px</span>
                                    </div>
                                    <input
                                      type="range"
                                      min="0"
                                      max="5"
                                      step="1"
                                      class="w-full h-1.5 bg-[var(--lx-border)] rounded-lg appearance-none cursor-pointer accent-[var(--lx-accent)]"
                                      .value=${host.desktopLyricSettings.borderWidth.toString()}
                                      @input=${(e: Event) => updateLyricSetting({ borderWidth: Number((e.target as HTMLInputElement).value) })}
                                    />
                                  </div>
                                  <div class="flex flex-col gap-1">
                                    <span class="text-[11px] font-semibold opacity-80">悬浮窗边框颜色</span>
                                    <div class="flex items-center gap-2">
                                      <input
                                        type="color"
                                        class="w-7 h-7 rounded border border-[var(--lx-border)] cursor-pointer bg-transparent"
                                        .value=${host.desktopLyricSettings.borderColor.startsWith('#') ? host.desktopLyricSettings.borderColor : '#ffffff'}
                                        @input=${(e: Event) => updateLyricSetting({ borderColor: (e.target as HTMLInputElement).value })}
                                      />
                                      <input
                                        type="text"
                                        class="text-xs py-0.5 px-1.5 rounded bg-[var(--lx-main)] border border-[var(--lx-border)] font-mono text-[var(--lx-text)] w-24"
                                        .value=${host.desktopLyricSettings.borderColor}
                                        @change=${(e: Event) => updateLyricSetting({ borderColor: (e.target as HTMLInputElement).value.trim() })}
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div class="flex justify-between items-center pt-1 text-xs">
                                  <span class="font-semibold">悬浮背景颜色</span>
                                  <input
                                    type="text"
                                    class="text-xs py-1 px-2 rounded bg-[var(--lx-main)] border border-[var(--lx-border)] font-mono text-[var(--lx-text)] w-48 text-right"
                                    placeholder="rgba(15, 23, 42, 0.45)"
                                    .value=${host.desktopLyricSettings.backgroundColor}
                                    @change=${(e: Event) => updateLyricSetting({ backgroundColor: (e.target as HTMLInputElement).value.trim() })}
                                  />
                                </div>

                                <div
                                  class="mt-1 p-3 rounded-lg flex flex-col items-center justify-center text-center transition-all"
                                  style="background-color: ${host.desktopLyricSettings.backgroundColor}; border: ${host.desktopLyricSettings.borderWidth}px solid ${host.desktopLyricSettings.borderColor};"
                                >
                                  <span class="text-[10px] opacity-40 uppercase tracking-wider mb-1">实时效果预览</span>
                                  <div
                                    class="font-bold truncate max-w-full"
                                    style="font-family: ${host.desktopLyricSettings.fontFamily}; font-size: ${Math.min(24, host.desktopLyricSettings.fontSize)}px; color: ${host.desktopLyricSettings.color}; paint-order: stroke fill; -webkit-text-stroke: ${host.desktopLyricSettings.strokeWidth}px ${host.desktopLyricSettings.strokeColor}; filter: drop-shadow(0 2px ${host.desktopLyricSettings.shadowBlur}px ${host.desktopLyricSettings.shadowColor});"
                                  >
                                    星之声桌面歌词预览
                                  </div>
                                  <div
                                    class="font-bold truncate max-w-full mt-1.5"
                                    style="font-family: ${host.desktopLyricSettings.fontFamily}; font-size: ${Math.min(24, host.desktopLyricSettings.fontSize)}px; color: ${host.desktopLyricSettings.color}; paint-order: stroke fill; -webkit-text-stroke: ${host.desktopLyricSettings.strokeWidth}px ${host.desktopLyricSettings.strokeColor}; filter: drop-shadow(0 2px ${host.desktopLyricSettings.shadowBlur}px ${host.desktopLyricSettings.shadowColor});"
                                  >
                                    Live preview of desktop lyrics
                                  </div>
                                </div>
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
