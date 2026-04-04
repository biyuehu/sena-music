import { html } from 'lit-html'
import { defineComponent, State } from '@/romi/web'

export const sideNav = defineComponent(
  'side-nav',
  {
    activeItem: State('playlist')
  },
  {
    useGlobalStyles: true,
    render: (host) => html`
      <nav class="w-16 md:w-52 border-r border-[var(--lx-border)] flex flex-col shrink-0 bg-[var(--lx-bg-alt)] h-screen">
        <div class="p-4 flex items-center gap-2 mb-4">
          <div class="w-8 h-8 bg-[var(--lx-accent)] rounded flex items-center justify-center text-white">
            <div class="i-carbon-music"></div>
          </div>
          <span class="hidden md:block font-bold text-sm tracking-tight">LX Music Romi</span>
        </div>
        <div class="flex-1 px-2 space-y-1">
          <div 
            class="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer transition-colors ${host.activeItem === 'playlist' ? 'bg-[var(--lx-accent)] text-white' : 'text-[var(--lx-text)] opacity-60 hover:bg-[var(--lx-border)]'}"
            @click=${() => (host.activeItem = 'playlist')}
          >
            <div class="i-carbon-list"></div>
            <span class="hidden md:block">播放列表</span>
          </div>
          <div 
            class="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer transition-colors ${host.activeItem === 'search' ? 'bg-[var(--lx-accent)] text-white' : 'text-[var(--lx-text)] opacity-60 hover:bg-[var(--lx-border)]'}"
            @click=${() => (host.activeItem = 'search')}
          >
            <div class="i-carbon-search"></div>
            <span class="hidden md:block">搜索</span>
          </div>
          <div 
            class="flex items-center gap-3 px-3 py-2 rounded text-sm cursor-pointer transition-colors ${host.activeItem === 'settings' ? 'bg-[var(--lx-accent)] text-white' : 'text-[var(--lx-text)] opacity-60 hover:bg-[var(--lx-border)]'}"
            @click=${() => (host.activeItem = 'settings')}
          >
            <div class="i-carbon-settings"></div>
            <span class="hidden md:block">设置</span>
          </div>
        </div>
      </nav>
    `
  }
)
