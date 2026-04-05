import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()

// GET /api/tasks/:id — get a single task with full details
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const task = await getAccessibleTask(req.params.id, req.user.userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    return res.json(shapeTask(task))
  } catch (err) {
    console.error('[GET /tasks/:id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/tasks/:id — update a task (owner only for core fields)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const task = await getAccessibleTask(req.params.id, req.user.userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    // Only the owner can edit core task fields
    if (task.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the task owner can edit this task' })
    }

    const { title, description, status, priority, dueDate, isShared, projectIds, categoryIds } = req.body

    // Update task, replace project/category associations if provided
    const updated = await prisma.$transaction(async (tx) => {
      if (projectIds !== undefined) {
        await tx.taskProject.deleteMany({ where: { taskId: task.id } })
      }
      if (categoryIds !== undefined) {
        await tx.taskCategory.deleteMany({ where: { taskId: task.id } })
      }

      return tx.task.update({
        where: { id: task.id },
        data: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status }),
          ...(priority !== undefined && { priority }),
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          ...(isShared !== undefined && { isShared }),
          ...(projectIds !== undefined && projectIds.length > 0 && {
            projects: { create: projectIds.map(projectId => ({ projectId })) },
          }),
          ...(categoryIds !== undefined && categoryIds.length > 0 && {
            categories: { create: categoryIds.map(categoryId => ({ categoryId })) },
          }),
        },
        include: {
          owner: { select: { id: true, name: true } },
          projects: { include: { project: { select: { id: true, name: true, color: true } } } },
          categories: { include: { category: { select: { id: true, name: true, color: true } } } },
          _count: { select: { updates: true, timeLogs: true } },
        },
      })
    })

    return res.json(shapeTask(updated))
  } catch (err) {
    console.error('[PUT /tasks/:id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/tasks/:id — owner only
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const task = await getAccessibleTask(req.params.id, req.user.userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    if (task.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the task owner can delete this task' })
    }

    await prisma.task.delete({ where: { id: task.id } })
    return res.json({ message: 'Task deleted' })
  } catch (err) {
    console.error('[DELETE /tasks/:id]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/tasks/:id/updates — add a note/update (any user with access)
router.post('/:id/updates', requireAuth, async (req, res) => {
  try {
    const task = await getAccessibleTask(req.params.id, req.user.userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    const { content } = req.body
    if (!content) return res.status(400).json({ error: 'content is required' })

    const update = await prisma.taskUpdate.create({
      data: { content, taskId: task.id, userId: req.user.userId },
      include: { user: { select: { id: true, name: true } } },
    })

    return res.status(201).json(update)
  } catch (err) {
    console.error('[POST /tasks/:id/updates]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/tasks/:id/updates — get the notes log
router.get('/:id/updates', requireAuth, async (req, res) => {
  try {
    const task = await getAccessibleTask(req.params.id, req.user.userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    const updates = await prisma.taskUpdate.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true } } },
    })

    return res.json(updates)
  } catch (err) {
    console.error('[GET /tasks/:id/updates]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/tasks/:id/time-logs — log time on a task (any user with access)
router.post('/:id/time-logs', requireAuth, async (req, res) => {
  try {
    const task = await getAccessibleTask(req.params.id, req.user.userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    const { durationMinutes, description, loggedAt } = req.body
    if (!durationMinutes || durationMinutes <= 0) {
      return res.status(400).json({ error: 'durationMinutes must be a positive number' })
    }

    const log = await prisma.timeLog.create({
      data: {
        durationMinutes: parseInt(durationMinutes),
        description,
        loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
        taskId: task.id,
        userId: req.user.userId,
      },
      include: { user: { select: { id: true, name: true } } },
    })

    return res.status(201).json(log)
  } catch (err) {
    console.error('[POST /tasks/:id/time-logs]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/tasks/:id/time-logs — get time logs for a task
router.get('/:id/time-logs', requireAuth, async (req, res) => {
  try {
    const task = await getAccessibleTask(req.params.id, req.user.userId)
    if (!task) return res.status(404).json({ error: 'Task not found' })

    const logs = await prisma.timeLog.findMany({
      where: { taskId: task.id },
      orderBy: { loggedAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    })

    const totalMinutes = logs.reduce((sum, l) => sum + l.durationMinutes, 0)
    return res.json({ logs, totalMinutes })
  } catch (err) {
    console.error('[GET /tasks/:id/time-logs]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── helpers ──────────────────────────────────────────────────────────────────

async function getAccessibleTask(id, userId) {
  return prisma.task.findFirst({
    where: {
      id,
      OR: [{ ownerId: userId }, { isShared: true }],
    },
    include: {
      owner: { select: { id: true, name: true } },
      projects: { include: { project: { select: { id: true, name: true, color: true } } } },
      categories: { include: { category: { select: { id: true, name: true, color: true } } } },
      _count: { select: { updates: true, timeLogs: true } },
    },
  })
}

function shapeTask(task) {
  return {
    ...task,
    projects: task.projects.map(tp => tp.project),
    categories: task.categories.map(tc => tc.category),
  }
}

export default router
