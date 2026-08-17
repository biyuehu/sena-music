import { Cache } from './cache'

export type Theme = 'light' | 'dark' | 'auto'

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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

  if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getStoredTheme() === 'auto') {
        applyTheme('auto')
      }
    })
  }
}
