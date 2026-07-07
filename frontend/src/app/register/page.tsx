'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import Image from 'next/image'

export default function RegisterPage() {
  const { register } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) { setError('Senha deve ter no mínimo 8 caracteres.'); return }
    setLoading(true)
    try {
      await register(form.name, form.email, form.password)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-9">
          <div className="flex justify-center mb-4">
            <Image src="/financeiroai-logo.svg" alt="FinanceiroAI" width={124} height={124} className="rounded-[2rem] shadow-[0_18px_48px_rgba(34,211,238,0.32)]" />
          </div>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-cyan-300">FinanceiroAI</h1>
          <p className="text-gray-400 mt-2">Crie sua conta ou assine um plano completo</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-800">
          <h2 className="text-xl font-semibold text-white mb-6">Criar conta</h2>

          {error && (
            <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg p-3 mb-4 text-sm">{error}</div>
          )}

          {[
            { key: 'name', label: 'Nome da empresa / família', type: 'text', placeholder: 'Ex: Ótica Ideale ou Família Matos' },
            { key: 'email', label: 'E-mail', type: 'email', placeholder: 'seu@email.com' },
            { key: 'password', label: 'Senha (mínimo 8 caracteres)', type: 'password', placeholder: '••••••••' },
          ].map(field => (
            <div key={field.key} className="mb-4">
              <label className="block text-gray-400 text-sm mb-2">{field.label}</label>
              <input
                type={field.type}
                value={form[field.key as keyof typeof form]}
                onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                required
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-green-500"
                placeholder={field.placeholder}
              />
            </div>
          ))}

          <div className="bg-gray-800 rounded-lg p-3 mb-6 text-xs text-gray-400">
            ✅ Plano gratuito inclui:<br />
            • 2 usuários WhatsApp<br />
            • 100 lançamentos/mês<br />
            • Dashboard completo
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Criando...' : 'Criar conta grátis'}
          </button>

          <p className="text-center text-gray-500 text-sm mt-4">
            Já tem conta?{' '}
            <Link href="/login" className="text-green-400 hover:text-green-300">Entrar</Link>
          </p>

          <p className="text-center text-gray-600 text-xs mt-3">
            Quer escolher plano e pagar online?{' '}
            <Link href="/subscribe" className="text-cyan-400 hover:text-cyan-300">Ir para assinatura self-service</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
