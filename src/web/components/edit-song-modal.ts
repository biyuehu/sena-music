import { html } from 'lit-html'
import { defineComponent, State } from '@/romi/web'
import type { SongInfo, SongSourceType } from '../../common/types'
import { showToast } from './toast'

export const editSongModal = defineComponent(
  'edit-song-modal',
  {
    isOpen: State(false),
    song: State<SongInfo | null>(null),
    draft: State<SongInfo | null>(null),
    isLoading: State(false)
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
      if (!host.isOpen || !host.song) return html``
      if (host.draft?.id !== host.song.id) host.draft = { ...host.song }
      const draft = host.draft

      const handleClose = () => {
        if (host.isLoading) return
        host.isOpen = false
        host.draft = null
        host.dispatchEvent(new CustomEvent('close'))
      }

      const handleSubmit = (): void => {
        const current = host.draft
        if (!current) return
        if (!current.value?.trim() && current.type !== 'netease') {
          showToast('歌曲地址不能为空', 'error')
          return
        }

        host.isLoading = true

        try {
          const event = new CustomEvent('edit-song-save', {
            detail: {
              id: current.id,
              source: current.type,
              value: current.value.trim()
            },
            bubbles: true,
            composed: true
          })
          host.dispatchEvent(event)

          // 等待父组件处理完成，父组件会关闭模态框
          // 这里不需要手动关闭，由父组件控制
        } catch (err) {
          console.error('Failed to edit song:', err)
          showToast('编辑失败', 'error')
          host.isLoading = false
        }
      }

      return html`
        <div 
          class="fixed inset-0 bg-black/60 flex items-center justify-center z-200" 
        >
          <div 
            class="bg-[var(--lx-main)] rounded-xl p-6 w-90% max-w-120 max-h-90vh overflow-y-auto border border-[var(--lx-border)] shadow-2xl"
            @click=${(e: Event) => e.stopPropagation()}
          >
            <div class="flex justify-between items-center mb-5">
              <div class="text-lg font-semibold text-[var(--lx-text)]">编辑歌曲</div>
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
                <span class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">来源：<strong class="${draft.id.length < 36 ? 'text-red' : 'text-[var(--lx-accent)]'}">${draft.id.length < 36 ? '网易云' : '自定义'}</strong></span>
              </div>
              <div>
                <span class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲名：<span class="select-all">${draft.name}</span></span>
              </div>
              <div>
                <span class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌手：<span class="select-all">${draft.artists.join('、')}</span></span>
              </div>
              ${
                draft.cover.trim()
                  ? html`
              <div>
                <span class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">封面：<a href="${draft.cover}" target="_blank" class="select-text break-words">${draft.cover}</a></span>
              </div>`
                  : ''
              }
              <div>
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲源</label>
                <select
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm cursor-pointer focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${draft.type}
                  @change=${(e: Event) => {
                    const target = e.target as HTMLSelectElement
                    host.draft = { ...draft, type: target.value as SongSourceType }
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
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲值</label>
                <input
                  type="text"
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${draft.value}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement
                    host.draft = { ...draft, value: target.value }
                  }}
                />
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
                ?disabled=${host.isLoading || (!draft.value.trim() && draft.type !== 'netease')}
              >
                ${host.isLoading ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      `
    }
  }
)
