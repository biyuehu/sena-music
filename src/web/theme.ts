import { Cache } from './cache'

export type Theme = 'light' | 'dark' | 'auto'

export type ColorScheme = 'orange' | 'blue' | 'purple' | 'green' | 'pink'

const COLOR_SCHEMES: Record<ColorScheme, { light: string; dark: string }> = {
  orange: { light: '#f97316', dark: '#fb923c' },
  blue: { light: '#3b82f6', dark: '#60a5fa' },
  purple: { light: '#8b5cf6', dark: '#a78bfa' },
  green: { light: '#10b981', dark: '#34d399' },
  pink: { light: '#ec4899', dark: '#f472b6' }
}

export function getStoredColorScheme(): ColorScheme {
  const cached = Cache.get<string>('color-scheme')
  if (cached.isJust() && COLOR_SCHEMES[cached.value as ColorScheme]) {
    return cached.value as ColorScheme
  }
  return 'orange'
}

export function applyColorScheme(scheme: ColorScheme): void {
  const colors = COLOR_SCHEMES[scheme] ?? COLOR_SCHEMES.orange
  const effective = getEffectiveTheme()
  const accent = effective === 'dark' ? colors.dark : colors.light
  document.documentElement.style.setProperty('--lx-accent', accent)
  Cache.set('color-scheme', scheme, 86400 * 365)
}

export function initColorScheme(): void {
  applyColorScheme(getStoredColorScheme())
}

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredTheme(): Theme {
  return Cache.get<string>('theme').unwrapOrElse(() => 'auto') as Theme
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
  Cache.set('theme', theme, 86400 * 365)
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
  const colors = COLOR_SCHEMES[scheme] ?? COLOR_SCHEMES.orange
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
