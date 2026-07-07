'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useAnimatedNumber } from '@/lib/useAnimatedNumber'
import AnimatedCurrency from '@/components/AnimatedCurrency'
import OnboardingGuide from '@/components/OnboardingGuide'
import { useAuth } from '@/contexts/AuthContext'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Target, CalendarClock, HeartPulse, PiggyBank, Smile, Meh, Frown, Plus, Trash2, CreditCard, Wallet, QrCode, FileText, Rocket } from 'lucide-react'

interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline?: string
}

interface PurchaseSimulation {
  canAfford: boolean
  description: string
  amount: number
  currentMonthlySavings: number
  projectedMonthlySavings: number
  goalDelayMonths: number | null
  message: string
}

interface NotificationSettings {
  timezone: string
  remindersEnabled: boolean
  remindersHour: number
  dailyDigestEnabled: boolean
  dailyDigestHour: number
  weeklyDigestEnabled: boolean
  weeklyDigestWeekday: number
  weeklyDigestHour: number
  cashflowAlertEnabled: boolean
  lastRemindersSentAt?: string | null
  lastDailyDigestSentAt?: string | null
  lastWeeklyDigestSentAt?: string | null
}

interface SystemHealth {
  status: 'ok' | 'degraded'
  checkedAt: string
  server: {
    env: string
    uptimeSec: number
    memory: { rss: number; heapUsed: number; heapTotal: number }
    nodeVersion: string
  }
  database: {
    status: 'ok' | 'error'
    error?: string
  }
  openai: {
    configured: boolean
    mode: string
  }
  whatsapp: {
    enabled: boolean
    runtime: {
      activeCount: number
      connectedCount: number
      qrPendingCount: number
    }
    tenantSessions: Array<{
      id: string
      phoneNumber: string
      isActive: boolean
      connectedAt?: string | null
    }>
    repairAudit: Array<{
      at: string
      sessionId: string
      phoneNumber: string
      outcome: 'STARTED' | 'SUCCESS' | 'FAILED'
      error?: string
      actor?: { id: string; email: string; plan: string } | null
    }>
    repairLimit: {
      used: number
      remaining: number
      limit: number
      periodStart: string
    }
  }
}

interface Summary {
  currentMonth: string
  balance: { accounts: any[]; total: number }
  cashFlow: { income: number; expenses: number; profit: number }
  payable: { items: any[]; total: number }
  receivable: { items: any[]; total: number }
  family: {
    mood: 'EXCELLENT' | 'ATTENTION' | 'CAREFUL'
    health: {
      allBillsUpToDate: boolean
      overdueCount: number
      dueTodayCount: number
      savedVsLastMonth: number
    }
    goal: {
      id: string
      name: string
      targetAmount: number
      currentAmount: number
      remaining: number
      progress: number
      monthsToGoal: number | null
      deadline?: string
    } | null
    savings: {
      target: number
      saved: number
      progress: number
    }
    topSpending: Array<{ name: string; amount: number }>
    dailyDigest: {
      totalSpentToday: number
      transactions: Array<{ id: string; description: string; amount: number; category: string; paymentMethod?: 'PIX' | 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' }>
    }
  }
}

type ReportPeriod = 'CURRENT_MONTH' | 'LAST_3_MONTHS' | 'LAST_12_MONTHS'

const PAYMENT_METHOD_META: Record<string, { label: string; icon: any; className: string }> = {
  PIX: { label: 'PIX', icon: QrCode, className: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
  CASH: { label: 'Dinheiro', icon: Wallet, className: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  CREDIT_CARD: { label: 'Cartao credito', icon: CreditCard, className: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  DEBIT_CARD: { label: 'Cartao debito', icon: CreditCard, className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
}

const getPaymentMethodMeta = (method?: string) => PAYMENT_METHOD_META[method || 'CASH'] || PAYMENT_METHOD_META.CASH

const COLORS = ['#22c55e','#3b82f6','#f97316','#a855f7','#ec4899','#eab308','#14b8a6','#ef4444']

export default function DashboardPage() {
  const { logout } = useAuth()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [evolution, setEvolution] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [teamReport, setTeamReport] = useState<any>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [goalForm, setGoalForm] = useState({ name: '', targetAmount: '', currentAmount: '' })
  const [simAmount, setSimAmount] = useState('')
  const [simResult, setSimResult] = useState<PurchaseSimulation | null>(null)
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [repairingSessionId, setRepairingSessionId] = useState<string | null>(null)
  const [repairQr, setRepairQr] = useState<string | null>(null)
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null)
  const [accountForm, setAccountForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
  const [accountMessage, setAccountMessage] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [totalBalanceInput, setTotalBalanceInput] = useState('')
  const [savingTotalBalance, setSavingTotalBalance] = useState(false)
  const [totalBalanceMessage, setTotalBalanceMessage] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [exportingReport, setExportingReport] = useState(false)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('CURRENT_MONTH')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(true)

  function parseCurrencyInput(value: string) {
    const cleaned = String(value || '').replace(/\s/g, '').replace(/R\$/gi, '')
    if (!cleaned) return NaN

    const hasComma = cleaned.includes(',')
    if (hasComma) {
      const normalized = cleaned.replace(/\./g, '').replace(',', '.')
      return Number(normalized)
    }

    return Number(cleaned)
  }

  useEffect(() => {
    async function load() {
      try {
        const [s, e, c, t, g, ns] = await Promise.all([
          api.get('/dashboard/summary'),
          api.get('/dashboard/evolution?months=6'),
          api.get('/dashboard/categories'),
          api.get('/users/team-report'),
          api.get('/dashboard/goals'),
          api.get('/dashboard/notification-settings'),
        ])
        setSummary(s.data)
        setTotalBalanceInput(String(Number(s.data?.balance?.total || 0).toFixed(2)).replace('.', ','))
        setEvolution(e.data)
        setCategories(c.data)
        setTeamReport(t.data)
        setGoals(g.data)
        setSettings(ns.data)
        await loadDiagnostics()
      } catch {}
      setLoading(false)
    }
    load()
  }, [])

  async function reloadSummary() {
    const { data } = await api.get('/dashboard/summary')
    setSummary(data)
    setTotalBalanceInput(String(Number(data?.balance?.total || 0).toFixed(2)).replace('.', ','))
  }

  async function loadDiagnostics() {
    try {
      const { data } = await api.get('/dashboard/system/health')
      setSystemHealth(data)
      setDiagnosticError(null)
    } catch (error: any) {
      setDiagnosticError(error?.response?.data?.error || 'Nao foi possivel carregar diagnostico.')
    }
  }

  async function reloadGoals() {
    const { data } = await api.get('/dashboard/goals')
    setGoals(data)
  }

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault()
    if (!goalForm.name || !goalForm.targetAmount) return

    await api.post('/dashboard/goals', {
      name: goalForm.name,
      targetAmount: Number(goalForm.targetAmount),
      currentAmount: Number(goalForm.currentAmount || 0)
    })

    setGoalForm({ name: '', targetAmount: '', currentAmount: '' })
    await reloadGoals()
  }

  async function handleUpdateGoalProgress(goalId: string, value: number) {
    await api.patch(`/dashboard/goals/${goalId}`, { currentAmount: value })
    await reloadGoals()
  }

  async function handleDeleteGoal(goalId: string) {
    await api.delete(`/dashboard/goals/${goalId}`)
    await reloadGoals()
  }

  async function handleSimulatePurchase(e: React.FormEvent) {
    e.preventDefault()
    if (!simAmount) return
    const { data } = await api.post('/dashboard/simulate-purchase', {
      amount: Number(simAmount),
      description: 'Simulacao no dashboard'
    })
    setSimResult(data)
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSavingSettings(true)
    try {
      const { data } = await api.put('/dashboard/notification-settings', settings)
      setSettings(data)
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleUpdateTotalBalance(e: React.FormEvent) {
    e.preventDefault()
    setTotalBalanceMessage('')

    const parsed = parseCurrencyInput(totalBalanceInput)
    if (!Number.isFinite(parsed)) {
      setTotalBalanceMessage('Informe um valor valido. Exemplo: 1250,50')
      return
    }

    setSavingTotalBalance(true)
    try {
      await api.patch('/dashboard/accounts/total-balance', { totalBalance: parsed })
      await reloadSummary()
      setTotalBalanceMessage('Saldo total atualizado com sucesso.')
    } catch (error: any) {
      setTotalBalanceMessage(error?.response?.data?.error || 'Nao foi possivel atualizar o saldo total.')
    } finally {
      setSavingTotalBalance(false)
    }
  }

  async function handleRepairSession(sessionId: string) {
    const acceptedStep1 = window.confirm('Essa acao vai resetar credenciais locais da sessao e gerar novo QR. Deseja continuar?')
    if (!acceptedStep1) return

    const confirmation = window.prompt('Digite REPARAR para confirmar:')
    if (confirmation !== 'REPARAR') {
      setDiagnosticError('Confirmacao invalida. Reparo cancelado.')
      return
    }

    setRepairingSessionId(sessionId)
    setRepairQr(null)
    try {
      const { data } = await api.post(`/whatsapp/sessions/${sessionId}/repair`)
      setRepairQr(data.qrCode || null)
      await loadDiagnostics()
    } catch (error: any) {
      setDiagnosticError(error?.response?.data?.error || 'Falha ao reparar sessao WhatsApp.')
    } finally {
      setRepairingSessionId(null)
    }
  }

  function getRecentMonthKeys(count: number) {
    const now = new Date()
    return Array.from({ length: count }, (_, index) => {
      const d = new Date(now.getFullYear(), now.getMonth() - index, 1)
      const month = String(d.getMonth() + 1).padStart(2, '0')
      return `${d.getFullYear()}-${month}`
    })
  }

  function formatMonthKeyToPtBr(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  async function handleExportPdfReport() {
    setReportMessage('')
    setExportingReport(true)

    try {
      const currentSummary = summary
      if (!currentSummary) {
        setReportMessage('Resumo ainda nao carregado. Tente novamente em alguns segundos.')
        return
      }

      const [{ jsPDF }] = await Promise.all([import('jspdf')])

      const loadLogoDataUrl = async () => {
        try {
          const response = await fetch('/icon')
          if (!response.ok) return null
          const blob = await response.blob()
          return await new Promise<string | null>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          })
        } catch {
          return null
        }
      }

      let reportPeriodLabel = currentSummary.currentMonth
      let reportIncome = Number(currentSummary.cashFlow.income || 0)
      let reportExpenses = Number(currentSummary.cashFlow.expenses || 0)
      let reportProfit = Number(currentSummary.cashFlow.profit || 0)
      let reportTopSpending: Array<{ name: string; amount: number }> = currentSummary.family.topSpending
      let reportCategories: Array<{ name: string; total: number }> = categories
      let reportEvolution: Array<{ month: string; income: number; expenses: number }> = evolution
      let moodLabel = currentSummary.family.mood === 'EXCELLENT'
        ? 'Excelente'
        : currentSummary.family.mood === 'ATTENTION'
          ? 'Atencao'
          : 'Cuidado'

      if (reportPeriod !== 'CURRENT_MONTH') {
        const monthsCount = reportPeriod === 'LAST_3_MONTHS' ? 3 : 12
        const monthKeys = getRecentMonthKeys(monthsCount)

        const [cashflows, categoriesByMonth, expensesByMonth, evolutionData] = await Promise.all([
          Promise.all(monthKeys.map((month) => api.get(`/dashboard/cashflow?month=${month}`).then((r) => r.data))),
          Promise.all(monthKeys.map((month) => api.get(`/dashboard/categories?month=${month}`).then((r) => r.data))),
          Promise.all(monthKeys.map((month) => api.get(`/dashboard/transactions?month=${month}&type=EXPENSE&limit=500&page=1`).then((r) => r.data?.transactions || []))),
          api.get(`/dashboard/evolution?months=${monthsCount}`).then((r) => r.data),
        ])

        reportIncome = cashflows.reduce((sum: number, item: any) => sum + Number(item?.income || 0), 0)
        reportExpenses = cashflows.reduce((sum: number, item: any) => sum + Number(item?.expenses || 0), 0)
        reportProfit = reportIncome - reportExpenses

        const categoryTotals = new Map<string, number>()
        categoriesByMonth.flat().forEach((item: any) => {
          const key = String(item?.name || 'Sem categoria')
          const value = Number(item?.total || 0)
          categoryTotals.set(key, (categoryTotals.get(key) || 0) + value)
        })
        reportCategories = Array.from(categoryTotals.entries())
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)

        const spendingTotals = new Map<string, number>()
        expensesByMonth.flat().forEach((tx: any) => {
          const key = String(tx?.description || 'Despesa sem descricao')
          const value = Number(tx?.amount || 0)
          spendingTotals.set(key, (spendingTotals.get(key) || 0) + value)
        })
        reportTopSpending = Array.from(spendingTotals.entries())
          .map(([name, amount]) => ({ name, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 8)

        reportEvolution = evolutionData

        const oldest = monthKeys[monthKeys.length - 1]
        const newest = monthKeys[0]
        reportPeriodLabel = `${formatMonthKeyToPtBr(oldest)} a ${formatMonthKeyToPtBr(newest)}`
        moodLabel = reportProfit >= 0 ? 'Excelente' : reportProfit > -(reportIncome * 0.15) ? 'Atencao' : 'Cuidado'
      }

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const marginX = 44
      const contentWidth = pageWidth - marginX * 2
      const now = new Date()
      const generatedAt = now.toLocaleString('pt-BR')
      const logoDataUrl = await loadLogoDataUrl()

      let y = 56

      const writeLine = (label: string, value: string, addGap = 20) => {
        doc.setFont('helvetica', 'bold')
        doc.text(label, marginX, y)
        doc.setFont('helvetica', 'normal')
        doc.text(value, marginX + 180, y)
        y += addGap
      }

      const ensureRoom = (requiredHeight = 26) => {
        if (y + requiredHeight <= 780) return
        doc.addPage()
        y = 56
      }

      // Capa
      doc.setFillColor(8, 16, 32)
      doc.rect(0, 0, pageWidth, pageHeight, 'F')
      doc.setFillColor(6, 182, 212)
      doc.roundedRect(40, 60, pageWidth - 80, 6, 3, 3, 'F')
      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, 'PNG', 46, 86, 56, 56)
        } catch {}
      }
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(26)
      doc.text('FinanceiroAI', logoDataUrl ? 114 : 46, 116)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(13)
      doc.text('Relatorio Executivo Financeiro', logoDataUrl ? 114 : 46, 138)
      doc.setFontSize(12)
      doc.setTextColor(186, 230, 253)
      doc.text(`Periodo analisado: ${reportPeriodLabel}`, 46, 196)
      doc.text(`Gerado em: ${generatedAt}`, 46, 218)
      doc.setTextColor(203, 213, 225)
      doc.setFontSize(11)
      doc.text('Este documento resume fluxo de caixa, gastos e indicadores de saude financeira.', 46, 272)
      doc.text('Use como apoio para decisoes de curto e medio prazo da familia.', 46, 292)
      doc.setTextColor(148, 163, 184)
      doc.text('FinanceiroAI • Relatorio confidencial', 46, pageHeight - 44)

      // Conteudo
      doc.addPage()

      doc.setFillColor(15, 23, 42)
      doc.roundedRect(marginX, 28, contentWidth, 88, 10, 10, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Relatorio Financeiro', marginX + 16, 60)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`Periodo: ${reportPeriodLabel}`, marginX + 16, 82)
      doc.text(`Gerado em: ${generatedAt}`, marginX + 16, 98)

      y = 146
      doc.setTextColor(22, 28, 36)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Resumo do periodo', marginX, y)
      y += 24
      doc.setFontSize(11)

      writeLine('Saldo total atual:', formatCurrency(currentSummary.balance.total))
      writeLine('Entradas no periodo:', formatCurrency(reportIncome))
      writeLine('Saidas no periodo:', formatCurrency(reportExpenses))
      writeLine('Resultado no periodo:', formatCurrency(reportProfit))
      writeLine('Humor financeiro:', moodLabel)
      writeLine('A pagar:', formatCurrency(currentSummary.payable.total))
      writeLine('A receber:', formatCurrency(currentSummary.receivable.total))

      ensureRoom(48)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Top gastos', marginX, y)
      y += 20
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')

      if (reportTopSpending.length === 0) {
        doc.text('Sem gastos no periodo.', marginX, y)
        y += 18
      } else {
        reportTopSpending.slice(0, 8).forEach((item, index) => {
          ensureRoom()
          doc.text(`${index + 1}. ${item.name}`, marginX, y)
          doc.text(formatCurrency(item.amount), pageWidth - marginX, y, { align: 'right' })
          y += 18
        })
      }

      ensureRoom(48)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Categorias do mes', marginX, y)
      y += 20
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')

      if (reportCategories.length === 0) {
        doc.text('Sem despesas categorizadas no periodo.', marginX, y)
        y += 18
      } else {
        reportCategories.slice(0, 10).forEach((cat: any, index: number) => {
          ensureRoom()
          doc.text(`${index + 1}. ${cat.name}`, marginX, y)
          doc.text(formatCurrency(Number(cat.total || 0)), pageWidth - marginX, y, { align: 'right' })
          y += 18
        })
      }

      ensureRoom(48)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Evolucao (ultimos meses)', marginX, y)
      y += 20
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')

      reportEvolution.forEach((row: any) => {
        ensureRoom()
        doc.text(String(row.month || '-'), marginX, y)
        doc.text(`Entradas ${formatCurrency(Number(row.income || 0))}`, marginX + 130, y)
        doc.text(`Saidas ${formatCurrency(Number(row.expenses || 0))}`, marginX + 300, y)
        y += 18
      })

      const totalPages = doc.getNumberOfPages()
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 116, 139)
        doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - 46, pageHeight - 20, { align: 'right' })
        if (page > 1) {
          doc.text('FinanceiroAI', 46, pageHeight - 20)
        }
      }

      const fileStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      doc.save(`relatorio-financeiro-${fileStamp}.pdf`)
      setReportMessage('Relatorio PDF gerado com sucesso.')
    } catch (error) {
      setReportMessage('Nao foi possivel gerar o PDF agora. Tente novamente.')
    } finally {
      setExportingReport(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setAccountMessage('')

    if (!accountForm.currentPassword || !accountForm.newPassword) {
      setAccountMessage('Preencha senha atual e nova senha.')
      return
    }

    if (accountForm.newPassword.length < 8) {
      setAccountMessage('A nova senha deve ter no minimo 8 caracteres.')
      return
    }

    const hasUpper = /[A-Z]/.test(accountForm.newPassword)
    const hasLower = /[a-z]/.test(accountForm.newPassword)
    const hasNumber = /\d/.test(accountForm.newPassword)
    const hasSymbol = /[^A-Za-z0-9]/.test(accountForm.newPassword)

    if (!hasUpper || !hasLower || !hasNumber || !hasSymbol) {
      setAccountMessage('Use senha forte: maiuscula, minuscula, numero e simbolo.')
      return
    }

    if (accountForm.newPassword !== accountForm.confirmNewPassword) {
      setAccountMessage('A confirmacao da nova senha nao confere.')
      return
    }

    setSavingAccount(true)
    try {
      await api.patch('/tenants/me', {
        currentPassword: accountForm.currentPassword,
        newPassword: accountForm.newPassword
      })

      setAccountForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
      setAccountMessage('Senha alterada com sucesso. Voce sera redirecionado para login.')
      setTimeout(() => {
        logout()
      }, 1200)
    } catch (error: any) {
      setAccountMessage(error?.response?.data?.error || 'Nao foi possivel alterar a senha.')
    } finally {
      setSavingAccount(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-gray-400">Carregando dashboard...</p>
    </div>
  )

  if (!summary) return null

  const now = new Date()
  const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' })
  const moodMap = {
    EXCELLENT: { label: 'Excelente', Icon: Smile, color: 'text-emerald-400', detail: 'Vocês estão no caminho certo.' },
    ATTENTION: { label: 'Atenção', Icon: Meh, color: 'text-amber-400', detail: 'Vale atenção em alguns gastos.' },
    CAREFUL: { label: 'Cuidado', Icon: Frown, color: 'text-rose-400', detail: 'Despesas acima do ideal.' }
  }
  const mood = moodMap[summary.family.mood]
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'

  // Componente de Card de Estatística Premium
  const PremiumStatCard = ({ label, value, icon: Icon, color, trend }: any) => {
    const colorClasses = {
      green: 'from-emerald-500/20 to-emerald-400/5 border-emerald-500/30 text-emerald-400',
      blue: 'from-blue-500/20 to-blue-400/5 border-blue-500/30 text-blue-400',
      red: 'from-red-500/20 to-red-400/5 border-red-500/30 text-red-400',
      cyan: 'from-cyan-500/20 to-cyan-400/5 border-cyan-500/30 text-cyan-400'
    }
    const classes = colorClasses[color as keyof typeof colorClasses] || colorClasses.cyan
    
    return (
      <div className={`bg-gradient-to-br ${classes} border rounded-xl p-4 md:p-6 backdrop-blur transition-all hover:border-opacity-100 duration-300`}>
        <div className="flex items-start justify-between mb-3">
          <div className="p-2.5 bg-white/5 rounded-lg">
            <Icon size={20} className="opacity-80" />
          </div>
          {trend && <span className={`text-xs font-semibold px-2 py-1 rounded-full ${trend > 0 ? 'text-emerald-400 bg-emerald-500/20' : 'text-red-400 bg-red-500/20'}`}>{trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%</span>}
        </div>
        <p className="text-xs text-white/60 font-medium tracking-wide mb-1">{label}</p>
        <p className="text-2xl md:text-3xl font-black text-white">
          <AnimatedCurrency value={value} />
        </p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <OnboardingGuide />
      {/* Animated Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-28 h-96 w-96 rounded-full bg-cyan-500/8 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-emerald-500/6 blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute bottom-0 left-1/2 h-80 w-80 rounded-full bg-blue-500/5 blur-3xl animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }} />
      </div>

      <div className="relative p-4 md:p-8">
        <div className="max-w-[1400px] mx-auto space-y-6">
          
          {/* Hero Section - Redesigned */}
          <div className="rounded-3xl p-6 md:p-8 border border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-cyan-950/30 to-slate-900/80 backdrop-blur-xl shadow-[0_20px_60px_rgba(6,182,212,0.1)]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex-1">
                <div className="inline-block mb-3 px-3 py-1 bg-cyan-500/15 border border-cyan-500/30 rounded-full">
                  <p className="text-cyan-300 text-xs font-semibold tracking-wider uppercase">{weekday} • {summary.currentMonth}</p>
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-white mt-3 leading-tight">
                  Bem-vindo ao seu Financeiro
                </h1>
                <p className="text-slate-300 mt-4 text-base">Seu saldo disponível agora é de <span className="text-emerald-300 font-bold text-lg">{formatCurrency(summary.balance.total)}</span></p>
              </div>
              <div className={`flex items-center justify-center w-32 h-32 rounded-2xl ${mood.color} bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10`}>
                <div className="text-center">
                  <mood.Icon size={48} className="mx-auto mb-2" />
                  <p className="text-sm font-bold">{mood.label}</p>
                </div>
              </div>
            </div>
            
            {/* Action Bar */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link
                href="/dashboard/transactions"
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/20 to-emerald-400/10 hover:border-emerald-400/60 hover:from-emerald-500/30 transition text-emerald-200 px-4 py-3 text-sm font-semibold"
              >
                <Plus size={18} />
                Novo Lançamento
              </Link>
              <button
                type="button"
                onClick={handleExportPdfReport}
                disabled={exportingReport}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-cyan-400/10 hover:border-cyan-400/60 hover:from-cyan-500/30 transition disabled:opacity-50 text-cyan-100 px-4 py-3 text-sm font-semibold"
              >
                <FileText size={18} />
                {exportingReport ? 'Gerando...' : 'Relatório PDF'}
              </button>
            </div>

            {/* Secondary Actions */}
            <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
              <form onSubmit={handleUpdateTotalBalance} className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={totalBalanceInput}
                  onChange={(e) => setTotalBalanceInput(e.target.value)}
                  placeholder="Ajustar saldo (ex: 1250,50)"
                  className="flex-1 bg-slate-800/50 border border-cyan-700/30 text-white rounded-lg px-4 py-2.5 text-sm placeholder-slate-400 focus:border-cyan-500/60 focus:outline-none transition"
                />
                <button
                  type="submit"
                  disabled={savingTotalBalance}
                  className="bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 disabled:opacity-60 text-slate-900 font-semibold rounded-lg px-4 py-2.5 text-sm transition"
                >
                  {savingTotalBalance ? '...' : 'Ajustar'}
                </button>
              </form>
              <select
                value={reportPeriod}
                onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
                className="bg-slate-800/50 border border-cyan-700/30 text-cyan-100 rounded-lg px-3 py-2.5 text-sm focus:border-cyan-500/60 focus:outline-none transition"
              >
                <option value="CURRENT_MONTH">Mês atual</option>
                <option value="LAST_3_MONTHS">3 últimos meses</option>
                <option value="LAST_12_MONTHS">12 últimos meses</option>
              </select>
            </div>
            {reportMessage && <p className={`text-xs mt-3 ${reportMessage.includes('sucesso') ? 'text-emerald-400' : 'text-red-400'}`}>{reportMessage}</p>}
            {totalBalanceMessage && <p className={`text-xs mt-2 ${totalBalanceMessage.includes('sucesso') ? 'text-emerald-400' : 'text-red-400'}`}>{totalBalanceMessage}</p>}
          </div>

          {/* Key Metrics - Premium Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PremiumStatCard
              label="Saldo Total"
              value={summary.balance.total}
              icon={DollarSign}
              color="green"
            />
            <PremiumStatCard
              label="Entradas do Mês"
              value={summary.cashFlow.income}
              icon={TrendingUp}
              color="blue"
            />
            <PremiumStatCard
              label="Saídas do Mês"
              value={summary.cashFlow.expenses}
              icon={TrendingDown}
              color="red"
            />
            <PremiumStatCard
              label="Resultado do Mês"
              value={summary.cashFlow.profit}
              icon={summary.cashFlow.profit >= 0 ? TrendingUp : TrendingDown}
              color={summary.cashFlow.profit >= 0 ? 'green' : 'red'}
            />
          </div>

          {/* Health & Goal Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className={`lg:col-span-1 p-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-slate-900 backdrop-blur`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <HeartPulse size={18} className="text-emerald-400" />
                </div>
                <h2 className="text-sm font-bold text-white">Saúde Financeira</h2>
              </div>
              <div className="space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${summary.family.health.allBillsUpToDate ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {summary.family.health.allBillsUpToDate ? 'Contas em dia' : `${summary.family.health.overdueCount} atrasadas`}
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${summary.family.health.dueTodayCount === 0 ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                  {summary.family.health.dueTodayCount > 0 ? `${summary.family.health.dueTodayCount} vencem hoje` : 'Nada vence hoje'}
                </div>
              </div>
            </div>

            <div className={`lg:col-span-1 p-6 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-slate-900 backdrop-blur`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Target size={18} className="text-blue-400" />
                </div>
                <h2 className="text-sm font-bold text-white">Objetivo</h2>
              </div>
              {summary.family.goal ? (
                <div className="space-y-2">
                  <p className="text-white font-semibold text-sm">{summary.family.goal.name}</p>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400" style={{ width: `${Math.min(summary.family.goal.progress, 100).toFixed(0)}%` }} />
                  </div>
                  <p className="text-xs text-slate-400">{summary.family.goal.progress.toFixed(0)}% • Faltam {formatCurrency(summary.family.goal.remaining)}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Crie uma meta para acompanhar</p>
              )}
            </div>

            <div className={`lg:col-span-1 p-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-slate-900 backdrop-blur`}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <PiggyBank size={18} className="text-emerald-400" />
                </div>
                <h2 className="text-sm font-bold text-white">Poupança</h2>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400">Economizado</span>
                  <span className="text-sm font-bold text-emerald-400">{formatCurrency(summary.family.savings.saved)}</span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${Math.min(summary.family.savings.progress, 100).toFixed(0)}%` }} />
                </div>
                <p className="text-xs text-slate-400">Meta: {formatCurrency(summary.family.savings.target)}</p>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className={`p-6 rounded-2xl border border-cyan-500/20 bg-slate-900/50 backdrop-blur`}>
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-cyan-600 rounded-full" />
              Evolução Mensal
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={evolution}>
                <defs>
                  <linearGradient id="income" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="expenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="month" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  formatter={(v: any) => formatCurrency(v as number)}
                />
                <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                <Area type="monotone" dataKey="income" name="Entradas" stroke="#10b981" fill="url(#income)" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" name="Saídas" stroke="#f87171" fill="url(#expenses)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Team Section */}
          {teamReport && teamReport.members.length > 1 && (
            <div className={`p-6 rounded-2xl border border-cyan-500/20 bg-slate-900/50 backdrop-blur`}>
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-cyan-600 rounded-full" />
                Lançamentos por Pessoa
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {teamReport.members.map((m: any) => (
                  <div key={m.userId} className="bg-gradient-to-br from-slate-800/50 to-slate-900 rounded-xl p-4 border border-cyan-500/10">
                    <div className="text-slate-400 text-xs font-semibold mb-2">{m.name}</div>
                    <div className="text-emerald-400 font-bold text-sm">{formatCurrency(m.totalIncome)}</div>
                    <div className="text-red-400 text-xs">{formatCurrency(m.totalExpense)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`p-6 ${panelClass}`}>
          <h2 className="text-lg font-semibold text-white mb-4">🥧 Gastos do Mes</h2>
          {categories.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={categories} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="total" nameKey="name" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => formatCurrency(v as number)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-16">Nenhuma despesa este mês</p>
          )}
        </div>

        <div className="space-y-4">
          <div className={`p-6 ${panelClass}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">🔴 A Pagar</h2>
              <AnimatedCurrency value={summary.payable.total} className="text-red-400 font-bold" />
            </div>
            {summary.payable.items.slice(0, 4).map((p: any) => (
              <div key={p.id} className="flex justify-between text-sm py-2 border-b border-gray-800 last:border-0">
                <span className="text-gray-300">{p.description}</span>
                <div className="text-right">
                  <div className="text-red-400">{formatCurrency(p.amount)}</div>
                  <div className="text-gray-500 text-xs">{new Date(p.dueDate).toLocaleDateString('pt-BR')}</div>
                </div>
              </div>
            ))}
            {summary.payable.items.length === 0 && <p className="text-gray-500 text-sm">Nenhuma conta pendente ✅</p>}
          </div>

          <div className={`p-6 ${panelClass}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">🟢 A Receber</h2>
              <AnimatedCurrency value={summary.receivable.total} className="text-green-400 font-bold" />
            </div>
            {summary.receivable.items.slice(0, 4).map((p: any) => (
              <div key={p.id} className="flex justify-between text-sm py-2 border-b border-gray-800 last:border-0">
                <span className="text-gray-300">{p.description}</span>
                <span className="text-green-400">{formatCurrency(p.amount)}</span>
              </div>
            ))}
            {summary.receivable.items.length === 0 && <p className="text-gray-500 text-sm">Nenhum valor a receber</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`p-6 ${panelClass}`}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown size={18} className="text-orange-400" />
            <h2 className="text-lg font-semibold text-white">Top Gastos Familiares</h2>
          </div>
          <div className="space-y-2">
            {summary.family.topSpending.length > 0 ? summary.family.topSpending.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm border-b border-gray-800 pb-2">
                <span className="text-gray-300">{item.name}</span>
                <span className="text-white font-medium">{formatCurrency(item.amount)}</span>
              </div>
            )) : <p className="text-sm text-gray-500">Sem gastos no periodo.</p>}
          </div>
        </div>

        <div className={`p-6 ${panelClass}`}>
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock size={18} className="text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Resumo de Hoje</h2>
          </div>
          <p className="text-sm text-gray-300 mb-3">Total gasto hoje: <span className="text-white font-semibold">{formatCurrency(summary.family.dailyDigest.totalSpentToday)}</span></p>
          <div className="space-y-2">
            {summary.family.dailyDigest.transactions.length > 0 ? summary.family.dailyDigest.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between text-sm border-b border-gray-800 pb-2">
                <div>
                  <p className="text-gray-200">{tx.description}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <p className="text-xs text-gray-500">{tx.category}</p>
                    <PaymentMethodChip method={tx.paymentMethod} />
                  </div>
                </div>
                <span className="text-red-400">{formatCurrency(tx.amount)}</span>
              </div>
            )) : <p className="text-sm text-gray-500">Sem lancamentos hoje.</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`p-6 ${panelClass}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Sonhos da Familia</h2>
          </div>

          <form onSubmit={handleAddGoal} className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
            <input
              value={goalForm.name}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Comprar casa"
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
              required
            />
            <input
              type="number"
              min="1"
              value={goalForm.targetAmount}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, targetAmount: e.target.value }))}
              placeholder="Meta (R$)"
              className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
              required
            />
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={goalForm.currentAmount}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, currentAmount: e.target.value }))}
                placeholder="Ja guardado"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg px-3 py-2">
                <Plus size={16} />
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {goals.length === 0 ? (
              <p className="text-sm text-gray-500">Cadastre sua primeira meta familiar.</p>
            ) : goals.map((goal) => {
              const progress = goal.targetAmount > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0
              return (
                <div key={goal.id} className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-white font-medium text-sm">{goal.name}</p>
                      <p className="text-xs text-gray-400">{formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteGoal(goal.id)}
                      className="text-gray-500 hover:text-red-400"
                      title="Excluir meta"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="w-full h-2 bg-gray-700 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${progress}%` }} />
                  </div>
                  <input
                    type="number"
                    min="0"
                    defaultValue={goal.currentAmount}
                    onBlur={(e) => handleUpdateGoalProgress(goal.id, Number(e.target.value || 0))}
                    className="mt-2 w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-2 py-1 text-xs"
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className={`p-6 ${panelClass}`}>
          <h2 className="text-lg font-semibold text-white mb-4">Coach IA: Posso comprar?</h2>
          <form onSubmit={handleSimulatePurchase} className="flex gap-2 mb-4">
            <input
              type="number"
              min="1"
              value={simAmount}
              onChange={(e) => setSimAmount(e.target.value)}
              placeholder="Valor da compra (R$)"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
              required
            />
            <button type="submit" className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold px-4 rounded-lg">Simular</button>
          </form>

          {simResult ? (
            <div className="space-y-2 text-sm">
              <p className={`${simResult.canAfford ? 'text-emerald-400' : 'text-rose-400'} font-semibold`}>{simResult.canAfford ? 'Pode.' : 'Cuidado.'}</p>
              <p className="text-gray-300">{simResult.message}</p>
              <p className="text-gray-400">Economia atual: <span className="text-white">{formatCurrency(simResult.currentMonthlySavings)}</span></p>
              <p className="text-gray-400">Economia projetada: <span className="text-white">{formatCurrency(simResult.projectedMonthlySavings)}</span></p>
              {simResult.goalDelayMonths !== null && (
                <p className="text-gray-400">Impacto na meta principal: <span className="text-white">atraso estimado de {simResult.goalDelayMonths} mes(es)</span></p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Digite um valor para receber recomendacao personalizada de impacto na meta.</p>
          )}
        </div>
      </div>

      <div className={`p-6 ${panelClass}`}>
        <h2 className="text-lg font-semibold text-white mb-4">🏦 Contas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summary.balance.accounts.map((acc: any) => (
            <div key={acc.id} className="bg-gray-800 rounded-xl p-4">
              <div className="text-gray-400 text-sm">{acc.type === 'CASH' ? '💵' : '🏦'} {acc.name}</div>
              <div className={`text-lg font-bold mt-1 ${acc.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                {formatCurrency(acc.balance)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`p-6 ${panelClass}`}>
        <h2 className="text-lg font-semibold text-white mb-4">Notificacoes da Familia</h2>

        {!settings ? (
          <p className="text-sm text-gray-500">Carregando configuracoes...</p>
        ) : (
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center justify-between bg-gray-800 rounded-lg p-3 text-sm">
                <span className="text-gray-300">Lembretes de contas</span>
                <input type="checkbox" checked={settings.remindersEnabled} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, remindersEnabled: e.target.checked }) : prev)} />
              </label>
              <label className="flex items-center justify-between bg-gray-800 rounded-lg p-3 text-sm">
                <span className="text-gray-300">Alerta de caixa negativo</span>
                <input type="checkbox" checked={settings.cashflowAlertEnabled} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, cashflowAlertEnabled: e.target.checked }) : prev)} />
              </label>
              <label className="flex items-center justify-between bg-gray-800 rounded-lg p-3 text-sm">
                <span className="text-gray-300">Resumo diario</span>
                <input type="checkbox" checked={settings.dailyDigestEnabled} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, dailyDigestEnabled: e.target.checked }) : prev)} />
              </label>
              <label className="flex items-center justify-between bg-gray-800 rounded-lg p-3 text-sm">
                <span className="text-gray-300">Resumo semanal</span>
                <input type="checkbox" checked={settings.weeklyDigestEnabled} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, weeklyDigestEnabled: e.target.checked }) : prev)} />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Fuso horario</p>
                <select value={settings.timezone} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, timezone: e.target.value }) : prev)} className="w-full bg-gray-900 border border-gray-700 text-white rounded px-2 py-1 text-sm">
                  <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                  <option value="America/Manaus">America/Manaus</option>
                  <option value="America/Belem">America/Belem</option>
                  <option value="America/Fortaleza">America/Fortaleza</option>
                  <option value="America/Cuiaba">America/Cuiaba</option>
                </select>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Hora lembretes (0-23)</p>
                <input type="number" min="0" max="23" value={settings.remindersHour} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, remindersHour: Number(e.target.value) }) : prev)} className="w-full bg-gray-900 border border-gray-700 text-white rounded px-2 py-1 text-sm" />
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Hora resumo diario (0-23)</p>
                <input type="number" min="0" max="23" value={settings.dailyDigestHour} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, dailyDigestHour: Number(e.target.value) }) : prev)} className="w-full bg-gray-900 border border-gray-700 text-white rounded px-2 py-1 text-sm" />
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Hora resumo semanal (0-23)</p>
                <input type="number" min="0" max="23" value={settings.weeklyDigestHour} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, weeklyDigestHour: Number(e.target.value) }) : prev)} className="w-full bg-gray-900 border border-gray-700 text-white rounded px-2 py-1 text-sm" />
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-3 max-w-xs">
              <p className="text-xs text-gray-400 mb-1">Dia resumo semanal</p>
              <select value={settings.weeklyDigestWeekday} onChange={(e) => setSettings((prev) => prev ? ({ ...prev, weeklyDigestWeekday: Number(e.target.value) }) : prev)} className="w-full bg-gray-900 border border-gray-700 text-white rounded px-2 py-1 text-sm">
                <option value={0}>Domingo</option>
                <option value={1}>Segunda</option>
                <option value={2}>Terca</option>
                <option value={3}>Quarta</option>
                <option value={4}>Quinta</option>
                <option value={5}>Sexta</option>
                <option value={6}>Sabado</option>
              </select>
            </div>

            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Ultimos envios</p>
              <div className="text-xs text-gray-300 space-y-1">
                <p>Lembretes: {settings.lastRemindersSentAt ? new Date(settings.lastRemindersSentAt).toLocaleString('pt-BR') : 'nunca'}</p>
                <p>Resumo diario: {settings.lastDailyDigestSentAt ? new Date(settings.lastDailyDigestSentAt).toLocaleString('pt-BR') : 'nunca'}</p>
                <p>Resumo semanal: {settings.lastWeeklyDigestSentAt ? new Date(settings.lastWeeklyDigestSentAt).toLocaleString('pt-BR') : 'nunca'}</p>
              </div>
            </div>

            <button type="submit" disabled={savingSettings} className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-semibold px-4 py-2 rounded-lg">
              {savingSettings ? 'Salvando...' : 'Salvar configuracoes'}
            </button>
          </form>
        )}
      </div>

      <div className={`p-6 ${panelClass}`}>
        <h2 className="text-lg font-semibold text-white mb-4">Minha Conta</h2>

        <form onSubmit={handleChangePassword} className="space-y-3 max-w-xl">
          <div>
            <label className="text-xs text-gray-400">Senha atual</label>
            <div className="mt-1 flex gap-2">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={accountForm.currentPassword}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
                required
              />
              <button type="button" onClick={() => setShowCurrentPassword((v) => !v)} className="bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-xs">
                {showCurrentPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">Nova senha</label>
            <div className="mt-1 flex gap-2">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={accountForm.newPassword}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
                required
              />
              <button type="button" onClick={() => setShowNewPassword((v) => !v)} className="bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-xs">
                {showNewPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Requisitos: 8+ caracteres, maiuscula, minuscula, numero e simbolo.</p>
          </div>

          <div>
            <label className="text-xs text-gray-400">Confirmar nova senha</label>
            <div className="mt-1 flex gap-2">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={accountForm.confirmNewPassword}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, confirmNewPassword: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm"
                required
              />
              <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-xs">
                {showConfirmPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          {accountMessage && (
            <p className={`text-sm ${accountMessage.toLowerCase().includes('sucesso') ? 'text-emerald-400' : 'text-rose-400'}`}>
              {accountMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={savingAccount}
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-semibold px-4 py-2 rounded-lg"
          >
            {savingAccount ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>
      </div>

      <div className={`p-6 space-y-4 ${panelClass}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Diagnostico do Sistema</h2>
          <button
            type="button"
            onClick={loadDiagnostics}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-2 rounded-lg"
          >
            Atualizar
          </button>
        </div>

        {diagnosticError && (
          <p className="text-sm text-rose-400">{diagnosticError}</p>
        )}

        {!systemHealth ? (
          <p className="text-sm text-gray-500">Carregando diagnostico...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-400">Backend</p>
                <p className={`${systemHealth.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'} font-semibold`}>
                  {systemHealth.status === 'ok' ? 'Saudavel' : 'Degradado'}
                </p>
                <p className="text-gray-500 text-xs mt-1">Uptime: {Math.floor(systemHealth.server.uptimeSec / 60)} min</p>
              </div>

              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-400">Banco</p>
                <p className={`${systemHealth.database.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'} font-semibold`}>
                  {systemHealth.database.status === 'ok' ? 'Conectado' : 'Erro'}
                </p>
                {systemHealth.database.error && <p className="text-rose-400 text-xs mt-1">{systemHealth.database.error}</p>}
              </div>

              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-400">IA</p>
                <p className="text-white font-semibold">{systemHealth.openai.mode}</p>
                <p className="text-gray-500 text-xs mt-1">OpenAI {systemHealth.openai.configured ? 'configurada' : 'nao configurada'}</p>
              </div>
            </div>

            {!systemHealth.whatsapp.enabled ? (
              <div className="bg-gray-800 rounded-lg p-3 text-sm">
                <p className="text-gray-300 mb-1">Canal de Automacao</p>
                <p className="text-emerald-400 font-semibold">Modo app-only ativo</p>
                <p className="text-gray-500 text-xs mt-1">WhatsApp desativado. Use lancamentos manuais em "Lancamentos".</p>
              </div>
            ) : (
              <>
                <div className="bg-gray-800 rounded-lg p-3 text-sm">
                  <p className="text-gray-300 mb-2">WhatsApp Runtime</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    <p className="text-gray-400">Ativas: <span className="text-white">{systemHealth.whatsapp.runtime.activeCount}</span></p>
                    <p className="text-gray-400">Conectadas: <span className="text-emerald-400">{systemHealth.whatsapp.runtime.connectedCount}</span></p>
                    <p className="text-gray-400">Aguardando QR: <span className="text-amber-400">{systemHealth.whatsapp.runtime.qrPendingCount}</span></p>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    <p>
                      Reparo diario: <span className="text-white">{systemHealth.whatsapp.repairLimit.used}/{systemHealth.whatsapp.repairLimit.limit}</span>
                      {' '}({systemHealth.whatsapp.repairLimit.remaining} restante{systemHealth.whatsapp.repairLimit.remaining === 1 ? '' : 's'})
                    </p>
                    <p>Janela iniciada em {new Date(systemHealth.whatsapp.repairLimit.periodStart).toLocaleString('pt-BR')}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-gray-300">Sessoes do Tenant</p>
                  {systemHealth.whatsapp.tenantSessions.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma sessao cadastrada.</p>
                  ) : systemHealth.whatsapp.tenantSessions.map((session) => (
                    <div key={session.id} className="bg-gray-800 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="text-sm text-white">{session.phoneNumber}</p>
                        <p className="text-xs text-gray-400">
                          {session.isActive ? 'Ativa' : 'Inativa'}
                          {session.connectedAt ? ` • conectada em ${new Date(session.connectedAt).toLocaleString('pt-BR')}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRepairSession(session.id)}
                        disabled={repairingSessionId === session.id}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-semibold px-3 py-2 rounded-lg text-xs"
                      >
                        {repairingSessionId === session.id ? 'Reparando...' : 'Reparar sessao'}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-gray-800 rounded-lg p-3">
                  <p className="text-sm text-gray-300 mb-2">Auditoria de Reparo (ultimos eventos)</p>
                  {systemHealth.whatsapp.repairAudit.length === 0 ? (
                    <p className="text-xs text-gray-500">Nenhum reparo registrado nesta execucao.</p>
                  ) : (
                    <div className="space-y-2">
                      {systemHealth.whatsapp.repairAudit.slice(0, 8).map((item, idx) => (
                        <div key={`${item.at}-${item.sessionId}-${idx}`} className="text-xs text-gray-300 border-b border-gray-700 pb-2 last:border-0">
                          <p>
                            <span className={`${item.outcome === 'SUCCESS' ? 'text-emerald-400' : item.outcome === 'FAILED' ? 'text-rose-400' : 'text-amber-400'} font-semibold`}>
                              {item.outcome}
                            </span>
                            {' '}• {item.phoneNumber} • {new Date(item.at).toLocaleString('pt-BR')}
                          </p>
                          {item.actor?.email && <p className="text-gray-500">por {item.actor.email}</p>}
                          {item.error && <p className="text-rose-400">erro: {item.error}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {repairQr && (
                  <div className="bg-gray-800 rounded-lg p-3">
                    <p className="text-sm text-gray-300 mb-2">Novo QR de reparo</p>
                    <img src={repairQr} alt="QR Code de reparo" className="w-64 h-64 bg-white p-2 rounded" />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
    </div>
  )
}

function PaymentMethodChip({ method }: { method?: string }) {
  const meta = getPaymentMethodMeta(method)
  const Icon = meta.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${meta.className}`}>
      <Icon size={10} />
      {meta.label}
    </span>
  )
}

function StatCard({ label, numericValue, icon, color }: { label: string; numericValue: number; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    blue: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25',
    red: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
    yellow: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  }
  const animatedValue = useAnimatedNumber(numericValue)

  return (
    <div className="dashboard-panel rounded-2xl p-6 border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_10px_30px_rgba(2,8,23,0.4)]">
      <div className={`inline-flex p-2 rounded-lg mb-3 border ${colors[color]}`}>{icon}</div>
      <div className="text-slate-400 text-xs uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-black mt-1 ${color === 'red' ? 'text-rose-300' : 'text-white'}`}>{formatCurrency(animatedValue)}</div>
    </div>
  )
}

