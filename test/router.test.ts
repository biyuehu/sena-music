import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getAppRoute, navigateTo } from '../src/web/utils/router'

describe('Router', () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    globalThis.window = {
      location: {
        hash: ''
      }
    } as unknown as Window & typeof globalThis
  })

  afterEach(() => {
    globalThis.window = originalWindow
  })

  it('should default to playlist route when hash is empty', () => {
    expect(getAppRoute()).toBe('playlist')
  })

  it('should return settings route when hash contains settings', () => {
    window.location.hash = '#/settings'
    expect(getAppRoute()).toBe('settings')

    window.location.hash = '#/settings?tab=general'
    expect(getAppRoute()).toBe('settings')
  })

  it('should return about route when hash contains about', () => {
    window.location.hash = '#/about'
    expect(getAppRoute()).toBe('about')
  })

  it('should return playlist route for other hashes', () => {
    window.location.hash = '#/playlist'
    expect(getAppRoute()).toBe('playlist')

    window.location.hash = '#/unknown-route'
    expect(getAppRoute()).toBe('playlist')
  })

  it('should navigateTo specified route', () => {
    navigateTo('settings')
    expect(window.location.hash).toBe('#/settings')

    navigateTo('playlist')
    expect(window.location.hash).toBe('#/playlist')
  })
})
