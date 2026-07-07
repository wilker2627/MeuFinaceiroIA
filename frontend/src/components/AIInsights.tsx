import { Lightbulb, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import api from '@/lib/api'

interface InsightType {
  type: 'warning' | 'success' | 'info'
  title: string
  message: string
  value?: string
}

export default function AIInsights() {
  const [insights, setInsights] = useState<InsightType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInsights()
  }, [])

  const loadInsights = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/dashboard/insights')
      setInsights(data)
    } catch (err) {
      console.error('Erro ao carregar insights:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-slate-500 text-sm">Analisando seus dados...</div>
  }

  if (insights.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
        <Lightbulb size={20} className="text-amber-400" />
        Insights IA
      </h3>

      {insights.map((insight, i) => {
        const Icon = insight.type === 'warning' 
          ? AlertCircle 
          : insight.type === 'success' 
          ? CheckCircle 
          : TrendingUp

        const colors = {
          warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          info: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
        }

        return (
          <div
            key={i}
            className={`flex gap-3 p-4 rounded-lg border ${colors[insight.type]}`}
          >
            <Icon size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-sm">{insight.title}</p>
              <p className="text-xs text-slate-300 mt-1">{insight.message}</p>
              {insight.value && (
                <p className="text-xs font-bold mt-2">{insight.value}</p>
              )}
            </div>
          </div>
        )
      })}

      <button
        onClick={loadInsights}
        className="w-full text-xs text-slate-500 hover:text-slate-400 py-2 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
      >
        Atualizar análise
      </button>
    </div>
  )
}
