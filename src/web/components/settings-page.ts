import './side-nav'
import './toast'
import { html, type TemplateResult } from 'lit-html'
import { defineComponent, State } from '@/romi/web'
import type { Settings } from '../../common/types'
import { Cache } from '../cache'
import { httpClient } from '../client'
import {
  applyColorScheme,
  applyTheme,
  type ColorScheme,
  getEffectiveTheme,
  getStoredColorScheme,
  getStoredTheme,
  initTheme,
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
    colorScheme: State<ColorScheme>('orange'),
    theme: State<Theme>('auto'),
    cacheSize: State(0),
    cachePath: State(''),
    cleaningCache: State(false)
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
      host.colorScheme = getStoredColorScheme()
      host.theme = getStoredTheme()

      httpClient
        .getSettings()
        .then((result) =>
          result.match({
            Right: (settings) => {
              host.initial = settings
              host.playlistId = settings.playlistId
              host.cacheMaxSize = settings.cacheMaxSize
            },
            Left: ({ error }) => showToast(`加载设置失败：${error}`, 'error')
          })
        )
        .finally(() => {
          host.loading = false
        })

      httpClient.getCacheInfo().then((result) =>
        result.match({
          Right: (info) => {
            host.cacheSize = info.sizeBytes
            host.cachePath = info.path
          },
          Left: ({ error }) => showToast(`加载缓存信息失败：${error}`, 'error')
        })
      )

      const handleThemeChange = (e: Event): void => {
        const detail = (e as CustomEvent<{ theme: string; effective: 'light' | 'dark' }>).detail
        host.isDark = detail.effective === 'dark'
        host.theme = detail.theme as Theme
      }
      document.addEventListener('theme-change', handleThemeChange)
      return () => document.removeEventListener('theme-change', handleThemeChange)
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

      const colorOptions: Array<{ value: ColorScheme; label: string }> = [
        { value: 'orange', label: '橙色' },
        { value: 'blue', label: '蓝色' },
        { value: 'purple', label: '紫色' },
        { value: 'green', label: '绿色' },
        { value: 'pink', label: '粉色' }
      ]

      return html`
        <div class="flex h-[100dvh] max-h-[100dvh] bg-[var(--lx-main)] text-[var(--lx-text)] font-sans overflow-hidden">
          <main class="flex-1 flex flex-col min-w-0 min-h-0">
            <div class="flex-none flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--lx-border)] bg-[var(--lx-bg-alt)]">
              <span class="font-bold text-sm">设置</span>
              <button
                @click=${() => {
                  const modes: Theme[] = ['light', 'dark', 'auto']
                  const next = modes[(modes.indexOf(host.theme) + 1) % modes.length]
                  applyTheme(next)
                }}
                class="flex items-center justify-center p-2 rounded text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] hover:text-[var(--lx-accent)] transition-colors"
                title="切换主题：${host.theme === 'light' ? '亮色' : host.theme === 'dark' ? '暗色' : '跟随系统'}"
              >
                <div class="${host.theme === 'light' ? 'i-carbon-sun' : host.theme === 'dark' ? 'i-carbon-moon' : 'i-carbon-contrast'} text-base"></div>
              </button>
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
                                    host.cacheSize = info.sizeBytes
                                    showToast('清理成功', 'success')
                                  },
                                  Left: ({ error }) => showToast(`清理失败：${error}`, 'error')
                                })
                              })
                              .finally(() => {
                                host.cleaningCache = false
                              })
                          }}
                          class="mt-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-sm border border-[var(--lx-border)] hover:bg-[var(--lx-hover)] w-fit transition-colors"
                        >
                          <div class="i-carbon-trash-can ${host.cleaningCache ? 'animate-pulse text-[var(--lx-accent)]' : ''}"></div>
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
                          @change=${(e: Event) => {
                            const value = (e.target as HTMLSelectElement).value as ColorScheme
                            host.colorScheme = value
                            applyColorScheme(value)
                          }}
                        >
                          ${colorOptions.map(
                            (opt) =>
                              html`<option value=${opt.value} ?selected=${host.colorScheme === opt.value}>${opt.label}</option>`
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
