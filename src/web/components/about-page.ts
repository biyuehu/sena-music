import './theme-toggle'
import { html, type TemplateResult } from 'lit-html'
import { defineComponent } from '@/romi/web'
import packageJson from '../../../package.json'
import { initTheme } from '../service/theme'

export const AboutPage = defineComponent(
  'about-page',
  {},
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
      kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5rem;
        padding: 0.15rem 0.4rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        color: var(--lx-text);
        background-color: var(--lx-hover);
        border: 1px solid var(--lx-border);
        border-radius: 0.25rem;
        box-shadow: 0 1px 1px rgba(0, 0, 0, 0.08);
      }
    `,
    connectedCallback: () => {
      initTheme()
    },
    render: (): TemplateResult => {
      const shortcuts = [
        {
          category: '播放控制',
          items: [
            { keys: ['Space'], desc: '播放 / 暂停', note: '支持键盘物理媒体播放键' },
            { keys: ['[', 'Ctrl + ←', 'Alt + ←'], desc: '上一首', note: '切换至播放列表中上一首' },
            { keys: [']', 'Ctrl + →', 'Alt + →'], desc: '下一首', note: '切换至播放列表中下一首' },
            { keys: ['←'], desc: '快退 5 秒', note: '同步更新当前进度与歌词滚动' },
            { keys: ['→'], desc: '快进 5 秒', note: '同步更新当前进度与歌词滚动' },
            { keys: ['O'], desc: '切换播放模式', note: '列表循环 → 随机播放 → 单曲循环 → 停止播放' }
          ]
        },
        {
          category: '音量与显示',
          items: [
            { keys: ['↑'], desc: '音量增加 5%', note: '音量步进调节' },
            { keys: ['↓'], desc: '音量减少 5%', note: '音量步退调节' },
            { keys: ['M'], desc: '静音 / 恢复音量', note: '记录原音量，再次按下恢复' },
            { keys: ['F'], desc: '全屏歌词界面', note: '切换全屏歌词与动态光影可视化' },
            { keys: ['F11'], desc: '应用全屏', note: '进入或退出全屏模式' }
          ]
        },
        {
          category: '搜索与通用交互',
          items: [
            { keys: ['/'], desc: '快速聚焦搜索', note: '立即定位并选中文本搜索输入框' },
            { keys: ['Escape'], desc: '退出 / 关闭', note: '退出搜索焦点、关闭菜单、关闭弹窗、退出全屏' }
          ]
        }
      ]

      const features = [
        {
          title: '多音源聚合',
          desc: '以网易云音乐歌单主导，集成QQ 音乐、Bilibili、YouTube 音频与本地直链，打破平台壁垒聚合单曲。'
        },
        {
          title: '限制歌曲随心畅听',
          desc: '无论是 VIP 歌曲、网易云无版权歌曲、私人歌曲还是墙内禁曲，都可以通过多音源畅听。'
        },
        {
          title: '多平台支持',
          desc: '前后端零距离理念驱动下的 Web 端、Windows 桌面端、Android 移动端多平台支持，随时随地畅听。'
        },
        {
          title: '三轨歌词同步',
          desc: '支持日文原版、中文翻译与罗马音音译三轨歌词智能对齐，点击歌词任意行即可精准跳转播放。'
        },
        {
          title: '全屏拟真律动背景',
          desc: '根据音轨实时进度与当前角色主题色彩，程序化生成灵动粒子与光影谐波背景。'
        },
        {
          title: '自托管与本地持久化',
          desc: '基于本地轻量服务端，音频文件及歌词自动智能缓存至本地，断网或离线亦可流畅播放。'
        }
      ]

      return html`
        <div class="flex flex-col flex-1 h-full min-h-0 bg-[var(--lx-main)] text-[var(--lx-text)] font-sans overflow-hidden">
          <main class="flex-1 flex flex-col min-w-0 min-h-0">
            <div class="flex-none flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--lx-border)] bg-[var(--lx-bg-alt)]">
              <span class="font-bold text-sm">关于</span>
              <theme-toggle></theme-toggle>
            </div>

            <div class="flex-1 overflow-y-auto no-scrollbar min-h-0 p-4 md:p-6 space-y-6">
              <div class="max-w-4xl w-full space-y-6">
                <div class="p-5 sm:p-6 rounded-2xl bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-sm">
                  <div class="flex items-center gap-4 min-w-0">
                    <img src="/logo.png" alt="星之声" class="w-14 h-14 shrink-0 object-contain rounded-xl" />
                    <div class="min-w-0">
                      <div class="flex items-center gap-3">
                        <h1 class="text-2xl font-black tracking-tight text-[var(--lx-text)]">星之声 ⭐ Sena Music</h1>
                        <span class="px-2 py-0.5 text-xs font-semibold rounded-full bg-[var(--lx-hover)] border border-[var(--lx-border)] text-[var(--lx-accent)] font-mono shrink-0">
                          v${packageJson.version}
                        </span>
                      </div>
                      <p class="text-xs text-[var(--lx-text-muted)] mt-1 leading-normal break-words">轻量级自托管多源音乐聚合播放器</p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 flex-wrap shrink-0">
                    <a
                      href="https://github.com/biyuehu/sena-music"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="GitHub 仓库"
                      class="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors"
                    >
                      <div class="i-carbon-logo-github text-sm"></div>
                      <span class="hidden sm:inline">GitHub 仓库</span>
                    </a>
                    <span class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--lx-hover)] border border-[var(--lx-border)] text-[var(--lx-text-muted)]">
                      <span class="hidden sm:inline">开源协议: </span>${packageJson.license}
                    </span>
                  </div>
                </div>

                <div class="p-5 sm:p-6 rounded-2xl bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] space-y-5 shadow-sm">
                  <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--lx-border)]">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="i-carbon-keyboard text-xl text-[var(--lx-accent)] shrink-0"></div>
                      <h2 class="text-base font-bold text-[var(--lx-text)]">应用内快捷键</h2>
                    </div>
                    <span class="text-xs text-[var(--lx-text-muted)]">输入框聚焦时自动规避冲突</span>
                  </div>

                  <div class="space-y-5">
                    ${shortcuts.map(
                      (group) => html`
                        <div class="space-y-2.5">
                          <span class="text-xs font-bold opacity-60 uppercase tracking-wider">${group.category}</span>
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            ${group.items.map(
                              (item) => html`
                                <div class="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-[var(--lx-main)] border border-[var(--lx-border)]">
                                  <div class="flex flex-col gap-1 min-w-[130px] flex-1">
                                    <span class="text-xs font-bold text-[var(--lx-text)] leading-snug">${item.desc}</span>
                                    <span class="text-[11px] text-[var(--lx-text-muted)] leading-relaxed break-words">${item.note}</span>
                                  </div>
                                  <div class="flex items-center gap-1 flex-wrap shrink-0">
                                    ${item.keys.map((k) => html`<kbd>${k}</kbd>`)}
                                  </div>
                                </div>
                              `
                            )}
                          </div>
                        </div>
                      `
                    )}
                  </div>
                </div>

                <div class="p-5 sm:p-6 rounded-2xl bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] space-y-4 shadow-sm">
                  <div class="flex items-center gap-2.5 pb-3 border-b border-[var(--lx-border)]">
                    <div class="i-carbon-information text-xl text-[var(--lx-accent)] shrink-0"></div>
                    <h2 class="text-base font-bold text-[var(--lx-text)]">核心特性与功能</h2>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    ${features.map(
                      (f) => html`
                        <div class="p-3.5 rounded-xl bg-[var(--lx-main)] border border-[var(--lx-border)] space-y-1">
                          <div class="text-xs font-bold text-[var(--lx-accent)]">${f.title}</div>
                          <div class="text-[11px] text-[var(--lx-text-muted)] leading-relaxed break-words">${f.desc}</div>
                        </div>
                      `
                    )}
                  </div>
                </div>

                <div class="text-center text-xs text-[var(--lx-text-muted)] opacity-70">
                  <p>SenaMusic © 2026 Arimura Romi.</p>
                </div>
              </div>
            </div>
          </main>
        </div>
      `
    }
  }
)
