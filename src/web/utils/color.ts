export interface RGB {
  r: number
  g: number
  b: number
}

const colorCache = new Map<string, string>()

/**
 * Computes the dominant RGB color from an RGBA pixel array.
 * Scores vibrant and saturated colors higher while filtering out transparent
 * and extreme black/white borders.
 */
export const computeDominantColor = (pixels: Uint8ClampedArray | number[]): RGB | null => {
  if (!pixels || pixels.length < 4) return null

  // 16x16x16 color bins: 4096 possible color buckets
  const bins = new Map<number, { count: number; r: number; g: number; b: number; score: number }>()
  const totalPixels = Math.floor(pixels.length / 4)

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4
    const r = pixels[offset]
    const g = pixels[offset + 1]
    const b = pixels[offset + 2]
    const a = pixels[offset + 3]

    // Skip transparent or semi-transparent pixels
    if (a < 128) continue

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    const l = (max + min) / 2

    // Extreme white or black (letterboxing / margins)
    const isExtreme = l < 20 || l > 240
    const sat = max === 0 ? 0 : delta / max

    const binKey = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const existing = bins.get(binKey)

    // Vibrant colors get boosted score; extreme borders get heavily dampened score
    const weight = (isExtreme ? 0.05 : 1) * (1 + sat * 2)

    if (existing) {
      existing.count += 1
      existing.r += r
      existing.g += g
      existing.b += b
      existing.score += weight
    } else {
      bins.set(binKey, {
        count: 1,
        r,
        g,
        b,
        score: weight
      })
    }
  }

  if (bins.size === 0) return null

  let bestBin: { count: number; r: number; g: number; b: number; score: number } | null = null
  for (const bin of bins.values()) {
    if (!bestBin || bin.score > bestBin.score) bestBin = bin
  }

  if (!bestBin || bestBin.count === 0) return null

  return {
    r: Math.round(bestBin.r / bestBin.count),
    g: Math.round(bestBin.g / bestBin.count),
    b: Math.round(bestBin.b / bestBin.count)
  }
}

/**
 * Extracts dominant color from an image URL and returns it as 'r, g, b' string.
 * Gracefully resolves to null on CORS issues, invalid images, or non-browser environments.
 */
export const extractCoverColor = (url: string): Promise<string | null> => {
  if (!url) return Promise.resolve(null)
  const cached = colorCache.get(url)
  if (cached) return Promise.resolve(cached)

  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(null)

  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const size = 64
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0, size, size)
          const imageData = ctx.getImageData(0, 0, size, size)
          const rgb = computeDominantColor(imageData.data)
          if (!rgb) return resolve(null)
          const colorStr = `${rgb.r}, ${rgb.g}, ${rgb.b}`
          colorCache.set(url, colorStr)
          resolve(colorStr)
        } catch {
          resolve(null)
        }
      }

      img.onerror = () => resolve(null)

      img.src = url
    } catch {
      resolve(null)
    }
  })
}

export const clearCoverColorCache = (): void => {
  colorCache.clear()
}
