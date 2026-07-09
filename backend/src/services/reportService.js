import { prisma } from '../config/database.js'
import { startOfMonth, endOfMonth, subMonths, format, startOfDay, endOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function getFinancialMood(profit, previousProfit) {
  if (profit > 0 && profit >= previousProfit) return 'EXCELLENT'
  if (profit >= 0) return 'ATTENTION'
  return 'CAREFUL'
}

function expensePeriodFilter(startDate, endDate) {
  return {
    OR: [
      { isPaid: true, date: { gte: startDate, lte: endDate } },
      { isPaid: false, dueDate: { gte: startDate, lte: endDate } }
    ]
  }
}

/**
 * Resumo geral: saldo, contas a pagar/receber, totais do mês
 */
export async function getFinancialSummary(tenantId) {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const previousMonthStart = startOfMonth(subMonths(now, 1))
  const previousMonthEnd = endOfMonth(subMonths(now, 1))
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)

  const [
    accounts,
    incomes,
    expenses,
    previousIncomes,
    previousExpensesAgg,
    scheduledPayable,
    scheduledReceivable,
    goals,
    monthlyExpensesByCategory,
    todayExpenses,
    recentIncomes,
    recentExpenses
  ] = await Promise.all([
    prisma.account.findMany({ where: { tenantId } }),
    prisma.transaction.aggregate({
      where: { tenantId, type: 'INCOME', date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { tenantId, type: 'EXPENSE', ...expensePeriodFilter(monthStart, monthEnd) },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { tenantId, type: 'INCOME', date: { gte: previousMonthStart, lte: previousMonthEnd } },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { tenantId, type: 'EXPENSE', ...expensePeriodFilter(previousMonthStart, previousMonthEnd) },
      _sum: { amount: true }
    }),
    prisma.scheduledPayment.findMany({
      where: { tenantId, type: 'EXPENSE', status: 'PENDING' },
      include: { contact: true },
      orderBy: { dueDate: 'asc' }
    }),
    prisma.scheduledPayment.findMany({
      where: { tenantId, type: 'INCOME', status: 'PENDING' },
      include: { contact: true },
      orderBy: { dueDate: 'asc' }
    }),
    prisma.goal.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.transaction.findMany({
      where: { tenantId, type: 'EXPENSE', ...expensePeriodFilter(monthStart, monthEnd) },
      include: { category: true }
    }),
    prisma.transaction.findMany({
      where: { tenantId, type: 'EXPENSE', isPaid: true, date: { gte: todayStart, lte: todayEnd } },
      include: { category: true },
      orderBy: { date: 'desc' }
    }),
    prisma.transaction.findMany({
      where: { tenantId, type: 'INCOME' },
      include: { category: true, account: true },
      orderBy: { date: 'desc' },
      take: 5
    }),
    prisma.transaction.findMany({
      where: { tenantId, type: 'EXPENSE' },
      include: { category: true, account: true },
      orderBy: { date: 'desc' },
      take: 5
    })
  ])

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const totalIncome = incomes._sum.amount || 0
  const totalExpenses = expenses._sum.amount || 0
  const previousIncome = previousIncomes._sum.amount || 0
  const previousExpenses = previousExpensesAgg._sum.amount || 0
  const monthlyProfit = totalIncome - totalExpenses
  const previousProfit = previousIncome - previousExpenses
  const totalPayable = scheduledPayable.reduce((s, p) => s + p.amount, 0)
  const totalReceivable = scheduledReceivable.reduce((s, p) => s + p.amount, 0)

  const overdueCount = scheduledPayable.filter((p) => p.dueDate < todayStart).length
  const dueTodayCount = scheduledPayable.filter((p) => p.dueDate >= todayStart && p.dueDate <= todayEnd).length
  const savedVsLastMonth = monthlyProfit - previousProfit

  const categoryMap = {}
  for (const tx of monthlyExpensesByCategory) {
    const name = tx.category?.name || 'Outros'
    if (!categoryMap[name]) categoryMap[name] = { name, amount: 0 }
    categoryMap[name].amount += tx.amount
  }
  const topCategories = Object.values(categoryMap)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)

  const mappedGoals = goals.map((goal) => {
    const currentAmount = goal.currentAmount || 0
    const targetAmount = goal.targetAmount || 0
    const remaining = Math.max(targetAmount - currentAmount, 0)
    const progress = targetAmount > 0 ? clamp((currentAmount / targetAmount) * 100, 0, 100) : 0
    const monthsToGoal = monthlyProfit > 0 ? Math.ceil(remaining / monthlyProfit) : null

    return {
      id: goal.id,
      name: goal.name,
      targetAmount,
      currentAmount,
      remaining,
      progress,
      monthsToGoal,
      deadline: goal.deadline
    }
  })

  const mainGoal = mappedGoals[0] || null
  const savingsTarget = Math.max(500, Math.round((Math.max(previousProfit, 1000)) / 100) * 100)
  const savingsValue = Math.max(monthlyProfit, 0)
  const savingsProgress = clamp((savingsValue / savingsTarget) * 100, 0, 100)
  const todayExpensesTotal = todayExpenses.reduce((sum, tx) => sum + tx.amount, 0)

  return {
    currentMonth: format(now, 'MMMM yyyy', { locale: ptBR }),
    balance: {
      accounts,
      total: totalBalance
    },
    cashFlow: {
      income: totalIncome,
      expenses: totalExpenses,
      profit: totalIncome - totalExpenses
    },
    payable: {
      items: scheduledPayable,
      total: totalPayable
    },
    receivable: {
      items: scheduledReceivable,
      total: totalReceivable
    },
    family: {
      mood: getFinancialMood(monthlyProfit, previousProfit),
      health: {
        allBillsUpToDate: overdueCount === 0,
        overdueCount,
        dueTodayCount,
        savedVsLastMonth
      },
      goal: mainGoal,
      savings: {
        target: savingsTarget,
        saved: savingsValue,
        progress: savingsProgress
      },
      topSpending: topCategories,
      dailyDigest: {
        totalSpentToday: todayExpensesTotal,
        transactions: todayExpenses.slice(0, 5).map((tx) => ({
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
          category: tx.category?.name || 'Outros',
          paymentMethod: tx.paymentMethod || 'CASH'
        }))
      },
      recentEntries: recentIncomes.map((tx) => ({
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        date: tx.date,
        paymentMethod: tx.paymentMethod || 'CASH',
        category: tx.category?.name || 'Outros'
      })),
      recentExpenses: recentExpenses.map((tx) => ({
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        date: tx.type === 'EXPENSE' && tx.isPaid === false && tx.dueDate ? tx.dueDate : tx.date,
        paymentMethod: tx.paymentMethod || 'CASH',
        category: tx.category?.name || 'Outros'
      }))
    }
  }
}

/**
 * Fluxo de caixa detalhado por período
 */
export async function getCashFlow(tenantId, startDate, endDate) {
  const [transactions] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        tenantId,
        OR: [
          { type: 'INCOME', date: { gte: startDate, lte: endDate } },
          { type: 'EXPENSE', ...expensePeriodFilter(startDate, endDate) }
        ]
      },
      orderBy: { date: 'asc' }
    })
  ])

  const incomes = transactions.filter(t => t.type === 'INCOME')
  const expenses = transactions.filter(t => t.type === 'EXPENSE')

  return {
    income: incomes.reduce((s, t) => s + t.amount, 0),
    expenses: expenses.reduce((s, t) => s + t.amount, 0),
    profit: incomes.reduce((s, t) => s + t.amount, 0) - expenses.reduce((s, t) => s + t.amount, 0),
    transactions
  }
}

/**
 * Gastos agrupados por categoria
 */
export async function getExpensesByCategory(tenantId, startDate, endDate) {
  const expenses = await prisma.transaction.findMany({
    where: { tenantId, type: 'EXPENSE', ...expensePeriodFilter(startDate, endDate) },
    include: { category: true }
  })

  const grouped = {}
  for (const tx of expenses) {
    const key = tx.category?.name || 'Outros'
    if (!grouped[key]) grouped[key] = { name: key, total: 0, color: tx.category?.color, count: 0 }
    grouped[key].total += tx.amount
    grouped[key].count++
  }

  return Object.values(grouped).sort((a, b) => b.total - a.total)
}

/**
 * Evolução mensal dos últimos N meses
 */
export async function getMonthlyEvolution(tenantId, months = 6) {
  const result = []

  for (let i = months - 1; i >= 0; i--) {
    const date = subMonths(new Date(), i)
    const start = startOfMonth(date)
    const end = endOfMonth(date)

    const [income, expense] = await Promise.all([
      prisma.transaction.aggregate({
        where: { tenantId, type: 'INCOME', date: { gte: start, lte: end } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { tenantId, type: 'EXPENSE', ...expensePeriodFilter(start, end) },
        _sum: { amount: true }
      })
    ])

    const totalIncome = income._sum.amount || 0
    const totalExpense = expense._sum.amount || 0

    result.push({
      month: format(date, 'MMM/yy', { locale: ptBR }),
      income: totalIncome,
      expenses: totalExpense,
      profit: totalIncome - totalExpense
    })
  }

  return result
}

/**
 * Formata resumo para enviar via WhatsApp
 */
export function formatSummaryForWhatsApp(summary) {
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const paymentMethodLabel = (method) => {
    switch (method) {
      case 'PIX':
        return 'PIX'
      case 'CREDIT_CARD':
        return 'Cartao credito'
      case 'DEBIT_CARD':
        return 'Cartao debito'
      default:
        return 'Dinheiro'
    }
  }

  let msg = `📊 *RESUMO FINANCEIRO*\n`
  msg += `📅 ${summary.currentMonth.toUpperCase()}\n\n`

  msg += `💰 *SALDO ATUAL*\n`
  for (const acc of summary.balance.accounts) {
    msg += `• ${acc.name}: ${fmt(acc.balance)}\n`
  }
  msg += `Total: ${fmt(summary.balance.total)}\n\n`

  msg += `📈 *FLUXO DO MÊS*\n`
  msg += `• Entradas: ${fmt(summary.cashFlow.income)}\n`
  msg += `• Saídas: ${fmt(summary.cashFlow.expenses)}\n`
  msg += `• Lucro: ${fmt(summary.cashFlow.profit)}\n\n`

  if (summary.family?.dailyDigest?.transactions?.length > 0) {
    msg += `🧾 *GASTOS DE HOJE*\n`
    for (const tx of summary.family.dailyDigest.transactions.slice(0, 5)) {
      msg += `• ${tx.description} — ${fmt(tx.amount)} — ${paymentMethodLabel(tx.paymentMethod)}\n`
    }
    msg += `Total hoje: ${fmt(summary.family.dailyDigest.totalSpentToday)}\n\n`
  }

  if (summary.payable.items.length > 0) {
    msg += `🔴 *CONTAS A PAGAR*\n`
    for (const p of summary.payable.items.slice(0, 5)) {
      const due = new Date(p.dueDate).toLocaleDateString('pt-BR')
      msg += `• ${p.description} — ${fmt(p.amount)} — vence ${due}\n`
    }
    msg += `Total: ${fmt(summary.payable.total)}\n\n`
  }

  if (summary.receivable.items.length > 0) {
    msg += `🟢 *CONTAS A RECEBER*\n`
    for (const p of summary.receivable.items.slice(0, 5)) {
      msg += `• ${p.description} — ${fmt(p.amount)}\n`
    }
    msg += `Total: ${fmt(summary.receivable.total)}\n`
  }

  return msg
}

// ===========================
// RELATÓRIO INDIVIDUAL (por usuário)
// ===========================
export async function getUserReport(tenantId, userId) {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId,
      userId,
      OR: [
        { type: 'INCOME', date: { gte: monthStart, lte: monthEnd } },
        { type: 'EXPENSE', ...expensePeriodFilter(monthStart, monthEnd) }
      ]
    },
    include: { category: true }
  })

  const grouped = { INCOME: {}, EXPENSE: {} }

  for (const tx of transactions) {
    const key = tx.category?.name || 'Outros'
    if (!grouped[tx.type][key]) grouped[tx.type][key] = { name: key, total: 0 }
    grouped[tx.type][key].total += tx.amount
  }

  const incomes = Object.values(grouped.INCOME).sort((a, b) => b.total - a.total)
  const expenses = Object.values(grouped.EXPENSE).sort((a, b) => b.total - a.total)

  return {
    totalIncome: incomes.reduce((s, c) => s + c.total, 0),
    totalExpense: expenses.reduce((s, c) => s + c.total, 0),
    incomes,
    expenses
  }
}

// ===========================
// RELATÓRIO DA EQUIPE/FAMÍLIA (todos os usuários)
// ===========================
export async function getTeamReport(tenantId) {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const tenantUsers = await prisma.tenantUser.findMany({
    where: { tenantId, isActive: true },
    include: { user: true }
  })

  const members = []

  for (const tu of tenantUsers) {
    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { tenantId, userId: tu.userId, type: 'INCOME', date: { gte: monthStart, lte: monthEnd } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { tenantId, userId: tu.userId, type: 'EXPENSE', ...expensePeriodFilter(monthStart, monthEnd) },
        _sum: { amount: true }
      })
    ])

    members.push({
      userId: tu.userId,
      name: tu.nickname || tu.user.name,
      role: tu.role,
      totalIncome: incomeAgg._sum.amount || 0,
      totalExpense: expenseAgg._sum.amount || 0
    })
  }

  return {
    members,
    totalIncome: members.reduce((s, m) => s + m.totalIncome, 0),
    totalExpense: members.reduce((s, m) => s + m.totalExpense, 0)
  }
}
