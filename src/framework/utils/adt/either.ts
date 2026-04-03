import { AdtType } from '../adt'
import type { Known } from '../types'

abstract class Either_<L, R> extends AdtType {
  public abstract isRight(): boolean
  public abstract isRightAnd<R2>(f: (v: R) => Either<L, R2>): Either<L, R2>
  public abstract isLeft(): boolean
  public abstract isLeftAnd<L2>(f: (e: L) => Either<L2, R>): Either<L2, R>
  public abstract map<R2>(f: (v: R) => R2): Either<L, R2>
  public abstract mapLeft<L2>(f: (e: L) => L2): Either<L2, R>
  public abstract mapOr<R2>(v: R2, f: (v: R) => R2): R2
  public abstract mapOrElse<R2>(defaultFn: (e: L) => R2, f: (v: R) => R2): R2
  public abstract and<R2>(v: Either<L, R2>): Either<L, R2>
  public abstract andThen<R2>(f: (v: R) => Either<L, R2>): Either<L, R2>
  public abstract or(v: Either<L, R>): Either<L, R>
  public abstract orElse<L2>(f: (e: L) => Either<L2, R>): Either<L2, R>
  public abstract unwrap(): R
  public abstract unwrapLeft(): L
  public abstract unwrapOr(v: R): R
  public abstract unwrapOrElse(f: (e: L) => R): R
  public abstract expect(msg: string): R
  public abstract expectLeft(msg: string): L
  public abstract match<R2, R3>(handlers: {
    Right: (v: R, self: Right<L, R>) => R2
    Left: (e: L, self: Left<L, R>) => R3
  }): R2 | R3
}

class Right_<L, R> extends Either_<L, R> {
  public readonly tag = 'Either:Right'

  public constructor(public readonly value: R) {
    super()
  }

  public isRight(): this is Right<L, R> {
    return true
  }

  public isRightAnd<R2>(f: (v: R) => Either<L, R2>): Either<L, R2> {
    return f(this.value)
  }

  public isLeft(): this is Left<L, R> {
    return false
  }

  public isLeftAnd<L2>(_f: (e: L) => Either<L2, R>): Either<L2, R> {
    return this as Known
  }

  public map<R2>(f: (v: R) => R2): Either<L, R2> {
    return new Right_(f(this.value))
  }

  public mapLeft<L2>(_f: (e: L) => L2): Either<L2, R> {
    return this as Known
  }

  public mapOr<R2>(_v: R2, f: (v: R) => R2): R2 {
    return f(this.value)
  }

  public mapOrElse<R2>(_defaultFn: (e: L) => R2, f: (v: R) => R2): R2 {
    return f(this.value)
  }

  public and<R2>(v: Either<L, R2>): Either<L, R2> {
    return v
  }

  public andThen<R2>(f: (v: R) => Either<L, R2>): Either<L, R2> {
    return f(this.value)
  }

  public or(_v: Either<L, R>): Either<L, R> {
    return this as Known
  }

  public orElse<L2>(_f: (e: L) => Either<L2, R>): Either<L2, R> {
    return this as Known
  }

  public unwrap(): R {
    return this.value
  }

  public unwrapLeft(): L {
    throw new Error('Called unwrapLeft on a Right')
  }

  public unwrapOr(_v: R): R {
    return this.value
  }

  public unwrapOrElse(_defaultFn: (e: L) => R): R {
    return this.value
  }

  public expect(_msg: string): R {
    return this.value
  }

  public expectLeft(_msg: string): L {
    throw new Error('Called expectLeft on a Right')
  }

  public match<R2, R3>(handlers: { Right: (v: R, self: Right<L, R>) => R2; Left: (e: L, self: Left<L, R>) => R3 }): R2 {
    return handlers.Right(this.value, this)
  }
}

class Left_<L, R> extends Either_<L, R> {
  public readonly tag = 'Either:Left'

  public constructor(public readonly value: L) {
    super()
  }

  public isRight(): this is Right<L, R> {
    return false
  }

  public isRightAnd<R2>(_f: (v: R) => Either<L, R2>): Either<L, R2> {
    return this as Known
  }

  public isLeft(): this is Left<L, R> {
    return true
  }

  public isLeftAnd<L2>(f: (e: L) => Either<L2, R>): Either<L2, R> {
    return f(this.value)
  }

  public map<R2>(_f: (v: R) => R2): Either<L, R2> {
    return this as Known
  }

  public mapLeft<L2>(f: (e: L) => L2): Either<L2, R> {
    return new Left_(f(this.value))
  }

  public mapOr<R2>(v: R2, _f: (v: R) => R2): R2 {
    return v
  }

  public mapOrElse<R2>(defaultFn: (e: L) => R2, _f: (v: R) => R2): R2 {
    return defaultFn(this.value)
  }

  public and<R2>(_v: Either<L, R2>): Either<L, R2> {
    return this as Known
  }

  public andThen<R2>(_f: (v: R) => Either<L, R2>): Either<L, R2> {
    return this as Known
  }

  public or(v: Either<L, R>): Either<L, R> {
    return v
  }

  public orElse<L2>(f: (e: L) => Either<L2, R>): Either<L2, R> {
    return f(this.value)
  }

  public unwrap(): R {
    throw new Error('Called unwrap on a Left')
  }

  public unwrapLeft(): L {
    return this.value
  }

  public unwrapOr(v: R): R {
    return v
  }

  public unwrapOrElse(defaultFn: (e: L) => R): R {
    return defaultFn(this.value)
  }

  public expect(msg: string): R {
    throw new Error(msg)
  }

  public expectLeft(_msg: string): L {
    return this.value
  }

  public match<R2, R3>(handlers: { Right: (v: R, self: Right<L, R>) => R2; Left: (e: L, self: Left<L, R>) => R3 }): R3 {
    return handlers.Left(this.value, this)
  }
}

export type Right<L, R> = Right_<L, R>
export type Left<L, R> = Left_<L, R>
export type Either<L, R> = Right<L, R> | Left<L, R>

export const Right = <R, L = never>(v: R): Either<L, R> => new Right_<L, R>(v)
export const Left = <L, R = never>(e: L): Either<L, R> => new Left_<L, R>(e)
