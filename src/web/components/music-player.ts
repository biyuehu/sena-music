import "./add-song-modal";
import "./edit-song-modal";
import "./toast";
import { html, type TemplateResult } from "lit-html";
import type { Playlist, SongInfo } from "src/common/types";
import { PLAYLIST_SONG_ORDER_GAP } from "src/server/constant";
import { Just, type Maybe, Nothing } from "@/romi/utils/adt/maybe";
import type { Known } from "@/romi/utils/types";
import { defineComponent, Ref, State } from "@/romi/web";
import { Cache } from "../cache";
import { httpClient } from "../client";
import { formatTime, getSongUrl } from "../utils";
import { showToast } from "./toast";
import { getEffectiveTheme, initTheme, toggleTheme } from "../theme";

type PlayMode = "list-loop" | "random" | "single-loop" | "stop";

interface PlayerActions {
  play: (index: number, onlyLoad?: boolean) => Promise<void>;
  toggle: () => void;
  next: (isAuto?: boolean) => void;
  prev: () => void;
  switchMode: () => void;
  seek: (e: MouseEvent | Known) => void;
  setVolume: (val: number) => void;
  openEditModal: (song: SongInfo, e: Event) => void;
  toggleFullscreen: () => void;
  syncPlaylist: () => void;
  openAddSongModal: () => void;
  updateSongOrder: (id: string, newIndex: number) => void;
  removeSong: (id: string) => void;
}

defineComponent(
  "music-player",
  {
    playlist: State<Playlist>([]),
    playlistLoading: State<boolean>(true),
    playlistError: State<Maybe<string>>(Nothing()),
    currentIndex: State<number>(-1),
    isPlaying: State<boolean>(false),
    playMode: State<PlayMode>("list-loop"),
    progress: State<number>(0),
    currentTime: State<string>("00:00"),
    duration: State<string>("00:00"),
    showVolumeBar: State(false),
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
    coverErrorMap: State<Record<string, boolean>>({}),
    isDark: State(getEffectiveTheme() === "dark"),
    searchTerm: State<string>(""),
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
      [class^="i-"],
      [class*=" i-"] {
        display: inline-block;
        vertical-align: middle;
        filter: var(--lx-icon-filter, none);
        transition: filter 0.2s ease, opacity 0.2s ease;
      }
      button:hover > [class^="i-"],
      button:hover > [class*=" i-"],
      div:hover > [class^="i-"],
      div:hover > [class*=" i-"] {
        filter: var(--lx-icon-hover-filter, none);
      }
      .text-white [class^="i-"],
      .text-white [class*=" i-"] {
        filter: invert(1) brightness(2) !important;
      }
      button:hover > .i-carbon-trash-can {
        filter: invert(40%) sepia(90%) saturate(2500%) hue-rotate(335deg) brightness(1.1) !important;
      }
    `,

    connectedCallback: (host): (() => void) => {
      const loadPlaylist = (): void => {
        httpClient
          .getPlaylist()
          .then((playlist) =>
            playlist.match({
              Right: ({ playlist }) => {
                host.playlist = playlist;
                host.playlistError = Nothing();
                const lastPlayCache = Cache.get<string>("play-song");
                if (lastPlayCache.isNothing()) return;
                const [indexStr, name] = lastPlayCache.value.split("|");
                const index = parseInt(indexStr, 10);
                if (
                  Number.isNaN(index) ||
                  index < 0 ||
                  index >= playlist.length ||
                  playlist[index].name !== name
                ) {
                  Cache.remove("play-song");
                  return;
                }
                host.actions?.play(index, true);
              },
              Left: ({ error }) => {
                console.error("Failed to load playlist:", error);
                host.playlistError = Just(`加载播放列表失败：${error}`);
                showToast("加载失败", "error");
              },
            }),
          )
          .finally(() => {
            host.playlistLoading = false;
          });
      };

      loadPlaylist();
      const audio: HTMLAudioElement = new Audio();
      audio.volume = host.volume;

      const handlePlayError = (index: number, error?: string): void => {
        const shouldAutoNext =
          host.playMode !== "stop" && host.playMode !== "single-loop";
        host.isPlaying = false;
        if (host.playErrorTimeout !== null) clearTimeout(host.playErrorTimeout);
        if (error) console.error(`Failed to play song ${index}:`, error);
        if (shouldAutoNext) {
          showToast(
            error
              ? `播放错误：${error}，2秒后跳过...`
              : `资源失效，2秒后跳过...`,
            "error",
          );
          host.playErrorTimeout = setTimeout(() => {
            if (host.currentIndex === index) {
              host.actions?.next(true);
            }
          }, 2000);
        } else {
          showToast(error ? `播放错误：${error}` : `播放失败`, "error");
        }
      };

      const actions: PlayerActions = {
        play: async (index: number, onlyLoad = false): Promise<void> => {
          host.showVolumeBar = false;
          if (index < 0 || index >= host.playlist.length) return;
          if (host.playErrorTimeout !== null) {
            clearTimeout(host.playErrorTimeout);
            host.playErrorTimeout = null;
          }
          audio.currentTime = 0;
          audio.pause();
          host.currentIndex = index;
          const audioUrl = await getSongUrl(host.playlist[index], showToast);
          if (audioUrl.isLeft()) {
            return handlePlayError(index, audioUrl.value);
          }
          if (!audioUrl.value) return handlePlayError(index);
          if (host.currentIndex !== index) return;
          try {
            audio.pause();
            audio.src = audioUrl.value;
            audio.load();
            if (onlyLoad) return;
            await audio.play();
            host.isPlaying = true;
            Cache.set(
              "play-song",
              `${host.currentIndex}|${host.playlist[host.currentIndex].name}`,
            );
          } catch (err) {
            console.error("Failed to play:", err);
            handlePlayError(index);
          }
        },
        toggle: (): void => {
          host.showVolumeBar = false;
          if (host.currentIndex === -1) return void host.actions?.play(0);
          if (host.isPlaying) {
            audio.pause();
            host.isPlaying = false;
          } else {
            audio
              .play()
              .then(() => {
                host.isPlaying = true;
              })
              .catch(() => handlePlayError(host.currentIndex));
          }
        },
        next: (isAuto = false): void => {
          host.showVolumeBar = false;
          if (isAuto && host.playMode === "stop") return;
          if (host.playMode === "single-loop") {
            host.actions?.play(host.currentIndex);
            return;
          }
          const nextIndex =
            host.playMode === "random"
              ? Math.floor(Math.random() * host.playlist.length)
              : (host.currentIndex + 1) % host.playlist.length;
          host.actions?.play(nextIndex);
        },
        prev: (): void => {
          host.showVolumeBar = false;
          host.actions?.play(
            (host.currentIndex - 1 + host.playlist.length) %
              host.playlist.length,
          );
        },
        switchMode: (): void => {
          host.showVolumeBar = false;
          const modes: PlayMode[] = [
            "list-loop",
            "random",
            "single-loop",
            "stop",
          ];
          host.playMode =
            modes[(modes.indexOf(host.playMode) + 1) % modes.length];
          Cache.set("play-mode", host.playMode);
        },
        seek: (e: Known): void => {
          host.showVolumeBar = false;
          audio.currentTime =
            (parseFloat(e.target.value) / 100) * audio.duration;
        },
        setVolume: (val: number): void => {
          audio.volume = host.volume = val;
          Cache.set("play-volume", val);
        },
        toggleFullscreen: (): void => {
          host.showVolumeBar = false;
          host.isFullscreen = !host.isFullscreen;
        },
        openEditModal: (song, e): void => {
          e.stopPropagation();
          host.editingSong = { ...song };
          host.editModalOpen = true;
        },
        syncPlaylist: (): void => {
          host.isSyncing = true;
          showToast("正在同步歌单...", "info");
          httpClient
            .sync()
            .then((res) =>
              res.match({
                Right: ({ playlist }) => {
                  host.playlist = playlist;
                  showToast("同步成功", "success");
                },
                Left: ({ error }) => {
                  console.error("Failed to sync playlist:", error);
                  showToast(`同步失败：${error}`, "error");
                },
              }),
            )
            .finally(() => {
              host.isSyncing = false;
            });
        },
        openAddSongModal: (): void => {
          host.addModalOpen = true;
        },
        updateSongOrder: (id, newIndex): void => {
          httpClient.setSongOrder({ id, order: newIndex }).then((res) =>
            res.match({
              Right: ({ playlist }) => {
                host.playlist = playlist;
              },
              Left: ({ error }) => {
                console.error("Failed to set song order:", error);
                showToast(`排序失败: ${error}`, "error");
              },
            }),
          );
        },
        removeSong: (id): void => {
          if (!confirm("确定要删除这首歌？")) return;
          if (id.length < 36) {
            showToast("无法删除网易云歌单原始歌曲", "warning");
            return;
          }
          httpClient.removeSong({ id }).then((res) =>
            res.match({
              Right: ({ playlist }) => {
                host.playlist = playlist;
              },
              Left: ({ error }) => {
                console.error("Failed to remove song:", error);
                showToast(`删除失败：${error}`, "error");
              },
            }),
          );
        },
      };

      host.actions = actions;
      audio.ontimeupdate = (): void => {
        if (!host.isDragging && !Number.isNaN(audio.duration)) {
          host.progress = (audio.currentTime / audio.duration) * 100 || 0;
          host.currentTime = formatTime(audio.currentTime);
          host.duration = formatTime(audio.duration);
        }
      };
      audio.onended = (): void => {
        if (host.playMode === "single-loop") {
          audio.currentTime = 0;
          audio.play();
        } else {
          host.actions?.next(true);
        }
      };
      // audio.onerror = () => handlePlayError(host.currentIndex)

      const handleAdd = (e: Known): void => {
        host.isAdding = true;
        httpClient
          .addSong(e.detail)
          .then((r) =>
            r.match({
              Right: ({ playlist }) => {
                host.playlist = playlist;
                showToast("添加成功", "success");
              },
              Left: ({ error }) => {
                console.error("Failed to add song:", error);
                showToast(`添加失败：${error}`, "error");
              },
            }),
          )
          .finally(() => {
            host.isAdding = false;
            host.addModalOpen = false;
          });
      };

      const handleEdit = (e: Known): void => {
        httpClient
          .setSongSource({
            id: e.detail.id,
            source: e.detail.source,
            value: e.detail.value,
          })
          .then((r) =>
            r.match({
              Right: ({ playlist }) => {
                host.playlist = playlist;
                showToast("更新成功", "success");
              },
              Left: () => showToast("更新失败", "error"),
            }),
          )
          .finally(() => {
            host.editModalOpen = false;
          });
      };

      document.addEventListener("add-song", handleAdd);
      document.addEventListener("edit-song-save", handleEdit);

      initTheme();
      const handleThemeChange = (e: Event) => {
        const customEvent = e as CustomEvent<{
          theme: string;
          effective: "light" | "dark";
        }>;
        host.isDark = customEvent.detail.effective === "dark";
      };
      document.addEventListener("theme-change", handleThemeChange);

      const volume = Cache.get<number>("play-volume");
      const mode = Cache.get<PlayMode>("play-mode");
      if (volume.isJust()) host.actions.setVolume(volume.value);
      if (mode.isJust()) host.playMode = mode.value;

      return (): void => {
        audio.pause();
        audio.src = "";
        if (host.playErrorTimeout !== null) clearTimeout(host.playErrorTimeout);
        document.removeEventListener("add-song", handleAdd);
        document.removeEventListener("edit-song-save", handleEdit);
        document.removeEventListener("theme-change", handleThemeChange);
      };
    },
    render: (host): TemplateResult => {
      const song = host.playlist[host.currentIndex];
      const modeIcons: Record<PlayMode, string> = {
        "list-loop": "i-carbon-repeat",
        random: "i-carbon-shuffle",
        "single-loop": "i-carbon-repeat-one",
        stop: "i-carbon-stop-outline",
      };
      const modeTitles: Record<PlayMode, string> = {
        "list-loop": "列表循环",
        random: "随机播放",
        "single-loop": "单曲循环",
        stop: "停止播放",
      };

      const filteredPlaylist = host.playlist
        .map((item, originalIndex) => ({ item, originalIndex }))
        .filter(
          ({ item }) =>
            !host.searchTerm ||
            item.name.toLowerCase().includes(host.searchTerm.toLowerCase()) ||
            item.artists.some((artist) =>
              artist.toLowerCase().includes(host.searchTerm.toLowerCase()),
            ),
        );

      const renderCover = (url?: string, className = "") => {
        const isBadCover = url ? host.coverErrorMap[url] : true;
        if (isBadCover || !url) {
          return html`<div
            class="${className} flex items-center justify-center bg-[var(--lx-border)] text-[var(--lx-text-muted)]"
          >
            <div class="i-carbon-music text-2xl opacity-20"></div>
          </div>`;
        }
        return html`<img
          src=${url}
          class=${className}
          @error=${() => {
            host.coverErrorMap = { ...host.coverErrorMap, [url]: true };
          }}
        />`;
      };
      const commonControls = (isFull: boolean) => {
        const song = host.playlist[host.currentIndex];

        return html`
          <div class="flex flex-col gap-3 w-full">
            <div
              class="group relative h-1.5 bg-[var(--lx-border)] cursor-pointer w-full rounded-full"
            >
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                .value=${host.progress.toString()}
                @mousedown=${() => {
                  host.isDragging = true;
                }}
                @mouseup=${(e: Known) => {
                  host.isDragging = false;
                  host.actions?.seek(e);
                }}
                @input=${(e: Known) => {
                  host.progress = parseFloat(e.target.value);
                }}
                class="absolute inset-0 w-full h-full opacity-0 z-20 cursor-pointer"
              />
              <div
                class="absolute h-full bg-[var(--lx-accent)] pointer-events-none rounded-full"
                style="width: ${host.progress}%"
              >
                <div
                  class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform border border-[var(--lx-accent)]"
                ></div>
              </div>
            </div>

            <div class="flex items-center justify-between relative">
              <div
                class="${isFull
                  ? "hidden"
                  : "flex items-center gap-3 w-1/3 min-w-0 cursor-pointer"}"
                @click=${() => host.actions?.toggleFullscreen()}
              >
                ${renderCover(
                  song?.cover,
                  "w-10 h-10 rounded bg-[var(--lx-main)] object-cover border border-[var(--lx-border)]",
                )}
                <div class="hidden sm:block min-w-0">
                  <div class="text-sm font-bold truncate">
                    ${song?.name ?? "未在播放"}
                  </div>
                  <div class="text-[10px] text-[var(--lx-text-muted)] truncate">
                    ${song?.artists?.join(" & ") ?? "..."}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-6">
                <button
                  @click=${() => host.actions?.prev()}
                  class="text-xl text-[var(--lx-text)] hover:text-[var(--lx-accent)] transition-colors opacity-90 hover:opacity-100 p-1"
                  title="上一首"
                >
                  <div class="i-carbon-skip-back-filled"></div>
                </button>
                <button
                  @click=${() => host.actions?.toggle()}
                  class="w-12 h-12 rounded-full bg-[var(--lx-accent)] text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                  title="${host.isPlaying ? "暂停" : "播放"}"
                >
                  <div
                    class="${host.isPlaying
                      ? "i-carbon-pause-filled"
                      : "i-carbon-play-filled-alt"} text-2xl"
                  ></div>
                </button>
                <button
                  @click=${() => host.actions?.next()}
                  class="text-xl text-[var(--lx-text)] hover:text-[var(--lx-accent)] transition-colors opacity-90 hover:opacity-100 p-1"
                  title="下一首"
                >
                  <div class="i-carbon-skip-forward-filled"></div>
                </button>
              </div>

              <div
                class="flex items-center justify-end gap-4 ${isFull
                  ? ""
                  : "w-1/3"}"
              >
                <span
                  class="${host.isFullscreen
                    ? ""
                    : "hidden sm:block"} font-mono text-xs text-[var(--lx-text-muted)]"
                  >${host.currentTime}
                  <span class="hidden md:inline">/ ${host.duration}</span></span
                >

                <div
                  class="${modeIcons[
                    host.playMode
                  ]} text-lg cursor-pointer hover:opacity-100 opacity-70 hover:text-[var(--lx-accent)] transition-colors"
                  title="${modeTitles[host.playMode]}"
                  @click=${() => host.actions?.switchMode()}
                ></div>

                <div class="relative flex items-center">
                  <div
                    class="absolute bottom-full right-0 mb-10 px-4 py-3 bg-[var(--lx-bg-alt)] border border-[var(--lx-border)] rounded-2xl shadow-2xl transition-all duration-200 origin-bottom-right hover:bg-[var(--lx-bg-alt)]
                        ${host.showVolumeBar
                      ? "scale-100 opacity-100 visible"
                      : "scale-90 opacity-0 invisible pointer-events-none"}"
                    @click=${(e: Event) => e.stopPropagation()}
                  >
                    <div class="flex items-center gap-3 w-40">
                      <div
                        class="relative flex-1 h-1 bg-[var(--lx-border)] rounded-full"
                      >
                        <div
                          class="absolute h-full bg-[var(--lx-accent)] rounded-full"
                          style="width: ${host.volume * 100}%"
                        ></div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.001"
                          .value=${host.volume.toString()}
                          @input=${(e: Known) =>
                            host.actions?.setVolume(parseFloat(e.target.value))}
                          class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div
                          class="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-[var(--lx-accent)] rounded-full shadow-sm pointer-events-none"
                          style="left: calc(${host.volume * 100}% - 6px)"
                        ></div>
                      </div>
                      <span
                        class="font-mono text-[10px] font-bold text-[var(--lx-text-muted)] w-8 text-right"
                        >${Math.round(host.volume * 100)}%</span
                      >
                    </div>
                  </div>

                  <div
                    class="i-carbon-volume-up text-xl cursor-pointer ${host.showVolumeBar
                      ? "text-[var(--lx-accent)]"
                      : "opacity-70 hover:opacity-100 hover:text-[var(--lx-accent)] transition-colors"}"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      host.showVolumeBar = !host.showVolumeBar;
                    }}
                  ></div>
                </div>

                ${!isFull
                  ? html`<div
                      class="hidden md:block i-carbon-maximize opacity-70 hover:opacity-100 hover:text-[var(--lx-accent)] cursor-pointer text-lg transition-colors"
                      @click=${() => host.actions?.toggleFullscreen()}
                    ></div>`
                  : ""}
              </div>
            </div>
          </div>

          <style>
            /* 针对精细化滑块的样式，确保点击不偏移 */
            input[type="range"] {
              -webkit-appearance: none;
              background: transparent;
              margin: 0;
            }
            input[type="range"]::-webkit-slider-thumb {
              -webkit-appearance: none;
              width: 20px;
              height: 20px;
              cursor: pointer;
            }
          </style>
        `;
      };

      return html` <div
        class="flex h-[100dvh] max-h-[100dvh] bg-[var(--lx-main)] text-[var(--lx-text)] font-sans overflow-hidden"
      >
        <main
          class="flex-1 flex flex-col min-w-0 min-h-0 relative order-1 md:order-2"
        >
          <div
            class="flex-none flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-[var(--lx-border)] bg-[var(--lx-bg-alt)]"
          >
            <div class="relative flex-1 max-w-sm min-w-[200px]">
              <div
                class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--lx-text-muted)]"
              >
                <div class="i-carbon-search"></div>
              </div>
              <input
                type="text"
                .value=${host.searchTerm}
                @input=${(e: Event) => {
                  host.searchTerm = (e.target as HTMLInputElement).value;
                }}
                placeholder="搜索歌曲或歌手..."
                class="w-full pl-9 pr-3 py-1.5 bg-[var(--lx-hover)] border border-[var(--lx-border)] rounded-full text-sm text-[var(--lx-text)] focus:outline-none focus:border-[var(--lx-accent)] transition-colors"
              />
            </div>
            <div class="flex items-center gap-2">
              <button
                @click=${() => host.actions?.syncPlaylist()}
                class="flex items-center gap-2 px-3 py-2 rounded text-sm bg-[var(--lx-accent)] text-white hover:opacity-90 transition-opacity font-medium"
              >
                <div
                  class="i-carbon-renew ${host.isSyncing ? "animate-spin" : ""}"
                ></div>
                <span>同步歌单</span>
              </button>
              <button
                @click=${() =>
                  host.isPlaying
                    ? showToast("播放中无法添加歌曲")
                    : host.actions?.openAddSongModal()}
                class="flex items-center gap-2 px-3 py-2 rounded text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] transition-colors"
              >
                <div class="i-carbon-add"></div>
                <span>添加歌曲</span>
              </button>
              <button
                @click=${() => toggleTheme()}
                class="flex items-center justify-center p-2 rounded text-sm bg-[var(--lx-hover)] hover:bg-[var(--lx-border)] border border-[var(--lx-border)] text-[var(--lx-text)] hover:text-[var(--lx-accent)] transition-colors"
                title="${host.isDark ? "切换至亮色模式" : "切换至暗色模式"}"
              >
                <div
                  class="${host.isDark
                    ? "i-carbon-moon"
                    : "i-carbon-sun"} text-base"
                ></div>
              </button>
            </div>
          </div>
          <div
            class="flex-none grid grid-cols-[40px_1fr_80px_70px] md:grid-cols-[50px_1fr_180px_100px_80px] font-bold text-[var(--lx-text-muted)] bg-[var(--lx-bg-alt)] px-4 py-2 text-xs border-b border-[var(--lx-border)]"
          >
            <span>#</span>
            <span>歌曲名</span>
            <span>歌手</span>
            <span class="hidden md:block">类型</span>
            <span class="text-right pr-4">操作</span>
          </div>
          <div class="flex-1 overflow-y-auto no-scrollbar relative min-h-0">
            ${host.playlistLoading
              ? html`
                  <div
                    class="flex flex-col items-center justify-center h-full gap-3 opacity-50 text-[var(--lx-text-muted)]"
                  >
                    <div class="i-carbon-renew animate-spin text-3xl"></div>
                    <span class="text-sm">加载中...</span>
                  </div>
                `
              : filteredPlaylist.length === 0
                ? html`
                    <div
                      class="flex flex-col items-center justify-center h-full gap-4 opacity-50 text-[var(--lx-text-muted)]"
                    >
                      <div class="i-carbon-music text-5xl"></div>
                      <div class="text-center">
                        <div class="text-sm font-medium">
                          ${host.playlist.length === 0
                            ? "还没有歌曲"
                            : "没有找到匹配的歌曲"}
                        </div>
                        <div class="text-xs mt-1">
                          ${host.playlist.length === 0
                            ? "同步歌单或手动添加歌曲"
                            : "尝试其他搜索词"}
                        </div>
                      </div>
                    </div>
                  `
                : filteredPlaylist.map(
                    ({ item, originalIndex }) =>
                      html` <div
                        @click=${() => host.actions?.play(originalIndex)}
                        class="grid grid-cols-[40px_1fr_80px_70px] md:grid-cols-[50px_1fr_180px_100px_80px] items-center px-4 py-2.5 group cursor-pointer border-b border-[var(--lx-border)] hover:bg-[var(--lx-hover)] relative ${host.currentIndex ===
                        originalIndex
                          ? "text-[var(--lx-accent)]"
                          : ""}"
                      >
                        <div
                          class="flex items-center text-xs opacity-50 font-mono"
                        >
                          <span
                            >${(originalIndex + 1)
                              .toString()
                              .padStart(2, "0")}</span
                          >
                        </div>
                        <div class="truncate pr-4 font-medium">
                          ${item.name}
                        </div>
                        <div
                          class="truncate text-xs text-[var(--lx-text-muted)]"
                        >
                          ${item.artists.join(" & ")}
                        </div>
                        <div
                          class="hidden md:block text-[9px] border border-[var(--lx-border)] px-1 rounded uppercase opacity-60 text-[var(--lx-text-muted)] w-fit"
                        >
                          ${item.type}
                        </div>
                        <div
                          class="absolute right-0 top-0 bottom-0 flex justify-end items-center pr-4 bg-gradient-to-l from-[var(--lx-hover)] via-[var(--lx-hover)] to-transparent opacity-0 group-hover:opacity-100 md:static md:bg-none md:opacity-0 md:group-hover:opacity-100 transition-opacity gap-1 text-[var(--lx-text)]"
                        >
                          ${originalIndex === 0 || host.searchTerm
                            ? ""
                            : html`<button
                                title="向上"
                                @click=${(e: Event) => {
                                  e.stopPropagation();
                                  host.isPlaying
                                    ? showToast("播放中无法调整歌曲")
                                    : host.actions?.updateSongOrder(
                                        item.id,
                                        PLAYLIST_SONG_ORDER_GAP *
                                          (originalIndex - 0.5),
                                      );
                                }}
                                class="p-1 rounded hover:bg-[var(--lx-border)] text-sm hover:text-[var(--lx-accent)] transition-colors"
                              >
                                <div class="i-carbon-arrow-up"></div>
                              </button>`}
                          ${originalIndex === host.playlist.length - 1 ||
                          host.searchTerm
                            ? ""
                            : html`<button
                                title="向下"
                                @click=${(e: Event) => {
                                  e.stopPropagation();
                                  host.isPlaying
                                    ? showToast("播放中无法调整歌曲")
                                    : host.actions?.updateSongOrder(
                                        item.id,
                                        PLAYLIST_SONG_ORDER_GAP *
                                          (originalIndex + 1.5),
                                      );
                                }}
                                class="p-1 rounded hover:bg-[var(--lx-border)] text-sm hover:text-[var(--lx-accent)] transition-colors"
                              >
                                <div class="i-carbon-arrow-down"></div>
                              </button>`}
                          <button
                            title="编辑源"
                            @click=${(e: Event) => {
                              e.stopPropagation();
                              // if (host.isPlaying && host.currentIndex === index) {
                              //   showToast('播放中无法编辑当前歌曲')
                              //   return
                              // }
                              host.isPlaying
                                ? "播放中无法编辑歌曲"
                                : host.actions?.openEditModal(item, e);
                            }}
                            class="p-1 rounded hover:bg-[var(--lx-border)] text-sm hover:text-[var(--lx-accent)] transition-colors"
                          >
                            <div class="i-carbon-edit"></div>
                          </button>
                          <button
                            title="删除"
                            @click=${(e: Event) => {
                              e.stopPropagation();
                              host.isPlaying
                                ? showToast("播放中无法删除歌曲")
                                : host.actions?.removeSong(item.id);
                            }}
                            class="p-1 rounded hover:bg-[var(--lx-border)] text-sm hover:text-red-400 transition-colors"
                          >
                            <div class="i-carbon-trash-can"></div>
                          </button>
                          ${item.id.length < 36
                            ? html`<button
                                title="跳转"
                                @click=${(e: Event) => {
                                  e.stopPropagation();
                                  window.open(
                                    `https://music.163.com/#/song?id=${item.id}`,
                                  );
                                }}
                                class="p-1 rounded hover:bg-[var(--lx-border)] text-sm hover:text-[var(--lx-accent)] transition-colors"
                              >
                                <div class="i-carbon-share"></div>
                              </button>`
                            : ""}
                        </div>
                      </div>`,
                  )}
          </div>
          <footer
            class="flex-none h-24 md:h-20 border-t border-[var(--lx-border)] bg-[var(--lx-bg-alt)] px-4 flex items-center"
          >
            ${commonControls(false)}
          </footer>
        </main>

        <div
          class="fixed inset-0 bg-[var(--lx-main)] text-[var(--lx-text)] z-100 transition-all duration-500 ${host.isFullscreen
            ? "translate-y-0 opacity-100 visible"
            : "translate-y-full opacity-0 pointer-events-none invisible"} flex flex-col md:flex-row md:items-center md:justify-center overflow-hidden"
        >
          <button
            @click=${() => host.actions?.toggleFullscreen()}
            class="absolute top-5 left-5 text-3xl opacity-70 hover:opacity-100 text-[var(--lx-text)] hover:text-[var(--lx-accent)] transition-all z-10 p-2"
            title="收起"
          >
            <div class="i-carbon-chevron-down"></div>
          </button>

          <div
            class="flex flex-col md:hidden flex-1 min-h-0 px-8 pt-16 pb-6 gap-6"
          >
            <div class="flex-1 flex items-center justify-center min-h-0">
              ${renderCover(
                song?.cover,
                "w-full max-w-[220px] aspect-square rounded-2xl shadow-2xl object-cover border border-[var(--lx-border)]",
              )}
            </div>
            <div class="flex flex-col gap-1 text-center shrink-0">
              <h1
                class="text-2xl font-black text-[var(--lx-accent)] tracking-tighter truncate"
              >
                ${song?.name ?? "未知曲目"}
              </h1>
              <p
                class="text-sm text-[var(--lx-text-muted)] font-medium truncate"
              >
                ${song?.artists?.join(", ") ?? "未知艺术家"}
              </p>
            </div>
            <div class="shrink-0">${commonControls(true)}</div>
          </div>

          <div
            class="hidden md:flex w-full max-w-6xl px-12 flex-row items-center justify-center gap-24"
          >
            <div class="flex flex-col gap-10 w-[420px] shrink-0">
              ${renderCover(
                song?.cover,
                "w-full aspect-square rounded-2xl shadow-2xl object-cover border border-[var(--lx-border)]",
              )}
              ${commonControls(true)}
            </div>
            <div class="flex-1 flex flex-col gap-6 text-left">
              <h1
                class="text-7xl font-black text-[var(--lx-accent)] tracking-tighter"
              >
                ${song?.name ?? "未知曲目"}
              </h1>
              <p class="text-3xl text-[var(--lx-text-muted)] font-medium">
                ${song?.artists?.join(", ") ?? "未知艺术家"}
              </p>
            </div>
          </div>
        </div>

        ${host.addModalOpen
          ? html`<add-song-modal
              .isOpen=${true}
              @close=${() => (host.addModalOpen = false)}
            ></add-song-modal>`
          : ""}
        ${host.editModalOpen && host.editingSong
          ? html`<edit-song-modal
              .isOpen=${true}
              .song=${host.editingSong}
              @close=${() => (host.editModalOpen = false)}
            ></edit-song-modal>`
          : ""}
      </div>`;
    },
  },
);
