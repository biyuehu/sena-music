import { type Either, Right } from '@/romi/utils/adt/either'
import { pipe } from '@/romi/utils/fp'
import type { EmptyObject, Known } from '@/romi/utils/types'
import type { Extracter, InferExtracters } from './extracter'

const LATEST_RETURN_VALUE = Symbol('LATEST_RETURN_VALUE')

export const REQUEST_DEFAULT: RequestMeta = { url: '', path: '', headers: {}, ip: '' }

export interface RequestMeta {
  url: string
  path: string
  headers: Record<string, string | string[] | undefined>
  ip: string
}

export type Handler<Data, Right, Left, State = object> = (
  data: Data,
  state: State,
  meta: RequestMeta
) => Promise<Either<Left, Right>>

export type Middleware<Right, Left, State = object> = Handler<unknown, Right, Left, State>

export class Action<
  Extracters extends Extracter<unknown>[],
  Right,
  Left,
  State extends object = object,
  StartState extends object = State
> {
  public static empty<State extends object = object>(): Action<[], EmptyObject, never, State> {
    return new Action([], async () => Right({}))
  }

  public use<Extracters_ extends Extracter<unknown>[]>(
    extracters: [] extends Extracters ? Extracters_ : never
  ): [] extends Extracters ? Action<Extracters_, Right, Left, State> : never {
    if (this.extracters.length !== 0) throw new Error('Action already have data extracters')
    return new Action<Extracters_, Right, Left, State>(extracters, this.handler as Known) as Known
  }

  protected constructor(
    public readonly extracters: Extracters,
    protected readonly handler: Handler<InferExtracters<Extracters>, Right, Left, State>
  ) {}

  public bind<Right_, Left_>(
    handler: Handler<InferExtracters<Extracters>, Right_, Left_, State & Right>
  ): Action<Extracters, Right_, Left | Left_, State & Right, StartState> {
    return new Action<Extracters, Right_, Left | Left_, State & Right, StartState>(
      this.extracters,
      async (data, state, ctx) =>
        pipe(await this.handler(data, state, ctx), async (result) =>
          result.isLeft()
            ? result
            : pipe(await handler(data, { ...state, ...result.value }, ctx), (newResult) =>
                newResult.isLeft()
                  ? newResult
                  : (Right({
                      ...state,
                      ...result.value,
                      ...newResult.value,
                      [LATEST_RETURN_VALUE]: newResult.value
                    }) as Known)
              )
        )
    )
  }

  public async call(
    data: InferExtracters<Extracters>,
    state: StartState,
    req: RequestMeta
  ): Promise<Either<Left, Right>> {
    return (await this.handler(data, state as Known, req)).map((v) =>
      typeof v === 'object' && v && LATEST_RETURN_VALUE in v ? v[LATEST_RETURN_VALUE] : v
    ) as Known
  }
}
