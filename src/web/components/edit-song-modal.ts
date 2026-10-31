import { html } from 'lit-html'
import { defineComponent, State } from '@/romi/web'
import type { SongInfo, SongLyricSourceType, SongSourceType } from '../../common/types'
import { httpClient } from '../client'
import { showToast } from './toast'

export const editSongModal = defineComponent(
  'edit-song-modal',
  {
    isOpen: State(false),
    song: State<SongInfo | null>(null),
    draft: State<SongInfo | null>(null),
    isLoading: State(false),
    showLyricSection: State(false),
    lyricType: State<SongLyricSourceType>('auto'),
    lyricValue: State(''),
    lyricOffset: State(0),
    customOriginal: State(''),
    customTranslation: State(''),
    customRomaji: State('')
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
      if (host.draft?.id !== host.song.id) {
        host.draft = { ...host.song }
        host.lyricType = host.song.lyricConfig?.type ?? 'auto'
        host.lyricValue = host.song.lyricConfig?.value ?? ''
        host.lyricOffset = host.song.lyricConfig?.offset ?? 0
        host.customOriginal = ''
        host.customTranslation = ''
        host.customRomaji = ''

        // 如果是自定义歌词，尝试异步拉取已有歌词填充表单
        if (host.lyricType === 'custom') {
          httpClient.getLyric({ id: host.song.id }).then((r) =>
            r.match({
              Right: (lyric) => {
                host.customOriginal = lyric.original ?? ''
                host.customTranslation = lyric.translation ?? ''
                host.customRomaji = lyric.romaji ?? ''
              },
              Left: () => {}
            })
          )
        }
      }
      const draft = host.draft

      const handleClose = () => {
        if (host.isLoading) return
        host.isOpen = false
        host.draft = null
        host.dispatchEvent(new CustomEvent('close'))
      }

      const handleSubmit = async (): Promise<void> => {
        const current = host.draft
        if (!current) return
        if (!current.value?.trim() && current.type !== 'netease' && current.type !== 'qq') {
          showToast('歌曲地址不能为空', 'error')
          return
        }

        host.isLoading = true

        try {
          if (host.lyricType === 'custom') {
            await httpClient.saveCustomLyric({
              id: current.id,
              original: host.customOriginal.trim(),
              translation: host.customTranslation.trim(),
              romaji: host.customRomaji.trim()
            })
          }

          const event = new CustomEvent('edit-song-save', {
            detail: {
              id: current.id,
              source: current.type,
              value: current.value.trim(),
              lyricConfig: {
                type: host.lyricType,
                value: host.lyricValue.trim(),
                offset: Number(host.lyricOffset) || 0
              }
            },
            bubbles: true,
            composed: true
          })
          host.dispatchEvent(event)
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
                  <option value="qq">QQ音乐</option>
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

              <!-- 歌词设置折叠区 -->
              <div class="border border-[var(--lx-border)] rounded-lg p-3 bg-[var(--lx-bg-alt)]">
                <div 
                  class="flex justify-between items-center cursor-pointer select-none"
                  @click=${() => (host.showLyricSection = !host.showLyricSection)}
                >
                  <span class="text-sm font-semibold text-[var(--lx-text)] flex items-center gap-1.5">
                    <span class="i-carbon-document-audio"></span> 歌词设置
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
                        .value=${host.lyricType}
                        @change=${(e: Event) => {
                          const target = e.target as HTMLSelectElement
                          host.lyricType = target.value as SongLyricSourceType
                        }}
                      >
                        <option value="auto">默认自动（网易云优先 / 自动匹配）</option>
                        <option value="netease">指定网易云歌曲 ID</option>
                        <option value="qq">指定 QQ 音乐 MID</option>
                        <option value="local">指定本地 LRC 路径</option>
                        <option value="custom">手动自定义输入（三轨）</option>
                        <option value="none">纯音乐 / 不展示歌词</option>
                      </select>
                    </div>

                    ${
                      host.lyricType === 'netease' || host.lyricType === 'qq' || host.lyricType === 'local'
                        ? html`
                      <div>
                        <label class="block text-xs font-medium mb-1 text-[var(--lx-text)]">
                          ${host.lyricType === 'netease' ? '网易云歌曲 ID' : host.lyricType === 'qq' ? 'QQ 音乐 MID / 链接' : '本地 .lrc 文件路径'}
                        </label>
                        <input
                          type="text"
                          class="w-full p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-main)] text-[var(--lx-text)] text-xs focus:border-[var(--lx-accent)] focus:outline-none"
                          .value=${host.lyricValue}
                          placeholder="${host.lyricType === 'netease' ? '例如 536622304' : host.lyricType === 'qq' ? '例如 002TTnfc13TkgO' : '例如 /path/to/song.lrc'}"
                          @input=${(e: Event) => {
                            host.lyricValue = (e.target as HTMLInputElement).value
                          }}
                        />
                      </div>`
                        : ''
                    }

                    ${
                      host.lyricType === 'custom'
                        ? html`
                      <div class="space-y-2">
                        <div>
                          <label class="block text-xs font-medium mb-1 text-[var(--lx-text)]">原文歌词 (LRC 格式) *</label>
                          <textarea
                            rows="4"
                            class="w-full p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-main)] text-[var(--lx-text)] text-xs font-mono focus:border-[var(--lx-accent)] focus:outline-none"
                            placeholder="LRC 格式，例如：00:01.00 原文内容..."
                            .value=${host.customOriginal}
                            @input=${(e: Event) => {
                              host.customOriginal = (e.target as HTMLTextAreaElement).value
                            }}
                          ></textarea>
                        </div>
                        <div>
                          <label class="block text-xs font-medium mb-1 text-[var(--lx-text)]">中文翻译 (可选，同时间戳)</label>
                          <textarea
                            rows="3"
                            class="w-full p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-main)] text-[var(--lx-text)] text-xs font-mono focus:border-[var(--lx-accent)] focus:outline-none"
                            placeholder="可选，同时间戳翻译内容..."
                            .value=${host.customTranslation}
                            @input=${(e: Event) => {
                              host.customTranslation = (e.target as HTMLTextAreaElement).value
                            }}
                          ></textarea>
                        </div>
                        <div>
                          <label class="block text-xs font-medium mb-1 text-[var(--lx-text)]">音译 / 罗马音 (可选，同时间戳)</label>
                          <textarea
                            rows="3"
                            class="w-full p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-main)] text-[var(--lx-text)] text-xs font-mono focus:border-[var(--lx-accent)] focus:outline-none"
                            placeholder="可选，同时间戳罗马音/音译..."
                            .value=${host.customRomaji}
                            @input=${(e: Event) => {
                              host.customRomaji = (e.target as HTMLTextAreaElement).value
                            }}
                          ></textarea>
                        </div>
                      </div>`
                        : ''
                    }

                    <div>
                      <label class="block text-xs font-medium mb-1 text-[var(--lx-text)]">歌词时间轴偏移 (毫秒，正数推迟，负数提前)</label>
                      <input
                        type="number"
                        step="100"
                        class="w-full p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-main)] text-[var(--lx-text)] text-xs focus:border-[var(--lx-accent)] focus:outline-none"
                        .value=${host.lyricOffset.toString()}
                        placeholder="0"
                        @input=${(e: Event) => {
                          host.lyricOffset = Number((e.target as HTMLInputElement).value) || 0
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
                ?disabled=${host.isLoading || (!draft.value.trim() && draft.type !== 'netease' && draft.type !== 'qq')}
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
