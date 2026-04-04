import type { Known } from './types'

const TYPE = Symbol('type')

export abstract class Variant<B, T> {
  private declare readonly [TYPE]: B
  public constructor(public readonly value: T) {}
  // public is<T>(value: T): this is Variant<B, T> {
  //   return value && typeof value === 'object' && TYPE in value && this[TYPE] === value[TYPE]
  // }
}

export type ADT<T extends Record<string, unknown>> = { [K in keyof T]: { value: T[K]; _type: K } }[keyof T]
type Cases<T, R = unknown> = T extends ADT<infer _> ? { [K in T as K['_type']]: (v: K['value']) => R } : never

export function match<A extends ADT<Known>, C extends Cases<A>>(adt: A, cases: C): ReturnType<C[keyof C]> {
  for (const tag in cases) if ((adt as Known)._type === tag) return (cases as Known)[tag]((adt as Known).value)
  throw new Error('Non-exhaustive patterns')
}

export abstract class AdtType {
  public abstract readonly tag: string

  public abstract match(handlers: { [key: string]: (...args: Known[]) => Known }): Known
}
