import { Router } from 'express'
import { prisma } from '../config/database.js'
import { getFinancialSummary } from '../services/reportService.js'
import { startWhatsAppSession, getSessionStatus, disconnectSession, repairWhatsAppSession } from '../services/whatsappManager.js'
import { getPlanPolicyByCode, isLimitReached } from '../services/planService.js'

export const whatsappRouter = Router()
const WA_ENABLED = String(process.env.WA_ENABLED || 'true').trim().toLowerCase() === 'true'

whatsappRouter.use((_req, res, next) => {
  if (!WA_ENABLED) {
    return res.status(403).json({ error: 'Integracao WhatsApp desativada neste ambiente.' })
  }
  next()
})

// GET /api/whatsapp/sessions — listar sessões do tenant
whatsappRouter.get('/sessions', async (req, res) => {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { tenantId: req.tenant.id },
    select: { id: true, phoneNumber: true, isActive: true, connectedAt: true }
  })
  res.json(sessions)
})

// POST /api/whatsapp/sessions — conectar novo número
whatsappRouter.post('/sessions', async (req, res) => {
  const { phoneNumber } = req.body
  if (!phoneNumber) return res.status(400).json({ error: 'Número de telefone obrigatório.' })

  // Verificar limite do plano
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id } })
  const sessionCount = await prisma.whatsAppSession.count({ where: { tenantId: req.tenant.id } })
  const policy = await getPlanPolicyByCode(tenant?.plan)

  if (isLimitReached(sessionCount, policy.whatsappLimit)) {
    return res.status(403).json({ error: `Seu plano ${policy.code} permite no máximo ${policy.whatsappLimit} numero(s) de WhatsApp.` })
  }

  try {
    const qrCode = await startWhatsAppSession(req.tenant.id, phoneNumber)
    res.json({ message: 'Escaneie o QR Code no WhatsApp', qrCode })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// GET /api/whatsapp/sessions/:id/status
whatsappRouter.get('/sessions/:id/status', async (req, res) => {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' })

  const status = getSessionStatus(session.id)
  res.json({ ...session, status })
})

// DELETE /api/whatsapp/sessions/:id — desconectar
whatsappRouter.delete('/sessions/:id', async (req, res) => {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' })

  await disconnectSession(session.id)
  await prisma.whatsAppSession.delete({ where: { id: session.id } })

  res.json({ message: 'Sessão desconectada.' })
})

// POST /api/whatsapp/sessions/:id/repair — limpar auth e gerar novo QR
whatsappRouter.post('/sessions/:id/repair', async (req, res) => {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: req.params.id, tenantId: req.tenant.id }
  })
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' })

  try {
    const repaired = await repairWhatsAppSession(req.tenant.id, session.id, req.tenant)
    res.json({
      message: 'Sessão reparada. Escaneie o novo QR Code.',
      ...repaired
    })
  } catch (error) {
    const status = error?.status || 500
    res.status(status).json({ error: error.message || 'Falha ao reparar sessão.' })
  }
})
