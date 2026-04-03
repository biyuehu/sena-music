import type { IncomingMessage } from 'node:http'
import { parse } from 'devalue'
import type z from 'zod'
import { type Either, Left, Right } from '@/romi/utils/adt/either'
import { stringifyCatchError } from '@/romi/utils/common'

export abstract class Extracter<Data> {
  public abstract extract(reqRaw: IncomingMessage): Promise<Either<Error, Data>>
}

export type InferExtracters<T extends Extracter<unknown>[]> = T extends [
  Extracter<infer Data>,
  ...infer xs extends Extracter<unknown>[]
]
  ? [Data, ...InferExtracters<xs>]
  : []

export class BodyExtracter<T extends z.ZodType> extends Extracter<z.infer<T>> {
  private declare readonly brand: 'BodyExtracter'

  public constructor(
    private readonly schema: T,
    private readonly maxFetchSeconds = 60
  ) {
    super()
  }

  public extract(reqRaw: IncomingMessage): Promise<Either<Error, z.infer<T>>> {
    return new Promise((resolve) => {
      let data = ''
      const timer = setTimeout(() => {
        const error = new Error('Fetch body timeout')
        reqRaw.off('data', onData)
        reqRaw.off('end', onEnd)
        reqRaw.destroy(error)
        resolve(Left(error))
      }, this.maxFetchSeconds * 1000)
      const onData = (chunk: Buffer) => {
        data += chunk
      }
      const onEnd = () => {
        try {
          resolve(Right(this.schema.parse(parse(data))))
        } catch (e) {
          resolve(Left(new Error(`Invalid body: ${stringifyCatchError(e)}`)))
        } finally {
          clearTimeout(timer)
        }
      }
      reqRaw.on('data', onData)
      reqRaw.on('end', onEnd)
    })
  }
}

export class QueryExtracter<T extends z.ZodType> extends Extracter<z.infer<T>> {
  private declare readonly brand: 'QueryExtracter'

  public constructor(private readonly schema: T) {
    super()
  }

  public async extract(reqRaw: IncomingMessage): Promise<Either<Error, z.infer<T>>> {
    try {
      return Right(this.schema.parse(Object.fromEntries(new URL(reqRaw.url ?? '', 'http://localhost').searchParams)))
    } catch (e) {
      return Left(new Error(`Invalid query: ${stringifyCatchError(e)}`))
    }
  }
}
