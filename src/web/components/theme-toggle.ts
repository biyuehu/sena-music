import { html, type TemplateResult } from 'lit-html'
import { defineComponent, State } from '@/romi/web'
import { applyTheme, getStoredTheme, type Theme } from '../theme'

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
        width: 1em;
        height: 1em;
      }
    `,
    connectedCallback: (host): (() => void) => {
      host.theme = getStoredTheme()
      const handleThemeChange = (e: Event): void => {
        const detail = (e as CustomEvent<{ theme: string; effective: 'light' | 'dark' }>).detail
        if (detail?.theme && host.theme !== detail.theme) {
          host.theme = detail.theme as Theme
        }
      }
      document.addEventListener('theme-change', handleThemeChange)
      return () => document.removeEventListener('theme-change', handleThemeChange)
    },
    render: (host): TemplateResult => {
      const modes: Theme[] = ['light', 'dark', 'auto']
      const cycleTheme = (e: Event): void => {
        e.stopPropagation()
        const current = modes.includes(host.theme) ? host.theme : getStoredTheme()
        const next = modes[(modes.indexOf(current) + 1) % modes.length]
        host.theme = next
        applyTheme(next)
      }
      const title = `切换主题：${host.theme === 'light' ? '亮色' : host.theme === 'dark' ? '暗色' : '跟随系统'}`

      return html`
        <button
          @click=${cycleTheme}
          class="flex items-center justify-center p-2 rounded text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors cursor-pointer"
          title=${title}
        >
          ${
            host.theme === 'light'
              ? html`<div class="i-carbon-sun text-base"></div>`
              : host.theme === 'dark'
                ? html`<div class="i-carbon-moon text-base"></div>`
                : html`<div class="i-carbon-contrast text-base"></div>`
          }
        </button>
      `
    }
  }
)
