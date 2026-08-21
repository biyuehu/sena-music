import { parse, stringify } from 'devalue'
import type z from 'zod'
import { type Either, Left, Right } from '@/romi/utils/adt/either'
import type { EmptyObject, Known } from '@/romi/utils/types'
import type { Api, Route, RouteWith } from './api'
import type { BodyExtracter, Extracter, QueryExtracter } from './extracter'
import type { JsonReturner } from './returner'

export type ClientRoute = Record<
  string,
  [EmptyObject | { body: unknown } | { query: unknown } | { body: unknown; query: unknown }, unknown, unknown]
>

export type InferExtractersToRequestData<Extracters extends Extracter<unknown>[]> = [] extends Extracters
  ? EmptyObject
  : Extracters extends [BodyExtracter<infer Body>, ...infer Rest extends Extracter<unknown>[]]
    ? { body: z.infer<Body> } & InferExtractersToRequestData<Rest>
    : Extracters extends [QueryExtracter<infer Query>, ...infer Rest extends Extracter<unknown>[]]
      ? { query: z.infer<Query> } & InferExtractersToRequestData<Rest>
      : Extracters extends [infer _, ...infer Rest extends Extracter<unknown>[]]
        ? InferExtractersToRequestData<Rest>
        : EmptyObject

// export type InferRouteToClientRoute<R extends RouteWith<Known>> = {
//   [K in keyof R as R[K] extends Api<infer _, infer _, infer _, infer Returner>
//     ? Returner extends
//         | JsonReturner<infer _, infer _>
//         | TextReturner<string, string>
//         | VirtualResourceReturner<infer _, infer _>
//       ? K
//       : never
//     : K]: R[K] extends Api<
//     infer Extracters extends Extracter<unknown>[],
//     infer SuccessScheme,
//     infer ErrorScheme,
//     infer Returner
//   >
//     ? Returner extends VirtualResourceReturner<infer _, infer _>
//       ? [InferExtractersToRequestData<Extracters>, unknown, unknown]
//       : [InferExtractersToRequestData<Extracters>, z.infer<SuccessScheme>, z.infer<ErrorScheme>]
//     : R[K] extends Route
//       ? InferRouteToClientRoute<R[K]>
//       : never
// }

export type InferRouteToClientRoute<R extends RouteWith<Known>> = {
  [K in keyof R as R[K] extends Api<infer _, infer __, infer ___, infer Returner>
    ? Returner extends JsonReturner<infer _, infer __>
      ? K
      : never
    : K]: R[K] extends Api<
    infer Extracters extends Extracter<unknown>[],
    infer SuccessScheme,
    infer ErrorScheme,
    infer _
  >
    ? [InferExtractersToRequestData<Extracters>, z.infer<SuccessScheme>, z.infer<ErrorScheme>]
    : R[K] extends Route
      ? InferRouteToClientRoute<R[K]>
      : never
}

export type InferClientRouteToFunction<R extends Record<string, unknown>> = {
  [K in keyof R]: R[K] extends [infer Req, infer Success, infer Error]
    ? Req extends { body: infer Body; query: infer Query }
      ? (body: Body, query: Query, headers?: RequestInit['headers']) => Promise<Either<Error, Success>>
      : Req extends { body: infer Body }
        ? (body: Body, query?: null, headers?: RequestInit['headers']) => Promise<Either<Error, Success>>
        : Req extends { query: infer Query }
          ? (body: null, query: Query, headers?: RequestInit['headers']) => Promise<Either<Error, Success>>
          : (body?: null, query?: null, headers?: RequestInit['headers']) => Promise<Either<Error, Success>>
    : R[K] extends Record<string, unknown>
      ? InferClientRouteToFunction<R[K]>
      : never
}

export interface ClientOptions {
  baseUrl: string
  fetch?: typeof globalThis.fetch
}

export function createClient<R extends ClientRoute>(
  options: ClientOptions = { baseUrl: '' }
): InferClientRouteToFunction<R> {
  const buildProxy = (segments: string[]): unknown =>
    new Proxy(() => {}, {
      get(_, key: string) {
        if (key === 'then') return void 0
        return buildProxy([...segments, key])
      },
      async apply(_, __, params) {
        let url = `${options.baseUrl}/${segments.join('/')}`

        const init: RequestInit = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }

        if (params[0]) init.body = stringify(params[0])
        if (params[1]) url += `?${new URLSearchParams(params[1]).toString()}`
        try {
          const data = (await (
            await (options.fetch ?? globalThis.fetch)(url, init)
          )
            .text()
            .then((text) => parse(text))) as { ok: true; data: unknown } | { ok: false; error: unknown }

          return data.ok ? Right(data.data) : Left(data.error)
        } catch (e) {
          console.error(e)
          return Left(e)
        }
      }
    })
  return buildProxy([]) as InferClientRouteToFunction<R>
}
