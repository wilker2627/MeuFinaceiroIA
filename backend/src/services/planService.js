import { prisma } from '../config/database.js'

const FALLBACK_PLANS = [
  { code: 'FREE', messageLimit: 200, userLimit: 1, accountLimit: 1, whatsappLimit: 1 },
  { code: 'FAMILIA', messageLimit: null, userLimit: 2, accountLimit: 3, whatsappLimit: 2 },
  { code: 'FAMILIA_PLUS', messageLimit: null, userLimit: 5, accountLimit: 8, whatsappLimit: 5 },
  { code: 'PREMIUM', messageLimit: null, userLimit: 10, accountLimit: 20, whatsappLimit: 10 },
  { code: 'STARTER', messageLimit: 500, userLimit: 1, accountLimit: 2, whatsappLimit: 1 },
  { code: 'LIFETIME', messageLimit: null, userLimit: 5, accountLimit: 10, whatsappLimit: 5 },
  { code: 'EMPRESA', messageLimit: null, userLimit: 25, accountLimit: 50, whatsappLimit: 25 }
]

export function normalizePlanCode(input = '') {
  return String(input).trim().toUpperCase().replace(/\s+/g, '_')
}

function toLimitValue(value) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export async function getPlanPolicyByCode(planCode) {
  const code = normalizePlanCode(planCode)

  const fromDb = await prisma.adminPlan.findUnique({ where: { code } })
  if (fromDb) {
    return {
      code,
      messageLimit: toLimitValue(fromDb.messageLimit),
      userLimit: toLimitValue(fromDb.userLimit),
      accountLimit: toLimitValue(fromDb.accountLimit),
      whatsappLimit: toLimitValue(fromDb.userLimit)
    }
  }

  const fallback = FALLBACK_PLANS.find((p) => p.code === code) || FALLBACK_PLANS[0]
  return {
    code: fallback.code,
    messageLimit: toLimitValue(fallback.messageLimit),
    userLimit: toLimitValue(fallback.userLimit),
    accountLimit: toLimitValue(fallback.accountLimit),
    whatsappLimit: toLimitValue(fallback.whatsappLimit)
  }
}

export function isLimitReached(currentValue, limitValue) {
  return typeof limitValue === 'number' && currentValue >= limitValue
}
