import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()

// GET /api/tasks — list tasks visible to the authenticated user
// Supports query params: status, priority, projectId, categoryId, shared
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, priority, projectId, categoryId, shared } = req.query
    const userId = req.user.userId

    const where = {
      OR: [
        { ownerId: userId },
        { isShared: true },
      ],
      ...(status && { status }),
      ...(priority && { priority }),
      ...(projectId && { projects: { some: { projectId } } }),
      ...(categoryId && { categories: { some: { categoryId } } }),
      ...(shared === 'true' && { isShared: true }),
      ...(shared === 'false' && { ownerId: userId, isShared: false }),
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        owner: { select: { id: true, name: true } },
        projects: { include: { project: { select: { id: true, name: true, color: true } } } },
        categories: { include: { category: { select: { id: true, name: true, color: true } } } },
        _count: { select: { updates: true, timeLogs: true } },
      },
    })

    // Flatten join tables for cleaner response
    const shaped = tasks.map(shapeTask)
    return res.json(shaped)
  } catch (err) {
    console.error('[GET /tasks]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/tasks — create a new task
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, isShared, projectIds, categoryIds } = req.body

    if (!title) {
      return res.status(400).json({ error: 'title is required' })
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        status: status || 'TODO',
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
        isShared: isShared ?? false,
        ownerId: req.user.userId,
        projects: projectIds?.length
          ? { create: projectIds.map(projectId => ({ projectId })) }
          : undefined,
        categories: categoryIds?.length
          ? { create: categoryIds.map(categoryId => ({ categoryId })) }
          : undefined,
      },
      include: {
        owner: { select: { id: true, name: true } },
        projects: { include: { project: { select: { id: true, name: true, color: true } } } },
        categories: { include: { category: { select: { id: true, name: true, color: true } } } },
        _count: { select: { updates: true, timeLogs: true } },
      },
    })

    return res.status(201).json(shapeTask(task))
  } catch (err) {
    console.error('[POST /tasks]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Helper: flatten Prisma join tables
function shapeTask(task) {
  return {
    ...task,
    projects: task.projects.map(tp => tp.project),
    categories: task.categories.map(tc => tc.category),
  }
}

export default router
