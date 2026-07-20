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
  cardBrand?: string
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

const CREDIT_CARD_BRANDS = [
  'PAO DE ACUCAR',
  'AZUL',
  'SICREDI',
  'MERCADO PAGO',
  'BANCO DO BRASIL',
  'BRADESCO',
  'NUBANK',
  'ITAU',
  'BV',
  'DIGIO',
  'SANTANDER',
] as const

const CUSTOM_CARD_VALUE = '__CUSTOM__'

const CARD_TAG_REGEX = /\|\s*Cartao:\s*([^|]+)/i
const PERSON_TAG_REGEX = /\|\s*Pessoa:\s*(.+)$/i

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
  return String(description || '')
    .replace(CARD_TAG_REGEX, '')
    .replace(PERSON_TAG_REGEX, '')
    .trim()
}

function extractCardBrandFromDescription(description: string) {
  const match = String(description || '').match(CARD_TAG_REGEX)
  return match?.[1]?.trim() || 'Sem cartao'
}

function extractPersonFromDescription(description: string) {
  const match = String(description || '').match(PERSON_TAG_REGEX)
  return match?.[1]?.trim() || ''
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
  const [editingBillItem, setEditingBillItem] = useState<BillTransaction | null>(null)
  const [editBillForm, setEditBillForm] = useState<{ amount: string; cardBrand: string; customCardBrand: string; dueMonth: string }>({
    amount: '',
    cardBrand: CREDIT_CARD_BRANDS[0],
    customCardBrand: '',
    dueMonth: ''
  })
  const [form, setForm] = useState<{ description: string; amount: string; cardBrand: string; customCardBrand: string; dueMonth: string; personName: string; installments: string }>({
    description: '',
    amount: '',
    cardBrand: CREDIT_CARD_BRANDS[0],
    customCardBrand: '',
    dueMonth: '',
    personName: '',
    installments: '1'
  })

  const currentMonthKey = useMemo(() => monthKeyFromDate(new Date()), [])
  const selectedCardBrand = form.cardBrand === CUSTOM_CARD_VALUE
    ? form.customCardBrand.trim().toUpperCase()
    : form.cardBrand
  const editSelectedCardBrand = editBillForm.cardBrand === CUSTOM_CARD_VALUE
    ? editBillForm.customCardBrand.trim().toUpperCase()
    : editBillForm.cardBrand

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
        const items = (data?.transactions || [])
          .filter((tx: BillTransaction) => tx.paymentMethod === 'CREDIT_CARD')
          .map((tx: BillTransaction) => ({
            ...tx,
            cardBrand: extractCardBrandFromDescription(tx.description)
          }))
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

    if (!selectedCardBrand) {
      addToast('Informe o nome do banco/cartao.', 'error')
      return
    }

    setSaving(true)
    try {
      const dueDate = new Date(startOfMonthKey(form.dueMonth))
      const personTag = form.personName.trim() ? ` | Pessoa: ${form.personName.trim()}` : ''
      const descriptionWithCard = `${form.description} | Cartao: ${selectedCardBrand}${personTag}`
      if (entryMode === 'INSTALLMENT_PURCHASE') {
        const installments = Math.min(Math.max(parseInt(form.installments) || 1, 1), 12)
        await api.post('/dashboard/transactions', {
          type: 'EXPENSE',
          amount: Number(form.amount),
          description: descriptionWithCard,
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
          description: descriptionWithCard,
          paymentMethod: 'CREDIT_CARD',
          dueDate: dueDate.toISOString(),
          isPaid: false,
          installments: 1,
          personName: form.personName.trim() || undefined,
        })
      }

      addToast('Fatura incluida com sucesso!', 'success')
      setForm({ description: '', amount: '', cardBrand: CREDIT_CARD_BRANDS[0], customCardBrand: '', dueMonth: '', personName: '', installments: '1' })
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

  function openEditBillItem(item: BillTransaction) {
    const currentCardBrand = item.cardBrand || extractCardBrandFromDescription(item.description)
    const isKnownBrand = CREDIT_CARD_BRANDS.includes(currentCardBrand as typeof CREDIT_CARD_BRANDS[number])
    const currentDueDate = new Date(item.dueDate || item.date)
    const dueMonth = monthKeyFromDate(currentDueDate)

    setEditingBillItem(item)
    setEditBillForm({
      amount: String(Number(item.amount || 0).toFixed(2)),
      cardBrand: isKnownBrand ? currentCardBrand : CUSTOM_CARD_VALUE,
      customCardBrand: isKnownBrand ? '' : currentCardBrand,
      dueMonth,
    })
  }

  async function handleSaveEditBillItem(e: React.FormEvent) {
    e.preventDefault()

    if (!editingBillItem) return

    const nextAmount = Number(String(editBillForm.amount || '').replace(',', '.'))
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      addToast('Informe um valor valido.', 'error')
      return
    }

    if (!editSelectedCardBrand) {
      addToast('Informe o nome do banco/cartao.', 'error')
      return
    }

    try {
      const currentPerson = extractPersonFromDescription(editingBillItem.description)
      const baseDescription = cleanDescription(editingBillItem.description)
      const personTag = currentPerson ? ` | Pessoa: ${currentPerson}` : ''
      const nextDescription = `${baseDescription} | Cartao: ${editSelectedCardBrand}${personTag}`
      const nextDueDate = editBillForm.dueMonth ? new Date(startOfMonthKey(editBillForm.dueMonth)) : undefined

      await api.patch(`/dashboard/transactions/${editingBillItem.id}`, {
        amount: nextAmount,
        description: nextDescription,
        dueDate: nextDueDate ? nextDueDate.toISOString() : undefined,
      })

      addToast('Fatura atualizada com sucesso.', 'success')
      setEditingBillItem(null)
      setEditBillForm({ amount: '', cardBrand: CREDIT_CARD_BRANDS[0], customCardBrand: '', dueMonth: '' })
      await loadBills()
      triggerDashboardRefresh()
    } catch (error: any) {
      addToast(error?.response?.data?.error || 'Nao foi possivel atualizar a fatura.', 'error')
    }
  }

  const selectedBills = bills.find((bill) => bill.monthKey === selectedMonth) || bills[0]
  const selectedCardsSummary = useMemo(() => {
    if (!selectedBills) return []
    const grouped = new Map<string, { card: string; total: number; unpaid: number; count: number }>()

    selectedBills.items.forEach((item) => {
      const key = item.cardBrand || 'Sem cartao'
      const current = grouped.get(key) || { card: key, total: 0, unpaid: 0, count: 0 }
      current.total += Number(item.amount || 0)
      current.count += 1
      if (!item.isPaid) current.unpaid += Number(item.amount || 0)
      grouped.set(key, current)
    })

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total)
  }, [selectedBills])

  return (
    <div className="relative p-4 md:p-6 space-y-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 -right-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Faturas</h1>
          <p className="text-slate-400 text-sm mt-1">Veja as faturas dos proximos 12 meses e inclua as existentes do cartao.</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-right">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/80">Próxima fatura</p>
          <p className="text-sm font-semibold text-cyan-100">{selectedBills?.label || 'Carregando...'}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <form onSubmit={handleAddBill} className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-5 shadow-[0_16px_42px_rgba(2,8,23,0.45)] backdrop-blur-xl space-y-3">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-cyan-300" />
            <p className="text-sm font-semibold text-white">Incluir fatura existente</p>
          </div>
          <p className="text-xs text-slate-400">Informe a fatura e o app mostra o mês correto para pagar depois.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Descrição da fatura</label>
              <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Ex: Mercado, roupa, viagem" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Cartão</label>
              <select value={form.cardBrand} onChange={(e) => setForm((p) => ({ ...p, cardBrand: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                {CREDIT_CARD_BRANDS.map((card) => (
                  <option key={card} value={card}>{card}</option>
                ))}
                <option value={CUSTOM_CARD_VALUE}>Outro (cadastrar banco/cartão)</option>
              </select>
            </div>
            {form.cardBrand === CUSTOM_CARD_VALUE && (
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500 block mb-1">Nome do banco/cartão</label>
                <input
                  value={form.customCardBrand}
                  onChange={(e) => setForm((p) => ({ ...p, customCardBrand: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  placeholder="Ex: XP, C6, Inter..."
                />
              </div>
            )}
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
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:opacity-60">
            {saving && <Loader size={15} className="animate-spin" />}
            Incluir fatura
          </button>
        </form>

        <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-5 shadow-[0_16px_42px_rgba(2,8,23,0.45)] backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-cyan-300" />
            <p className="text-sm font-semibold text-white">Resumo das faturas dos próximos 12 meses</p>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {bills.map((bill) => (
              <button
                key={bill.monthKey}
                type="button"
                onClick={() => setSelectedMonth(bill.monthKey)}
                className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${selectedMonth === bill.monthKey ? 'border-cyan-400 bg-cyan-400/20 text-cyan-100' : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white'}`}
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
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Total da fatura</p>
                  <p className="text-3xl font-black text-cyan-100">{formatCurrency(selectedBills.total)}</p>
                  <p className="text-xs text-slate-400 mt-1">{selectedBills.items.length} lançamento(s) no mês selecionado</p>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">Pendente para pagar</p>
                  <p className="text-3xl font-black text-amber-100">{formatCurrency(selectedBills.unpaidTotal)}</p>
                  <p className="text-xs text-slate-400 mt-1">Somente itens ainda não pagos</p>
                </div>
              </div>

              {selectedCardsSummary.length > 0 && (
                <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80 mb-3">Resumo por cartão</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedCardsSummary.map((card) => (
                      <div key={card.card} className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                        <p className="text-sm font-semibold text-white">{card.card}</p>
                        <p className="text-xs text-slate-400 mt-1">{card.count} lançamento(s)</p>
                        <p className="text-sm text-cyan-100 mt-1">Total: {formatCurrency(card.total)}</p>
                        <p className="text-xs text-amber-200 mt-1">Pendente: {formatCurrency(card.unpaid)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                          {item.category?.name || 'Sem categoria'} • {item.cardBrand || 'Sem cartao'} • {formatDate(item.dueDate || item.date)}
                          {item.installments && item.installments > 1 ? ` • ${item.installmentNumber || 1}/${item.installments}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${item.isPaid ? 'text-emerald-300' : 'text-cyan-200'}`}>{formatCurrency(Number(item.amount || 0))}</p>
                        <p className={`text-[11px] ${item.isPaid ? 'text-emerald-200/70' : 'text-slate-500'}`}>{item.isPaid ? 'Pago' : 'Pendente'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditBillItem(item)}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
                      >
                        Editar item
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
          <CreditCard size={16} className="text-cyan-300" />
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
          <div key={bill.monthKey} className="rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.35)]">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">{bill.label}</p>
            <p className="mt-1 text-2xl font-black text-white">{formatCurrency(bill.total)}</p>
            <p className="mt-1 text-xs text-slate-400">{bill.items.length} lançamento(s)</p>
          </div>
        ))}
      </div>

      {editingBillItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-cyan-500/20 bg-slate-900 p-6 shadow-[0_18px_60px_rgba(2,8,23,0.6)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-white">Editar fatura</h3>
                <p className="text-sm text-slate-400">Altere valor e banco/cartão do item selecionado.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBillItem(null)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveEditBillItem} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Valor</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editBillForm.amount}
                  onChange={(e) => setEditBillForm((p) => ({ ...p, amount: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  placeholder="0,00"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Cartão</label>
                <select
                  value={editBillForm.cardBrand}
                  onChange={(e) => setEditBillForm((p) => ({ ...p, cardBrand: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  {CREDIT_CARD_BRANDS.map((card) => (
                    <option key={card} value={card}>{card}</option>
                  ))}
                  <option value={CUSTOM_CARD_VALUE}>Outro (cadastrar banco/cartão)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Mês da fatura</label>
                <input
                  type="month"
                  value={editBillForm.dueMonth}
                  onChange={(e) => setEditBillForm((p) => ({ ...p, dueMonth: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>

              {editBillForm.cardBrand === CUSTOM_CARD_VALUE && (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Nome do banco/cartão</label>
                  <input
                    type="text"
                    value={editBillForm.customCardBrand}
                    onChange={(e) => setEditBillForm((p) => ({ ...p, customCardBrand: e.target.value }))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    placeholder="Ex: XP, C6, Inter..."
                  />
                </div>
              )}

              <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
                >
                  Salvar alterações
                </button>
                <button
                  type="button"
                  onClick={() => setEditingBillItem(null)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
