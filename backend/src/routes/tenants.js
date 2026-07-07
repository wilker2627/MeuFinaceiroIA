import { Router } from 'express'
import { prisma } from '../config/database.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { addDays } from 'date-fns'

export const tenantsRouter = Router()

function isStrongPassword(password = '') {
  const value = String(password)
  return value.length >= 8
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value)
}

// GET /api/tenants/me
tenantsRouter.get('/me', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.tenant.id },
    select: { id: true, name: true, email: true, plan: true, planExpiresAt: true, createdAt: true }
  })
  res.json(tenant)
})

// PATCH /api/tenants/me
tenantsRouter.patch('/me', async (req, res) => {
  const { name, currentPassword, newPassword } = req.body
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id } })

  const updateData = {}
  if (name) updateData.name = name

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Senha atual obrigatória.' })
    const valid = await bcrypt.compare(currentPassword, tenant.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta.' })
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: 'A nova senha deve ter 8+ caracteres, maiúscula, minúscula, número e símbolo.' })
    }
    updateData.passwordHash = await bcrypt.hash(newPassword, 12)
  }

  const updated = await prisma.tenant.update({
    where: { id: req.tenant.id },
    data: updateData,
    select: { id: true, name: true, email: true, plan: true }
  })
  res.json(updated)
})

// GET /api/tenants/family-invites
tenantsRouter.get('/family-invites', async (req, res) => {
  const invites = await prisma.familyInvite.findMany({
    where: { tenantId: req.tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
  res.json(invites)
})

// POST /api/tenants/family-invites
tenantsRouter.post('/family-invites', async (req, res) => {
  const { invitedPhone, invitedName } = req.body
  if (!invitedPhone) {
    return res.status(400).json({ error: 'Telefone do convite obrigatorio.' })
  }

  const normalizedPhone = String(invitedPhone).replace(/\D/g, '')
  const token = crypto.randomBytes(16).toString('hex')
  const expiresAt = addDays(new Date(), 7)

  const invite = await prisma.familyInvite.create({
    data: {
      tenantId: req.tenant.id,
      invitedName: invitedName || null,
      invitedPhone: normalizedPhone,
      token,
      status: 'PENDING',
      expiresAt
    }
  })

  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id } })
  await prisma.onboardingEvent.create({
    data: {
      checkoutId: null,
      email: tenant?.email || req.tenant.email || 'unknown',
      eventType: 'FAMILY_INVITE_CREATED',
      metadata: JSON.stringify({ tenantId: req.tenant.id, invitedPhone: normalizedPhone })
    }
  })

  const base = process.env.FRONTEND_URL || 'http://localhost:3000'
  res.status(201).json({
    id: invite.id,
    token: invite.token,
    inviteLink: `${base}/invite/${invite.token}`,
    expiresAt: invite.expiresAt
  })
})
