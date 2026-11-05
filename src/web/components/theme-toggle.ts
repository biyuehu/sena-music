import { html, type TemplateResult } from 'lit-html'
import { defineComponent, State } from '@/romi/web'
import { applyTheme, getStoredTheme, initTheme, type Theme } from '../theme'

export const ThemeToggle = defineComponent(
  'theme-toggle',
  {
    theme: State<Theme>('auto')
  },
  {
    useGlobalStyles: true,
    styles: /* css */ `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      [class^="i-"],
      [class*=" i-"] {
        display: inline-block;
        vertical-align: middle;
        filter: var(--lx-icon-filter, none);
      }
    `,
    connectedCallback: (host): (() => void) => {
      initTheme()
      host.theme = getStoredTheme()
      const handleThemeChange = (e: Event): void => {
        const detail = (e as CustomEvent<{ theme: string; effective: 'light' | 'dark' }>).detail
        host.theme = detail.theme as Theme
      }
      document.addEventListener('theme-change', handleThemeChange)
      return () => document.removeEventListener('theme-change', handleThemeChange)
    },
    render: (host): TemplateResult => {
      const modes: Theme[] = ['light', 'dark', 'auto']
      const cycleTheme = (): void => {
        const next = modes[(modes.indexOf(host.theme) + 1) % modes.length]
        applyTheme(next)
      }
      const title = `切换主题：${host.theme === 'light' ? '亮色' : host.theme === 'dark' ? '暗色' : '跟随系统'}`
      const icon =
        host.theme === 'light' ? 'i-carbon-sun' : host.theme === 'dark' ? 'i-carbon-moon' : 'i-carbon-contrast'

      return html`
        <button
          @click=${cycleTheme}
          class="flex items-center justify-center p-2 rounded text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors cursor-pointer"
          title=${title}
        >
          <div class="${icon} text-base"></div>
        </button>
      `
    }
  }
)
