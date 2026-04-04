import { playListSchema } from 'src/common/types'
import z from 'zod'
import {
  Action,
  Api,
  AssetsReturner,
  any,
  JsonRetutner,
  type RouteWith,
  standardJsonReturnErrorSchema,
  VirtualResourceReturner,
  virtualResourceReturnSchema
} from '@/romi'
import {
  addSongHandler,
  getAudioFilesHandler,
  getPlaylistHandler,
  removeSongHandler,
  setSongOrderHandler,
  setSongSourceHandler,
  syncHandler
} from './actions'
import type { AppState } from './common'

const getPlaylist = Api.new(
  getPlaylistHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonRetutner()
)

const setSongSource = Api.new(
  setSongSourceHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonRetutner()
)

const addSong = Api.new(
  addSongHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonRetutner()
)

const setSongOrder = Api.new(
  setSongOrderHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonRetutner()
)

const removeSong = Api.new(
  removeSongHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonRetutner()
)

const sync = Api.new(
  syncHandler,
  z.object({ playlist: playListSchema }),
  standardJsonReturnErrorSchema,
  new JsonRetutner()
)

const getAudioFiles = Api.new(
  getAudioFilesHandler,
  virtualResourceReturnSchema,
  virtualResourceReturnSchema,
  new VirtualResourceReturner()
)

const assets = Api.new(
  Action.empty(),
  z.object(),
  z.never(),
  new AssetsReturner(['dist', 'public'], async (reqRaw, resRaw) => {
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
  })
)

export const appRoute = {
  getPlaylist,
  setSongSource,
  addSong,
  setSongOrder,
  removeSong,
  sync,
  getAudioFiles,
  [any]: assets
} satisfies RouteWith<AppState>
