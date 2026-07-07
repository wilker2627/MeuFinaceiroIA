'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import Link from 'next/link'
import Image from 'next/image'

const LOGIN_DRAFT_KEY = 'login_draft_v1'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showResetForm, setShowResetForm] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const raw = sessionStorage.getItem(LOGIN_DRAFT_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed.email === 'string') setEmail(parsed.email)
      if (typeof parsed.password === 'string') setPassword(parsed.password)
    } catch {
      sessionStorage.removeItem(LOGIN_DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(LOGIN_DRAFT_KEY, JSON.stringify({ email, password }))
  }, [email, password])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await login(email, password)
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(LOGIN_DRAFT_KEY)
      }
    } catch (err: any) {
      const apiError = err.response?.data?.error
      if (err.response?.status === 401) {
        setError('E-mail ou senha invalidos. Verifique se o e-mail esta correto e tente novamente.')
      } else {
        setError(apiError || 'Erro ao fazer login.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleLocalReset() {
    setError('')
    setInfo('')

    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Informe seu e-mail para redefinir a senha.')
      return
    }

    if (newPassword.length < 8) {
      setError('A nova senha precisa ter no minimo 8 caracteres.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setError('A confirmacao da nova senha nao confere.')
      return
    }

    setResetting(true)
    try {
      const { data } = await api.post('/auth/password-reset-local', {
        email: normalizedEmail,
        newPassword
      })
      setInfo(data?.message || 'Senha redefinida. Tente fazer login novamente.')
      setShowResetForm(false)
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Nao foi possivel redefinir a senha agora.')
    } finally {
      setResetting(false)
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
          <p className="text-gray-400 mt-2">Seu app financeiro inteligente</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-800">
          <h2 className="text-xl font-semibold text-white mb-6">Entrar na conta</h2>

          {error && (
            <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          {info && (
            <div className="bg-emerald-900/35 border border-emerald-500 text-emerald-300 rounded-lg p-3 mb-4 text-sm">
              {info}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-gray-400 text-sm mb-2">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-green-500"
              placeholder="seu@email.com"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-400 text-sm mb-2">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-green-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={() => {
              setError('')
              setInfo('')
              setShowResetForm((prev) => !prev)
            }}
            className="w-full mt-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {showResetForm ? 'Cancelar redefinicao' : 'Esqueci minha senha'}
          </button>

          {showResetForm && (
            <div className="mt-4 p-4 rounded-lg border border-slate-700 bg-slate-800/60 space-y-3">
              <p className="text-sm text-slate-300">Defina uma nova senha para este e-mail.</p>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Nova senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-cyan-500"
                  placeholder="Minimo 8 caracteres"
                />
              </div>

              <div>
                <label className="block text-gray-400 text-sm mb-2">Confirmar nova senha</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-cyan-500"
                  placeholder="Repita a nova senha"
                />
              </div>

              <button
                type="button"
                onClick={handleLocalReset}
                disabled={resetting}
                className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-semibold py-2.5 rounded-lg transition-colors"
              >
                {resetting ? 'Redefinindo...' : 'Confirmar nova senha'}
              </button>
            </div>
          )}

          <p className="text-center text-gray-500 text-sm mt-4">
            Não tem conta?{' '}
            <Link href="/register" className="text-green-400 hover:text-green-300">
              Criar conta grátis
            </Link>
          </p>

          <p className="text-center text-gray-600 text-xs mt-3">
            Painel interno?{' '}
            <Link href="/admin/login" className="text-cyan-400 hover:text-cyan-300">
              Acessar Admin
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
