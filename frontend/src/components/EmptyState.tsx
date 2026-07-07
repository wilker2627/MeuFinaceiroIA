import { Inbox, TrendingDown, Filter } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-6 p-6 rounded-full bg-cyan-500/10 border border-cyan-500/20">
        {icon || <Inbox size={40} className="text-cyan-400" />}
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-slate-400 max-w-sm mb-8">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-cyan-500 hover:bg-cyan-600 text-white font-medium px-6 py-2 rounded-lg transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 p-4 bg-slate-900/50 rounded-lg animate-pulse">
          <div className="h-4 bg-slate-700 rounded flex-1" />
          <div className="h-4 bg-slate-700 rounded w-24" />
        </div>
      ))}
    </div>
  )
}
