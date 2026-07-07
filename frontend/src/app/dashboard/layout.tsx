'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ArrowUpDown, Calendar, Users, LogOut, TrendingUp, Menu, X, Home, Bot, Plus
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ThemeToggle from '@/components/ThemeToggle'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/transactions', label: 'Lancamentos', icon: ArrowUpDown },
  { href: '/dashboard/cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
  { href: '/dashboard/scheduled', label: 'Agendamentos', icon: Calendar },
  { href: '/dashboard/team', label: 'Equipe', icon: Users },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenant, logout, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!loading && !tenant) router.replace('/login')
  }, [tenant, loading, router])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  const currentSection = useMemo(() => {
    const found = navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    return found?.label ?? 'Dashboard'
  }, [pathname])

  if (loading || !tenant) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <p className="text-slate-400">Carregando...</p>
    </div>
  }

  const renderNavLinks = (mobile = false) => (
    <nav className={cn('space-y-1', mobile ? 'p-4' : 'p-4')}>
      {navItems.map(({ href, label, icon: Icon }, index) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            style={{ animationDelay: `${index * 50}ms` }}
            className={cn(
              'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200 motion-safe:animate-[revealUp_380ms_cubic-bezier(0.2,0.8,0.2,1)_both]',
              active
                ? 'bg-emerald-500/12 text-emerald-700 border border-emerald-200 shadow-[0_8px_24px_rgba(16,185,129,0.12)]'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            )}
          >
            <Icon size={18} className={cn(active ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-700')} />
            {label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="relative min-h-screen bg-slate-100 text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
      <aside className="hidden md:flex md:w-72 md:flex-col m-4 mr-0 rounded-3xl border border-slate-200 bg-white/90 backdrop-blur-xl shadow-[0_18px_55px_rgba(2,8,23,0.45)]">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <Image src="/financeiroai-logo.svg" alt="FinanceiroAI" width={52} height={52} className="rounded-2xl shadow-[0_8px_24px_rgba(34,211,238,0.2)]" />
            <div>
              <div className="text-lg font-black text-cyan-300 leading-tight">FinanceiroAI</div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Neuro Finance Bot</p>
            </div>
          </div>
          <div className="text-sm text-slate-400 mt-2 truncate">{tenant.name}</div>
          <div className="inline-block mt-3 text-xs bg-cyan-500/15 border border-slate-300 text-cyan-200 px-2 py-0.5 rounded-full">
            {tenant.plan}
          </div>
        </div>

        <div className="flex-1">{renderNavLinks()}</div>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="flex items-center justify-between px-4">
            <span className="text-xs text-slate-400">Aparencia</span>
            <ThemeToggle />
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-600 hover:bg-rose-500/15 hover:text-rose-300 w-full transition-colors"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 m-0 md:m-4 md:ml-4 overflow-auto">
        <div className="md:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-[0.22em]">Painel Financeiro</p>
            <p className="text-sm font-semibold text-slate-800">{currentSection}</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-slate-300 bg-slate-50 text-slate-700"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-slate-100/70 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
            <aside
              className="absolute right-0 top-0 h-full w-80 max-w-[85vw] border-l border-slate-200 bg-white/98 backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <Image src="/financeiroai-logo.svg" alt="FinanceiroAI" width={42} height={42} className="rounded-xl shadow-[0_6px_18px_rgba(34,211,238,0.18)]" />
                  <div>
                    <div className="text-base font-black text-emerald-700">FinanceiroAI</div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Neuro Finance Bot</p>
                  </div>
                </div>
                <div className="text-sm text-slate-400 mt-1 truncate">{tenant.name}</div>
                <div className="inline-block mt-2 text-xs bg-emerald-500/12 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
                  {tenant.plan}
                </div>
              </div>
              <div className="flex-1">{renderNavLinks(true)}</div>
              <div className="p-4 border-t border-slate-200">
                <button
                  onClick={logout}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-600 hover:bg-rose-500/15 hover:text-rose-300 w-full transition-colors"
                >
                  <LogOut size={18} />
                  Sair
                </button>
              </div>
            </aside>
          </div>
        )}

        <div className="hidden md:flex items-center justify-between px-6 py-4 border-b border-slate-200 rounded-t-3xl bg-white/90 backdrop-blur-xl">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-[0.22em]">Painel Financeiro</p>
            <p className="text-lg font-bold text-slate-800">{currentSection}</p>
          </div>
          <div className="text-xs text-slate-400 bg-cyan-500/10 border border-slate-200 rounded-full px-3 py-1">
            Conta: {tenant.name}
          </div>
        </div>

        <div key={pathname} className="page-enter rounded-none md:rounded-b-3xl bg-slate-50 min-h-[calc(100vh-72px)] md:min-h-[calc(100vh-7rem)] pb-24 md:pb-0">
          {children}
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-xl">
          <div className="grid grid-cols-4 items-center px-2 py-2">
            <Link href="/dashboard" className={cn('flex flex-col items-center gap-1 py-1 text-xs', pathname === '/dashboard' ? 'text-emerald-600 font-semibold' : 'text-slate-500')}>
              <Home size={18} />
              Inicio
            </Link>
            <Link href="/dashboard/transactions" className={cn('flex flex-col items-center gap-1 py-1 text-xs', pathname.startsWith('/dashboard/transactions') ? 'text-emerald-600 font-semibold' : 'text-slate-500')}>
              <ArrowUpDown size={18} />
              Movimentos
            </Link>
            <Link href="/dashboard/transactions" className="flex items-center justify-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_10px_20px_rgba(16,185,129,0.35)]">
                <Plus size={22} />
              </span>
            </Link>
            <Link href="/dashboard/team" className={cn('flex flex-col items-center gap-1 py-1 text-xs', pathname.startsWith('/dashboard/team') ? 'text-emerald-600 font-semibold' : 'text-slate-500')}>
              <Users size={18} />
              Familia
            </Link>
          </div>
        </nav>
      </main>
      </div>
    </div>
  )
}

