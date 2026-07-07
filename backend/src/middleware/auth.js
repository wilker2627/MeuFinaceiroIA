import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production'

/**
 * Middleware de autenticação JWT
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso necessário.' })
  }

  try {
    const payload = jwt.verify(token, SECRET)
    req.tenant = payload // { id, email, plan }
    next()
  } catch {
    return res.status(403).json({ error: 'Token inválido ou expirado.' })
  }
}

export function generateToken(tenant) {
  return jwt.sign(
    { id: tenant.id, email: tenant.email, plan: tenant.plan },
    SECRET,
    { expiresIn: '7d' }
  )
}
