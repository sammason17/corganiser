import express from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../../lib/prisma.js'
import { signToken } from '../../lib/auth.js'

const router = express.Router()

router.post('/', async (req, res) => {
  try {
    const { name, email, password, registrationCode } = req.body

    // Validate required fields
    if (!name || !email || !password || !registrationCode) {
      return res.status(400).json({ error: 'name, email, password, and registrationCode are required' })
    }

    // Validate registration code
    if (registrationCode !== process.env.REGISTRATION_CODE) {
      return res.status(403).json({ error: 'Invalid registration code' })
    }

    // Check email not already taken
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists' })
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
      select: { id: true, name: true, email: true, createdAt: true },
    })

    // Sign token
    const token = signToken({ userId: user.id, email: user.email, name: user.name })

    return res.status(201).json({ user, token })
  } catch (err) {
    console.error('[register]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
