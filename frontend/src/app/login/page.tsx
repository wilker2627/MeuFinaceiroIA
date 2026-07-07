'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import api from '@/lib/api'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Lock, Loader } from 'lucide-react'

const LOGIN_DRAFT_KEY = 'login_draft_v1'

export default function LoginPage() {
  const { login } = useAuth()
  const { addToast } = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showResetForm, setShowResetForm] = useState(false)
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
    setLoading(true)
    try {
      await login(email, password)
      sessionStorage.removeItem(LOGIN_DRAFT_KEY)
      addToast('Bem-vindo! Entrando em seu dashboard...', 'success', 2000)
    } catch (err: any) {
      if (err.response?.status === 401) {
        addToast('E-mail ou senha inválidos. Verifique seus dados.', 'error')
      } else {
        addToast(err.response?.data?.error || 'Erro ao fazer login.', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleLocalReset() {
    if (!email) {
      addToast('Informe seu e-mail para redefinir a senha.', 'warning')
      return
    }
    if (newPassword.length < 8) {
      addToast('A nova senha deve ter no mínimo 8 caracteres.', 'warning')
      return
    }
    if (newPassword !== confirmNewPassword) {
      addToast('As senhas não conferem.', 'error')
      return
    }

    setResetting(true)
    try {
      await api.post('/auth/password-reset-local', {
        email: email.trim().toLowerCase(),
        newPassword
      })
      addToast('Senha redefinida com sucesso! Tente fazer login.', 'success')
      setShowResetForm(false)
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao redefinir senha.', 'error')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center px-4 py-8">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-block p-4 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-2xl mb-4">
            <span className="text-4xl font-black text-cyan-400">MF</span>
          </div>
          <h1 className="text-4xl font-black text-white">MeuFinanceiro</h1>
          <p className="text-slate-400 mt-2 text-sm">Gerencie suas finanças com IA</p>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="bg-gradient-to-br from-slate-900/80 to-slate-950 border border-cyan-500/20 rounded-2xl p-8 backdrop-blur-xl shadow-2xl space-y-4">
          <h2 className="text-xl font-bold text-white mb-6">Entrar na sua conta</h2>

          {/* E-mail Field */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-slate-800/50 border border-cyan-700/30 text-white rounded-lg px-10 py-3 placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none transition"
                placeholder="seu@email.com"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-slate-500" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800/50 border border-cyan-700/30 text-white rounded-lg px-10 py-3 placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none transition"
                placeholder="••••••••"
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2 mt-6"
          >
            {loading && <Loader size={18} className="animate-spin" />}
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          {/* Reset Password Section */}
          {!showResetForm ? (
            <button
              type="button"
              onClick={() => setShowResetForm(true)}
              className="w-full mt-3 text-slate-400 hover:text-slate-300 text-sm font-medium transition"
            >
              Esqueci minha senha
            </button>
          ) : (
            <div className="mt-4 pt-4 border-t border-cyan-500/20 space-y-3">
              <p className="text-xs text-slate-400 mb-3">Defina uma nova senha</p>

              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-800/50 border border-cyan-700/30 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none transition"
                placeholder="Nova senha (8+ caracteres)"
              />

              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full bg-slate-800/50 border border-cyan-700/30 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:border-cyan-500/60 focus:outline-none transition"
                placeholder="Confirme a senha"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetForm(false)}
                  className="flex-1 bg-slate-700/50 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleLocalReset}
                  disabled={resetting}
                  className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-60 text-white font-medium py-2 rounded-lg text-sm transition"
                >
                  {resetting ? 'Redefinindo...' : 'Redefinir'}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Footer Links */}
        <div className="mt-6 text-center space-y-3">
          <p className="text-slate-400 text-sm">
            Não tem conta?{' '}
            <Link href="/register" className="text-cyan-400 hover:text-cyan-300 font-semibold transition">
              Criar conta
            </Link>
          </p>
          <p className="text-slate-500 text-xs">
            <Link href="/admin/login" className="text-slate-400 hover:text-slate-300 transition">
              Admin?
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
