import axios from 'axios'

function resolveApiBaseUrl() {
  const explicit = String(process.env.NEXT_PUBLIC_API_URL || '').trim()
  if (explicit) return explicit
  return '/api'
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 15000
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    let token: string | null = null
    try {
      token = localStorage.getItem('token')
    } catch {
      token = null
    }
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = Number(err?.response?.status || 0)
    const shouldResetSession = status === 401 || status === 403

    if (shouldResetSession && typeof window !== 'undefined') {
      try {
        localStorage.removeItem('token')
        localStorage.removeItem('tenant')
      } catch {
        // Ignore storage errors on restricted mobile/PWA contexts.
      }

      const currentPath = window.location.pathname || ''
      const authPages = ['/login', '/register', '/admin/login']
      const isAuthPage = authPages.some((path) => currentPath === path || currentPath.startsWith(`${path}/`))

      if (!isAuthPage) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
