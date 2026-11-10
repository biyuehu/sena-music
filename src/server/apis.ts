import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import z from 'zod'
import {
  Action,
  Api,
  AssetsReturner,
  any,
  JsonReturner,
  type RouteWith,
  standardJsonReturnErrorSchema,
  VirtualResourceReturner,
  virtualResourceReturnSchema
} from '@/romi'
import {
  autoMatchBiliSongResponseSchema,
  cacheInfoSchema,
  lyricResultSchema,
  playListSchema,
  searchBiliSongResponseSchema,
  settingsSchema
} from '../common/types'
import {
  addSongHandler,
  autoMatchBiliSongHandler,
  cleanCacheHandler,
  getBiliAudioFileHandler,
  getCacheInfoHandler,
  getLocalAudioFilesHandler,
  getLyricHandler,
  getPlaylistHandler,
  getQQAudioFileHandler,
  getSettingsHandler,
  getYoutubeAudioFileHandler,
  removeSongHandler,
  saveCustomLyricHandler,
  searchBiliSongHandler,
  setSettingsHandler,
  setSongOrderHandler,
  setSongSourceHandler,
  syncHandler
} from './actions'
import type { AppState } from './common'

const getPlaylist = Api.new(
  getPlaylistHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const setSongSource = Api.new(
  setSongSourceHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const addSong = Api.new(
  addSongHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const setSongOrder = Api.new(
  setSongOrderHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const removeSong = Api.new(
  removeSongHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const sync = Api.new(
  syncHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const getLocalAudioFiles = Api.new(
  getLocalAudioFilesHandler,
  virtualResourceReturnSchema,
  virtualResourceReturnSchema,
  new VirtualResourceReturner()
)

const getBiliAudioFile = Api.new(
  getBiliAudioFileHandler,
  virtualResourceReturnSchema,
  virtualResourceReturnSchema,
  new VirtualResourceReturner()
)

const getYoutubeAudioFile = Api.new(
  getYoutubeAudioFileHandler,
  virtualResourceReturnSchema,
  virtualResourceReturnSchema,
  new VirtualResourceReturner()
)

const getQQAudioFile = Api.new(
  getQQAudioFileHandler,
  virtualResourceReturnSchema,
  virtualResourceReturnSchema,
  new VirtualResourceReturner()
)

const getSettings = Api.new(getSettingsHandler, settingsSchema, standardJsonReturnErrorSchema, new JsonReturner())

const setSettings = Api.new(setSettingsHandler, settingsSchema, standardJsonReturnErrorSchema, new JsonReturner())

const getCacheInfo = Api.new(getCacheInfoHandler, cacheInfoSchema, standardJsonReturnErrorSchema, new JsonReturner())

const cleanCache = Api.new(cleanCacheHandler, cacheInfoSchema, standardJsonReturnErrorSchema, new JsonReturner())

const getLyric = Api.new(getLyricHandler, lyricResultSchema, standardJsonReturnErrorSchema, new JsonReturner())

const saveCustomLyric = Api.new(
  saveCustomLyricHandler,
  z.object({ success: z.boolean() }),
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const searchBiliSong = Api.new(
  searchBiliSongHandler,
  searchBiliSongResponseSchema,
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const autoMatchBiliSong = Api.new(
  autoMatchBiliSongHandler,
  autoMatchBiliSongResponseSchema,
  standardJsonReturnErrorSchema,
  new JsonReturner()
)

const assets = Api.new(
  Action.empty(),
  z.object(),
  z.never(),
  new AssetsReturner(
    [
      process.env.SENA_ASSETS_DIR ??
        (existsSync(join(import.meta.dirname, 'static')) ? join(import.meta.dirname, 'static') : 'dist/client'),
      'public'
    ],
    async (reqRaw, resRaw) => {
      const url = reqRaw.url?.split('?')[0]
      if (url === '/logo.png' || url === '/logo.svg' || url === '/favicon.ico' || url === '/favicon.svg') {
        const logoPngPath = join(process.cwd(), 'logo.png')
        if (existsSync(logoPngPath)) {
          resRaw.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          createReadStream(logoPngPath).pipe(resRaw)
          return
        }
        const logoPath = join(process.cwd(), 'logo.svg')
        if (existsSync(logoPath)) {
          resRaw.writeHead(200, {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          })
          createReadStream(logoPath).pipe(resRaw)
          return
        }
      }
      resRaw.statusCode = 404
      resRaw.setHeader('Content-Type', 'text/html')
      resRaw.end(/* html */ `
      <html>
        <head>
          <title>404 Not Found</title>
        </head>
        <body>
          <h1>404 Not Found</h1>
          <p>The requested URL ${reqRaw.url} was not found on this server.</p>
        </body>
      </html>
      `)
    }
  )
)

export const appRoute = {
  getPlaylist,
  setSongSource,
  addSong,
  setSongOrder,
  removeSong,
  sync,
  getLocalAudioFiles,
  getBiliAudioFile,
  getYoutubeAudioFile,
  getQQAudioFile,
  getSettings,
  setSettings,
  getCacheInfo,
  cleanCache,
  getLyric,
  saveCustomLyric,
  searchBiliSong,
  autoMatchBiliSong,
  [any]: assets
} satisfies RouteWith<AppState>
