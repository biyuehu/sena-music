import { describe, expect, it } from 'bun:test'
import { parseHexOrRgbColor } from '../src/web/visualizer'

describe('Visualizer Color Parsing', () => {
  it('should parse 6-character hex correctly', () => {
    const orange = parseHexOrRgbColor('#f97316')
    expect(orange).toEqual({ r: 249, g: 115, b: 22 })

    const blue = parseHexOrRgbColor('#3b82f6')
    expect(blue).toEqual({ r: 59, g: 130, b: 246 })
  })

  it('should parse 3-character hex correctly', () => {
    const white = parseHexOrRgbColor('#fff')
    expect(white).toEqual({ r: 255, g: 255, b: 255 })

    const black = parseHexOrRgbColor('#000')
    expect(black).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('should parse rgb string correctly', () => {
    const parsed = parseHexOrRgbColor('rgb(16, 185, 129)')
    expect(parsed).toEqual({ r: 16, g: 185, b: 129 })
  })

  it('should fallback to default orange on invalid input', () => {
    const fallback = parseHexOrRgbColor('invalid-color')
    expect(fallback).toEqual({ r: 249, g: 115, b: 22 })
  })
})
