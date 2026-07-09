import { Router } from 'express'
import { randomUUID } from 'crypto'
import { prisma } from '../config/database.js'
import { getFinancialSummary, getCashFlow, getExpensesByCategory, getMonthlyEvolution } from '../services/reportService.js'
import { triggerDailyDigestNow, triggerWeeklyDigestNow } from '../services/reminderService.js'
import { getWhatsAppRuntimeHealth, getRepairAuditEntries, getTenantRepairLimitStatus } from '../services/whatsappManager.js'
import { startOfMonth, endOfMonth, parseISO, startOfDay, endOfDay, addMonths } from 'date-fns'

export const apiRouter = Router()
const WA_ENABLED = String(process.env.WA_ENABLED || 'true').trim().toLowerCase() === 'true'

apiRouter.get('/system/health', async (req, res) => {
  const db = { status: 'ok' }
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    db.status = 'error'
    db.error = error?.message || 'db_unavailable'
  }

  const tenantSessions = WA_ENABLED
    ? await prisma.whatsAppSession.findMany({
      where: { tenantId: req.tenant.id },
      select: { id: true, phoneNumber: true, isActive: true, connectedAt: true }
    })
    : []

  const waRuntime = WA_ENABLED
    ? getWhatsAppRuntimeHealth()
    : { activeCount: 0, connectedCount: 0, qrPendingCount: 0 }
  const openAiConfigured = !!process.env.OPENAI_API_KEY
  const status = db.status === 'ok' ? 'ok' : 'degraded'
  const repairAuditRaw = WA_ENABLED ? await getRepairAuditEntries(req.tenant.id) : []
  const repairLimit = WA_ENABLED
    ? await getTenantRepairLimitStatus(req.tenant.id)
    : { used: 0, remaining: 0, limit: 0, periodStart: new Date().toISOString() }

  const repairAudit = repairAuditRaw.map((item) => ({
    at: item.createdAt,
    sessionId: item.sessionId,
    phoneNumber: item.phoneNumber,
    outcome: item.outcome,
    error: item.error,
    actor: item.actorTenantEmail
      ? {
          email: item.actorTenantEmail,
          plan: item.actorTenantPlan
        }
      : null
  }))

  res.json({
    status,
    checkedAt: new Date().toISOString(),
    server: {
      env: process.env.NODE_ENV || 'development',
      uptimeSec: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      nodeVersion: process.version
    },
    database: db,
    openai: {
      configured: openAiConfigured,
      mode: openAiConfigured ? 'hybrid' : 'fallback-local'
    },
    whatsapp: {
      enabled: WA_ENABLED,
      runtime: waRuntime,
      tenantSessions,
      repairAudit,
      repairLimit: {
        used: repairLimit.used,
        remaining: repairLimit.remaining,
        limit: repairLimit.limit,
        periodStart: repairLimit.periodStart
      }
    }
  })
})

// ===========================
// DASHBOARD PRINCIPAL
// ===========================
// GET /api/dashboard/summary
apiRouter.get('/summary', async (req, res) => {
  const summary = await getFinancialSummary(req.tenant.id)
  res.json(summary)
})

// GET /api/dashboard/cashflow?month=2024-01
apiRouter.get('/cashflow', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7)
  const date = parseISO(`${month}-01`)
  const data = await getCashFlow(req.tenant.id, startOfMonth(date), endOfMonth(date))
  res.json(data)
})

// GET /api/dashboard/categories?month=2024-01
apiRouter.get('/categories', async (req, res) => {
  if (req.query.catalog === '1') {
    const categories = await prisma.category.findMany({
      where: { tenantId: req.tenant.id },
      orderBy: { name: 'asc' }
    })
    return res.json(categories)
  }

  const month = req.query.month || new Date().toISOString().slice(0, 7)
  const date = parseISO(`${month}-01`)
  const data = await getExpensesByCategory(req.tenant.id, startOfMonth(date), endOfMonth(date))
  res.json(data)
})

// GET /api/dashboard/evolution?months=6
apiRouter.get('/evolution', async (req, res) => {
  const months = parseInt(req.query.months) || 6
  const data = await getMonthlyEvolution(req.tenant.id, months)
  res.json(data)
})

// ===========================
// TRANSAÇÕES
// ===========================
// GET /api/dashboard/transactions
apiRouter.get('/transactions', async (req, res) => {
  const { page = 1, limit = 50, type, month, search, paymentMethod } = req.query
  const skip = (parseInt(page) - 1) * parseInt(limit)

  const where = { tenantId: req.tenant.id }

  if (type) where.type = type
  if (month) {
    const date = parseISO(`${month}-01`)
    const range = { gte: startOfMonth(date), lte: endOfMonth(date) }
    where.OR = [
      { date: range },
      { dueDate: range }
    ]
  }
  if (search) {
    where.description = { contains: search, mode: 'insensitive' }
  }
  if (paymentMethod) where.paymentMethod = paymentMethod

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, account: true, from: true, to: true, user: true },
      orderBy: { date: 'desc' },
      skip,
      take: parseInt(limit)
    }),
    prisma.transaction.count({ where })
  ])

  res.json({ transactions, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) })
})

// POST /api/dashboard/transactions
apiRouter.post('/transactions', async (req, res) => {
  const { type, amount, description, categoryId, accountId, date, dueDate, contactId, paymentMethod, personName, isPaid, installments } = req.body

  if (!type || !amount || !description) {
    return res.status(400).json({ error: 'Tipo, valor e descrição são obrigatórios.' })
  }

  const normalizedPersonName = String(personName || '').trim()
  let resolvedContactId = contactId

  if (!resolvedContactId && normalizedPersonName) {
    const existingContact = await prisma.contact.findFirst({
      where: {
        tenantId: req.tenant.id,
        name: normalizedPersonName,
      },
      select: { id: true }
    })

    if (existingContact?.id) {
      resolvedContactId = existingContact.id
    } else {
      const createdContact = await prisma.contact.create({
        data: {
          tenantId: req.tenant.id,
          name: normalizedPersonName,
          type: 'FAMILY'
        },
        select: { id: true }
      })
      resolvedContactId = createdContact.id
    }
  }

  const installmentCount = Math.min(Math.max(parseInt(installments) || 1, 1), 12)
  const baseDate = date ? new Date(date) : new Date()
  const shouldSplitInstallments = type === 'EXPENSE' && paymentMethod === 'CREDIT_CARD' && installmentCount > 1
  const isCreditCardExpense = type === 'EXPENSE' && paymentMethod === 'CREDIT_CARD'
  const groupId = shouldSplitInstallments ? randomUUID() : null

  const createExpenseRows = () => {
    if (shouldSplitInstallments) {
      const cents = Math.round(Number(amount) * 100)
      const baseCents = Math.floor(cents / installmentCount)
      const remainder = cents - (baseCents * installmentCount)

      return Array.from({ length: installmentCount }, (_, index) => {
        const installmentCents = baseCents + (index < remainder ? 1 : 0)
        const installmentAmount = installmentCents / 100
        const installmentDate = addMonths(baseDate, index + 1)
        return {
          tenantId: req.tenant.id,
          type,
          paymentMethod: paymentMethod || 'CREDIT_CARD',
          amount: installmentAmount,
          description: `${description} (${index + 1}/${installmentCount})`,
          categoryId,
          accountId: null,
          date: installmentDate,
          dueDate: installmentDate,
          isPaid: false,
          toId: type === 'EXPENSE' ? resolvedContactId : undefined,
          fromId: type === 'INCOME' ? resolvedContactId : undefined,
          installments: installmentCount,
          installmentNumber: index + 1,
          groupId,
        }
      })
    }

    if (isCreditCardExpense) {
      const creditDate = dueDate ? new Date(dueDate) : addMonths(baseDate, 1)
      return [{
        tenantId: req.tenant.id,
        type,
        paymentMethod: paymentMethod || 'CREDIT_CARD',
        amount: parseFloat(amount),
        description,
        categoryId,
        accountId: null,
        date: creditDate,
        dueDate: creditDate,
        isPaid: false,
        toId: resolvedContactId,
        fromId: undefined,
        installments: 1,
        installmentNumber: 1,
        groupId: null,
      }]
    }

    return [{
      tenantId: req.tenant.id,
      type,
      paymentMethod: paymentMethod || 'CASH',
      amount: parseFloat(amount),
      description,
      categoryId,
      accountId,
      date: date ? new Date(date) : new Date(),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      isPaid: isPaid === false ? false : true,
      toId: type === 'EXPENSE' ? resolvedContactId : undefined,
      fromId: type === 'INCOME' ? resolvedContactId : undefined,
      installments: installmentCount > 1 ? installmentCount : null,
      installmentNumber: installmentCount > 1 ? 1 : null,
      groupId: null,
    }]
  }

  const rows = createExpenseRows()

  const createdTransactions = rows.length > 1
    ? await prisma.transaction.createMany({ data: rows })
    : await prisma.transaction.create({
        data: rows[0],
        include: { category: true, account: true, from: true, to: true, user: true }
      })

  // Atualizar saldo da conta
  const shouldAffectBalance = type === 'INCOME' || (type === 'EXPENSE' && paymentMethod !== 'CREDIT_CARD' && isPaid !== false)
  if (accountId && shouldAffectBalance) {
    const delta = type === 'INCOME' ? amount : -amount
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: { increment: parseFloat(delta) } }
    })
  }

  if (rows.length > 1) {
    return res.status(201).json({
      message: 'Transações parceladas criadas com sucesso.',
      count: rows.length,
      installmentCount,
      groupId,
    })
  }

  res.status(201).json(createdTransactions)
})

// POST /api/dashboard/transactions/bulk-delete
apiRouter.post('/transactions/bulk-delete', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : []

  if (ids.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos um lancamento para remover.' })
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId: req.tenant.id,
      id: { in: ids }
    },
    select: {
      id: true,
      type: true,
      amount: true,
      accountId: true
    }
  })

  if (transactions.length === 0) {
    return res.status(404).json({ error: 'Nenhum lancamento encontrado para remover.' })
  }

  const accountAdjustments = new Map()
  transactions.forEach((tx) => {
    if (!tx.accountId) return
    const delta = tx.type === 'INCOME' ? -Number(tx.amount || 0) : Number(tx.amount || 0)
    accountAdjustments.set(tx.accountId, (accountAdjustments.get(tx.accountId) || 0) + delta)
  })

  await prisma.$transaction([
    ...Array.from(accountAdjustments.entries()).map(([accountId, delta]) => prisma.account.update({
      where: { id: accountId },
      data: { balance: { increment: delta } }
    })),
    prisma.transaction.deleteMany({
      where: {
        tenantId: req.tenant.id,
        id: { in: transactions.map((tx) => tx.id) }
      }
    })
  ])

  return res.json({
    message: transactions.length === 1 ? 'Lancamento removido.' : `${transactions.length} lancamentos removidos.`,
    count: transactions.length
  })
})

// PATCH /api/dashboard/transactions/:id
apiRouter.patch('/transactions/:id', async (req, res) => {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })

  if (!tx) {
    return res.status(404).json({ error: 'Transação não encontrada.' })
  }

  const { description, amount, dueDate, isPaid } = req.body
  const data = {}

  if (description !== undefined) data.description = String(description)
  if (amount !== undefined) data.amount = Number(amount)
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (typeof isPaid === 'boolean') data.isPaid = isPaid

  const updated = await prisma.transaction.update({
    where: { id: tx.id },
    data,
    include: { category: true, account: true, from: true, to: true, user: true }
  })

  return res.json(updated)
})

// DELETE /api/dashboard/transactions/:id
apiRouter.delete('/transactions/:id', async (req, res) => {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' })

  // Reverter saldo
  if (tx.accountId) {
    const delta = tx.type === 'INCOME' ? -tx.amount : tx.amount
    await prisma.account.update({
      where: { id: tx.accountId },
      data: { balance: { increment: delta } }
    })
  }

  await prisma.transaction.delete({ where: { id: req.params.id } })
  res.json({ message: 'Transação removida.' })
})

// POST /api/dashboard/bills/pay
apiRouter.post('/bills/pay', async (req, res) => {
  const { month, accountId } = req.body

  if (!month) {
    return res.status(400).json({ error: 'Informe o mes da fatura.' })
  }

  const date = parseISO(`${month}-01`)
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  const now = new Date()
  const currentMonthStart = startOfMonth(now)

  if (monthStart > currentMonthStart) {
    return res.status(400).json({ error: 'Esta fatura ainda nao pode ser paga antes do mes dela.' })
  }

  const unpaidBills = await prisma.transaction.findMany({
    where: {
      tenantId: req.tenant.id,
      type: 'EXPENSE',
      paymentMethod: 'CREDIT_CARD',
      isPaid: false,
      OR: [
        { date: { gte: monthStart, lte: monthEnd } },
        { dueDate: { gte: monthStart, lte: monthEnd } }
      ]
    }
  })

  if (unpaidBills.length === 0) {
    return res.status(404).json({ error: 'Nao ha faturas pendentes para este mes.' })
  }

  const total = unpaidBills.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
  const account = await prisma.account.findFirst({
    where: accountId ? { id: accountId, tenantId: req.tenant.id } : { tenantId: req.tenant.id },
    orderBy: { createdAt: 'asc' }
  })

  if (!account) {
    return res.status(404).json({ error: 'Nenhuma conta foi encontrada para pagar a fatura.' })
  }

  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { id: { in: unpaidBills.map((tx) => tx.id) } },
      data: {
        isPaid: true,
        accountId: account.id
      }
    }),
    prisma.account.update({
      where: { id: account.id },
      data: { balance: { increment: -total } }
    })
  ])

  const paidCount = unpaidBills.length
  return res.json({
    message: 'Fatura paga com sucesso.',
    month,
    total,
    paidCount,
    account: { id: account.id, name: account.name }
  })
})

// POST /api/dashboard/bills/pay-item
apiRouter.post('/bills/pay-item', async (req, res) => {
  const { transactionId, accountId } = req.body

  if (!transactionId) {
    return res.status(400).json({ error: 'Informe o item da fatura.' })
  }

  const tx = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      tenantId: req.tenant.id,
      type: 'EXPENSE',
      paymentMethod: 'CREDIT_CARD'
    }
  })

  if (!tx) {
    return res.status(404).json({ error: 'Item da fatura nao encontrado.' })
  }

  if (tx.isPaid) {
    return res.status(400).json({ error: 'Este item da fatura ja esta pago.' })
  }

  const referenceDate = tx.dueDate || tx.date
  const dueMonthStart = startOfMonth(referenceDate)
  const currentMonthStart = startOfMonth(new Date())

  if (dueMonthStart > currentMonthStart) {
    return res.status(400).json({ error: 'Este item ainda nao pode ser pago antes do mes dele.' })
  }

  const account = await prisma.account.findFirst({
    where: accountId ? { id: accountId, tenantId: req.tenant.id } : { tenantId: req.tenant.id },
    orderBy: { createdAt: 'asc' }
  })

  if (!account) {
    return res.status(404).json({ error: 'Nenhuma conta foi encontrada para pagar este item.' })
  }

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: tx.id },
      data: {
        isPaid: true,
        accountId: account.id
      }
    }),
    prisma.account.update({
      where: { id: account.id },
      data: { balance: { increment: -Number(tx.amount || 0) } }
    })
  ])

  return res.json({
    message: 'Item da fatura pago com sucesso.',
    transactionId: tx.id,
    total: Number(tx.amount || 0),
    account: { id: account.id, name: account.name }
  })
})

// ===========================
// CONTAS A PAGAR/RECEBER
// ===========================
apiRouter.get('/scheduled', async (req, res) => {
  const { status = 'PENDING', recurring } = req.query
  const where = { tenantId: req.tenant.id }

  if (status && status !== 'ALL') {
    where.status = status
  }

  if (recurring === '1') {
    where.isRecurring = true
  }

  const payments = await prisma.scheduledPayment.findMany({
    where,
    include: { contact: true },
    orderBy: { dueDate: 'asc' }
  })
  res.json(payments)
})

apiRouter.post('/scheduled', async (req, res) => {
  const { description, amount, dueDate, type, contactId, isRecurring, recurringDay } = req.body
  const payment = await prisma.scheduledPayment.create({
    data: {
      tenantId: req.tenant.id,
      description,
      amount: parseFloat(amount),
      dueDate: new Date(dueDate),
      type: type || 'EXPENSE',
      contactId,
      isRecurring: !!isRecurring,
      recurringDay
    }
  })
  res.status(201).json(payment)
})

apiRouter.patch('/scheduled/:id/pay', async (req, res) => {
  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })
  if (!payment) return res.status(404).json({ error: 'Agendamento não encontrado.' })

  await prisma.scheduledPayment.update({
    where: { id: req.params.id },
    data: { status: 'PAID' }
  })

  // Criar transação efetiva
  const tx = await prisma.transaction.create({
    data: {
      tenantId: req.tenant.id,
      type: payment.type,
      amount: payment.amount,
      description: payment.description,
      date: new Date()
    }
  })

  res.json({ message: 'Pagamento confirmado.', transaction: tx })
})

apiRouter.patch('/scheduled/:id', async (req, res) => {
  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })

  if (!payment) return res.status(404).json({ error: 'Agendamento não encontrado.' })

  const data = {}

  if (typeof req.body?.isActive === 'boolean') {
    data.status = req.body.isActive ? 'PENDING' : 'CANCELLED'
  }

  if (req.body?.dueDate) {
    data.dueDate = new Date(req.body.dueDate)
  }

  if (req.body?.description) {
    data.description = req.body.description
  }

  if (req.body?.amount !== undefined) {
    data.amount = Number(req.body.amount)
  }

  const updated = await prisma.scheduledPayment.update({
    where: { id: req.params.id },
    data
  })

  res.json(updated)
})

apiRouter.delete('/scheduled/:id', async (req, res) => {
  const payment = await prisma.scheduledPayment.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })

  if (!payment) return res.status(404).json({ error: 'Agendamento não encontrado.' })

  await prisma.scheduledPayment.delete({ where: { id: req.params.id } })
  res.json({ message: 'Agendamento removido.' })
})

// ===========================
// CONTAS BANCÁRIAS
// ===========================
apiRouter.get('/accounts', async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { tenantId: req.tenant.id }
  })
  res.json(accounts)
})

// PATCH /api/dashboard/accounts/total-balance
apiRouter.patch('/accounts/total-balance', async (req, res) => {
  const rawValue = req.body?.totalBalance
  const totalBalance = Number(rawValue)

  if (!Number.isFinite(totalBalance)) {
    return res.status(400).json({ error: 'Informe um saldo total valido.' })
  }

  const accounts = await prisma.account.findMany({
    where: { tenantId: req.tenant.id },
    orderBy: { createdAt: 'asc' }
  })

  if (accounts.length === 0) {
    const created = await prisma.account.create({
      data: {
        tenantId: req.tenant.id,
        name: 'Caixa Principal',
        type: 'CASH',
        balance: totalBalance
      }
    })

    return res.json({
      message: 'Saldo total definido criando a primeira conta.',
      totalBalance,
      adjustedAccount: { id: created.id, name: created.name },
      deltaApplied: totalBalance
    })
  }

  const currentTotal = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0)
  const delta = totalBalance - currentTotal

  const targetAccount = accounts[0]
  await prisma.account.update({
    where: { id: targetAccount.id },
    data: { balance: { increment: delta } }
  })

  return res.json({
    message: 'Saldo total ajustado com sucesso.',
    totalBalance,
    previousTotal: currentTotal,
    deltaApplied: delta,
    adjustedAccount: { id: targetAccount.id, name: targetAccount.name }
  })
})

// ===========================
// CONTATOS
// ===========================
apiRouter.get('/contacts', async (req, res) => {
  const { type } = req.query
  const contacts = await prisma.contact.findMany({
    where: { tenantId: req.tenant.id, ...(type ? { type } : {}) },
    orderBy: { name: 'asc' }
  })
  res.json(contacts)
})

// ===========================
// METAS
// ===========================
apiRouter.get('/goals', async (req, res) => {
  const goals = await prisma.goal.findMany({ where: { tenantId: req.tenant.id } })
  res.json(goals)
})

apiRouter.post('/goals', async (req, res) => {
  const { name, targetAmount, currentAmount, deadline } = req.body

  if (!name || !targetAmount || Number(targetAmount) <= 0) {
    return res.status(400).json({ error: 'Nome e valor alvo sao obrigatorios.' })
  }

  const goal = await prisma.goal.create({
    data: {
      tenantId: req.tenant.id,
      name,
      targetAmount: Number(targetAmount),
      currentAmount: Number(currentAmount || 0),
      deadline: deadline ? new Date(deadline) : null
    }
  })

  res.status(201).json(goal)
})

apiRouter.patch('/goals/:id', async (req, res) => {
  const goal = await prisma.goal.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })

  if (!goal) return res.status(404).json({ error: 'Meta nao encontrada.' })

  const { name, targetAmount, currentAmount, deadline } = req.body

  const updated = await prisma.goal.update({
    where: { id: goal.id },
    data: {
      ...(name !== undefined && { name }),
      ...(targetAmount !== undefined && { targetAmount: Number(targetAmount) }),
      ...(currentAmount !== undefined && { currentAmount: Number(currentAmount) }),
      ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null })
    }
  })

  res.json(updated)
})

apiRouter.delete('/goals/:id', async (req, res) => {
  const goal = await prisma.goal.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })

  if (!goal) return res.status(404).json({ error: 'Meta nao encontrada.' })

  await prisma.goal.delete({ where: { id: goal.id } })
  res.json({ message: 'Meta removida.' })
})

apiRouter.post('/simulate-purchase', async (req, res) => {
  const { amount, description } = req.body
  const value = Number(amount)

  if (!value || value <= 0) {
    return res.status(400).json({ error: 'Valor da compra invalido.' })
  }

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const [incomeAgg, expenseAgg, goal] = await Promise.all([
    prisma.transaction.aggregate({
      where: { tenantId: req.tenant.id, type: 'INCOME', date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { tenantId: req.tenant.id, type: 'EXPENSE', date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true }
    }),
    prisma.goal.findFirst({ where: { tenantId: req.tenant.id }, orderBy: { createdAt: 'asc' } })
  ])

  const monthIncome = incomeAgg._sum.amount || 0
  const monthExpense = expenseAgg._sum.amount || 0
  const currentSavings = monthIncome - monthExpense
  const projectedSavings = currentSavings - value

  let monthsDelay = null
  let beforeMonths = null
  let afterMonths = null

  if (goal) {
    const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0)
    if (remaining > 0 && currentSavings > 0) {
      beforeMonths = Math.ceil(remaining / currentSavings)
    }
    if (remaining > 0 && projectedSavings > 0) {
      afterMonths = Math.ceil(remaining / projectedSavings)
    }
    if (beforeMonths !== null && afterMonths !== null) {
      monthsDelay = Math.max(afterMonths - beforeMonths, 0)
    }
  }

  const canAfford = projectedSavings >= 0

  res.json({
    canAfford,
    description: description || 'Compra simulada',
    amount: value,
    currentMonthlySavings: currentSavings,
    projectedMonthlySavings: projectedSavings,
    mainGoal: goal
      ? {
          id: goal.id,
          name: goal.name,
          targetAmount: goal.targetAmount,
          currentAmount: goal.currentAmount
        }
      : null,
    goalDelayMonths: monthsDelay,
    message: canAfford
      ? `Pode comprar. A economia mensal estimada fica em R$ ${projectedSavings.toFixed(2)}.`
      : `Pode comprometer o mes. A economia mensal estimada fica em R$ ${projectedSavings.toFixed(2)}.`
  })
})

apiRouter.post('/digests/daily/trigger', async (_req, res) => {
  await triggerDailyDigestNow()
  res.json({ message: 'Resumo diario disparado.' })
})

apiRouter.post('/digests/weekly/trigger', async (_req, res) => {
  await triggerWeeklyDigestNow()
  res.json({ message: 'Resumo semanal disparado.' })
})

apiRouter.get('/notification-settings', async (req, res) => {
  const settings = await prisma.tenantNotificationSettings.upsert({
    where: { tenantId: req.tenant.id },
    update: {},
    create: { tenantId: req.tenant.id }
  })
  res.json(settings)
})

apiRouter.put('/notification-settings', async (req, res) => {
  const {
    timezone,
    remindersEnabled,
    remindersHour,
    dailyDigestEnabled,
    dailyDigestHour,
    weeklyDigestEnabled,
    weeklyDigestWeekday,
    weeklyDigestHour,
    cashflowAlertEnabled
  } = req.body

  const updated = await prisma.tenantNotificationSettings.upsert({
    where: { tenantId: req.tenant.id },
    update: {
      ...(timezone !== undefined && { timezone: String(timezone) }),
      ...(remindersEnabled !== undefined && { remindersEnabled: !!remindersEnabled }),
      ...(remindersHour !== undefined && { remindersHour: Number(remindersHour) }),
      ...(dailyDigestEnabled !== undefined && { dailyDigestEnabled: !!dailyDigestEnabled }),
      ...(dailyDigestHour !== undefined && { dailyDigestHour: Number(dailyDigestHour) }),
      ...(weeklyDigestEnabled !== undefined && { weeklyDigestEnabled: !!weeklyDigestEnabled }),
      ...(weeklyDigestWeekday !== undefined && { weeklyDigestWeekday: Number(weeklyDigestWeekday) }),
      ...(weeklyDigestHour !== undefined && { weeklyDigestHour: Number(weeklyDigestHour) }),
      ...(cashflowAlertEnabled !== undefined && { cashflowAlertEnabled: !!cashflowAlertEnabled })
    },
    create: {
      tenantId: req.tenant.id,
      timezone: timezone !== undefined ? String(timezone) : 'America/Sao_Paulo',
      remindersEnabled: remindersEnabled !== undefined ? !!remindersEnabled : true,
      remindersHour: remindersHour !== undefined ? Number(remindersHour) : 8,
      dailyDigestEnabled: dailyDigestEnabled !== undefined ? !!dailyDigestEnabled : true,
      dailyDigestHour: dailyDigestHour !== undefined ? Number(dailyDigestHour) : 20,
      weeklyDigestEnabled: weeklyDigestEnabled !== undefined ? !!weeklyDigestEnabled : true,
      weeklyDigestWeekday: weeklyDigestWeekday !== undefined ? Number(weeklyDigestWeekday) : 0,
      weeklyDigestHour: weeklyDigestHour !== undefined ? Number(weeklyDigestHour) : 19,
      cashflowAlertEnabled: cashflowAlertEnabled !== undefined ? !!cashflowAlertEnabled : true
    }
  })

  res.json(updated)
})
