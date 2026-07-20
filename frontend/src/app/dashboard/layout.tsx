'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import api from '@/lib/api'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ArrowUpDown, Settings, LogOut, TrendingUp, Menu, X, ReceiptText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ThemeToggle from '@/components/ThemeToggle'

const defaultNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/transactions', label: 'Lançamentos', icon: ArrowUpDown },
  { href: '/dashboard/bills', label: 'Faturas', icon: ReceiptText },
  { href: '/dashboard/cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
  { href: '/dashboard/settings', label: 'Configuração', icon: Settings },
]

const businessNavItems = [
  { href: '/dashboard', label: 'Empresa', icon: LayoutDashboard },
  { href: '/dashboard/transactions', label: 'Operações', icon: ArrowUpDown },
  { href: '/dashboard/bills', label: 'Faturas', icon: ReceiptText },
  { href: '/dashboard/cashflow', label: 'Fluxo de Caixa', icon: TrendingUp },
  { href: '/dashboard/whatsapp', label: 'WhatsApp', icon: Menu },
  { href: '/dashboard/settings', label: 'Configuração', icon: Settings },
]

type BusinessProfile = {
  cnpj: string
  businessName: string
  logoUrl: string
  completed: boolean
  updatedAt?: string | null
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { tenant, logout, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isBusinessPlan = String(tenant?.plan || '').toUpperCase() === 'EMPRESA'
  const [businessProfileLoading, setBusinessProfileLoading] = useState(false)
  const [businessProfileDone, setBusinessProfileDone] = useState(false)
  const [businessProfileError, setBusinessProfileError] = useState('')
  const [businessProfileSaving, setBusinessProfileSaving] = useState(false)
  const [businessProfileForm, setBusinessProfileForm] = useState({
    cnpj: '',
    businessName: '',
    logoUrl: ''
  })

  const navItems = useMemo(
    () => (isBusinessPlan ? businessNavItems : defaultNavItems),
    [isBusinessPlan]
  )

  useEffect(() => {
    if (!loading && !tenant) router.replace('/login')
  }, [tenant, loading, router])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    let active = true

    async function loadBusinessProfile() {
      if (!isBusinessPlan || !tenant) {
        if (active) {
          setBusinessProfileDone(true)
          setBusinessProfileError('')
        }
        return
      }

      setBusinessProfileLoading(true)
      setBusinessProfileError('')

      try {
        const { data } = await api.get<BusinessProfile>('/tenants/business-profile')
        if (!active) return

        setBusinessProfileForm({
          cnpj: String(data?.cnpj || ''),
          businessName: String(data?.businessName || ''),
          logoUrl: String(data?.logoUrl || '')
        })
        setBusinessProfileDone(Boolean(data?.completed))
      } catch (err: any) {
        if (!active) return
        setBusinessProfileError(err?.response?.data?.error || 'Falha ao carregar cadastro empresarial.')
        setBusinessProfileDone(false)
      } finally {
        if (active) setBusinessProfileLoading(false)
      }
    }

    loadBusinessProfile()

    return () => {
      active = false
    }
  }, [isBusinessPlan, tenant?.id])

  async function handleSaveBusinessProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusinessProfileSaving(true)
    setBusinessProfileError('')

    try {
      const payload = {
        cnpj: businessProfileForm.cnpj,
        businessName: businessProfileForm.businessName,
        logoUrl: businessProfileForm.logoUrl
      }

      await api.put('/tenants/business-profile', payload)
      setBusinessProfileDone(true)
    } catch (err: any) {
      setBusinessProfileError(err?.response?.data?.error || 'Nao foi possivel salvar o cadastro empresarial.')
    } finally {
      setBusinessProfileSaving(false)
    }
  }

  const isNavItemActive = (href: string) => {
    if (href === '/dashboard') return pathname === href
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const currentSection = useMemo(() => {
    const found = navItems.find((item) => isNavItemActive(item.href))
    return found?.label ?? 'Dashboard'
  }, [pathname])

  if (loading || !tenant) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Carregando...</p>
    </div>
  }

  if (isBusinessPlan && (businessProfileLoading || !businessProfileDone)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl rounded-3xl border border-emerald-500/25 bg-slate-900/85 p-7 shadow-[0_20px_60px_rgba(2,8,23,0.55)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-300/80">Onboarding Empresarial</p>
          <h1 className="mt-2 text-2xl font-black text-white">Complete os dados da empresa</h1>
          <p className="mt-2 text-sm text-slate-400">Preencha CNPJ, nome e logo para liberar o painel empresarial.</p>

          {businessProfileError && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {businessProfileError}
            </div>
          )}

          {businessProfileLoading ? (
            <p className="mt-5 text-sm text-slate-400">Carregando dados...</p>
          ) : (
            <form onSubmit={handleSaveBusinessProfile} className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-sm text-slate-300">CNPJ</label>
                <input
                  type="text"
                  value={businessProfileForm.cnpj}
                  onChange={(e) => setBusinessProfileForm((prev) => ({ ...prev, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-300">Nome da empresa</label>
                <input
                  type="text"
                  value={businessProfileForm.businessName}
                  onChange={(e) => setBusinessProfileForm((prev) => ({ ...prev, businessName: e.target.value }))}
                  placeholder="Razao social ou nome fantasia"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-300">Logo (URL)</label>
                <input
                  type="url"
                  value={businessProfileForm.logoUrl}
                  onChange={(e) => setBusinessProfileForm((prev) => ({ ...prev, logoUrl: e.target.value }))}
                  placeholder="https://.../logo.png"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={businessProfileSaving}
                className="mt-2 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-600 py-2.5 text-sm font-semibold text-white hover:from-emerald-400 hover:to-cyan-500 disabled:opacity-60"
              >
                {businessProfileSaving ? 'Salvando...' : 'Salvar e entrar no painel empresa'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  const renderNavLinks = (mobile = false) => (
    <nav className={cn('space-y-1', mobile ? 'p-4' : 'p-4')}>
      {navItems.map(({ href, label, icon: Icon }, index) => {
        const active = isNavItemActive(href)
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

  const accountDisplayName = isBusinessPlan && businessProfileForm.businessName
    ? businessProfileForm.businessName
    : tenant.name

  const accountCnpj = isBusinessPlan ? businessProfileForm.cnpj : ''

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
            {isBusinessPlan && businessProfileForm.logoUrl ? (
              <img src={businessProfileForm.logoUrl} alt="Logo da empresa" className="h-[52px] w-[52px] rounded-2xl object-cover shadow-[0_8px_24px_rgba(34,211,238,0.2)]" />
            ) : (
              <Image src="/financeiroai-logo.svg?v=20260709r1" alt="FinanceiroAI" width={52} height={52} className="rounded-2xl shadow-[0_8px_24px_rgba(34,211,238,0.2)]" />
            )}
            <div>
              <div className="text-lg font-black text-cyan-300 leading-tight">FinanceiroAI</div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Neuro Finance Bot</p>
            </div>
          </div>
          <div className="text-sm text-slate-400 mt-2 truncate">{accountDisplayName}</div>
          {accountCnpj && <div className="text-[11px] text-slate-500 mt-1">CNPJ: {accountCnpj}</div>}
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

      <main className="flex-1 m-0 md:m-4 md:ml-4 overflow-x-hidden overflow-y-auto pb-28 md:pb-0">
        <div
          className="md:hidden sticky top-0 z-30 border-b border-cyan-500/15 bg-slate-950/90 backdrop-blur px-4 pb-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(var(--safe-area-inset-top) + 8px)' }}
        >
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-[0.22em]">{isBusinessPlan ? 'Painel Empresarial' : 'Painel Financeiro'}</p>
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
                  {isBusinessPlan && businessProfileForm.logoUrl ? (
                    <img src={businessProfileForm.logoUrl} alt="Logo da empresa" className="h-[42px] w-[42px] rounded-xl object-cover shadow-[0_6px_18px_rgba(34,211,238,0.18)]" />
                  ) : (
                    <Image src="/financeiroai-logo.svg?v=20260709r1" alt="FinanceiroAI" width={42} height={42} className="rounded-xl shadow-[0_6px_18px_rgba(34,211,238,0.18)]" />
                  )}
                  <div>
                    <div className="text-base font-black text-cyan-300">FinanceiroAI</div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Neuro Finance Bot</p>
                  </div>
                </div>
                <div className="text-sm text-slate-400 mt-1 truncate">{accountDisplayName}</div>
                {accountCnpj && <div className="text-[11px] text-slate-500 mt-1">CNPJ: {accountCnpj}</div>}
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
            <p className="text-xs text-slate-500 uppercase tracking-[0.22em]">{isBusinessPlan ? 'Painel Empresarial' : 'Painel Financeiro'}</p>
            <p className="text-lg font-bold text-cyan-200">{currentSection}</p>
          </div>
          <div className="flex items-center gap-2">
            {isBusinessPlan && (
              <span className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-full px-3 py-1">
                Modo Empresa
              </span>
            )}
            <div className="text-xs text-slate-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-3 py-1">
              Conta: {accountDisplayName}
            </div>
          </div>
        </div>

        <div key={pathname} className="page-enter rounded-none md:rounded-b-3xl bg-slate-950/35 min-h-[calc(100vh-72px)] md:min-h-[calc(100vh-7rem)]">
          {children}
        </div>
      </main>
      </div>

      <div
        className="md:hidden fixed z-40 rounded-2xl border border-cyan-500/30 bg-slate-900/90 px-2 py-2 backdrop-blur-xl shadow-[0_16px_38px_rgba(2,8,23,0.65)]"
        style={{
          left: 'var(--safe-area-inset-left)',
          right: 'var(--safe-area-inset-right)',
          bottom: 'var(--safe-area-inset-bottom)'
        }}
      >
        <div className="grid grid-cols-5 gap-1.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isNavItemActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center text-[9px] font-medium transition-all',
                  active
                    ? 'border-cyan-400/35 bg-cyan-400/18 text-cyan-100 shadow-[0_8px_20px_rgba(34,211,238,0.18)]'
                    : 'border-transparent text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
                )}
              >
                <Icon size={16} />
                <span className="line-clamp-2 leading-tight">{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

