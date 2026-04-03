import z from 'zod'
import { Action, Api, AssetsReturner, any, BodyExtracter, JsonRetutner, type RouteWith } from '@/romi'
import { Right } from '@/romi/utils/adt/either'
import { getUserHandler } from './actions'
import type { AppState } from './common'

const getUser = Api.new(
  getUserHandler,
  z.object({ a: z.number() }),
  z.object({ error: z.string() }),
  new JsonRetutner()
)

const addDecade = Api.new(
  Action.empty<AppState>()
    .use([new BodyExtracter(z.object({ date: z.date() }))] as const)
    .bind(async ([body]) => {
      return Right({ date: new Date(body.date.getFullYear() + 10, body.date.getMonth(), body.date.getDate()) })
    }),
  z.object({ date: z.date() }),
  z.never(),
  new JsonRetutner()
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
  getUser,
  addDecade,
  [any]: assets
} satisfies RouteWith<AppState>
