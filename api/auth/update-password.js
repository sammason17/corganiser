import express from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()

router.put('/', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' })
    }

    // Fetch user with password hash
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    // Hash new password and update
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return res.json({ message: 'Password updated successfully' })
  } catch (err) {
    console.error('[update-password]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
