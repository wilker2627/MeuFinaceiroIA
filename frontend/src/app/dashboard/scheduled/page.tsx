'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import AnimatedCurrency from '@/components/AnimatedCurrency'
import { Plus, Check } from 'lucide-react'

export default function ScheduledPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ description: '', amount: '', dueDate: '', type: 'EXPENSE', isRecurring: false })
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'

  async function load() {
    setLoading(true)
    const { data } = await api.get('/dashboard/scheduled?status=PENDING')
    setPayments(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    await api.post('/dashboard/scheduled', form)
    setShowForm(false)
    setForm({ description: '', amount: '', dueDate: '', type: 'EXPENSE', isRecurring: false })
    load()
  }

  async function handlePay(id: string) {
    await api.patch(`/dashboard/scheduled/${id}/pay`)
    load()
  }

  const payable = payments.filter(p => p.type === 'EXPENSE')
  const receivable = payments.filter(p => p.type === 'INCOME')

  return (
    <div className="relative p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-4 -left-16 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Agendamentos</h1>
          <p className="text-slate-400 text-sm mt-1">Contas a pagar e a receber</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-4 py-2 rounded-lg">
          <Plus size={18} /> Agendar
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className={`p-6 grid grid-cols-2 md:grid-cols-4 gap-4 ${panelClass}`}>
          <div className="col-span-2">
            <label className="text-gray-400 text-sm block mb-1">Descrição</label>
            <input required value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2" placeholder="Ex: Energia elétrica" />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Valor</label>
            <input required type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Vencimento</label>
            <input required type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Tipo</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
              <option value="EXPENSE">A Pagar</option>
              <option value="INCOME">A Receber</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-4 py-2 rounded-lg">Salvar</button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          </div>
        </form>
      )}

      <div className="stagger-grid grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A PAGAR */}
        <div className={`${panelClass} overflow-hidden`}>
          <div className="flex items-center justify-between px-6 py-4 bg-rose-500/10 border-b border-cyan-500/15">
            <h2 className="font-semibold text-white">Contas a Pagar</h2>
            <AnimatedCurrency value={payable.reduce((s, p) => s + p.amount, 0)} className="text-red-400 font-bold" />
          </div>
          {payable.length === 0 ? (
            <p className="text-center text-gray-500 py-10">Nenhuma conta a pagar</p>
          ) : payable.map(p => (
            <div key={p.id} className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/15 last:border-0">
              <div>
                <div className="text-white text-sm">{p.description}</div>
                <div className="text-gray-500 text-xs mt-0.5">Vence: {formatDate(p.dueDate)}{p.user ? ` · ${p.user.name}` : ''}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-red-400 font-semibold">{formatCurrency(p.amount)}</span>
                <button onClick={() => handlePay(p.id)} className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 p-1.5 rounded-lg transition-colors">
                  <Check size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* A RECEBER */}
        <div className={`${panelClass} overflow-hidden`}>
          <div className="flex items-center justify-between px-6 py-4 bg-emerald-500/10 border-b border-cyan-500/15">
            <h2 className="font-semibold text-white">Contas a Receber</h2>
            <AnimatedCurrency value={receivable.reduce((s, p) => s + p.amount, 0)} className="text-green-400 font-bold" />
          </div>
          {receivable.length === 0 ? (
            <p className="text-center text-gray-500 py-10">Nenhum valor a receber</p>
          ) : receivable.map(p => (
            <div key={p.id} className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/15 last:border-0">
              <div>
                <div className="text-white text-sm">{p.description}</div>
                <div className="text-gray-500 text-xs mt-0.5">Previsto: {formatDate(p.dueDate)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-green-400 font-semibold">{formatCurrency(p.amount)}</span>
                <button onClick={() => handlePay(p.id)} className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 p-1.5 rounded-lg transition-colors">
                  <Check size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}

