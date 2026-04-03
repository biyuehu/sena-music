import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { StrictEmptyObject } from '@/romi/utils/types'
import { Api, any, type RouteWith } from './api'

export const DEFAULT_APPLICATION_OPTIONS: ApplicationOptions<StrictEmptyObject> = {
  state: () => ({})
}

export interface ApplicationOptions<State extends object> {
  state: (reqRaw: IncomingMessage) => State
}

export function defineRouter<S extends object, R extends RouteWith<S>>(
  state: (req: IncomingMessage) => S,
  route: R
): { route: R; state: (req: IncomingMessage) => S } {
  return { route, state }
}

const StateTypeParameterCanNotBe = 'State type parameter can not be {}' as const

type MustProvideStateTypeParameter = typeof StateTypeParameterCanNotBe

type BanIllegalStateType<State, Result> = keyof State extends never ? MustProvideStateTypeParameter : Result

export function createApp<State extends object = StrictEmptyObject>(
  route: BanIllegalStateType<State, RouteWith<State>>,
  options: BanIllegalStateType<State, ApplicationOptions<State>>
): BanIllegalStateType<State, Server> {
  if (typeof route !== 'object' || typeof options !== 'object') throw new Error(StateTypeParameterCanNotBe)
  return createServer((req, res) => {
    const url = req.url ?? ''
    const path = url.split('?')[0]
    const segments = path.split('/').filter(Boolean)
    let current = route as RouteWith<State>[string]

    for (const segment of segments) {
      if (current instanceof Api) break
      const next: RouteWith<State>[string] = current[segment]
      if (next === void 0) break
      current = next
    }

    if (current instanceof Api) {
      current.run(req, res, (options as ApplicationOptions<State>).state(req) as State)
      return
    }

    ;(route as RouteWith<State>)[any]?.run(req, res, (options as ApplicationOptions<State>).state(req))
  }) as BanIllegalStateType<State, Server>
}
