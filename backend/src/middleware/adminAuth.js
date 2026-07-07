import jwt from 'jsonwebtoken'

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin_dev_secret_change_in_production'

export function generateAdminToken(payload) {
  return jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: '12h' })
}

export function authenticateAdminToken(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Token admin obrigatorio.' })
  }

  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET)
    req.admin = payload
    next()
  } catch {
    return res.status(403).json({ error: 'Token admin invalido ou expirado.' })
  }
}
