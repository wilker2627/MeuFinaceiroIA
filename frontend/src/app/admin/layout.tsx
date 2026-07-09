'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'

const menu = [
  { href: '/admin/dashboard', label: 'Visao Geral' },
  { href: '/admin/dashboard#clientes', label: 'Clientes' },
  { href: '/admin/dashboard#comercial', label: 'Comercial' },
  { href: '/admin/dashboard#planos', label: 'Planos e Cupons' },
  { href: '/admin/dashboard#ia', label: 'IA' },
  { href: '/admin/dashboard#whatsapp', label: 'WhatsApp' },
  { href: '/admin/dashboard#suporte', label: 'Suporte e Updates' }
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const isLogin = useMemo(() => pathname === '/admin/login', [pathname])

  useEffect(() => {
    if (isLogin) return
    const token = localStorage.getItem('admin_token')
    if (!token) router.replace('/admin/login')
  }, [isLogin, router])

  if (isLogin) return <>{children}</>

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="w-72 border-r border-slate-800 bg-slate-900/80 p-5 flex flex-col">
        <h1 className="text-xl font-bold text-cyan-300">FinanceiroAI Admin</h1>
        <p className="text-xs text-slate-400 mt-1">Painel exclusivo de operacao</p>

        <nav className="mt-6 space-y-1">
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => {
            localStorage.removeItem('admin_token')
            localStorage.removeItem('admin_profile')
            router.replace('/admin/login')
          }}
          className="mt-auto rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-2 text-sm font-semibold"
        >
          Sair do Admin
        </button>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
