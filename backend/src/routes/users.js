import { Router } from 'express'
import { prisma } from '../config/database.js'
import { inviteUserToTenant, normalizePhone } from '../services/userService.js'

export const usersRouter = Router()

// GET /api/users/members — listar membros da conta
usersRouter.get('/members', async (req, res) => {
  const members = await prisma.tenantUser.findMany({
    where: { tenantId: req.tenant.id, isActive: true },
    include: {
      user: { select: { id: true, name: true, phoneNumber: true } }
    },
    orderBy: { joinedAt: 'asc' }
  })
  res.json(members)
})

// POST /api/users/members — convidar usuário por número de WhatsApp
usersRouter.post('/members', async (req, res) => {
  const { phoneNumber, role, nickname } = req.body

  if (!phoneNumber) return res.status(400).json({ error: 'Número de WhatsApp obrigatório.' })

  // Apenas ADMIN pode convidar
  const requestingMember = await prisma.tenantUser.findFirst({
    where: { tenantId: req.tenant.id, user: { phoneNumber: { contains: req.tenant.id } } }
  })

  try {
    const result = await inviteUserToTenant(req.tenant.id, phoneNumber, role || 'EMPLOYEE', nickname)
    res.status(201).json({
      message: `Usuário ${result.user.name} adicionado com sucesso.`,
      member: result.tenantUser
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// PATCH /api/users/members/:userId — alterar papel/apelido
usersRouter.patch('/members/:userId', async (req, res) => {
  const { role, nickname, isActive } = req.body

  const member = await prisma.tenantUser.findFirst({
    where: { tenantId: req.tenant.id, userId: req.params.userId }
  })
  if (!member) return res.status(404).json({ error: 'Membro não encontrado.' })

  const updated = await prisma.tenantUser.update({
    where: { id: member.id },
    data: {
      ...(role !== undefined && { role }),
      ...(nickname !== undefined && { nickname }),
      ...(isActive !== undefined && { isActive })
    },
    include: { user: true }
  })

  res.json(updated)
})

// DELETE /api/users/members/:userId — remover membro
usersRouter.delete('/members/:userId', async (req, res) => {
  const member = await prisma.tenantUser.findFirst({
    where: { tenantId: req.tenant.id, userId: req.params.userId }
  })
  if (!member) return res.status(404).json({ error: 'Membro não encontrado.' })

  await prisma.tenantUser.update({
    where: { id: member.id },
    data: { isActive: false }
  })

  res.json({ message: 'Membro removido.' })
})

// GET /api/users/report/:userId — relatório de um membro
usersRouter.get('/report/:userId', async (req, res) => {
  const { getUserReport } = await import('../services/reportService.js')
  const data = await getUserReport(req.tenant.id, req.params.userId)
  res.json(data)
})

// GET /api/users/team-report — relatório de toda a equipe
usersRouter.get('/team-report', async (req, res) => {
  const { getTeamReport } = await import('../services/reportService.js')
  const data = await getTeamReport(req.tenant.id)
  res.json(data)
})
