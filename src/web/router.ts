export type AppRoute = 'playlist' | 'settings'

export function getAppRoute(): AppRoute {
  if (typeof window === 'undefined') return 'playlist'
  const hash = window.location.hash.toLowerCase()
  if (hash.includes('settings')) return 'settings'
  if (window.location.pathname.endsWith('settings.html')) return 'settings'
  return 'playlist'
}

export function navigateTo(route: AppRoute): void {
  if (typeof window === 'undefined') return
  window.location.hash = `#/${route}`
}
