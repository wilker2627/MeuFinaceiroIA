'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import { Plus, Trash2, Search, CreditCard, Wallet, QrCode, Loader } from 'lucide-react'

interface Transaction {
  id: string; type: string; amount: number; description: string
  paymentMethod?: 'PIX' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD'
  date: string; category?: { name: string; color: string }
  account?: { name: string }; user?: { name: string }
}

const PAYMENT_METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Cartao de credito' },
  { value: 'DEBIT_CARD', label: 'Cartao de debito' },
] as const

const PAYMENT_METHOD_META: Record<string, { label: string; icon: any; className: string }> = {
  PIX: { label: 'PIX', icon: QrCode, className: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
  CASH: { label: 'Dinheiro', icon: Wallet, className: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  CREDIT_CARD: { label: 'Cartao de credito', icon: CreditCard, className: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  DEBIT_CARD: { label: 'Cartao de debito', icon: CreditCard, className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
}

const getPaymentMethodMeta = (method?: string) => PAYMENT_METHOD_META[method || 'CASH'] || PAYMENT_METHOD_META.CASH

export default function TransactionsPage() {
  const { addToast } = useToast()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'EXPENSE', amount: '', description: '', categoryId: '', paymentMethod: 'CASH' })
  const [categories, setCategories] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'
  const selectedFormPayment = getPaymentMethodMeta(form.paymentMethod)
  const selectedFilterPayment = paymentMethodFilter ? getPaymentMethodMeta(paymentMethodFilter) : null

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
    setTransactions(t.data.transactions)
    setCategories(c.data)
    setAccounts(a.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [search, typeFilter, paymentMethodFilter])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount) {
      addToast('Informe um valor para o lançamento.', 'warning')
      return
    }
    if (!form.description) {
      addToast('Descreva o lançamento para melhor identificação.', 'warning')
      return
    }

    setSaving(true)
    try {
      await api.post('/dashboard/transactions', { ...form, accountId: accounts[0]?.id })
      addToast(`${form.type === 'EXPENSE' ? 'Despesa' : 'Entrada'} registrada com sucesso!`, 'success')
      setShowForm(false)
      setForm({ type: 'EXPENSE', amount: '', description: '', categoryId: '', paymentMethod: 'CASH' })
      load()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar lançamento.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Deseja remover este lançamento?')
    if (!confirmed) return
    
    try {
      await api.delete(`/dashboard/transactions/${id}`)
      addToast('Lançamento removido com sucesso.', 'success')
      load()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao remover lançamento.', 'error')
    }
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
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={18} /> Novo Lançamento
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <form onSubmit={handleAdd} className={`p-6 grid grid-cols-2 md:grid-cols-5 gap-4 ${panelClass}`}>
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
            <input type="number" step="0.01" required value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2" placeholder="0,00" />
          </div>
          <div className="col-span-2">
            <label className="text-gray-400 text-sm block mb-1">Descrição</label>
            <input type="text" required value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded-lg px-3 py-2" placeholder="Ex: Gasolina" />
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
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 text-slate-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
              {saving && <Loader size={16} className="animate-spin" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg">Cancelar</button>
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
      </div>

      {/* Tabela */}
      <div className={`${panelClass} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-950/80 text-slate-400">
            <tr>
              <th className="text-left px-6 py-3">Descrição</th>
              <th className="text-left px-4 py-3">Categoria</th>
              <th className="text-left px-4 py-3">Pagamento</th>
              <th className="text-left px-4 py-3">Responsável</th>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-right px-6 py-3">Valor</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-slate-500 py-12">Carregando...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-slate-500 py-12">Nenhum lançamento encontrado</td></tr>
            ) : transactions.map(tx => (
              <tr key={tx.id} className="border-t border-cyan-500/15 hover:bg-cyan-500/5 transition-colors">
                <td className="px-6 py-4 text-white">{tx.description}</td>
                <td className="px-4 py-4">
                  {tx.category ? (
                    <span className="px-2 py-1 rounded-full text-xs text-white" style={{ backgroundColor: tx.category.color + '40', color: tx.category.color }}>
                      {tx.category.name}
                    </span>
                  ) : <span className="text-slate-600">—</span>}
                </td>
                <td className="px-4 py-4 text-slate-300 text-xs">
                  <PaymentMethodChip meta={getPaymentMethodMeta(tx.paymentMethod)} />
                </td>
                <td className="px-4 py-4 text-slate-400">{tx.user?.name || '—'}</td>
                <td className="px-4 py-4 text-slate-400">{formatDate(tx.date)}</td>
                <td className={`px-6 py-4 text-right font-semibold ${tx.type === 'INCOME' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                </td>
                <td className="px-4 py-4">
                  <button onClick={() => handleDelete(tx.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
