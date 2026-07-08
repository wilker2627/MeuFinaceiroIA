'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ArrowUpDown, Calendar, Users, LogOut, TrendingUp, Menu, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ThemeToggle from '@/components/ThemeToggle'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/transactions', label: 'Lançamentos', icon: ArrowUpDown },
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
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center">
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
                ? 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 shadow-[0_8px_24px_rgba(6,182,212,0.15)]'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border border-transparent'
            )}
          >
            <Icon size={18} className={cn(active ? 'text-cyan-300' : 'text-slate-400 group-hover:text-slate-200')} />
            {label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="relative min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
      <aside className="hidden md:flex md:w-72 md:flex-col m-4 mr-0 rounded-3xl border border-cyan-500/20 bg-slate-900/80 backdrop-blur-xl shadow-[0_18px_55px_rgba(2,8,23,0.45)]">
        <div className="p-6 border-b border-cyan-500/15">
          <div className="flex items-center gap-4">
            <Image src="/financeiroai-logo.svg" alt="FinanceiroAI" width={52} height={52} className="rounded-2xl shadow-[0_8px_24px_rgba(34,211,238,0.2)]" />
            <div>
              <div className="text-lg font-black text-cyan-300 leading-tight">FinanceiroAI</div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Neuro Finance Bot</p>
            </div>
          </div>
          <div className="text-sm text-slate-400 mt-2 truncate">{tenant.name}</div>
          <div className="inline-block mt-3 text-xs bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 px-2 py-0.5 rounded-full">
            {tenant.plan}
          </div>
        </div>

        <div className="flex-1">{renderNavLinks()}</div>

        <div className="p-4 border-t border-cyan-500/15 space-y-2">
          <div className="flex items-center justify-between px-4">
            <span className="text-xs text-slate-500">Aparência</span>
            <ThemeToggle />
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-300 hover:bg-rose-500/15 hover:text-rose-300 w-full transition-colors"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 m-0 md:m-4 md:ml-4 overflow-auto">
        <div className="md:hidden sticky top-0 z-30 border-b border-cyan-500/15 bg-slate-950/90 backdrop-blur px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-[0.22em]">Painel Financeiro</p>
            <p className="text-sm font-semibold text-cyan-200">{currentSection}</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
            <aside
              className="absolute right-0 top-0 h-full w-80 max-w-[85vw] border-l border-cyan-500/20 bg-slate-900/95 backdrop-blur-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-cyan-500/15">
                <div className="flex items-center gap-3">
                  <Image src="/financeiroai-logo.svg" alt="FinanceiroAI" width={42} height={42} className="rounded-xl shadow-[0_6px_18px_rgba(34,211,238,0.18)]" />
                  <div>
                    <div className="text-base font-black text-cyan-300">FinanceiroAI</div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Neuro Finance Bot</p>
                  </div>
                </div>
                <div className="text-sm text-slate-400 mt-1 truncate">{tenant.name}</div>
                <div className="inline-block mt-2 text-xs bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 px-2 py-0.5 rounded-full">
                  {tenant.plan}
                </div>
              </div>
              <div className="flex-1">{renderNavLinks(true)}</div>
              <div className="p-4 border-t border-cyan-500/15">
                <button
                  onClick={logout}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-300 hover:bg-rose-500/15 hover:text-rose-300 w-full transition-colors"
                >
                  <LogOut size={18} />
                  Sair
                </button>
              </div>
            </aside>
          </div>
        )}

        <div className="hidden md:flex items-center justify-between px-6 py-4 border-b border-cyan-500/15 rounded-t-3xl bg-slate-900/70 backdrop-blur-xl">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-[0.22em]">Painel Financeiro</p>
            <p className="text-lg font-bold text-cyan-200">{currentSection}</p>
          </div>
          <div className="text-xs text-slate-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-3 py-1">
            Conta: {tenant.name}
          </div>
        </div>

        <div key={pathname} className="page-enter rounded-none md:rounded-b-3xl bg-slate-950/35 min-h-[calc(100vh-72px)] md:min-h-[calc(100vh-7rem)]">
          {children}
        </div>
      </main>
      </div>
    </div>
  )
}
