import './add-song-modal'
import './edit-song-modal'
import './settings-page'
import './toast'
import { html, type TemplateResult } from 'lit-html'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import type { Known } from '@/romi/utils/types'
import { defineComponent, Ref, State } from '@/romi/web'
import type { Playlist, SongInfo } from '../../common/types'
import { PLAYLIST_SONG_ORDER_GAP } from '../../server/constant'
import { Cache } from '../cache'
import { httpClient } from '../client'
import {
  findActiveLyricIndex,
  getStoredLyricPreference,
  mergeThreeTrackLyrics,
  type ParsedLyricLine,
  saveStoredLyricPreference
} from '../lyric'
import { type AppRoute, getAppRoute } from '../router'
import { applyTheme, getEffectiveTheme, getStoredTheme, initTheme, type Theme } from '../theme'
import { formatTime, getSongUrl } from '../utils'
import { showToast } from './toast'

type PlayMode = 'list-loop' | 'random' | 'single-loop' | 'stop'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  song: SongInfo | null
  index: number
}

interface PlayerActions {
  play: (index: number, onlyLoad?: boolean) => Promise<void>
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
  removeSong: (id: string) => void
  seekToTime: (time: number) => void
  scrollToActiveLyric: (smooth?: boolean) => void
  handleLyricScroll: () => void
  openContextMenu: (e: MouseEvent, song: SongInfo, index: number) => void
  closeContextMenu: () => void
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
    showVolumeBar: State(false),
    volume: State<number>(1),
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
    coverErrorMap: State<Record<string, boolean>>({}),
    isDark: State(getEffectiveTheme() === 'dark'),
    searchTerm: State<string>(''),
    theme: State<Theme>('auto'),
    lyrics: State<ParsedLyricLine[]>([]),
    lyricStatus: State<'loading' | 'ok' | 'pure_music' | 'no_lyric'>('loading'),
    activeLyricIndex: State<number>(-1),
    lyricPref: State(getStoredLyricPreference()),
    isUserScrollingLyrics: State<boolean>(false),
    showMobileLyrics: State<boolean>(false),
    contextMenu: State<ContextMenuState>({
      visible: false,
      x: 0,
      y: 0,
      song: null,
      index: -1
    }),
    currentRoute: State<AppRoute>(getAppRoute())
  },
  {
    useGlobalStyles: true,
    styles: /* css */ `
        :host {
    /* 必须让自定义标签本身在父级 flex 中占满剩余空间 */
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0; /* 防止子元素撑破容器 */
    width: 100%;
  }
      `,

    connectedCallback: (host): (() => void) => {
      const loadPlaylist = (): void => {
        httpClient
          .getPlaylist()
          .then((playlist) =>
            playlist.match({
              Right: ({ playlist }) => {
                host.playlist = playlist
                host.playlistError = Nothing()
                const lastPlayCache = Cache.get<string>('play-song')
                if (lastPlayCache.isNothing()) return
                const [indexStr, name] = lastPlayCache.value.split('|')
                const index = parseInt(indexStr, 10)
                if (Number.isNaN(index) || index < 0 || index >= playlist.length || playlist[index].name !== name) {
                  Cache.remove('play-song')
                  return
                }
                host.actions?.play(index, true)
              },
              Left: ({ error }) => {
                console.error('Failed to load playlist:', error)
                host.playlistError = Just(`加载播放列表失败：${error}`)
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
      let lyricScrollTimeout: NodeJS.Timeout | null = null

      const handlePlayError = (index: number, error?: string): void => {
        const autoNextEnabled = Cache.get<boolean>('auto-next-on-error').unwrapOr(true)
        const shouldAutoNext =
          autoNextEnabled && host.isUserManuallyPlaying && host.playMode !== 'stop' && host.playMode !== 'single-loop'
        host.isPlaying = false
        if (host.playErrorTimeout !== null) clearTimeout(host.playErrorTimeout)
        if (error) console.error(`Failed to play song ${index}:`, error)
        if (shouldAutoNext) {
          showToast(error ? `播放错误：${error}，2秒后跳过...` : `资源失效，2秒后跳过...`, 'error')
          host.playErrorTimeout = setTimeout(() => {
            if (host.currentIndex === index && host.isUserManuallyPlaying) {
              host.actions?.next(true)
            }
          }, 2000)
        } else {
          showToast(error ? `播放错误：${error}` : `播放失败`, 'error')
        }
      }

      const actions: PlayerActions = {
        play: async (index: number, onlyLoad = false): Promise<void> => {
          host.showVolumeBar = false
          if (index < 0 || index >= host.playlist.length) return
          if (host.playErrorTimeout !== null) {
            clearTimeout(host.playErrorTimeout)
            host.playErrorTimeout = null
          }
          host.isUserManuallyPlaying = !onlyLoad
          audio.currentTime = 0
          audio.pause()
          host.currentIndex = index

          // 异步加载三轨歌词
          const currentSong = host.playlist[index]
          host.lyrics = []
          host.lyricStatus = 'loading'
          host.activeLyricIndex = -1
          httpClient.getLyric({ id: currentSong.id }).then((r) =>
            r.match({
              Right: (lyricRes) => {
                if (host.playlist[host.currentIndex]?.id !== currentSong.id) return
                if (lyricRes.status === 'ok' && lyricRes.original) {
                  host.lyrics = mergeThreeTrackLyrics(
                    lyricRes.original,
                    lyricRes.translation,
                    lyricRes.romaji,
                    lyricRes.offset ?? 0
                  )
                  host.lyricStatus = host.lyrics.length > 0 ? 'ok' : 'no_lyric'
                  if (host.lyrics.length > 0) {
                    host.activeLyricIndex = findActiveLyricIndex(host.lyrics, audio.currentTime)
                    setTimeout(() => host.actions?.scrollToActiveLyric(false), 60)
                  }
                } else if (lyricRes.status === 'pure_music') {
                  host.lyricStatus = 'pure_music'
                } else {
                  host.lyricStatus = 'no_lyric'
                }
              },
              Left: () => {
                if (host.playlist[host.currentIndex]?.id === currentSong.id) {
                  host.lyricStatus = 'no_lyric'
                }
              }
            })
          )

          const audioUrl = await getSongUrl(host.playlist[index])
          if (audioUrl.isLeft()) return handlePlayError(index, audioUrl.value)
          if (!audioUrl.value) return handlePlayError(index)
          if (host.currentIndex !== index) return
          try {
            audio.pause()
            audio.src = audioUrl.value
            audio.load()
            if (onlyLoad) return
            await audio.play()
            host.isPlaying = true
            Cache.set('play-song', `${host.currentIndex}|${host.playlist[host.currentIndex].name}`)
          } catch (err) {
            console.error('Failed to play:', err)
            handlePlayError(index)
          }
        },
        toggle: (): void => {
          host.showVolumeBar = false
          if (host.currentIndex === -1) return void host.actions?.play(0)
          if (host.playErrorTimeout !== null) {
            clearTimeout(host.playErrorTimeout)
            host.playErrorTimeout = null
            host.isUserManuallyPlaying = false
            host.isPlaying = false
            return
          }
          if (host.isPlaying) {
            host.isUserManuallyPlaying = false
            audio.pause()
            host.isPlaying = false
          } else {
            host.isUserManuallyPlaying = true
            audio
              .play()
              .then(() => {
                host.isPlaying = true
              })
              .catch(() => handlePlayError(host.currentIndex))
          }
        },
        next: (isAuto = false): void => {
          host.showVolumeBar = false
          if (isAuto && host.playMode === 'stop') return
          if (!isAuto) host.isUserManuallyPlaying = true
          if (host.playMode === 'single-loop') {
            host.actions?.play(host.currentIndex)
            return
          }
          const nextIndex =
            host.playMode === 'random'
              ? Math.floor(Math.random() * host.playlist.length)
              : (host.currentIndex + 1) % host.playlist.length
          host.actions?.play(nextIndex)
        },
        prev: (): void => {
          host.showVolumeBar = false
          host.isUserManuallyPlaying = true
          host.actions?.play((host.currentIndex - 1 + host.playlist.length) % host.playlist.length)
        },
        switchMode: (): void => {
          host.showVolumeBar = false
          const modes: PlayMode[] = ['list-loop', 'random', 'single-loop', 'stop']
          host.playMode = modes[(modes.indexOf(host.playMode) + 1) % modes.length]
          Cache.set('play-mode', host.playMode)
        },
        seek: (e: Known): void => {
          host.showVolumeBar = false
          audio.currentTime = (parseFloat(e.target.value) / 100) * audio.duration
          host.isUserScrollingLyrics = false
          if (host.lyrics.length > 0) {
            host.activeLyricIndex = findActiveLyricIndex(host.lyrics, audio.currentTime)
            setTimeout(() => host.actions?.scrollToActiveLyric(true), 10)
          }
        },
        setVolume: (val: number): void => {
          audio.volume = host.volume = val
          Cache.set('play-volume', val)
        },
        toggleFullscreen: (): void => {
          host.showVolumeBar = false
          host.isFullscreen = !host.isFullscreen
          if (host.isFullscreen) {
            setTimeout(() => {
              host.actions?.scrollToActiveLyric(false)
            }, 60)
          }
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
                Left: ({ error }) => {
                  console.error('Failed to sync playlist:', error)
                  showToast(`同步失败：${error}`, 'error')
                }
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
              Left: ({ error }) => {
                console.error('Failed to set song order:', error)
                showToast(`排序失败: ${error}`, 'error')
              }
            })
          )
        },
        removeSong: (id): void => {
          if (!confirm('确定要删除这首歌？')) return
          if (id.length < 36) {
            showToast('无法删除网易云歌单原始歌曲', 'warning')
            return
          }
          httpClient.removeSong({ id }).then((res) =>
            res.match({
              Right: ({ playlist }) => {
                host.playlist = playlist
              },
              Left: ({ error }) => {
                console.error('Failed to remove song:', error)
                showToast(`删除失败：${error}`, 'error')
              }
            })
          )
        },
        seekToTime: (time: number): void => {
          audio.currentTime = time
          host.isUserScrollingLyrics = false
          if (host.lyrics.length > 0) {
            host.activeLyricIndex = findActiveLyricIndex(host.lyrics, time)
            setTimeout(() => host.actions?.scrollToActiveLyric(true), 10)
          }
          if (!host.isPlaying) {
            audio
              .play()
              .then(() => {
                host.isPlaying = true
              })
              .catch(() => {})
          }
        },
        scrollToActiveLyric: (smooth = true): void => {
          if (host.activeLyricIndex < 0) return
          const root = host.shadowRoot
          if (!root) return
          const lineEls = root.querySelectorAll(`[data-lyric-index="${host.activeLyricIndex}"]`)
          lineEls.forEach((el) => {
            const lineEl = el as HTMLElement
            const container = lineEl.closest('.lyric-scroll-container') as HTMLElement | null
            if (container && container.clientHeight > 0) {
              const containerRect = container.getBoundingClientRect()
              const lineRect = lineEl.getBoundingClientRect()
              const offsetInsideContainer = lineRect.top - containerRect.top
              const targetTop =
                container.scrollTop + offsetInsideContainer - container.clientHeight / 2 + lineRect.height / 2
              container.scrollTo({
                top: Math.max(0, targetTop),
                behavior: smooth ? 'smooth' : 'auto'
              })
            }
          })
        },
        handleLyricScroll: (): void => {
          host.isUserScrollingLyrics = true
          if (lyricScrollTimeout !== null) clearTimeout(lyricScrollTimeout)
          lyricScrollTimeout = setTimeout(() => {
            host.isUserScrollingLyrics = false
            host.actions?.scrollToActiveLyric(true)
          }, 3500)
        },
        openContextMenu: (e: MouseEvent, song: SongInfo, index: number): void => {
          e.preventDefault()
          e.stopPropagation()
          const menuWidth = 208
          const menuHeight = 290
          const x =
            e.clientX + menuWidth > window.innerWidth ? Math.max(10, window.innerWidth - menuWidth - 10) : e.clientX
          const y =
            e.clientY + menuHeight > window.innerHeight ? Math.max(10, window.innerHeight - menuHeight - 10) : e.clientY
          host.contextMenu = {
            visible: true,
            x,
            y,
            song,
            index
          }
        },
        closeContextMenu: (): void => {
          if (host.contextMenu.visible) {
            host.contextMenu = { ...host.contextMenu, visible: false }
          }
        }
      }

      host.actions = actions
      audio.ontimeupdate = (): void => {
        if (!host.isDragging && !Number.isNaN(audio.duration)) {
          host.progress = (audio.currentTime / audio.duration) * 100 || 0
          host.currentTime = formatTime(audio.currentTime)
          host.duration = formatTime(audio.duration)
        }

        if (host.lyrics.length > 0) {
          const newIndex = findActiveLyricIndex(host.lyrics, audio.currentTime)
          if (newIndex !== host.activeLyricIndex) {
            host.activeLyricIndex = newIndex
            if (!host.isUserScrollingLyrics && newIndex >= 0) {
              host.actions?.scrollToActiveLyric()
            }
          }
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
              Left: ({ error }) => {
                console.error('Failed to add song:', error)
                showToast(`添加失败：${error}`, 'error')
              }
            })
          )
          .finally(() => {
            host.isAdding = false
            host.addModalOpen = false
          })
      }

      const handleEdit = (e: Known): void => {
        httpClient
          .setSongSource({
            id: e.detail.id,
            source: e.detail.source,
            value: e.detail.value,
            lyricConfig: e.detail.lyricConfig
          })
          .then((r) =>
            r.match({
              Right: ({ playlist }) => {
                host.playlist = playlist
                showToast('更新成功', 'success')
                if (host.playlist[host.currentIndex]?.id === e.detail.id) host.actions?.play(host.currentIndex)
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

      initTheme()
      host.theme = getStoredTheme()
      const handleThemeChange = (e: Event) => {
        const customEvent = e as CustomEvent<{ theme: string; effective: 'light' | 'dark' }>
        host.isDark = customEvent.detail.effective === 'dark'
        host.theme = customEvent.detail.theme as Theme
      }
      document.addEventListener('theme-change', handleThemeChange)

      const handleGlobalClick = (): void => {
        if (host.contextMenu.visible) {
          host.actions?.closeContextMenu()
        }
      }
      const handleGlobalContextMenu = (e: MouseEvent): void => {
        const path = e.composedPath()
        const isSongRow = path.some((el) => el instanceof HTMLElement && el.hasAttribute('data-song-row'))
        if (!isSongRow && host.contextMenu.visible) {
          host.actions?.closeContextMenu()
        }
      }
      const handleGlobalKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape' && host.contextMenu.visible) {
          host.actions?.closeContextMenu()
        }
      }
      const handleGlobalResize = (): void => {
        if (host.contextMenu.visible) {
          host.actions?.closeContextMenu()
        }
      }

      const handleRouteChange = (): void => {
        host.currentRoute = getAppRoute()
        if (host.contextMenu.visible) {
          host.actions?.closeContextMenu()
        }
      }

      window.addEventListener('hashchange', handleRouteChange)
      window.addEventListener('popstate', handleRouteChange)
      window.addEventListener('click', handleGlobalClick)
      window.addEventListener('contextmenu', handleGlobalContextMenu)
      window.addEventListener('keydown', handleGlobalKeyDown)
      window.addEventListener('resize', handleGlobalResize)

      const volume = Cache.get<number>('play-volume')
      const mode = Cache.get<PlayMode>('play-mode')
      if (volume.isJust()) host.actions.setVolume(volume.value)
      if (mode.isJust()) host.playMode = mode.value

      return (): void => {
        audio.pause()
        audio.src = ''
        if (host.playErrorTimeout !== null) clearTimeout(host.playErrorTimeout)
        if (lyricScrollTimeout !== null) clearTimeout(lyricScrollTimeout)
        document.removeEventListener('add-song', handleAdd)
        document.removeEventListener('edit-song-save', handleEdit)
        document.removeEventListener('theme-change', handleThemeChange)
        window.removeEventListener('hashchange', handleRouteChange)
        window.removeEventListener('popstate', handleRouteChange)
        window.removeEventListener('click', handleGlobalClick)
        window.removeEventListener('contextmenu', handleGlobalContextMenu)
        window.removeEventListener('keydown', handleGlobalKeyDown)
        window.removeEventListener('resize', handleGlobalResize)
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
      const modeTitles: Record<PlayMode, string> = {
        'list-loop': '列表循环',
        random: '随机播放',
        'single-loop': '单曲循环',
        stop: '停止播放'
      }

      const filteredPlaylist = host.playlist
        .map((item, originalIndex) => ({ item, originalIndex }))
        .filter(
          ({ item }) =>
            !host.searchTerm ||
            item.name.toLowerCase().includes(host.searchTerm.toLowerCase()) ||
            item.artists.some((artist) => artist.toLowerCase().includes(host.searchTerm.toLowerCase()))
        )

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
      const commonControls = (isFull: boolean) => {
        const song = host.playlist[host.currentIndex]

        return html`
    <div class="flex flex-col gap-3 w-full">
      <div class="group relative h-1.5 bg-[var(--lx-border)] cursor-pointer w-full rounded-full">
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
               class="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer" />
        <div class="absolute h-full bg-[var(--lx-accent)] pointer-events-none rounded-full" style="width: ${host.progress}%">
          <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform border border-[var(--lx-accent)]"></div>
        </div>
      </div>

      <div class="flex items-center justify-between relative">
        <div class="${isFull ? 'hidden' : 'flex items-center gap-3 w-1/3 min-w-0 cursor-pointer'}" @click=${() => host.actions?.toggleFullscreen()}>
          ${renderCover(song?.cover, 'w-10 h-10 rounded bg-[var(--lx-main)] object-cover border border-[var(--lx-border)]')}
          <div class="hidden sm:block min-w-0">
            <div class="text-sm font-bold truncate">${song?.name ?? '未在播放'}</div>
            <div class="text-[10px] text-[var(--lx-text-muted)] truncate">${song?.artists?.join(' & ') ?? '...'}</div>
          </div>
        </div>

        <div class="flex items-center gap-6">
          <button @click=${() => host.actions?.prev()} class="i-carbon-skip-back-filled text-xl hover:text-[var(--lx-accent)] transition-colors"></button>
          <button @click=${() => host.actions?.toggle()} class="w-12 h-12 rounded-full bg-[var(--lx-accent)] text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform">
            <div class="${host.isPlaying ? 'i-carbon-pause-filled' : 'i-carbon-play-filled-alt'} text-2xl"></div>
          </button>
          <button @click=${() => host.actions?.next()} class="i-carbon-skip-forward-filled text-xl hover:text-[var(--lx-accent)] transition-colors"></button>
        </div>

        <div class="flex items-center justify-end gap-4 ${isFull ? '' : 'w-1/3'}">
          <span class="${host.isFullscreen ? '' : 'hidden sm:block'} font-mono text-md opacity-40">${host.currentTime} <span class="hidden md:inline">/ ${host.duration}</span></span>
          
          <div class="${modeIcons[host.playMode]} text-lg cursor-pointer hover:opacity-100 opacity-40" title="${modeTitles[host.playMode]}" @click=${() => host.actions?.switchMode()}></div>

          <div class="relative flex items-center">
            <div class="absolute bottom-full right-0 mb-10 px-4 py-3 bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] rounded-2xl shadow-2xl transition-all duration-200 origin-bottom-right hover:bg-[var(--lx-bg-alt)]
                        ${host.showVolumeBar ? 'scale-100 opacity-100 visible' : 'scale-90 opacity-0 invisible pointer-events-none'}"
                 @click=${(e: Event) => e.stopPropagation()}>
              
              <div class="flex items-center gap-3 w-40">
                <div class="relative flex-1 h-1 bg-[var(--lx-border)] rounded-full">
                  <div class="absolute h-full bg-[var(--lx-accent)] rounded-full" style="width: ${host.volume * 100}%"></div>
                  <input type="range" min="0" max="1" step="0.001" 
                         .value=${host.volume.toString()}
                         @input=${(e: Known) => host.actions?.setVolume(parseFloat(e.target.value))}
                         class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-[var(--lx-accent)] rounded-full shadow-sm pointer-events-none"
                       style="left: calc(${host.volume * 100}% - 6px)"></div>
                </div>
                <span class="font-mono text-[10px] font-bold opacity-60 w-8 text-right">${Math.round(host.volume * 100)}%</span>
              </div>
            </div>

            <div class="i-carbon-volume-up text-xl cursor-pointer ${host.showVolumeBar ? 'text-[var(--lx-accent)]' : 'opacity-40 hover:opacity-100'}"
                 @click=${(e: Event) => {
                   e.stopPropagation()
                   host.showVolumeBar = !host.showVolumeBar
                 }}>
            </div>
          </div>

          ${!isFull ? html`<div class="hidden md:block i-carbon-maximize opacity-40 hover:opacity-100 cursor-pointer text-lg" @click=${() => host.actions?.toggleFullscreen()}></div>` : ''}
        </div>
      </div>
    </div>

    <style>
      /* 针对精细化滑块的样式，确保点击不偏移 */
      input[type=range] { -webkit-appearance: none; background: transparent; margin: 0; }
      input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; cursor: pointer; }
    </style>
  `
      }

      const hasTranslation = host.lyrics.some((l) => !!l.translation)
      const hasRomaji = host.lyrics.some((l) => !!l.romaji)

      const toggleTrackPreference = (track: 'translation' | 'romaji', e: Event): void => {
        e.stopPropagation()
        const nextPref = { ...host.lyricPref, [track]: !host.lyricPref[track] }
        host.lyricPref = nextPref
        saveStoredLyricPreference(nextPref)
      }

      const renderLyricToolbar = () => {
        if (!hasTranslation && !hasRomaji) return ''
        return html`
          <div class="flex items-center gap-1.5 select-none">
            ${
              hasTranslation
                ? html`
              <button
                class="px-2.5 py-0.5 text-xs rounded-full border transition-all cursor-pointer ${
                  host.lyricPref.translation
                    ? 'bg-[var(--lx-accent)] text-zinc-900 dark:text-zinc-950 border-[var(--lx-accent)] font-bold shadow-sm'
                    : 'bg-transparent border-[var(--lx-border)] text-[var(--lx-text-muted)] opacity-70 hover:opacity-100 hover:text-[var(--lx-text)]'
                }"
                @click=${(e: Event) => toggleTrackPreference('translation', e)}
                title="切换翻译展示"
              >
                译
              </button>`
                : ''
            }
            ${
              hasRomaji
                ? html`
              <button
                class="px-2.5 py-0.5 text-xs rounded-full border transition-all cursor-pointer ${
                  host.lyricPref.romaji
                    ? 'bg-[var(--lx-accent)] text-zinc-900 dark:text-zinc-950 border-[var(--lx-accent)] font-bold shadow-sm'
                    : 'bg-transparent border-[var(--lx-border)] text-[var(--lx-text-muted)] opacity-70 hover:opacity-100 hover:text-[var(--lx-text)]'
                }"
                @click=${(e: Event) => toggleTrackPreference('romaji', e)}
                title="切换音译/罗马音展示"
              >
                音
              </button>`
                : ''
            }
          </div>
        `
      }

      const renderLyricContent = (isMobile = false) => {
        if (host.lyricStatus === 'loading') {
          return html`
            <div class="flex flex-col items-center justify-center h-full gap-3 opacity-30">
              <div class="i-carbon-renew animate-spin text-3xl"></div>
              <span class="text-sm">正在加载歌词...</span>
            </div>
          `
        }
        if (host.lyricStatus === 'pure_music') {
          return html`
            <div class="flex flex-col items-center justify-center h-full gap-4 opacity-50">
              <div class="i-carbon-music text-5xl text-[var(--lx-accent)] animate-pulse"></div>
              <div class="text-lg font-bold tracking-wider">纯音乐，请欣赏</div>
            </div>
          `
        }
        if (host.lyricStatus === 'no_lyric' || host.lyrics.length === 0) {
          return html`
            <div class="flex flex-col items-center justify-center h-full gap-3 opacity-30">
              <div class="i-carbon-document-audio text-4xl"></div>
              <span class="text-sm">暂无歌词</span>
            </div>
          `
        }

        return html`
          <div class="relative w-full h-full overflow-hidden flex flex-col">
            <div 
              class="lyric-scroll-container flex-1 overflow-y-auto no-scrollbar scroll-smooth space-y-6 pt-[35%] pb-[45%] px-2 select-none text-left"
              style="mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 12%, black 85%, transparent 100%);"
              @wheel=${() => host.actions?.handleLyricScroll()}
              @touchmove=${() => host.actions?.handleLyricScroll()}
            >
              ${host.lyrics.map((line, idx) => {
                const isActive = idx === host.activeLyricIndex
                const isPast = idx < host.activeLyricIndex

                return html`
                  <div
                    data-lyric-index="${idx}"
                    @click=${(e: Event) => {
                      e.stopPropagation()
                      host.actions?.seekToTime(line.time)
                    }}
                    class="cursor-pointer transition-all duration-300 transform group ${
                      isActive
                        ? 'scale-105 opacity-100 font-bold origin-left'
                        : isPast
                          ? 'opacity-35 hover:opacity-75 scale-95 origin-left'
                          : 'opacity-35 hover:opacity-75 origin-left'
                    }"
                  >
                    ${
                      line.original
                        ? html`<div class="${isMobile ? 'text-lg' : 'text-2xl'} tracking-tight leading-relaxed transition-colors ${isActive ? 'text-[var(--lx-accent)] font-extrabold' : 'text-[var(--lx-text)]'}">${line.original}</div>`
                        : ''
                    }
                    ${
                      host.lyricPref.romaji && line.romaji
                        ? html`<div class="${isMobile ? 'text-xs' : 'text-sm'} opacity-60 font-mono tracking-wide mt-1 text-[var(--lx-text)]">${line.romaji}</div>`
                        : ''
                    }
                    ${
                      host.lyricPref.translation && line.translation
                        ? html`<div class="${isMobile ? 'text-sm' : 'text-base'} opacity-80 mt-1 font-normal text-[var(--lx-text)]">${line.translation}</div>`
                        : ''
                    }
                  </div>
                `
              })}
            </div>

            ${
              host.isUserScrollingLyrics && host.activeLyricIndex >= 0
                ? html`
              <button
                @click=${(e: Event) => {
                  e.stopPropagation()
                  host.isUserScrollingLyrics = false
                  host.actions?.scrollToActiveLyric(true)
                }}
                class="absolute right-4 bottom-8 z-30 px-3.5 py-1.5 bg-[var(--lx-accent)] text-zinc-900 dark:text-zinc-950 text-xs font-bold rounded-full shadow-2xl flex items-center gap-1.5 opacity-90 hover:opacity-100 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-[var(--lx-border)]"
                title="回到当前播放处"
              >
                <span class="i-carbon-chevron-down text-sm"></span> 回到当前
              </button>`
                : ''
            }
          </div>
        `
      }

      const getExternalUrl = (s: SongInfo): { label: string; url: string } | null => {
        if (s.id.length < 36) {
          return { label: '在网易云音乐打开', url: `https://music.163.com/#/song?id=${s.id}` }
        }
        if (s.type === 'qq' && s.value) {
          return { label: '在QQ音乐打开', url: `https://y.qq.com/n/ryqq/songDetail/${s.value}` }
        }
        if (s.type === 'bili' && s.value) {
          const url = s.value.startsWith('http') ? s.value : `https://www.bilibili.com/video/${s.value}`
          return { label: '在Bilibili打开', url }
        }
        if (s.type === 'youtube' && s.value) {
          const url = s.value.startsWith('http') ? s.value : `https://www.youtube.com/watch?v=${s.value}`
          return { label: '在YouTube打开', url }
        }
        if (s.type === 'url' && s.value) {
          return { label: '打开音频直链', url: s.value }
        }
        return null
      }

      const renderContextMenu = () => {
        if (!host.contextMenu.visible || !host.contextMenu.song) return ''
        const { song, index, x, y } = host.contextMenu
        const isCurrent = host.currentIndex === index
        const isCustom = song.id.length >= 36
        const external = getExternalUrl(song)

        return html`
          <div
            class="fixed z-[150] w-52 bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] rounded-xl shadow-2xl py-1.5 text-xs text-[var(--lx-text)] select-none backdrop-blur-md"
            style="top: ${y}px; left: ${x}px;"
            @click=${(e: Event) => e.stopPropagation()}
            @contextmenu=${(e: Event) => e.preventDefault()}
          >
            <div class="px-3 py-1.5 border-b border-[var(--lx-border)] mb-1">
              <div class="font-bold truncate">${song.name}</div>
              <div class="text-[10px] text-[var(--lx-text-muted)] truncate">${song.artists.join(' & ')}</div>
            </div>

            <div
              @click=${() => {
                host.actions?.play(index)
                host.actions?.closeContextMenu()
              }}
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)] hover:text-[var(--lx-accent)]"
            >
              <div class="i-carbon-play-filled-alt text-sm text-[var(--lx-accent)] shrink-0"></div>
              <span>${isCurrent && host.isPlaying ? '重新播放' : '立即播放'}</span>
            </div>

            <div
              @click=${(e: Event) => {
                if (host.isPlaying && isCurrent) {
                  showToast('播放中无法编辑当前歌曲', 'warning')
                } else {
                  host.actions?.openEditModal(song, e)
                }
                host.actions?.closeContextMenu()
              }}
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)] hover:text-[var(--lx-accent)]"
            >
              <div class="i-carbon-edit text-sm opacity-70 shrink-0"></div>
              <span>编辑源与歌词</span>
            </div>

            <div class="h-px bg-[var(--lx-border)] my-1"></div>

            <div
              @click=${() => {
                navigator.clipboard.writeText(song.name)
                showToast(`已复制：${song.name}`, 'success')
                host.actions?.closeContextMenu()
              }}
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)] hover:text-[var(--lx-accent)]"
            >
              <div class="i-carbon-copy text-sm opacity-70 shrink-0"></div>
              <span>复制歌曲名</span>
            </div>

            <div
              @click=${() => {
                const text = `${song.name} - ${song.artists.join(' & ')}`
                navigator.clipboard.writeText(text)
                showToast(`已复制：${text}`, 'success')
                host.actions?.closeContextMenu()
              }}
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)] hover:text-[var(--lx-accent)]"
            >
              <div class="i-carbon-string-text text-sm opacity-70 shrink-0"></div>
              <span>复制歌曲与歌手</span>
            </div>

            ${
              external
                ? html`
              <div
                @click=${() => {
                  window.open(external.url, '_blank')
                  host.actions?.closeContextMenu()
                }}
                class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)] hover:text-[var(--lx-accent)]"
              >
                <div class="i-carbon-launch text-sm opacity-70 shrink-0"></div>
                <span>${external.label}</span>
              </div>
            `
                : ''
            }

            <div class="h-px bg-[var(--lx-border)] my-1"></div>

            <div
              @click=${() => {
                if (index === 0 || host.searchTerm) return
                if (host.isPlaying) {
                  showToast('播放中无法调整歌曲', 'warning')
                } else {
                  host.actions?.updateSongOrder(song.id, PLAYLIST_SONG_ORDER_GAP * (index - 0.5))
                }
                host.actions?.closeContextMenu()
              }}
              class="flex items-center gap-2.5 px-3 py-1.5 transition-colors ${
                index === 0 || host.searchTerm
                  ? 'opacity-30 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-[var(--lx-hover)] hover:text-[var(--lx-accent)]'
              }"
            >
              <div class="i-carbon-arrow-up text-sm opacity-70 shrink-0"></div>
              <span>向上移动</span>
            </div>

            <div
              @click=${() => {
                if (index === host.playlist.length - 1 || host.searchTerm) return
                if (host.isPlaying) {
                  showToast('播放中无法调整歌曲', 'warning')
                } else {
                  host.actions?.updateSongOrder(song.id, PLAYLIST_SONG_ORDER_GAP * (index + 1.5))
                }
                host.actions?.closeContextMenu()
              }}
              class="flex items-center gap-2.5 px-3 py-1.5 transition-colors ${
                index === host.playlist.length - 1 || host.searchTerm
                  ? 'opacity-30 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-[var(--lx-hover)] hover:text-[var(--lx-accent)]'
              }"
            >
              <div class="i-carbon-arrow-down text-sm opacity-70 shrink-0"></div>
              <span>向下移动</span>
            </div>

            ${
              isCustom
                ? html`
              <div class="h-px bg-[var(--lx-border)] my-1"></div>
              <div
                @click=${() => {
                  if (host.isPlaying) {
                    showToast('播放中无法删除歌曲', 'warning')
                  } else {
                    host.actions?.removeSong(song.id)
                  }
                  host.actions?.closeContextMenu()
                }}
                class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-red-500/10 text-red-500"
              >
                <div class="i-carbon-trash-can text-sm shrink-0"></div>
                <span>从列表中删除</span>
              </div>
            `
                : ''
            }
          </div>
        `
      }

      return html`
  <div class="flex h-[100dvh] max-h-[100dvh] bg-[var(--lx-main)] text-[var(--lx-text)] font-sans overflow-hidden">
    <main class="flex-1 flex flex-col min-w-0 min-h-0 relative order-1 md:order-2">
      ${
        host.currentRoute === 'settings'
          ? html`<settings-page class="flex-1 min-h-0 overflow-hidden flex flex-col"></settings-page>`
          : html`
      <div class="flex-none flex flex-wrap items-center justify-end gap-4 px-4 py-3 border-b border-[var(--lx-border)] bg-[var(--lx-bg-alt)]">
        <div class="relative flex-1 max-w-sm min-w-[200px] hidden xl:block mr-auto">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--lx-text-muted)]">
            <div class="i-carbon-search"></div>
          </div>
          <input
            type="text"
            .value=${host.searchTerm}
            @input=${(e: Event) => {
              host.searchTerm = (e.target as HTMLInputElement).value
            }}
            placeholder="搜索歌曲或歌手..."
            class="w-full pl-9 pr-3 py-1.5 bg-[var(--lx-hover)] border border-[var(--lx-border)] rounded-full text-sm text-[var(--lx-text)] focus:outline-none focus:border-[var(--lx-accent)] transition-colors"
          />
        </div>
        <div class="flex items-center gap-2">
          <button @click=${() => host.actions?.syncPlaylist()} class="flex items-center gap-2 p-1.5 rounded text-sm bg-[var(--lx-accent)] text-white hover:opacity-90 transition-opacity font-medium">
            <div class="i-carbon-renew ${host.isSyncing ? 'animate-spin' : ''}"></div><span>同步歌单</span>
          </button>
          <button @click=${() => (host.isPlaying ? showToast('播放中无法添加歌曲') : host.actions?.openAddSongModal())} class="flex items-center gap-2 p-1.5 rounded text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors">
            <div class="i-carbon-add"></div><span>添加歌曲</span>
          </button>
          <button
            @click=${() => {
              const modes: Theme[] = ['light', 'dark', 'auto']
              const next = modes[(modes.indexOf(host.theme) + 1) % modes.length]
              applyTheme(next)
            }}
            class="flex items-center justify-center p-2 rounded text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] hover:text-[var(--lx-accent)] transition-colors"
            title="切换主题：${host.theme === 'light' ? '亮色' : host.theme === 'dark' ? '暗色' : '跟随系统'}"
          >
            <div class="${host.theme === 'light' ? 'i-carbon-sun' : host.theme === 'dark' ? 'i-carbon-moon' : 'i-carbon-contrast'} text-base"></div>
          </button>
        </div>
      </div>
      <div class="flex-none grid grid-cols-[40px_1fr_80px_70px] md:grid-cols-[50px_1fr_180px_100px_80px] font-bold text-[var(--lx-text-muted)] px-4 py-2 text-xs border-b border-[var(--lx-border)]">
        <span>#</span>
        <span>歌曲名</span>
        <span>歌手</span>
        <span class="hidden md:block">类型</span>
        <span class="text-right pr-4">操作</span>
      </div>
      <div class="flex-1 overflow-y-auto no-scrollbar relative min-h-0" @scroll=${() => host.actions?.closeContextMenu()}>
        ${
          host.playlistLoading
            ? html`
            <div class="flex flex-col items-center justify-center h-full gap-3 opacity-30">
              <div class="i-carbon-renew animate-spin text-3xl"></div>
              <span class="text-sm">加载中...</span>
            </div>
          `
            : filteredPlaylist.length === 0
              ? html`
            <div class="flex flex-col items-center justify-center h-full gap-4 opacity-30">
              <div class="i-carbon-music text-5xl"></div>
              <div class="text-center">
                <div class="text-sm font-medium">${host.playlist.length === 0 ? '还没有歌曲' : '没有找到匹配的歌曲'}</div>
                <div class="text-xs mt-1 opacity-70">${host.playlist.length === 0 ? '同步歌单或手动添加歌曲' : '尝试其他搜索词'}</div>
              </div>
            </div>
          `
              : filteredPlaylist.map(
                  ({ item, originalIndex }) => html`
              <div
                data-song-row
                @click=${() => window.matchMedia('(pointer: coarse)').matches && host.actions?.play(originalIndex)}
                @dblclick=${() => host.actions?.play(originalIndex)}
                @contextmenu=${(e: MouseEvent) => host.actions?.openContextMenu(e, item, originalIndex)}
                class="grid grid-cols-[40px_1fr_80px_70px] md:grid-cols-[50px_1fr_180px_100px_80px] items-center px-4 py-2.5 group cursor-pointer border-b border-[var(--lx-border)] hover:bg-[var(--lx-hover)] relative ${host.currentIndex === originalIndex ? 'text-[var(--lx-accent)]' : ''} ${host.contextMenu.visible && host.contextMenu.index === originalIndex ? 'bg-[var(--lx-hover)]' : ''}"
              >
                <div class="flex items-center text-xs opacity-40">
                  <span class="font-mono">${(originalIndex + 1).toString().padStart(2, '0')}</span>
                </div>
                <div class="truncate pr-4 font-medium">${item.name}</div>
                <div class="truncate text-xs opacity-60">${item.artists.join(' & ')}</div>
                <div class="hidden md:block text-[9px] border border-[var(--lx-border)] px-1 rounded uppercase opacity-40 w-fit">${item.type}</div>
                <div class="absolute right-0 top-0 bottom-0 flex justify-end items-center pr-4 bg-gradient-to-l from-[var(--lx-hover)] via-[var(--lx-hover)] to-transparent opacity-0 group-hover:opacity-100 md:static md:bg-none md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  ${
                    originalIndex === 0 || host.searchTerm
                      ? ''
                      : html`<button title="向上" @click=${(e: Event) => {
                          e.stopPropagation()
                          host.isPlaying
                            ? showToast('播放中无法调整歌曲')
                            : host.actions?.updateSongOrder(item.id, PLAYLIST_SONG_ORDER_GAP * (originalIndex - 0.5))
                        }} class="ml-1 i-carbon-arrow-up hover:text-[var(--lx-accent)]"></button>`
                  }
                  ${
                    originalIndex === host.playlist.length - 1 || host.searchTerm
                      ? ''
                      : html`<button title="向下" @click=${(e: Event) => {
                          e.stopPropagation()
                          host.isPlaying
                            ? showToast('播放中无法调整歌曲')
                            : host.actions?.updateSongOrder(item.id, PLAYLIST_SONG_ORDER_GAP * (originalIndex + 1.5))
                        }} class="ml-1 i-carbon-arrow-down hover:text-[var(--lx-accent)]"></button>`
                  }
                  <button title="编辑源" @click=${(e: Event) => {
                    e.stopPropagation()
                    host.isPlaying && host.currentIndex === originalIndex
                      ? showToast('播放中无法编辑当前歌曲')
                      : host.actions?.openEditModal(item, e)
                  }} class="i-carbon-edit hover:text-[var(--lx-accent)]"></button>
                  <button title="删除" @click=${(e: Event) => {
                    e.stopPropagation()
                    host.isPlaying ? showToast('播放中无法删除歌曲') : host.actions?.removeSong(item.id)
                  }} class="ml-1 i-carbon-trash-can hover:text-[var(--lx-accent)]"></button>
                  ${
                    item.id.length < 36
                      ? html`<button title="跳转" @click=${(e: Event) => {
                          e.stopPropagation()
                          window.open(`https://music.163.com/#/song?id=${item.id}`)
                        }} class="ml-1 i-carbon-share hover:text-[var(--lx-accent)]"></button>`
                      : ''
                  }
                </div>
              </div>`
                )
        }
      </div>
          `
      }
      <footer class="flex-none h-24 md:h-20 border-t border-[var(--lx-border)] bg-[var(--lx-bg-alt)] px-4 flex items-center">
        ${commonControls(false)}
      </footer>
    </main>

    <!-- 全屏沉浸式播放器（含多语言三轨歌词） -->
    <div class="fixed inset-0 bg-[var(--lx-main)] text-[var(--lx-text)] z-100 transition-all duration-500 ${host.isFullscreen ? 'translate-y-0 opacity-100 visible' : 'translate-y-full opacity-0 pointer-events-none invisible'} flex flex-col md:flex-row md:items-center md:justify-center overflow-hidden">
      <button @click=${() => host.actions?.toggleFullscreen()}
        class="absolute top-5 left-5 i-carbon-chevron-down text-3xl opacity-40 hover:opacity-100 hover:text-[var(--lx-accent)] z-10">
      </button>

      <!-- 移动端视图（支持点击切换封面/歌词模式） -->
      <div class="flex flex-col md:hidden w-full h-full max-h-[100dvh] px-6 pt-12 pb-6 overflow-hidden relative">
        <div class="flex justify-between items-center shrink-0 py-2 z-20">
          <button
            @click=${() => {
              host.showMobileLyrics = !host.showMobileLyrics
              if (host.showMobileLyrics) {
                setTimeout(() => host.actions?.scrollToActiveLyric(false), 50)
              }
            }}
            class="text-xs px-2.5 py-1 rounded-full border border-[var(--lx-border)] bg-[var(--lx-bg-alt)] text-[var(--lx-text-muted)] hover:text-[var(--lx-text)] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <span class="${host.showMobileLyrics ? 'i-carbon-image' : 'i-carbon-document-audio'}"></span>
            <span>${host.showMobileLyrics ? '切换封面' : '查看歌词'}</span>
          </button>
          ${renderLyricToolbar()}
        </div>

        <div class="flex-1 min-h-0 w-full overflow-hidden relative my-2">
          ${
            host.showMobileLyrics
              ? html`<div class="w-full h-full relative overflow-hidden">${renderLyricContent(true)}</div>`
              : html`
                <div class="w-full h-full flex flex-col items-center justify-center cursor-pointer" @click=${() => {
                  host.showMobileLyrics = true
                  setTimeout(() => host.actions?.scrollToActiveLyric(false), 50)
                }}>
                  ${renderCover(song?.cover, 'w-full max-w-[240px] aspect-square rounded-2xl shadow-2xl object-cover border border-[var(--lx-border)]')}
                </div>
              `
          }
        </div>

        <div class="shrink-0 flex flex-col gap-1 text-center py-1 z-20">
          <h1 class="text-xl font-black text-[var(--lx-accent)] tracking-tighter truncate">${song?.name ?? '未知曲目'}</h1>
          <p class="text-xs opacity-40 font-medium truncate">${song?.artists?.join(', ') ?? '未知艺术家'}</p>
        </div>

        <div class="shrink-0 pt-2 pb-1 z-20">
          ${commonControls(true)}
        </div>
      </div>

      <!-- 桌面端视图（左侧封面+控制，右侧沉浸式三轨歌词视窗） -->
      <div class="hidden md:flex w-full max-w-6xl h-full max-h-[85vh] px-12 flex-row items-center justify-between gap-16">
        <div class="flex flex-col gap-8 w-[380px] shrink-0">
          ${renderCover(song?.cover, 'w-full aspect-square rounded-2xl shadow-2xl object-cover border border-[var(--lx-border)]')}
          <div class="flex flex-col gap-1">
            <h1 class="text-3xl font-black text-[var(--lx-accent)] tracking-tighter truncate" title="${song?.name}">${song?.name ?? '未知曲目'}</h1>
            <p class="text-lg opacity-40 font-medium truncate">${song?.artists?.join(', ') ?? '未知艺术家'}</p>
          </div>
          ${commonControls(true)}
        </div>

        <div class="flex-1 h-full min-w-0 flex flex-col pb-10">
          <div class="flex-none flex justify-end items-center pb-4 border-b border-[var(--lx-border)]/50">
            ${renderLyricToolbar()}
          </div>
          <div class="flex-1 min-h-0 relative mb-6 overflow-hidden">
            ${renderLyricContent(false)}
          </div>
        </div>
      </div>
    </div>

      ${host.addModalOpen ? html`<add-song-modal .isOpen=${true} @close=${() => (host.addModalOpen = false)}></add-song-modal>` : ''}
      ${host.editModalOpen && host.editingSong ? html`<edit-song-modal .isOpen=${true} .song=${host.editingSong} @close=${() => (host.editModalOpen = false)}></edit-song-modal>` : ''}
      ${renderContextMenu()}
      </div>`
    }
  }
)
