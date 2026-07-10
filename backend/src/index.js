import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { authRouter } from './routes/auth.js'
import { adminRouter } from './routes/admin.js'
import { billingRouter } from './routes/billing.js'
import { apiRouter } from './routes/api.js'
import { tenantsRouter } from './routes/tenants.js'
import { whatsappRouter } from './routes/whatsapp.js'
import { usersRouter } from './routes/users.js'
import { authenticateToken } from './middleware/auth.js'
import { startReminderCron } from './services/reminderService.js'
import { reconnectActiveSessions } from './services/whatsappManager.js'
import { logger } from './config/logger.js'

const app = express()
const PORT = process.env.PORT || 3001
const WA_ENABLED = String(process.env.WA_ENABLED || 'true').trim().toLowerCase() === 'true'
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000)
const RATE_LIMIT_AUTH_MAX = Number(process.env.RATE_LIMIT_AUTH_MAX || 120)
const RATE_LIMIT_PUBLIC_MAX = Number(process.env.RATE_LIMIT_PUBLIC_MAX || 400)
const RATE_LIMIT_PROTECTED_MAX = Number(process.env.RATE_LIMIT_PROTECTED_MAX || 2400)

// Render and similar platforms run behind reverse proxies.
// Trusting the first proxy preserves the real client IP for rate limiting.
app.set('trust proxy', 1)

function isLocalLanOrigin(origin = '') {
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(origin)
}

function buildAllowedOrigins() {
  const single = String(process.env.FRONTEND_URL || 'http://localhost:3000').trim()
  const many = String(process.env.FRONTEND_URLS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return new Set([single, ...many])
}

const allowedOrigins = buildAllowedOrigins()

const authRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
})

const publicApiRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_PUBLIC_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições, tente novamente em 15 minutos.' }
})

const protectedApiRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_PROTECTED_MAX,
  keyGenerator: (req) => `tenant:${req.tenant?.id || req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições para sua conta. Aguarde alguns instantes e tente novamente.' }
})

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection capturada')
})

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception capturada')
})

// ===========================
// SEGURANÇA
// ===========================
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.has(origin) || isLocalLanOrigin(origin)) return callback(null, true)
    return callback(new Error('Origin nao permitida pelo CORS'))
  },
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ===========================
// ROTAS PÚBLICAS
// ===========================
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }))
app.use('/api/auth', authRateLimiter, authRouter)
app.use('/api/admin', publicApiRateLimiter, adminRouter)
app.use('/api/billing', publicApiRateLimiter, billingRouter)

// ===========================
// ROTAS PROTEGIDAS
// ===========================
app.use('/api', authenticateToken)
app.use('/api', protectedApiRateLimiter)
app.use('/api/dashboard', apiRouter)
app.use('/api/tenants', tenantsRouter)
if (WA_ENABLED) {
  app.use('/api/whatsapp', whatsappRouter)
}
app.use('/api/users', usersRouter)

// ===========================
// ERRO 404
// ===========================
app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada' }))

// ===========================
// ERRO GLOBAL
// ===========================
app.use((err, _req, res, _next) => {
  logger.error(err)
  res.status(500).json({ error: 'Erro interno do servidor' })
})

// ===========================
// INICIAR SERVIDOR
// ===========================
app.listen(PORT, () => {
  logger.info(`🚀 Servidor rodando na porta ${PORT}`)
  startReminderCron()

  if (WA_ENABLED) {
    reconnectActiveSessions()
      .then(() => logger.info('✅ Sessões WhatsApp ativas reconectadas'))
      .catch((error) => logger.error({ error }, 'Falha ao reconectar sessões WhatsApp'))
  } else {
    logger.info('Modo APP_ONLY ativo: integracao WhatsApp desativada')
  }
})

export default app
