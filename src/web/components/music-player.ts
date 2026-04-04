import './side-nav'
import './add-song-modal'
import './edit-song-modal'
import './toast'
import { html, type TemplateResult } from 'lit-html'
import type { Playlist, SongInfo } from 'src/common/types'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import type { Known } from '@/romi/utils/types'
import { defineComponent, Ref, State } from '@/romi/web'
import { httpClient } from '../client'
import { formatTime } from '../utils'
import { showToast } from './toast'

type PlayMode = 'list-loop' | 'random' | 'single-loop' | 'stop'

interface PlayerActions {
  play: (index: number) => Promise<void>
  toggle: () => void
  next: (isAuto?: boolean) => void
  prev: () => void
  switchMode: () => void
  seek: (e: MouseEvent | Known) => void
  setVolume: (val: number) => void
  openEditModal: (song: SongInfo, e: Event) => void
  toggleFullscreen: () => void
  syncPlaylist: () => void
  openAddSongModal: () => void
  updateSongOrder: (id: string, newIndex: number) => void
}

defineComponent(
  'music-player',
  {
    playlist: State<Playlist>([]),
    playlistLoading: State<boolean>(true),
    playlistError: State<Maybe<string>>(Nothing()),
    currentIndex: State<number>(-1),
    isPlaying: State<boolean>(false),
    playMode: State<PlayMode>('list-loop'),
    progress: State<number>(0),
    currentTime: State<string>('00:00'),
    duration: State<string>('00:00'),
    volume: State<number>(0.7),
    isFullscreen: State<boolean>(false),
    isSyncing: State<boolean>(false),
    isAdding: State<boolean>(false),
    isDragging: State<boolean>(false),
    dragStartIndex: State<number>(-1),
    dragOverIndex: State<number>(-1),
    addModalOpen: State<boolean>(false),
    editModalOpen: State<boolean>(false),
    editingSong: State<SongInfo | null>(null),
    actions: Ref<PlayerActions | null>(null),
    playErrorTimeout: Ref<NodeJS.Timeout | null>(null),
    isUserManuallyPlaying: Ref<boolean>(false),
    coverErrorMap: State<Record<string, boolean>>({})
  },
  {
    useGlobalStyles: true,
    connectedCallback: (host): (() => void) => {
      const loadPlaylist = (): void => {
        httpClient
          .getPlaylist()
          .then((playlist) =>
            playlist.match({
              Right: ({ playlist: playlistData }) => {
                host.playlist = playlistData
                host.playlistError = Nothing()
              },
              Left: () => {
                host.playlistError = Just('加载播放列表失败')
                showToast('加载失败', 'error')
              }
            })
          )
          .finally(() => {
            host.playlistLoading = false
          })
      }

      loadPlaylist()
      const audio: HTMLAudioElement = new Audio()
      audio.volume = host.volume

      const handlePlayError = (index: number): void => {
        const shouldAutoNext = host.playMode !== 'stop' && host.playMode !== 'single-loop'
        host.isPlaying = false
        if (host.playErrorTimeout !== null) clearTimeout(host.playErrorTimeout)

        if (shouldAutoNext) {
          showToast(`资源失效，2秒后跳过...`, 'error')
          host.playErrorTimeout = setTimeout(() => {
            if (host.currentIndex === index) {
              host.actions?.next(true)
            }
          }, 2000)
        } else {
          showToast(`播放失败`, 'error')
        }
      }

      const actions: PlayerActions = {
        play: async (index: number): Promise<void> => {
          if (index < 0 || index >= host.playlist.length) return
          if (host.playErrorTimeout !== null) {
            clearTimeout(host.playErrorTimeout)
            host.playErrorTimeout = null
          }
          host.currentIndex = index
          const song = host.playlist[index]
          const audioUrl =
            song.type === 'netease' ? `https://music.163.com/song/media/outer/url?id=${song.id}.mp3` : song.value
          if (!audioUrl) return handlePlayError(index)
          try {
            audio.pause()
            audio.src = audioUrl
            audio.load()
            await audio.play()
            host.isPlaying = true
          } catch (err) {
            console.error('Failed to play:', err)
            handlePlayError(index)
          }
        },
        toggle: (): void => {
          if (host.currentIndex === -1) return void host.actions?.play(0)
          if (host.isPlaying) {
            audio.pause()
            host.isPlaying = false
          } else {
            audio
              .play()
              .then(() => {
                host.isPlaying = true
              })
              .catch(() => handlePlayError(host.currentIndex))
          }
        },
        next: (isAuto = false): void => {
          if (isAuto && host.playMode === 'stop') return
          const nextIndex =
            host.playMode === 'random'
              ? Math.floor(Math.random() * host.playlist.length)
              : (host.currentIndex + 1) % host.playlist.length
          host.actions?.play(nextIndex)
        },
        prev: (): void => {
          host.actions?.play((host.currentIndex - 1 + host.playlist.length) % host.playlist.length)
        },
        switchMode: (): void => {
          const modes: PlayMode[] = ['list-loop', 'random', 'single-loop', 'stop']
          host.playMode = modes[(modes.indexOf(host.playMode) + 1) % modes.length]
          showToast(`模式: ${host.playMode}`, 'info')
        },
        seek: (e: Known): void => {
          audio.currentTime = (parseFloat(e.target.value) / 100) * audio.duration
        },
        setVolume: (val: number): void => {
          audio.volume = host.volume = val
        },
        toggleFullscreen: (): void => {
          host.isFullscreen = !host.isFullscreen
        },
        openEditModal: (song, e): void => {
          e.stopPropagation()
          host.editingSong = { ...song }
          host.editModalOpen = true
        },
        syncPlaylist: (): void => {
          host.isSyncing = true
          showToast('正在同步歌单...', 'info')
          httpClient
            .sync()
            .then((res) =>
              res.match({
                Right: ({ playlist }) => {
                  host.playlist = playlist
                  showToast('同步成功', 'success')
                },
                Left: () => showToast('同步失败', 'error')
              })
            )
            .finally(() => {
              host.isSyncing = false
            })
        },
        openAddSongModal: (): void => {
          host.addModalOpen = true
        },
        updateSongOrder: (id, newIndex): void => {
          httpClient.setSongOrder({ id, order: newIndex }).then((res) =>
            res.match({
              Right: ({ playlist }) => {
                host.playlist = playlist
              },
              Left: () => showToast('排序失败', 'error')
            })
          )
        }
      }

      host.actions = actions
      audio.ontimeupdate = (): void => {
        if (!host.isDragging && !Number.isNaN(audio.duration)) {
          host.progress = (audio.currentTime / audio.duration) * 100 || 0
          host.currentTime = formatTime(audio.currentTime)
          host.duration = formatTime(audio.duration)
        }
      }
      audio.onended = (): void => {
        if (host.playMode === 'single-loop') {
          audio.currentTime = 0
          audio.play()
        } else {
          host.actions?.next(true)
        }
      }
      // audio.onerror = () => handlePlayError(host.currentIndex)

      const handleAdd = (e: Known): void => {
        host.isAdding = true
        httpClient
          .addSong(e.detail)
          .then((r) =>
            r.match({
              Right: ({ playlist }) => {
                host.playlist = playlist
                showToast('添加成功', 'success')
              },
              Left: () => showToast('添加失败', 'error')
            })
          )
          .finally(() => {
            host.isAdding = false
            host.addModalOpen = false
          })
      }

      const handleEdit = (e: Known): void => {
        httpClient
          .setSongSource({ id: e.detail.id, source: e.detail.type, value: e.detail.value })
          .then((r) =>
            r.match({
              Right: ({ playlist }) => {
                host.playlist = playlist
                showToast('更新成功', 'success')
              },
              Left: () => showToast('更新失败', 'error')
            })
          )
          .finally(() => {
            host.editModalOpen = false
          })
      }

      document.addEventListener('add-song', handleAdd)
      document.addEventListener('edit-song-save', handleEdit)

      return (): void => {
        audio.pause()
        audio.src = ''
        if (host.playErrorTimeout !== null) clearTimeout(host.playErrorTimeout)
        document.removeEventListener('add-song', handleAdd)
        document.removeEventListener('edit-song-save', handleEdit)
      }
    },
    render: (host): TemplateResult => {
      const song = host.playlist[host.currentIndex]
      const modeIcons: Record<PlayMode, string> = {
        'list-loop': 'i-carbon-repeat',
        random: 'i-carbon-shuffle',
        'single-loop': 'i-carbon-repeat-one',
        stop: 'i-carbon-stop-outline'
      }

      const renderCover = (url?: string, className = '') => {
        const isBadCover = url ? host.coverErrorMap[url] : true
        if (isBadCover || !url) {
          return html`<div class="${className} flex items-center justify-center bg-[var(--lx-border)] text-[var(--lx-text-muted)]">
            <div class="i-carbon-music text-2xl opacity-20"></div>
          </div>`
        }
        return html`<img src=${url} class=${className} @error=${() => {
          host.coverErrorMap = { ...host.coverErrorMap, [url]: true }
        }} />`
      }

      const commonControls = (isFull: boolean) => html`
        <div class="flex flex-col gap-3 w-full">
          <div class="group relative h-1.5 bg-[var(--lx-border)] cursor-pointer w-full rounded-full overflow-hidden">
            <input type="range" min="0" max="100" step="0.1" .value=${host.progress.toString()}
                   @mousedown=${() => {
                     host.isDragging = true
                   }}
                   @mouseup=${(e: Known) => {
                     host.isDragging = false
                     host.actions?.seek(e)
                   }}
                   @input=${(e: Known) => {
                     host.progress = parseFloat(e.target.value)
                   }}
                   class="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" />
            <div class="absolute h-full bg-[var(--lx-accent)] pointer-events-none" style="width: ${host.progress}%">
              <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform border border-[var(--lx-accent)]"></div>
            </div>
          </div>
          <div class="flex items-center justify-between">
            <div class="${isFull ? 'hidden' : 'flex items-center gap-3 w-1/3 min-w-0 cursor-pointer'}" @click=${() => host.actions?.toggleFullscreen()}>
              ${renderCover(song?.cover, 'w-10 h-10 rounded bg-[var(--lx-main)] object-cover border border-[var(--lx-border)]')}
              <div class="min-w-0">
                <div class="text-sm font-bold truncate">${song?.name ?? '未在播放'}</div>
                <div class="text-[10px] text-[var(--lx-text-muted)] truncate">${song?.artists?.join(' & ') ?? '...'}</div>
              </div>
            </div>
            <div class="flex items-center gap-6">
              <button @click=${() => host.actions?.prev()} class="i-carbon-skip-back-filled text-xl hover:text-[var(--lx-accent)]"></button>
              <button @click=${() => host.actions?.toggle()} class="w-11 h-11 rounded-full bg-[var(--lx-accent)] text-white flex items-center justify-center shadow-lg active:scale-90">
                <div class="${host.isPlaying ? 'i-carbon-pause-filled' : 'i-carbon-play-filled-alt'} text-2xl"></div>
              </button>
              <button @click=${() => host.actions?.next()} class="i-carbon-skip-forward-filled text-xl hover:text-[var(--lx-accent)]"></button>
            </div>
            <div class="flex items-center justify-end gap-4 ${isFull ? '' : 'w-1/3'}">
              <span class="ml-4 font-mono text-[10px] opacity-40">${host.currentTime} / ${host.duration}</span>
              <div class="${modeIcons[host.playMode]} text-lg cursor-pointer hover:text-[var(--lx-accent)]" @click=${() => host.actions?.switchMode()}></div>
              <div class="flex items-center gap-2 group/vol">
                <div class="i-carbon-volume-up text-lg opacity-40 group-hover/vol:opacity-100"></div>
                <input type="range" min="0" max="1" step="0.01" .value=${host.volume.toString()} 
                  @input=${(e: Known) => host.actions?.setVolume(parseFloat(e.target.value))} 
                  class="w-16 h-1 accent-[var(--lx-accent)] cursor-pointer appearance-none bg-transparent outline-none border-none ring-0 focus:ring-0 focus:outline-none" 
                  style="-webkit-appearance: none; outline: none; border: none;" />
              </div>
              ${!isFull ? html`<div class="i-carbon-maximize opacity-40 hover:opacity-100 cursor-pointer text-lg" @click=${() => host.actions?.toggleFullscreen()}></div>` : ''}
            </div>
          </div>
        </div>
      `

      return html`
    <div class="flex h-screen bg-[var(--lx-main)] text-[var(--lx-text)] font-sans overflow-hidden select-none">
      <side-nav></side-nav>
      <main class="flex-1 flex flex-col min-w-0 relative order-1 md:order-2">
        <div class="flex items-center gap-2 px-4 py-3 border-b border-[var(--lx-border)] bg-[var(--lx-bg-alt)]">
          <button @click=${() => host.actions?.syncPlaylist()} class="flex items-center gap-2 px-3 py-2 rounded text-sm bg-[var(--lx-accent)] text-white">
            <div class="i-carbon-renew ${host.isSyncing ? 'animate-spin' : ''}"></div><span>同步歌单</span>
          </button>
          <button @click=${() => (host.isPlaying ? showToast('播放中无法添加歌曲') : host.actions?.openAddSongModal())} class="flex items-center gap-2 px-3 py-2 rounded text-sm bg-[var(--lx-border)]">
            <div class="i-carbon-add"></div><span>添加歌曲</span>
          </button>
        </div>
        <div class="grid grid-cols-[40px_1fr_80px_70px] md:grid-cols-[50px_1fr_180px_100px_80px] font-bold text-[var(--lx-text-muted)] bg-[var(--lx-bg-alt)] px-4 py-2 text-xs border-b border-[var(--lx-border)]">
          <span>#</span><span>歌曲名</span><span>歌手</span><span class="hidden md:block">类型</span><span class="text-right pr-4">操作</span>
        </div>
        <div class="flex-1 overflow-y-auto no-scrollbar relative">
          ${host.playlist.map(
            (item, index) => html`
            <div @dblclick=${() => host.actions?.play(index)} class="grid grid-cols-[40px_1fr_80px_70px] md:grid-cols-[50px_1fr_180px_100px_80px] items-center px-4 py-2.5 group cursor-pointer border-b border-[var(--lx-border)] hover:bg-[#f2f2f2] ${host.currentIndex === index ? 'text-[var(--lx-accent)]' : ''}">
              <div class="flex items-center gap-1 text-xs opacity-40"><div class="i-carbon-drag-vertical opacity-0 group-hover:opacity-100"></div><span class="font-mono">${(index + 1).toString().padStart(2, '0')}</span></div>
              <div class="truncate pr-4 font-medium">${item.name}</div>
              <div class="truncate text-xs opacity-60">${item.artists.join(' & ')}</div>
              <div class="hidden md:block text-[9px] border border-[var(--lx-border)] px-1 rounded uppercase opacity-40 w-fit">${item.type}</div>
              <div class="flex justify-end pr-4 opacity-0 group-hover:opacity-100"><button @click=${(e: Event) => (host.isPlaying ? showToast('播放中无法编辑歌曲') : host.actions?.openEditModal(item, e))} class="i-carbon-edit hover:text-[var(--lx-accent)]"></button></div>
            </div>`
          )}
        </div>
        <footer class="h-24 md:h-20 border-t border-[var(--lx-border)] bg-[var(--lx-bg-alt)] px-4 flex items-center shrink-0">
          ${commonControls(false)}
        </footer>
      </main>

      <div class="fixed inset-0 bg-[var(--lx-main)] z-100 transition-transform duration-500 ${host.isFullscreen ? 'translate-y-0' : 'translate-y-full'} flex items-center justify-center">
        <button @click=${() => host.actions?.toggleFullscreen()} class="absolute top-8 left-8 i-carbon-chevron-down text-4xl opacity-40 hover:opacity-100 hover:text-[var(--lx-accent)]"></button>
        <div class="w-full max-w-6xl px-12 flex flex-col md:flex-row items-center justify-center gap-16 md:gap-24">
          <div class="flex flex-col gap-10 w-64 md:w-[420px] shrink-0">
            ${renderCover(song?.cover, 'w-full aspect-square rounded-2xl shadow-2xl object-cover border border-[var(--lx-border)]')}
            ${commonControls(true)}
          </div>
          <div class="flex-1 flex flex-col gap-6 text-center md:text-left">
            <h1 class="text-4xl md:text-7xl font-black text-[var(--lx-accent)] tracking-tighter">${song?.name ?? '未知曲目'}</h1>
            <p class="text-2xl md:text-3xl opacity-40 font-medium">${song?.artists?.join(', ') ?? '未知艺术家'}</p>
          </div>
        </div>
      </div>

      ${host.addModalOpen ? html`<add-song-modal .isOpen=${true} @close=${() => (host.addModalOpen = false)}></add-song-modal>` : ''}
      ${host.editModalOpen && host.editingSong ? html`<edit-song-modal .isOpen=${true} .song=${host.editingSong} @close=${() => (host.editModalOpen = false)}></edit-song-modal>` : ''}
    </div>`
    }
  }
)
