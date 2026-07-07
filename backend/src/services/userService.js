import { prisma } from '../config/database.js'
import { logger } from '../config/logger.js'
import { getPlanPolicyByCode, isLimitReached } from './planService.js'

/**
 * Normaliza número de telefone para formato internacional sem +
 * Ex: +55 (11) 99999-9999 → 5511999999999
 */
export function normalizePhone(phone) {
  return phone.replace(/\D/g, '')
}

/**
 * Busca ou cria um User pelo número de telefone.
 * Retorna o user com suas contas (tenants) vinculadas.
 */
export async function getOrCreateUser(phoneNumber, name = null) {
  const normalized = normalizePhone(phoneNumber.split('@')[0])

  let user = await prisma.user.findUnique({
    where: { phoneNumber: normalized },
    include: {
      tenantUsers: {
        where: { isActive: true },
        include: { tenant: { select: { id: true, name: true, isActive: true } } }
      },
      userContexts: true
    }
  })

  if (!user) {
    user = await prisma.user.create({
      data: { phoneNumber: normalized, name: name || normalized },
      include: {
        tenantUsers: { include: { tenant: true } },
        userContexts: true
      }
    })
    logger.info({ phoneNumber: normalized }, 'Novo usuário criado')
  }

  return user
}

/**
 * Retorna a conta (tenant) ativa do usuário.
 * Se tem apenas uma conta, retorna ela.
 * Se tem várias, retorna o contexto ativo.
 * Se não tem nenhuma, retorna null.
 */
export async function getActiveTenant(user) {
  const tenants = user.tenantUsers.filter(tu => tu.tenant.isActive)

  if (tenants.length === 0) return null

  if (tenants.length === 1) return tenants[0]

  // Múltiplas contas: verificar contexto ativo
  const context = user.userContexts[0]
  if (context) {
    const active = tenants.find(tu => tu.tenantId === context.activeTenantId)
    if (active) return active
  }

  // Padrão: primeira conta
  return tenants[0]
}

/**
 * Muda a conta ativa do usuário.
 */
export async function switchTenant(userId, tenantId) {
  await prisma.userContext.upsert({
    where: { userId },
    update: { activeTenantId: tenantId },
    create: { userId, activeTenantId: tenantId }
  })
}

/**
 * Verifica se o usuário tem permissão para executar uma ação.
 */
export function hasPermission(role, action) {
  const permissions = {
    ADMIN:     ['read', 'write', 'delete', 'manage'],
    FINANCIAL: ['read', 'write'],
    EMPLOYEE:  ['write'],
    VIEWER:    ['read']
  }
  return permissions[role]?.includes(action) ?? false
}

/**
 * Lista todas as contas de um usuário.
 */
export async function getUserTenants(userId) {
  return prisma.tenantUser.findMany({
    where: { userId, isActive: true },
    include: { tenant: { select: { id: true, name: true, plan: true } } }
  })
}

/**
 * Adiciona um usuário a uma conta por número de telefone.
 */
export async function inviteUserToTenant(tenantId, phoneNumber, role = 'EMPLOYEE', nickname = null) {
  const normalized = normalizePhone(phoneNumber)

  // Busca ou cria o usuário
  let user = await prisma.user.findUnique({ where: { phoneNumber: normalized } })
  if (!user) {
    user = await prisma.user.create({
      data: { phoneNumber: normalized, name: nickname || normalized }
    })
  }

  // Verifica limite do plano
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  const memberCount = await prisma.tenantUser.count({ where: { tenantId, isActive: true } })
  const policy = await getPlanPolicyByCode(tenant?.plan)

  if (isLimitReached(memberCount, policy.userLimit)) {
    throw new Error(`Plano ${policy.code} permite no maximo ${policy.userLimit} usuario(s).`)
  }

  // Vincular
  const tenantUser = await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    update: { role, nickname, isActive: true },
    create: { tenantId, userId: user.id, role, nickname }
  })

  return { user, tenantUser }
}

/**
 * Detecta se a mensagem contém troca de contexto de conta.
 * Ex: "Registrar na Ótica: ..." → retorna { tenantName: "Ótica", message: "..." }
 */
export function detectContextSwitch(message) {
  // Padrões: "registrar na X:", "na conta X:", "para X:"
  const patterns = [
    /^(?:registrar\s+)?na\s+(.+?):\s*(.+)$/i,
    /^(?:para\s+)?conta\s+(.+?):\s*(.+)$/i,
    /^(?:mudar\s+para|trocar\s+para|usar)\s+(.+)$/i
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      return { tenantName: match[1].trim(), subMessage: match[2]?.trim() || null }
    }
  }
  return null
}
