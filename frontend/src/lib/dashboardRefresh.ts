const DASHBOARD_REFRESH_EVENT = 'dashboard:refresh'
const DASHBOARD_REFRESH_KEY = 'dashboard_refresh_ts'

export function triggerDashboardRefresh() {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new Event(DASHBOARD_REFRESH_EVENT))

  try {
    window.localStorage.setItem(DASHBOARD_REFRESH_KEY, String(Date.now()))
  } catch {}
}

export function subscribeDashboardRefresh(handler: () => void) {
  if (typeof window === 'undefined') return () => undefined

  const onCustomEvent = () => handler()
  const onStorage = (event: StorageEvent) => {
    if (event.key === DASHBOARD_REFRESH_KEY) handler()
  }

  window.addEventListener(DASHBOARD_REFRESH_EVENT, onCustomEvent)
  window.addEventListener('storage', onStorage)

  return () => {
    window.removeEventListener(DASHBOARD_REFRESH_EVENT, onCustomEvent)
    window.removeEventListener('storage', onStorage)
  }
}