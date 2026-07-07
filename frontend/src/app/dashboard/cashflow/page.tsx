'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import AnimatedCurrency from '@/components/AnimatedCurrency'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export default function CashFlowPage() {
  const [evolution, setEvolution] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [teamReport, setTeamReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'

  useEffect(() => {
    async function load() {
      const [e, c, t] = await Promise.all([
        api.get('/dashboard/evolution?months=12'),
        api.get('/dashboard/categories'),
        api.get('/users/team-report'),
      ])
      setEvolution(e.data)
      setCategories(c.data)
      setTeamReport(t.data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-full"><p className="text-gray-400">Carregando...</p></div>

  return (
    <div className="relative p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-10 -right-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
      <h1 className="text-2xl md:text-3xl font-black text-white">Fluxo de Caixa</h1>

      {/* Evolução 12 meses */}
      <div className={`p-6 ${panelClass}`}>
        <h2 className="text-lg font-semibold text-white mb-4">📊 Entradas vs Saídas (12 meses)</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={evolution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#164e63" />
            <XAxis dataKey="month" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #155e75', borderRadius: '8px' }} formatter={(v: any) => formatCurrency(v)} />
            <Legend wrapperStyle={{ color: '#9ca3af' }} />
            <Bar dataKey="income" name="Entradas" fill="#22c55e" radius={[4,4,0,0]} />
            <Bar dataKey="expenses" name="Saídas" fill="#ef4444" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Lucro mensal */}
      <div className={`p-6 ${panelClass}`}>
        <h2 className="text-lg font-semibold text-white mb-4">📈 Lucro Mensal</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={evolution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#164e63" />
            <XAxis dataKey="month" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
            <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #155e75', borderRadius: '8px' }} formatter={(v: any) => formatCurrency(v)} />
            <Bar dataKey="profit" name="Lucro" fill="#3b82f6" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Relatório por pessoa */}
      {teamReport && teamReport.members.length > 0 && (
        <div className={`p-6 ${panelClass}`}>
          <h2 className="text-lg font-semibold text-white mb-4">👥 Lançamentos por Pessoa — Mês Atual</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-400">
                <tr>
                  <th className="text-left py-2">Pessoa</th>
                  <th className="text-right py-2">Entradas</th>
                  <th className="text-right py-2">Saídas</th>
                  <th className="text-right py-2">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {teamReport.members.map((m: any) => (
                  <tr key={m.userId} className="border-t border-cyan-500/15">
                    <td className="py-3 text-white font-medium">{m.name}</td>
                    <td className="py-3 text-right text-green-400">{formatCurrency(m.totalIncome)}</td>
                    <td className="py-3 text-right text-red-400">{formatCurrency(m.totalExpense)}</td>
                    <td className={`py-3 text-right font-bold ${(m.totalIncome - m.totalExpense) >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {formatCurrency(m.totalIncome - m.totalExpense)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-cyan-500/25 font-bold">
                  <td className="py-3 text-gray-400">TOTAL</td>
                  <td className="py-3 text-right text-green-400"><AnimatedCurrency value={teamReport.totalIncome} /></td>
                  <td className="py-3 text-right text-red-400"><AnimatedCurrency value={teamReport.totalExpense} /></td>
                  <td className={`py-3 text-right ${(teamReport.totalIncome - teamReport.totalExpense) >= 0 ? 'text-white' : 'text-red-400'}`}>
                    <AnimatedCurrency value={teamReport.totalIncome - teamReport.totalExpense} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top categorias */}
      <div className={`p-6 ${panelClass}`}>
        <h2 className="text-lg font-semibold text-white mb-4">📉 Top Categorias de Despesas</h2>
        <div className="space-y-3">
          {categories.slice(0, 8).map((cat: any, i: number) => {
            const max = categories[0]?.total || 1
            const pct = (cat.total / max) * 100
            return (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">{cat.name}</span>
                  <span className="text-white font-medium">{formatCurrency(cat.total)}</span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-500 to-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
          {categories.length === 0 && <p className="text-gray-500 text-center py-6">Nenhuma despesa registrada este mês.</p>}
        </div>
      </div>
      </div>
    </div>
  )
}

