import { AdtType } from '../adt'
import type { Known } from '../types'

abstract class Try_<T, E> extends AdtType {
  public abstract isPending(): boolean
  public abstract isPendingAnd<U, F>(f: () => Try<U, F>): Try<U, F>
  public abstract isSuccess(): boolean
  public abstract isSuccessAnd<U, F>(f: (v: T) => Try<U, F>): Try<U, F>
  public abstract isFailure(): boolean
  public abstract isFailureAnd<U, F>(f: (e: E) => Try<U, F>): Try<U, F>
  public abstract map<U>(f: (v: T) => U): Try<U, E>
  public abstract mapFailure<F>(f: (e: E) => F): Try<T, F>
  public abstract mapOr<U>(v: U, f: (v: T) => U): U
  public abstract mapOrElse<U>(pendingFn: () => U, failureFn: (e: E) => U, successFn: (v: T) => U): U
  public abstract and<U, F>(v: Try<U, F>): Try<U, F | E>
  public abstract andThen<U, F>(f: (v: T) => Try<U, F>): Try<U, F | E>
  public abstract or(v: Try<T, E>): Try<T, E>
  public abstract orElse<F>(f: (e: E) => Try<T, F>): Try<T, F>
  public abstract unwrap(): T
  public abstract unwrapFailure(): E
  public abstract unwrapOr(v: T): T
  public abstract unwrapOrElse(failureFn: (e: E) => T, pendingFn?: () => T): T
  public abstract expect(msg: string): T
  public abstract expectFailure(msg: string): E
  public abstract match<R, R2, R3>(handlers: {
    Pending: () => R
    Success: (v: T, self: Success<T, E>) => R2
    Failure: (e: E, self: Failure<T, E>) => R3
  }): R | R2 | R3
}

class Pending_<T, E> extends Try_<T, E> {
  public readonly tag = 'Try:Pending'

  public isPending(): this is Pending<T, E> {
    return true
  }

  public isPendingAnd<U, F>(f: () => Try<U, F>): Try<U, F> {
    return f()
  }

  public isSuccess(): this is Success<T, E> {
    return false
  }

  public isSuccessAnd<U, F>(_f: (v: T) => Try<U, F>): Try<U, F> {
    return this as Known
  }

  public isFailure(): this is Failure<T, E> {
    return false
  }

  public isFailureAnd<U, F>(_f: (e: E) => Try<U, F>): Try<U, F> {
    return this as Known
  }

  public map<U>(_f: (v: T) => U): Try<U, E> {
    return this as Known
  }

  public mapFailure<F>(_f: (e: E) => F): Try<T, F> {
    return this as Known
  }

  public mapOr<U>(v: U, _f: (v: T) => U): U {
    return v
  }

  public mapOrElse<U>(pendingFn: () => U, _failureFn: (e: E) => U, _successFn: (v: T) => U): U {
    return pendingFn()
  }

  public and<U, F>(_v: Try<U, F>): Try<U, F | E> {
    return this as Known
  }

  public andThen<U, F>(_f: (v: T) => Try<U, F>): Try<U, F | E> {
    return this as Known
  }

  public or(v: Try<T, E>): Try<T, E> {
    return v
  }

  public orElse<F>(_f: (e: E) => Try<T, F>): Try<T, F> {
    return this as Known
  }

  public unwrap(): T {
    throw new Error('Called unwrap on a Pending')
  }

  public unwrapFailure(): E {
    throw new Error('Called unwrapFailure on a Pending')
  }

  public unwrapOr(v: T): T {
    return v
  }

  public unwrapOrElse(_failureFn: (e: E) => T, pendingFn?: () => T): T {
    if (pendingFn) return pendingFn()
    throw new Error('unwrapOrElse called on Pending without providing pendingFn')
  }

  public expect(msg: string): T {
    throw new Error(msg)
  }

  public expectFailure(msg: string): E {
    throw new Error(msg)
  }

  public match<R, R2, R3>(handlers: {
    Pending: () => R
    Success: (v: T, self: Success<T, E>) => R2
    Failure: (e: E, self: Failure<T, E>) => R3
  }): R {
    return handlers.Pending()
  }
}

class Success_<T, E> extends Try_<T, E> {
  public readonly tag = 'Try:Success'

  public constructor(public readonly value: T) {
    super()
  }

  public isPending(): this is Pending<T, E> {
    return false
  }

  public isPendingAnd<U, F>(_f: () => Try<U, F>): Try<U, F> {
    return this as Known
  }

  public isSuccess(): this is Success<T, E> {
    return true
  }

  public isSuccessAnd<U, F>(f: (v: T) => Try<U, F>): Try<U, F> {
    return f(this.value)
  }

  public isFailure(): this is Failure<T, E> {
    return false
  }

  public isFailureAnd<U, F>(_f: (e: E) => Try<U, F>): Try<U, F> {
    return this as Known
  }

  public map<U>(f: (v: T) => U): Try<U, E> {
    return new Success_(f(this.value))
  }

  public mapFailure<F>(_f: (e: E) => F): Try<T, F> {
    return this as Known
  }

  public mapOr<U>(_v: U, f: (v: T) => U): U {
    return f(this.value)
  }

  public mapOrElse<U>(_pendingFn: () => U, _failureFn: (e: E) => U, successFn: (v: T) => U): U {
    return successFn(this.value)
  }

  public and<U, F>(v: Try<U, F>): Try<U, F | E> {
    return v
  }

  public andThen<U, F>(f: (v: T) => Try<U, F>): Try<U, F | E> {
    return f(this.value)
  }

  public or(_v: Try<T, E>): Try<T, E> {
    return this as Known
  }

  public orElse<F>(_f: (e: E) => Try<T, F>): Try<T, F> {
    return this as Known
  }

  public unwrap(): T {
    return this.value
  }

  public unwrapFailure(): E {
    throw new Error('Called unwrapFailure on a Success')
  }

  public unwrapOr(_v: T): T {
    return this.value
  }

  public unwrapOrElse(_failureFn: (e: E) => T, _pendingFn?: () => T): T {
    return this.value
  }

  public expect(_msg: string): T {
    return this.value
  }

  public expectFailure(msg: string): E {
    throw new Error(msg)
  }

  public match<R, R2, R3>(handlers: {
    Pending: () => R
    Success: (v: T, self: Success<T, E>) => R2
    Failure: (e: E, self: Failure<T, E>) => R3
  }): R2 {
    return handlers.Success(this.value, this)
  }
}

class Failure_<T, E> extends Try_<T, E> {
  public readonly tag = 'Try:Failure'

  public constructor(public readonly value: E) {
    super()
  }

  public isPending(): this is Pending<T, E> {
    return false
  }

  public isPendingAnd<U, F>(_f: () => Try<U, F>): Try<U, F> {
    return this as Known
  }

  public isSuccess(): this is Success<T, E> {
    return false
  }

  public isSuccessAnd<U, F>(_f: (v: T) => Try<U, F>): Try<U, F> {
    return this as Known
  }

  public isFailure(): this is Failure<T, E> {
    return true
  }

  public isFailureAnd<U, F>(f: (e: E) => Try<U, F>): Try<U, F> {
    return f(this.value)
  }

  public map<U>(_f: (v: T) => U): Try<U, E> {
    return this as Known
  }

  public mapFailure<F>(f: (e: E) => F): Try<T, F> {
    return new Failure_(f(this.value))
  }

  public mapOr<U>(v: U, _f: (v: T) => U): U {
    return v
  }

  public mapOrElse<U>(_pendingFn: () => U, failureFn: (e: E) => U, _successFn: (v: T) => U): U {
    return failureFn(this.value)
  }

  public and<U, F>(_v: Try<U, F>): Try<U, F | E> {
    return this as Known
  }

  public andThen<U, F>(_f: (v: T) => Try<U, F>): Try<U, F | E> {
    return this as Known
  }

  public or(v: Try<T, E>): Try<T, E> {
    return v
  }

  public orElse<F>(f: (e: E) => Try<T, F>): Try<T, F> {
    return f(this.value)
  }

  public unwrap(): T {
    throw new Error('Called unwrap on a Failure')
  }

  public unwrapFailure(): E {
    return this.value
  }

  public unwrapOr(v: T): T {
    return v
  }

  public unwrapOrElse(failureFn: (e: E) => T, _pendingFn?: () => T): T {
    return failureFn(this.value)
  }

  public expect(msg: string): T {
    throw new Error(msg)
  }

  public expectFailure(_msg: string): E {
    return this.value
  }

  public match<R, R2, R3>(handlers: {
    Pending: () => R
    Success: (v: T, self: Success<T, E>) => R2
    Failure: (e: E, self: Failure<T, E>) => R3
  }): R3 {
    return handlers.Failure(this.value, this)
  }
}

export type Pending<T, E> = Pending_<T, E>
export type Success<T, E> = Success_<T, E>
export type Failure<T, E> = Failure_<T, E>
export type Try<T, E> = Pending<T, E> | Success<T, E> | Failure<T, E>

export const Pending = <T = never, E = never>(): Try<T, E> => new Pending_<T, E>()
export const Success = <T, E = never>(v: T): Try<T, E> => new Success_(v)
export const Failure = <T, E>(e: E): Try<T, E> => new Failure_(e)
