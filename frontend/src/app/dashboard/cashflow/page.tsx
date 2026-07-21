'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import AnimatedCurrency from '@/components/AnimatedCurrency'
import { BarChart3, ChartColumnIncreasing, PieChart, Users } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useAuth } from '@/contexts/AuthContext'
import { jsPDF } from 'jspdf'

type BusinessMonthReport = {
  monthKey: string
  label: string
  paidCount: number
  paidTotal: number
  pendingCount: number
  pendingTotal: number
  overdueCount: number
  overdueTotal: number
}

export default function CashFlowPage() {
  const { tenant } = useAuth()
  const isBusinessPlan = String(tenant?.plan || '').toUpperCase() === 'EMPRESA'
  const [evolution, setEvolution] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [teamReport, setTeamReport] = useState<any>(null)
  const [businessMonths, setBusinessMonths] = useState<BusinessMonthReport[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'

  function exportBusinessPdf() {
    if (businessMonths.length === 0) return

    setExportingPdf(true)
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      let y = 42
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.text('Relatorio Contas Pagas - Empresa', 40, y)

      y += 22
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 40, y)

      y += 20
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Mes', 40, y)
      doc.text('Pagos', 160, y)
      doc.text('Total pago', 220, y)
      doc.text('A pagar', 340, y)
      doc.text('Vencidos', 430, y)
      doc.line(40, y + 6, 560, y + 6)

      const rows = businessMonths.slice().reverse()
      doc.setFont('helvetica', 'normal')
      rows.forEach((month) => {
        y += 18
        if (y > 790) {
          doc.addPage()
          y = 42
          doc.setFont('helvetica', 'bold')
          doc.text('Mes', 40, y)
          doc.text('Pagos', 160, y)
          doc.text('Total pago', 220, y)
          doc.text('A pagar', 340, y)
          doc.text('Vencidos', 430, y)
          doc.line(40, y + 6, 560, y + 6)
          doc.setFont('helvetica', 'normal')
          y += 18
        }

        doc.text(month.label, 40, y)
        doc.text(String(month.paidCount), 160, y)
        doc.text(formatCurrency(month.paidTotal), 220, y)
        doc.text(String(month.pendingCount), 340, y)
        doc.text(String(month.overdueCount), 430, y)
      })

      doc.save(`relatorio-contas-pagas-${new Date().toISOString().slice(0, 10)}.pdf`)
    } finally {
      setExportingPdf(false)
    }
  }

  function monthKeyFromOffset(offset: number) {
    const date = new Date()
    date.setMonth(date.getMonth() - offset)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  function monthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
  }

  useEffect(() => {
    async function load() {
      if (isBusinessPlan) {
        const monthKeys = Array.from({ length: 12 }, (_, index) => monthKeyFromOffset(index)).reverse()
        const reports = await Promise.all(monthKeys.map(async (monthKey) => {
          const [paidRes, pendingRes, overdueRes] = await Promise.all([
            api.get(`/dashboard/transactions?month=${monthKey}&monthField=dueDate&type=EXPENSE&status=PAID&limit=500&page=1`),
            api.get(`/dashboard/transactions?month=${monthKey}&monthField=dueDate&type=EXPENSE&status=PENDING&limit=500&page=1`),
            api.get(`/dashboard/transactions?month=${monthKey}&monthField=dueDate&type=EXPENSE&status=OVERDUE&limit=500&page=1`),
          ])

          const paid = paidRes.data?.transactions || []
          const pending = pendingRes.data?.transactions || []
          const overdue = overdueRes.data?.transactions || []

          return {
            monthKey,
            label: monthLabel(monthKey),
            paidCount: paid.length,
            paidTotal: paid.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0),
            pendingCount: pending.length,
            pendingTotal: pending.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0),
            overdueCount: overdue.length,
            overdueTotal: overdue.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0),
          }
        }))

        setBusinessMonths(reports)
        setLoading(false)
        return
      }

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
  }, [isBusinessPlan])

  if (loading) return <div className="flex items-center justify-center h-full"><p className="text-gray-400">Carregando...</p></div>

  if (isBusinessPlan) {
    const current = businessMonths[businessMonths.length - 1] || {
      monthKey: new Date().toISOString().slice(0, 7),
      label: new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
      paidCount: 0,
      paidTotal: 0,
      pendingCount: 0,
      pendingTotal: 0,
      overdueCount: 0,
      overdueTotal: 0,
    }

    return (
      <div className="relative p-4 md:p-6">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-10 -right-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative space-y-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">Contas Pagas</h1>
            <p className="text-slate-400 text-sm mt-1">Acompanhe pagamentos e histórico mensal de contas da empresa.</p>
            <div className="mt-3">
              <button
                type="button"
                onClick={exportBusinessPdf}
                disabled={exportingPdf || businessMonths.length === 0}
                className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {exportingPdf ? 'Exportando PDF...' : 'Exportar relatorio PDF'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="Pagos no mês" value={String(current.paidCount)} note={formatCurrency(current.paidTotal)} tone="green" />
            <SummaryCard label="A pagar" value={String(current.pendingCount)} note={formatCurrency(current.pendingTotal)} tone="amber" />
            <SummaryCard label="Vencidos" value={String(current.overdueCount)} note={formatCurrency(current.overdueTotal)} tone="red" />
            <SummaryCard label="Meses analisados" value={String(businessMonths.length)} note="Últimos 12 meses" tone="cyan" />
          </div>

          <div className={`p-6 ${panelClass}`}>
            <h2 className="mb-4 text-lg font-semibold text-white">Histórico mensal</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-400">
                  <tr>
                    <th className="text-left py-2">Mês</th>
                    <th className="text-right py-2">Pagos</th>
                    <th className="text-right py-2">Total pago</th>
                    <th className="text-right py-2">A pagar</th>
                    <th className="text-right py-2">Vencidos</th>
                  </tr>
                </thead>
                <tbody>
                  {businessMonths.slice().reverse().map((month) => (
                    <tr key={month.monthKey} className="border-t border-cyan-500/15">
                      <td className="py-3 text-white font-medium">{month.label}</td>
                      <td className="py-3 text-right text-emerald-300">{month.paidCount}</td>
                      <td className="py-3 text-right text-emerald-300">{formatCurrency(month.paidTotal)}</td>
                      <td className="py-3 text-right text-amber-300">{month.pendingCount}</td>
                      <td className="py-3 text-right text-rose-300">{month.overdueCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`p-6 ${panelClass}`}>
            <h2 className="mb-4 text-lg font-semibold text-white">Ação rápida</h2>
            <p className="text-slate-300 text-sm">Use Contas a Pagar para copiar código de barras ou Pix e, depois de pagar no banco, marque como pago.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-10 -right-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
      <h1 className="text-2xl md:text-3xl font-black text-white">Fluxo de Caixa</h1>

      {/* Evolução 12 meses */}
      <div className={`p-6 ${panelClass}`}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <BarChart3 size={18} className="text-cyan-300" />
          Entradas vs Saídas (12 meses)
        </h2>
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
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <ChartColumnIncreasing size={18} className="text-cyan-300" />
          Lucro Mensal
        </h2>
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
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <Users size={18} className="text-cyan-300" />
            Lançamentos por Pessoa - Mês Atual
          </h2>
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
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
          <PieChart size={18} className="text-cyan-300" />
          Top Categorias de Despesas
        </h2>
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

function SummaryCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'green' | 'amber' | 'red' | 'cyan' }) {
  const toneClass = {
    green: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
    red: 'border-rose-500/25 bg-rose-500/10 text-rose-200',
    cyan: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
  }

  return (
    <div className={`rounded-2xl border p-4 ${toneClass[tone]}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-white/60">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm text-white/70">{note}</p>
    </div>
  )
}

