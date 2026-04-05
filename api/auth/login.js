import express from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../../lib/prisma.js'
import { signToken } from '../../lib/auth.js'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' })
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      // Use generic message to avoid email enumeration
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // Compare password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = signToken({ userId: user.id, email: user.email, name: user.name })

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
    })
  } catch (err) {
    console.error('[login]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
