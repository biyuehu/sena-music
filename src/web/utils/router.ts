export type AppRoute = 'playlist' | 'settings' | 'about'

export function getAppRoute(): AppRoute {
  if (typeof window === 'undefined') return 'playlist'
  const hash = window.location.hash.toLowerCase()
  if (hash.includes('settings')) return 'settings'
  if (hash.includes('about')) return 'about'
  return 'playlist'
}

export function navigateTo(route: AppRoute): void {
  if (typeof window === 'undefined') return
  if (getAppRoute() === route) return
  window.location.hash = `#/${route}`
}
