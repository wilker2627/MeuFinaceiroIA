'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { CreditCard, Loader, Plus, CalendarDays } from 'lucide-react'
import { triggerDashboardRefresh } from '@/lib/dashboardRefresh'

interface BillTransaction {
  id: string
  description: string
  amount: number
  date: string
  dueDate?: string
  paymentMethod?: string
  category?: { name: string }
  isPaid?: boolean
  installments?: number | null
  installmentNumber?: number | null
  groupId?: string | null
}

interface BillMonth {
  monthKey: string
  label: string
  total: number
  unpaidTotal: number
  items: BillTransaction[]
}

function monthKeyFromDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function startOfMonthKey(monthKey: string) {
  return `${monthKey}-01T00:00:00.000Z`
}

function cleanDescription(description: string) {
  return String(description || '').replace(/\|\s*Pessoa:\s*(.+)$/i, '').trim()
}

export default function BillsPage() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [entryMode, setEntryMode] = useState<'EXISTING_BILL' | 'INSTALLMENT_PURCHASE'>('EXISTING_BILL')
  const [bills, setBills] = useState<BillMonth[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [paying, setPaying] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [form, setForm] = useState({ description: '', amount: '', bankName: '', dueMonth: '', personName: '', installments: '1' })

  const currentMonthKey = useMemo(() => monthKeyFromDate(new Date()), [])

  async function loadBills() {
    setLoading(true)
    try {
      const now = new Date()
      const monthKeys = Array.from({ length: 12 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() + index, 1)
        return monthKeyFromDate(date)
      })

      const responses = await Promise.all(monthKeys.map(async (monthKey) => {
        const { data } = await api.get(`/dashboard/transactions?month=${monthKey}&monthField=dueDate&type=EXPENSE&paymentMethod=CREDIT_CARD&limit=500&page=1`)
        const items = (data?.transactions || []).filter((tx: BillTransaction) => tx.paymentMethod === 'CREDIT_CARD')
        const unpaidItems = items.filter((tx: BillTransaction) => !tx.isPaid)
        const total = items.reduce((sum: number, tx: BillTransaction) => sum + Number(tx.amount || 0), 0)
        const unpaidTotal = unpaidItems.reduce((sum: number, tx: BillTransaction) => sum + Number(tx.amount || 0), 0)
        return {
          monthKey,
          label: monthLabel(monthKey),
          total,
          unpaidTotal,
          items,
        }
      }))

      const accountsRes = await api.get('/dashboard/accounts')
      setAccounts(accountsRes.data || [])
      setSelectedAccountId((prev) => prev || accountsRes.data?.[0]?.id || '')

      setBills(responses)
      setSelectedMonth((prev) => prev || currentMonthKey)
    } catch (error: any) {
      addToast(error?.response?.data?.error || 'Nao foi possivel carregar as faturas.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBills()
  }, [])

  async function handleAddBill(e: React.FormEvent) {
    e.preventDefault()

    if (!form.description || !form.amount || !form.dueMonth) {
      addToast('Preencha descricao, valor e mes da fatura.', 'error')
      return
    }

    setSaving(true)
    try {
      const dueDate = new Date(startOfMonthKey(form.dueMonth))
      if (entryMode === 'INSTALLMENT_PURCHASE') {
        const installments = Math.min(Math.max(parseInt(form.installments) || 1, 1), 12)
        await api.post('/dashboard/transactions', {
          type: 'EXPENSE',
          amount: Number(form.amount),
          description: form.bankName ? `${form.description} - ${form.bankName}` : form.description,
          paymentMethod: 'CREDIT_CARD',
          dueDate: dueDate.toISOString(),
          isPaid: false,
          installments,
          personName: form.personName.trim() || undefined,
        })
      } else {
        await api.post('/dashboard/transactions', {
          type: 'EXPENSE',
          amount: Number(form.amount),
          description: form.bankName ? `${form.description} - ${form.bankName}` : form.description,
          paymentMethod: 'CREDIT_CARD',
          dueDate: dueDate.toISOString(),
          isPaid: false,
          installments: 1,
          personName: form.personName.trim() || undefined,
        })
      }

      addToast('Fatura incluida com sucesso!', 'success')
      setForm({ description: '', amount: '', bankName: '', dueMonth: '', personName: '', installments: '1' })
      await loadBills()
      triggerDashboardRefresh()
    } catch (error: any) {
      addToast(error?.response?.data?.error || 'Nao foi possivel incluir a fatura.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handlePayBill() {
    if (!selectedBills) return
    if (!selectedBills.unpaidTotal || selectedBills.unpaidTotal <= 0) {
      addToast('Nao ha fatura pendente neste mes.', 'error')
      return
    }

    setPaying(true)
    try {
      const { data } = await api.post('/dashboard/bills/pay', {
        month: selectedBills.monthKey,
        accountId: selectedAccountId || undefined,
      })

      addToast(`${data?.message || 'Fatura paga com sucesso.'} Total: ${formatCurrency(Number(data?.total || selectedBills.unpaidTotal))}`, 'success')
      await loadBills()
      triggerDashboardRefresh()
    } catch (error: any) {
      addToast(error?.response?.data?.error || 'Nao foi possivel pagar a fatura.', 'error')
    } finally {
      setPaying(false)
    }
  }

  async function handlePayBillItem(item: BillTransaction) {
    if (item.isPaid) {
      addToast('Esse item da fatura ja esta pago.', 'error')
      return
    }

    setPaying(true)
    try {
      const { data } = await api.post('/dashboard/bills/pay-item', {
        transactionId: item.id,
        accountId: selectedAccountId || undefined,
      })

      addToast(`${data?.message || 'Item da fatura pago com sucesso.'} Total: ${formatCurrency(Number(data?.total || item.amount || 0))}`, 'success')
      await loadBills()
      triggerDashboardRefresh()
    } catch (error: any) {
      addToast(error?.response?.data?.error || 'Nao foi possivel pagar este item.', 'error')
    } finally {
      setPaying(false)
    }
  }

  async function handleUnpayBillItem(item: BillTransaction) {
    if (!item.isPaid) {
      addToast('Esse item da fatura ja esta pendente.', 'error')
      return
    }

    setPaying(true)
    try {
      await api.patch(`/dashboard/transactions/${item.id}`, {
        isPaid: false,
      })

      addToast(`Item da fatura marcado como pendente com sucesso. Total: ${formatCurrency(Number(item.amount || 0))}`, 'success')
      await loadBills()
      triggerDashboardRefresh()
    } catch (error: any) {
      addToast(error?.response?.data?.error || 'Nao foi possivel marcar este item como pendente.', 'error')
    } finally {
      setPaying(false)
    }
  }

  async function handleDeleteBillItem(item: BillTransaction) {
    const confirmed = window.confirm('Tem certeza que deseja excluir este item da fatura?')
    if (!confirmed) return

    try {
      await api.delete(`/dashboard/transactions/${item.id}`)
      addToast('Item da fatura removido com sucesso.', 'success')
      await loadBills()
      triggerDashboardRefresh()
    } catch (error: any) {
      addToast(error?.response?.data?.error || 'Nao foi possivel excluir este item.', 'error')
    }
  }

  const selectedBills = bills.find((bill) => bill.monthKey === selectedMonth) || bills[0]

  return (
    <div className="relative p-4 md:p-6 space-y-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 -right-24 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Faturas</h1>
          <p className="text-slate-400 text-sm mt-1">Veja as faturas dos proximos 12 meses e inclua as existentes do cartao.</p>
        </div>
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-violet-200/80">Próxima fatura</p>
          <p className="text-sm font-semibold text-violet-100">{selectedBills?.label || 'Carregando...'}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <form onSubmit={handleAddBill} className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-5 shadow-[0_16px_42px_rgba(2,8,23,0.45)] backdrop-blur-xl space-y-3">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-violet-300" />
            <p className="text-sm font-semibold text-white">Incluir fatura existente</p>
          </div>
          <p className="text-xs text-slate-400">Informe a fatura e o app mostra o mês correto para pagar depois.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Descrição da fatura</label>
              <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Ex: Mercado, roupa, viagem" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Banco / Cartão</label>
              <input value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Ex: Nubank, Inter, Itaú" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Valor</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="0,00" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Mês da fatura</label>
              <input type="month" value={form.dueMonth} onChange={(e) => setForm((p) => ({ ...p, dueMonth: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500 block mb-1">Pessoa</label>
              <input value={form.personName} onChange={(e) => setForm((p) => ({ ...p, personName: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Ex: Maria" />
            </div>
          </div>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">
            {saving && <Loader size={15} className="animate-spin" />}
            Incluir fatura
          </button>
        </form>

        <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-5 shadow-[0_16px_42px_rgba(2,8,23,0.45)] backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-violet-300" />
            <p className="text-sm font-semibold text-white">Resumo das faturas dos próximos 12 meses</p>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {bills.map((bill) => (
              <button
                key={bill.monthKey}
                type="button"
                onClick={() => setSelectedMonth(bill.monthKey)}
                className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${selectedMonth === bill.monthKey ? 'border-violet-400 bg-violet-400/20 text-violet-100' : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white'}`}
              >
                {bill.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-slate-400">Carregando faturas...</p>
          ) : selectedBills ? (
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-violet-200/80">Total da fatura</p>
                  <p className="text-3xl font-black text-violet-100">{formatCurrency(selectedBills.total)}</p>
                  <p className="text-xs text-slate-400 mt-1">{selectedBills.items.length} lançamento(s) no mês selecionado</p>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Pendente para pagar</p>
                  <p className="text-3xl font-black text-amber-100">{formatCurrency(selectedBills.unpaidTotal)}</p>
                  <p className="text-xs text-slate-400 mt-1">Somente itens ainda não pagos</p>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <label className="text-xs text-slate-500 block mb-1">Conta de onde sai o pagamento</label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    >
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handlePayBill}
                    disabled={paying || !selectedBills.unpaidTotal}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60"
                  >
                    {paying && <Loader size={15} className="animate-spin" />}
                    Pagar fatura
                  </button>
                </div>
                <p className="text-xs text-slate-400">Tudo fica pendente por padrão. Use este botão apenas se quiser pagar/antecipar os itens deste mês de fatura.</p>
              </div>

              <div className="space-y-2">
                {selectedBills.items.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-white font-medium">{cleanDescription(item.description)}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {item.category?.name || 'Sem categoria'} • {formatDate(item.dueDate || item.date)}
                          {item.installments && item.installments > 1 ? ` • ${item.installmentNumber || 1}/${item.installments}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${item.isPaid ? 'text-emerald-300' : 'text-violet-200'}`}>{formatCurrency(Number(item.amount || 0))}</p>
                        <p className={`text-[11px] ${item.isPaid ? 'text-emerald-200/70' : 'text-slate-500'}`}>{item.isPaid ? 'Pago' : 'Pendente'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const value = window.prompt('Editar valor da fatura', String(Number(item.amount || 0).toFixed(2)).replace('.', ','))
                          if (value === null) return
                          const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
                          const nextAmount = Number(normalized)
                          if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
                            addToast('Informe um valor valido.', 'error')
                            return
                          }
                          await api.patch(`/dashboard/transactions/${item.id}`, { amount: nextAmount })
                          addToast('Valor da fatura atualizado com sucesso.', 'success')
                          await loadBills()
                          triggerDashboardRefresh()
                        }}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
                      >
                        Editar valor
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBillItem(item)}
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
                      >
                        Excluir
                      </button>
                      {item.isPaid ? (
                        <button
                          type="button"
                          onClick={() => handleUnpayBillItem(item)}
                          disabled={paying}
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-60"
                        >
                          Marcar pendente
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handlePayBillItem(item)}
                          disabled={paying}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60"
                        >
                          Pagar / Antecipar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {selectedBills.items.length === 0 && <p className="text-sm text-slate-500">Nenhuma fatura encontrada neste mês.</p>}
              </div>
            </>
          ) : (
            <p className="text-slate-500">Nenhum dado de fatura disponível.</p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-5 shadow-[0_16px_42px_rgba(2,8,23,0.35)] backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <CreditCard size={16} className="text-violet-300" />
          <p className="text-sm font-semibold text-white">Como cadastrar</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 text-sm text-slate-300">
          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
            <p className="font-semibold text-white mb-2">Fatura já existente</p>
            <p>Selecione “Fatura já existente”, informe o nome do banco/cartão, o mês da fatura e o valor total que já caiu na sua fatura.</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
            <p className="font-semibold text-white mb-2">Compra parcelada</p>
            <p>Selecione “Compra parcelada”, informe o total, o nome do banco/cartão e a quantidade de parcelas. O app mostra a parcela em cada mês.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {bills.map((bill) => (
          <div key={bill.monthKey} className="rounded-3xl border border-violet-500/20 bg-violet-500/10 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.35)]">
            <p className="text-xs uppercase tracking-[0.22em] text-violet-200/80">{bill.label}</p>
            <p className="mt-1 text-2xl font-black text-white">{formatCurrency(bill.total)}</p>
            <p className="mt-1 text-xs text-slate-400">{bill.items.length} lançamento(s)</p>
          </div>
        ))}
      </div>
    </div>
  )
}
