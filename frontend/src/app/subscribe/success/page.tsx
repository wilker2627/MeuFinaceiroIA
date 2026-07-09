'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import api from '@/lib/api'

export default function SubscribeSuccessPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <SubscribeSuccessContent />
    </Suspense>
  )
}

function SubscribeSuccessContent() {
  const params = useSearchParams()
  const router = useRouter()
  const checkoutId = params.get('checkoutId') || ''

  const [message, setMessage] = useState('Pagamento recebido. Validando ativacao da conta...')
  const [loading, setLoading] = useState(false)

  async function checkStatus() {
    if (!checkoutId) {
      setMessage('checkoutId nao informado no retorno.')
      return
    }

    setLoading(true)
    try {
      const { data } = await api.get(`/billing/checkout/${checkoutId}/status`)
      if (data.status === 'PAID' && data.token && data.tenant) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('tenant', JSON.stringify(data.tenant))
        router.push('/dashboard')
        return
      }
      setMessage(`Status atual: ${data.status}. Aguarde alguns segundos e tente novamente.`)
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Falha ao consultar ativacao.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6 text-gray-100">
        <div className="flex justify-center mb-4">
            <Image src="/financeiroai-logo.svg?v=20260709r1" alt="FinanceiroAI" width={84} height={84} className="rounded-[1.4rem] shadow-[0_14px_36px_rgba(34,211,238,0.28)]" />
        </div>
        <p className="text-center text-2xl font-black tracking-tight text-cyan-300 mb-1">FinanceiroAI</p>
        <h1 className="text-2xl font-bold text-emerald-300">Pagamento aprovado</h1>
        <p className="text-sm text-gray-400 mt-2">{message}</p>
        <button onClick={checkStatus} disabled={loading} className="mt-5 w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-semibold py-2 disabled:opacity-60">
          {loading ? 'Validando...' : 'Entrar na minha conta'}
        </button>
      </div>
    </div>
  )
}

function PageFallback() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <p className="text-gray-400">Carregando...</p>
    </div>
  )
}

