'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Plus, Trash2, Crown, Briefcase, User, Eye } from 'lucide-react'

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  ADMIN:     { label: 'Administrador', icon: Crown, color: 'text-yellow-400' },
  FINANCIAL: { label: 'Financeiro', icon: Briefcase, color: 'text-blue-400' },
  EMPLOYEE:  { label: 'Funcionário', icon: User, color: 'text-green-400' },
  VIEWER:    { label: 'Consulta', icon: Eye, color: 'text-gray-400' },
}

export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ phoneNumber: '', nickname: '', role: 'EMPLOYEE' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'

  async function load() {
    setLoading(true)
    const { data } = await api.get('/users/members')
    setMembers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/users/members', form)
      setShowForm(false)
      setForm({ phoneNumber: '', nickname: '', role: 'EMPLOYEE' })
      load()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao adicionar membro.')
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm('Remover este membro?')) return
    await api.delete(`/users/members/${userId}`)
    load()
  }

  async function handleRoleChange(userId: string, role: string) {
    await api.patch(`/users/members/${userId}`, { role })
    load()
  }

  return (
    <div className="relative p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 right-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Equipe</h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie quem acessa esta conta pelo WhatsApp</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-4 py-2 rounded-lg">
          <Plus size={18} /> Adicionar Membro
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className={`p-6 ${panelClass}`}>
          <h3 className="text-white font-semibold mb-4">Adicionar por número WhatsApp</h3>
          {error && <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg p-3 mb-4 text-sm">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Número WhatsApp</label>
              <input required value={form.phoneNumber} onChange={e => setForm(p => ({ ...p, phoneNumber: e.target.value }))}
                className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2"
                placeholder="5511999999999" />
              <p className="text-gray-500 text-xs mt-1">Com código do país (55 para Brasil)</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Apelido (como aparece nos relatórios)</label>
              <input value={form.nickname} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
                className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2"
                placeholder="Ex: Wilker, Gabriella" />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Permissão</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
                {Object.entries(ROLE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-4 py-2 rounded-lg">Adicionar</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-800 text-white px-4 py-2 rounded-lg">Cancelar</button>
          </div>
        </form>
      )}

      {/* Tabela de membros */}
      <div className={`${panelClass} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-950/80 text-slate-400">
            <tr>
              <th className="text-left px-6 py-3">Membro</th>
              <th className="text-left px-4 py-3">WhatsApp</th>
              <th className="text-left px-4 py-3">Permissão</th>
              <th className="text-left px-4 py-3">Desde</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-slate-500 py-12">Carregando...</td></tr>
            ) : members.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-slate-500 py-12">Nenhum membro adicionado ainda</td></tr>
            ) : members.map(m => {
              const roleConfig = ROLE_CONFIG[m.role] || ROLE_CONFIG.EMPLOYEE
              const Icon = roleConfig.icon
              return (
                <tr key={m.id} className="border-t border-cyan-500/15 hover:bg-cyan-500/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-white font-medium">{m.nickname || m.user.name}</div>
                    {m.nickname && <div className="text-gray-500 text-xs">{m.user.name}</div>}
                  </td>
                  <td className="px-4 py-4 text-gray-400 font-mono text-xs">+{m.user.phoneNumber}</td>
                  <td className="px-4 py-4">
                    <select value={m.role} onChange={e => handleRoleChange(m.userId, e.target.value)}
                      className="bg-slate-950 border border-cyan-500/20 text-sm rounded-lg px-2 py-1">
                      {Object.entries(ROLE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-4 text-gray-500 text-xs">
                    {new Date(m.joinedAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-4">
                    <button onClick={() => handleRemove(m.userId)} className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legenda de permissões */}
      <div className={`p-6 ${panelClass}`}>
        <h3 className="text-white font-semibold mb-4">Níveis de Permissão</h3>
        <div className="stagger-grid grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(ROLE_CONFIG).map(([k, v]) => {
            const Icon = v.icon
            const perms: Record<string, string[]> = {
              ADMIN: ['Ver tudo', 'Lançar', 'Excluir', 'Gerenciar equipe'],
              FINANCIAL: ['Ver relatórios', 'Lançar despesas/receitas', 'Agendar pagamentos'],
              EMPLOYEE: ['Registrar gastos', 'Enviar comprovantes'],
              VIEWER: ['Ver relatórios apenas'],
            }
            return (
              <div key={k} className="bg-slate-950 rounded-xl p-4 border border-cyan-500/10">
                <div className={`flex items-center gap-2 mb-2 ${v.color}`}>
                  <Icon size={16} />
                  <span className="font-semibold text-sm">{v.label}</span>
                </div>
                <ul className="text-gray-400 text-xs space-y-1">
                  {perms[k].map(p => <li key={p}>• {p}</li>)}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
      </div>
    </div>
  )
}
