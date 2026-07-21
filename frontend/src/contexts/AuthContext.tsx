'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import api from '@/lib/api'
import { useRouter } from 'next/navigation'

interface Tenant {
  id: string
  name: string
  email: string
  plan: string
}

interface AuthContextType {
  tenant: Tenant | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  enterpriseLogin: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

const AUTH_WAKEUP_TIMEOUT_MS = 75000

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTokenExpired(token: string) {
  try {
    const [, payload] = String(token || '').split('.')
    if (!payload) return true
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(normalized))
    const exp = Number(decoded?.exp || 0)
    if (!exp) return true
    return exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

function shouldRetryAuthRequest(error: any) {
  const status = Number(error?.response?.status || 0)
  const code = String(error?.code || '')
  const hasNoResponse = !error?.response

  if (status === 408 || status === 429) return true
  if (status >= 500) return true
  if (hasNoResponse && (code === 'ECONNABORTED' || code === 'ERR_NETWORK')) return true

  return false
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  function safeStorageGet(key: string) {
    try {
      if (typeof window === 'undefined') return null
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  function safeStorageSet(key: string, value: string) {
    try {
      if (typeof window === 'undefined') return
      localStorage.setItem(key, value)
    } catch {
      // Ignore storage errors on restricted mobile/PWA contexts.
    }
  }

  function safeStorageRemove(key: string) {
    try {
      if (typeof window === 'undefined') return
      localStorage.removeItem(key)
    } catch {
      // Ignore storage errors on restricted mobile/PWA contexts.
    }
  }

  async function postAuthWithWakeRetry(url: string, payload: Record<string, unknown>) {
    const startedAt = Date.now()
    let attempt = 0
    let lastError: any = null

    while (Date.now() - startedAt < AUTH_WAKEUP_TIMEOUT_MS) {
      try {
        return await api.post(url, payload, { timeout: 25000 })
      } catch (error: any) {
        lastError = error
        if (!shouldRetryAuthRequest(error)) throw error

        attempt += 1
        const backoffMs = Math.min(12000, 2500 * attempt)
        await wait(backoffMs)
      }
    }

    throw lastError
  }

  useEffect(() => {
    const savedToken = safeStorageGet('token')
    const savedTenant = safeStorageGet('tenant')
    if (savedToken && savedTenant) {
      if (isTokenExpired(savedToken)) {
        safeStorageRemove('token')
        safeStorageRemove('tenant')
      } else {
        setToken(savedToken)
        try {
          setTenant(JSON.parse(savedTenant))
        } catch {
          safeStorageRemove('tenant')
        }
      }
    }
    setLoading(false)
  }, [])

  async function login(email: string, password: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const { data } = await postAuthWithWakeRetry('/auth/login', { email: normalizedEmail, password })
    safeStorageSet('token', data.token)
    safeStorageSet('tenant', JSON.stringify(data.tenant))
    setToken(data.token)
    setTenant(data.tenant)
    router.push('/dashboard')
  }

  async function enterpriseLogin(email: string, password: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const { data } = await postAuthWithWakeRetry('/auth/enterprise-login', { email: normalizedEmail, password })
    safeStorageSet('token', data.token)
    safeStorageSet('tenant', JSON.stringify(data.tenant))
    setToken(data.token)
    setTenant(data.tenant)
    router.push('/dashboard')
  }

  async function register(name: string, email: string, password: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const { data } = await postAuthWithWakeRetry('/auth/register', { name, email: normalizedEmail, password })
    safeStorageSet('token', data.token)
    safeStorageSet('tenant', JSON.stringify(data.tenant))
    setToken(data.token)
    setTenant(data.tenant)
    router.push('/dashboard')
  }

  function logout() {
    safeStorageRemove('token')
    safeStorageRemove('tenant')
    setToken(null)
    setTenant(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ tenant, token, login, enterpriseLogin, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
