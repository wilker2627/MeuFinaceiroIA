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

  useEffect(() => {
    const savedToken = safeStorageGet('token')
    const savedTenant = safeStorageGet('tenant')
    if (savedToken && savedTenant) {
      setToken(savedToken)
      try {
        setTenant(JSON.parse(savedTenant))
      } catch {
        safeStorageRemove('tenant')
      }
    }
    setLoading(false)
  }, [])

  async function login(email: string, password: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const { data } = await api.post('/auth/login', { email: normalizedEmail, password })
    safeStorageSet('token', data.token)
    safeStorageSet('tenant', JSON.stringify(data.tenant))
    setToken(data.token)
    setTenant(data.tenant)
    router.push('/dashboard')
  }

  async function enterpriseLogin(email: string, password: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const { data } = await api.post('/auth/enterprise-login', { email: normalizedEmail, password })
    safeStorageSet('token', data.token)
    safeStorageSet('tenant', JSON.stringify(data.tenant))
    setToken(data.token)
    setTenant(data.tenant)
    router.push('/dashboard')
  }

  async function register(name: string, email: string, password: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const { data } = await api.post('/auth/register', { name, email: normalizedEmail, password })
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
