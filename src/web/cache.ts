import z from 'zod'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'

export namespace Cache {
  const schema = z.object({ time: z.number(), value: z.union([z.string(), z.number(), z.boolean()]) })

  export type Value = string | number | boolean

  function genKey(key: string) {
    return `sena-cache:${key}`
  }

  export function set<T extends Value>(key: string, value: T, seconds: number = 3600): void {
    localStorage.setItem(genKey(key), JSON.stringify({ time: Date.now() + seconds * 1000, value }))
  }

  export function get<T extends Value>(key: string): Maybe<T> {
    const data = localStorage.getItem(genKey(key))
    if (data === null) return Nothing()
    const parsed = schema.safeParse(JSON.parse(data))
    if (parsed.success) {
      const { time, value } = parsed.data
      if (time > Date.now()) return Just(value as T)
      remove(key)
      return Nothing()
    }
    remove(key)
    return Nothing()
  }

  export function remove(key: string): void {
    localStorage.removeItem(genKey(key))
  }

  export function getOr<T extends Value>(key: string, defaultFn: () => T): T {
    return get(key).unwrapOrElse(() => {
      const value = defaultFn()
      set(key, value)
      return value
    }) as T
  }

  export async function getOrAsync<T extends Value>(key: string, defaultFn: () => Promise<T>): Promise<T> {
    const result = get(key)
    if (result.isJust()) return result.value as T
    const value = await defaultFn()
    set(key, value)
    return value
  }
}
