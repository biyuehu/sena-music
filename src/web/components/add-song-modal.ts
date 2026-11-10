import { html } from 'lit-html'
import { defineComponent, State } from '@/romi/web'
import type { SongLyricSourceType, SongSourceType } from '../../common/types'
import { showToast } from './toast'

interface AddSongForm {
  name: string
  artists: string
  cover: string
  type: SongSourceType
  value: string
  lyricType: SongLyricSourceType
  lyricValue: string
  lyricOffset: number
}

export const addSongModal = defineComponent(
  'add-song-modal',
  {
    isOpen: State(false),
    form: State<AddSongForm>({
      name: '',
      artists: '',
      cover: '',
      type: 'url',
      value: '',
      lyricType: 'auto',
      lyricValue: '',
      lyricOffset: 0
    }),
    isLoading: State(false),
    showLyricSection: State(false)
  },
  {
    useGlobalStyles: true,
    styles: /* css */ `
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
    `,
    render: (host) => {
      if (!host.isOpen) return html``

      const resetForm = () => {
        host.form = {
          name: '',
          artists: '',
          cover: '',
          type: 'url',
          value: '',
          lyricType: 'auto',
          lyricValue: '',
          lyricOffset: 0
        }
        host.showLyricSection = false
      }

      const handleClose = () => {
        if (host.isLoading) return
        resetForm()
        host.isOpen = false
        host.dispatchEvent(new CustomEvent('close'))
      }

      const handleSubmit = async (): Promise<void> => {
        if (!host.form.name.trim() || !host.form.artists.trim()) {
          showToast('请完整填写必填项', 'error')
          return
        }

        const artists = host.form.artists
          .split(',')
          .map((a) => a.trim())
          .filter((a) => a)

        host.isLoading = true

        try {
          host.dispatchEvent(
            new CustomEvent('add-song', {
              detail: {
                name: host.form.name.trim(),
                artists,
                cover: host.form.cover.trim(),
                type: host.form.type,
                value: host.form.value.trim(),
                lyricConfig: {
                  type: host.form.lyricType,
                  value: host.form.lyricValue.trim(),
                  offset: Number(host.form.lyricOffset) || 0
                }
              },
              bubbles: true,
              composed: true
            })
          )
        } catch (err) {
          console.error('Failed to add song:', err)
          showToast('添加失败，请检查地址', 'error')
          host.isLoading = false
        }
      }

      return html`
        <div 
          class="fixed inset-0 bg-black/60 flex items-center justify-center z-200" 
          @click=${(e: Event) => {
            if ((e.target as HTMLElement).classList.contains('fixed')) {
              handleClose()
            }
          }}
        >
          <div 
            class="bg-[var(--lx-main)] rounded-xl p-6 w-90% max-w-120 max-h-90vh overflow-y-auto border border-[var(--lx-border)] shadow-2xl"
            @click=${(e: Event) => e.stopPropagation()}
          >
            <div class="flex justify-between items-center mb-5">
              <div class="text-lg font-semibold text-[var(--lx-text)]">添加歌曲</div>
              <button 
                class="p-1 rounded hover:bg-[var(--lx-hover)] text-[var(--lx-text-muted)] hover:text-[var(--lx-text)] transition-colors"
                @click=${handleClose}
                ?disabled=${host.isLoading}
              >
                <div class="i-carbon-close text-xl"></div>
              </button>
            </div>
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲名称 *</label>
                <input
                  type="text"
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm cursor-pointer focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${host.form.name}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement
                    host.form = { ...host.form, name: target.value }
                  }}
                  placeholder="请输入歌曲名称"
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌手 *</label>
                <input
                  type="text"
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm cursor-pointer focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${host.form.artists}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement
                    host.form = { ...host.form, artists: target.value }
                  }}
                  placeholder="多个歌手用逗号分隔"
                />
                            </div>
              
              <div>
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">封面图片URL</label>
                <input
                  type="text"
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm cursor-pointer focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${host.form.cover}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement
                    host.form = { ...host.form, cover: target.value }
                  }}
                  placeholder="可选，留空使用默认封面"
                />
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲源</label>
                <select
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm cursor-pointer focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${host.form.type}
                  @change=${(e: Event) => {
                    const target = e.target as HTMLSelectElement
                    host.form = { ...host.form, type: target.value as SongSourceType }
                  }}
                >
                  <option value="netease">网易云音乐</option>
                  <option value="qq">QQ音乐</option>
                  <option value="local">本地文件</option>
                  <option value="bili">Bilibili</option>
                  <option value="youtube">YouTube</option>
                  <option value="url">外部URL</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲值 *</label>
                <input
                  type="text"
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm cursor-pointer focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${host.form.value}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement
                    host.form = { ...host.form, value: target.value }
                  }}
                  placeholder="请输入歌曲地址、网易云音乐ID或QQ音乐MID/链接"
                />
              </div>

              <div class="border border-[var(--lx-border)] rounded-lg p-3 bg-[var(--lx-bg-alt)]">
                <div 
                  class="flex justify-between items-center cursor-pointer select-none"
                  @click=${() => (host.showLyricSection = !host.showLyricSection)}
                >
                  <span class="text-sm font-semibold text-[var(--lx-text)] flex items-center gap-1.5">
                    <span class="i-carbon-document-audio"></span> 歌词设置（可选）
                  </span>
                  <span class="${host.showLyricSection ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down'} text-sm opacity-60"></span>
                </div>

                ${
                  host.showLyricSection
                    ? html`
                  <div class="mt-3 space-y-3 pt-3 border-t border-[var(--lx-border)]">
                    <div>
                      <label class="block text-xs font-medium mb-1 text-[var(--lx-text)]">歌词绑定源</label>
                      <select
                        class="w-full p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-main)] text-[var(--lx-text)] text-xs focus:border-[var(--lx-accent)] focus:outline-none"
                        .value=${host.form.lyricType}
                        @change=${(e: Event) => {
                          const target = e.target as HTMLSelectElement
                          host.form = { ...host.form, lyricType: target.value as SongLyricSourceType }
                        }}
                      >
                        <option value="auto">默认自动（网易云优先 / 自动匹配）</option>
                        <option value="netease">指定网易云歌曲 ID</option>
                        <option value="qq">指定 QQ 音乐 MID</option>
                        <option value="local">指定本地 LRC 路径</option>
                        <option value="none">纯音乐 / 不展示歌词</option>
                      </select>
                    </div>

                    ${
                      host.form.lyricType === 'netease' ||
                      host.form.lyricType === 'qq' ||
                      host.form.lyricType === 'local'
                        ? html`
                      <div>
                        <label class="block text-xs font-medium mb-1 text-[var(--lx-text)]">
                          ${host.form.lyricType === 'netease' ? '网易云歌曲 ID' : host.form.lyricType === 'qq' ? 'QQ 音乐 MID / 链接' : '本地 .lrc 文件路径'}
                        </label>
                        <input
                          type="text"
                          class="w-full p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-main)] text-[var(--lx-text)] text-xs focus:border-[var(--lx-accent)] focus:outline-none"
                          .value=${host.form.lyricValue}
                          placeholder="${host.form.lyricType === 'netease' ? '例如 536622304' : host.form.lyricType === 'qq' ? '例如 002TTnfc13TkgO' : '例如 /path/to/song.lrc'}"
                          @input=${(e: Event) => {
                            host.form = { ...host.form, lyricValue: (e.target as HTMLInputElement).value }
                          }}
                        />
                      </div>`
                        : ''
                    }

                    <div>
                      <label class="block text-xs font-medium mb-1 text-[var(--lx-text)]">歌词时间轴偏移 (毫秒)</label>
                      <input
                        type="number"
                        step="100"
                        class="w-full p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-main)] text-[var(--lx-text)] text-xs focus:border-[var(--lx-accent)] focus:outline-none"
                        .value=${host.form.lyricOffset.toString()}
                        placeholder="0"
                        @input=${(e: Event) => {
                          host.form = { ...host.form, lyricOffset: Number((e.target as HTMLInputElement).value) || 0 }
                        }}
                      />
                    </div>
                  </div>`
                    : ''
                }
              </div>
            </div>
            <div class="flex gap-3 mt-8">
              <button
                class="flex-1 py-2.5 rounded font-medium text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors"
                @click=${handleClose}
                ?disabled=${host.isLoading}
              >
                取消
              </button>
              <button
                class="flex-1 py-2.5 rounded font-medium text-sm bg-[var(--lx-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                @click=${handleSubmit}
                ?disabled=${host.isLoading || !host.form.name.trim() || !host.form.value.trim()}
              >
                ${host.isLoading ? '添加中...' : '确认添加'}
              </button>
            </div>
          </div>
        </div>
      `
    }
  }
)
