'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, Lock, User, Loader, Eye, EyeOff } from 'lucide-react'

export default function RegisterPage() {
  const { register } = useAuth()
  const { addToast } = useToast()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!form.name) {
      addToast('Informe o nome da sua familia ou empresa.', 'warning')
      return
    }
    
    if (form.password.length < 8) {
      addToast('Senha deve ter no minimo 8 caracteres.', 'warning')
      return
    }

    setLoading(true)
    try {
      await register(form.name, form.email, form.password)
      addToast('Conta criada com sucesso! Bem-vindo.', 'success', 2000)
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao criar conta.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center px-4 py-8">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-2.5 bg-gradient-to-br from-cyan-500/16 to-emerald-500/14 border border-cyan-500/30 rounded-3xl mb-4 shadow-[0_16px_38px_rgba(34,211,238,0.22)]">
            <Image
              src="/financeiroai-logo.svg?v=20260708r3"
              alt="FinanceiroAI"
              width={84}
              height={84}
              priority
              className="rounded-2xl"
            />
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">FinanceiroAI</h1>
          <p className="text-slate-400 mt-2 text-sm">Comece a controlar suas financas</p>
          <p className="text-[11px] mt-1 uppercase tracking-[0.28em] text-cyan-300/70">Smart Money OS</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-gradient-to-br from-slate-900/80 to-slate-950 border border-cyan-500/20 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-4">
          <h2 className="text-xl font-bold text-white mb-6">Criar uma conta</h2>

          {/* Name Field */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Nome da familia / empresa</label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
                className="w-full bg-slate-800/50 border border-cyan-700/30 text-white rounded-lg px-10 py-3 placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none transition"
                placeholder="Ex: Familia Silva"
              />
            </div>
          </div>

          {/* E-mail Field */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                required
                className="w-full bg-slate-800/50 border border-cyan-700/30 text-white rounded-lg px-10 py-3 placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none transition"
                placeholder="seu@email.com"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Senha (minimo 8 caracteres)</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                required
                className="w-full bg-slate-800/50 border border-cyan-700/30 text-white rounded-lg px-10 py-3 placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none transition"
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

          {/* Info Box */}
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-3 text-xs text-cyan-300">
            Plano gratuito inclui: Dashboard completo, PDF de relatorios, metas financeiras
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2 mt-6"
          >
            {loading && <Loader size={18} className="animate-spin" />}
            {loading ? 'Criando...' : 'Criar conta gratis'}
          </button>
        </form>

        {/* Footer Links */}
        <div className="mt-6 text-center space-y-3">
          <p className="text-slate-400 text-sm">
            Ja tem conta?{' '}
            <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold transition">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}


