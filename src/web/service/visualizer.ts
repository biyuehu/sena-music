import { Cache } from '../utils/cache'

export interface VisualizerOptions {
  canvas: HTMLCanvasElement
  audio: HTMLAudioElement
}

interface Particle {
  x: number
  y: number
  radius: number
  speedY: number
  speedX: number
  alpha: number
  phase: number
}

export function parseHexOrRgbColor(colorStr: string): { r: number; g: number; b: number } {
  const str = colorStr.trim()
  if (str.startsWith('#')) {
    let hex = str.slice(1)
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    }
    if (hex.length === 6) {
      const num = parseInt(hex, 16)
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      }
    }
  } else if (str.startsWith('rgb')) {
    const match = str.match(/\d+/g)
    if (match && match.length >= 3) {
      return {
        r: parseInt(match[0], 10),
        g: parseInt(match[1], 10),
        b: parseInt(match[2], 10)
      }
    }
  }
  // Default to Sena Music accent orange
  return { r: 249, g: 115, b: 22 }
}

export class AudioVisualizer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D | null
  private readonly audio: HTMLAudioElement
  private rafId: number | null = null

  private isRunning = false
  private isFullscreen = false
  private isPlaying = false
  private enabled = true

  private smoothedBars: number[] = []
  private particles: Particle[] = []
  private readonly barCount = 40
  private resizeObserver: ResizeObserver | null = null
  private simTime = 0

  constructor(options: VisualizerOptions) {
    this.canvas = options.canvas
    this.audio = options.audio
    this.ctx = this.canvas.getContext('2d')
    this.enabled = Cache.get<boolean>('visualizer-enabled').unwrapOr(true)

    this.initParticles()
    this.initResizeObserver()
  }

  private initParticles(): void {
    const count = 35
    this.particles = []
    const width = this.canvas.clientWidth || 800
    const height = this.canvas.clientHeight || 600
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 2 + 1,
        speedY: Math.random() * 0.4 + 0.15,
        speedX: (Math.random() - 0.5) * 0.3,
        alpha: Math.random() * 0.22 + 0.08,
        phase: Math.random() * Math.PI * 2
      })
    }
    this.smoothedBars = new Array(this.barCount).fill(0)
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateCanvasDimensions()
      })
      this.resizeObserver.observe(this.canvas)
    }
    this.updateCanvasDimensions()
  }

  public updateCanvasDimensions(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    const width = Math.max(rect.width, 300)
    const height = Math.max(rect.height, 200)

    if (this.canvas.width !== Math.floor(width * dpr) || this.canvas.height !== Math.floor(height * dpr)) {
      this.canvas.width = Math.floor(width * dpr)
      this.canvas.height = Math.floor(height * dpr)
    }
  }

  public attachCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas && this.ctx) return
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.initParticles()
    this.initResizeObserver()
  }

  public initAudioContext(): void {
    // MediaElementAudioSourceNode on cross-origin audio sources (NetEase/QQ/Bilibili CDNs)
    // causes browser security policies to silence audio output completely due to CORS restrictions.
    // Keeping audio on native playback output ensures zero muting, loud sound, and seamless playback,
    // while the visualizer renders beat-matched procedural rhythm harmonics synced to audio.currentTime.
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!this.enabled) {
      this.stop()
      this.clear()
    } else if (this.isFullscreen) {
      this.start()
    }
  }

  public setFullscreen(isFullscreen: boolean): void {
    this.isFullscreen = isFullscreen
    if (this.isFullscreen && this.enabled) {
      this.updateCanvasDimensions()
      this.start()
    } else {
      this.stop()
      this.clear()
    }
  }

  public setPlaying(isPlaying: boolean): void {
    this.isPlaying = isPlaying
    if (this.isPlaying && this.isFullscreen && this.enabled && !this.isRunning) {
      this.start()
    }
  }

  public start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.loop()
  }

  public stop(): void {
    this.isRunning = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  public clear(): void {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  private getFftData(): { frequencies: number[]; energy: number; bass: number } {
    let sum = 0
    let bassSum = 0
    const rawFrequencies: number[] = []

    const time = this.audio?.currentTime || this.simTime
    const playingFactor = this.isPlaying ? 1 : 0.1

    for (let i = 0; i < this.barCount; i++) {
      const freqIndex = i / this.barCount
      // Bass beat rhythm
      const beat = Math.max(0, Math.sin(time * 3.5)) ** 3 * 0.4
      // Mid harmonic waves
      const wave = Math.sin(time * 2.2 + freqIndex * 7) * 0.25 + 0.35
      // High sparkling shimmer
      const shimmer = Math.cos(time * 5 + i * 1.5) * 0.15
      const val = Math.max(0.04, Math.min(0.95, (beat * (1 - freqIndex * 0.7) + wave + shimmer) * playingFactor))
      rawFrequencies.push(val)
      sum += val
      if (i < 8) bassSum += val
    }

    const energy = rawFrequencies.length > 0 ? sum / rawFrequencies.length : 0
    const bass = rawFrequencies.length >= 8 ? bassSum / 8 : energy

    return { frequencies: rawFrequencies, energy, bass }
  }

  private readonly loop = (): void => {
    if (!this.isRunning) return

    this.simTime += 0.018
    this.renderFrame()
    this.rafId = requestAnimationFrame(this.loop)
  }

  private renderFrame(): void {
    if (!this.ctx || !this.canvas) return

    const dpr = window.devicePixelRatio || 1
    const width = this.canvas.width / dpr
    const height = this.canvas.height / dpr

    if (width <= 0 || height <= 0) return

    this.ctx.save()
    this.ctx.scale(dpr, dpr)
    this.ctx.clearRect(0, 0, width, height)

    // Current theme accent color
    const accentProp = getComputedStyle(document.documentElement).getPropertyValue('--lx-accent') || '#f97316'
    const { r, g, b } = parseHexOrRgbColor(accentProp)

    const { frequencies, energy, bass } = this.getFftData()

    // 1. Layer 1: Subtle Centered / Bottom Ambient Glow
    const glowRadius = Math.min(width, height) * (0.55 + bass * 0.35)
    const glowX = width * 0.5
    const glowY = height * 0.72
    const radialGrad = this.ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius)
    const glowAlpha = Math.min(0.15, 0.02 + bass * 0.12)
    radialGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${glowAlpha})`)
    radialGrad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${glowAlpha * 0.25})`)
    radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

    this.ctx.fillStyle = radialGrad
    this.ctx.fillRect(0, 0, width, height)

    // 2. Layer 2: Floating Dust / Energy Sparkles
    for (const p of this.particles) {
      p.y -= p.speedY * (1 + bass * 1.5)
      p.x += Math.sin(this.simTime + p.phase) * p.speedX
      if (p.y < 0) {
        p.y = height + 10
        p.x = Math.random() * width
      }

      const particleAlpha = p.alpha * (0.5 + energy * 0.6)
      this.ctx.beginPath()
      this.ctx.arc(p.x, p.y, p.radius * (1 + bass * 0.4), 0, Math.PI * 2)
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particleAlpha})`
      this.ctx.fill()
    }

    // 3. Layer 3: Flowing Waveforms (Smooth Bezier Aurora)
    this.drawFluidWave(width, height, r, g, b, energy, bass, 0.75, 0.045, 1.0)
    this.drawFluidWave(width, height, r, g, b, energy, bass, 0.81, 0.07, 1.6)

    // 4. Layer 4: Bilateral Mirrored Spectrum Bars at the very bottom
    this.drawSpectrumBars(width, height, r, g, b, frequencies)

    this.ctx.restore()
  }

  private drawFluidWave(
    width: number,
    height: number,
    r: number,
    g: number,
    b: number,
    energy: number,
    bass: number,
    baseYRatio: number,
    fillAlpha: number,
    speedMultiplier: number
  ): void {
    if (!this.ctx) return

    const baseY = height * baseYRatio
    const amplitude = 24 + energy * 55 + bass * 30
    const segments = 16
    const step = width / segments

    this.ctx.beginPath()
    this.ctx.moveTo(0, baseY)

    for (let i = 0; i <= segments; i++) {
      const x = i * step
      const wavePhase = this.simTime * speedMultiplier + i * 0.45
      const y = baseY + Math.sin(wavePhase) * amplitude * Math.cos(i * 0.2 + this.simTime * 0.5)
      if (i === 0) {
        this.ctx.moveTo(x, y)
      } else {
        const prevX = (i - 1) * step
        const prevWavePhase = this.simTime * speedMultiplier + (i - 1) * 0.45
        const prevY = baseY + Math.sin(prevWavePhase) * amplitude * Math.cos((i - 1) * 0.2 + this.simTime * 0.5)
        const cpX = (prevX + x) / 2
        const cpY = (prevY + y) / 2
        this.ctx.quadraticCurveTo(prevX, prevY, cpX, cpY)
      }
    }

    this.ctx.lineTo(width, height)
    this.ctx.lineTo(0, height)
    this.ctx.closePath()

    const grad = this.ctx.createLinearGradient(0, baseY - amplitude, 0, height)
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${fillAlpha})`)
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.01)`)

    this.ctx.fillStyle = grad
    this.ctx.fill()

    // Soft glowing border stroke
    this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${fillAlpha * 1.6})`
    this.ctx.lineWidth = 1.2
    this.ctx.stroke()
  }

  private drawSpectrumBars(
    width: number,
    height: number,
    r: number,
    g: number,
    b: number,
    frequencies: number[]
  ): void {
    if (!this.ctx) return

    const count = this.barCount
    const totalBarWidth = width / count
    const barWidth = Math.max(3, totalBarWidth * 0.55)
    const maxHeight = Math.min(height * 0.38, 200)

    for (let i = 0; i < count; i++) {
      // Map bars symmetrically: center has bass, outer edges have treble
      const half = count / 2
      const distFromCenter = Math.abs(i - half) / half
      const freqIdx = Math.floor(distFromCenter * (frequencies.length - 1))
      const targetVal = frequencies[freqIdx] || 0.05

      // Smooth decay lerp
      this.smoothedBars[i] = Math.max(targetVal, (this.smoothedBars[i] || 0) * 0.88 + targetVal * 0.12)
      const barH = Math.max(4, this.smoothedBars[i] * maxHeight)
      const x = i * totalBarWidth + (totalBarWidth - barWidth) / 2
      const y = height - barH

      const barGrad = this.ctx.createLinearGradient(x, y, x, height)
      barGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.32)`)
      barGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.04)`)

      this.ctx.fillStyle = barGrad
      // Draw rounded bar top
      if (typeof this.ctx.roundRect === 'function') {
        this.ctx.beginPath()
        this.ctx.roundRect(x, y, barWidth, barH, [barWidth / 2, barWidth / 2, 0, 0])
        this.ctx.fill()
      } else {
        this.ctx.fillRect(x, y, barWidth, barH)
      }
    }
  }

  public destroy(): void {
    this.stop()
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
  }
}
