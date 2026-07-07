import { AlertTriangle, X } from 'lucide-react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDestructive?: boolean
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDestructive = false,
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-cyan-500/20 shadow-2xl max-w-sm w-full p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex gap-3">
            <div className={`p-3 rounded-lg ${isDestructive ? 'bg-rose-500/20' : 'bg-amber-500/20'}`}>
              <AlertTriangle size={20} className={isDestructive ? 'text-rose-400' : 'text-amber-400'} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <p className="text-slate-400 text-sm mt-1">{message}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-cyan-500/20">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white rounded-lg font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 px-4 py-2 ${
              isDestructive
                ? 'bg-rose-500 hover:bg-rose-600 disabled:opacity-60'
                : 'bg-cyan-500 hover:bg-cyan-600 disabled:opacity-60'
            } text-white rounded-lg font-medium transition-colors`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
