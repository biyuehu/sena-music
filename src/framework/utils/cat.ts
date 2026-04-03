import type { Apply, HKT } from './hkt'

export interface Functor<F extends HKT> {
  fmap: <A, B>(f: (a: A) => B) => (fa: Apply<F, A>) => Apply<F, B>
}

export interface Applicative<F extends HKT> extends Functor<F> {
  ap: <A, B>(fab: Apply<F, (a: A) => B>) => (fa: Apply<F, A>) => Apply<F, B>
  pure: <A>(a: A) => Apply<F, A>
}

export interface Monad<F extends HKT> extends Applicative<F> {
  bind: <A, B>(f: (a: A) => Apply<F, B>) => (fa: Apply<F, A>) => Apply<F, B>
}

export interface Foldable<F extends HKT> {
  foldMap: <M>(M: Monoid<M>) => <A>(f: (a: A) => M) => (fa: Apply<F, A>) => M
  foldr: <A, B>(f: (a: A, b: B) => B) => (b: B) => (fa: Apply<F, A>) => B
}

export interface Monoid<A> {
  empty: A
  concat: (a: A) => (b: A) => A
}

export interface Traversable<F extends HKT> extends Functor<F>, Foldable<F> {
  traverse: <A, B>(f: (a: A) => Apply<F, B>) => (ta: Apply<F, A>) => Apply<F, Apply<F, B>>
}

export interface Altnative<F extends HKT> {
  alt: <A>(fa: Apply<F, A>) => (fb: Apply<F, A>) => Apply<F, A>
}

export interface MonadPlus<F extends HKT> extends Monad<F>, Altnative<F> {}

export interface Comonad<F extends HKT> extends Functor<F> {
  extract: <A>(fa: Apply<F, A>) => A
}

export interface Chain<F extends HKT> extends Monad<F> {
  chain: <A, B>(f: (a: A) => Apply<F, B>) => (ma: Apply<F, A>) => Apply<F, B>
}

export interface MonadZip<F extends HKT> extends Monad<F> {
  zip: <A, B>(ma: Apply<F, A>) => (mb: Apply<F, B>) => Apply<F, [A, B]>
  zipWith: <A, B, C>(f: (a: A, b: B) => C) => (ma: Apply<F, A>) => (mb: Apply<F, B>) => Apply<F, C>
}
