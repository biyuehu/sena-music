import './about-page'
import './add-song-modal'
import './edit-song-modal'
import './settings-page'
import './theme-toggle'
import './toast'
import { html, type TemplateResult } from 'lit-html'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import type { Known } from '@/romi/utils/types'
import { defineComponent, Ref, State } from '@/romi/web'
import type { Playlist, SongInfo } from '../../common/types'
import { PLAYLIST_SONG_ORDER_GAP } from '../../server/constant'
import { httpClient } from '../service/client'
import { getDesktopBridge, isDesktopApp } from '../service/desktop'
import { AudioVisualizer } from '../service/visualizer'
import { extractCoverColor, formatTime, getRandomNextIndex, getSongUrl } from '../utils'
import {
  findActiveLyricIndex,
  getStoredLyricPreference,
  mergeThreeTrackLyrics,
  type ParsedLyricLine,
  saveStoredLyricPreference
} from '../utils/lyric'
import { type AppRoute, getAppRoute } from '../utils/router'
import { Storage } from '../utils/storage'
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
  play: (index: number, onlyLoad?: boolean, startTime?: number) => Promise<void>
  toggle: () => void
  next: (isAuto?: boolean) => void
  prev: () => void
  switchMode: () => void
  seek: (e: MouseEvent | Known) => void
  setVolume: (volume: number) => void
  openEditModal: (song: SongInfo, e: Event) => void
  toggleFullscreen: () => void
  syncPlaylist: () => void
  openAddSongModal: () => void
  updateSongOrder: (id: string, newIndex: number) => void
  removeSong: (id: string) => void
  seekToTime: (time: number, autoPlay?: boolean) => void
  seekToRatio: (ratio: number, previewOnly?: boolean) => void
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
    searchTerm: State<string>(''),
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
    currentRoute: State<AppRoute>(getAppRoute()),
    visualizer: Ref<AudioVisualizer | null>(null),
    visualizerEnabled: State<boolean>(Storage.get<boolean>('visualizer-enabled').unwrapOr(true)),
    coverColorBgEnabled: State<boolean>(Storage.get<boolean>('cover-color-bg-enabled').unwrapOr(true)),
    coverColor: State<string | null>(null)
  },
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
      `,

    connectedCallback: (host): (() => void) => {
      const randomHistory: string[] = []
      let isPlayingFromHistory = false
      let currentCoverUrl: string | undefined

      const updateCoverColor = (coverUrl?: string): void => {
        currentCoverUrl = coverUrl
        if (!coverUrl) {
          host.coverColor = null
          return
        }
        extractCoverColor(coverUrl).then((color) => {
          if (currentCoverUrl === coverUrl) host.coverColor = color
        })
      }

      const savePlaybackSong = (index: number, song?: SongInfo): void => {
        if (!song) return
        Storage.set('play-song', `${index}|${song.id}|${song.name}`)
      }

      const savePlaybackTime = (time: number): void => {
        Storage.set('play-time', Math.floor(time * 10) / 10)
      }

      const updatePlaylistPreservingCurrent = (newPlaylist: Playlist): void => {
        const currentSong =
          host.currentIndex >= 0 && host.currentIndex < host.playlist.length ? host.playlist[host.currentIndex] : null
        host.playlist = newPlaylist

        if (currentSong) {
          const newIndex = newPlaylist.findIndex((s) => s.id === currentSong.id)
          if (newIndex !== -1) {
            host.currentIndex = newIndex
            savePlaybackSong(newIndex, newPlaylist[newIndex])
            if (newPlaylist[newIndex].cover !== currentCoverUrl) updateCoverColor(newPlaylist[newIndex].cover)
          } else {
            host.currentIndex = Math.max(-1, Math.min(host.currentIndex, newPlaylist.length - 1))
          }
        }
      }

      const loadPlaylist = (): void => {
        httpClient
          .getPlaylist()
          .then((playlist) =>
            playlist.match({
              Right: ({ playlist }) => {
                host.playlist = playlist
                host.playlistError = Nothing()
                const lastPlayStorage = Storage.get<string>('play-song')
                if (lastPlayStorage.isNothing()) return
                const raw = lastPlayStorage.value
                let targetIndex = -1
                const parts = raw.split('|')

                if (parts.length >= 3) {
                  const [indexStr, cachedId, cachedName] = parts
                  const parsedIndex = parseInt(indexStr, 10)
                  targetIndex = playlist.findIndex((s) => s.id === cachedId)
                  if (targetIndex === -1 && cachedName) {
                    targetIndex = playlist.findIndex((s) => s.name === cachedName)
                  }
                  if (
                    targetIndex === -1 &&
                    !Number.isNaN(parsedIndex) &&
                    parsedIndex >= 0 &&
                    parsedIndex < playlist.length
                  ) {
                    if (playlist[parsedIndex].name === cachedName) {
                      targetIndex = parsedIndex
                    }
                  }
                }

                if (targetIndex === -1) {
                  Storage.remove('play-song')
                  Storage.remove('play-time')
                  return
                }

                const savedTime = Math.max(0, Storage.get<number>('play-time').unwrapOr(0))
                savePlaybackSong(targetIndex, playlist[targetIndex])
                host.actions?.play(targetIndex, true, savedTime)
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
      let lastVolume = host.volume > 0 ? host.volume : 0.5
      let lyricScrollTimeout: NodeJS.Timeout | null = null

      const ensureVisualizer = (): void => {
        if (!host.visualizerEnabled || !host.isFullscreen) {
          if (host.visualizer) host.visualizer.setFullscreen(false)
          return
        }
        const root = host.shadowRoot
        if (!root) return
        const canvas = root.getElementById('fullscreen-visualizer-canvas') as HTMLCanvasElement | null
        if (!canvas) return

        if (!host.visualizer) {
          host.visualizer = new AudioVisualizer({ canvas, audio })
        } else {
          host.visualizer.attachCanvas(canvas)
        }
        host.visualizer.setFullscreen(true)
        host.visualizer.setPlaying(host.isPlaying)
      }

      const handleVisualizerToggle = (e: Event): void => {
        const detail = (e as CustomEvent<{ enabled: boolean }>).detail
        host.visualizerEnabled = detail.enabled
        if (host.visualizer) {
          host.visualizer.setEnabled(detail.enabled)
        }
        if (detail.enabled && host.isFullscreen) {
          setTimeout(ensureVisualizer, 60)
        }
      }
      document.addEventListener('visualizer-toggle', handleVisualizerToggle)

      const handleCoverColorBgToggle = (e: Event): void => {
        const detail = (e as CustomEvent<{ enabled: boolean }>).detail
        host.coverColorBgEnabled = detail.enabled
      }
      document.addEventListener('cover-color-bg-toggle', handleCoverColorBgToggle)

      let isAutoMatchingBili = false

      const updateMediaSession = (song?: SongInfo, isPlaying = false): void => {
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          if (song) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: song.name,
              artist: song.artists.join(' / '),
              album: '星之声',
              artwork: song.cover ? [{ src: song.cover, sizes: '512x512', type: 'image/jpeg' }] : []
            })
          }
          navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
        }

        const bridge = getDesktopBridge()
        if (bridge) {
          bridge.syncPlaybackState({
            isPlaying,
            title: song?.name,
            artist: song?.artists?.join(' / ')
          })
        }
      }

      const syncMediaPosition = (): void => {
        if (
          typeof navigator !== 'undefined' &&
          'mediaSession' in navigator &&
          'setPositionState' in navigator.mediaSession &&
          !Number.isNaN(audio.duration) &&
          audio.duration > 0
        ) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              playbackRate: audio.playbackRate || 1,
              position: Math.min(audio.currentTime, audio.duration)
            })
          } catch {}
        }
      }

      const fallbackNext = (index: number, error?: string): void => {
        const autoNextEnabled = Storage.get<boolean>('auto-next-on-error').unwrapOr(true)
        const shouldAutoNext =
          autoNextEnabled && host.isUserManuallyPlaying && host.playMode !== 'stop' && host.playMode !== 'single-loop'
        host.isPlaying = false
        updateMediaSession(host.playlist[index], false)
        if (host.visualizer) host.visualizer.setPlaying(false)
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

      const handlePlayError = async (index: number, error?: string): Promise<void> => {
        const currentSong = host.playlist[index]
        const autoMatchBiliEnabled = Storage.get<boolean>('auto-match-bili-on-error').unwrapOr(true)

        if (currentSong && currentSong.type === 'netease' && autoMatchBiliEnabled && !isAutoMatchingBili) {
          isAutoMatchingBili = true
          host.isPlaying = false
          if (host.visualizer) host.visualizer.setPlaying(false)
          if (host.playErrorTimeout !== null) clearTimeout(host.playErrorTimeout)
          showToast(`「${currentSong.name}」播放失败，正在尝试匹配 B站音源...`, 'info')

          try {
            const result = await httpClient.autoMatchBiliSong({ songId: currentSong.id })
            if (result.isRight()) {
              const { matched, playlist } = result.value
              updatePlaylistPreservingCurrent(playlist)
              showToast(`已自动匹配并绑定 B站音源：${matched.title}`, 'success')
              isAutoMatchingBili = false
              if (host.currentIndex !== -1) {
                host.actions?.play(host.currentIndex)
              }
              return
            }
          } catch (e) {
            console.error('Failed to auto match bilibili song:', e)
          }

          showToast('未能匹配到合适 B站音源', 'error')
          isAutoMatchingBili = false
        }

        fallbackNext(index, error)
      }

      const actions: PlayerActions = {
        play: async (index: number, onlyLoad = false, startTime = 0): Promise<void> => {
          host.showVolumeBar = false
          if (index < 0 || index >= host.playlist.length) return
          if (host.playErrorTimeout !== null) {
            clearTimeout(host.playErrorTimeout)
            host.playErrorTimeout = null
          }

          if (
            !onlyLoad &&
            !isPlayingFromHistory &&
            host.currentIndex >= 0 &&
            host.currentIndex !== index &&
            host.currentIndex < host.playlist.length &&
            host.playlist[host.currentIndex]
          ) {
            randomHistory.push(host.playlist[host.currentIndex].id)
            if (randomHistory.length > 100) randomHistory.shift()
          }
          isPlayingFromHistory = false
          host.isUserManuallyPlaying = !onlyLoad
          audio.currentTime = 0
          audio.pause()
          host.currentIndex = index
          host.progress = 0
          host.currentTime = startTime > 0 ? formatTime(startTime) : '00:00'
          host.duration = '00:00'

          savePlaybackSong(index, host.playlist[index])

          if (startTime <= 0) {
            savePlaybackTime(0)
          } else {
            savePlaybackTime(startTime)
          }

          const currentSong = host.playlist[index]
          updateCoverColor(currentSong?.cover)
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
                    const checkTime = audio.currentTime > 0 ? audio.currentTime : startTime
                    host.activeLyricIndex = findActiveLyricIndex(host.lyrics, checkTime)
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
            if (startTime > 0) {
              const applyStartTime = () => {
                audio.removeEventListener('loadedmetadata', applyStartTime)
                audio.removeEventListener('canplay', applyStartTime)
                if (startTime > 0 && (Number.isNaN(audio.duration) || startTime < audio.duration)) {
                  try {
                    audio.currentTime = startTime
                  } catch {}
                  if (!Number.isNaN(audio.duration) && audio.duration > 0) {
                    host.progress = (audio.currentTime / audio.duration) * 100 || 0
                    host.currentTime = formatTime(audio.currentTime)
                    host.duration = formatTime(audio.duration)
                  }
                  if (host.lyrics.length > 0) {
                    host.activeLyricIndex = findActiveLyricIndex(host.lyrics, audio.currentTime)
                    setTimeout(() => host.actions?.scrollToActiveLyric(false), 60)
                  }
                }
              }
              audio.addEventListener('loadedmetadata', applyStartTime, { once: true })
              audio.addEventListener('canplay', applyStartTime, { once: true })
            }
            if (onlyLoad) {
              updateMediaSession(host.playlist[index], false)
              return
            }
            await audio.play()
            host.isPlaying = true
            if (host.visualizer) host.visualizer.setPlaying(true)
            savePlaybackSong(host.currentIndex, host.playlist[host.currentIndex])
            updateMediaSession(host.playlist[index], true)
          } catch (err) {
            if ((err as { name?: string })?.name === 'AbortError') {
              return
            }
            if ((err as { name?: string })?.name === 'NotAllowedError') {
              host.isPlaying = false
              updateMediaSession(host.playlist[index], false)
              return
            }
            console.error('Play failed:', err)
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
            updateMediaSession(host.playlist[host.currentIndex], false)
            return
          }
          if (host.isPlaying) {
            host.isUserManuallyPlaying = false
            audio.pause()
            host.isPlaying = false
            if (host.visualizer) host.visualizer.setPlaying(false)
            updateMediaSession(host.playlist[host.currentIndex], false)
          } else {
            host.isUserManuallyPlaying = true
            audio
              .play()
              .then(() => {
                host.isPlaying = true
                if (host.visualizer) host.visualizer.setPlaying(true)
                updateMediaSession(host.playlist[host.currentIndex], true)
              })
              .catch(() => handlePlayError(host.currentIndex))
          }
        },
        next: (isAuto = false): void => {
          host.showVolumeBar = false
          if (host.playlist.length === 0) return
          if (isAuto && host.playMode === 'stop') return
          if (!isAuto) host.isUserManuallyPlaying = true
          if (host.playMode === 'single-loop') {
            host.actions?.play(host.currentIndex)
            return
          }
          host.actions?.play(
            host.playMode === 'random'
              ? getRandomNextIndex(host.playlist.length, host.currentIndex)
              : (host.currentIndex + 1) % host.playlist.length
          )
        },
        prev: (): void => {
          host.showVolumeBar = false
          if (host.playlist.length === 0) return
          host.isUserManuallyPlaying = true

          if (host.playMode === 'random') {
            while (randomHistory.length > 0) {
              const prevId = randomHistory.pop()
              if (!prevId) continue
              const targetIndex = host.playlist.findIndex((s) => s.id === prevId)
              if (targetIndex !== -1 && targetIndex !== host.currentIndex) {
                isPlayingFromHistory = true
                host.actions?.play(targetIndex)
                return
              }
            }
            host.actions?.play((host.currentIndex - 1 + host.playlist.length) % host.playlist.length)
            return
          }

          host.actions?.play((host.currentIndex - 1 + host.playlist.length) % host.playlist.length)
        },
        switchMode: (): void => {
          host.showVolumeBar = false
          const modes: PlayMode[] = ['list-loop', 'random', 'single-loop', 'stop']
          host.playMode = modes[(modes.indexOf(host.playMode) + 1) % modes.length]
          Storage.set('play-mode', host.playMode)
        },
        seekToRatio: (ratio: number, previewOnly = false): void => {
          host.showVolumeBar = false
          const boundedRatio = Math.max(0, Math.min(1, ratio))
          host.progress = boundedRatio * 100
          if (!Number.isNaN(audio.duration) && audio.duration > 0) {
            const targetTime = boundedRatio * audio.duration
            host.currentTime = formatTime(targetTime)
            if (!previewOnly) {
              audio.currentTime = targetTime
              savePlaybackTime(targetTime)
              host.isUserScrollingLyrics = false
              if (host.lyrics.length > 0) {
                host.activeLyricIndex = findActiveLyricIndex(host.lyrics, targetTime)
                setTimeout(() => host.actions?.scrollToActiveLyric(true), 10)
              }
            }
          }
        },
        seek: (e: Known): void => {
          const value = parseFloat(e?.target?.value ?? e)
          if (!Number.isNaN(value)) host.actions?.seekToRatio(value / 100, false)
        },
        setVolume: (volume: number): void => {
          if (volume > 0) lastVolume = volume
          audio.volume = host.volume = volume
          Storage.set('play-volume', volume)
        },
        toggleFullscreen: (): void => {
          host.showVolumeBar = false
          host.isFullscreen = !host.isFullscreen
          if (host.isFullscreen) {
            setTimeout(() => {
              host.actions?.scrollToActiveLyric(false)
              ensureVisualizer()
            }, 60)
          } else if (host.visualizer) {
            host.visualizer.setFullscreen(false)
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
                  updatePlaylistPreservingCurrent(playlist)
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
                updatePlaylistPreservingCurrent(playlist)
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
                updatePlaylistPreservingCurrent(playlist)
              },
              Left: ({ error }) => {
                console.error('Failed to remove song:', error)
                showToast(`删除失败：${error}`, 'error')
              }
            })
          )
        },
        seekToTime: (time: number, autoPlay = true): void => {
          audio.currentTime = time
          savePlaybackTime(audio.currentTime)
          host.isUserScrollingLyrics = false
          if (!Number.isNaN(audio.duration) && audio.duration > 0) {
            host.progress = (time / audio.duration) * 100
            host.currentTime = formatTime(time)
          }
          if (host.lyrics.length > 0) {
            host.activeLyricIndex = findActiveLyricIndex(host.lyrics, time)
            setTimeout(() => host.actions?.scrollToActiveLyric(true), 10)
          }
          if (autoPlay && !host.isPlaying) {
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
          for (const el of lineEls) {
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
          }
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
      let lastSavedProgressTime = 0
      const savePlaybackProgress = (time: number): void => {
        if (Math.abs(time - lastSavedProgressTime) >= 1) {
          lastSavedProgressTime = time
          savePlaybackTime(time)
        }
      }

      audio.onloadedmetadata = (): void => {
        if (!Number.isNaN(audio.duration) && audio.duration > 0) {
          const currentSong = host.playlist[host.currentIndex]
          if (
            currentSong &&
            currentSong.type === 'netease' &&
            !isAutoMatchingBili &&
            (audio.duration <= 32 ||
              (host.lyrics.length > 0 &&
                host.lyrics[host.lyrics.length - 1].time > audio.duration + 20 &&
                audio.duration <= 60))
          ) {
            audio.pause()
            audio.currentTime = 0
            showToast(`「${currentSong.name}」检测到试听片段，正在自动匹配备选音源...`, 'info')
            handlePlayError(host.currentIndex, '试听片段')
            return
          }

          host.duration = formatTime(audio.duration)
          if (!host.isDragging) {
            host.progress = (audio.currentTime / audio.duration) * 100 || 0
            host.currentTime = formatTime(audio.currentTime)
          }
          syncMediaPosition()
        }
      }

      audio.ontimeupdate = (): void => {
        if (!host.isDragging && !Number.isNaN(audio.duration)) {
          host.progress = (audio.currentTime / audio.duration) * 100 || 0
          host.currentTime = formatTime(audio.currentTime)
          host.duration = formatTime(audio.duration)
          savePlaybackProgress(audio.currentTime)
          syncMediaPosition()
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
      audio.onpause = (): void => {
        if (host.visualizer) host.visualizer.setPlaying(false)
        if (!Number.isNaN(audio.currentTime) && audio.currentTime > 0) {
          savePlaybackTime(audio.currentTime)
        }
        updateMediaSession(host.playlist[host.currentIndex], false)
      }
      audio.onended = (): void => {
        savePlaybackTime(0)
        const currentSong = host.playlist[host.currentIndex]
        if (
          currentSong &&
          currentSong.type === 'netease' &&
          !isAutoMatchingBili &&
          !Number.isNaN(audio.duration) &&
          audio.duration <= 32
        ) {
          showToast(`「${currentSong.name}」试听结束，正在尝试匹配 B站音源...`, 'info')
          handlePlayError(host.currentIndex, '试听片段')
          return
        }

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
                updatePlaylistPreservingCurrent(playlist)
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
                updatePlaylistPreservingCurrent(playlist)
                showToast('更新成功', 'success')
                if (host.playlist[host.currentIndex]?.id === e.detail.id) {
                  audio.src = ''
                  host.actions?.play(host.currentIndex)
                }
              },
              Left: ({ error }) => showToast(`更新失败：${error || '未知错误'}`, 'error')
            })
          )
          .catch((err) => {
            console.error('Failed to set song source:', err)
            showToast('更新异常', 'error')
          })
          .finally(() => {
            host.editModalOpen = false
            host.editingSong = null
          })
      }

      document.addEventListener('add-song', handleAdd)
      document.addEventListener('edit-song-save', handleEdit)

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
        const path = e.composedPath()
        const target = path[0] as HTMLElement | undefined
        const isInput =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)

        if (e.key === 'Escape') {
          if (isInput) {
            target?.blur()
            return
          }
          if (host.contextMenu.visible) {
            host.actions?.closeContextMenu()
            return
          }
          if (host.addModalOpen) {
            host.addModalOpen = false
            return
          }
          if (host.editModalOpen) {
            host.editModalOpen = false
            return
          }
          if (host.isFullscreen) {
            host.actions?.toggleFullscreen()
            return
          }
          return
        }

        if (isInput) return

        if (e.code === 'Space' || e.code === 'MediaPlayPause' || e.key === 'MediaPlayPause') {
          e.preventDefault()
          host.actions?.toggle()
          return
        }

        if (
          e.code === 'BracketLeft' ||
          e.code === 'MediaTrackPrevious' ||
          e.key === 'MediaTrackPrevious' ||
          (!isDesktopApp() && (e.ctrlKey || e.altKey || e.metaKey) && e.code === 'ArrowLeft')
        ) {
          e.preventDefault()
          host.actions?.prev()
          return
        }

        if (
          e.code === 'BracketRight' ||
          e.code === 'MediaTrackNext' ||
          e.key === 'MediaTrackNext' ||
          (!isDesktopApp() && (e.ctrlKey || e.altKey || e.metaKey) && e.code === 'ArrowRight')
        ) {
          e.preventDefault()
          host.actions?.next()
          return
        }

        if (e.code === 'ArrowLeft' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault()
          if (!Number.isNaN(audio.duration) && audio.duration > 0) {
            const targetTime = Math.max(0, (audio.currentTime || 0) - 5)
            host.actions?.seekToTime(targetTime, host.isPlaying)
          }
          return
        }

        if (e.code === 'ArrowRight' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault()
          if (!Number.isNaN(audio.duration) && audio.duration > 0) {
            const targetTime = Math.min(audio.duration, (audio.currentTime || 0) + 5)
            host.actions?.seekToTime(targetTime, host.isPlaying)
          }
          return
        }

        if (e.code === 'ArrowUp' && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault()
          const nextVol = Math.min(1, Math.round((host.volume + 0.05) * 100) / 100)
          host.actions?.setVolume(nextVol)
          return
        }

        if (e.code === 'ArrowDown' && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault()
          const nextVol = Math.max(0, Math.round((host.volume - 0.05) * 100) / 100)
          host.actions?.setVolume(nextVol)
          return
        }

        if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault()
          if (host.volume > 0) {
            lastVolume = host.volume
            host.actions?.setVolume(0)
          } else {
            host.actions?.setVolume(lastVolume > 0 ? lastVolume : 0.5)
          }
          return
        }

        if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault()
          host.actions?.toggleFullscreen()
          return
        }

        if ((e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault()
          host.actions?.switchMode()
          return
        }

        if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault()
          const root = host.shadowRoot
          const searchInput = root?.querySelector('input[type="text"]') as HTMLInputElement | null
          if (searchInput) {
            searchInput.focus()
            searchInput.select()
          }
          return
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
      const handleBeforeUnload = (): void => {
        if (!Number.isNaN(audio.currentTime) && audio.currentTime > 0) {
          savePlaybackTime(audio.currentTime)
        }
      }

      window.addEventListener('beforeunload', handleBeforeUnload)
      window.addEventListener('click', handleGlobalClick)
      window.addEventListener('contextmenu', handleGlobalContextMenu)
      window.addEventListener('keydown', handleGlobalKeyDown)
      window.addEventListener('resize', handleGlobalResize)

      const volume = Storage.get<number>('play-volume')
      const mode = Storage.get<PlayMode>('play-mode')
      if (volume.isJust()) host.actions.setVolume(volume.value)
      if (mode.isJust()) host.playMode = mode.value

      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', () => host.actions?.toggle())
          navigator.mediaSession.setActionHandler('pause', () => host.actions?.toggle())
          navigator.mediaSession.setActionHandler('previoustrack', () => host.actions?.prev())
          navigator.mediaSession.setActionHandler('nexttrack', () => host.actions?.next())
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime != null) host.actions?.seek(details.seekTime)
          })
          navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            const offset = details.seekOffset || 5
            if (!Number.isNaN(audio.duration) && audio.duration > 0) {
              host.actions?.seek(Math.max(0, audio.currentTime - offset))
            }
          })
          navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const offset = details.seekOffset || 5
            if (!Number.isNaN(audio.duration) && audio.duration > 0) {
              host.actions?.seek(Math.min(audio.duration, audio.currentTime + offset))
            }
          })
        } catch (err) {
          console.warn('Failed to bind MediaSession action handlers:', err)
        }
      }

      let unsubscribeDesktop: (() => void) | undefined
      const setupDesktopBridge = (): void => {
        const desktopBridge = getDesktopBridge()
        if (desktopBridge && !unsubscribeDesktop) {
          unsubscribeDesktop = desktopBridge.onPlayerCommand((command) => {
            switch (command) {
              case 'toggle':
                host.actions?.toggle()
                break
              case 'prev':
                host.actions?.prev()
                break
              case 'next':
                host.actions?.next()
                break
              case 'volumeUp':
                host.actions?.setVolume(Math.min(1, Math.round((host.volume + 0.05) * 100) / 100))
                break
              case 'volumeDown':
                host.actions?.setVolume(Math.max(0, Math.round((host.volume - 0.05) * 100) / 100))
                break
            }
          })
          const current = host.playlist[host.currentIndex]
          if (current) {
            desktopBridge.syncPlaybackState({
              isPlaying: host.isPlaying,
              title: current.name,
              artist: current.artists?.join(' / ')
            })
          }
        }
      }

      const handleDesktopReady = (): void => {
        setupDesktopBridge()
      }
      window.addEventListener('sena-desktop-ready', handleDesktopReady)

      if (isDesktopApp()) {
        setupDesktopBridge()
        if (!unsubscribeDesktop) {
          const timer = setInterval(() => {
            setupDesktopBridge()
            if (unsubscribeDesktop) clearInterval(timer)
          }, 100)
          setTimeout(() => clearInterval(timer), 5000)
        }
      }

      return (): void => {
        window.removeEventListener('sena-desktop-ready', handleDesktopReady)
        if (unsubscribeDesktop) unsubscribeDesktop()
        document.removeEventListener('visualizer-toggle', handleVisualizerToggle)
        document.removeEventListener('cover-color-bg-toggle', handleCoverColorBgToggle)
        if (host.visualizer) {
          host.visualizer.destroy()
          host.visualizer = null
        }
        audio.pause()
        audio.src = ''
        if (host.playErrorTimeout !== null) clearTimeout(host.playErrorTimeout)
        if (lyricScrollTimeout !== null) clearTimeout(lyricScrollTimeout)
        document.removeEventListener('add-song', handleAdd)
        document.removeEventListener('edit-song-save', handleEdit)
        window.removeEventListener('hashchange', handleRouteChange)
        window.removeEventListener('popstate', handleRouteChange)
        window.removeEventListener('beforeunload', handleBeforeUnload)
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
      <div
        class="group relative py-2.5 -my-2 flex items-center cursor-pointer w-full select-none touch-none"
        @pointerdown=${(e: PointerEvent) => {
          e.preventDefault()
          const track = e.currentTarget as HTMLElement
          track.setPointerCapture(e.pointerId)
          host.isDragging = true
          host.showVolumeBar = false
          const rect = track.getBoundingClientRect()
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          host.actions?.seekToRatio(ratio, true)
        }}
        @pointermove=${(e: PointerEvent) => {
          if (!host.isDragging) return
          const track = e.currentTarget as HTMLElement
          const rect = track.getBoundingClientRect()
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          host.actions?.seekToRatio(ratio, true)
        }}
        @pointerup=${(e: PointerEvent) => {
          if (!host.isDragging) return
          const track = e.currentTarget as HTMLElement
          try {
            track.releasePointerCapture(e.pointerId)
          } catch {}
          const rect = track.getBoundingClientRect()
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          host.actions?.seekToRatio(ratio, false)
          host.isDragging = false
        }}
        @pointercancel=${(e: PointerEvent) => {
          if (!host.isDragging) return
          const track = e.currentTarget as HTMLElement
          try {
            track.releasePointerCapture(e.pointerId)
          } catch {}
          host.isDragging = false
        }}
      >
        <div class="relative h-1.5 w-full bg-[var(--lx-border)] rounded-full overflow-visible pointer-events-none">
          <div class="absolute top-0 left-0 h-full bg-[var(--lx-accent)] rounded-full" style="width: ${host.progress}%"></div>
          <div
            class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md border-2 border-[var(--lx-accent)] transition-transform ${
              host.isDragging
                ? 'scale-125'
                : 'scale-0 group-hover:scale-100 sm:scale-0 sm:group-hover:scale-100 max-sm:scale-100'
            }"
            style="left: ${host.progress}%"
          ></div>
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
          <button @click=${() => host.actions?.prev()} title="上一首 (Ctrl+← / [)" class="i-carbon-skip-back-filled text-xl hover:text-[var(--lx-accent)] transition-colors"></button>
          <button @click=${() => host.actions?.toggle()} title="${host.isPlaying ? '暂停 (Space)' : '播放 (Space)'}" class="w-12 h-12 rounded-full bg-[var(--lx-accent)] text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform">
            <div class="${host.isPlaying ? 'i-carbon-pause-filled' : 'i-carbon-play-filled-alt'} text-2xl"></div>
          </button>
          <button @click=${() => host.actions?.next()} title="下一首 (Ctrl+→ / ])" class="i-carbon-skip-forward-filled text-xl hover:text-[var(--lx-accent)] transition-colors"></button>
        </div>

        <div class="flex items-center justify-end gap-4 ${isFull ? '' : 'w-1/3'}">
          <span class="${host.isFullscreen ? '' : 'hidden sm:block'} font-mono text-md opacity-40">${host.currentTime} <span class="hidden md:inline">/ ${host.duration}</span></span>
          
          <div class="${modeIcons[host.playMode]} text-lg cursor-pointer hover:opacity-100 opacity-40" title="${modeTitles[host.playMode]} (O)" @click=${() => host.actions?.switchMode()}></div>

          <div class="relative flex items-center">
            <div class="absolute bottom-full right-0 mb-10 px-4 py-3 bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] rounded-2xl shadow-2xl transition-all duration-200 origin-bottom-right hover:bg-[var(--lx-bg-alt)]
                        ${host.showVolumeBar ? 'scale-100 opacity-100 visible' : 'scale-90 opacity-0 invisible pointer-events-none'}"
                 @click=${(e: Event) => e.stopPropagation()}>
              
              <div class="flex items-center gap-3 w-40">
                <div
                  class="relative flex-1 py-2.5 -my-2 flex items-center cursor-pointer select-none touch-none"
                  @pointerdown=${(e: PointerEvent) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const track = e.currentTarget as HTMLElement
                    track.setPointerCapture(e.pointerId)
                    const rect = track.getBoundingClientRect()
                    const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                    host.actions?.setVolume(Math.round(vol * 1000) / 1000)
                  }}
                  @pointermove=${(e: PointerEvent) => {
                    if ((e.buttons & 1) === 0) return
                    const track = e.currentTarget as HTMLElement
                    const rect = track.getBoundingClientRect()
                    const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                    host.actions?.setVolume(Math.round(vol * 1000) / 1000)
                  }}
                  @pointerup=${(e: PointerEvent) => {
                    const track = e.currentTarget as HTMLElement
                    try {
                      track.releasePointerCapture(e.pointerId)
                    } catch {}
                    const rect = track.getBoundingClientRect()
                    const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                    host.actions?.setVolume(Math.round(vol * 1000) / 1000)
                  }}
                >
                  <div class="relative w-full h-1 bg-[var(--lx-border)] rounded-full pointer-events-none">
                    <div class="absolute top-0 left-0 h-full bg-[var(--lx-accent)] rounded-full" style="width: ${host.volume * 100}%"></div>
                    <div
                      class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-[var(--lx-accent)] rounded-full shadow-sm pointer-events-none"
                      style="left: ${host.volume * 100}%"
                    ></div>
                  </div>
                </div>
                <span class="font-mono text-[10px] font-bold opacity-60 w-8 text-right">${Math.round(host.volume * 100)}%</span>
              </div>
            </div>

            <div class="i-carbon-volume-up text-xl cursor-pointer ${host.showVolumeBar ? 'text-[var(--lx-accent)]' : 'opacity-40 hover:opacity-100'}"
                 title="音量调节 (↑ / ↓ / M静音)"
                 @click=${(e: Event) => {
                   e.stopPropagation()
                   host.showVolumeBar = !host.showVolumeBar
                 }}>
            </div>
          </div>

          ${!isFull ? html`<div class="hidden md:block i-carbon-maximize opacity-40 hover:opacity-100 cursor-pointer text-lg" title="全屏歌词 (F)" @click=${() => host.actions?.toggleFullscreen()}></div>` : ''}
        </div>
      </div>
    </div>

    <style>
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
              ${host.lyrics.map((line, index) => {
                const isActive = index === host.activeLyricIndex
                const isPast = index < host.activeLyricIndex

                return html`
                  <div
                    data-lyric-index="${index}"
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
            class="song-context-menu fixed z-[150] w-52 bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] rounded-xl shadow-2xl py-1.5 text-xs text-[var(--lx-text)] select-none backdrop-blur-md"
            style="top: ${y}px; left: ${x}px;"
            @click=${(e: Event) => e.stopPropagation()}
            @contextmenu=${(e: Event) => e.preventDefault()}
          >
            <style>
              .song-context-menu [class^="i-"],
              .song-context-menu [class*=" i-"] {
                filter: var(--lx-icon-filter, none) !important;
              }
              .song-context-menu .i-carbon-trash-can {
                filter: invert(40%) sepia(90%) saturate(2500%) hue-rotate(335deg) brightness(1.1) !important;
              }
            </style>
            <div class="px-3 py-1.5 border-b border-[var(--lx-border)] mb-1">
              <div class="font-bold truncate">${song.name}</div>
              <div class="text-[10px] text-[var(--lx-text-muted)] truncate">${song.artists.join(' & ')}</div>
            </div>

            <div
              @click=${() => {
                host.actions?.play(index)
                host.actions?.closeContextMenu()
              }}
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)]"
            >
              <div class="i-carbon-play-filled-alt text-sm opacity-70 shrink-0"></div>
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
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)]"
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
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)]"
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
              class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)]"
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
                class="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[var(--lx-hover)]"
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
                  : 'cursor-pointer hover:bg-[var(--lx-hover)]'
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
                  : 'cursor-pointer hover:bg-[var(--lx-hover)]'
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
      <settings-page ?hidden=${host.currentRoute !== 'settings'} class="${host.currentRoute === 'settings' ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'hidden'}"></settings-page>
      <about-page ?hidden=${host.currentRoute !== 'about'} class="${host.currentRoute === 'about' ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'hidden'}"></about-page>
      <div ?hidden=${host.currentRoute !== 'playlist'} class="${host.currentRoute === 'playlist' ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'hidden'}">
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
          <button @click=${() => host.actions?.syncPlaylist()} title="同步歌单" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm bg-[var(--lx-accent)] text-white hover:opacity-90 transition-opacity font-medium">
            <div class="i-carbon-renew ${host.isSyncing ? 'animate-spin' : ''}"></div><span class="hidden sm:inline">同步歌单</span>
          </button>
          <button @click=${() => (host.isPlaying ? showToast('播放中无法添加歌曲') : host.actions?.openAddSongModal())} title="添加歌曲" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors">
            <div class="i-carbon-add"></div><span class="hidden sm:inline">添加歌曲</span>
          </button>
          <theme-toggle></theme-toggle>
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
      </div>
      <footer class="flex-none h-24 md:h-20 border-t border-[var(--lx-border)] bg-[var(--lx-bg-alt)] px-4 flex items-center">
        ${commonControls(false)}
      </footer>
    </main>

    <div class="fixed inset-0 bg-[var(--lx-main)] text-[var(--lx-text)] z-100 transition-all duration-500 ${host.isFullscreen ? 'translate-y-0 opacity-100 visible' : 'translate-y-full opacity-0 pointer-events-none invisible'} flex flex-col md:flex-row md:items-center md:justify-center overflow-hidden">
      ${
        host.coverColorBgEnabled && host.coverColor && song?.cover && !host.coverErrorMap[song.cover]
          ? html`<div
              class="absolute inset-0 pointer-events-none z-0 transition-opacity duration-700 ease-in-out"
              style="background: radial-gradient(circle at 50% 35%, rgba(${host.coverColor}, 0.45) 0%, rgba(${host.coverColor}, 0.15) 55%, transparent 100%);"
            ></div>`
          : ''
      }
      ${
        host.visualizerEnabled
          ? html`<canvas
              id="fullscreen-visualizer-canvas"
              class="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-75"
            ></canvas>`
          : ''
      }
      <button @click=${() => host.actions?.toggleFullscreen()}
        class="absolute top-5 left-5 i-carbon-chevron-down text-3xl opacity-40 hover:opacity-100 hover:text-[var(--lx-accent)] z-20">
      </button>

      <div class="flex flex-col md:hidden w-full h-full max-h-[100dvh] px-6 pt-12 pb-6 overflow-hidden relative z-10">
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

      <div class="hidden md:flex w-full max-w-6xl h-full max-h-[85vh] px-12 flex-row items-center justify-between gap-16 relative z-10">
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
