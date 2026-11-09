import z from 'zod'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import { Cache } from './cache'

export namespace Storage {
  const schema = z.union([z.string(), z.number(), z.boolean()])

  export type Value = string | number | boolean

  function genKey(key: string): string {
    return `sena-storage:${key}`
  }

  export function set<T extends Value>(key: string, value: T): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(genKey(key), JSON.stringify(value))
    } catch {}
  }

  export function get<T extends Value>(key: string): Maybe<T> {
    if (typeof localStorage === 'undefined') return Nothing()

    const raw = localStorage.getItem(genKey(key))
    if (raw !== null) {
      try {
        const parsed = schema.safeParse(JSON.parse(raw))
        if (parsed.success) {
          return Just(parsed.data as T)
        }
      } catch {}
      remove(key)
    }

    // Migration fallback from Cache
    const legacy = Cache.get<T>(key)
    if (legacy.isJust()) {
      set(key, legacy.value)
      Cache.remove(key)
      return legacy
    }

    return Nothing()
  }

  export function remove(key: string): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.removeItem(genKey(key))
    } catch {}
  }

  export function getOr<T extends Value>(key: string, defaultFn: () => T): T {
    return get<T>(key).unwrapOrElse(() => {
      const value = defaultFn()
      set(key, value)
      return value
    })
  }

  export async function getOrAsync<T extends Value>(key: string, defaultFn: () => Promise<T>): Promise<T> {
    const result = get<T>(key)
    if (result.isJust()) return result.value
    const value = await defaultFn()
    set(key, value)
    return value
  }
}
