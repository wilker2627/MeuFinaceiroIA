import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { startOfDay, startOfMonth, startOfWeek, subDays, endOfDay } from 'date-fns'
import { prisma } from '../config/database.js'
import { authenticateAdminToken, generateAdminToken } from '../middleware/adminAuth.js'
import { getSessionStatus, sendSystemMessageToPhone, sendSystemMessageToSession } from '../services/whatsappManager.js'
import { seedDefaultCategories } from '../services/categoryService.js'

export const adminRouter = Router()

const FALLBACK_PLANS = [
  { code: 'FREE', name: 'Plano Gratuito', priceCents: 0, messageLimit: 200, userLimit: 1, accountLimit: 1, features: '200 mensagens, 1 usuario, 1 conta' },
  { code: 'FAMILIA', name: 'Familia', priceCents: 3990, messageLimit: null, userLimit: 2, accountLimit: 3, features: 'IA ilimitada, dashboard e relatorios' },
  { code: 'FAMILIA_PLUS', name: 'Familia Plus', priceCents: 6990, messageLimit: null, userLimit: 5, accountLimit: 8, features: 'Metas, cartoes, bancos e IA premium' },
  { code: 'PREMIUM', name: 'Premium', priceCents: 9990, messageLimit: null, userLimit: 10, accountLimit: 20, features: 'Tudo liberado' },
  { code: 'STARTER', name: 'Starter', priceCents: 1990, messageLimit: 500, userLimit: 1, accountLimit: 2, features: 'Plano de entrada' },
  { code: 'LIFETIME', name: 'Lifetime', priceCents: 29990, messageLimit: null, userLimit: 5, accountLimit: 10, features: 'Pagamento unico' },
  { code: 'EMPRESA', name: 'Empresa', priceCents: 19990, messageLimit: null, userLimit: 25, accountLimit: 50, features: 'Operacao para equipe' }
]

const DEFAULT_ROLES = [
  { role: 'ADMINISTRADOR', scopes: ['overview', 'clientes', 'planos', 'cupons', 'suporte', 'financeiro', 'ia', 'whatsapp', 'updates'] },
  { role: 'SUPORTE', scopes: ['clientes', 'suporte', 'whatsapp'] },
  { role: 'FINANCEIRO', scopes: ['overview', 'financeiro', 'planos', 'cupons'] },
  { role: 'DESENVOLVEDOR', scopes: ['ia', 'whatsapp', 'updates'] }
]

function normalizePlanCode(input = '') {
  return String(input)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
}

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase()
}

function formatCurrencyBRL(cents) {
  return Number(cents || 0) / 100
}

async function ensureBusinessSeed() {
  const plansCount = await prisma.adminPlan.count()
  if (plansCount === 0) {
    for (const plan of FALLBACK_PLANS) {
      await prisma.adminPlan.upsert({
        where: { code: plan.code },
        update: {},
        create: plan
      })
    }
  }

  await prisma.adminAiPolicy.upsert({
    where: { policyKey: 'default' },
    update: {},
    create: {
      policyKey: 'default',
      modelName: 'gpt-4o-mini',
      dailyLimit: 5000,
      monthlyLimit: 100000,
      messagesPerTenant: 2000
    }
  })
}

async function getPlanPriceMap() {
  await ensureBusinessSeed()
  const plans = await prisma.adminPlan.findMany({ where: { isActive: true } })

  const map = new Map()
  for (const p of plans) map.set(p.code, p.priceCents)

  for (const fallback of FALLBACK_PLANS) {
    if (!map.has(fallback.code)) map.set(fallback.code, fallback.priceCents)
  }

  return map
}

function getSubscriptionStatus(tenant) {
  if (!tenant.isActive) return 'CANCELED'
  if (!tenant.planExpiresAt) return 'ACTIVE'
  return tenant.planExpiresAt < new Date() ? 'TRIAL' : 'ACTIVE'
}

adminRouter.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')

  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'admin@financeia.local')
  const adminPassword = String(process.env.ADMIN_PASSWORD || 'admin123456')

  if (email !== adminEmail || password !== adminPassword) {
    return res.status(401).json({ error: 'Credenciais admin invalidas.' })
  }

  const token = generateAdminToken({ email: adminEmail, role: 'ADMINISTRADOR' })
  res.json({
    token,
    admin: {
      email: adminEmail,
      role: 'ADMINISTRADOR'
    }
  })
})

adminRouter.use(authenticateAdminToken)

adminRouter.get('/overview', async (_req, res) => {
  const priceMap = await getPlanPriceMap()
  const startToday = startOfDay(new Date())
  const startMonth = startOfMonth(new Date())

  const tenants = await prisma.tenant.findMany({
    select: { id: true, plan: true, isActive: true, createdAt: true }
  })

  const clientsActive = tenants.filter((t) => t.isActive).length
  const cancelamentos = tenants.filter((t) => !t.isActive).length
  const novosClientes = tenants.filter((t) => t.createdAt >= startMonth).length
  const mrrCents = tenants
    .filter((t) => t.isActive)
    .reduce((sum, t) => sum + (priceMap.get(normalizePlanCode(t.plan)) || 0), 0)

  const mensagensHoje = await prisma.transaction.count({
    where: {
      rawMessage: { not: null },
      createdAt: { gte: startToday }
    }
  })

  res.json({
    clientsActive,
    mrr: formatCurrencyBRL(mrrCents),
    cancelamentos,
    novosClientes,
    mensagensHoje
  })
})

adminRouter.get('/clients', async (req, res) => {
  const search = String(req.query.search || '').trim()

  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } }
        ]
      }
    : {}

  const clients = await prisma.tenant.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      _count: {
        select: {
          tenantUsers: true,
          whatsappSessions: true
        }
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true }
      }
    }
  })

  res.json(clients.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    plan: c.plan,
    status: getSubscriptionStatus(c),
    since: c.createdAt,
    renewal: c.planExpiresAt,
    users: c._count.tenantUsers,
    whatsappLinked: c._count.whatsappSessions,
    lastAccess: c.transactions[0]?.createdAt || c.updatedAt
  })))
})

adminRouter.post('/clients', async (req, res) => {
  const { name, email, password, plan = 'FREE', isActive = true, whatsappPhone = '' } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha sao obrigatorios.' })
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Senha deve ter no minimo 8 caracteres.' })
  }

  const normalizedEmail = String(email).trim().toLowerCase()
  const exists = await prisma.tenant.findUnique({ where: { email: normalizedEmail } })
  if (exists) {
    return res.status(409).json({ error: 'E-mail ja cadastrado.' })
  }

  const passwordHash = await bcrypt.hash(String(password), 12)
  const tenant = await prisma.tenant.create({
    data: {
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      plan: normalizePlanCode(plan),
      isActive: !!isActive
    }
  })

  await prisma.account.createMany({
    data: [
      { tenantId: tenant.id, name: 'Caixa', type: 'CASH', balance: 0 },
      { tenantId: tenant.id, name: 'Banco', type: 'CHECKING', balance: 0 }
    ]
  })
  await seedDefaultCategories(tenant.id)

  const welcome = {
    attempted: false,
    sent: false,
    sessionId: null,
    error: null,
    targetPhone: null
  }

  const normalizedPhone = String(whatsappPhone || '').replace(/\D/g, '')
  if (normalizedPhone) {
    welcome.attempted = true
    welcome.targetPhone = normalizedPhone

    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000'
    const loginUrl = `${frontendBase}/login`
    const dashboardUrl = `${frontendBase}/dashboard`

    const message = [
      `Ola, ${tenant.name}! Bem-vindo(a) ao FinanceiroAI.`,
      '',
      'Seus dados de acesso:',
      `Login: ${tenant.email}`,
      `Senha inicial: ${String(password)}`,
      '',
      `Entrar: ${loginUrl}`,
      `Dashboard: ${dashboardUrl}`,
      '',
      'Por seguranca, altere sua senha no primeiro acesso.'
    ].join('\n')

    try {
      const sent = await sendSystemMessageToPhone(normalizedPhone, message)
      welcome.sent = true
      welcome.sessionId = sent.sessionId
    } catch (error) {
      welcome.error = error?.message || 'Falha ao enviar WhatsApp de boas-vindas.'
    }
  }

  res.status(201).json({
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    plan: tenant.plan,
    status: getSubscriptionStatus(tenant),
    createdAt: tenant.createdAt,
    welcome
  })
})

adminRouter.get('/clients/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return res.status(404).json({ error: 'Cliente nao encontrado.' })

  const [
    usersCount,
    whatsappCount,
    transactionsCount,
    categoriesCount,
    accountsCount,
    aiMessagesCount,
    incomeAgg,
    expenseAgg
  ] = await Promise.all([
    prisma.tenantUser.count({ where: { tenantId, isActive: true } }),
    prisma.whatsAppSession.count({ where: { tenantId } }),
    prisma.transaction.count({ where: { tenantId } }),
    prisma.category.count({ where: { tenantId } }),
    prisma.account.count({ where: { tenantId } }),
    prisma.transaction.count({ where: { tenantId, rawMessage: { not: null } } }),
    prisma.transaction.aggregate({ where: { tenantId, type: 'INCOME' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { tenantId, type: 'EXPENSE' }, _sum: { amount: true } })
  ])

  const estimatedStorageMB = Number(((transactionsCount + categoriesCount + accountsCount + aiMessagesCount) * 0.002).toFixed(2))

  res.json({
    profile: {
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      phone: null,
      plan: tenant.plan,
      status: getSubscriptionStatus(tenant),
      createdAt: tenant.createdAt,
      renewal: tenant.planExpiresAt,
      paymentMethod: 'Nao informado',
      users: usersCount,
      whatsappsLinked: whatsappCount
    },
    metrics: {
      lancamentos: transactionsCount,
      categorias: categoriesCount,
      contas: accountsCount,
      mensagensIA: aiMessagesCount,
      espacoMB: estimatedStorageMB
    },
    statistics: {
      receitasRegistradas: incomeAgg._sum.amount || 0,
      despesasRegistradas: expenseAgg._sum.amount || 0
    }
  })
})

adminRouter.patch('/clients/:tenantId/status', async (req, res) => {
  const tenantId = req.params.tenantId
  const { isActive } = req.body

  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive deve ser boolean.' })
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive }
  })

  res.json({
    id: updated.id,
    isActive: updated.isActive,
    status: getSubscriptionStatus(updated)
  })
})

adminRouter.patch('/clients/:tenantId/plan', async (req, res) => {
  const tenantId = req.params.tenantId
  const { plan, planExpiresAt } = req.body

  if (!plan) {
    return res.status(400).json({ error: 'Plano obrigatorio.' })
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan: normalizePlanCode(plan),
      ...(planExpiresAt !== undefined && { planExpiresAt: planExpiresAt ? new Date(planExpiresAt) : null })
    }
  })

  res.json({
    id: updated.id,
    plan: updated.plan,
    renewal: updated.planExpiresAt
  })
})

adminRouter.delete('/clients/:tenantId', async (req, res) => {
  const tenantId = req.params.tenantId

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return res.status(404).json({ error: 'Cliente nao encontrado.' })

  await prisma.$transaction([
    prisma.billingCheckout.updateMany({
      where: { tenantId },
      data: { tenantId: null }
    }),
    prisma.tenant.delete({ where: { id: tenantId } })
  ])

  res.json({ message: 'Cliente removido com sucesso.' })
})

adminRouter.get('/commercial', async (_req, res) => {
  const priceMap = await getPlanPriceMap()
  const now = new Date()
  const startToday = startOfDay(now)
  const startYesterday = startOfDay(subDays(now, 1))
  const endYesterday = endOfDay(subDays(now, 1))
  const startMonthDate = startOfMonth(now)
  const startYear = new Date(now.getFullYear(), 0, 1)

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { plan: true, createdAt: true }
  })

  const today = tenants
    .filter((t) => t.createdAt >= startToday)
    .reduce((sum, t) => sum + (priceMap.get(normalizePlanCode(t.plan)) || 0), 0)

  const yesterday = tenants
    .filter((t) => t.createdAt >= startYesterday && t.createdAt <= endYesterday)
    .reduce((sum, t) => sum + (priceMap.get(normalizePlanCode(t.plan)) || 0), 0)

  const month = tenants
    .filter((t) => t.createdAt >= startMonthDate)
    .reduce((sum, t) => sum + (priceMap.get(normalizePlanCode(t.plan)) || 0), 0)

  const year = tenants
    .filter((t) => t.createdAt >= startYear)
    .reduce((sum, t) => sum + (priceMap.get(normalizePlanCode(t.plan)) || 0), 0)

  res.json({
    today: formatCurrencyBRL(today),
    yesterday: formatCurrencyBRL(yesterday),
    month: formatCurrencyBRL(month),
    year: formatCurrencyBRL(year)
  })
})

adminRouter.get('/growth', async (_req, res) => {
  const now = new Date()
  const startWeekDate = startOfWeek(now, { weekStartsOn: 1 })
  const startMonthDate = startOfMonth(now)

  const priceMap = await getPlanPriceMap()
  const tenants = await prisma.tenant.findMany({
    select: { id: true, isActive: true, plan: true, createdAt: true, updatedAt: true, planExpiresAt: true }
  })

  const active = tenants.filter((t) => t.isActive)
  const inactiveThisMonth = tenants.filter((t) => !t.isActive && t.updatedAt >= startMonthDate)
  const newWeek = tenants.filter((t) => t.createdAt >= startWeekDate)

  const mrrCents = active.reduce((sum, t) => sum + (priceMap.get(normalizePlanCode(t.plan)) || 0), 0)
  const arrCents = mrrCents * 12
  const churn = tenants.length ? Number(((inactiveThisMonth.length / tenants.length) * 100).toFixed(2)) : 0

  const pendingPayments = tenants.filter((t) => t.planExpiresAt && t.planExpiresAt < now && t.isActive).length

  const planSales = new Map()
  for (const t of active) {
    const key = normalizePlanCode(t.plan)
    planSales.set(key, (planSales.get(key) || 0) + 1)
  }
  const bestPlan = [...planSales.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'FREE'

  const ticketMedio = active.length ? Number((formatCurrencyBRL(mrrCents) / active.length).toFixed(2)) : 0

  const totalMessages = await prisma.transaction.count({ where: { rawMessage: { not: null } } })
  const avgAiCostClient = active.length ? Number(((totalMessages / active.length) * 0.004).toFixed(2)) : 0
  const lucroPorCliente = Number((ticketMedio - avgAiCostClient - 3.2).toFixed(2))

  const [checkoutStarted, paymentApproved, tenantCreated] = await Promise.all([
    prisma.onboardingEvent.count({ where: { eventType: 'CHECKOUT_CREATED', createdAt: { gte: startMonthDate } } }),
    prisma.onboardingEvent.count({ where: { eventType: { in: ['PAYMENT_APPROVED_WEBHOOK', 'PAYMENT_APPROVED_AUTO'] }, createdAt: { gte: startMonthDate } } }),
    prisma.onboardingEvent.count({ where: { eventType: 'TENANT_CREATED', createdAt: { gte: startMonthDate } } })
  ])

  const conversionCheckoutToPaid = checkoutStarted > 0
    ? Number(((paymentApproved / checkoutStarted) * 100).toFixed(2))
    : 0

  res.json({
    mrr: formatCurrencyBRL(mrrCents),
    arr: formatCurrencyBRL(arrCents),
    clientesAtivos: active.length,
    novosSemana: newWeek.length,
    churn,
    pagamentosPendentes: pendingPayments,
    planoMaisVendido: bestPlan,
    ticketMedio,
    mensagensProcessadas: totalMessages,
    custoMedioIACliente: avgAiCostClient,
    lucroPorCliente,
    funil: {
      checkoutStarted,
      paymentApproved,
      tenantCreated,
      conversionCheckoutToPaid
    }
  })
})

adminRouter.get('/plans', async (_req, res) => {
  await ensureBusinessSeed()
  const plans = await prisma.adminPlan.findMany({ orderBy: { priceCents: 'asc' } })
  res.json(plans)
})

adminRouter.post('/plans', async (req, res) => {
  const payload = req.body
  const created = await prisma.adminPlan.create({
    data: {
      code: normalizePlanCode(payload.code || payload.name),
      name: payload.name,
      priceCents: Number(payload.priceCents || 0),
      messageLimit: payload.messageLimit !== undefined ? Number(payload.messageLimit) : null,
      userLimit: payload.userLimit !== undefined ? Number(payload.userLimit) : null,
      accountLimit: payload.accountLimit !== undefined ? Number(payload.accountLimit) : null,
      features: payload.features || null,
      isActive: payload.isActive !== false
    }
  })
  res.status(201).json(created)
})

adminRouter.put('/plans/:id', async (req, res) => {
  const payload = req.body
  const updated = await prisma.adminPlan.update({
    where: { id: req.params.id },
    data: {
      ...(payload.code !== undefined && { code: normalizePlanCode(payload.code) }),
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.priceCents !== undefined && { priceCents: Number(payload.priceCents) }),
      ...(payload.messageLimit !== undefined && { messageLimit: payload.messageLimit === null ? null : Number(payload.messageLimit) }),
      ...(payload.userLimit !== undefined && { userLimit: payload.userLimit === null ? null : Number(payload.userLimit) }),
      ...(payload.accountLimit !== undefined && { accountLimit: payload.accountLimit === null ? null : Number(payload.accountLimit) }),
      ...(payload.features !== undefined && { features: payload.features }),
      ...(payload.isActive !== undefined && { isActive: !!payload.isActive })
    }
  })
  res.json(updated)
})

adminRouter.get('/coupons', async (_req, res) => {
  const coupons = await prisma.adminCoupon.findMany({ orderBy: { createdAt: 'desc' } })
  res.json(coupons)
})

adminRouter.post('/coupons', async (req, res) => {
  const payload = req.body
  const created = await prisma.adminCoupon.create({
    data: {
      code: String(payload.code || '').trim().toUpperCase(),
      description: payload.description || null,
      discountPercent: payload.discountPercent !== undefined ? Number(payload.discountPercent) : null,
      firstMonthFree: !!payload.firstMonthFree,
      isActive: payload.isActive !== false,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null
    }
  })
  res.status(201).json(created)
})

adminRouter.put('/coupons/:id', async (req, res) => {
  const payload = req.body
  const updated = await prisma.adminCoupon.update({
    where: { id: req.params.id },
    data: {
      ...(payload.description !== undefined && { description: payload.description }),
      ...(payload.discountPercent !== undefined && { discountPercent: payload.discountPercent === null ? null : Number(payload.discountPercent) }),
      ...(payload.firstMonthFree !== undefined && { firstMonthFree: !!payload.firstMonthFree }),
      ...(payload.isActive !== undefined && { isActive: !!payload.isActive }),
      ...(payload.expiresAt !== undefined && { expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null })
    }
  })
  res.json(updated)
})

adminRouter.get('/ai-policy', async (_req, res) => {
  await ensureBusinessSeed()
  const policy = await prisma.adminAiPolicy.findUnique({ where: { policyKey: 'default' } })
  res.json(policy)
})

adminRouter.put('/ai-policy', async (req, res) => {
  const payload = req.body
  const updated = await prisma.adminAiPolicy.upsert({
    where: { policyKey: 'default' },
    update: {
      ...(payload.modelName !== undefined && { modelName: payload.modelName }),
      ...(payload.dailyLimit !== undefined && { dailyLimit: Number(payload.dailyLimit) }),
      ...(payload.monthlyLimit !== undefined && { monthlyLimit: Number(payload.monthlyLimit) }),
      ...(payload.messagesPerTenant !== undefined && { messagesPerTenant: Number(payload.messagesPerTenant) })
    },
    create: {
      policyKey: 'default',
      modelName: payload.modelName || 'gpt-4o-mini',
      dailyLimit: Number(payload.dailyLimit || 5000),
      monthlyLimit: Number(payload.monthlyLimit || 100000),
      messagesPerTenant: Number(payload.messagesPerTenant || 2000)
    }
  })
  res.json(updated)
})

adminRouter.get('/whatsapp', async (_req, res) => {
  const sessions = await prisma.whatsAppSession.findMany({
    include: { tenant: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' }
  })

  res.json(sessions.map((s) => ({
    id: s.id,
    tenantId: s.tenantId,
    tenantName: s.tenant.name,
    tenantEmail: s.tenant.email,
    phoneNumber: s.phoneNumber,
    connected: s.isActive,
    status: getSessionStatus(s.id),
    lastSync: s.connectedAt,
    qrRequired: getSessionStatus(s.id) === 'QR_READY'
  })))
})

adminRouter.get('/statistics', async (_req, res) => {
  const [
    clients,
    messages,
    lancamentos,
    receitas,
    despesas
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.transaction.count({ where: { rawMessage: { not: null } } }),
    prisma.transaction.count(),
    prisma.transaction.aggregate({ where: { type: 'INCOME' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { type: 'EXPENSE' }, _sum: { amount: true } })
  ])

  res.json({
    clientes: clients,
    mensagens: messages,
    lancamentos,
    receitasRegistradas: receitas._sum.amount || 0,
    despesasRegistradas: despesas._sum.amount || 0
  })
})

adminRouter.get('/support/tickets', async (req, res) => {
  const search = String(req.query.search || '')
  const where = search
    ? {
        OR: [
          { subject: { contains: search } },
          { tenant: { name: { contains: search } } },
          { tenant: { email: { contains: search } } }
        ]
      }
    : {}

  const tickets = await prisma.supportTicket.findMany({
    where,
    include: { tenant: { select: { name: true, email: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 100
  })

  res.json(tickets)
})

adminRouter.post('/support/tickets', async (req, res) => {
  const { tenantId, subject, priority, message } = req.body

  if (!tenantId || !subject) {
    return res.status(400).json({ error: 'tenantId e subject sao obrigatorios.' })
  }

  const created = await prisma.supportTicket.create({
    data: {
      tenantId,
      subject,
      priority: priority || 'NORMAL',
      lastMessage: message || null
    }
  })

  res.status(201).json(created)
})

adminRouter.patch('/support/tickets/:id', async (req, res) => {
  const updated = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data: {
      ...(req.body.status !== undefined && { status: req.body.status }),
      ...(req.body.priority !== undefined && { priority: req.body.priority }),
      ...(req.body.lastMessage !== undefined && { lastMessage: req.body.lastMessage })
    }
  })

  res.json(updated)
})

adminRouter.post('/updates/broadcast', async (req, res) => {
  const { title, message } = req.body
  if (!message) return res.status(400).json({ error: 'Mensagem obrigatoria.' })

  const sessions = await prisma.whatsAppSession.findMany({ where: { isActive: true } })
  let sent = 0

  for (const session of sessions) {
    try {
      await sendSystemMessageToSession(session.id, `📢 ${title || 'Atualizacao'}\n\n${message}`, session.phoneNumber)
      sent += 1
    } catch {
      // Ignora falha individual para seguir broadcast.
    }
  }

  await prisma.adminAnnouncement.create({
    data: {
      title: title || 'Atualizacao',
      message,
      sentCount: sent
    }
  })

  res.json({ sent, total: sessions.length })
})

adminRouter.get('/updates/history', async (_req, res) => {
  const history = await prisma.adminAnnouncement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30
  })
  res.json(history)
})

adminRouter.get('/permissions', (_req, res) => {
  res.json(DEFAULT_ROLES)
})
