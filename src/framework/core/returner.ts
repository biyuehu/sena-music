import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { stringify } from 'devalue'
import sirv from 'sirv'
import z from 'zod'
import type { Either } from '@/romi/utils/adt/either'
import { pipe } from '@/romi/utils/fp'

export abstract class Retutner<Right, Left> {
  protected declare abstract readonly brand: string

  public abstract return(result: Either<Left, Right>, reqRaw: IncomingMessage, resRaw: ServerResponse): void
}

export class JsonRetutner<R extends [number, object] | object, L extends [number, object] | object> extends Retutner<
  R,
  L
> {
  protected declare readonly brand: 'JsonRetutner'

  protected format(ok: boolean, value: unknown) {
    return pipe(ok ? { ok: true, data: value } : { ok: false, error: value }, (json) => stringify(json))
  }

  // public constructor(
  //   private readonly beautify = true,
  //   private readonly indent = 2
  // ) {
  //   super()
  // }

  public override return(result: Either<L, R>, _reqRaw: IncomingMessage, resRaw: ServerResponse): void {
    resRaw.setHeader('Content-Type', 'application/json')
    result.match({
      Right: (result) => {
        if (Array.isArray(result)) {
          resRaw.statusCode = result[0]
          resRaw.end(this.format(true, result[1]))
        } else {
          resRaw.statusCode = 200
          resRaw.end(this.format(true, result))
        }
      },
      Left: (error) => {
        if (Array.isArray(error)) {
          resRaw.statusCode = error[0]
          resRaw.end(this.format(false, error[1]))
        } else {
          resRaw.statusCode = 400
          resRaw.end(this.format(false, error))
        }
      }
    })
  }
}

export const standardJsonReturnErrorSchema = z.object({
  error: z.string()
})

export class TextReturner<R extends string, L extends string> extends Retutner<R, L> {
  protected declare readonly brand: 'TextReturner'

  public override return(result: Either<L, R>, _reqRaw: IncomingMessage, resRaw: ServerResponse): void {
    resRaw.setHeader('Content-Type', 'text/plain')
    result.match({
      Right: (result) => {
        resRaw.statusCode = 200
        resRaw.end(result)
      },
      Left: (error) => {
        resRaw.statusCode = 400
        resRaw.end(error)
      }
    })
  }
}

export const virtualResourceReturnSchema = z.object({
  type: z.string(),
  content: z.union([z.instanceof(Buffer), z.string()])
})

export class VirtualResourceReturner<
  R extends z.infer<typeof virtualResourceReturnSchema>,
  L extends z.infer<typeof virtualResourceReturnSchema>
> extends Retutner<R, L> {
  protected declare readonly brand: 'VirtualResourceReturner'

  public override return(result: Either<L, R>, _reqRaw: IncomingMessage, resRaw: ServerResponse): void {
    resRaw.setHeader('Content-Type', result.value.type)
    result.match({
      Right: (result) => {
        resRaw.statusCode = 200
        resRaw.end(result.content)
      },
      Left: (error) => {
        resRaw.statusCode = 400
        resRaw.end(error.content)
      }
    })
  }
}

export class AssetsReturner extends Retutner<object, never> {
  protected declare readonly brand: 'SirvReturner'
  private readonly handlers: ReturnType<typeof sirv>[]

  public constructor(
    dirs: string[],
    private readonly fallback: (reqRaw: IncomingMessage, resRaw: ServerResponse) => Promise<void> = async (
      _reqRaw,
      resRaw
    ) => {
      resRaw.statusCode = 404
      resRaw.end()
    },
    options: Parameters<typeof sirv>[1] = {}
  ) {
    super()
    // this.handler = sirv(dir, {
    //   // etag: true,
    //   dev: process.env.NODE_ENV !== 'production',
    //   ...options
    // })
    this.handlers = dirs.map((dir) =>
      sirv(resolve(process.cwd(), dir), {
        dev: process.env.NODE_ENV !== 'production',
        ...options
      })
    )
  }

  public override return(_result: Either<never, object>, reqRaw: IncomingMessage, resRaw: ServerResponse): void {
    let i = 0
    const next = () => {
      if (i >= this.handlers.length) return this.fallback(reqRaw, resRaw)
      this.handlers[i++](reqRaw, resRaw, next)
    }
    next()
  }
}
