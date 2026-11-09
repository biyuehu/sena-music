import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Cache } from '../src/web/utils/cache'
import { Storage } from '../src/web/utils/storage'

describe('Storage & Cache Architecture', () => {
  let store: Record<string, string> = {}

  beforeEach(() => {
    store = {}
    globalThis.localStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value)
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        store = {}
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length
      }
    } as unknown as Storage
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage
  })

  it('Storage should persist and retrieve values without TTL expiration', () => {
    Storage.set('test-key', 'persistent-value')
    const result = Storage.get<string>('test-key')
    expect(result.isJust()).toBe(true)
    if (result.isJust()) {
      expect(result.value).toBe('persistent-value')
    }

    // Stored as sena-storage:*
    expect(localStorage.getItem('sena-storage:test-key')).toBe(JSON.stringify('persistent-value'))
  })

  it('Storage should support boolean and number types', () => {
    Storage.set('num-key', 42.5)
    Storage.set('bool-key', true)

    expect(Storage.get<number>('num-key').unwrapOr(0)).toBe(42.5)
    expect(Storage.get<boolean>('bool-key').unwrapOr(false)).toBe(true)
  })

  it('Storage should remove values cleanly', () => {
    Storage.set('remove-key', 'to-be-removed')
    Storage.remove('remove-key')
    expect(Storage.get<string>('remove-key').isNothing()).toBe(true)
  })

  it('Storage.getOr should return existing value or fallback and persist default', () => {
    const val1 = Storage.getOr<string>('default-test', () => 'fallback-value')
    expect(val1).toBe('fallback-value')
    expect(Storage.get<string>('default-test').unwrapOr('')).toBe('fallback-value')

    const val2 = Storage.getOr<string>('default-test', () => 'new-fallback')
    expect(val2).toBe('fallback-value')
  })

  it('Storage should migrate legacy entries from Cache', () => {
    // Put entry in legacy Cache format
    Cache.set('legacy-setting', 'legacy-value', 3600)
    expect(localStorage.getItem('sena-cache:legacy-setting')).not.toBeNull()
    expect(localStorage.getItem('sena-storage:legacy-setting')).toBeNull()

    // Access via Storage.get
    const migrated = Storage.get<string>('legacy-setting')
    expect(migrated.isJust()).toBe(true)
    if (migrated.isJust()) {
      expect(migrated.value).toBe('legacy-value')
    }

    // Legacy cache entry should be removed and storage entry populated
    expect(localStorage.getItem('sena-cache:legacy-setting')).toBeNull()
    expect(localStorage.getItem('sena-storage:legacy-setting')).toBe(JSON.stringify('legacy-value'))
  })

  it('Cache should expire after TTL', () => {
    // Put item with negative TTL (already expired)
    Cache.set('expired-key', 'old-val', -10)
    const result = Cache.get<string>('expired-key')
    expect(result.isNothing()).toBe(true)
    expect(localStorage.getItem('sena-cache:expired-key')).toBeNull()
  })
})
