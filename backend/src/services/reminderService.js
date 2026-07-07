import cron from 'node-cron'
import { prisma } from '../config/database.js'
import { logger } from '../config/logger.js'
import {
  addDays,
  isToday,
  isTomorrow,
  isPast,
  format,
  startOfDay,
  endOfDay,
  subDays
} from 'date-fns'
import { sendSystemMessageToSession } from './whatsappManager.js'
import { getFinancialSummary } from './reportService.js'

const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const WA_ENABLED = String(process.env.WA_ENABLED || 'true').trim().toLowerCase() === 'true'

async function getTenantNotificationSettings(tenantId) {
  return prisma.tenantNotificationSettings.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId }
  })
}

function shouldRunAtHour(targetHour, now) {
  return Number(now) === Number(targetHour)
}

function getLocalClockInfo(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hour12: false
  }).formatToParts(date)

  const map = {}
  for (const part of parts) {
    map[part.type] = part.value
  }

  const weekdayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  }

  return {
    localHour: Number(map.hour),
    localWeekday: weekdayMap[map.weekday] ?? 0,
    localDateKey: `${map.year}-${map.month}-${map.day}`
  }
}

function isSameLocalDate(dateA, dateB, timeZone) {
  if (!dateA || !dateB) return false
  const a = getLocalClockInfo(dateA, timeZone).localDateKey
  const b = getLocalClockInfo(dateB, timeZone).localDateKey
  return a === b
}

export function startReminderCron() {
  cron.schedule('*/5 * * * *', async () => {
    await runTenantSchedules()
  })

  cron.schedule('0 */2 * * *', async () => {
    await checkCashFlowWarningsForAllTenants()
  })

  logger.info('Cron de lembretes iniciado')
}

async function runTenantSchedules() {
  if (!WA_ENABLED) return

  const now = new Date()
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } })

  for (const tenant of tenants) {
    const settings = await getTenantNotificationSettings(tenant.id)
    const timeZone = settings.timezone || 'America/Sao_Paulo'
    const localNow = getLocalClockInfo(now, timeZone)

    if (
      settings.remindersEnabled &&
      shouldRunAtHour(settings.remindersHour, localNow.localHour) &&
      (!settings.lastRemindersSentAt || !isSameLocalDate(settings.lastRemindersSentAt, now, timeZone))
    ) {
      await sendDailyRemindersForTenant(tenant.id)
      await prisma.tenantNotificationSettings.update({
        where: { tenantId: tenant.id },
        data: { lastRemindersSentAt: now }
      })
    }

    if (
      settings.dailyDigestEnabled &&
      shouldRunAtHour(settings.dailyDigestHour, localNow.localHour) &&
      (!settings.lastDailyDigestSentAt || !isSameLocalDate(settings.lastDailyDigestSentAt, now, timeZone))
    ) {
      await sendDailyDigestForTenant(tenant.id, tenant.name)
      await prisma.tenantNotificationSettings.update({
        where: { tenantId: tenant.id },
        data: { lastDailyDigestSentAt: now }
      })
    }

    if (
      settings.weeklyDigestEnabled &&
      localNow.localWeekday === Number(settings.weeklyDigestWeekday) &&
      shouldRunAtHour(settings.weeklyDigestHour, localNow.localHour) &&
      (!settings.lastWeeklyDigestSentAt || !isSameLocalDate(settings.lastWeeklyDigestSentAt, now, timeZone))
    ) {
      await sendWeeklyDigestForTenant(tenant.id, tenant.name)
      await prisma.tenantNotificationSettings.update({
        where: { tenantId: tenant.id },
        data: { lastWeeklyDigestSentAt: now }
      })
    }
  }
}

async function sendDailyRemindersForTenant(tenantId) {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { tenantId, isActive: true }
  })
  if (sessions.length === 0) return

  const reminders = await buildReminders(tenantId)
  if (reminders.length === 0) return

  const message = `LEMBRETES DO DIA\n\n${reminders.join('\n')}`
  for (const session of sessions) {
    await sendMessageToSession(session, message)
  }
}

async function sendDailyDigestForTenant(tenantId, tenantName) {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { tenantId, isActive: true }
  })
  if (sessions.length === 0) return

  const message = await buildDailyDigestMessage(tenantId, tenantName)
  for (const session of sessions) {
    await sendMessageToSession(session, message)
  }
}

async function sendWeeklyDigestForTenant(tenantId, tenantName) {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { tenantId, isActive: true }
  })
  if (sessions.length === 0) return

  const message = await buildWeeklyDigestMessage(tenantId, tenantName)
  for (const session of sessions) {
    await sendMessageToSession(session, message)
  }
}

export async function triggerDailyDigestNow() {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } })
  for (const tenant of tenants) {
    await sendDailyDigestForTenant(tenant.id, tenant.name)
  }
  return { ok: true }
}

export async function triggerWeeklyDigestNow() {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true } })
  for (const tenant of tenants) {
    await sendWeeklyDigestForTenant(tenant.id, tenant.name)
  }
  return { ok: true }
}

async function buildReminders(tenantId) {
  const reminders = []

  const payments = await prisma.scheduledPayment.findMany({
    where: { tenantId, status: 'PENDING' }
  })

  for (const p of payments) {
    const due = new Date(p.dueDate)
    if (isToday(due)) {
      reminders.push(`HOJE vence: ${p.description} - ${fmt(p.amount)}`)
      await prisma.scheduledPayment.update({ where: { id: p.id }, data: { status: 'OVERDUE' } })
    } else if (isTomorrow(due)) {
      reminders.push(`Amanha vence: ${p.description} - ${fmt(p.amount)}`)
    } else if (isPast(due)) {
      reminders.push(`VENCIDO: ${p.description} - ${fmt(p.amount)} (venceu ${format(due, 'dd/MM')})`)
    }
  }

  return reminders
}

async function checkCashFlowWarningsForAllTenants() {
  if (!WA_ENABLED) return

  const tenants = await prisma.tenant.findMany({ where: { isActive: true } })

  for (const tenant of tenants) {
    const settings = await getTenantNotificationSettings(tenant.id)
    if (!settings.cashflowAlertEnabled) continue

    const warning = await checkCashFlowWarnings(tenant.id)
    if (!warning) continue

    const sessions = await prisma.whatsAppSession.findMany({
      where: { tenantId: tenant.id, isActive: true }
    })

    for (const session of sessions) {
      await sendMessageToSession(session, warning)
    }
  }
}

async function checkCashFlowWarnings(tenantId) {
  const accounts = await prisma.account.findMany({ where: { tenantId } })
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  const nextWeek = addDays(new Date(), 7)
  const pendingExpenses = await prisma.scheduledPayment.aggregate({
    where: {
      tenantId,
      type: 'EXPENSE',
      status: 'PENDING',
      dueDate: { lte: nextWeek }
    },
    _sum: { amount: true }
  })

  const totalExpenses = pendingExpenses._sum.amount || 0
  if (totalBalance - totalExpenses < 0) {
    return `ALERTA: O fluxo de caixa pode ficar negativo em 7 dias.\nSaldo: ${fmt(totalBalance)}\nContas a pagar: ${fmt(totalExpenses)}`
  }
  return null
}

async function sendMessageToSession(session, message) {
  try {
    await sendSystemMessageToSession(session.id, message, session.phoneNumber)
    logger.info({ sessionId: session.id, message: message.slice(0, 60) }, 'Mensagem automatica enviada')
  } catch (error) {
    logger.warn({ sessionId: session.id, error: error.message }, 'Falha ao enviar mensagem automatica')
  }
}

async function buildDailyDigestMessage(tenantId, tenantName) {
  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

  const [summary, todayTransactions] = await Promise.all([
    getFinancialSummary(tenantId),
    prisma.transaction.findMany({
      where: {
        tenantId,
        type: 'EXPENSE',
        date: { gte: todayStart, lte: todayEnd }
      },
      orderBy: { date: 'asc' },
      take: 8
    })
  ])

  let msg = 'Boa noite!\n\n'
  msg += `Resumo do dia - ${tenantName}\n\n`

  if (todayTransactions.length === 0) {
    msg += 'Hoje nao houve lancamentos de despesa.\n'
  } else {
    msg += 'Hoje voces gastaram:\n'
    for (const tx of todayTransactions) {
      msg += `- ${tx.description}: ${fmt(tx.amount)}\n`
    }
  }

  msg += `\nTotal do dia: ${fmt(summary.family.dailyDigest.totalSpentToday)}\n`
  msg += `Saldo disponivel: ${fmt(summary.balance.total)}`

  return msg
}

async function buildWeeklyDigestMessage(tenantId, tenantName) {
  const end = endOfDay(new Date())
  const start = startOfDay(subDays(new Date(), 6))

  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId,
      date: { gte: start, lte: end }
    }
  })

  const incomes = transactions.filter((t) => t.type === 'INCOME')
  const expenses = transactions.filter((t) => t.type === 'EXPENSE')

  const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0)
  const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0)
  const saving = totalIncome - totalExpense

  let topExpense = null
  if (expenses.length > 0) {
    topExpense = expenses.reduce((max, current) => (current.amount > max.amount ? current : max), expenses[0])
  }

  let msg = 'Resumo da semana\n\n'
  msg += `${tenantName}\n`
  msg += `Receitas: ${fmt(totalIncome)}\n`
  msg += `Despesas: ${fmt(totalExpense)}\n`
  msg += `Economia: ${fmt(saving)}\n`
  if (topExpense) {
    msg += `Maior gasto: ${topExpense.description} (${fmt(topExpense.amount)})\n`
  }

  return msg
}
