import type z from 'zod'
import { type Either, Left, Right } from './adt/either'

export function stringifyCatchError(e: unknown): string {
  return e instanceof Error ? `(${e.name}) ${e.message}` : String(e)
}

export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e))
}

export function safeParse<S extends z.ZodType = z.ZodObject>(data: string, schema?: S): Either<Error, z.infer<S>> {
  try {
    const json = JSON.parse(data)
    return Right(schema ? schema.parse(json) : json)
  } catch (err) {
    return Left(err instanceof Error ? err : new Error(String(err)))
  }
}
