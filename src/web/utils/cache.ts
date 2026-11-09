import z from 'zod'
import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'

export namespace Cache {
  const schema = z.object({ time: z.number(), value: z.union([z.string(), z.number(), z.boolean()]) })

  export type Value = string | number | boolean

  function genKey(key: string) {
    return `sena-cache:${key}`
  }

  export function set<T extends Value>(key: string, value: T, seconds: number = 3600): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(genKey(key), JSON.stringify({ time: Date.now() + seconds * 1000, value }))
    } catch {}
  }

  export function get<T extends Value>(key: string): Maybe<T> {
    if (typeof localStorage === 'undefined') return Nothing()
    const data = localStorage.getItem(genKey(key))
    if (data === null) return Nothing()
    try {
      const parsed = schema.safeParse(JSON.parse(data))
      if (parsed.success) {
        const { time, value } = parsed.data
        if (time > Date.now()) return Just(value as T)
        remove(key)
        return Nothing()
      }
    } catch {}
    remove(key)
    return Nothing()
  }

  export function remove(key: string): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.removeItem(genKey(key))
    } catch {}
  }

  export function getOr<T extends Value>(key: string, defaultFn: () => T, seconds: number = 3600): T {
    return get<T>(key).unwrapOrElse(() => {
      const value = defaultFn()
      set(key, value, seconds)
      return value
    })
  }

  export async function getOrAsync<T extends Value>(
    key: string,
    defaultFn: () => Promise<T>,
    seconds: number = 3600
  ): Promise<T> {
    const result = get<T>(key)
    if (result.isJust()) return result.value as T
    const value = await defaultFn()
    set(key, value, seconds)
    return value
  }
}
