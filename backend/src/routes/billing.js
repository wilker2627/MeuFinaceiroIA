import { Router } from 'express'
import bcrypt from 'bcryptjs'
import axios from 'axios'
import { addDays } from 'date-fns'
import { prisma } from '../config/database.js'
import { generateToken } from '../middleware/auth.js'
import { seedDefaultCategories } from '../services/categoryService.js'

export const billingRouter = Router()

const FALLBACK_PLANS = [
  { code: 'FREE', name: 'Plano Gratuito', priceCents: 0, messageLimit: 200, userLimit: 1, accountLimit: 1, features: '200 mensagens, 1 usuario, 1 conta' },
  { code: 'FAMILIA', name: 'Familia', priceCents: 3990, messageLimit: null, userLimit: 2, accountLimit: 3, features: 'IA ilimitada, dashboard e relatorios' },
  { code: 'FAMILIA_PLUS', name: 'Familia Plus', priceCents: 6990, messageLimit: null, userLimit: 5, accountLimit: 8, features: 'Metas, cartoes, bancos e IA premium' },
  { code: 'PREMIUM', name: 'Premium', priceCents: 9990, messageLimit: null, userLimit: 10, accountLimit: 20, features: 'Tudo liberado' },
  { code: 'STARTER', name: 'Starter', priceCents: 1990, messageLimit: 500, userLimit: 1, accountLimit: 2, features: 'Plano de entrada' },
  { code: 'LIFETIME', name: 'Lifetime', priceCents: 29990, messageLimit: null, userLimit: 5, accountLimit: 10, features: 'Pagamento unico' },
  { code: 'EMPRESA', name: 'Empresa', priceCents: 19990, messageLimit: null, userLimit: 25, accountLimit: 50, features: 'Operacao para equipe' }
]

function normalizePlanCode(input = '') {
  return String(input).trim().toUpperCase().replace(/\s+/g, '_')
}

async function logOnboardingEvent({ checkoutId = null, email = 'unknown', eventType, metadata = null }) {
  await prisma.onboardingEvent.create({
    data: {
      checkoutId,
      email: String(email).toLowerCase(),
      eventType,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  })
}

function extractWebhookSecret(req) {
  return req.headers['x-webhook-secret'] || req.query?.secret || req.body?.secret || null
}

function isApprovedStatus(status) {
  const s = String(status || '').toLowerCase()
  return s === 'approved' || s === 'paid' || s === 'success'
}

async function resolveCheckoutFromWebhook(payload) {
  const rawCheckoutId = payload?.checkoutId || payload?.external_reference || null
  const rawStatus = payload?.status || payload?.payment_status || null

  if (rawCheckoutId) {
    return { checkoutId: String(rawCheckoutId), status: rawStatus }
  }

  const type = String(payload?.type || payload?.action || '').toLowerCase()
  const paymentId = payload?.data?.id || payload?.id
  if (!paymentId || !type.includes('payment')) return { checkoutId: null, status: rawStatus }

  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) return { checkoutId: null, status: rawStatus }

  try {
    const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000
    })

    return {
      checkoutId: response.data?.external_reference || null,
      status: response.data?.status || rawStatus
    }
  } catch {
    return { checkoutId: null, status: rawStatus }
  }
}

async function ensurePlansSeed() {
  const count = await prisma.adminPlan.count()
  if (count === 0) {
    for (const plan of FALLBACK_PLANS) {
      await prisma.adminPlan.upsert({
        where: { code: plan.code },
        update: {},
        create: {
          code: plan.code,
          name: plan.name,
          priceCents: plan.priceCents,
          messageLimit: plan.messageLimit,
          userLimit: plan.userLimit,
          accountLimit: plan.accountLimit,
          features: plan.features,
          isActive: true
        }
      })
    }
  }
}

async function getPlanByCode(planCode) {
  await ensurePlansSeed()

  const code = normalizePlanCode(planCode)
  const plan = await prisma.adminPlan.findUnique({ where: { code } })
  if (plan) return plan

  return FALLBACK_PLANS.find((p) => p.code === code) || null
}

function computePlanExpiration(planCode) {
  const code = normalizePlanCode(planCode)
  if (code === 'LIFETIME') return addDays(new Date(), 365 * 20)
  return addDays(new Date(), 30)
}

async function activateCheckout(checkoutId) {
  const checkout = await prisma.billingCheckout.findUnique({ where: { id: checkoutId } })
  if (!checkout) throw new Error('Checkout nao encontrado.')

  if (checkout.status === 'PAID' && checkout.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: checkout.tenantId } })
    if (tenant) {
      const token = generateToken(tenant)
      const { passwordHash: _, ...tenantData } = tenant
      return { tenant: tenantData, token }
    }
  }

  if (checkout.status !== 'PENDING') {
    throw new Error('Checkout nao esta pendente.')
  }

  const exists = await prisma.tenant.findUnique({ where: { email: checkout.email } })
  if (exists) {
    await prisma.billingCheckout.update({
      where: { id: checkout.id },
      data: {
        status: 'PAID',
        tenantId: exists.id
      }
    })
    await logOnboardingEvent({
      checkoutId: checkout.id,
      email: checkout.email,
      eventType: 'TENANT_LINKED_EXISTING',
      metadata: { tenantId: exists.id }
    })
    const token = generateToken(exists)
    const { passwordHash: _, ...tenantData } = exists
    return { tenant: tenantData, token }
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: checkout.tenantName,
      email: checkout.email,
      passwordHash: checkout.passwordHash,
      plan: normalizePlanCode(checkout.planCode),
      isActive: true,
      planExpiresAt: computePlanExpiration(checkout.planCode)
    }
  })

  await prisma.account.createMany({
    data: [
      { tenantId: tenant.id, name: 'Caixa', type: 'CASH', balance: 0 },
      { tenantId: tenant.id, name: 'Banco', type: 'CHECKING', balance: 0 }
    ]
  })
  await seedDefaultCategories(tenant.id)

  await prisma.billingCheckout.update({
    where: { id: checkout.id },
    data: {
      status: 'PAID',
      tenantId: tenant.id
    }
  })

  await logOnboardingEvent({
    checkoutId: checkout.id,
    email: checkout.email,
    eventType: 'TENANT_CREATED',
    metadata: { tenantId: tenant.id, plan: tenant.plan }
  })

  const token = generateToken(tenant)
  const { passwordHash: _, ...tenantData } = tenant
  return { tenant: tenantData, token }
}

async function createMercadoPagoCheckout({ title, amountCents, checkoutId }) {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) return null

  const amount = Number((amountCents / 100).toFixed(2))
  const base = process.env.FRONTEND_URL || 'http://localhost:3000'

  const response = await axios.post(
    'https://api.mercadopago.com/checkout/preferences',
    {
      items: [
        {
          title,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: amount
        }
      ],
      external_reference: checkoutId,
      back_urls: {
        success: `${base}/subscribe/success?checkoutId=${checkoutId}`,
        failure: `${base}/subscribe/failure?checkoutId=${checkoutId}`,
        pending: `${base}/subscribe/pending?checkoutId=${checkoutId}`
      },
      auto_return: 'approved'
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  )

  return {
    id: response.data.id,
    url: response.data.init_point
  }
}

billingRouter.get('/plans', async (_req, res) => {
  await ensurePlansSeed()
  const plans = await prisma.adminPlan.findMany({ where: { isActive: true }, orderBy: { priceCents: 'asc' } })
  res.json(plans)
})

billingRouter.post('/checkout', async (req, res) => {
  const { name, email, password, planCode, couponCode } = req.body

  if (!name || !email || !password || !planCode) {
    return res.status(400).json({ error: 'Nome, email, senha e plano sao obrigatorios.' })
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Senha deve ter no minimo 8 caracteres.' })
  }

  const existingTenant = await prisma.tenant.findUnique({ where: { email } })
  if (existingTenant) {
    return res.status(409).json({ error: 'E-mail ja cadastrado. Faca login para continuar.' })
  }

  const plan = await getPlanByCode(planCode)
  if (!plan) return res.status(404).json({ error: 'Plano nao encontrado.' })

  let finalAmountCents = Number(plan.priceCents || 0)
  let coupon = null

  if (couponCode) {
    coupon = await prisma.adminCoupon.findUnique({ where: { code: String(couponCode).trim().toUpperCase() } })
    if (coupon && coupon.isActive) {
      if (coupon.firstMonthFree) {
        finalAmountCents = 0
      } else if (coupon.discountPercent) {
        finalAmountCents = Math.max(0, Math.round(finalAmountCents * (1 - (coupon.discountPercent / 100))))
      }
    }
  }

  const passwordHash = await bcrypt.hash(String(password), 12)

  const checkout = await prisma.billingCheckout.create({
    data: {
      tenantName: String(name),
      email: String(email).toLowerCase(),
      passwordHash,
      planCode: normalizePlanCode(plan.code),
      baseAmountCents: Number(plan.priceCents || 0),
      finalAmountCents,
      couponCode: coupon?.code || null,
      status: 'PENDING',
      paymentProvider: process.env.MP_ACCESS_TOKEN ? 'MERCADOPAGO' : 'INTERNAL'
    }
  })

  await logOnboardingEvent({
    checkoutId: checkout.id,
    email: checkout.email,
    eventType: 'CHECKOUT_CREATED',
    metadata: {
      planCode: checkout.planCode,
      baseAmountCents: checkout.baseAmountCents,
      finalAmountCents: checkout.finalAmountCents,
      couponCode: checkout.couponCode
    }
  })

  if (checkout.couponCode) {
    await logOnboardingEvent({
      checkoutId: checkout.id,
      email: checkout.email,
      eventType: 'COUPON_APPLIED',
      metadata: { couponCode: checkout.couponCode }
    })
  }

  if (finalAmountCents === 0) {
    const activated = await activateCheckout(checkout.id)
    await logOnboardingEvent({
      checkoutId: checkout.id,
      email: checkout.email,
      eventType: 'PAYMENT_APPROVED_AUTO',
      metadata: { reason: 'FREE_OR_ZERO_VALUE_CHECKOUT' }
    })
    return res.status(201).json({
      checkoutId: checkout.id,
      status: 'PAID',
      amountCents: finalAmountCents,
      autoActivated: true,
      ...activated
    })
  }

  let checkoutUrl = null
  let providerReference = null
  let simulated = false

  try {
    const mp = await createMercadoPagoCheckout({
      title: `FinanceIA - Plano ${plan.name}`,
      amountCents: finalAmountCents,
      checkoutId: checkout.id
    })

    if (mp) {
      checkoutUrl = mp.url
      providerReference = mp.id
    } else {
      simulated = true
      checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscribe/pending?checkoutId=${checkout.id}`
    }
  } catch {
    simulated = true
    checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscribe/pending?checkoutId=${checkout.id}`
  }

  await prisma.billingCheckout.update({
    where: { id: checkout.id },
    data: { checkoutUrl, providerReference }
  })

  await logOnboardingEvent({
    checkoutId: checkout.id,
    email: checkout.email,
    eventType: 'CHECKOUT_PENDING_PAYMENT',
    metadata: { provider: process.env.MP_ACCESS_TOKEN ? 'MERCADOPAGO' : 'INTERNAL' }
  })

  res.status(201).json({
    checkoutId: checkout.id,
    status: 'PENDING',
    amountCents: finalAmountCents,
    checkoutUrl,
    simulated
  })
})

billingRouter.get('/checkout/:id/status', async (req, res) => {
  const checkout = await prisma.billingCheckout.findUnique({ where: { id: req.params.id } })
  if (!checkout) return res.status(404).json({ error: 'Checkout nao encontrado.' })

  if (checkout.status === 'PAID') {
    const tenant = checkout.tenantId ? await prisma.tenant.findUnique({ where: { id: checkout.tenantId } }) : null
    if (tenant) {
      const token = generateToken(tenant)
      const { passwordHash: _, ...tenantData } = tenant
      return res.json({
        checkoutId: checkout.id,
        status: checkout.status,
        tenant: tenantData,
        token
      })
    }
  }

  res.json({
    checkoutId: checkout.id,
    status: checkout.status,
    checkoutUrl: checkout.checkoutUrl,
    amountCents: checkout.finalAmountCents
  })
})

billingRouter.post('/webhook', async (req, res) => {
  const configuredSecret = process.env.MP_WEBHOOK_SECRET || ''
  if (configuredSecret) {
    const receivedSecret = extractWebhookSecret(req)
    if (!receivedSecret || String(receivedSecret) !== configuredSecret) {
      return res.status(403).json({ error: 'Webhook sem assinatura valida.' })
    }
  }

  const { checkoutId, status } = await resolveCheckoutFromWebhook(req.body)

  if (!checkoutId) return res.status(400).json({ error: 'checkoutId obrigatorio.' })

  const checkout = await prisma.billingCheckout.findUnique({ where: { id: checkoutId } })
  const checkoutEmail = checkout?.email || 'unknown'

  const approved = isApprovedStatus(status)

  if (!approved) {
    await prisma.billingCheckout.update({
      where: { id: checkoutId },
      data: { status: 'PENDING' }
    }).catch(() => null)

    await logOnboardingEvent({
      checkoutId,
      email: checkoutEmail,
      eventType: 'PAYMENT_PENDING_WEBHOOK',
      metadata: { status }
    })

    return res.json({ ok: true, updated: false })
  }

  const activated = await activateCheckout(checkoutId)
  await logOnboardingEvent({
    checkoutId,
    email: checkoutEmail,
    eventType: 'PAYMENT_APPROVED_WEBHOOK',
    metadata: { status }
  })
  res.json({ ok: true, updated: true, ...activated })
})

billingRouter.post('/family-invites/:token/accept', async (req, res) => {
  const token = req.params.token
  const { name, phoneNumber } = req.body

  if (!name || !phoneNumber) {
    return res.status(400).json({ error: 'Nome e telefone sao obrigatorios.' })
  }

  const invite = await prisma.familyInvite.findUnique({ where: { token } })
  if (!invite) return res.status(404).json({ error: 'Convite nao encontrado.' })

  if (invite.status !== 'PENDING') {
    return res.status(400).json({ error: 'Convite ja utilizado ou expirado.' })
  }

  if (invite.expiresAt < new Date()) {
    await prisma.familyInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } })
    return res.status(400).json({ error: 'Convite expirado.' })
  }

  const cleanPhone = String(phoneNumber).replace(/\D/g, '')

  let user = await prisma.user.findUnique({ where: { phoneNumber: cleanPhone } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: String(name),
        phoneNumber: cleanPhone
      }
    })
  }

  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
    update: { isActive: true, nickname: String(name), role: 'EMPLOYEE' },
    create: { tenantId: invite.tenantId, userId: user.id, role: 'EMPLOYEE', nickname: String(name), isActive: true }
  })

  await prisma.familyInvite.update({
    where: { id: invite.id },
    data: { status: 'ACCEPTED', acceptedAt: new Date() }
  })

  const tenant = await prisma.tenant.findUnique({ where: { id: invite.tenantId } })
  await logOnboardingEvent({
    checkoutId: null,
    email: tenant?.email || 'unknown',
    eventType: 'FAMILY_INVITE_ACCEPTED',
    metadata: { tenantId: invite.tenantId, invitedPhone: cleanPhone }
  })

  res.json({
    message: 'Convite aceito com sucesso.',
    tenantId: invite.tenantId,
    user: { id: user.id, name: user.name, phoneNumber: user.phoneNumber }
  })
})

