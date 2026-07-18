'use client'

import { useState } from 'react'
import api from '@/lib/api'
import { useToast } from '@/contexts/ToastContext'
import { Eye, EyeOff, Loader, ShieldCheck, KeyRound } from 'lucide-react'

export default function SettingsPage() {
  const { addToast } = useToast()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'

  function validatePassword(value: string) {
    return value.length >= 8
      && /[A-Z]/.test(value)
      && /[a-z]/.test(value)
      && /\d/.test(value)
      && /[^A-Za-z0-9]/.test(value)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()

    if (!currentPassword || !newPassword || !confirmPassword) {
      addToast('Preencha todos os campos para trocar a senha.', 'warning')
      return
    }

    if (newPassword !== confirmPassword) {
      addToast('A confirmação da nova senha não confere.', 'error')
      return
    }

    if (!validatePassword(newPassword)) {
      addToast('A nova senha deve ter 8+ caracteres, maiúscula, minúscula, número e símbolo.', 'warning')
      return
    }

    setSaving(true)
    try {
      await api.patch('/tenants/me', { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      addToast('Senha atualizada com sucesso!', 'success')
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Não foi possível alterar a senha.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 right-0 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Configuração</h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie os dados de acesso da sua conta.</p>
        </div>

        <section className={`p-6 ${panelClass}`}>
          <div className="flex items-center gap-3 mb-5">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 className="text-white font-semibold">Trocar senha de acesso</h2>
              <p className="text-xs text-slate-400">A troca exige sua senha atual para segurança.</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PasswordField
              label="Senha atual"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggle={() => setShowCurrent((prev) => !prev)}
              placeholder="Digite sua senha atual"
              autoComplete="current-password"
            />

            <PasswordField
              label="Nova senha"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggle={() => setShowNew((prev) => !prev)}
              placeholder="Digite a nova senha"
              autoComplete="new-password"
            />

            <PasswordField
              label="Confirmar nova senha"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showConfirm}
              onToggle={() => setShowConfirm((prev) => !prev)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
            />

            <div className="md:col-span-3 flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
              >
                {saving && <Loader size={16} className="animate-spin" />}
                {saving ? 'Atualizando...' : 'Atualizar senha'}
              </button>
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                <ShieldCheck size={14} />
                Senha forte: 8+ caracteres, maiúscula, minúscula, número e símbolo.
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  show: boolean
  onToggle: () => void
  placeholder: string
  autoComplete: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-slate-300">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-cyan-500/20 bg-slate-950 px-3 py-2 pr-10 text-white"
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
          aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}
