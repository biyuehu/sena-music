import { describe, expect, it } from 'bun:test'
import { Left, Right } from '../src/framework/utils/adt/either'
import { Just, Nothing } from '../src/framework/utils/adt/maybe'
import { Failure, Pending, Success } from '../src/framework/utils/adt/try'

describe('ADT Utilities', () => {
  describe('Either', () => {
    it('Right should handle mapping and unwrapping', () => {
      const r = Right(42)
      expect(r.isRight()).toBe(true)
      expect(r.isLeft()).toBe(false)
      expect(r.unwrap()).toBe(42)
      expect(r.unwrapOr(0)).toBe(42)
      expect(r.map((x) => x * 2).unwrap()).toBe(84)

      const matched = r.match({
        Right: (val) => `success: ${val}`,
        Left: (err) => `error: ${err}`
      })
      expect(matched).toBe('success: 42')
    })

    it('Left should handle error flows and unwrapOr fallback', () => {
      const l = Left<string, number>('something went wrong')
      expect(l.isLeft()).toBe(true)
      expect(l.isRight()).toBe(false)
      expect(l.unwrapLeft()).toBe('something went wrong')
      expect(l.unwrapOr(100)).toBe(100)
      expect(l.map((x) => x * 2).isLeft()).toBe(true)

      const matched = l.match({
        Right: (val) => `success: ${val}`,
        Left: (err) => `error: ${err}`
      })
      expect(matched).toBe('error: something went wrong')
    })
  })

  describe('Maybe', () => {
    it('Just should handle mapping and unwrapping', () => {
      const j = Just('hello')
      expect(j.isJust()).toBe(true)
      expect(j.isNothing()).toBe(false)
      expect(j.unwrap()).toBe('hello')
      expect(j.unwrapOr('world')).toBe('hello')
      expect(j.map((s) => s.toUpperCase()).unwrap()).toBe('HELLO')
    })

    it('Nothing should return fallback values', () => {
      const n = Nothing<string>()
      expect(n.isNothing()).toBe(true)
      expect(n.isJust()).toBe(false)
      expect(n.unwrapOr('fallback')).toBe('fallback')
      expect(n.map((s) => s.toUpperCase()).isNothing()).toBe(true)
    })
  })

  describe('Try', () => {
    it('Success should unwrap value and map', () => {
      const s = Success(100)
      expect(s.isSuccess()).toBe(true)
      expect(s.isFailure()).toBe(false)
      expect(s.isPending()).toBe(false)
      expect(s.unwrap()).toBe(100)
      expect(s.map((v) => v + 50).unwrap()).toBe(150)
    })

    it('Failure should unwrap failure value and fallback with unwrapOr', () => {
      const f = Failure('network timeout')
      expect(f.isFailure()).toBe(true)
      expect(f.isSuccess()).toBe(false)
      expect(f.unwrapFailure()).toBe('network timeout')
      expect(f.unwrapOr(0)).toBe(0)
    })

    it('Pending should report pending status', () => {
      const p = Pending()
      expect(p.isPending()).toBe(true)
      expect(p.isSuccess()).toBe(false)
      expect(p.isFailure()).toBe(false)
    })
  })
})
