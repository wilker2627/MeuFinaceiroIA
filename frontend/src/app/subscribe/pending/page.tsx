'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'

export default function SubscribePendingPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <SubscribePendingContent />
    </Suspense>
  )
}

function SubscribePendingContent() {
  const params = useSearchParams()
  const checkoutId = params.get('checkoutId')

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-6 text-gray-100">
        <div className="flex justify-center mb-4">
            <Image src="/financeiroai-logo.svg?v=20260708r3" alt="FinanceiroAI" width={84} height={84} className="rounded-[1.4rem] shadow-[0_14px_36px_rgba(34,211,238,0.28)]" />
        </div>
        <p className="text-center text-2xl font-black tracking-tight text-cyan-300 mb-1">FinanceiroAI</p>
        <h1 className="text-2xl font-bold text-amber-300">Pagamento pendente</h1>
        <p className="text-sm text-gray-400 mt-2">Seu pagamento ainda esta sendo processado. Assim que aprovar, sua conta sera ativada automaticamente.</p>
        {checkoutId && <p className="mt-2 text-xs text-gray-500">Checkout: {checkoutId}</p>}

        <div className="mt-5 grid grid-cols-1 gap-2">
          <Link href={`/subscribe${checkoutId ? `?checkoutId=${checkoutId}` : ''}`} className="rounded-lg bg-cyan-400 hover:bg-cyan-300 text-gray-900 font-semibold py-2 text-center">
            Voltar para assinatura
          </Link>
          <Link href="/login" className="rounded-lg bg-gray-800 hover:bg-gray-700 py-2 text-center">
            Ja tenho conta, ir para login
          </Link>
        </div>
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

