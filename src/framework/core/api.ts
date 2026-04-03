import type { IncomingMessage, ServerResponse } from 'node:http'
import type z from 'zod'
import { Left } from '@/romi/utils/adt/either'
import { pipe } from '@/romi/utils/fp'
import type { Known, StrictEmptyObject } from '@/romi/utils/types'
import type { Action } from './action'
import type { Extracter } from './extracter'
import { JsonRetutner, type Retutner } from './returner'

export const any = Symbol('any-routers')

export interface DataRouteWith<State extends object> {
  [key: string]: Api<Known, z.ZodType, z.ZodType, Retutner<unknown, unknown>, State> | DataRouteWith<State>
}

export type RouteWith<State extends object> = DataRouteWith<State> & {
  [any]?: Api<Known, z.ZodType, z.ZodType, Retutner<unknown, unknown>, State>
}

export type Route = RouteWith<StrictEmptyObject>

export class Api<
  Extracters extends Extracter<unknown>[],
  SuccessScheme extends z.ZodType,
  ErrorScheme extends z.ZodType,
  Returner extends Retutner<z.infer<SuccessScheme>, z.infer<ErrorScheme>>,
  StartState extends object = object
> {
  public static new<
    Extracters extends Extracter<unknown>[],
    SuccessScheme extends z.ZodType,
    ErrorScheme extends z.ZodType,
    Returner extends Retutner<z.infer<SuccessScheme>, z.infer<ErrorScheme>>,
    StartState extends object = object
  >(
    action: Action<Extracters, z.infer<SuccessScheme>, z.infer<ErrorScheme>, Known, StartState>,
    successScheme: SuccessScheme,
    errorScheme: ErrorScheme,
    returner: Returner
  ): Api<Extracters, SuccessScheme, ErrorScheme, Returner, StartState> {
    return new Api(action, successScheme, errorScheme, returner) as Known
  }

  private constructor(
    private readonly action: Action<Extracters, z.infer<SuccessScheme>, z.infer<ErrorScheme>, Known, StartState>,
    protected readonly successScheme: SuccessScheme,
    protected readonly errorScheme: ErrorScheme,
    private readonly returner: Returner
  ) {}

  public async run(reqRaw: IncomingMessage, resRaw: ServerResponse, initialState: StartState): Promise<void> {
    try {
      const datas = await Promise.all(this.action.extracters.map((extractor) => extractor.extract(reqRaw)))
      const errors = datas.filter((data) => data.isLeft()).map((data) => data.value)

      if (errors.length > 0) {
        if (this.returner instanceof JsonRetutner) {
          resRaw.end(
            this.returner.return(Left(`Body data invalid: ${errors.map((e) => e.message).join(', ')}`), reqRaw, resRaw)
          )
        } else {
          resRaw.end()
        }
        return
      }

      this.returner.return(
        await this.action.call(
          datas.map((data) => data.value) as Known,
          initialState as Known,
          pipe(
            reqRaw.url ?? '',
            (url) =>
              ({
                url,
                path: url.split('?')[0],
                headers: Object.fromEntries(Object.entries(reqRaw.headers)),
                ip: reqRaw.socket.remoteAddress ?? ''
              }) as Known
          )
        ),
        reqRaw,
        resRaw
      )
    } catch (e) {
      resRaw.statusCode = 500
      console.error('Exception in server', e)
      if (this.returner instanceof JsonRetutner) {
        resRaw.end(this.returner.return(Left([500, 'Internal Server Error']), reqRaw, resRaw))
      } else {
        resRaw.end()
      }
    }
  }
}
