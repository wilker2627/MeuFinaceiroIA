import { RotateCcw, Plus, Trash2, Loader } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import api from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import ConfirmModal from './ConfirmModal'

interface RecurringTransaction {
  id: string
  description: string
  amount: number
  type: 'INCOME' | 'EXPENSE'
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  nextDate: string
  lastRun?: string
  isActive: boolean
  category?: { name: string; color: string }
}

const FREQUENCY_LABELS = {
  DAILY: 'Diariamente',
  WEEKLY: 'Semanalmente',
  BIWEEKLY: 'Quinzenalmente',
  MONTHLY: 'Mensalmente',
  QUARTERLY: 'Trimestralmente',
  YEARLY: 'Anualmente',
}

export default function RecurringTransactions() {
  const { addToast } = useToast()
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'EXPENSE',
    frequency: 'MONTHLY',
    nextDate: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadRecurring()
  }, [])

  const loadRecurring = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/dashboard/recurring')
      setRecurring(data)
    } catch (err) {
      addToast('Erro ao carregar lançamentos recorrentes', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.description || !form.amount || !form.nextDate) {
      addToast('Preencha todos os campos', 'warning')
      return
    }

    setSaving(true)
    try {
      await api.post('/dashboard/recurring', form)
      addToast('Lançamento recorrente criado!', 'success')
      setShowForm(false)
      setForm({ description: '', amount: '', type: 'EXPENSE', frequency: 'MONTHLY', nextDate: '' })
      loadRecurring()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao criar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(true)
    try {
      await api.delete(`/dashboard/recurring/${deleteConfirm.id}`)
      addToast('Lançamento recorrente removido', 'success')
      setDeleteConfirm({ open: false, id: null })
      loadRecurring()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao remover', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await api.patch(`/dashboard/recurring/${id}`, { isActive: !isActive })
      loadRecurring()
    } catch (err) {
      addToast('Erro ao atualizar', 'error')
    }
  }

  if (loading) return <div className="text-slate-400">Carregando...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <RotateCcw size={20} />
          Lançamentos Recorrentes
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-sm"
        >
          <Plus size={16} /> Novo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-slate-900/50 p-4 rounded-lg space-y-3 border border-cyan-500/20">
          <input
            type="text"
            placeholder="Descrição"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded px-2 py-1 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Valor"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="bg-slate-950 border border-cyan-500/20 text-white rounded px-2 py-1 text-sm"
            />
            <select
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))}
              className="bg-slate-950 border border-cyan-500/20 text-white rounded px-2 py-1 text-sm"
            >
              <option value="EXPENSE">Saída</option>
              <option value="INCOME">Entrada</option>
            </select>
            <select
              value={form.frequency}
              onChange={e => setForm(p => ({ ...p, frequency: e.target.value as any }))}
              className="bg-slate-950 border border-cyan-500/20 text-white rounded px-2 py-1 text-sm"
            >
              {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <input
            type="date"
            value={form.nextDate}
            onChange={e => setForm(p => ({ ...p, nextDate: e.target.value }))}
            className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1"
            >
              {saving && <Loader size={14} className="animate-spin" />}
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {recurring.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">Nenhum lançamento recorrente</p>
        ) : (
          recurring.map(tx => (
            <div
              key={tx.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                tx.isActive ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-slate-700 bg-slate-950/50'
              }`}
            >
              <div className="flex-1">
                <p className={`font-medium text-sm ${tx.isActive ? 'text-white' : 'text-slate-500'}`}>
                  {tx.description}
                </p>
                <p className="text-xs text-slate-500">
                  {FREQUENCY_LABELS[tx.frequency]} • Próx: {formatDate(tx.nextDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold text-sm ${tx.type === 'INCOME' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)}
                </span>
                <button
                  onClick={() => handleToggleActive(tx.id, tx.isActive)}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    tx.isActive
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {tx.isActive ? 'Ativo' : 'Inativo'}
                </button>
                <button
                  onClick={() => setDeleteConfirm({ open: true, id: tx.id })}
                  className="text-slate-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmModal
        isOpen={deleteConfirm.open}
        title="Remover Lançamento Recorrente"
        message="Deseja remover este lançamento recorrente? Futuros lançamentos não serão criados."
        confirmText="Remover"
        isDestructive
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: null })}
      />
    </div>
  )
}
