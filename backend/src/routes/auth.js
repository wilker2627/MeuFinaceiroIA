import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/database.js'
import { generateToken } from '../middleware/auth.js'
import { seedDefaultCategories } from '../services/categoryService.js'

export const authRouter = Router()

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase()
}

function canUseLocalPasswordRecovery() {
  const flag = String(process.env.ALLOW_LOCAL_PASSWORD_RESET || '').trim().toLowerCase()
  if (flag === 'true') return true
  if (flag === 'false') return false
  return (process.env.NODE_ENV || 'development') !== 'production'
}

// POST /api/auth/register
authRouter.post('/register', async (req, res) => {
  try {
    const { name, password } = req.body
    const email = normalizeEmail(req.body?.email)

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres.' })
    }

    const exists = await prisma.tenant.findUnique({ where: { email } })
    if (exists) {
      return res.status(409).json({ error: 'E-mail já cadastrado.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const tenant = await prisma.tenant.create({
      data: { name: String(name || '').trim(), email, passwordHash },
      select: { id: true, name: true, email: true, plan: true }
    })

    // Criar conta padrão "Caixa" e categorias padrão
    await prisma.account.create({
      data: { tenantId: tenant.id, name: 'Caixa', type: 'CASH', balance: 0 }
    })
    await prisma.account.create({
      data: { tenantId: tenant.id, name: 'Banco', type: 'CHECKING', balance: 0 }
    })
    await seedDefaultCategories(tenant.id)

    const token = generateToken(tenant)

    res.status(201).json({ tenant, token })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erro ao criar conta.' })
  }
})

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email)
    const { password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
    }

    const tenant = await prisma.tenant.findUnique({ where: { email } })

    if (!tenant || !tenant.isActive) {
      return res.status(401).json({ error: 'Credenciais inválidas.' })
    }

    const valid = await bcrypt.compare(password, tenant.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas.' })
    }

    const token = generateToken(tenant)
    const { passwordHash: _, ...tenantData } = tenant

    res.json({ tenant: tenantData, token })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Erro ao fazer login.' })
  }
})

// POST /api/auth/password-reset-local
authRouter.post('/password-reset-local', async (req, res) => {
  try {
    if (!canUseLocalPasswordRecovery()) {
      return res.status(403).json({ error: 'Recuperacao local desativada neste ambiente.' })
    }

    const email = normalizeEmail(req.body?.email)
    const newPassword = String(req.body?.newPassword || '')

    if (!email || !newPassword) {
      return res.status(400).json({ error: 'E-mail e nova senha sao obrigatorios.' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nova senha deve ter no minimo 8 caracteres.' })
    }

    const tenant = await prisma.tenant.findUnique({ where: { email } })
    if (!tenant) {
      return res.status(404).json({ error: 'Conta nao encontrada para este e-mail.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { passwordHash, isActive: true }
    })

    return res.json({ message: 'Senha atualizada com sucesso. Faça login com a nova senha.' })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar senha.' })
  }
})
