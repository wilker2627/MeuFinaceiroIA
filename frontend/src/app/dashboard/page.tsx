'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useAnimatedNumber } from '@/lib/useAnimatedNumber'
import AnimatedCurrency from '@/components/AnimatedCurrency'
import OnboardingGuide from '@/components/OnboardingGuide'
import AIInsights from '@/components/AIInsights'
import GoalsWidget from '@/components/GoalsWidget'
import RecurringTransactions from '@/components/RecurringTransactions'
import { useAuth } from '@/contexts/AuthContext'
import { subscribeDashboardRefresh } from '@/lib/dashboardRefresh'
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
    recentEntries?: Array<{ id: string; description: string; amount: number; date: string; paymentMethod: string; category: string }>
    recentExpenses?: Array<{ id: string; description: string; amount: number; date: string; paymentMethod: string; category: string }>
  }
}

type ReportPeriod = 'CURRENT_MONTH' | 'LAST_3_MONTHS' | 'LAST_12_MONTHS'

type DisplayMood = 'EXCELLENT' | 'ATTENTION' | 'CAREFUL'

type LoadMetricSample = {
  source: 'bootstrap' | 'legacy'
  serverMs: number | null
  clientMs: number | null
  at: number
}

const DASHBOARD_LOAD_HISTORY_STORAGE_KEY = 'dashboard-load-history-v1'

const PERSON_TAG_REGEX = /\|\s*Pessoa:\s*(.+)$/i
const CARD_TAG_REGEX = /\|\s*Cartao:\s*([^|]+)/i

function extractPersonFromDescription(description?: string) {
  const match = String(description || '').match(PERSON_TAG_REGEX)
  return match?.[1]?.trim() || ''
}

function cleanDescription(description?: string) {
  return String(description || '')
    .replace(CARD_TAG_REGEX, '')
    .replace(PERSON_TAG_REGEX, '')
    .trim()
}

const PAYMENT_METHOD_META: Record<string, { label: string; icon: any; className: string }> = {
  PIX: { label: 'PIX', icon: QrCode, className: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
  CASH: { label: 'Dinheiro', icon: Wallet, className: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  CREDIT_CARD: { label: 'Cartao credito', icon: CreditCard, className: 'text-violet-300 border-violet-500/30 bg-violet-500/10' },
  DEBIT_CARD: { label: 'Cartao debito', icon: CreditCard, className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
}

const getPaymentMethodMeta = (method?: string) => PAYMENT_METHOD_META[method || 'CASH'] || PAYMENT_METHOD_META.CASH

const COLORS = ['#22c55e','#3b82f6','#f97316','#a855f7','#ec4899','#eab308','#14b8a6','#ef4444']

function deriveDisplayMood(summary: Summary): DisplayMood {
  const balance = Number(summary.balance?.total || 0)
  const profit = Number(summary.cashFlow?.profit || 0)
  const income = Number(summary.cashFlow?.income || 0)
  const payable = Number(summary.payable?.total || 0)
  const overdueCount = Number(summary.family?.health?.overdueCount || 0)
  const dueTodayCount = Number(summary.family?.health?.dueTodayCount || 0)

  if (balance < 0 || overdueCount > 0 || (income > 0 && profit < -(income * 0.2))) {
    return 'CAREFUL'
  }

  if (dueTodayCount > 0 || profit < 0 || (payable > 0 && balance < payable * 0.5)) {
    return 'ATTENTION'
  }

  return 'EXCELLENT'
}

function getMoodLabel(mood: DisplayMood) {
  if (mood === 'EXCELLENT') return 'Excelente'
  if (mood === 'ATTENTION') return 'Em observação'
  return 'Cuidado'
}

export default function DashboardPage() {
  const { tenant, logout } = useAuth()
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
  const [savingsInput, setSavingsInput] = useState('')
  const [savingsTargetInput, setSavingsTargetInput] = useState('')
  const [surplusTransferInput, setSurplusTransferInput] = useState('')
  const [withdrawSavingsInput, setWithdrawSavingsInput] = useState('')
  const [savingSavings, setSavingSavings] = useState(false)
  const [savingsMessage, setSavingsMessage] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [exportingReport, setExportingReport] = useState(false)
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('CURRENT_MONTH')
  const [recentEntries, setRecentEntries] = useState<Array<{ id: string; description: string; amount: number; category: string; paymentMethod?: string }>>([])
  const [recentExpenses, setRecentExpenses] = useState<Array<{ id: string; description: string; amount: number; category: string; paymentMethod?: string }>>([])
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [nextMonthCardBill, setNextMonthCardBill] = useState<{ month: string; total: number; items: any[] }>({ month: '', total: 0, items: [] })
  const [loadMetrics, setLoadMetrics] = useState<{ source: 'bootstrap' | 'legacy'; serverMs: number | null; clientMs: number | null } | null>(null)
  const [loadHistory, setLoadHistory] = useState<LoadMetricSample[]>([])
  const dashboardLoadInFlightRef = useRef(false)
  const dashboardLastLoadAtRef = useRef(0)
  const diagnosticsLastLoadAtRef = useRef(0)

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

  function clearLoadHistory() {
    setLoadHistory([])
    setLoadMetrics(null)

    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(DASHBOARD_LOAD_HISTORY_STORAGE_KEY)
    } catch {
      // Ignore storage limitations.
    }
  }

  async function loadDashboardData(force = false) {
    const clientStart = Date.now()
    const nowTs = Date.now()
    if (!force && dashboardLoadInFlightRef.current) return
    if (!force && nowTs - dashboardLastLoadAtRef.current < 900) return

    dashboardLoadInFlightRef.current = true
    dashboardLastLoadAtRef.current = nowTs
    setLoading(true)
    setLoadError('')

    try {
      try {
        const bootstrapResponse = await api.get('/dashboard/bootstrap?months=6')
        const bootstrapData = bootstrapResponse?.data

        if (bootstrapData?.summary) {
          const serverHeaderMs = Number(bootstrapResponse?.headers?.['x-bootstrap-duration-ms'])
          const payloadServerMs = Number(bootstrapData?.metrics?.durationMs)
          const serverMs = Number.isFinite(serverHeaderMs)
            ? serverHeaderMs
            : (Number.isFinite(payloadServerMs) ? payloadServerMs : null)

          setSummary(bootstrapData.summary)
          setTotalBalanceInput(String(Number(bootstrapData?.summary?.balance?.total || 0).toFixed(2)).replace('.', ','))
          setEvolution(Array.isArray(bootstrapData?.evolution) ? bootstrapData.evolution : [])
          setCategories(Array.isArray(bootstrapData?.categories) ? bootstrapData.categories : [])
          setTeamReport(bootstrapData?.teamReport || null)
          setGoals(Array.isArray(bootstrapData?.goals) ? bootstrapData.goals : [])
          setSettings(bootstrapData?.settings || null)

          const monthKey = String(bootstrapData?.nextMonthCardBill?.monthKey || '')
          setNextMonthCardBill({
            month: monthKey ? formatMonthKeyToPtBr(monthKey) : '',
            total: Number(bootstrapData?.nextMonthCardBill?.total || 0),
            items: Array.isArray(bootstrapData?.nextMonthCardBill?.items) ? bootstrapData.nextMonthCardBill.items : []
          })

          const bootstrapRecentEntries = Array.isArray(bootstrapData?.recentEntries)
            ? bootstrapData.recentEntries
            : (Array.isArray(bootstrapData?.summary?.family?.recentEntries) ? bootstrapData.summary.family.recentEntries : [])

          setRecentEntries(bootstrapRecentEntries.map((tx: any) => ({
            id: tx.id,
            description: cleanDescription(tx.description),
            amount: Number(tx.amount || 0),
            category: tx.category?.name || tx.category || 'Outros',
            paymentMethod: tx.paymentMethod || 'CASH',
          })))

          const bootstrapRecentExpenses = Array.isArray(bootstrapData?.recentExpenses)
            ? bootstrapData.recentExpenses
            : (Array.isArray(bootstrapData?.summary?.family?.recentExpenses) ? bootstrapData.summary.family.recentExpenses : [])

          setRecentExpenses(bootstrapRecentExpenses.map((tx: any) => ({
            id: tx.id,
            description: cleanDescription(tx.description),
            amount: Number(tx.amount || 0),
            category: tx.category?.name || tx.category || 'Outros',
            paymentMethod: tx.paymentMethod || 'CASH',
          })))

          if (force || Date.now() - diagnosticsLastLoadAtRef.current > 60000) {
            await loadDiagnostics()
            diagnosticsLastLoadAtRef.current = Date.now()
          }

          setLoadMetrics({
            source: 'bootstrap',
            serverMs,
            clientMs: Date.now() - clientStart
          })
          setLoadHistory((prev) => [
            ...prev.slice(-9),
            {
              source: 'bootstrap',
              serverMs,
              clientMs: Date.now() - clientStart,
              at: Date.now()
            }
          ])

          return
        }
      } catch {
        // Fallback para fluxo legado durante rollout de backend
      }

      try {
        const { data } = await api.get('/dashboard/summary')
        setSummary(data)
        setTotalBalanceInput(String(Number(data?.balance?.total || 0).toFixed(2)).replace('.', ','))
      } catch (error: any) {
        setSummary(null)
        setLoadError(error?.response?.data?.error || 'Nao foi possivel carregar os dados principais do dashboard.')
        return
      }

      const now = new Date()
      const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const nextMonthKey = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`

      const [evolutionRes, categoriesRes, teamRes, goalsRes, settingsRes, nextMonthCardBillRes] = await Promise.allSettled([
        api.get('/dashboard/evolution?months=6'),
        api.get('/dashboard/categories'),
        api.get('/users/team-report'),
        api.get('/dashboard/goals'),
        api.get('/dashboard/notification-settings'),
        api.get(`/dashboard/transactions?month=${nextMonthKey}&type=EXPENSE&paymentMethod=CREDIT_CARD&limit=300&page=1`),
      ])

      const [recentEntriesRes, recentExpensesRes] = await Promise.allSettled([
        api.get('/dashboard/transactions?type=INCOME&limit=5&page=1'),
        api.get('/dashboard/transactions?type=EXPENSE&limit=5&page=1'),
      ])

      if (evolutionRes.status === 'fulfilled') setEvolution(evolutionRes.value.data)
      else setEvolution([])

      if (categoriesRes.status === 'fulfilled') setCategories(categoriesRes.value.data)
      else setCategories([])

      if (teamRes.status === 'fulfilled') setTeamReport(teamRes.value.data)
      else setTeamReport(null)

      if (goalsRes.status === 'fulfilled') setGoals(goalsRes.value.data)
      else setGoals([])

      if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.data)
      else setSettings(null)

      if (nextMonthCardBillRes.status === 'fulfilled') {
        const txs = (nextMonthCardBillRes.value.data?.transactions || [])
          .filter((tx: any) => tx?.type === 'EXPENSE' && tx?.paymentMethod === 'CREDIT_CARD')
          .sort((a: any, b: any) => {
            const aTime = new Date(a?.dueDate || a?.date || 0).getTime()
            const bTime = new Date(b?.dueDate || b?.date || 0).getTime()
            return aTime - bTime
          })
        const total = txs.reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0)
        setNextMonthCardBill({
          month: formatMonthKeyToPtBr(nextMonthKey),
          total,
          items: txs.slice(0, 6),
        })
      } else {
        setNextMonthCardBill({ month: formatMonthKeyToPtBr(nextMonthKey), total: 0, items: [] })
      }

      if (recentEntriesRes.status === 'fulfilled') {
        setRecentEntries((recentEntriesRes.value.data?.transactions || []).map((tx: any) => ({
          id: tx.id,
          description: cleanDescription(tx.description),
          amount: Number(tx.amount || 0),
          category: tx.category?.name || 'Outros',
          paymentMethod: tx.paymentMethod || 'CASH',
        })))
      } else {
        setRecentEntries([])
      }

      if (recentExpensesRes.status === 'fulfilled') {
        setRecentExpenses((recentExpensesRes.value.data?.transactions || []).map((tx: any) => ({
          id: tx.id,
          description: cleanDescription(tx.description),
          amount: Number(tx.amount || 0),
          category: tx.category?.name || 'Outros',
          paymentMethod: tx.paymentMethod || 'CASH',
        })))
      } else {
        setRecentExpenses([])
      }

      if (force || Date.now() - diagnosticsLastLoadAtRef.current > 60000) {
        await loadDiagnostics()
        diagnosticsLastLoadAtRef.current = Date.now()
      }

      setLoadMetrics({
        source: 'legacy',
        serverMs: null,
        clientMs: Date.now() - clientStart
      })
      setLoadHistory((prev) => [
        ...prev.slice(-9),
        {
          source: 'legacy',
          serverMs: null,
          clientMs: Date.now() - clientStart,
          at: Date.now()
        }
      ])
    } finally {
      dashboardLoadInFlightRef.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(DASHBOARD_LOAD_HISTORY_STORAGE_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return

      const normalized = parsed
        .filter((item) => item && (item.source === 'bootstrap' || item.source === 'legacy'))
        .map((item) => ({
          source: item.source,
          serverMs: Number.isFinite(Number(item.serverMs)) ? Number(item.serverMs) : null,
          clientMs: Number.isFinite(Number(item.clientMs)) ? Number(item.clientMs) : null,
          at: Number.isFinite(Number(item.at)) ? Number(item.at) : Date.now()
        }))
        .slice(-10)

      if (normalized.length > 0) {
        setLoadHistory(normalized)
        const last = normalized[normalized.length - 1]
        setLoadMetrics({
          source: last.source,
          serverMs: last.serverMs,
          clientMs: last.clientMs
        })
      }
    } catch {
      // Ignore localStorage corruption and continue with fresh metrics.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(DASHBOARD_LOAD_HISTORY_STORAGE_KEY, JSON.stringify(loadHistory.slice(-10)))
    } catch {
      // Ignore storage quota/private mode issues.
    }
  }, [loadHistory])

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      loadDashboardData()
    })
  }, [])

  useEffect(() => {
    if (!summary) return

    const goal = goals.find((item) => /poupanc?a/i.test(String(item.name || '')))
    const saved = Number(goal?.currentAmount ?? summary.family.savings.saved ?? 0)
    const target = Math.max(Number(goal?.targetAmount ?? summary.family.savings.target ?? 0), 1)

    setSavingsInput(String(Number(saved).toFixed(2)).replace('.', ','))
    setSavingsTargetInput(String(Number(target).toFixed(2)).replace('.', ','))
  }, [summary, goals])

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

  function getSavingsGoal() {
    return goals.find((goal) => /poupanc?a/i.test(String(goal.name || '')))
  }

  async function ensureSavingsGoal() {
    const existing = getSavingsGoal()
    if (existing) return existing

    const suggestedTarget = Math.max(Number(summary?.family?.savings?.target || 0), 5000)
    const { data } = await api.post('/dashboard/goals', {
      name: 'Poupanca Familiar',
      targetAmount: suggestedTarget,
      currentAmount: 0,
    })

    setGoals((prev) => [...prev, data])
    return data
  }

  async function handleSetSavingsBalance(e: React.FormEvent) {
    e.preventDefault()
    setSavingsMessage('')

    const parsedCurrent = parseCurrencyInput(savingsInput)
    if (!Number.isFinite(parsedCurrent) || parsedCurrent < 0) {
      setSavingsMessage('Informe um saldo valido para a poupanca. Exemplo: 3500,00')
      return
    }

    const parsedTarget = parseCurrencyInput(savingsTargetInput)
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setSavingsMessage('Informe uma meta valida para a poupanca. Exemplo: 10000,00')
      return
    }

    setSavingSavings(true)
    try {
      const savingsGoal = await ensureSavingsGoal()
      await api.patch(`/dashboard/goals/${savingsGoal.id}`, {
        currentAmount: parsedCurrent,
        targetAmount: parsedTarget,
      })
      await reloadGoals()
      setSavingsMessage('Poupanca editada com sucesso.')
    } catch (error: any) {
      setSavingsMessage(error?.response?.data?.error || 'Nao foi possivel editar a poupanca.')
    } finally {
      setSavingSavings(false)
    }
  }

  async function handleSaveSurplusToSavings() {
    setSavingsMessage('')

    if (!summary) {
      setSavingsMessage('Resumo ainda nao carregado.')
      return
    }

    const profit = Number(summary.cashFlow?.profit || 0)
    if (profit <= 0) {
      setSavingsMessage('Nao ha sobra neste mes para guardar na poupanca.')
      return
    }

    const parsed = parseCurrencyInput(surplusTransferInput)
    const amountToSave = Number.isFinite(parsed) ? parsed : profit

    if (amountToSave <= 0) {
      setSavingsMessage('Informe um valor maior que zero para guardar.')
      return
    }

    if (amountToSave > profit) {
      setSavingsMessage(`A sobra disponivel neste mes e ${formatCurrency(profit)}.`)
      return
    }

    setSavingSavings(true)
    try {
      const savingsGoal = await ensureSavingsGoal()
      const updatedAmount = Number(savingsGoal.currentAmount || 0) + amountToSave
      await api.patch(`/dashboard/goals/${savingsGoal.id}`, { currentAmount: updatedAmount })
      await reloadGoals()
      setSurplusTransferInput('')
      setSavingsMessage(`Guardado ${formatCurrency(amountToSave)} na poupanca.`)
    } catch (error: any) {
      setSavingsMessage(error?.response?.data?.error || 'Nao foi possivel guardar a sobra na poupanca.')
    } finally {
      setSavingSavings(false)
    }
  }

  async function handleWithdrawFromSavings() {
    setSavingsMessage('')

    if (!summary) {
      setSavingsMessage('Resumo ainda nao carregado.')
      return
    }

    const savingsGoal = getSavingsGoal()
    if (!savingsGoal) {
      setSavingsMessage('Ainda nao existe poupanca cadastrada para retirada.')
      return
    }

    const available = Number(savingsGoal.currentAmount || 0)
    if (available <= 0) {
      setSavingsMessage('Nao ha saldo na poupanca para retirar.')
      return
    }

    const negativeBalance = Math.max(-Number(summary.balance?.total || 0), 0)
    const parsed = parseCurrencyInput(withdrawSavingsInput)
    const defaultAmount = negativeBalance > 0 ? negativeBalance : available
    const amountToWithdraw = Number.isFinite(parsed) ? parsed : defaultAmount

    if (amountToWithdraw <= 0) {
      setSavingsMessage('Informe um valor maior que zero para retirar.')
      return
    }

    if (amountToWithdraw > available) {
      setSavingsMessage(`Voce tem ${formatCurrency(available)} disponivel na poupanca.`)
      return
    }

    setSavingSavings(true)
    try {
      const updatedSavings = available - amountToWithdraw
      await api.patch(`/dashboard/goals/${savingsGoal.id}`, { currentAmount: updatedSavings })

      const newTotalBalance = Number(summary.balance?.total || 0) + amountToWithdraw
      await api.patch('/dashboard/accounts/total-balance', { totalBalance: newTotalBalance })

      await Promise.all([reloadGoals(), reloadSummary()])
      setWithdrawSavingsInput('')
      setSavingsMessage(`Retirado ${formatCurrency(amountToWithdraw)} da poupanca para cobrir saldo.`)
    } catch (error: any) {
      setSavingsMessage(error?.response?.data?.error || 'Nao foi possivel retirar da poupanca.')
    } finally {
      setSavingSavings(false)
    }
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
      let reportIncomeDetails: Array<{ date: string; description: string; amount: number; category: string; paymentMethod: string; person: string }> = []
      let reportExpenseDetails: Array<{ date: string; description: string; amount: number; category: string; paymentMethod: string; person: string }> = []
      let moodLabel = getMoodLabel(deriveDisplayMood(currentSummary))
      const nowRef = new Date()
      const currentMonthKey = `${nowRef.getFullYear()}-${String(nowRef.getMonth() + 1).padStart(2, '0')}`

      const normalizeTxDetails = (transactions: any[]) => {
        return (transactions || [])
          .map((tx: any) => ({
            date: (tx?.type === 'EXPENSE' && tx?.isPaid === false && tx?.dueDate)
              ? new Date(tx.dueDate).toLocaleDateString('pt-BR')
              : (tx?.date ? new Date(tx.date).toLocaleDateString('pt-BR') : '-'),
            description: cleanDescription(tx?.description) || 'Sem descricao',
            amount: Number(tx?.amount || 0),
            category: String(tx?.category?.name || 'Sem categoria'),
            paymentMethod: String(tx?.paymentMethod || 'CASH'),
            person: String(tx?.user?.name || tx?.from?.name || tx?.to?.name || extractPersonFromDescription(tx?.description) || 'Nao informado'),
            rawDate: (tx?.type === 'EXPENSE' && tx?.isPaid === false && tx?.dueDate)
              ? new Date(tx.dueDate).getTime()
              : (tx?.date ? new Date(tx.date).getTime() : 0),
          }))
          .sort((a: any, b: any) => b.rawDate - a.rawDate)
      }

      const currentMonthDetails = await Promise.all([
        api.get(`/dashboard/transactions?month=${currentMonthKey}&type=INCOME&limit=300&page=1`).then((r) => r.data?.transactions || []).catch(() => []),
        api.get(`/dashboard/transactions?month=${currentMonthKey}&type=EXPENSE&limit=300&page=1`).then((r) => r.data?.transactions || []).catch(() => []),
      ])

      reportIncomeDetails = normalizeTxDetails(currentMonthDetails[0])
      reportExpenseDetails = normalizeTxDetails(currentMonthDetails[1])

      if (reportPeriod !== 'CURRENT_MONTH') {
        const monthsCount = reportPeriod === 'LAST_3_MONTHS' ? 3 : 12
        const monthKeys = getRecentMonthKeys(monthsCount)

        const [cashflows, categoriesByMonth, incomesByMonth, expensesByMonth, evolutionData] = await Promise.all([
          Promise.all(monthKeys.map((month) => api.get(`/dashboard/cashflow?month=${month}`).then((r) => r.data))),
          Promise.all(monthKeys.map((month) => api.get(`/dashboard/categories?month=${month}`).then((r) => r.data))),
          Promise.all(monthKeys.map((month) => api.get(`/dashboard/transactions?month=${month}&type=INCOME&limit=300&page=1`).then((r) => r.data?.transactions || []))),
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

        reportIncomeDetails = normalizeTxDetails(incomesByMonth.flat())
        reportExpenseDetails = normalizeTxDetails(expensesByMonth.flat())

        reportEvolution = evolutionData

        const oldest = monthKeys[monthKeys.length - 1]
        const newest = monthKeys[0]
        reportPeriodLabel = `${formatMonthKeyToPtBr(oldest)} a ${formatMonthKeyToPtBr(newest)}`
        moodLabel = reportProfit >= 0 ? 'Excelente' : reportProfit > -(reportIncome * 0.15) ? 'Em observacao' : 'Cuidado'
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

      const writeTransactionDetails = (
        title: string,
        items: Array<{ date: string; description: string; amount: number; category: string; paymentMethod: string; person: string }>,
        emptyText: string,
      ) => {
        ensureRoom(48)
        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        doc.text(title, marginX, y)
        y += 20
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')

        if (items.length === 0) {
          doc.text(emptyText, marginX, y)
          y += 18
          return
        }

        const maxRows = 40
        const shownItems = items.slice(0, maxRows)
        shownItems.forEach((item, index) => {
          ensureRoom(44)
          const titleText = `${index + 1}. ${item.date} - ${item.description}`
          const wrapped = doc.splitTextToSize(titleText, contentWidth - 120)
          doc.text(wrapped, marginX, y)
          doc.text(formatCurrency(item.amount), pageWidth - marginX, y, { align: 'right' })
          y += wrapped.length * 13

          ensureRoom(22)
          doc.setFontSize(9)
          doc.setTextColor(71, 85, 105)
          doc.text(`Categoria: ${item.category} | Pagamento: ${item.paymentMethod} | Pessoa: ${item.person}`, marginX + 14, y)
          doc.setTextColor(22, 28, 36)
          doc.setFontSize(11)
          y += 14
        })

        if (items.length > maxRows) {
          ensureRoom(22)
          doc.setFontSize(10)
          doc.setTextColor(71, 85, 105)
          doc.text(`Mostrando ${maxRows} de ${items.length} registros.`, marginX, y)
          doc.setTextColor(22, 28, 36)
          doc.setFontSize(11)
          y += 16
        }
      }

      writeTransactionDetails('Detalhamento de entradas', reportIncomeDetails, 'Sem entradas no periodo.')
      writeTransactionDetails('Detalhamento de saidas', reportExpenseDetails, 'Sem saidas no periodo.')

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

  if (!summary) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="rounded-2xl border border-rose-500/30 bg-slate-900/80 p-6 text-center max-w-md">
          <p className="text-rose-300 font-semibold">Nao foi possivel carregar o dashboard.</p>
          <p className="text-slate-400 text-sm mt-2">{loadError || 'Tente novamente em alguns instantes.'}</p>
          <button
            type="button"
            onClick={() => loadDashboardData(true)}
            className="mt-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-4 py-2"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const now = new Date()
  const isBusinessPlan = String(tenant?.plan || '').toUpperCase() === 'EMPRESA'
  const currentDateLabel = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
  const moodMap = {
    EXCELLENT: { label: 'Excelente', Icon: Smile, color: 'text-emerald-400', detail: 'Vocês estão no caminho certo.' },
    ATTENTION: { label: 'Em observação', Icon: Meh, color: 'text-amber-400', detail: 'Alguns gastos pedem ajuste.' },
    CAREFUL: { label: 'Cuidado', Icon: Frown, color: 'text-rose-400', detail: 'Despesas acima do ideal.' }
  }
  const displayMood = deriveDisplayMood(summary)
  const mood = moodMap[displayMood]
  const panelClass = 'dashboard-panel rounded-2xl border border-cyan-500/20 bg-slate-900/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,8,23,0.45)]'
  const savingsGoal = getSavingsGoal()
  const savingsSaved = Number(savingsGoal?.currentAmount ?? summary.family.savings.saved ?? 0)
  const savingsTarget = Math.max(Number(savingsGoal?.targetAmount ?? summary.family.savings.target ?? 0), 1)
  const savingsProgress = Math.min((savingsSaved / savingsTarget) * 100, 100)

  const savingsStatus = (() => {
    const msg = String(savingsMessage || '').toLowerCase()
    if (msg.includes('retirado')) return { tone: 'red', note: 'Retirada recente' }
    if (msg.includes('guardado') || msg.includes('atualizado')) return { tone: 'green', note: 'Aporte recente' }

    const profit = Number(summary.cashFlow?.profit || 0)
    if (profit > 0) return { tone: 'green', note: 'Mes com sobra' }
    if (profit < 0) return { tone: 'red', note: 'Mes pressionado' }
    return { tone: 'amber', note: 'Sem movimento recente' }
  })()

  const savingsHighlightClass =
    savingsStatus.tone === 'green'
      ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300'
      : savingsStatus.tone === 'red'
        ? 'border-rose-400/35 bg-rose-400/10 text-rose-300'
        : 'border-amber-400/35 bg-amber-400/10 text-amber-300'

  const recentClientTimes = loadHistory
    .map((item) => Number(item.clientMs))
    .filter((value) => Number.isFinite(value)) as number[]

  const averageClientMs = recentClientTimes.length > 0
    ? Math.round(recentClientTimes.reduce((sum, value) => sum + value, 0) / recentClientTimes.length)
    : null

  const p95ClientMs = (() => {
    if (recentClientTimes.length === 0) return null
    const sorted = [...recentClientTimes].sort((a, b) => a - b)
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1))
    return Math.round(sorted[idx])
  })()

  const loadTrend = (() => {
    if (recentClientTimes.length < 4) return null

    const latestSlice = recentClientTimes.slice(-5)
    const previousSlice = recentClientTimes.slice(-10, -5)
    if (latestSlice.length === 0 || previousSlice.length === 0) return null

    const latestAvg = latestSlice.reduce((sum, value) => sum + value, 0) / latestSlice.length
    const previousAvg = previousSlice.reduce((sum, value) => sum + value, 0) / previousSlice.length
    const deltaMs = Math.round(latestAvg - previousAvg)

    if (Math.abs(deltaMs) < 8) {
      return { direction: 'stable' as const, deltaMs: 0 }
    }

    return {
      direction: deltaMs < 0 ? ('improved' as const) : ('worse' as const),
      deltaMs: Math.abs(deltaMs)
    }
  })()

  // Componente de Card de Estatística Premium
  const PremiumStatCard = ({ label, value, icon: Icon, color, trend, note }: any) => {
    const colorClasses = {
      green: 'from-emerald-500/20 to-emerald-400/5 border-emerald-500/30 text-emerald-400',
      blue: 'from-blue-500/20 to-blue-400/5 border-blue-500/30 text-blue-400',
      red: 'from-red-500/20 to-red-400/5 border-red-500/30 text-red-400',
      amber: 'from-amber-500/20 to-amber-400/5 border-amber-500/30 text-amber-300',
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
        {note && <p className="mt-1 text-[11px] text-white/60">{note}</p>}
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[#050816] text-slate-100">
      <OnboardingGuide />

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-44 left-[-8rem] h-[30rem] w-[30rem] rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-[-7rem] left-1/3 h-[20rem] w-[20rem] rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <div className="relative p-4 md:p-6 lg:p-8">
        <div className="mx-auto grid max-w-[1500px] gap-5 xl:grid-cols-[290px_minmax(0,1fr)_330px]">
          <aside className="space-y-5">
            <div className="rounded-3xl border border-cyan-400/25 bg-slate-900/75 p-5 shadow-[0_18px_48px_rgba(2,8,23,0.55)] backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">{isBusinessPlan ? 'Operacao Empresarial' : 'Assistente Financeiro'}</p>
              <h1 className="mt-3 text-2xl font-black leading-tight text-white">{isBusinessPlan ? 'Centro de comando da empresa' : 'Resumo do seu dia'}</h1>
              <p className="mt-2 text-sm text-slate-300">{currentDateLabel}</p>
              {loadMetrics && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Carga: {loadMetrics.source} • cliente {loadMetrics.clientMs ?? '-'}ms{loadMetrics.serverMs !== null ? ` • api ${loadMetrics.serverMs}ms` : ''}
                </p>
              )}
              {loadHistory.length > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Ultimos {loadHistory.length}: media {averageClientMs ?? '-'}ms • p95 {p95ClientMs ?? '-'}ms
                </p>
              )}
              {loadHistory.length > 0 && (
                <button
                  type="button"
                  onClick={clearLoadHistory}
                  className="mt-2 inline-flex items-center rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-slate-500 hover:text-white"
                >
                  Limpar histórico
                </button>
              )}
              {loadTrend && (
                <p className={`mt-1 text-[11px] ${loadTrend.direction === 'improved' ? 'text-emerald-300' : loadTrend.direction === 'worse' ? 'text-rose-300' : 'text-slate-500'}`}>
                  Tendencia: {loadTrend.direction === 'improved' ? `↑ melhorou ${loadTrend.deltaMs}ms` : loadTrend.direction === 'worse' ? `↓ piorou ${loadTrend.deltaMs}ms` : '→ estavel'}
                </p>
              )}

              <div className="mt-5 rounded-2xl border border-slate-700/80 bg-slate-950/80 p-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl border border-slate-700/80 bg-slate-900/80 p-2 ${mood.color}`}>
                    <mood.Icon size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Status: {mood.label}</p>
                    <p className="text-xs text-slate-400">{isBusinessPlan ? 'Visao consolidada da saude financeira da operacao.' : mood.detail}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {summary.family.health.overdueCount} em atraso • {summary.family.health.dueTodayCount} vencem hoje
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-400">Saldo disponível</p>
                <p className="text-2xl font-black text-emerald-300">{formatCurrency(summary.balance.total)}</p>
                <div className={`mt-3 rounded-xl border px-3 py-2 ${savingsHighlightClass}`}>
                  <p className="text-[11px] uppercase tracking-[0.18em]">{isBusinessPlan ? 'Reserva de caixa' : 'Saldo da poupanca'}</p>
                  <p className="mt-1 text-xl font-black">{formatCurrency(savingsSaved)}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <select
                  value={reportPeriod}
                  onChange={(e) => setReportPeriod(e.target.value as ReportPeriod)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="CURRENT_MONTH">Mes atual</option>
                  <option value="LAST_3_MONTHS">Ultimos 3 meses</option>
                  <option value="LAST_12_MONTHS">Ultimos 12 meses</option>
                </select>
                <button
                  type="button"
                  onClick={handleExportPdfReport}
                  disabled={exportingReport}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/15 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-60"
                >
                  <FileText size={16} />
                  {exportingReport ? 'Gerando PDF...' : 'Exportar relatorio PDF'}
                </button>
              </div>

              {reportMessage && (
                <p className={`mt-3 text-xs ${reportMessage.toLowerCase().includes('sucesso') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {reportMessage}
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-700/70 bg-slate-900/70 p-5 shadow-[0_16px_40px_rgba(2,8,23,0.45)] backdrop-blur-xl">
              <p className="text-sm font-semibold text-white">Ajustar saldo total</p>
              <form onSubmit={handleUpdateTotalBalance} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={totalBalanceInput}
                  onChange={(e) => setTotalBalanceInput(e.target.value)}
                  placeholder="1250,50"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingTotalBalance}
                  className="rounded-xl bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-60"
                >
                  OK
                </button>
              </form>
              {totalBalanceMessage && (
                <p className={`mt-2 text-xs ${totalBalanceMessage.toLowerCase().includes('sucesso') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {totalBalanceMessage}
                </p>
              )}

              <form onSubmit={handleSimulatePurchase} className="mt-4 space-y-2 border-t border-slate-800 pt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Simulador</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    placeholder="Valor da compra"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-xl border border-sky-400/40 bg-sky-400/15 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/25"
                  >
                    Simular
                  </button>
                </div>
                {simResult && (
                  <p className={`text-xs ${simResult.canAfford ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {simResult.message}
                  </p>
                )}
              </form>
            </div>
          </aside>

          <section>
            <div className="mx-auto w-full max-w-[780px] rounded-[2.2rem] border border-cyan-400/25 bg-gradient-to-b from-slate-900/95 via-slate-900/85 to-slate-950/95 p-4 md:p-6 shadow-[0_26px_80px_rgba(5,10,30,0.68)]">
              <div className="mx-auto mb-5 h-1.5 w-24 rounded-full bg-slate-700/70" />

              <div className="mb-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/75">{isBusinessPlan ? 'Visao Executiva' : 'Visao Geral'}</p>
                    <p className="mt-1 text-2xl font-black text-white">{isBusinessPlan ? 'Dashboard Empresarial' : 'Painel Principal'}</p>
                    <p className="text-sm text-slate-300">{isBusinessPlan ? 'Controle operacional para decisao rapida do negocio.' : 'Seu fluxo financeiro em tempo real.'}</p>
                  </div>
                  <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 p-2 text-cyan-200">
                    <Rocket size={20} />
                  </div>
                </div>
                {isBusinessPlan && (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                    <Link href="/dashboard/transactions" className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2 py-1.5 text-center text-cyan-200 hover:bg-cyan-400/20">Operacoes</Link>
                    <Link href="/dashboard/bills" className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-2 py-1.5 text-center text-violet-200 hover:bg-violet-400/20">Faturas</Link>
                    <Link href="/dashboard/cashflow" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2 py-1.5 text-center text-emerald-200 hover:bg-emerald-400/20">Fluxo de Caixa</Link>
                    <Link href="/dashboard/whatsapp" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-center text-amber-200 hover:bg-amber-400/20">WhatsApp</Link>
                    <Link href="/dashboard/settings" className="rounded-lg border border-slate-500/30 bg-slate-500/10 px-2 py-1.5 text-center text-slate-200 hover:bg-slate-500/20">Configuracao</Link>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PremiumStatCard label={isBusinessPlan ? 'Reserva de caixa' : 'Poupanca'} value={savingsSaved} icon={PiggyBank} color={savingsStatus.tone} note={savingsStatus.note} />
                <PremiumStatCard label={isBusinessPlan ? 'Saldo em caixa' : 'Saldo'} value={summary.balance.total} icon={DollarSign} color="green" />
                <PremiumStatCard label={isBusinessPlan ? 'Receitas' : 'Entradas'} value={summary.cashFlow.income} icon={TrendingUp} color="blue" />
                <PremiumStatCard label={isBusinessPlan ? 'Despesas' : 'Saidas'} value={summary.cashFlow.expenses} icon={TrendingDown} color="red" />
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{isBusinessPlan ? 'Receitas recentes' : 'Entradas recentes'}</p>
                    <div className="text-right">
                      <p className="text-xs text-emerald-200/80">Total</p>
                      <p className="text-sm font-semibold text-emerald-200">{formatCurrency(recentEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-300">
                    {recentEntries.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-slate-950/40 px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-slate-100">{cleanDescription(item.description)}</p>
                          <p className="text-[11px] text-slate-500">{item.category}</p>
                        </div>
                        <span className="text-emerald-300">{formatCurrency(Number(item.amount || 0))}</span>
                      </div>
                    ))}
                    {recentEntries.length === 0 && <p className="text-slate-500">Sem entradas recentes.</p>}
                  </div>
                </div>

                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{isBusinessPlan ? 'Despesas recentes' : 'Saidas recentes'}</p>
                    <div className="text-right">
                      <p className="text-xs text-rose-200/80">Total</p>
                      <p className="text-sm font-semibold text-rose-200">{formatCurrency(recentExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-300">
                    {recentExpenses.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/20 bg-slate-950/40 px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-slate-100">{cleanDescription(item.description)}</p>
                          <p className="text-[11px] text-slate-500">{item.category}</p>
                        </div>
                        <span className="text-rose-300">{formatCurrency(Number(item.amount || 0))}</span>
                      </div>
                    ))}
                    {recentExpenses.length === 0 && <p className="text-slate-500">Sem saídas recentes.</p>}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4 md:col-span-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Fatura do proximo mes</p>
                    <div className="text-right">
                      <p className="text-[11px] text-violet-200/80">{nextMonthCardBill.month || 'Proximo mes'}</p>
                      <AnimatedCurrency value={nextMonthCardBill.total} className="text-sm font-bold text-violet-200" />
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-300">
                    {nextMonthCardBill.items.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-violet-500/20 bg-slate-950/40 px-2 py-1.5">
                        <span className="truncate">{cleanDescription(item.description)}</span>
                        <span className="text-violet-200">{formatCurrency(Number(item.amount || 0))}</span>
                      </div>
                    ))}
                    {nextMonthCardBill.items.length === 0 && <p className="text-slate-500">Nenhuma despesa de cartao pendente para a proxima fatura.</p>}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.5)] backdrop-blur-xl">
              <div className="mb-3 flex items-center gap-2">
                <Target size={16} className="text-cyan-300" />
                <p className="text-sm font-semibold text-white">Metas e saude</p>
              </div>
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <HeartPulse size={13} className="text-emerald-400" />
                    <span className="text-slate-300">Contas e vencimentos</span>
                  </div>
                  <p className="text-slate-400">
                    {summary.family.health.allBillsUpToDate ? 'Tudo em dia' : `${summary.family.health.overdueCount} em atraso`} • {summary.family.health.dueTodayCount} hoje
                  </p>
                </div>

                <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <PiggyBank size={13} className="text-emerald-400" />
                    <span className="text-slate-300">Poupanca</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${savingsProgress}%` }} />
                  </div>
                  <p className="mt-2 text-slate-400">
                    {formatCurrency(savingsSaved)} de {formatCurrency(savingsTarget)}
                  </p>

                  <form onSubmit={handleSetSavingsBalance} className="mt-3 space-y-2">
                    <label className="block text-[11px] text-slate-500">Editar poupanca</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={savingsInput}
                        onChange={(e) => setSavingsInput(e.target.value)}
                        placeholder="Saldo atual (ex: 3500,00)"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                      />
                      <input
                        type="text"
                        value={savingsTargetInput}
                        onChange={(e) => setSavingsTargetInput(e.target.value)}
                        placeholder="Meta (ex: 10000,00)"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                      />
                      <button
                        type="submit"
                        disabled={savingSavings}
                        className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 disabled:opacity-60"
                      >
                        Editar
                      </button>
                    </div>
                  </form>

                  <div className="mt-3 space-y-2">
                    <label className="block text-[11px] text-slate-500">Guardar sobra das entradas deste mes</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={surplusTransferInput}
                        onChange={(e) => setSurplusTransferInput(e.target.value)}
                        placeholder={`Vazio = guardar tudo (${formatCurrency(Math.max(Number(summary.cashFlow?.profit || 0), 0))})`}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={handleSaveSurplusToSavings}
                        disabled={savingSavings}
                        className="rounded-lg bg-cyan-400 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 disabled:opacity-60"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    <label className="block text-[11px] text-slate-500">Retirar da poupanca para cobrir saldo negativo</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={withdrawSavingsInput}
                        onChange={(e) => setWithdrawSavingsInput(e.target.value)}
                        placeholder={`Vazio = cobrir automatico (${formatCurrency(Math.max(-Number(summary.balance?.total || 0), 0))})`}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={handleWithdrawFromSavings}
                        disabled={savingSavings}
                        className="rounded-lg bg-amber-400 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 disabled:opacity-60"
                      >
                        Retirar
                      </button>
                    </div>
                  </div>

                  {savingsMessage && <p className="mt-2 text-[11px] text-cyan-300">{savingsMessage}</p>}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.5)] backdrop-blur-xl">
              <p className="mb-3 text-sm font-semibold text-white">Categorias</p>
              {categories.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={categories} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={86}>
                      {categories.map((_, index) => <Cell key={`slice-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px' }} formatter={(value: any) => formatCurrency(Number(value || 0))} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">Sem despesas categorizadas.</p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.5)] backdrop-blur-xl">
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock size={16} className="text-cyan-300" />
                <p className="text-sm font-semibold text-white">Hoje</p>
              </div>
              <p className="mb-3 text-xs text-slate-400">Total gasto: {formatCurrency(summary.family.dailyDigest.totalSpentToday)}</p>
              <div className="space-y-2">
                {summary.family.dailyDigest.transactions.slice(0, 4).map((tx) => (
                  <div key={tx.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-slate-200">{tx.description}</p>
                      <span className="text-rose-300">{formatCurrency(tx.amount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">{tx.category}</span>
                      <PaymentMethodChip method={tx.paymentMethod} />
                    </div>
                  </div>
                ))}
                {summary.family.dailyDigest.transactions.length === 0 && <p className="text-xs text-slate-500">Sem lancamentos hoje.</p>}
              </div>
            </div>

            {teamReport && teamReport.members.length > 0 && (
              <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.5)] backdrop-blur-xl">
                <p className="mb-3 text-sm font-semibold text-white">{isBusinessPlan ? 'Equipe' : 'Familia'}</p>
                <div className="space-y-2">
                  {teamReport.members.slice(0, 4).map((member: any) => (
                    <div key={member.userId} className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">{member.name}</span>
                        <span className="text-emerald-300">{formatCurrency(member.totalIncome)}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-rose-300">Saidas: {formatCurrency(member.totalExpense)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.5)] backdrop-blur-xl">
              <GoalsWidget />
            </div>

            <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.5)] backdrop-blur-xl">
              <AIInsights />
            </div>

            <div className="rounded-3xl border border-slate-700/80 bg-slate-900/75 p-4 shadow-[0_16px_42px_rgba(2,8,23,0.5)] backdrop-blur-xl">
              <RecurringTransactions />
            </div>
          </aside>
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

