import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()

// GET /api/users/me — get the authenticated user's profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    })
    if (!user) return res.status(404).json({ error: 'User not found' })
    return res.json(user)
  } catch (err) {
    console.error('[GET /users/me]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/users/me — update name or email
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, email } = req.body

    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: req.user.userId } },
      })
      if (existing) return res.status(409).json({ error: 'Email already in use' })
    }

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
      },
      select: { id: true, name: true, email: true, createdAt: true },
    })
    return res.json(user)
  } catch (err) {
    console.error('[PUT /users/me]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
