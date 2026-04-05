import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()

// GET /api/categories
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId
    const categories = await prisma.category.findMany({
      where: { OR: [{ ownerId: userId }, { isShared: true }] },
      orderBy: { name: 'asc' },
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    })
    return res.json(categories)
  } catch (err) {
    console.error('[GET /categories]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/categories
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, color, isShared } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })

    const category = await prisma.category.create({
      data: {
        name,
        color: color || '#f59e0b',
        isShared: isShared ?? false,
        ownerId: req.user.userId,
      },
      include: { owner: { select: { id: true, name: true } }, _count: { select: { tasks: true } } },
    })
    return res.status(201).json(category)
  } catch (err) {
    console.error('[POST /categories]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
