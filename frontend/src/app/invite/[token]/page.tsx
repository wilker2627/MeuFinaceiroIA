'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/lib/api'

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()

  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const { data } = await api.post(`/billing/family-invites/${params.token}/accept`, {
        name,
        phoneNumber
      })
      setSuccess(data.message || 'Convite aceito!')
      setTimeout(() => router.push('/login'), 1200)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Falha ao aceitar convite.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h1 className="text-2xl font-bold text-cyan-300">Convite da Familia</h1>
        <p className="text-sm text-gray-400 mt-1">Informe seus dados para entrar no grupo financeiro.</p>

        {error && <div className="mt-4 rounded-lg bg-rose-900/40 border border-rose-500 text-rose-200 p-3 text-sm">{error}</div>}
        {success && <div className="mt-4 rounded-lg bg-emerald-900/40 border border-emerald-500 text-emerald-200 p-3 text-sm">{success}</div>}

        <div className="mt-4 space-y-3">
          <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2" placeholder="WhatsApp com DDD" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
        </div>

        <button disabled={loading} className="mt-5 w-full rounded-lg bg-cyan-400 hover:bg-cyan-300 text-gray-900 font-semibold py-2 disabled:opacity-60">
          {loading ? 'Processando...' : 'Aceitar convite'}
        </button>
      </form>
    </div>
  )
}
