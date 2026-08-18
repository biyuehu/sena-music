import './side-nav'
import './toast'
import { html, type TemplateResult } from 'lit-html'
import type { Settings } from 'src/common/types'
import { defineComponent, State } from '@/romi/web'
import { Cache } from '../cache'
import { httpClient } from '../client'
import { getEffectiveTheme, initTheme, toggleTheme } from '../theme'
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
    isDark: State(getEffectiveTheme() === 'dark')
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

      const handleThemeChange = (e: Event): void => {
        host.isDark = (e as CustomEvent<{ effective: 'light' | 'dark' }>).detail.effective === 'dark'
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

      return html`
        <div class="flex h-[100dvh] max-h-[100dvh] bg-[var(--lx-main)] text-[var(--lx-text)] font-sans overflow-hidden">
          <main class="flex-1 flex flex-col min-w-0 min-h-0">
            <div class="flex-none flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--lx-border)] bg-[var(--lx-bg-alt)]">
              <span class="font-bold text-sm">设置</span>
              <button
                @click=${() => toggleTheme()}
                class="flex items-center justify-center p-2 rounded text-sm bg-[var(--lx-border)] text-[var(--lx-text)] hover:opacity-80 transition-opacity"
                title="${host.isDark ? '切换至亮色模式' : '切换至暗色模式'}"
              >
                <div class="${host.isDark ? 'i-carbon-moon' : 'i-carbon-sun'} text-base"></div>
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
