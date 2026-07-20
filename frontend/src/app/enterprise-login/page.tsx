'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff, Building2, Lock, Loader } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'

export default function EnterpriseLoginPage() {
  const { enterpriseLogin } = useAuth()
  const { addToast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      await enterpriseLogin(email, password)
      addToast('Acesso empresarial autorizado. Entrando no painel...', 'success', 1800)
    } catch (err: any) {
      const status = Number(err?.response?.status || 0)
      if (status === 403) {
        addToast('Essa conta nao possui acesso empresarial. Consulte o administrativo.', 'warning')
      } else {
        addToast(err?.response?.data?.error || 'Falha no login empresarial.', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950/40 to-slate-950 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-2.5 bg-gradient-to-br from-emerald-500/16 to-cyan-500/14 border border-emerald-500/30 rounded-3xl mb-4 shadow-[0_16px_38px_rgba(16,185,129,0.2)]">
            <Image src="/financeiroai-logo.svg?v=20260709r1" alt="FinanceiroAI" width={84} height={84} priority className="rounded-2xl" />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">FinanceiroAI Empresa</h1>
          <p className="text-slate-400 mt-2 text-sm">Acesso dedicado para operacao empresarial</p>
          <p className="text-[11px] mt-1 uppercase tracking-[0.28em] text-emerald-300/75">Enterprise Ops</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gradient-to-br from-slate-900/80 to-slate-950 border border-emerald-500/20 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-4">
          <h2 className="text-xl font-bold text-white mb-6">Entrar no login empresarial</h2>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">E-mail empresarial</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800/50 border border-emerald-700/30 text-white rounded-lg px-10 py-3 placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none transition"
                placeholder="empresa@email.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800/50 border border-emerald-700/30 text-white rounded-lg px-10 py-3 placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none transition"
                placeholder="********"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-400 transition"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2 mt-6"
          >
            {loading && <Loader size={18} className="animate-spin" />}
            {loading ? 'Validando acesso...' : 'Entrar no Empresa'}
          </button>

          <div className="pt-3 border-t border-slate-800 space-y-2 text-center">
            <p className="text-xs text-slate-400">Conta comum ou familiar?</p>
            <Link href="/login" className="text-sm text-cyan-300 hover:text-cyan-200 underline underline-offset-4">
              Ir para login padrao
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
