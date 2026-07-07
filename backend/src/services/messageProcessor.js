import { prisma } from '../config/database.js'
import { parseFinancialMessage, answerFinancialQuestion } from './aiService.js'
import {
  getFinancialSummary,
  formatSummaryForWhatsApp,
  getExpensesByCategory,
  getCashFlow,
  getUserReport,
  getTeamReport
} from './reportService.js'
import {
  getOrCreateUser,
  getActiveTenant,
  switchTenant,
  hasPermission,
  getUserTenants,
  detectContextSwitch
} from './userService.js'
import { randomUUID } from 'crypto'
import { addMonths, endOfDay, endOfMonth, startOfDay, startOfMonth, subMonths } from 'date-fns'
import { logger } from '../config/logger.js'
import { getPlanPolicyByCode, isLimitReached } from './planService.js'

const pendingPaymentMethodByUser = new Map()
const MIN_CREDIT_INSTALLMENTS = 1
const MAX_CREDIT_INSTALLMENTS = 12

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function detectPaymentMethodFromText(text = '') {
  const normalized = normalizeText(text)

  if (/\bpix\b/.test(normalized)) return 'PIX'
  if (/\bdinheiro\b|\bespecie\b/.test(normalized)) return 'CASH'
  if (/\bcredito\b|\bcrédito\b|\bcartao de credito\b|\bcartao credito\b|\bcartão de crédito\b|\bcartão crédito\b/.test(normalized)) return 'CREDIT_CARD'
  if (/\bdebito\b|\bdébito\b|\bcartao de debito\b|\bcartao debito\b|\bcartão de débito\b|\bcartão débito\b/.test(normalized)) return 'DEBIT_CARD'
  if (/\bcartao\b|\bcartão\b/.test(normalized)) return 'CREDIT_CARD'

  return null
}

function getPaymentMethodLabel(method) {
  const labels = {
    PIX: 'PIX',
    CASH: 'Dinheiro',
    CREDIT_CARD: 'Cartao de credito',
    DEBIT_CARD: 'Cartao de debito'
  }

  return labels[method] || 'Dinheiro'
}

function resolvePaymentMethod(message = '', parsed = null) {
  const parsedMethod = String(parsed?.paymentMethod || '').trim().toUpperCase()
  if (['PIX', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD'].includes(parsedMethod)) {
    return parsedMethod
  }

  return detectPaymentMethodFromText(message)
}

function getPendingKey(tenantId, userId) {
  return `${tenantId}:${userId}`
}

async function getDefaultAccount(tenantId) {
  return await prisma.account.findFirst({
    where: { tenantId },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }]
  })
}

async function findOrCreateAccountByName(tenantId, name, type = 'SAVINGS') {
  const normalizedName = String(name || '').trim()
  if (!normalizedName) return null

  let account = await prisma.account.findFirst({
    where: { tenantId, name: { contains: normalizedName, mode: 'insensitive' } }
  })

  if (!account) {
    account = await prisma.account.create({
      data: { tenantId, name: normalizedName, type, balance: 0 }
    })
  }

  return account
}

function inferTransferTargetName(parsed, rawMessage = '') {
  const explicit = String(parsed?.account || parsed?.contact || '').trim()
  if (explicit) return explicit

  const match = String(rawMessage).match(/(?:para|pra|pro|na|no)\s+([a-z0-9à-ú\s]{3,40})/i)
  return match?.[1]?.trim() || null
}

function normalizeAccountLabel(name = '') {
  return String(name || '')
    .replace(/^(cartao|cartão|conta|banco)\s+/i, '')
    .replace(/^(do|da|de)\s+/i, '')
    .replace(/\b(em\s+\d{1,2}\s*(x|vezes)|parcelad[oa].*)$/i, '')
    .replace(/\b(credito|crédito|debito|débito)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferPaymentAccountName(parsed, rawMessage = '', paymentMethod = 'CASH') {
  const explicit = normalizeAccountLabel(parsed?.account || '')
  if (explicit) return explicit

  const source = String(rawMessage || '')
  const cardMatch = source.match(/cart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?\s+(?:do|da|de)?\s*([a-z0-9à-ú\-\s]{2,40}?)(?=\s+(?:em\s+\d{1,2}\s*(?:x|vezes)|parcelad[oa]|por\s+r\$|de\s+r\$)|$)/i)
  if (cardMatch?.[1]) {
    const label = normalizeAccountLabel(cardMatch[1])
    if (label) return label
  }

  if (paymentMethod === 'PIX' || paymentMethod === 'DEBIT_CARD' || paymentMethod === 'CREDIT_CARD') {
    const bankMatch = source.match(/(?:no|na|do|da)\s+([a-z0-9à-ú\-\s]{2,40})$/i)
    if (bankMatch?.[1]) {
      const label = normalizeAccountLabel(bankMatch[1])
      if (label) return label
    }
  }

  return null
}

async function resolveTransactionAccount(tenantId, parsed, rawMessage, paymentMethod) {
  const inferredName = inferPaymentAccountName(parsed, rawMessage, paymentMethod)

  if (paymentMethod === 'CREDIT_CARD') {
    if (inferredName) {
      return await findOrCreateAccountByName(tenantId, inferredName, 'CREDIT_CARD')
    }

    return await prisma.account.findFirst({
      where: { tenantId, type: 'CREDIT_CARD' },
      orderBy: { createdAt: 'asc' }
    })
  }

  if (paymentMethod === 'DEBIT_CARD') {
    if (inferredName) {
      return await findOrCreateAccountByName(tenantId, inferredName, 'DEBIT_CARD')
    }

    return await prisma.account.findFirst({
      where: { tenantId, type: 'DEBIT_CARD' },
      orderBy: { createdAt: 'asc' }
    })
  }

  if (paymentMethod === 'PIX' && inferredName) {
    return await findOrCreateAccountByName(tenantId, inferredName, 'CHECKING')
  }

  const defaultCashAccount = await prisma.account.findFirst({ where: { tenantId, type: 'CASH' } })
  if (defaultCashAccount) return defaultCashAccount

  return await getDefaultAccount(tenantId)
}

function inferGoalName(parsed, rawMessage = '') {
  const explicit = String(parsed?.description || '').trim()
  if (explicit) return explicit

  const message = String(rawMessage || '').trim()
  if (!message) return 'Nova meta'
  return message.length > 80 ? `${message.slice(0, 77)}...` : message
}

function extractInstallments(parsed, rawMessage = '') {
  const parsedInstallments = Number(parsed?.installments)
  if (Number.isFinite(parsedInstallments)) {
    if (parsedInstallments > 1 && parsedInstallments <= MAX_CREDIT_INSTALLMENTS) return parsedInstallments
    if (parsedInstallments === 1) return null
  }

  const match = String(rawMessage).match(/(\d{1,2})\s*(x|vezes)/i)
  const detected = match ? Number(match[1]) : null
  return Number.isFinite(detected) && detected > 1 && detected <= MAX_CREDIT_INSTALLMENTS ? detected : null
}

function extractInstallmentCountFromText(text = '') {
  const match = String(text).match(/(\d{1,2})\s*(x|vezes)/i)
  const detected = match ? Number(match[1]) : null
  return Number.isFinite(detected) ? detected : null
}

function parseInstallmentAnswer(text = '') {
  const normalized = normalizeText(text)

  if (/^(nao|não|a vista|à vista|avista|1x|uma vez)$/.test(normalized)) {
    return 1
  }

  const explicit = String(text).match(/(\d{1,2})\s*(x|vezes)/i)
  const numeric = explicit ? Number(explicit[1]) : null
  if (Number.isFinite(numeric) && numeric >= MIN_CREDIT_INSTALLMENTS && numeric <= MAX_CREDIT_INSTALLMENTS) return numeric

  if (/^\d{1,2}$/.test(normalized)) {
    const direct = Number(normalized)
    if (Number.isFinite(direct) && direct >= MIN_CREDIT_INSTALLMENTS && direct <= MAX_CREDIT_INSTALLMENTS) return direct
  }

  return null
}

function shouldAskInstallments(type, paymentMethod, parsed, message = '') {
  if (type !== 'EXPENSE') return false
  if (paymentMethod !== 'CREDIT_CARD') return false
  if (extractInstallments(parsed, message)) return false
  return true
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function splitAmountIntoInstallments(amount, installments) {
  const totalCents = Math.round(Number(amount) * 100)
  const count = Math.max(Number(installments) || 1, 1)
  const baseCents = Math.floor(totalCents / count)
  const remainder = totalCents - (baseCents * count)

  return Array.from({ length: count }, (_, index) => {
    const cents = baseCents + (index < remainder ? 1 : 0)
    return cents / 100
  })
}

function shouldSpreadInstallments(installments, paymentMethod) {
  return Number(installments) > 1 && ['CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'CASH'].includes(paymentMethod)
}

function shouldApplyImmediateBalance(type, paymentMethod, installments) {
  if (Number(installments) > 1) return false
  if (paymentMethod === 'CREDIT_CARD') return false
  return type === 'INCOME' || type === 'EXPENSE'
}

function buildInstallmentTransactions({
  tenantId,
  userId,
  type,
  paymentMethod,
  totalAmount,
  description,
  categoryId,
  accountId,
  installments,
  baseDate,
  rawMessage
}) {
  const count = Number(installments) > 1 ? Number(installments) : 1
  const amounts = splitAmountIntoInstallments(totalAmount, count)
  const groupId = count > 1 ? randomUUID() : null

  return amounts.map((installmentAmount, index) => ({
    tenantId,
    userId,
    type,
    paymentMethod,
    amount: installmentAmount,
    description: count > 1 ? `${description} (${index + 1}/${count})` : description,
    categoryId,
    accountId,
    installments: count > 1 ? count : null,
    installmentNumber: count > 1 ? index + 1 : null,
    groupId,
    date: count > 1 ? addMonths(baseDate.date, index) : baseDate.date,
    rawMessage
  }))
}

export async function processWhatsAppMessage(tenantId, message, senderPhone) {
  logger.info({ tenantId, senderPhone, message }, 'Mensagem recebida')

  const user = await getOrCreateUser(senderPhone)

  const contextSwitch = detectContextSwitch(message)
  if (contextSwitch) {
    return await handleContextSwitch(user, contextSwitch)
  }

  const tenantUser = await getActiveTenant(user)
  if (!tenantUser) {
    return `Ola! Seu numero ainda nao esta vinculado a nenhuma conta.\n\nPeca ao administrador para te adicionar ou acesse:\nhttp://localhost:3000\n\nSe voce tem varias contas, responda com o nome da conta que deseja usar.`
  }

  const activeTenantId = tenantUser.tenantId
  const userName = tenantUser.nickname || user.name || 'voce'
  const role = tenantUser.role
  const pendingKey = getPendingKey(activeTenantId, user.id)

  const lowerMsg = normalizeText(message)

  const pending = pendingPaymentMethodByUser.get(pendingKey)
  if (pending) {
    if (Date.now() - pending.createdAt > 15 * 60 * 1000) {
      pendingPaymentMethodByUser.delete(pendingKey)
    } else if (['cancelar', 'cancelar lancamento', 'cancelar lançamento'].includes(lowerMsg)) {
      pendingPaymentMethodByUser.delete(pendingKey)
      return 'Lancamento cancelado. Quando quiser, envie novamente a despesa/entrada.'
    } else if (pending.stage === 'AWAITING_INSTALLMENTS') {
      const installments = parseInstallmentAnswer(message)
      if (!installments) {
        const typedInstallments = extractInstallmentCountFromText(message)
        if (typedInstallments && typedInstallments > MAX_CREDIT_INSTALLMENTS) {
          return 'No credito aceitamos de 1x a 12x. Me diga entre 1x e 12x.'
        }
        return 'Foi em quantas parcelas? Responda algo como: 3x, 10 vezes, 1x ou nao. (1x a 12x)'
      }

      pendingPaymentMethodByUser.delete(pendingKey)
      const enrichedParsed = { ...pending.parsed, installments }
      return await handleAddTransaction(
        activeTenantId,
        user.id,
        userName,
        enrichedParsed,
        pending.type,
        pending.rawInputMessage,
        pending.paymentMethod || 'CREDIT_CARD'
      )
    } else {
      const paymentMethod = resolvePaymentMethod(message, pending.parsed)
      if (!paymentMethod) {
        return 'Qual foi a forma de pagamento? Responda com: PIX, dinheiro, cartao de credito (1x a 12x) ou cartao de debito.\n\nSe quiser desistir, envie: cancelar'
      }

       if (shouldAskInstallments(pending.type, paymentMethod, pending.parsed, pending.rawInputMessage)) {
        pendingPaymentMethodByUser.set(pendingKey, {
          ...pending,
          paymentMethod,
          stage: 'AWAITING_INSTALLMENTS',
          createdAt: Date.now()
        })
        return 'Foi parcelado no cartao? Se sim, responda por exemplo: 3x, 10 vezes. Se nao, responda: nao ou 1x. (maximo 12x)'
      }

      pendingPaymentMethodByUser.delete(pendingKey)
      return await handleAddTransaction(
        activeTenantId,
        user.id,
        userName,
        pending.parsed,
        pending.type,
        pending.rawInputMessage,
        paymentMethod
      )
    }
  }

  if (['saldo', 'saldo atual', 'quanto tenho'].includes(lowerMsg)) {
    if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
    return await handleQueryBalance(activeTenantId)
  }

  if (['resumo', 'relatorio', 'como esta', 'dashboard'].includes(lowerMsg)) {
    if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
    return await handleQuerySummary(activeTenantId)
  }

  if (['meus gastos', 'meu resumo', 'quanto eu gastei', 'meus lancamentos'].includes(lowerMsg)) {
    if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
    return await handleUserReport(activeTenantId, user.id, userName)
  }

  if (['resumo da familia', 'resumo da empresa', 'resumo geral', 'relatorio completo'].includes(lowerMsg)) {
    if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
    return await handleTeamReport(activeTenantId)
  }

  if (['contas', 'contas a pagar', 'vencimentos'].includes(lowerMsg)) {
    if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
    return await handleQueryScheduled(activeTenantId)
  }

  if (['minhas contas', 'contas da familia', 'minhas empresas'].includes(lowerMsg)) {
    return await listUserAccounts(user)
  }

  if (['ajuda', 'help', 'menu', 'comandos', 'teste'].includes(lowerMsg)) {
    return getHelpMessage(userName, role)
  }

  const parsed = await parseFinancialMessage(message)

  switch (parsed.action) {
    case 'ADD_INCOME':
      if (!hasPermission(role, 'write')) return noPermissionMsg(userName)
      {
        const paymentMethod = resolvePaymentMethod(message, parsed)
        if (!paymentMethod) {
          pendingPaymentMethodByUser.set(pendingKey, {
            type: 'INCOME',
            parsed,
            rawInputMessage: message,
            stage: 'AWAITING_PAYMENT_METHOD',
            createdAt: Date.now()
          })
          return 'Perfeito. Qual foi a forma de pagamento dessa entrada?\n\nOpcoes: PIX, dinheiro, cartao de credito (1x a 12x) ou cartao de debito.'
        }
        return await handleAddTransaction(activeTenantId, user.id, userName, parsed, 'INCOME', message, paymentMethod)
      }

    case 'ADD_EXPENSE':
      if (!hasPermission(role, 'write')) return noPermissionMsg(userName)
      {
        const paymentMethod = resolvePaymentMethod(message, parsed)
        if (!paymentMethod) {
          pendingPaymentMethodByUser.set(pendingKey, {
            type: 'EXPENSE',
            parsed,
            rawInputMessage: message,
            stage: 'AWAITING_PAYMENT_METHOD',
            createdAt: Date.now()
          })
          return 'Certo. Qual foi a forma de pagamento dessa despesa?\n\nOpcoes: PIX, dinheiro, cartao de credito (1x a 12x) ou cartao de debito.'
        }

        const typedInstallments = extractInstallmentCountFromText(message)
        if (paymentMethod === 'CREDIT_CARD' && typedInstallments && typedInstallments > MAX_CREDIT_INSTALLMENTS) {
          return 'No credito aceitamos de 1x a 12x. Reenvie a despesa com uma parcela entre 1x e 12x.'
        }

        if (shouldAskInstallments('EXPENSE', paymentMethod, parsed, message)) {
          pendingPaymentMethodByUser.set(pendingKey, {
            type: 'EXPENSE',
            parsed,
            rawInputMessage: message,
            paymentMethod,
            stage: 'AWAITING_INSTALLMENTS',
            createdAt: Date.now()
          })
          return 'Foi parcelado no cartao? Se sim, responda por exemplo: 3x, 10 vezes. Se nao, responda: nao ou 1x. (maximo 12x)'
        }

        return await handleAddTransaction(activeTenantId, user.id, userName, parsed, 'EXPENSE', message, paymentMethod)
      }

    case 'ADD_SCHEDULED':
      if (!hasPermission(role, 'write')) return noPermissionMsg(userName)
      return await handleAddScheduled(activeTenantId, user.id, parsed)

    case 'ADD_TRANSFER':
      if (!hasPermission(role, 'write')) return noPermissionMsg(userName)
      return await handleAddTransfer(activeTenantId, user.id, userName, parsed, message)

    case 'ADD_GOAL':
      if (!hasPermission(role, 'write')) return noPermissionMsg(userName)
      return await handleAddGoal(activeTenantId, parsed, message)

    case 'QUERY_BALANCE':
      if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
      return await handleQueryBalance(activeTenantId)

    case 'QUERY_SUMMARY':
      if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
      return await handleQuerySummary(activeTenantId)

    case 'QUERY_CASHFLOW':
      if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
      return await handleQueryCashFlow(activeTenantId)

    case 'QUERY_EXPENSES_CATEGORY':
      if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
      return await handleQueryExpensesByCategory(activeTenantId)

    case 'QUERY_SCHEDULED':
      if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
      return await handleQueryScheduled(activeTenantId)

    case 'QUERY_GOALS':
      if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
      return await handleQueryGoals(activeTenantId, parsed.query || message)

    case 'QUERY_CARD':
      if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
      return await handleQueryCard(activeTenantId, parsed.query || message)

    case 'QUERY_SPECIFIC':
      if (!hasPermission(role, 'read')) return noPermissionMsg(userName)
      return await handleSpecificQuery(activeTenantId, user.id, userName, parsed.query || message)

    case 'CHART_REQUEST':
      return 'Acesse o dashboard para ver os graficos:\nhttp://localhost:3000/dashboard'

    case 'HELP':
    default:
      if (canUseNaturalFallback(message, role)) {
        return await handleSpecificQuery(activeTenantId, user.id, userName, message)
      }
      return getHelpMessage(userName, role)
  }
}

function canUseNaturalFallback(message, role) {
  const normalized = normalizeText(message)
  if (!hasPermission(role, 'read')) return false
  if (['ajuda', 'help', 'menu', 'comandos', 'teste'].includes(normalized)) return false
  return normalized.length >= 8
}

async function handleContextSwitch(user, contextSwitch) {
  const userTenants = await getUserTenants(user.id)

  if (userTenants.length === 0) return 'Voce nao esta vinculado a nenhuma conta.'
  if (userTenants.length === 1) return `Voce so tem uma conta: *${userTenants[0].tenant.name}*`

  const match = userTenants.find((tu) =>
    normalizeText(tu.tenant.name).includes(normalizeText(contextSwitch.tenantName))
  )

  if (!match) {
    const names = userTenants.map((tu) => `- ${tu.tenant.name}`).join('\n')
    return `Conta *${contextSwitch.tenantName}* nao encontrada.\n\nSuas contas:\n${names}`
  }

  await switchTenant(user.id, match.tenantId)

  if (contextSwitch.subMessage) {
    const result = await processWhatsAppMessage(match.tenantId, contextSwitch.subMessage, user.phoneNumber)
    return `Conta: *${match.tenant.name}*\n\n${result}`
  }

  return `Conta ativa: *${match.tenant.name}*\n\nPode falar normalmente agora!`
}

async function handleAddTransaction(tenantId, userId, userName, parsed, type, rawInputMessage = null, paymentMethod = 'CASH') {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })
  const policy = await getPlanPolicyByCode(tenant?.plan)
  const monthStart = startOfMonth(new Date())
  const monthEnd = endOfMonth(new Date())
  const usedMessages = await prisma.transaction.count({
    where: {
      tenantId,
      rawMessage: { not: null },
      createdAt: { gte: monthStart, lte: monthEnd }
    }
  })

  if (isLimitReached(usedMessages, policy.messageLimit)) {
    return `Plano ${policy.code} atingiu o limite mensal de ${policy.messageLimit} mensagens para lancamentos via WhatsApp.`
  }

  const fmt = (v) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  let categoryId = null
  if (parsed.category) {
    let cat = await prisma.category.findFirst({
      where: { tenantId, name: { contains: parsed.category, mode: 'insensitive' } }
    })
    if (!cat) {
      cat = await prisma.category.create({
        data: { tenantId, name: parsed.category, type, color: '#6B7280' }
      })
    }
    categoryId = cat.id
  }

  const transactionAccount = await resolveTransactionAccount(tenantId, parsed, rawInputMessage || parsed.description || '', paymentMethod)
  const accountId = transactionAccount?.id || null

  const amount = parseFloat(parsed.amount)
  if (!amount || amount <= 0) {
    return `${userName}, entendi a intencao, mas faltou o valor. Exemplo: "Paguei R$ 150 de energia"`
  }

  const installments = extractInstallments(parsed, rawInputMessage || parsed.description || '')
  if (paymentMethod === 'CREDIT_CARD') {
    const typedInstallments = extractInstallmentCountFromText(rawInputMessage || parsed.description || '')
    if (typedInstallments && typedInstallments > MAX_CREDIT_INSTALLMENTS) {
      return 'No credito aceitamos de 1x a 12x. Reenvie o lancamento com uma parcela entre 1x e 12x.'
    }
  }

  const description = parsed.description || 'Sem descricao'
  const transactionDate = parsed.date ? new Date(parsed.date) : new Date()
  const spreadInstallments = shouldSpreadInstallments(installments, paymentMethod)
  const transactionsToCreate = buildInstallmentTransactions({
    tenantId,
    userId,
    type,
    paymentMethod,
    totalAmount: amount,
    description,
    categoryId,
    accountId,
    installments: spreadInstallments ? installments : null,
    baseDate: transactionDate,
    rawMessage: rawInputMessage || description || 'Mensagem WhatsApp'
  })

  await prisma.transaction.createMany({
    data: transactionsToCreate
  })

  const immediateImpact = shouldApplyImmediateBalance(type, paymentMethod, installments)
    ? amount
    : transactionsToCreate
      .filter((tx) => tx.date <= endOfDay(new Date()))
      .reduce((sum, tx) => sum + tx.amount, 0)

  if (accountId && immediateImpact > 0) {
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: { increment: type === 'INCOME' ? immediateImpact : -immediateImpact } }
    })
  }

  const tipo = type === 'INCOME' ? 'Entrada' : 'Saida'
  const firstInstallment = transactionsToCreate[0]?.amount || amount
  return `${tipo} registrada por *${userName}*!\n\nValor total: ${fmt(amount)}\nDescricao: ${description}${parsed.category ? `\nCategoria: ${parsed.category}` : ''}${transactionAccount?.name ? `\nConta/cartao: ${transactionAccount.name}` : ''}${installments ? `\nParcelas: ${installments}x de ${fmt(firstInstallment)}` : ''}\nPagamento: ${getPaymentMethodLabel(paymentMethod)}${installments ? '\nLancamento distribuido pelos proximos meses.' : ''}`
}

async function handleAddTransfer(tenantId, userId, userName, parsed, rawMessage) {
  const amount = Number(parsed?.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return `${userName}, entendi a transferencia, mas faltou o valor. Exemplo: "Transferi R$ 500 para a poupanca"`
  }

  const sourceAccount = await getDefaultAccount(tenantId)
  if (!sourceAccount) {
    return 'Nao encontrei uma conta de origem para movimentar. Cadastre ao menos uma conta no dashboard antes de transferir.'
  }

  const targetName = inferTransferTargetName(parsed, rawMessage)
  if (!targetName) {
    return 'Entendi a transferencia, mas faltou o destino. Exemplo: "Transferi R$ 500 para a poupanca"'
  }

  const targetAccount = await findOrCreateAccountByName(tenantId, targetName)
  if (!targetAccount) {
    return 'Nao consegui identificar a conta de destino dessa transferencia.'
  }

  if (targetAccount.id === sourceAccount.id) {
    return 'A conta de origem e destino ficaram iguais. Me diga um destino diferente, como reserva, poupanca, Nubank ou Sicredi.'
  }

  const groupId = randomUUID()
  const paymentMethod = resolvePaymentMethod(rawMessage, parsed) || 'PIX'
  const description = parsed?.description || `Transferencia para ${targetAccount.name}`

  await prisma.transaction.create({
    data: {
      tenantId,
      userId,
      type: 'EXPENSE',
      paymentMethod,
      amount,
      description,
      accountId: sourceAccount.id,
      groupId,
      rawMessage: rawMessage || description
    }
  })

  await prisma.transaction.create({
    data: {
      tenantId,
      userId,
      type: 'INCOME',
      paymentMethod,
      amount,
      description: `Transferencia recebida em ${targetAccount.name}`,
      accountId: targetAccount.id,
      groupId,
      rawMessage: rawMessage || description
    }
  })

  await prisma.account.update({
    where: { id: sourceAccount.id },
    data: { balance: { increment: -amount } }
  })

  await prisma.account.update({
    where: { id: targetAccount.id },
    data: { balance: { increment: amount } }
  })

  return `Transferencia registrada por *${userName}*!\n\nValor: ${formatCurrency(amount)}\nOrigem: ${sourceAccount.name}\nDestino: ${targetAccount.name}\nMetodo: ${getPaymentMethodLabel(paymentMethod)}`
}

async function handleAddGoal(tenantId, parsed, rawMessage) {
  const targetAmount = Number(parsed?.amount)
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
    return 'Entendi a meta, mas preciso do valor alvo para cadastrar. Exemplo: "Quero juntar R$ 20 mil para minha viagem"'
  }

  const name = inferGoalName(parsed, rawMessage)
  const goal = await prisma.goal.create({
    data: {
      tenantId,
      name,
      targetAmount,
      currentAmount: 0,
      deadline: parsed?.dueDate ? new Date(parsed.dueDate) : null
    }
  })

  return `Meta criada!\n\nNome: ${goal.name}\nObjetivo: ${formatCurrency(goal.targetAmount)}\nAcumulado atual: ${formatCurrency(goal.currentAmount)}`
}

async function handleAddScheduled(tenantId, userId, parsed) {
  const fmt = (v) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  if (!parsed.amount || !parsed.dueDate) {
    return 'Entendi que voce quer agendar uma conta, mas preciso do valor e da data. Ex: "Agende energia R$ 540 dia 10"'
  }

  const dueDate = new Date(parsed.dueDate)
  const payment = await prisma.scheduledPayment.create({
    data: {
      tenantId,
      userId,
      description: parsed.description || 'Pagamento agendado',
      amount: parseFloat(parsed.amount),
      dueDate,
      type: 'EXPENSE'
    }
  })

  return `Agendado!\n\nDescricao: ${payment.description}\nValor: ${fmt(payment.amount)}\nVence: ${dueDate.toLocaleDateString('pt-BR')}\n\nVou te lembrar.`
}

async function handleUserReport(tenantId, userId, userName) {
  const data = await getUserReport(tenantId, userId)
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const month = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()

  let msg = `SEUS LANCAMENTOS - ${userName.toUpperCase()}\n${month}\n\n`

  if (data.incomes.length > 0) {
    msg += 'ENTRADAS\n'
    for (const cat of data.incomes) msg += `- ${cat.name}: ${fmt(cat.total)}\n`
    msg += `Total: ${fmt(data.totalIncome)}\n\n`
  }

  if (data.expenses.length > 0) {
    msg += 'SAIDAS\n'
    for (const cat of data.expenses) msg += `- ${cat.name}: ${fmt(cat.total)}\n`
    msg += `Total: ${fmt(data.totalExpense)}\n\n`
  }

  if (data.incomes.length === 0 && data.expenses.length === 0) {
    msg += 'Nenhum lancamento seu este mes.'
  } else {
    msg += `Seu saldo: ${fmt(data.totalIncome - data.totalExpense)}`
  }

  return msg
}

async function handleTeamReport(tenantId) {
  const data = await getTeamReport(tenantId)
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  const month = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()

  let msg = `RELATORIO - ${tenant.name.toUpperCase()}\n${month}\n\n`

  msg += 'ENTRADAS POR PESSOA\n'
  for (const m of data.members) {
    if (m.totalIncome > 0) msg += `- ${m.name}: ${fmt(m.totalIncome)}\n`
  }
  msg += `Total: ${fmt(data.totalIncome)}\n\n`

  msg += 'SAIDAS POR PESSOA\n'
  for (const m of data.members) {
    if (m.totalExpense > 0) msg += `- ${m.name}: ${fmt(m.totalExpense)}\n`
  }
  msg += `Total: ${fmt(data.totalExpense)}\n\n`

  const profit = data.totalIncome - data.totalExpense
  msg += `Saldo geral: ${fmt(profit)}`
  return msg
}

async function handleQueryBalance(tenantId) {
  const accounts = await prisma.account.findMany({ where: { tenantId } })
  const total = accounts.reduce((s, a) => s + a.balance, 0)
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  let msg = 'SALDO ATUAL\n\n'
  for (const acc of accounts) {
    msg += `- ${acc.name}: ${fmt(acc.balance)}\n`
  }
  msg += `\nTotal: *${fmt(total)}*`
  return msg
}

async function handleQuerySummary(tenantId) {
  const summary = await getFinancialSummary(tenantId)
  return formatSummaryForWhatsApp(summary)
}

async function handleQueryCashFlow(tenantId) {
  const now = new Date()
  const data = await getCashFlow(tenantId, startOfMonth(now), endOfMonth(now))
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const month = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return `FLUXO DE CAIXA - ${month.toUpperCase()}\n\nEntradas: ${fmt(data.income)}\nSaidas: ${fmt(data.expenses)}\n\nResultado: ${fmt(data.profit)}`
}

async function handleQueryExpensesByCategory(tenantId) {
  const now = new Date()
  const categories = await getExpensesByCategory(tenantId, startOfMonth(now), endOfMonth(now))
  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  if (categories.length === 0) return 'Nenhuma despesa registrada este mes.'

  let msg = 'GASTOS POR CATEGORIA\n\n'
  for (const cat of categories) msg += `- ${cat.name}: ${fmt(cat.total)}\n`
  return msg
}

async function handleQueryScheduled(tenantId) {
  const payments = await prisma.scheduledPayment.findMany({
    where: { tenantId, status: 'PENDING' },
    orderBy: { dueDate: 'asc' },
    take: 10,
    include: { user: true }
  })

  if (payments.length === 0) return 'Nenhuma conta pendente!'

  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  let msg = 'CONTAS PENDENTES\n\n'

  for (const p of payments) {
    const due = new Date(p.dueDate).toLocaleDateString('pt-BR')
    const who = p.user?.name ? ` (${p.user.name})` : ''
    msg += `- ${p.description}${who} - ${fmt(p.amount)} - ${due}\n`
  }

  return msg
}

async function handleQueryGoals(tenantId, query = '') {
  const goals = await prisma.goal.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' }
  })

  if (goals.length === 0) {
    return 'Voce ainda nao tem metas cadastradas. Exemplo: "Quero juntar R$ 20 mil para minha viagem".'
  }

  const normalized = normalizeText(query)
  const matchedGoal = goals.find((goal) => normalized.includes(normalizeText(goal.name))) || goals[0]
  const remaining = Math.max(Number(matchedGoal.targetAmount) - Number(matchedGoal.currentAmount || 0), 0)

  let msg = 'METAS\n\n'
  for (const goal of goals.slice(0, 5)) {
    const progress = goal.targetAmount > 0 ? ((goal.currentAmount || 0) / goal.targetAmount) * 100 : 0
    msg += `- ${goal.name}: ${formatCurrency(goal.currentAmount || 0)} de ${formatCurrency(goal.targetAmount)} (${Math.min(progress, 100).toFixed(0)}%)\n`
  }

  if (goals.length === 1 || /quanto falta|minha meta|minha viagem|minha casa/.test(normalized)) {
    msg += `\nFalta para ${matchedGoal.name}: ${formatCurrency(remaining)}`
  }

  return msg
}

async function getCardSnapshot(tenantId) {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId,
      paymentMethod: 'CREDIT_CARD',
      date: { gte: monthStart, lte: monthEnd }
    },
    orderBy: { date: 'desc' },
    include: { category: true, user: true }
  })

  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0)
  return {
    total,
    transactions,
    installmentsTotal: transactions.filter((tx) => Number(tx.installments) > 1).length
  }
}

async function handleQueryCard(tenantId, query = '') {
  const snapshot = await getCardSnapshot(tenantId)
  const normalized = normalizeText(query)

  if (snapshot.transactions.length === 0) {
    return 'Nao encontrei gastos no cartao de credito neste mes.'
  }

  let msg = `CARTAO DE CREDITO\n\nGasto no mes: ${formatCurrency(snapshot.total)}\nCompras registradas: ${snapshot.transactions.length}`

  if (/limite/.test(normalized)) {
    msg += '\n\nAinda nao existe limite cadastrado no sistema para calcular o disponivel.'
  }

  if (snapshot.installmentsTotal > 0) {
    msg += `\nCompras parceladas registradas: ${snapshot.installmentsTotal}`
  }

  const highlights = snapshot.transactions.slice(0, 5)
  if (highlights.length > 0) {
    msg += '\n\nUltimas compras:'
    for (const tx of highlights) {
      msg += `\n- ${tx.description}: ${formatCurrency(tx.amount)}${tx.installments ? ` (${tx.installments}x)` : ''}`
    }
  }

  return msg
}

async function handleSpecificQuery(tenantId, userId, userName, query) {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const lookbackStart = startOfMonth(subMonths(now, 3))

  const [summary, userReport, teamReport, goals, cardSnapshot, recentTransactions, todayTransactions] = await Promise.all([
    getFinancialSummary(tenantId),
    getUserReport(tenantId, userId),
    getTeamReport(tenantId),
    prisma.goal.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    getCardSnapshot(tenantId),
    prisma.transaction.findMany({
      where: { tenantId, date: { gte: lookbackStart, lte: now } },
      include: { category: true, user: true, account: true },
      orderBy: { date: 'desc' },
      take: 150
    }),
    prisma.transaction.findMany({
      where: { tenantId, date: { gte: todayStart, lte: todayEnd } },
      include: { category: true, user: true },
      orderBy: { date: 'desc' }
    })
  ])

  const compactTransactions = recentTransactions.map((tx) => ({
    type: tx.type,
    amount: tx.amount,
    description: tx.description,
    date: tx.date,
    paymentMethod: tx.paymentMethod,
    installments: tx.installments,
    category: tx.category?.name || null,
    user: tx.user?.name || null,
    account: tx.account?.name || null
  }))

  const enrichedContext = {
    summary,
    userReport,
    teamReport,
    userName,
    goals,
    card: {
      currentMonthTotal: cardSnapshot.total,
      purchasesCount: cardSnapshot.transactions.length,
      installmentsCount: cardSnapshot.installmentsTotal
    },
    todayTransactions: todayTransactions.map((tx) => ({
      description: tx.description,
      amount: tx.amount,
      category: tx.category?.name || null,
      user: tx.user?.name || null,
      paymentMethod: tx.paymentMethod
    })),
    recentTransactions: compactTransactions
  }

  return await answerFinancialQuestion(query, enrichedContext)
}

async function listUserAccounts(user) {
  const tenants = await getUserTenants(user.id)
  if (tenants.length === 0) return 'Voce nao esta vinculado a nenhuma conta.'

  let msg = 'SUAS CONTAS\n\n'
  for (const tu of tenants) {
    msg += `- *${tu.tenant.name}*\n  Perfil: ${roleLabel(tu.role)}\n\n`
  }
  msg += 'Para trocar de conta:\n"na [nome]: [mensagem]"\nEx: "na Otica: paguei R$ 200"'
  return msg
}

function noPermissionMsg(userName) {
  return `${userName}, voce nao tem permissao para esta acao.\nFale com o administrador da conta.`
}

function roleLabel(role) {
  return {
    ADMIN: 'Administrador',
    FINANCIAL: 'Financeiro',
    EMPLOYEE: 'Funcionario',
    VIEWER: 'Consulta'
  }[role] || role
}

function getHelpMessage(userName = 'voce', role = 'EMPLOYEE') {
  const canWrite = hasPermission(role, 'write')
  const canRead = hasPermission(role, 'read')

  let msg = `ASSISTENTE FINANCEIRO\nOla, *${userName}*! (${roleLabel(role)})\n\n`

  if (canWrite) {
    msg += 'REGISTRAR\n'
    msg += '- "Paguei R$ 180 de gasolina"\n'
    msg += '- "Recebi R$ 5.000 de salario"\n'
    msg += '- "Agende energia R$ 540 dia 10"\n\n'
  }

  if (canRead) {
    msg += 'CONSULTAR\n'
    msg += '- "Saldo"\n'
    msg += '- "Resumo"\n'
    msg += '- "Quanto gastei hoje?"\n'
    msg += '- "Quanto foi para mercado?"\n'
    msg += '- "Estou gastando demais?"\n'
    msg += '- "Meus gastos"\n'
    msg += '- "Resumo da familia"\n'
    msg += '- "Contas a pagar"\n'
    msg += '- "Quanto gastei com combustivel?"\n\n'
  }

  msg += 'MULTIPLAS CONTAS\n'
  msg += '- "Minhas contas"\n'
  msg += '- "Na Otica: paguei R$ 200"\n'
  msg += '- "Na Familia: mercado R$ 350"'

  return msg
}
