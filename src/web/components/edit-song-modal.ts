import { html } from 'lit-html'
import { defineComponent, State } from '@/romi/web'
import type { BiliSearchResultItem, SongInfo, SongLyricSourceType, SongSourceType } from '../../common/types'
import { httpClient } from '../service/client'
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
    customRomaji: State(''),
    biliSearchModalOpen: State(false),
    biliSearchKeyword: State(''),
    biliSearchResults: State<BiliSearchResultItem[]>([]),
    biliSearching: State(false)
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
      if (!host.isOpen) {
        host.draft = null
        host.isLoading = false
        host.biliSearchModalOpen = false
        host.biliSearchResults = []
        host.biliSearching = false
        return html``
      }
      if (!host.song) return html``
      if (!host.draft || host.draft.id !== host.song.id) {
        host.draft = { ...host.song }
        host.isLoading = false
        host.lyricType = host.song.lyricConfig?.type ?? 'auto'
        host.lyricValue = host.song.lyricConfig?.value ?? ''
        host.lyricOffset = host.song.lyricConfig?.offset ?? 0
        host.customOriginal = ''
        host.customTranslation = ''
        host.customRomaji = ''

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
        host.biliSearchModalOpen = false
        host.biliSearchResults = []
        host.biliSearching = false
        host.dispatchEvent(new CustomEvent('close'))
      }

      const executeBiliSearch = (keyword: string): void => {
        const clean = keyword.trim()
        if (!clean) return
        host.biliSearching = true
        httpClient
          .searchBiliSong({ keyword: clean })
          .then((res) =>
            res.match({
              Right: ({ results }) => {
                host.biliSearchResults = results
                if (results.length === 0) {
                  showToast('未找到相关视频', 'info')
                }
              },
              Left: ({ error }) => {
                showToast(`搜索失败：${error}`, 'error')
              }
            })
          )
          .catch((err) => {
            console.error('Failed to search Bilibili:', err)
            showToast('搜索异常', 'error')
          })
          .finally(() => {
            host.biliSearching = false
          })
      }

      const formatPlayCount = (play: number): string => {
        if (play >= 10_000) {
          return `${(play / 10_000).toFixed(1)}万`
        }
        return play.toString()
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
          host.draft = null
          host.isOpen = false
        } catch (err) {
          console.error('Failed to edit song:', err)
          showToast('编辑失败', 'error')
        } finally {
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
                <div class="flex items-center justify-between mb-1.5">
                  <label class="block text-sm font-medium text-[var(--lx-text)]">歌曲值</label>
                  ${
                    draft.type === 'bili'
                      ? html`
                        <button
                          type="button"
                          class="text-xs px-2.5 py-1 rounded bg-[var(--lx-accent)] text-white hover:opacity-90 flex items-center gap-1 cursor-pointer transition-opacity"
                          @click=${() => {
                            host.biliSearchKeyword = `${draft.name} ${draft.artists[0] || ''}`.trim()
                            host.biliSearchResults = []
                            host.biliSearchModalOpen = true
                            executeBiliSearch(host.biliSearchKeyword)
                          }}
                        >
                          <span class="i-carbon-search text-xs"></span>
                          <span>搜索 B站音源</span>
                        </button>
                      `
                      : ''
                  }
                </div>
                <input
                  type="text"
                  class="w-full p-2.5 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-sm focus:border-[var(--lx-accent)] focus:outline-none"
                  placeholder="${draft.type === 'bili' ? '输入 BV 号、AV 号或完整视频链接' : ''}"
                  .value=${draft.value}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement
                    host.draft = { ...draft, value: target.value }
                  }}
                />
              </div>

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

        ${
          host.biliSearchModalOpen
            ? html`
          <div
            class="fixed inset-0 bg-black/70 flex items-center justify-center z-[210] p-4"
            @click=${() => (host.biliSearchModalOpen = false)}
          >
            <div
              class="bg-[var(--lx-main)] rounded-xl p-5 w-full max-w-lg max-h-[85vh] flex flex-col border border-[var(--lx-border)] shadow-2xl"
              @click=${(e: Event) => e.stopPropagation()}
            >
              <div class="flex justify-between items-center mb-4 flex-none">
                <div class="text-base font-semibold text-[var(--lx-text)] flex items-center gap-2">
                  <span class="i-carbon-search"></span>
                  <span>搜索 B站音源</span>
                </div>
                <button
                  class="p-1 rounded hover:bg-[var(--lx-hover)] text-[var(--lx-text-muted)] hover:text-[var(--lx-text)] transition-colors"
                  @click=${() => (host.biliSearchModalOpen = false)}
                >
                  <div class="i-carbon-close text-xl"></div>
                </button>
              </div>

              <div class="flex gap-2 mb-4 flex-none">
                <input
                  type="text"
                  class="flex-1 p-2 rounded border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text)] text-xs focus:border-[var(--lx-accent)] focus:outline-none"
                  placeholder="输入歌名、歌手或关键字..."
                  .value=${host.biliSearchKeyword}
                  @input=${(e: Event) => {
                    host.biliSearchKeyword = (e.target as HTMLInputElement).value
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      executeBiliSearch(host.biliSearchKeyword)
                    }
                  }}
                />
                <button
                  class="px-3 py-1.5 rounded bg-[var(--lx-accent)] text-white text-xs font-medium hover:opacity-90 flex items-center gap-1 disabled:opacity-50"
                  ?disabled=${host.biliSearching || !host.biliSearchKeyword.trim()}
                  @click=${() => executeBiliSearch(host.biliSearchKeyword)}
                >
                  <span class="${host.biliSearching ? 'i-carbon-renew animate-spin' : 'i-carbon-search'} text-xs"></span>
                  <span>${host.biliSearching ? '搜索中' : '搜索'}</span>
                </button>
              </div>

              <div class="flex-1 overflow-y-auto no-scrollbar space-y-2 min-h-0">
                ${
                  host.biliSearching
                    ? html`
                      <div class="flex flex-col items-center justify-center py-12 opacity-40 gap-2">
                        <div class="i-carbon-renew animate-spin text-2xl"></div>
                        <span class="text-xs">正在搜索 B站视频...</span>
                      </div>
                    `
                    : host.biliSearchResults.length === 0
                      ? html`
                      <div class="flex flex-col items-center justify-center py-12 opacity-40 text-xs">
                        暂无搜索结果
                      </div>
                    `
                      : (() => {
                          const currentBvidMatch = draft.value?.match(/(BV[0-9a-zA-Z]{10})/i)?.[1]?.toLowerCase()
                          return host.biliSearchResults.map((item) => {
                            const isCurrent = Boolean(currentBvidMatch && item.bvid.toLowerCase() === currentBvidMatch)
                            return html`
                            <div
                              class="flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer group bg-[var(--lx-bg-alt)] hover:bg-[var(--lx-hover)] ${
                                isCurrent
                                  ? 'border-[var(--lx-accent)]'
                                  : 'border-[var(--lx-border)] hover:border-[var(--lx-accent)]'
                              }"
                              @click=${() => {
                                host.draft = { ...draft, type: 'bili', value: item.bvid }
                                host.biliSearchModalOpen = false
                                showToast(`已选择：${item.title} (${item.bvid})`, 'success')
                              }}
                            >
                              <div class="relative flex-none">
                                <img
                                  src="${item.pic}"
                                  referrerpolicy="no-referrer"
                                  loading="lazy"
                                  class="w-24 h-15 rounded object-cover bg-black/20"
                                  alt=""
                                />
                                <span class="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.2 rounded font-mono">
                                  ${item.durationStr}
                                </span>
                              </div>
                              <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5 gap-1.5">
                                <div class="flex items-center gap-1.5">
                                  ${
                                    isCurrent
                                      ? html`<span class="flex-none text-[10px] px-1.5 py-0.2 rounded bg-[var(--lx-accent)] text-white font-medium">当前选用</span>`
                                      : ''
                                  }
                                  <span class="text-xs font-medium line-clamp-2 leading-relaxed transition-colors ${
                                    isCurrent
                                      ? 'text-[var(--lx-accent)] font-semibold'
                                      : 'text-[var(--lx-text)] group-hover:text-[var(--lx-accent)]'
                                  }">
                                    ${item.title}
                                  </span>
                                </div>
                                <div class="flex items-center flex-wrap gap-2 text-[11px] opacity-65">
                                  <a
                                    href="https://www.bilibili.com/video/${item.bvid}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    @click=${(e: MouseEvent) => e.stopPropagation()}
                                    title="在 B站 打开原视频"
                                    class="font-mono text-[11px] hover:text-[var(--lx-accent)] hover:underline flex items-center gap-0.5 select-all"
                                  >
                                    <span>${item.bvid}</span>
                                    <span class="i-carbon-launch text-[10px]"></span>
                                  </a>
                                  <span>·</span>
                                  <span class="truncate max-w-[120px]">${item.author}</span>
                                  <span>·</span>
                                  <span>${formatPlayCount(item.play)}播放</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                class="flex-none px-2.5 py-1 text-xs rounded transition-all ${
                                  isCurrent
                                    ? 'border border-[var(--lx-accent)] text-[var(--lx-accent)] font-medium bg-transparent flex items-center gap-1 cursor-default'
                                    : 'bg-[var(--lx-accent)] text-white opacity-85 group-hover:opacity-100 cursor-pointer'
                                }"
                              >
                                ${isCurrent ? html`<span class="i-carbon-checkmark text-xs"></span>已选用` : '选用'}
                              </button>
                            </div>
                          `
                          })
                        })()
                }
              </div>
            </div>
          </div>
        `
            : ''
        }
      `
    }
  }
)
