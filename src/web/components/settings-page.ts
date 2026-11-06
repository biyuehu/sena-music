import './theme-toggle'
import './toast'
import { html, type TemplateResult } from 'lit-html'
import { batch, defineComponent, State } from '@/romi/web'
import type { Settings } from '../../common/types'
import { Cache } from '../cache'
import { httpClient } from '../client'
import { getAppRoute } from '../router'
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
} from '../theme'
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
    colorScheme: State<ColorScheme>(getStoredColorScheme()),
    theme: State<Theme>('auto'),
    cacheSize: State(0),
    cachePath: State(''),
    cleaningCache: State(false),
    visualizerEnabled: State(true)
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
      return () => {
        document.removeEventListener('theme-change', handleThemeChange)
        window.removeEventListener('hashchange', handleRouteChange)
        window.removeEventListener('popstate', handleRouteChange)
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

                      <label class="flex items-center justify-between gap-3">
                        <span class="text-xs font-bold opacity-70">播放失败时自动切换到下一首</span>
                        <input
                          type="checkbox"
                          class="w-4 h-4"
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
