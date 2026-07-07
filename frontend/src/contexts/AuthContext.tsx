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

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedTenant = localStorage.getItem('tenant')
    if (savedToken && savedTenant) {
      setToken(savedToken)
      setTenant(JSON.parse(savedTenant))
    }
    setLoading(false)
  }, [])

  async function login(email: string, password: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const { data } = await api.post('/auth/login', { email: normalizedEmail, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('tenant', JSON.stringify(data.tenant))
    setToken(data.token)
    setTenant(data.tenant)
    router.push('/dashboard')
  }

  async function register(name: string, email: string, password: string) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const { data } = await api.post('/auth/register', { name, email: normalizedEmail, password })
    localStorage.setItem('token', data.token)
    localStorage.setItem('tenant', JSON.stringify(data.tenant))
    setToken(data.token)
    setTenant(data.tenant)
    router.push('/dashboard')
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('tenant')
    setToken(null)
    setTenant(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ tenant, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
