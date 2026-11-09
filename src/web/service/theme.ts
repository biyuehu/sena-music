import { Storage } from '../utils/storage'

export type Theme = 'light' | 'dark' | 'auto'

export type ColorScheme = 'romi' | 'sena' | 'hitsuji' | 'ai' | 'hotaru' | 'saya' | 'ayumu' | 'tsubasa'

export interface ThemeColorItem {
  id: ColorScheme
  name: string
  brand: string
  light: string
  dark: string
}

export const THEME_COLORS: readonly ThemeColorItem[] = [
  { id: 'romi', name: '有村ロミ - Arimura Romi', brand: '#d87cb6', light: '#d87cb6', dark: '#ea9fd0' },
  { id: 'sena', name: '姬野星奏 - Himeno Sena', brand: '#E3AD88', light: '#E3AD88', dark: '#f0c8ad' },
  { id: 'hitsuji', name: '美浜羊 - Mihama Hitsuji', brand: '#F7DCFF', light: '#F7DCFF', dark: '#ebd0ff' },
  { id: 'ai', name: '夏目藍 - Natsume Ai', brand: '#5b8dee', light: '#5b8dee', dark: '#8eb3f6' },
  { id: 'hotaru', name: '水無月蛍 - Minazuki Hotaru', brand: '#4caf7d', light: '#4caf7d', dark: '#72c99a' },
  { id: 'saya', name: '遠藤沙弥 - Endou Saya', brand: '#FF9891', light: '#FF9891', dark: '#ffb7b3' },
  { id: 'ayumu', name: '七濑步 - Nanase Ayumu', brand: '#B28F96', light: '#B28F96', dark: '#d1b2b8' },
  { id: 'tsubasa', name: '羽音々翼 - Haotone Tsubasa', brand: '#BCE3EA', light: '#BCE3EA', dark: '#d2eff4' }
] as const

export const COLOR_SCHEMES: Record<ColorScheme, { light: string; dark: string }> = Object.fromEntries(
  THEME_COLORS.map((c) => [c.id, { light: c.light, dark: c.dark }])
) as Record<ColorScheme, { light: string; dark: string }>

const LEGACY_SCHEME_MAP: Record<string, ColorScheme> = {
  orange: 'sena',
  blue: 'ai',
  purple: 'hitsuji',
  green: 'hotaru',
  pink: 'romi'
}

export function getStoredColorScheme(): ColorScheme {
  const cached = Storage.get<string>('color-scheme')
  if (cached.isJust()) {
    const val = cached.value
    if (COLOR_SCHEMES[val as ColorScheme]) {
      return val as ColorScheme
    }
    if (LEGACY_SCHEME_MAP[val]) {
      return LEGACY_SCHEME_MAP[val]
    }
  }
  return 'sena'
}

export function applyColorScheme(scheme: ColorScheme): void {
  const colors = COLOR_SCHEMES[scheme] ?? COLOR_SCHEMES.sena
  const effective = getEffectiveTheme()
  const accent = effective === 'dark' ? colors.dark : colors.light
  document.documentElement.style.setProperty('--lx-accent', accent)
  Storage.set('color-scheme', scheme)
}

export function initColorScheme(): void {
  applyColorScheme(getStoredColorScheme())
}

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredTheme(): Theme {
  return Storage.get<string>('theme').unwrapOrElse(() => 'auto') as Theme
}

export function getEffectiveTheme(): 'light' | 'dark' {
  const theme = getStoredTheme()
  if (theme === 'auto') {
    return getSystemTheme()
  }
  return theme
}

export function applyTheme(theme: Theme): void {
  const effective = theme === 'auto' ? getSystemTheme() : theme
  if (typeof document !== 'undefined') {
    if (effective === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.setAttribute('data-theme', 'light')
    }
    document.dispatchEvent(new CustomEvent('theme-change', { detail: { theme, effective } }))
  }
  Storage.set('theme', theme)
}

export function toggleTheme(): 'light' | 'dark' {
  const current = getEffectiveTheme()
  const next = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

export function initTheme(): void {
  const stored = getStoredTheme()
  applyTheme(stored)

  const scheme = getStoredColorScheme()
  const colors = COLOR_SCHEMES[scheme] ?? COLOR_SCHEMES.sena
  const effective = getEffectiveTheme()
  document.documentElement.style.setProperty('--lx-accent', effective === 'dark' ? colors.dark : colors.light)

  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getStoredTheme() === 'auto') {
        applyTheme('auto')
      }
    })
  }
}
