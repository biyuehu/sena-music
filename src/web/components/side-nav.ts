import { html } from 'lit-html'
import { defineComponent, State } from '@/romi/web'
import { getEffectiveTheme, initTheme, toggleTheme } from '../theme'

const activeItem = location.pathname.endsWith('settings.html') ? 'settings' : 'playlist'

export const sideNav = defineComponent(
  'side-nav',
  {
    isDrawerOpen: State(false),
    isDark: State(getEffectiveTheme() === 'dark')
  },
  {
    useGlobalStyles: true,
    styles: /* css */ `
      :host {
        display: block;
        flex-shrink: 0;
        z-index: 100;
      }
      @media (min-width: 768px) {
        :host { width: 13rem; }
      }
      @media (max-width: 767px) {
        :host { width: 0; }
      }
    `,
    connectedCallback: (host) => {
      initTheme()
      const handleThemeChange = (e: Event) => {
        const customEvent = e as CustomEvent<{ theme: string; effective: 'light' | 'dark' }>
        host.isDark = customEvent.detail.effective === 'dark'
      }

      document.addEventListener('theme-change', handleThemeChange)
      return () => {
        document.removeEventListener('theme-change', handleThemeChange)
      }
    },
    render: (host) => html`
      <div class="md:hidden fixed top-3 left-4" style="z-index: 9990; pointer-events: auto;">
        <button 
          @click=${(e: Event) => {
            e.stopPropagation()
            host.isDrawerOpen = !host.isDrawerOpen
          }} 
          class="p-2 rounded bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] shadow-lg text-[var(--lx-text)]"
        >
          <div class="${host.isDrawerOpen ? 'i-carbon-close' : 'i-carbon-menu'} text-xl"></div>
        </button>
      </div>

      <div 
        @click=${() => (host.isDrawerOpen = false)}
        class="fixed inset-0 bg-black/60 md:hidden transition-opacity duration-300"
        style="z-index: 9991; display: ${host.isDrawerOpen ? 'block' : 'none'}; pointer-events: auto;"
      ></div>

      <nav 
        class="fixed md:relative inset-y-0 left-0 bg-[var(--lx-bg-alt)] border-r border-[var(--lx-border)] flex flex-col h-screen transition-transform duration-300 ease-in-out text-[var(--lx-text)]"
        style="
          z-index: 9999; 
          width: 16rem;
          transform: ${host.isDrawerOpen ? 'translateX(0)' : 'translateX(-100%)'};
          pointer-events: auto;
        "
      >
        <style>
          @media (min-width: 768px) {
            nav { transform: translateX(0) !important; position: relative !important; width: 100% !important; z-index: 10 !important; }
          }
        </style>

        <div class="p-4 flex items-center justify-between mb-4 border-b border-[var(--lx-border)]">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-[var(--lx-accent)] rounded flex items-center justify-center text-white shrink-0">
              <div class="i-carbon-music"></div>
            </div>
            <span class="font-bold text-sm tracking-tight truncate">Sena Music</span>
          </div>
        </div>

        <div class="flex-1 px-2 space-y-1">
          <div class="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer ${activeItem === 'playlist' ? 'bg-[var(--lx-accent)] text-white' : 'opacity-60 hover:opacity-100 hover:bg-[var(--lx-hover)]'}"
               @click=${() => (window.location.href = 'index.html')}>
            <div class="i-carbon-list shrink-0"></div>
            <span>主页</span>
          </div>
          <div class="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer ${activeItem === 'settings' ? 'bg-[var(--lx-accent)] text-white' : 'opacity-60 hover:opacity-100 hover:bg-[var(--lx-hover)]'}"
               @click=${() => (window.location.href = 'settings.html')}>
            <div class="i-carbon-settings shrink-0"></div>
            <span>设置</span>
          </div>
        </div>

        <div class="p-3 border-t border-[var(--lx-border)]">
          <button
            class="flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer w-full opacity-70 hover:opacity-100 hover:bg-[var(--lx-hover)] transition-colors text-[var(--lx-text)]"
            @click=${() => toggleTheme()}
            title="切换暗色/亮色模式"
          >
            <div class="flex items-center gap-2.5">
              <div class="${host.isDark ? 'i-carbon-moon' : 'i-carbon-sun'} text-base shrink-0"></div>
              <span class="text-xs font-medium">${host.isDark ? '暗色模式' : '亮色模式'}</span>
            </div>
            <div class="text-[10px] px-1.5 py-0.5 rounded border border-[var(--lx-border)] opacity-60 font-mono">
              ${host.isDark ? 'DARK' : 'LIGHT'}
            </div>
          </button>
        </div>
      </nav>
    `
  }
)
