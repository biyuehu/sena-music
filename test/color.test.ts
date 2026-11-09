import { describe, expect, it } from 'bun:test'
import { clearCoverColorCache, computeDominantColor, extractCoverColor } from '../src/web/utils/color'

describe('color utils', () => {
  it('returns null for empty or invalid pixel data', () => {
    expect(computeDominantColor([])).toBeNull()
    expect(computeDominantColor([255, 0, 0])).toBeNull()
  })

  it('returns null if all pixels are transparent', () => {
    const transparentPixels = [255, 0, 0, 0, 0, 255, 0, 50, 0, 0, 255, 127]
    expect(computeDominantColor(transparentPixels)).toBeNull()
  })

  it('correctly computes dominant color for uniform pixels', () => {
    const redPixels = [255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]
    const color = computeDominantColor(redPixels)
    expect(color).not.toBeNull()
    expect(color?.r).toBe(255)
    expect(color?.g).toBe(0)
    expect(color?.b).toBe(0)
  })

  it('prioritizes saturated color over black borders/letterboxing', () => {
    // 6 black border pixels and 2 vibrant cyan pixels
    const pixels = [
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 200, 200, 255, 0, 200, 200,
      255
    ]
    const color = computeDominantColor(pixels)
    expect(color).not.toBeNull()
    // Should choose the cyan bucket, not the black bucket
    expect(color?.g).toBeGreaterThan(150)
    expect(color?.b).toBeGreaterThan(150)
  })

  it('correctly falls back to grayscale for monochrome pixels', () => {
    const grayPixels = [128, 128, 128, 255, 128, 128, 128, 255]
    const color = computeDominantColor(grayPixels)
    expect(color).not.toBeNull()
    expect(color?.r).toBe(128)
    expect(color?.g).toBe(128)
    expect(color?.b).toBe(128)
  })

  it('extractCoverColor returns null for empty url or in non-browser env', async () => {
    expect(await extractCoverColor('')).toBeNull()
    expect(await extractCoverColor('https://example.com/cover.jpg')).toBeNull()
  })

  it('clearCoverColorCache runs cleanly', () => {
    expect(() => clearCoverColorCache()).not.toThrow()
  })
})
