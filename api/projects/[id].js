import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()

// GET /api/projects/:id — with tasks
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const project = await getAccessibleProject(req.params.id, req.user.userId)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    return res.json(project)
  } catch (err) {
    console.error('[GET /projects/:id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/projects/:id — owner only
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const project = await getAccessibleProject(req.params.id, req.user.userId)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    if (project.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the project owner can edit this project' })
    }

    const { name, description, color, isShared } = req.body
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(color !== undefined && { color }),
        ...(isShared !== undefined && { isShared }),
      },
      include: { owner: { select: { id: true, name: true } }, _count: { select: { tasks: true } } },
    })
    return res.json(updated)
  } catch (err) {
    console.error('[PUT /projects/:id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/projects/:id — owner only
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const project = await getAccessibleProject(req.params.id, req.user.userId)
    if (!project) return res.status(404).json({ error: 'Project not found' })
    if (project.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the project owner can delete this project' })
    }

    await prisma.project.delete({ where: { id: project.id } })
    return res.json({ message: 'Project deleted' })
  } catch (err) {
    console.error('[DELETE /projects/:id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

async function getAccessibleProject(id, userId) {
  return prisma.project.findFirst({
    where: { id, OR: [{ ownerId: userId }, { isShared: true }] },
    include: { owner: { select: { id: true, name: true } }, _count: { select: { tasks: true } } },
  })
}

export default router
