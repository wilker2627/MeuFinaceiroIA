'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Sparkles } from 'lucide-react'

export default function OnboardingGuide() {
  const router = useRouter()
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true)

  useEffect(() => {
    const seen = localStorage.getItem('onboarding_seen')
    if (!seen) {
      setHasSeenOnboarding(false)
    }
  }, [])

  if (hasSeenOnboarding) return null

  const steps = [
    {
      title: '💰 Registre suas transações',
      desc: 'Clique em "Novo Lançamento" e adicione seus gastos e entradas do dia'
    },
    {
      title: '📊 Veja seu dashboard',
      desc: 'Acompanhe gráficos, saldo total e saúde financeira em tempo real'
    },
    {
      title: '📑 Gere relatórios',
      desc: 'Exporte PDFs profissionais com seus dados de 1, 3 ou 12 meses'
    },
    {
      title: '🎯 Crie metas',
      desc: 'Defina objetivos financeiros e acompanhe seu progresso'
    }
  ]

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-cyan-500/20 rounded-3xl p-8 md:p-10 max-w-2xl w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="text-cyan-400" size={28} />
          <h1 className="text-3xl font-black text-white">Bem-vindo ao MeuFinanceiro</h1>
        </div>

        <p className="text-slate-300 mb-8">
          Aqui está um guia rápido para você começar:
        </p>

        <div className="space-y-4 mb-8">
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-4 p-4 rounded-xl bg-slate-800/50 border border-cyan-500/10 hover:border-cyan-500/30 transition">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center">
                <span className="text-cyan-300 font-bold text-sm">{idx + 1}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold">{step.title}</h3>
                <p className="text-slate-400 text-sm mt-1">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => {
              localStorage.setItem('onboarding_seen', 'true')
              setHasSeenOnboarding(true)
            }}
            className="bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-semibold py-3 rounded-lg transition border border-slate-600"
          >
            Pular
          </button>
          <Link
            href="/dashboard/transactions"
            onClick={() => localStorage.setItem('onboarding_seen', 'true')}
            className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-900 font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            Começar agora
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  )
}
