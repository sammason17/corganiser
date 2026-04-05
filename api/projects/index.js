import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()

// GET /api/projects
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId
    const projects = await prisma.project.findMany({
      where: { OR: [{ ownerId: userId }, { isShared: true }] },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    })
    return res.json(projects)
  } catch (err) {
    console.error('[GET /projects]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/projects
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description, color, isShared } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })

    const project = await prisma.project.create({
      data: {
        name,
        description,
        color: color || '#6366f1',
        isShared: isShared ?? false,
        ownerId: req.user.userId,
      },
      include: { owner: { select: { id: true, name: true } }, _count: { select: { tasks: true } } },
    })
    return res.status(201).json(project)
  } catch (err) {
    console.error('[POST /projects]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
