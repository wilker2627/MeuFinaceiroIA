import { Target, Plus, Trash2, Edit2, CheckCircle2, Loader } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import ConfirmModal from './ConfirmModal'

interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string
  icon?: string
  isCompleted: boolean
}

export default function GoalsWidget() {
  const { addToast } = useToast()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', targetAmount: '', deadline: '' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadGoals()
  }, [])

  const loadGoals = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/dashboard/goals')
      setGoals(data)
    } catch (err) {
      addToast('Erro ao carregar metas', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.targetAmount) {
      addToast('Preencha todos os campos', 'warning')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await api.put(`/dashboard/goals/${editing}`, form)
        addToast('Meta atualizada!', 'success')
      } else {
        await api.post('/dashboard/goals', form)
        addToast('Meta criada!', 'success')
      }
      setShowForm(false)
      setEditing(null)
      setForm({ name: '', targetAmount: '', deadline: '' })
      loadGoals()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.id) return
    setDeleting(true)
    try {
      await api.delete(`/dashboard/goals/${deleteConfirm.id}`)
      addToast('Meta removida', 'success')
      setDeleteConfirm({ open: false, id: null })
      loadGoals()
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao remover', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const startEdit = (goal: Goal) => {
    setEditing(goal.id)
    setForm({
      name: goal.name,
      targetAmount: goal.targetAmount.toString(),
      deadline: goal.deadline,
    })
    setShowForm(true)
  }

  if (loading) {
    return <div className="text-slate-400 text-sm">Carregando metas...</div>
  }

  const totalProgress = goals.length > 0 
    ? (goals.reduce((a, g) => a + g.currentAmount, 0) / goals.reduce((a, g) => a + g.targetAmount, 0)) * 100
    : 0

  const completedGoals = goals.filter(g => g.isCompleted).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Target size={20} />
          Metas Financeiras
        </h3>
        <button
          onClick={() => {
            setEditing(null)
            setForm({ name: '', targetAmount: '', deadline: '' })
            setShowForm(!showForm)
          }}
          className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-sm"
        >
          <Plus size={16} /> Nova Meta
        </button>
      </div>

      {/* Overall Progress */}
      {goals.length > 0 && (
        <div className="bg-slate-900/50 p-4 rounded-lg border border-cyan-500/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-300">Progresso Geral</p>
            <span className="text-sm font-bold text-cyan-400">{completedGoals}/{goals.length} concluídas</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(totalProgress, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {formatCurrency(goals.reduce((a, g) => a + g.currentAmount, 0))} / {formatCurrency(goals.reduce((a, g) => a + g.targetAmount, 0))}
          </p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleAdd} className="bg-slate-900/50 p-4 rounded-lg space-y-3 border border-cyan-500/20">
          <input
            type="text"
            placeholder="Nome da meta"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full bg-slate-950 border border-cyan-500/20 text-white rounded px-2 py-1 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Valor alvo"
              value={form.targetAmount}
              onChange={e => setForm(p => ({ ...p, targetAmount: e.target.value }))}
              className="bg-slate-950 border border-cyan-500/20 text-white rounded px-2 py-1 text-sm"
            />
            <input
              type="date"
              value={form.deadline}
              onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
              className="bg-slate-950 border border-cyan-500/20 text-white rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60 text-white px-3 py-1.5 rounded text-sm flex items-center justify-center gap-1"
            >
              {saving && <Loader size={14} className="animate-spin" />}
              {editing ? 'Atualizar' : 'Criar'}
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

      {/* Goals List */}
      <div className="space-y-2">
        {goals.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">Nenhuma meta criada</p>
        ) : (
          goals.map(goal => {
            const progress = (goal.currentAmount / goal.targetAmount) * 100
            const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))

            return (
              <div
                key={goal.id}
                className={`p-3 rounded-lg border ${
                  goal.isCompleted
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-cyan-500/20 bg-slate-900/50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-white">{goal.name}</p>
                      {goal.isCompleted && <CheckCircle2 size={14} className="text-emerald-400" />}
                    </div>
                    <p className="text-xs text-slate-500">
                      Até {new Date(goal.deadline).toLocaleDateString('pt-BR')}
                      {daysLeft > 0 && ` • ${daysLeft} dias restantes`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(goal)}
                      className="p-1 text-slate-600 hover:text-cyan-400 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ open: true, id: goal.id })}
                      className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-2">
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        progress >= 75
                          ? 'bg-emerald-500'
                          : progress >= 50
                          ? 'bg-cyan-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{Math.round(progress)}% completo</span>
                  <span className="text-xs font-bold text-slate-300">
                    {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      <ConfirmModal
        isOpen={deleteConfirm.open}
        title="Remover Meta"
        message="Deseja remover esta meta financeira?"
        confirmText="Remover"
        isDestructive
        isLoading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ open: false, id: null })}
      />
    </div>
  )
}
