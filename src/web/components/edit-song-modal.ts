import { html } from 'lit-html'
import type { SongInfo, SongSourceType } from 'src/common/types'
import { defineComponent, State } from '@/romi/web'
import { showToast } from './toast'

export const editSongModal = defineComponent(
  'edit-song-modal',
  {
    isOpen: State(false),
    song: State<SongInfo | null>(null),
    isLoading: State(false)
  },
  {
    useGlobalStyles: true,
    render: (host) => {
      if (!host.isOpen || !host.song) {
        return html``
      }

      const handleClose = () => {
        if (host.isLoading) return
        host.isOpen = false
        host.dispatchEvent(new CustomEvent('close'))
      }

      const handleSubmit = (): void => {
        if (!host.song?.value?.trim()) {
          showToast('歌曲地址不能为空', 'error')
          return
        }

        host.isLoading = true

        try {
          const event = new CustomEvent('edit-song-save', {
            detail: {
              id: host.song.id,
              source: host.song.type,
              value: host.song.value.trim()
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
              <div class="text-lg font-semibold text-[var(--lx-text)]">编辑歌曲</div>
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
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲类型</label>
                <select
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm cursor-pointer focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${host.song.type}
                  @change=${(e: Event) => {
                    const target = e.target as HTMLSelectElement
                    if (host.song) host.song = { ...host.song, type: target.value as SongSourceType }
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
                <label class="block text-sm font-medium mb-1.5 text-[var(--lx-text)]">歌曲地址</label>
                <input
                  type="text"
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm focus:border-[var(--lx-accent)] focus:outline-none"
                  .value=${host.song.value}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement
                    if (host.song) host.song = { ...host.song, value: target.value }
                  }}
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
                ?disabled=${host.isLoading || !host.song.value.trim()}
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
