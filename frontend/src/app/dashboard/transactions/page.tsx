'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Plus, Trash2, Search, CreditCard, Wallet, QrCode, Loader, ChevronDown, ChevronRight } from 'lucide-react'
import ConfirmModal from '@/components/ConfirmModal'
import EmptyState, { LoadingSkeleton } from '@/components/EmptyState'
import ExportData from '@/components/ExportData'
import { validateAmount, validateDescription } from '@/lib/exportUtils'
import { triggerDashboardRefresh } from '@/lib/dashboardRefresh'

interface Transaction {
  id: string; type: string; amount: number; description: string
  paymentMethod?: 'PIX' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD'
  isPaid?: boolean
  dueDate?: string
  installments?: number | null
  installmentNumber?: number | null
  groupId?: string | null
  date: string; category?: { name: string; color: string }
  account?: { name: string }; user?: { name: string }
  from?: { name: string }
  to?: { name: string }
}

const PAYMENT_METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Cartao de credito' },
  { value: 'DEBIT_CARD', label: 'Cartao de debito' },
] as const

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

const PAYMENT_METHOD_META: Record<string, { label: string; icon: any; className: string }> = {
  PIX: { label: 'PIX', icon: QrCode, className: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
  CASH: { label: 'Dinheiro', icon: Wallet, className: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  CREDIT_CARD: { label: 'Cartao de credito', icon: CreditCard, className: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  DEBIT_CARD: { label: 'Cartao de debito', icon: CreditCard, className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
}

const getPaymentMethodMeta = (method?: string) => PAYMENT_METHOD_META[method || 'CASH'] || PAYMENT_METHOD_META.CASH

const CARD_TAG_REGEX = /\|\s*Cartao:\s*([^|]+)/i
const PERSON_TAG_REGEX = /\|\s*Pessoa:\s*(.+)$/i

function extractCardBrandFromDescription(description: string) {
  const match = String(description || '').match(CARD_TAG_REGEX)
  return match?.[1]?.trim() || ''
}

function extractPersonFromDescription(description: string) {
  const match = String(description || '').match(PERSON_TAG_REGEX)
  return match?.[1]?.trim() || ''
}

function cleanDescription(description: string) {
  return String(description || '')
    .replace(CARD_TAG_REGEX, '')
    .replace(PERSON_TAG_REGEX, '')
    .trim()
}

function getInvoiceMonthKey(tx: Transaction) {
  if (tx.paymentMethod !== 'CREDIT_CARD' || !tx.dueDate) return null
  const dueDate = new Date(tx.dueDate)
  return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`
}

function formatInvoiceMonth(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export default function TransactionsPage() {
  const { addToast } = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ type: string; amount: string; description: string; categoryId: string; paymentMethod: string; personName: string; installments: string; creditBillingOption: string; cardBrand: string; customCardBrand: string }>({
    type: 'EXPENSE',
    amount: '',
    description: '',
    categoryId: '',
    paymentMethod: 'CASH',
    personName: '',
    installments: '1',
    creditBillingOption: '1',
    cardBrand: CREDIT_CARD_BRANDS[0],
    customCardBrand: ''
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; txIds: string[] }>({ open: false, txIds: [] })
  const [deleting, setDeleting] = useState(false)
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([])
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'
  const selectedFormPayment = getPaymentMethodMeta(form.paymentMethod)
  const selectedFilterPayment = paymentMethodFilter ? getPaymentMethodMeta(paymentMethodFilter) : null
  const isCreditExpense = form.type === 'EXPENSE' && form.paymentMethod === 'CREDIT_CARD'
  const selectedCardBrand = form.cardBrand === CUSTOM_CARD_VALUE
    ? form.customCardBrand.trim().toUpperCase()
    : form.cardBrand
  const allVisibleSelected = transactions.length > 0 && transactions.every((tx) => selectedTransactionIds.includes(tx.id))
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const getResponsibleName = (tx: Transaction) => tx.user?.name || tx.from?.name || tx.to?.name || extractPersonFromDescription(tx.description) || 'Sem responsavel'

  const getEffectiveDate = (tx: Transaction) => tx.type === 'EXPENSE' && tx.isPaid === false && tx.dueDate ? tx.dueDate : tx.date

  const groupedTransactions = useMemo(() => {
    const invoiceMap = new Map<string, { groupKey: string; monthKey: string; label: string; cardBrand: string; total: number; items: Transaction[] }>()
    const regularItems: Transaction[] = []

    transactions.forEach((tx) => {
      const invoiceMonthKey = getInvoiceMonthKey(tx)
      if (!invoiceMonthKey) {
        regularItems.push(tx)
        return
      }

      const cardBrand = extractCardBrandFromDescription(tx.description) || 'Sem cartao'
      const invoiceKey = `${invoiceMonthKey}__${cardBrand}`

      const existing = invoiceMap.get(invoiceKey)
      if (existing) {
        existing.items.push(tx)
        existing.total += Number(tx.amount || 0)
        return
      }

      invoiceMap.set(invoiceKey, {
        groupKey: invoiceKey,
        monthKey: invoiceMonthKey,
        label: formatInvoiceMonth(invoiceMonthKey),
        cardBrand,
        total: Number(tx.amount || 0),
        items: [tx],
      })
    })

    const invoiceGroups = Array.from(invoiceMap.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => {
          const dateDiff = new Date(getEffectiveDate(a)).getTime() - new Date(getEffectiveDate(b)).getTime()
          if (dateDiff !== 0) return dateDiff
          return Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0)
        })
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

    const monthlyInvoiceSummary = invoiceGroups.reduce((acc, group) => {
      const existing = acc.get(group.monthKey) || {
        monthKey: group.monthKey,
        label: group.label,
        total: 0,
        pending: 0,
        count: 0,
      }

      existing.total += group.total
      existing.pending += group.items
        .filter((item) => item.isPaid === false)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)
      existing.count += group.items.length
      acc.set(group.monthKey, existing)
      return acc
    }, new Map<string, { monthKey: string; label: string; total: number; pending: number; count: number }>())

    return {
      invoiceGroups,
      monthlyInvoiceSummary: Array.from(monthlyInvoiceSummary.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
      regularItems,
    }
  }, [transactions])

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev }
      groupedTransactions.invoiceGroups.forEach((group) => {
        if (!(group.groupKey in next)) next[group.groupKey] = false
      })
      if (groupedTransactions.regularItems.length > 0 && !('regular' in next)) next.regular = true
      return next
    })
  }, [groupedTransactions])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (typeFilter) params.set('type', typeFilter)
    if (paymentMethodFilter) params.set('paymentMethod', paymentMethodFilter)
    const [t, c, a] = await Promise.all([
      api.get(`/dashboard/transactions?${params}`),
      api.get('/dashboard/categories?catalog=1'),
      api.get('/dashboard/accounts'),
    ])
    const nextTransactions = t.data.transactions
    setTransactions(nextTransactions)
    setSelectedTransactionIds((prev) => prev.filter((id) => nextTransactions.some((tx: Transaction) => tx.id === id)))
    setCategories(c.data)
    setAccounts(a.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [search, typeFilter, paymentMethodFilter])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    
    // Validar
    const errors: Record<string, string> = {}
    const amountValidation = validateAmount(form.amount)
    const descriptionValidation = validateDescription(form.description)
    
    if (!amountValidation.valid) errors.amount = amountValidation.error || ''
    if (!descriptionValidation.valid) errors.description = descriptionValidation.error || ''
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    
    setFormErrors({})
    setSaving(true)
    try {
      if (isCreditExpense && !selectedCardBrand) {
        addToast('Informe o nome do banco/cartao para lancamento no credito.', 'error')
        setSaving(false)
        return
      }

      const installments = isCreditExpense ? Math.min(Math.max(parseInt(form.creditBillingOption) || 1, 1), 12) : 1
      const baseAmount = Number(form.amount)
      const cardTag = isCreditExpense ? ` | Cartao: ${selectedCardBrand}` : ''
      const personTag = form.personName.trim() ? ` | Pessoa: ${form.personName.trim()}` : ''
      const baseDescription = `${form.description}${cardTag}${personTag}`
      const currentBillDate = isCreditExpense && form.creditBillingOption === 'CURRENT_BILL' ? new Date() : undefined

      await api.post('/dashboard/transactions', {
        type: form.type,
        amount: baseAmount,
        description: baseDescription,
        categoryId: form.categoryId || undefined,
        paymentMethod: form.paymentMethod,
        accountId: isCreditExpense ? undefined : (accounts[0]?.id || undefined),
        personName: form.personName.trim() || undefined,
        installments,
        isPaid: isCreditExpense ? false : true,
        dueDate: currentBillDate ? currentBillDate.toISOString() : undefined,
        date: currentBillDate ? currentBillDate.toISOString() : undefined,
      })

      addToast(`${form.type === 'EXPENSE' ? 'Despesa' : 'Entrada'} registrada com sucesso!`, 'success')
      setShowForm(false)
      setForm({ type: 'EXPENSE', amount: '', description: '', categoryId: '', paymentMethod: 'CASH', personName: '', installments: '1', creditBillingOption: '1', cardBrand: CREDIT_CARD_BRANDS[0], customCardBrand: '' })
      load()
      triggerDashboardRefresh()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar lançamento.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    if (deleteConfirm.txIds.length === 0) return
    
    setDeleting(true)
    try {
      if (deleteConfirm.txIds.length === 1) {
        await api.delete(`/dashboard/transactions/${deleteConfirm.txIds[0]}`)
      } else {
        await api.post('/dashboard/transactions/bulk-delete', { ids: deleteConfirm.txIds })
      }
      addToast(deleteConfirm.txIds.length === 1 ? 'Lançamento removido com sucesso.' : 'Lançamentos removidos com sucesso.', 'success')
      setDeleteConfirm({ open: false, txIds: [] })
      setSelectedTransactionIds([])
      load()
      triggerDashboardRefresh()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao remover lançamento.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  function toggleTransactionSelection(txId: string) {
    setSelectedTransactionIds((prev) => prev.includes(txId) ? prev.filter((id) => id !== txId) : [...prev, txId])
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedTransactionIds([])
      return
    }
    setSelectedTransactionIds(transactions.map((tx) => tx.id))
  }

  function toggleGroup(groupKey: string) {
    setOpenGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }

  function renderTransactionItem(tx: Transaction) {
    const isSelected = selectedTransactionIds.includes(tx.id)

    return (
      <div key={tx.id} className="rounded-xl border border-cyan-500/10 bg-slate-950/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleTransactionSelection(tx.id)}
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-400"
            />
            <div>
              <p className="text-white font-medium">{cleanDescription(tx.description)}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                <span>{formatDate(getEffectiveDate(tx))}</span>
                <span>{getResponsibleName(tx)}</span>
                {tx.installments && tx.installments > 1 && (
                  <span>{tx.installmentNumber || 1}/{tx.installments}</span>
                )}
                {tx.type === 'EXPENSE' && tx.isPaid === false && tx.dueDate && (
                  <span className="text-amber-300">Acumula para {formatDate(tx.dueDate)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className={`font-semibold ${tx.type === 'INCOME' ? 'text-green-400' : 'text-red-400'}`}>
              {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
            </p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <PaymentMethodChip meta={getPaymentMethodMeta(tx.paymentMethod)} />
              <button onClick={() => setDeleteConfirm({ open: true, txIds: [tx.id] })} className="text-slate-500 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3">
          {tx.category ? (
            <span className="px-2 py-1 rounded-full text-xs text-white" style={{ backgroundColor: tx.category.color + '40', color: tx.category.color }}>
              {tx.category.name}
            </span>
          ) : (
            <span className="text-xs text-slate-600">Sem categoria</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Lançamentos</h1>
          <p className="text-slate-400 text-sm mt-1">{transactions.length} transações encontradas</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {transactions.length > 0 && (
            <>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
              >
                {allVisibleSelected ? 'Limpar selecao' : 'Selecionar todos'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm({ open: true, txIds: selectedTransactionIds })}
                disabled={selectedTransactionIds.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                <Trash2 size={16} /> Excluir selecionados
              </button>
            </>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={18} /> Novo Lançamento
          </button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <form onSubmit={handleAdd} className={`p-6 grid grid-cols-2 md:grid-cols-6 gap-4 ${panelClass}`}>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Tipo</label>
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
              <option value="EXPENSE">Saída</option>
              <option value="INCOME">Entrada</option>
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Valor (R$)</label>
            <input type="number" step="0.01" required value={form.amount} onChange={e => {
              setForm(p => ({ ...p, amount: e.target.value }))
              if (e.target.value) {
                const validation = validateAmount(e.target.value)
                if (!validation.valid) {
                  setFormErrors(p => ({ ...p, amount: validation.error || '' }))
                } else {
                  setFormErrors(p => ({ ...p, amount: '' }))
                }
              }
            }}
              className={`w-full bg-slate-950 border ${formErrors.amount ? 'border-rose-500' : 'border-cyan-500/20'} text-white rounded-lg px-3 py-2`} placeholder="0,00" />
            {formErrors.amount && <p className="text-rose-400 text-xs mt-1">{formErrors.amount}</p>}
          </div>
          <div className="col-span-2">
            <label className="text-gray-400 text-sm block mb-1">Descrição</label>
            <input type="text" required value={form.description} onChange={e => {
              setForm(p => ({ ...p, description: e.target.value }))
              if (e.target.value) {
                const validation = validateDescription(e.target.value)
                if (!validation.valid) {
                  setFormErrors(p => ({ ...p, description: validation.error || '' }))
                } else {
                  setFormErrors(p => ({ ...p, description: '' }))
                }
              }
            }}
              className={`w-full bg-slate-950 border ${formErrors.description ? 'border-rose-500' : 'border-cyan-500/20'} text-white rounded-lg px-3 py-2`} placeholder="Ex: Gasolina" />
            {formErrors.description && <p className="text-rose-400 text-xs mt-1">{formErrors.description}</p>}
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Pessoa</label>
            <input type="text" value={form.personName} onChange={e => setForm(p => ({ ...p, personName: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2" placeholder="Ex: Maria" />
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Categoria</label>
            <select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
              <option value="">Sem categoria</option>
              {categories.filter(c => c.type === form.type).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">Forma de pagamento</label>
            <select value={form.paymentMethod} onChange={e => setForm(p => ({ ...p, paymentMethod: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>{method.label}</option>
              ))}
            </select>
            <div className="mt-2">
              <PaymentMethodChip meta={selectedFormPayment} />
            </div>
          </div>
          {isCreditExpense && (
            <div>
              <label className="text-gray-400 text-sm block mb-1">Cartao</label>
              <select value={form.cardBrand} onChange={e => setForm(p => ({ ...p, cardBrand: e.target.value }))}
                className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
                {CREDIT_CARD_BRANDS.map((card) => (
                  <option key={card} value={card}>{card}</option>
                ))}
                <option value={CUSTOM_CARD_VALUE}>Outro (cadastrar banco/cartao)</option>
              </select>
            </div>
          )}
          {isCreditExpense && form.cardBrand === CUSTOM_CARD_VALUE && (
            <div className="col-span-2 md:col-span-3">
              <label className="text-gray-400 text-sm block mb-1">Nome do banco/cartão</label>
              <input
                type="text"
                value={form.customCardBrand}
                onChange={e => setForm(p => ({ ...p, customCardBrand: e.target.value }))}
                className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2"
                placeholder="Ex: XP, C6, Inter..."
              />
            </div>
          )}
          {isCreditExpense && (
            <div>
              <label className="text-gray-400 text-sm block mb-1">Fatura do cartao</label>
              <select value={form.creditBillingOption} onChange={e => setForm(p => ({ ...p, creditBillingOption: e.target.value }))}
                className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2">
                <option value="CURRENT_BILL">Fatura atual</option>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={String(value)}>{value}x</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
              {saving && <Loader size={16} className="animate-spin" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setFormErrors({}) }} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg">Cancelar</button>
          </div>
        </form>
      )}

      {/* Filtros */}
      <div className={`flex flex-wrap gap-3 p-4 ${panelClass}`}>
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-400"
            placeholder="Buscar lançamento..." />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">Todos</option>
          <option value="INCOME">Entradas</option>
          <option value="EXPENSE">Saídas</option>
        </select>
        <select value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)}
          className="bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2 text-sm">
          <option value="">Todas as formas</option>
          {PAYMENT_METHODS.map((method) => (
            <option key={method.value} value={method.value}>{method.label}</option>
          ))}
        </select>
        {selectedFilterPayment && <PaymentMethodChip meta={selectedFilterPayment} />}
        <ExportData
          data={transactions}
          columns={[
            { key: 'description', label: 'Descrição' },
            { key: 'type', label: 'Tipo' },
            { key: 'amount', label: 'Valor' },
            { key: 'date', label: 'Data' },
            { key: 'paymentMethod', label: 'Pagamento' },
          ]}
          filename="lançamentos"
        />
      </div>

      {/* Lancamentos agrupados */}
      <div className={`${panelClass} overflow-hidden`}>
        {loading ? (
          <div className="p-6">
            <LoadingSkeleton />
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento encontrado"
            description={search || typeFilter || paymentMethodFilter 
              ? "Tente ajustar os filtros para encontrar o que você procura"
              : "Comece adicionando suas primeiras entradas e saídas"}
            action={{
              label: 'Novo Lançamento',
              onClick: () => setShowForm(true),
            }}
          />
        ) : (
          <div className="space-y-4 p-4 md:p-6">
            <div className="flex items-center gap-3 rounded-xl border border-cyan-500/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-400"
              />
              <span>Selecionar todos os lançamentos visíveis</span>
            </div>

            {groupedTransactions.monthlyInvoiceSummary.length > 0 && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-violet-200/80 mb-3">Resumo geral das faturas</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {groupedTransactions.monthlyInvoiceSummary.map((summary) => (
                    <div key={summary.monthKey} className="rounded-xl border border-violet-500/20 bg-slate-950/60 p-3">
                      <p className="text-sm font-semibold text-white">{summary.label}</p>
                      <p className="text-xs text-slate-400 mt-1">{summary.count} lançamento(s) no cartão</p>
                      <p className="text-sm text-violet-100 mt-1">Total geral: {formatCurrency(summary.total)}</p>
                      <p className="text-xs text-amber-200 mt-1">Pendente geral: {formatCurrency(summary.pending)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groupedTransactions.invoiceGroups.map((group) => {
              const isOpen = openGroups[group.groupKey] ?? false
              return (
                <div key={group.groupKey} className="rounded-2xl border border-violet-500/20 bg-violet-500/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.groupKey)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown size={18} className="text-violet-200" /> : <ChevronRight size={18} className="text-violet-200" />}
                      <div>
                        <p className="text-sm font-semibold text-white">Fatura de {group.label}</p>
                        <p className="text-xs text-violet-100/75">{group.cardBrand} • {group.items.length} lançamento(s)</p>
                      </div>
                    </div>
                    <p className="text-lg font-black text-violet-100">{formatCurrency(group.total)}</p>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-violet-500/15 bg-slate-950/35 p-4">
                      {group.items.map(renderTransactionItem)}
                    </div>
                  )}
                </div>
              )
            })}

            {groupedTransactions.regularItems.length > 0 && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup('regular')}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    {(openGroups.regular ?? true) ? <ChevronDown size={18} className="text-cyan-200" /> : <ChevronRight size={18} className="text-cyan-200" />}
                    <div>
                      <p className="text-sm font-semibold text-white">Outros lançamentos</p>
                      <p className="text-xs text-cyan-100/75">Entradas, saídas e itens fora de fatura</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-cyan-100">{groupedTransactions.regularItems.length} item(ns)</p>
                </button>

                {(openGroups.regular ?? true) && (
                  <div className="space-y-3 border-t border-cyan-500/15 bg-slate-950/35 p-4">
                    {groupedTransactions.regularItems.map(renderTransactionItem)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de confirmação de delete */}
      <ConfirmModal
        isOpen={deleteConfirm.open}
        title={deleteConfirm.txIds.length > 1 ? 'Remover Lancamentos' : 'Remover Lancamento'}
        message={deleteConfirm.txIds.length > 1 ? `Tem certeza que deseja remover ${deleteConfirm.txIds.length} lancamentos? Esta acao nao pode ser desfeita.` : 'Tem certeza que deseja remover este lancamento? Esta acao nao pode ser desfeita.'}
        confirmText="Remover"
        cancelText="Cancelar"
        isDestructive
        isLoading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ open: false, txIds: [] })}
      />
      </div>
    </div>
  )
}

function PaymentMethodChip({ meta }: { meta: { label: string; icon: any; className: string } }) {
  const PaymentIcon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${meta.className}`}>
      <PaymentIcon size={12} />
      {meta.label}
    </span>
  )
}
