import jwt from 'jsonwebtoken'
import prisma from './prisma.js'

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET)
}

/**
 * Express middleware: verifies Bearer token and attaches user + family to req.user
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' })
  }

  const token = authHeader.slice(7)
  try {
    const decoded = verifyToken(token)
    req.user = decoded

    // Resolve family membership
    if (!req.user.familyId) {
      let membership = await prisma.familyMember.findFirst({
        where: { userId: decoded.userId },
        select: { familyId: true, role: true }
      })
      if (!membership) {
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
        const newFamily = await prisma.family.create({
          data: {
            name: `${user?.name || 'My'} Family`,
            inviteCode: 'FAM-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            members: {
              create: [{ userId: decoded.userId, role: 'OWNER' }]
            },
            state: { create: { partnerStatementAmount: 0 } },
            automationConfig: { create: {} }
          }
        })
        membership = { familyId: newFamily.id, role: 'OWNER' }
      }
      req.user.familyId = membership.familyId
      req.user.familyRole = membership.role
    }

    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
