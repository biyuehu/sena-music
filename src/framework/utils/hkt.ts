import type { EmptyObject } from './types'

export interface Arg0 {
  _isArg: true
  index: 0
}
export interface Arg1 {
  _isArg: true
  index: 1
}
export interface Arg2 {
  _isArg: true
  index: 2
}
export interface Arg3 {
  _isArg: true
  index: 3
}
export interface Arg4 {
  _isArg: true
  index: 4
}
export interface Arg5 {
  _isArg: true
  index: 5
}
export interface Arg6 {
  _isArg: true
  index: 6
}
export interface Arg7 {
  _isArg: true
  index: 7
}

export interface HKT<Arity extends number = number> {
  arity: Arity
  _argBuffer: EmptyObject
  args: Record<number, unknown>
  type: unknown
}

type IncrementLength<Arr extends unknown[]> = [...Arr, 'placeholder']['length']

type UnionToIntersection<U> = (U extends unknown ? (a: U) => unknown : never) extends (a: infer I) => unknown
  ? I
  : never
type UnionToFunctionUnion<U> = U extends unknown ? (a: U) => unknown : never
type UnionLastElement<U> = UnionToIntersection<UnionToFunctionUnion<U>> extends (a: infer L) => unknown ? L : never
type UnionToTuple<U, Last = UnionLastElement<U>> = [U] extends [never] ? [] : [...UnionToTuple<Exclude<U, Last>>, Last]

type ObjectKeys<Obj> = UnionToTuple<keyof Obj> extends infer R ? (R extends unknown[] ? R : never) : never
type ObjectValues<Obj, RemainingKeys extends unknown[] = UnionToTuple<keyof Obj>> = RemainingKeys extends []
  ? []
  : RemainingKeys extends [infer K, ...infer Rest]
    ? K extends keyof Obj
      ? [Obj[K], ...ObjectValues<Obj, Rest>]
      : never
    : never

export type Apply<F extends HKT, A> = F['arity'] extends 0
  ? F['type']
  : IncrementLength<ObjectKeys<F['_argBuffer']>> extends F['arity']
    ? (F & {
        args: [...ObjectValues<F['_argBuffer']>, A]
      })['type']
    : F & {
        _argBuffer: Record<ObjectKeys<F['_argBuffer']>['length'], A>
      }

export type ApplyList<F extends HKT, Args extends unknown[]> = Args extends []
  ? Apply<F, Args>
  : Args extends [infer X, ...infer Xs]
    ? Apply<F, X> extends infer Fx
      ? Fx extends HKT
        ? ApplyList<Fx, Xs>
        : Fx
      : never
    : never

export type Map<L extends unknown[], F extends HKT> = L extends []
  ? []
  : L extends [infer H, ...infer T]
    ? [Apply<F, H>, ...Map<T, F>]
    : never
export interface $Map extends HKT {
  arity: 2
  type: this['args'] extends [infer L extends unknown[], infer F extends HKT] ? Map<L, F> : never
}

export type Join<T extends unknown[], Separator extends string> = T extends [infer H, ...infer R]
  ? H extends string
    ? `${H}${R extends [] ? '' : Separator}${Join<R, Separator>}`
    : never
  : ''

export interface $Join extends HKT {
  arity: 2
  type: this['args'] extends [infer T extends unknown[], infer Separator extends string] ? Join<T, Separator> : never
}

export type Pipe<A, FS extends HKT[]> = FS extends []
  ? A
  : FS extends [infer F extends HKT, ...infer Rest extends HKT[]]
    ? Pipe<Apply<F, A>, Rest>
    : never

export interface $Pipe extends HKT {
  arity: 2
  type: this['args'] extends [infer A, infer FS extends HKT[]] ? Pipe<A, FS> : never
}

export type toString<a extends string | number | boolean | null | undefined | bigint> = `${a}`
export interface $ToString extends HKT {
  arity: 1
  type: this['args'] extends [infer A extends string | number | boolean | null | undefined | bigint]
    ? toString<A>
    : never
}

export type AppendString<a extends string, b extends string> = `${a}${b}`
export interface $AppendString extends HKT {
  arity: 2
  type: this['args'] extends [infer A extends string, infer B extends string] ? `${A}${B}` : never
}

export interface $Id extends HKT {
  arity: 1
  type: this['args'][0]
}

export type Cons<a, b> = [a, b]
export interface $Cons extends HKT {
  type: this['args'] extends [infer A, infer B] ? [A, B] : never
}
