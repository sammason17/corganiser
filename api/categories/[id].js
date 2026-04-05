import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()

// PUT /api/categories/:id — owner only
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const category = await getAccessibleCategory(req.params.id, req.user.userId)
    if (!category) return res.status(404).json({ error: 'Category not found' })
    if (category.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the category owner can edit it' })
    }

    const { name, color, isShared } = req.body
    const updated = await prisma.category.update({
      where: { id: category.id },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(isShared !== undefined && { isShared }),
      },
      include: { owner: { select: { id: true, name: true } }, _count: { select: { tasks: true } } },
    })
    return res.json(updated)
  } catch (err) {
    console.error('[PUT /categories/:id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/categories/:id — owner only
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const category = await getAccessibleCategory(req.params.id, req.user.userId)
    if (!category) return res.status(404).json({ error: 'Category not found' })
    if (category.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the category owner can delete it' })
    }

    await prisma.category.delete({ where: { id: category.id } })
    return res.json({ message: 'Category deleted' })
  } catch (err) {
    console.error('[DELETE /categories/:id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

async function getAccessibleCategory(id, userId) {
  return prisma.category.findFirst({
    where: { id, OR: [{ ownerId: userId }, { isShared: true }] },
    include: { owner: { select: { id: true, name: true } }, _count: { select: { tasks: true } } },
  })
}

export default router
