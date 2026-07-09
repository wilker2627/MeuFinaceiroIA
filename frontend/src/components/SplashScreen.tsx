'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-600 pointer-events-none">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-cyan-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-cyan-400 rounded-full opacity-10 blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Logo Container */}
        <div className="relative w-40 h-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-cyan-600 rounded-3xl opacity-20 border-2 border-cyan-500" />
          <div className="relative w-28 h-28 rounded-2xl flex items-center justify-center shadow-2xl">
            <Image src="/financeiroai-logo.svg?v=20260708r3" alt="FinanceiroAI" width={112} height={112} priority className="rounded-2xl" />
          </div>
        </div>

        {/* App Name */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-cyan-100 tracking-wide">FinanceiroAI</h1>
          <p className="text-cyan-300 text-sm font-semibold mt-2 tracking-widest">SMART MONEY OS</p>
        </div>

        {/* Tagline */}
        <p className="text-cyan-200 text-center text-sm font-medium mt-4 max-w-xs">
          Seu assistente financeiro inteligente
        </p>

        {/* Loading Indicator */}
        <div className="flex gap-3 mt-8">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"
              style={{
                animationDelay: `${i * 0.2}s`,
                animationDuration: '1.4s'
              }}
            />
          ))}
        </div>

        {/* Footer */}
        <p className="text-cyan-400 text-xs mt-12 opacity-70">Carregando...</p>
      </div>
    </div>
  )
}

