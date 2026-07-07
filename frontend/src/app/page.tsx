'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function HomePage() {
  const { tenant, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      router.replace(tenant ? '/dashboard' : '/login')
    }
  }, [tenant, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="text-4xl font-bold text-green-400 mb-2">MeuFinanceiro AI</div>
        <p className="text-gray-400">Carregando...</p>
      </div>
    </div>
  )
}