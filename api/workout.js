import express from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../lib/auth.js'

const router = express.Router()
router.use(requireAuth)

// ── Default seeds ─────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = ['Strength', 'Cardio', 'Mobility', 'HIIT', 'Flexibility', 'Calisthenics']
const DEFAULT_BODY_AREAS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full Body']

// ── Include helpers ───────────────────────────────────────────────────────────
const exerciseInclude = {
  categories: { include: { category: { select: { id: true, name: true } } } },
  bodyAreas: { include: { bodyArea: { select: { id: true, name: true } } } },
}

const planListInclude = {
  _count: { select: { days: true } },
}

const planDetailInclude = {
  days: {
    orderBy: { dayNumber: 'asc' },
    include: {
      exercises: {
        orderBy: { sortOrder: 'asc' },
        include: { exercise: { include: exerciseInclude } },
      },
    },
  },
}

// ── Shape helpers ─────────────────────────────────────────────────────────────
function shapeExercise(ex) {
  return {
    ...ex,
    categories: ex.categories.map(link => link.category),
    bodyAreas: ex.bodyAreas.map(link => link.bodyArea),
  }
}

function shapePlanDetail(plan) {
  return {
    ...plan,
    days: plan.days.map(day => ({
      ...day,
      exercises: day.exercises.map(de => ({
        ...de,
        exercise: shapeExercise(de.exercise),
      })),
    })),
  }
}

// ── Exercise Categories ───────────────────────────────────────────────────────

router.get('/exercise-categories', async (req, res) => {
  try {
    const userId = req.user.userId
    let categories = await prisma.exerciseCategory.findMany({
      where: { ownerId: userId },
      orderBy: { name: 'asc' },
    })
    // Seed defaults on first use
    if (categories.length === 0) {
      await prisma.exerciseCategory.createMany({
        data: DEFAULT_CATEGORIES.map(name => ({ name, ownerId: userId })),
      })
      categories = await prisma.exerciseCategory.findMany({
        where: { ownerId: userId },
        orderBy: { name: 'asc' },
      })
    }
    res.json(categories)
  } catch (err) {
    console.error('[GET /workout/exercise-categories]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/exercise-categories', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const category = await prisma.exerciseCategory.create({
      data: { name: name.trim(), ownerId: req.user.userId },
    })
    res.status(201).json(category)
  } catch (err) {
    console.error('[POST /workout/exercise-categories]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/exercise-categories/:id', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const existing = await prisma.exerciseCategory.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    const updated = await prisma.exerciseCategory.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
    })
    res.json(updated)
  } catch (err) {
    console.error('[PUT /workout/exercise-categories/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/exercise-categories/:id', async (req, res) => {
  try {
    const existing = await prisma.exerciseCategory.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    await prisma.exerciseCategory.delete({ where: { id: req.params.id } })
    res.json({ message: 'Category deleted' })
  } catch (err) {
    console.error('[DELETE /workout/exercise-categories/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Body Areas ────────────────────────────────────────────────────────────────

router.get('/body-areas', async (req, res) => {
  try {
    const userId = req.user.userId
    let areas = await prisma.bodyArea.findMany({
      where: { ownerId: userId },
      orderBy: { name: 'asc' },
    })
    // Seed defaults on first use
    if (areas.length === 0) {
      await prisma.bodyArea.createMany({
        data: DEFAULT_BODY_AREAS.map(name => ({ name, ownerId: userId })),
      })
      areas = await prisma.bodyArea.findMany({
        where: { ownerId: userId },
        orderBy: { name: 'asc' },
      })
    }
    res.json(areas)
  } catch (err) {
    console.error('[GET /workout/body-areas]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/body-areas', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const area = await prisma.bodyArea.create({
      data: { name: name.trim(), ownerId: req.user.userId },
    })
    res.status(201).json(area)
  } catch (err) {
    console.error('[POST /workout/body-areas]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/body-areas/:id', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const existing = await prisma.bodyArea.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    const updated = await prisma.bodyArea.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
    })
    res.json(updated)
  } catch (err) {
    console.error('[PUT /workout/body-areas/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/body-areas/:id', async (req, res) => {
  try {
    const existing = await prisma.bodyArea.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    await prisma.bodyArea.delete({ where: { id: req.params.id } })
    res.json({ message: 'Body area deleted' })
  } catch (err) {
    console.error('[DELETE /workout/body-areas/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Exercises ─────────────────────────────────────────────────────────────────

router.get('/exercises', async (req, res) => {
  try {
    const exercises = await prisma.exercise.findMany({
      where: { ownerId: req.user.userId },
      include: exerciseInclude,
      orderBy: { name: 'asc' },
    })
    res.json(exercises.map(shapeExercise))
  } catch (err) {
    console.error('[GET /workout/exercises]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/exercises/:id', async (req, res) => {
  try {
    const exercise = await prisma.exercise.findUnique({
      where: { id: req.params.id },
      include: exerciseInclude,
    })
    if (!exercise) return res.status(404).json({ error: 'Not found' })
    if (exercise.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    res.json(shapeExercise(exercise))
  } catch (err) {
    console.error('[GET /workout/exercises/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/exercises', async (req, res) => {
  try {
    const { name, videoUrl, categoryIds = [], bodyAreaIds = [] } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const exercise = await prisma.$transaction(async (tx) => {
      const ex = await tx.exercise.create({
        data: {
          name: name.trim(),
          videoUrl: videoUrl?.trim() || null,
          ownerId: req.user.userId,
          categories: {
            create: categoryIds.map(id => ({ categoryId: id })),
          },
          bodyAreas: {
            create: bodyAreaIds.map(id => ({ bodyAreaId: id })),
          },
        },
        include: exerciseInclude,
      })
      return ex
    })
    res.status(201).json(shapeExercise(exercise))
  } catch (err) {
    console.error('[POST /workout/exercises]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/exercises/:id', async (req, res) => {
  try {
    const { name, videoUrl, categoryIds = [], bodyAreaIds = [] } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const existing = await prisma.exercise.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    const exercise = await prisma.$transaction(async (tx) => {
      await tx.exerciseCategoryLink.deleteMany({ where: { exerciseId: req.params.id } })
      await tx.exerciseBodyAreaLink.deleteMany({ where: { exerciseId: req.params.id } })
      return tx.exercise.update({
        where: { id: req.params.id },
        data: {
          name: name.trim(),
          videoUrl: videoUrl?.trim() || null,
          categories: {
            create: categoryIds.map(id => ({ categoryId: id })),
          },
          bodyAreas: {
            create: bodyAreaIds.map(id => ({ bodyAreaId: id })),
          },
        },
        include: exerciseInclude,
      })
    })
    res.json(shapeExercise(exercise))
  } catch (err) {
    console.error('[PUT /workout/exercises/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/exercises/:id', async (req, res) => {
  try {
    const existing = await prisma.exercise.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    await prisma.exercise.delete({ where: { id: req.params.id } })
    res.json({ message: 'Exercise deleted' })
  } catch (err) {
    console.error('[DELETE /workout/exercises/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Workout Plans ─────────────────────────────────────────────────────────────

router.get('/plans', async (req, res) => {
  try {
    const plans = await prisma.workoutPlan.findMany({
      where: { ownerId: req.user.userId },
      include: planListInclude,
      orderBy: { createdAt: 'desc' },
    })
    res.json(plans)
  } catch (err) {
    console.error('[GET /workout/plans]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/plans/:id', async (req, res) => {
  try {
    const plan = await prisma.workoutPlan.findUnique({
      where: { id: req.params.id },
      include: planDetailInclude,
    })
    if (!plan) return res.status(404).json({ error: 'Not found' })
    if (plan.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    res.json(shapePlanDetail(plan))
  } catch (err) {
    console.error('[GET /workout/plans/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/plans', async (req, res) => {
  try {
    const { name, daysPerWeek, days = [] } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    if (!daysPerWeek || daysPerWeek < 1 || daysPerWeek > 7) {
      return res.status(400).json({ error: 'daysPerWeek must be between 1 and 7' })
    }
    const plan = await prisma.$transaction(async (tx) => {
      const created = await tx.workoutPlan.create({
        data: {
          name: name.trim(),
          daysPerWeek,
          ownerId: req.user.userId,
          days: {
            create: days.map(day => ({
              dayNumber: day.dayNumber,
              dayType: day.dayType,
              label: day.label?.trim() || null,
              exercises: {
                create: (day.exercises || []).map((ex, idx) => ({
                  exerciseId: ex.exerciseId,
                  sortOrder: ex.sortOrder ?? idx,
                  targetSets: ex.targetSets ?? null,
                  targetReps: ex.targetReps ?? null,
                  targetWeight: ex.targetWeight ?? null,
                })),
              },
            })),
          },
        },
        include: planDetailInclude,
      })
      return created
    })
    res.status(201).json(shapePlanDetail(plan))
  } catch (err) {
    console.error('[POST /workout/plans]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.put('/plans/:id', async (req, res) => {
  try {
    const { name, daysPerWeek, days = [] } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const existing = await prisma.workoutPlan.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    const plan = await prisma.$transaction(async (tx) => {
      // Delete existing days (cascades to day exercises)
      await tx.workoutDay.deleteMany({ where: { planId: req.params.id } })
      return tx.workoutPlan.update({
        where: { id: req.params.id },
        data: {
          name: name.trim(),
          daysPerWeek,
          days: {
            create: days.map(day => ({
              dayNumber: day.dayNumber,
              dayType: day.dayType,
              label: day.label?.trim() || null,
              exercises: {
                create: (day.exercises || []).map((ex, idx) => ({
                  exerciseId: ex.exerciseId,
                  sortOrder: ex.sortOrder ?? idx,
                  targetSets: ex.targetSets ?? null,
                  targetReps: ex.targetReps ?? null,
                  targetWeight: ex.targetWeight ?? null,
                })),
              },
            })),
          },
        },
        include: planDetailInclude,
      })
    })
    res.json(shapePlanDetail(plan))
  } catch (err) {
    console.error('[PUT /workout/plans/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/plans/:id', async (req, res) => {
  try {
    const existing = await prisma.workoutPlan.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    await prisma.workoutPlan.delete({ where: { id: req.params.id } })
    res.json({ message: 'Plan deleted' })
  } catch (err) {
    console.error('[DELETE /workout/plans/:id]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/plans/:id/activate', async (req, res) => {
  try {
    const existing = await prisma.workoutPlan.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.ownerId !== req.user.userId) return res.status(403).json({ error: 'Forbidden' })
    const plan = await prisma.$transaction(async (tx) => {
      await tx.workoutPlan.updateMany({
        where: { ownerId: req.user.userId },
        data: { isActive: false },
      })
      return tx.workoutPlan.update({
        where: { id: req.params.id },
        data: { isActive: true },
        include: planListInclude,
      })
    })
    res.json(plan)
  } catch (err) {
    console.error('[PATCH /workout/plans/:id/activate]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── Active workout: complete an exercise ──────────────────────────────────────

router.patch('/day-exercises/:id/complete', async (req, res) => {
  try {
    const { sets, reps, weight } = req.body
    // Load the day exercise and verify ownership via the plan chain
    const dayExercise = await prisma.workoutDayExercise.findUnique({
      where: { id: req.params.id },
      include: { day: { include: { plan: { select: { ownerId: true } } } } },
    })
    if (!dayExercise) return res.status(404).json({ error: 'Not found' })
    if (dayExercise.day.plan.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const updated = await prisma.workoutDayExercise.update({
      where: { id: req.params.id },
      data: {
        lastSets: sets != null ? Number(sets) : undefined,
        lastReps: reps != null ? Number(reps) : undefined,
        lastWeight: weight != null ? Number(weight) : undefined,
        lastPerformedAt: new Date(),
      },
    })
    res.json(updated)
  } catch (err) {
    console.error('[PATCH /workout/day-exercises/:id/complete]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
