'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Image from 'next/image'

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
        <div className="inline-flex items-center justify-center rounded-3xl border border-cyan-500/30 bg-cyan-500/10 p-2 mb-4">
          <Image src="/financeiroai-logo.svg?v=20260708r3" alt="FinanceiroAI" width={72} height={72} priority className="rounded-2xl" />
        </div>
        <div className="text-3xl font-bold text-cyan-300 mb-2">FinanceiroAI</div>
        <p className="text-gray-400">Carregando...</p>
      </div>
    </div>
  )
}
