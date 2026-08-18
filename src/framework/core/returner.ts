import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
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

export const virtualResourceReturnSchema = z.union([
  z.object({
    type: z.string(),
    content: z.union([z.instanceof(Buffer), z.string()]),
    code: z.number().optional(),
    headers: z.record(z.string(), z.string()).optional()
  }),
  z.object({
    type: z.string(),
    path: z.string(),
    code: z.number().optional(),
    headers: z.record(z.string(), z.string()).optional()
  }),
  z.object({
    type: z.string(),
    stream: z.union([z.instanceof(ReadableStream), z.instanceof(Readable)]),
    code: z.number().optional(),
    headers: z.record(z.string(), z.string()).optional()
  })
])

export class VirtualResourceReturner<
  R extends z.infer<typeof virtualResourceReturnSchema>,
  L extends z.infer<typeof virtualResourceReturnSchema>
> extends Retutner<R, L> {
  protected declare readonly brand: 'VirtualResourceReturner'

  public override return(result: Either<L, R>, _reqRaw: IncomingMessage, resRaw: ServerResponse): void {
    const data = result.match({
      Right: (result) => {
        resRaw.statusCode = result.code ?? 200
        return result
      },
      Left: (error) => {
        resRaw.statusCode = error.code ?? 400
        return error
      }
    })

    if ('content' in data) {
      resRaw.setHeader('Content-Type', data.type)
      if (data.headers) {
        for (const [key, value] of Object.entries(data.headers)) {
          resRaw.setHeader(key, value)
        }
      }
      resRaw.end(data.content)
      return
    }

    if ('stream' in data && data.stream) {
      resRaw.writeHead(data.code ?? 200, {
        'Content-Type': data.type,
        ...data.headers
      })
      if (data.stream instanceof Readable) {
        data.stream.pipe(resRaw)
      } else if (data.stream instanceof ReadableStream) {
        Readable.fromWeb(data.stream).pipe(resRaw)
      }
      return
    }

    if ('path' in data) {
      const path = resolve(process.cwd(), data.path)
      if (!existsSync(path)) {
        resRaw.statusCode = 404
        resRaw.end()
        return
      }

      resRaw.writeHead(data.code ?? 200, {
        'Content-Type': data.type || 'audio/mpeg',
        'Content-Length': statSync(path).size,
        ...data.headers
      })
      createReadStream(path).pipe(resRaw)
      return
    }
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
