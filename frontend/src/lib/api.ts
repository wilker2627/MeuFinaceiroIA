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
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token')
      localStorage.removeItem('tenant')

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
