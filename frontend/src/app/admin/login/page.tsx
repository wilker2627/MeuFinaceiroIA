'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import adminApi from '@/lib/adminApi'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data } = await adminApi.post('/admin/login', { email, password })
      localStorage.setItem('admin_token', data.token)
      localStorage.setItem('admin_profile', JSON.stringify(data.admin))
      router.push('/admin/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha no login admin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-cyan-300">FinanceIA Admin</h1>
        <p className="text-sm text-slate-400 mt-1">Acesso privado da operacao</p>

        {error && <div className="mt-4 rounded-lg bg-rose-900/40 border border-rose-600 text-rose-200 p-3 text-sm">{error}</div>}

        <div className="mt-5">
          <label className="text-sm text-slate-300">Email</label>
          <input
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="mt-4">
          <label className="text-sm text-slate-300">Senha</label>
          <input
            className="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold py-2 disabled:opacity-60"
        >
          {loading ? 'Entrando...' : 'Entrar no Admin'}
        </button>
      </form>
    </div>
  )
}
