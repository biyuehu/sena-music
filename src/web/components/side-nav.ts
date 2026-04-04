import { html } from 'lit-html'
import { defineComponent, State } from '@/romi/web'

export const sideNav = defineComponent(
  'side-nav',
  {
    activeItem: State('playlist'),
    isDrawerOpen: State(false)
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
        class="fixed md:relative inset-y-0 left-0 bg-[var(--lx-bg-alt)] border-r border-[var(--lx-border)] flex flex-col h-screen transition-transform duration-300 ease-in-out"
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
          <div class="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer ${host.activeItem === 'playlist' ? 'bg-[var(--lx-accent)] text-white' : 'opacity-60 hover:bg-[var(--lx-border)]'}"
               @click=${() => {
                 host.activeItem = 'playlist'
                 host.isDrawerOpen = false
               }}>
            <div class="i-carbon-list shrink-0"></div>
            <span>播放列表</span>
          </div>
          <div class="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer ${host.activeItem === 'search' ? 'bg-[var(--lx-accent)] text-white' : 'opacity-60 hover:bg-[var(--lx-border)]'}"
               @click=${() => {
                 host.activeItem = 'search'
                 host.isDrawerOpen = false
               }}>
            <div class="i-carbon-search shrink-0"></div>
            <span>搜索</span>
          </div>
          <div class="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer ${host.activeItem === 'settings' ? 'bg-[var(--lx-accent)] text-white' : 'opacity-60 hover:bg-[var(--lx-border)]'}"
               @click=${() => {
                 host.activeItem = 'settings'
                 host.isDrawerOpen = false
               }}>
            <div class="i-carbon-settings shrink-0"></div>
            <span>设置</span>
          </div>
        </div>
      </nav>
    `
  }
)
