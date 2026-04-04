import { html } from 'lit-html'
import type { SongSourceType } from 'src/common/types'
import { defineComponent, State } from '@/romi/web'
import { showToast } from './toast'

interface AddSongForm {
  name: string
  artists: string
  cover: string
  type: SongSourceType
  value: string
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
      value: ''
    }),
    isLoading: State(false)
  },
  {
    useGlobalStyles: true,
    render: (host) => {
      if (!host.isOpen) return html``

      const resetForm = () => {
        host.form = {
          name: '',
          artists: '',
          cover: '',
          type: 'url',
          value: ''
        }
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

        // 触发添加逻辑
        host.isLoading = true

        try {
          const event = new CustomEvent('add-song', {
            detail: {
              name: host.form.name.trim(),
              artists,
              cover: host.form.cover.trim(),
              type: host.form.type,
              value: host.form.value.trim()
            },
            bubbles: true,
            composed: true
          })
          host.dispatchEvent(event)

          // 等待父组件处理完成，父组件会关闭模态框
          // 这里不需要手动关闭，由父组件控制
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
                class="p-1 rounded hover:bg-[var(--lx-border)] text-[var(--lx-text-muted)]"
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
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm focus:border-[var(--lx-accent)] focus:outline-none"
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
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm focus:border-[var(--lx-accent)] focus:outline-none"
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
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm focus:border-[var(--lx-accent)] focus:outline-none"
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
                  <option value="local">本地文件</option>
                  <option value="bili">Bilibili</option>
                  <option value="youtube">YouTube</option>
                  <option value="url">外部URL</option>
                </select>
              </div>
              
              <div>
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲类型 *</label>
                <input
                  type="text"
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm focus:border-[var(--lx-accent)] focus:outline-none"
                                    .value=${host.form.value}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement
                    host.form = { ...host.form, value: target.value }
                  }}
                  placeholder="请输入歌曲地址或网易云音乐ID"
                />
              </div>
            </div>
            
            <div class="flex gap-3 mt-8">
              <button
                class="flex-1 py-2.5 rounded font-medium text-sm bg-[var(--lx-border)] text-[var(--lx-text)] hover:bg-[var(--lx-border-dark)]"
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
