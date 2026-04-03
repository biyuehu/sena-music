import { AdtType } from '../adt'
import type { Known } from '../types'

abstract class Maybe_<T> extends AdtType {
  public abstract isJust(): boolean
  public abstract isJustAnd<U>(f: (v: T) => Maybe<U>): Maybe<U>
  public abstract isNothing(): boolean
  public abstract isNothingAnd<U>(f: () => Maybe<U>): Maybe<U>
  public abstract map<U>(f: (v: T) => U): Maybe<U>
  public abstract mapOr<U>(v: U, f: (v: T) => U): U
  public abstract mapOrElse<U>(defaultFn: () => U, f: (v: T) => U): U
  public abstract and<U>(v: Maybe<U>): Maybe<U>
  public abstract andThen<U>(f: (v: T) => Maybe<U>): Maybe<U>
  public abstract or(v: Maybe<T>): Maybe<T>
  public abstract orElse(f: () => Maybe<T>): Maybe<T>
  public abstract unwrap(): T
  public abstract unwrapOr(v: T): T
  public abstract unwrapOrElse(f: () => T): T
  public abstract expect(msg: string): T
  public abstract match<R, R2>(handlers: { Just: (v: T, self: Just<T>) => R; Nothing: () => R2 }): R | R2
}

class Just_<T> extends Maybe_<T> {
  public readonly tag = 'Maybe:Just'

  public constructor(public readonly value: T) {
    super()
  }

  public isJust(): this is Just<T> {
    return true
  }

  public isJustAnd<U>(f: (v: T) => Maybe<U>): Maybe<U> {
    return f(this.value)
  }

  public isNothing(): this is Nothing<T> {
    return false
  }

  public isNothingAnd<U>(_f: () => Maybe<U>): Maybe<U> {
    return this as Known
  }

  public map<U>(f: (v: T) => U): Maybe<U> {
    return new Just_(f(this.value))
  }

  public mapOr<U>(_v: U, f: (v: T) => U): U {
    return f(this.value)
  }

  public mapOrElse<U>(_defaultFn: () => U, f: (v: T) => U): U {
    return f(this.value)
  }

  public and<U>(v: Maybe<U>): Maybe<U> {
    return v
  }

  public andThen<U>(f: (v: T) => Maybe<U>): Maybe<U> {
    return f(this.value)
  }

  public or(_v: Maybe<T>): Maybe<T> {
    return this as Known
  }

  public orElse(_f: () => Maybe<T>): Maybe<T> {
    return this as Known
  }

  public unwrap(): T {
    return this.value
  }

  public unwrapOr(_v: T): T {
    return this.value
  }

  public unwrapOrElse(_f: () => T): T {
    return this.value
  }

  public expect(_msg: string): T {
    return this.value
  }

  public match<R, R2>(handlers: { Just: (v: T) => R; Nothing: () => R2 }): R {
    return handlers.Just(this.value)
  }
}

class Nothing_<T> extends Maybe_<T> {
  public readonly tag = 'Maybe:Nothing'

  public isJust(): this is Just<T> {
    return false
  }

  public isJustAnd<U>(_f: (v: T) => Maybe<U>): Maybe<U> {
    return this as Known
  }

  public isNothing(): this is Nothing<T> {
    return true
  }

  public isNothingAnd<U>(f: () => Maybe<U>): Maybe<U> {
    return f()
  }

  public map<U>(_f: (v: T) => U): Maybe<U> {
    return this as Known
  }

  public mapOr<U>(v: U, _f: (v: T) => U): U {
    return v
  }

  public mapOrElse<U>(defaultFn: () => U, _f: (v: T) => U): U {
    return defaultFn()
  }

  public and<U>(_v: Maybe<U>): Maybe<U> {
    return this as Known
  }

  public andThen<U>(_f: (v: T) => Maybe<U>): Maybe<U> {
    return this as Known
  }

  public or(v: Maybe<T>): Maybe<T> {
    return v
  }

  public orElse(f: () => Maybe<T>): Maybe<T> {
    return f()
  }

  public unwrap(): T {
    throw new Error('Called unwrap on a Nothing')
  }

  public unwrapOr(v: T): T {
    return v
  }

  public unwrapOrElse(f: () => T): T {
    return f()
  }

  public expect(msg: string): T {
    throw new Error(msg)
  }

  public match<R, R2>(handlers: { Just: (v: T, self: Just<T>) => R; Nothing: () => R2 }): R2 {
    return handlers.Nothing()
  }
}

export type Just<T> = Just_<T>
export type Nothing<T> = Nothing_<T>
export type Maybe<T> = Just<T> | Nothing<T>

export const Just = <T>(v: T): Maybe<T> => new Just_(v)
export const Nothing = <T>(): Maybe<T> => new Nothing_<T>()
