'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (message: string, type: ToastType, duration?: number) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (message: string, type: ToastType, duration = 4000) => {
    const id = Math.random().toString(36).substr(2, 9)
    const toast: Toast = { id, type, message, duration }
    
    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration)
    }
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return context
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  const iconMap = {
    success: <CheckCircle size={20} className="text-emerald-400" />,
    error: <AlertCircle size={20} className="text-red-400" />,
    info: <Info size={20} className="text-blue-400" />,
    warning: <AlertCircle size={20} className="text-amber-400" />,
  }

  const bgMap = {
    success: 'from-emerald-950 to-emerald-900 border-emerald-500/30',
    error: 'from-red-950 to-red-900 border-red-500/30',
    info: 'from-blue-950 to-blue-900 border-blue-500/30',
    warning: 'from-amber-950 to-amber-900 border-amber-500/30',
  }

  const textMap = {
    success: 'text-emerald-100',
    error: 'text-red-100',
    info: 'text-blue-100',
    warning: 'text-amber-100',
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`bg-gradient-to-r ${bgMap[toast.type]} border rounded-xl p-4 flex items-start gap-3 min-w-64 shadow-lg pointer-events-auto animate-in fade-in slide-in-from-right-4 duration-300`}
        >
          <div className="mt-0.5">{iconMap[toast.type]}</div>
          <p className={`flex-1 text-sm font-medium ${textMap[toast.type]}`}>{toast.message}</p>
          <button
            onClick={() => onRemove(toast.id)}
            className="ml-2 text-white/50 hover:text-white/80 transition"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
