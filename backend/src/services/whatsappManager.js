import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import path from 'path'
import fs from 'fs'
import { prisma } from '../config/database.js'
import { processWhatsAppMessage } from './messageProcessor.js'
import { logger } from '../config/logger.js'

const SESSIONS_PATH = process.env.WA_SESSIONS_PATH || './sessions'
const activeSessions = new Map() // sessionId -> { socket, qr, status }
const processedIncoming = new Map() // sessionId -> Map<msgId, timestamp>
const recentSignature = new Map() // sessionId -> Map<signature, timestamp>
const recentAudioWarnings = new Map() // sessionId -> Map<audioFingerprint, timestamp>

const INCOMING_DEDUP_WINDOW_MS = 120000
const SIGNATURE_COOLDOWN_MS = 8000
const AUDIO_WARNING_COOLDOWN_MS = 120000
const REPAIR_COOLDOWN_MS = 2 * 60 * 1000
const REPAIR_AUDIT_LIMIT = 50
const REPAIR_DAILY_LIMIT = Number(process.env.WA_REPAIR_DAILY_LIMIT || 10)
const WA_AI_CHAT_MODE = String(process.env.WA_AI_CHAT_MODE || 'SELF_ONLY').trim().toUpperCase()
const WA_AI_CHAT_NUMBER = String(process.env.WA_AI_CHAT_NUMBER || '').replace(/\D/g, '')
const WA_AI_ALLOW_GROUP_BOUND = String(process.env.WA_AI_ALLOW_GROUP_BOUND || 'true').trim().toLowerCase() === 'true'
const WA_SYSTEM_SENDER_PHONE = String(process.env.WA_SYSTEM_SENDER_PHONE || '').replace(/\D/g, '')
const AI_BIND_COMMANDS = ['/ia ativar aqui', '/ia on', 'ia on', 'ativar ia']
const AI_UNBIND_COMMANDS = ['/ia desativar aqui', '/ia off', 'ia off', 'desativar ia']
const BIND_HINT_COOLDOWN_MS = 60 * 1000

const repairCooldownBySession = new Map() // sessionId -> lastRepairTimestamp
const bindHintBySession = new Map() // sessionId -> timestamp

let noisyLogsSuppressed = false

function suppressNoisyLibsignalLogs() {
  if (noisyLogsSuppressed) return
  noisyLogsSuppressed = true

  const originalError = console.error
  console.error = (...args) => {
    const joined = args.map((a) => String(a)).join(' ')
    const isNoisyDecrypt = joined.includes('Failed to decrypt message with any known session')
      || joined.includes('Session error:MessageCounterError')
      || joined.includes('Session error:Error: Bad MAC')

    if (isNoisyDecrypt) {
      logger.debug({ source: 'libsignal' }, 'Log de decrypt suprimido')
      return
    }

    originalError(...args)
  }
}

function shouldIgnoreIncoming(sessionId, msg) {
  const msgId = msg?.key?.id
  if (!msgId) return false

  const now = Date.now()

  if (!processedIncoming.has(sessionId)) {
    processedIncoming.set(sessionId, new Map())
  }
  const processedMap = processedIncoming.get(sessionId)

  for (const [id, ts] of processedMap.entries()) {
    if (now - ts > INCOMING_DEDUP_WINDOW_MS) processedMap.delete(id)
  }

  if (processedMap.has(msgId)) return true
  processedMap.set(msgId, now)

  const from = msg?.key?.remoteJid || 'unknown'
  const txt = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || ''
  const normalized = txt.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized) return false

  if (!recentSignature.has(sessionId)) {
    recentSignature.set(sessionId, new Map())
  }
  const signatureMap = recentSignature.get(sessionId)

  for (const [sig, ts] of signatureMap.entries()) {
    if (now - ts > SIGNATURE_COOLDOWN_MS) signatureMap.delete(sig)
  }

  const signature = `${from}:${normalized}`
  if (signatureMap.has(signature)) return true
  signatureMap.set(signature, now)

  return false
}

function buildSessionDir(tenantId, phoneNumber) {
  return path.join(SESSIONS_PATH, `${tenantId}_${String(phoneNumber || '').replace(/\D/g, '')}`)
}

function extractJidNumber(jid = '') {
  return String(jid).split('@')[0].replace(/\D/g, '')
}

function normalizePhoneVariants(phone = '') {
  const raw = String(phone || '').replace(/\D/g, '')
  if (!raw) return []

  const variants = new Set([raw])

  // Brasil: alguns eventos chegam com/sem o nono digito apos DDD.
  if (raw.startsWith('55') && raw.length >= 12) {
    const country = raw.slice(0, 2)
    const ddd = raw.slice(2, 4)
    const rest = raw.slice(4)

    if (rest.length >= 9 && rest.startsWith('9')) {
      variants.add(`${country}${ddd}${rest.slice(1)}`)
    }

    if (rest.length === 8) {
      variants.add(`${country}${ddd}9${rest}`)
    }
  }

  return [...variants]
}

function phoneMatches(a = '', b = '') {
  const aVariants = normalizePhoneVariants(a)
  const bVariants = normalizePhoneVariants(b)
  if (aVariants.length === 0 || bVariants.length === 0) return false

  const bSet = new Set(bVariants)
  return aVariants.some((v) => bSet.has(v))
}

function isOwnerChat(remoteJid, ownerPhoneNumber) {
  if (!remoteJid || !ownerPhoneNumber) return false
  return phoneMatches(extractJidNumber(remoteJid), ownerPhoneNumber)
}

function isOwnerParticipant(msg, ownerPhoneNumber) {
  const participant = msg?.key?.participant || msg?.participant || msg?.message?.senderKeyDistributionMessage?.groupId || ''
  if (!participant || !ownerPhoneNumber) return false
  return phoneMatches(extractJidNumber(participant), ownerPhoneNumber)
}

function isCustomAiChat(remoteJid) {
  if (!remoteJid || !WA_AI_CHAT_NUMBER) return false
  return extractJidNumber(remoteJid) === WA_AI_CHAT_NUMBER
}

function isAllowedAiChat(remoteJid, ownerPhoneNumber) {
  const ownerChat = isOwnerChat(remoteJid, ownerPhoneNumber)
  const customChat = isCustomAiChat(remoteJid)

  if (WA_AI_CHAT_MODE === 'CUSTOM_ONLY') return customChat
  if (WA_AI_CHAT_MODE === 'SELF_OR_CUSTOM') return ownerChat || customChat
  return ownerChat
}

function getBoundChatFilePath(sessionDir) {
  return path.join(sessionDir, 'ai-chat-binding.json')
}

function loadBoundChatJid(sessionDir) {
  const filePath = getBoundChatFilePath(sessionDir)
  if (!fs.existsSync(filePath)) return null

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed?.boundChatJid || null
  } catch {
    return null
  }
}

function saveBoundChatJid(sessionDir, boundChatJid) {
  const filePath = getBoundChatFilePath(sessionDir)
  const payload = JSON.stringify({ boundChatJid }, null, 2)
  fs.writeFileSync(filePath, payload, 'utf8')
}

function clearBoundChatJid(sessionDir) {
  const filePath = getBoundChatFilePath(sessionDir)
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true })
}

function isBoundChat(remoteJid, boundChatJid) {
  if (!remoteJid || !boundChatJid) return false
  return remoteJid === boundChatJid
}

function isGroupJid(jid = '') {
  return String(jid).endsWith('@g.us')
}

function hasAudioPayload(payload, visited = new Set()) {
  if (!payload || typeof payload !== 'object') return false
  if (visited.has(payload)) return false
  visited.add(payload)

  if (payload.audioMessage) return true

  const mimeType = String(payload.mimetype || payload.mediaType || '').toLowerCase()
  if (mimeType.startsWith('audio/')) return true
  if (payload.ptt === true) return true

  for (const value of Object.values(payload)) {
    if (value && typeof value === 'object' && hasAudioPayload(value, visited)) {
      return true
    }
  }

  return false
}

function encodeMaybeBinary(value) {
  if (!value) return ''
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (Array.isArray(value)) return Buffer.from(value).toString('base64')
  return String(value)
}

function buildAudioFingerprint(msg, normalizedMessage) {
  const audio = normalizedMessage?.audioMessage || msg?.message?.audioMessage || {}
  const from = msg?.key?.remoteJid || 'unknown'
  const participant = msg?.key?.participant || msg?.participant || ''
  const timestamp = String(msg?.messageTimestamp || '')

  const shaKey = encodeMaybeBinary(audio?.fileSha256)
  const mediaKeyTs = String(audio?.mediaKeyTimestamp || '')
  const seconds = String(audio?.seconds || '')
  const directPath = String(audio?.directPath || '')
  const mimetype = String(audio?.mimetype || '')

  return [from, participant, shaKey, mediaKeyTs, seconds, directPath, mimetype, timestamp].join('|')
}

function shouldSendAudioWarning(sessionId, msg, normalizedMessage) {
  const now = Date.now()

  if (!recentAudioWarnings.has(sessionId)) {
    recentAudioWarnings.set(sessionId, new Map())
  }

  const warningMap = recentAudioWarnings.get(sessionId)

  for (const [fingerprint, ts] of warningMap.entries()) {
    if (now - ts > AUDIO_WARNING_COOLDOWN_MS) warningMap.delete(fingerprint)
  }

  const fingerprint = buildAudioFingerprint(msg, normalizedMessage)
  if (warningMap.has(fingerprint)) return false

  warningMap.set(fingerprint, now)
  return true
}

function normalizeCommand(text = '') {
  return String(text).trim().toLowerCase()
}

function isBindCommand(text = '') {
  const normalized = normalizeCommand(text)
  return AI_BIND_COMMANDS.includes(normalized)
}

function isUnbindCommand(text = '') {
  const normalized = normalizeCommand(text)
  return AI_UNBIND_COMMANDS.includes(normalized)
}

async function sendMessageWithFallback(sock, primaryJid, fallbackJid, text, context = {}) {
  const tried = []

  if (primaryJid) {
    tried.push(primaryJid)
    try {
      const sent = await sock.sendMessage(primaryJid, { text })
      logger.info({ ...context, to: primaryJid }, 'Mensagem enviada')
      return sent
    } catch (error) {
      logger.warn({ ...context, to: primaryJid, error: error.message }, 'Falha ao enviar para JID primario')
    }
  }

  if (fallbackJid && !tried.includes(fallbackJid)) {
    try {
      const sent = await sock.sendMessage(fallbackJid, { text })
      logger.info({ ...context, to: fallbackJid }, 'Mensagem enviada via fallback')
      return sent
    } catch (error) {
      logger.error({ ...context, to: fallbackJid, error: error.message }, 'Falha ao enviar para JID fallback')
      throw error
    }
  }

  throw new Error('Nao foi possivel enviar mensagem: nenhum JID valido')
}

/**
 * Inicia uma sessão WhatsApp para um tenant.
 * Retorna o QR Code para escaneamento.
 */
export async function startWhatsAppSession(tenantId, phoneNumber) {
  suppressNoisyLibsignalLogs()

  return new Promise(async (resolve, reject) => {
    // Criar ou recuperar sessão no banco
    let session = await prisma.whatsAppSession.findFirst({
      where: { tenantId, phoneNumber }
    })

    if (!session) {
      session = await prisma.whatsAppSession.create({
        data: { tenantId, phoneNumber, sessionPath: path.join(SESSIONS_PATH, `${tenantId}_${phoneNumber}`) }
      })
    }

    const sessionDir = buildSessionDir(tenantId, phoneNumber)
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })
    const boundChatJid = loadBoundChatJid(sessionDir)

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      logger: logger.child({ level: 'silent' }),
      generateHighQualityLinkPreview: false,
      // Evita timeout de init queries que derruba o processo em ambientes instaveis.
      fireInitQueries: false
    })

    // Numero normalizado do dono da sessao
    const ownerJid = `${phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`

    activeSessions.set(session.id, {
      socket: sock,
      status: 'CONNECTING',
      qr: null,
      ownerJid,
      phoneNumber: phoneNumber.replace(/\D/g, ''),
      sessionDir,
      boundChatJid
    })

    // QR Code gerado
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        logger.info({ sessionId: session.id }, '📱 QR Code gerado')
        activeSessions.get(session.id).qr = qr
        activeSessions.get(session.id).status = 'QR_READY'
        resolve(qr) // retorna QR para o frontend
      }

      if (connection === 'open') {
        logger.info({ sessionId: session.id }, '✅ WhatsApp conectado!')
        activeSessions.get(session.id).status = 'CONNECTED'

        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { isActive: true, connectedAt: new Date() }
        })
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
          : true

        logger.warn({ sessionId: session.id, shouldReconnect }, 'Conexão encerrada')

        await prisma.whatsAppSession.update({
          where: { id: session.id },
          data: { isActive: false }
        })

        if (shouldReconnect) {
          logger.info('Reconectando em 5 segundos...')
          setTimeout(() => startWhatsAppSession(tenantId, phoneNumber), 5000)
        }
      }
    })

    // Salvar credenciais
    sock.ev.on('creds.update', saveCreds)

    // IDs de mensagens enviadas pelo bot (para evitar loop)
    const sentByBot = new Set()

    // Processar mensagens recebidas
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return

      for (const msg of messages) {
        if (!msg.message) continue

        // Evita processamento duplicado por retries/sync tardio
        if (shouldIgnoreIncoming(session.id, msg)) continue

        // Ignorar mensagens enviadas pelo próprio bot (evita loop)
        if (sentByBot.has(msg.key.id)) continue

        const from = msg.key.remoteJid
        if (!from) continue

        const isGroupChat = isGroupJid(from)
        if (isGroupChat && !(WA_AI_CHAT_MODE === 'BOUND_CHAT' && WA_AI_ALLOW_GROUP_BOUND)) {
          continue
        }

        const normalizedMessage = normalizeMessageContent(msg.message) || msg.message

        let text = normalizedMessage?.conversation
          || normalizedMessage?.extendedTextMessage?.text
          || ''

        const hasAudio = hasAudioPayload(normalizedMessage) || hasAudioPayload(msg.message)

        if (hasAudio) {
          if (!shouldSendAudioWarning(session.id, msg, normalizedMessage)) {
            logger.debug({ sessionId: session.id, from }, 'Audio duplicado detectado; aviso suprimido')
            continue
          }

          logger.info({ sessionId: session.id, from }, 'Audio recebido e ignorado silenciosamente')
          continue
        }

        if (!text.trim()) continue

        const sessionState = activeSessions.get(session.id)

        if (msg.key.fromMe && isBindCommand(text)) {
          if (isGroupChat && !WA_AI_ALLOW_GROUP_BOUND) {
            await sendMessageWithFallback(
              sock,
              from,
              ownerJid,
              '❌ Vinculo em grupo desativado. Ative WA_AI_ALLOW_GROUP_BOUND=true no servidor.',
              { sessionId: session.id, command: 'bind_ai_chat_group_blocked' }
            )
            continue
          }

          sessionState.boundChatJid = from
          saveBoundChatJid(sessionDir, from)
          await sendMessageWithFallback(
            sock,
            from,
            ownerJid,
            `✅ Chat da IA vinculado com sucesso. A IA respondera somente aqui (${isGroupChat ? 'grupo' : 'conversa privada'}).`,
            { sessionId: session.id, command: 'bind_ai_chat' }
          )
          continue
        }

        if (msg.key.fromMe && isUnbindCommand(text)) {
          sessionState.boundChatJid = null
          clearBoundChatJid(sessionDir)
          await sendMessageWithFallback(
            sock,
            from,
            ownerJid,
            '✅ Vinculo removido. Defina outro chat com /ia ativar aqui.',
            { sessionId: session.id, command: 'unbind_ai_chat' }
          )
          continue
        }

        const isSelfChat = isOwnerChat(from, phoneNumber)
        const isFromOwner = !!msg.key.fromMe || isOwnerParticipant(msg, phoneNumber)
        const isAllowedByMode = isAllowedAiChat(from, phoneNumber)
        const isBoundMode = WA_AI_CHAT_MODE === 'BOUND_CHAT'
        const isBoundAllowed = isBoundChat(from, sessionState?.boundChatJid || null)
        const isAllowedChat = isBoundMode ? isBoundAllowed : isAllowedByMode

        if (isBoundMode && isFromOwner && !sessionState?.boundChatJid) {
          const now = Date.now()
          const lastHint = bindHintBySession.get(session.id) || 0
          if (now - lastHint > BIND_HINT_COOLDOWN_MS) {
            bindHintBySession.set(session.id, now)
            await sendMessageWithFallback(
              sock,
              from,
              ownerJid,
              'IA ainda nao vinculada neste modo. Envie /ia on neste chat para ativar.',
              { sessionId: session.id, from, fromMe: msg.key.fromMe, bindHint: true }
            )
          }
          continue
        }

        // Regra de seguranca: responder apenas em chat autorizado e enviado pelo dono da sessao.
        if (!isAllowedChat || !isFromOwner) {
          logger.debug({ sessionId: session.id, from, fromMe: msg.key.fromMe, mode: WA_AI_CHAT_MODE }, 'Mensagem ignorada: chat nao autorizado para IA')
          continue
        }

        // Sempre usamos o dono da sessao como remetente logico no processamento interno.
        const senderPhone = ownerJid
        const replyTo = from

        logger.info({ from, senderPhone, fromMe: msg.key.fromMe, text }, '📨 Mensagem recebida')

        try {
          // Auto-vincular dono da sessão ao tenant se ainda não estiver vinculado
          if (msg.key.fromMe) {
            await autoLinkSessionOwner(tenantId, phoneNumber.replace(/\D/g, ''))
          }

          const response = await processWhatsAppMessage(tenantId, text, senderPhone)

          const sent = await sendMessageWithFallback(
            sock,
            replyTo,
            ownerJid,
            response,
            { sessionId: session.id, from, fromMe: msg.key.fromMe }
          )
          if (sent?.key?.id) sentByBot.add(sent.key.id)
        } catch (error) {
          logger.error({ error: error.message }, 'Erro ao processar mensagem')
          try {
            const sent = await sendMessageWithFallback(
              sock,
              replyTo,
              ownerJid,
              '❌ Ocorreu um erro. Tente novamente.',
              { sessionId: session.id, from, fromMe: msg.key.fromMe }
            )
            if (sent?.key?.id) sentByBot.add(sent.key.id)
          } catch (e) {
            logger.error({ error: e.message }, 'Erro ao enviar mensagem de erro')
          }
        }
      }
    })
  })
}

export async function sendSystemMessageToSession(sessionId, message, fallbackPhoneNumber = null) {
  const active = activeSessions.get(sessionId)
  if (!active?.socket) {
    throw new Error('Sessao WhatsApp nao esta ativa.')
  }

  const phone = (fallbackPhoneNumber || active.phoneNumber || '').replace(/\D/g, '')
  const ownerJid = active.ownerJid || (phone ? `${phone}@s.whatsapp.net` : null)

  if (!ownerJid) {
    throw new Error('Nao foi possivel determinar o destinatario da sessao.')
  }

  const sent = await sendMessageWithFallback(
    active.socket,
    ownerJid,
    phone ? `${phone}@lid` : null,
    message,
    { sessionId, systemMessage: true }
  )

  return sent
}

export async function sendSystemMessageToPhone(phoneNumber, message, options = {}) {
  const phone = String(phoneNumber || '').replace(/\D/g, '')
  if (!phone) {
    throw new Error('Numero de destino invalido para envio WhatsApp.')
  }

  const explicitSessionId = options?.sessionId || null
  const configuredSessionId = process.env.WA_SYSTEM_SENDER_SESSION_ID || null
  const preferredSenderPhone = String(options?.senderPhone || WA_SYSTEM_SENDER_PHONE || '').replace(/\D/g, '')

  const preferredIds = [explicitSessionId, configuredSessionId].filter(Boolean)
  const candidates = []

  if (preferredSenderPhone) {
    for (const [sessionId, active] of activeSessions.entries()) {
      if (active?.socket && active?.status === 'CONNECTED' && String(active.phoneNumber || '').replace(/\D/g, '') === preferredSenderPhone) {
        candidates.push({ sessionId, active })
        break
      }
    }
  }

  for (const preferredId of preferredIds) {
    const active = activeSessions.get(preferredId)
    if (active?.socket && active?.status === 'CONNECTED') {
      candidates.push({ sessionId: preferredId, active })
      break
    }
  }

  if (candidates.length === 0) {
    for (const [sessionId, active] of activeSessions.entries()) {
      if (active?.socket && active?.status === 'CONNECTED') {
        candidates.push({ sessionId, active })
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error('Nenhuma sessao WhatsApp conectada para enviar boas-vindas.')
  }

  const targetJid = `${phone}@s.whatsapp.net`
  const targetFallbackJid = `${phone}@lid`
  let lastError = null

  for (const candidate of candidates) {
    try {
      await sendMessageWithFallback(
        candidate.active.socket,
        targetJid,
        targetFallbackJid,
        message,
        { systemMessage: true, senderSessionId: candidate.sessionId, targetPhone: phone }
      )

      return { sessionId: candidate.sessionId, targetPhone: phone }
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(lastError?.message || 'Falha ao enviar mensagem de boas-vindas no WhatsApp.')
}

/**
 * Vincula automaticamente o dono da sessão ao tenant se ainda não estiver vinculado.
 * Isso evita que o admin precise se adicionar manualmente na Equipe.
 */
async function autoLinkSessionOwner(tenantId, phoneNumber) {
  try {
    let user = await prisma.user.findUnique({ where: { phoneNumber } })
    if (!user) {
      user = await prisma.user.create({ data: { phoneNumber, name: phoneNumber } })
    }
    const existing = await prisma.tenantUser.findFirst({
      where: { tenantId, userId: user.id, isActive: true }
    })
    if (!existing) {
      await prisma.tenantUser.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        update: { isActive: true, role: 'ADMIN' },
        create: { tenantId, userId: user.id, role: 'ADMIN', nickname: 'Admin' }
      })
      logger.info({ tenantId, phoneNumber }, '🔗 Dono da sessão vinculado ao tenant automaticamente')
    }
  } catch (e) {
    logger.warn({ error: e.message }, 'Falha ao auto-vincular dono da sessão')
  }
}

/**
 * Retorna o status atual de uma sessão
 */
export function getSessionStatus(sessionId) {
  const session = activeSessions.get(sessionId)
  return session?.status || 'DISCONNECTED'
}

/**
 * Desconecta e remove uma sessão
 */
export async function disconnectSession(sessionId) {
  const session = activeSessions.get(sessionId)
  if (session?.socket) {
    await session.socket.logout()
    activeSessions.delete(sessionId)
    processedIncoming.delete(sessionId)
    recentSignature.delete(sessionId)
    recentAudioWarnings.delete(sessionId)
  }
}

function getDayStart(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

async function pushRepairAudit(tenantId, entry) {
  await prisma.whatsAppRepairAudit.create({
    data: {
      tenantId,
      sessionId: entry.sessionId,
      phoneNumber: entry.phoneNumber,
      actorTenantEmail: entry.actor?.email || null,
      actorTenantPlan: entry.actor?.plan || null,
      outcome: entry.outcome,
      error: entry.error || null
    }
  })
}

export async function getRepairAuditEntries(tenantId) {
  return prisma.whatsAppRepairAudit.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: REPAIR_AUDIT_LIMIT,
    select: {
      createdAt: true,
      sessionId: true,
      phoneNumber: true,
      outcome: true,
      error: true,
      actorTenantEmail: true,
      actorTenantPlan: true
    }
  })
}

async function getTenantRepairUsageToday(tenantId) {
  const start = getDayStart()
  const used = await prisma.whatsAppRepairAudit.count({
    where: {
      tenantId,
      outcome: 'STARTED',
      createdAt: { gte: start }
    }
  })

  return {
    used,
    remaining: Math.max(REPAIR_DAILY_LIMIT - used, 0),
    limit: REPAIR_DAILY_LIMIT,
    periodStart: start
  }
}

export async function getTenantRepairLimitStatus(tenantId) {
  return getTenantRepairUsageToday(tenantId)
}

export function getWhatsAppRuntimeHealth() {
  const sessions = Array.from(activeSessions.entries()).map(([id, session]) => ({
    id,
    status: session.status,
    phoneNumber: session.phoneNumber,
    hasQr: !!session.qr
  }))

  return {
    activeCount: sessions.length,
    connectedCount: sessions.filter((s) => s.status === 'CONNECTED').length,
    qrPendingCount: sessions.filter((s) => s.status === 'QR_READY').length,
    sessions
  }
}

export async function repairWhatsAppSession(tenantId, sessionId, actor = null) {
  const session = await prisma.whatsAppSession.findFirst({
    where: { id: sessionId, tenantId }
  })

  if (!session) {
    throw new Error('Sessao nao encontrada para reparo.')
  }

  const now = Date.now()
  const lastRepair = repairCooldownBySession.get(session.id) || 0
  const remainingMs = REPAIR_COOLDOWN_MS - (now - lastRepair)

  if (remainingMs > 0) {
    const waitSeconds = Math.ceil(remainingMs / 1000)
    const cooldownError = new Error(`Aguarde ${waitSeconds}s antes de reparar novamente esta sessao.`)
    cooldownError.code = 'REPAIR_COOLDOWN'
    cooldownError.status = 429
    throw cooldownError
  }

  const dailyUsage = await getTenantRepairUsageToday(tenantId)
  if (dailyUsage.used >= REPAIR_DAILY_LIMIT) {
    const dailyLimitError = new Error(`Limite diario de ${REPAIR_DAILY_LIMIT} reparos atingido para hoje.`)
    dailyLimitError.code = 'REPAIR_DAILY_LIMIT'
    dailyLimitError.status = 429
    throw dailyLimitError
  }

  repairCooldownBySession.set(session.id, now)

  await pushRepairAudit(tenantId, {
    sessionId: session.id,
    phoneNumber: session.phoneNumber,
    actor: actor ? { id: actor.id, email: actor.email, plan: actor.plan } : null,
    outcome: 'STARTED'
  })

  try {
    await disconnectSession(session.id)
  } catch (error) {
    logger.warn({ sessionId: session.id, error: error.message }, 'Falha ao desconectar sessao antes do reparo')
  }

  const sessionDir = buildSessionDir(tenantId, session.phoneNumber)
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true })
  }

  await prisma.whatsAppSession.update({
    where: { id: session.id },
    data: { isActive: false, connectedAt: null }
  })

  let qrCode
  try {
    qrCode = await startWhatsAppSession(tenantId, session.phoneNumber)
  } catch (error) {
    await pushRepairAudit(tenantId, {
      sessionId: session.id,
      phoneNumber: session.phoneNumber,
      actor: actor ? { id: actor.id, email: actor.email, plan: actor.plan } : null,
      outcome: 'FAILED',
      error: error?.message || 'unknown_error'
    })
    throw error
  }

  await pushRepairAudit(tenantId, {
    sessionId: session.id,
    phoneNumber: session.phoneNumber,
    actor: actor ? { id: actor.id, email: actor.email, plan: actor.plan } : null,
    outcome: 'SUCCESS'
  })

  return {
    sessionId: session.id,
    phoneNumber: session.phoneNumber,
    qrCode
  }
}

/**
 * Reconectar todas as sessões ativas ao iniciar o servidor
 */
export async function reconnectActiveSessions() {
  const sessions = await prisma.whatsAppSession.findMany({ where: { isActive: true } })

  for (const session of sessions) {
    logger.info({ sessionId: session.id }, 'Reconectando sessão...')
    try {
      await startWhatsAppSession(session.tenantId, session.phoneNumber)
    } catch (error) {
      logger.error({ error, sessionId: session.id }, 'Falha ao reconectar')
    }
  }
}
