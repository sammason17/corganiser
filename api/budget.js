import express from 'express'
import prisma from '../lib/prisma.js'
import { requireAuth } from '../lib/auth.js'

const router = express.Router()
router.use(requireAuth)

// ── GET ALL BUDGET DATA ────────────────────────────────────────────────────────

router.get('/all', async (req, res) => {
  try {
    const userId = req.user.userId
    const [
      incomes,
      categories,
      sharedBills,
      expenses,
      amexRecurring,
      amexGrocery,
      nonAmexExpenses
    ] = await Promise.all([
      prisma.budgetIncome.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.budgetCategory.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.budgetSharedBill.findMany({ 
        where: { ownerId: userId }, 
        include: { category: true },
        orderBy: { createdAt: 'asc' } 
      }),
      prisma.budgetExpense.findMany({ 
        where: { ownerId: userId }, 
        include: { category: true },
        orderBy: { createdAt: 'asc' } 
      }),
      prisma.amexRecurring.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.amexGroceryShop.findMany({ where: { ownerId: userId }, orderBy: { date: 'desc' } }),
      prisma.nonAmexExpense.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } })
    ])

    res.json({ incomes, categories, sharedBills, expenses, amexRecurring, amexGrocery, nonAmexExpenses })
  } catch (err) {
    console.error('[GET /budget]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── INCOMES ───────────────────────────────────────────────────────────────────

router.post('/incomes', async (req, res) => {
  try {
    const { name, amount, isSalary } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const item = await prisma.budgetIncome.create({
      data: { name, amount: Number(amount) || 0, isSalary: !!isSalary, ownerId: req.user.userId }
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/incomes/:id', async (req, res) => {
  try {
    const { name, amount, isSalary } = req.body
    const item = await prisma.budgetIncome.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { name, amount: Number(amount) || 0, isSalary: !!isSalary }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/incomes/:id', async (req, res) => {
  try {
    await prisma.budgetIncome.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── CATEGORIES ────────────────────────────────────────────────────────────────

router.post('/categories', async (req, res) => {
  try {
    const { name, color } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const item = await prisma.budgetCategory.create({
      data: { name, color: color || '#3b82f6', ownerId: req.user.userId }
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/categories/:id', async (req, res) => {
  try {
    const { name, color } = req.body
    const item = await prisma.budgetCategory.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { name, color }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/categories/:id', async (req, res) => {
  try {
    await prisma.budgetCategory.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── SHARED BILLS ──────────────────────────────────────────────────────────────

router.post('/shared-bills', async (req, res) => {
  try {
    const { name, amount, myShare, categoryId } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const item = await prisma.budgetSharedBill.create({
      data: { 
        name, 
        amount: Number(amount) || 0, 
        myShare: Number(myShare) ?? 0.5, 
        categoryId: categoryId || null,
        ownerId: req.user.userId 
      },
      include: { category: true }
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/shared-bills/:id', async (req, res) => {
  try {
    const { name, amount, myShare, categoryId } = req.body
    const item = await prisma.budgetSharedBill.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { 
        name, 
        amount: Number(amount) || 0, 
        myShare: Number(myShare) ?? 0.5, 
        categoryId: categoryId || null 
      },
      include: { category: true }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/shared-bills/:id', async (req, res) => {
  try {
    await prisma.budgetSharedBill.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── EXPENSES ──────────────────────────────────────────────────────────────────

router.post('/expenses', async (req, res) => {
  try {
    const { name, amount, isAmex, categoryId } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const item = await prisma.budgetExpense.create({
      data: { 
        name, 
        amount: Number(amount) || 0, 
        isAmex: !!isAmex, 
        categoryId: categoryId || null,
        ownerId: req.user.userId 
      },
      include: { category: true }
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/expenses/:id', async (req, res) => {
  try {
    const { name, amount, isAmex, categoryId } = req.body
    const item = await prisma.budgetExpense.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { 
        name, 
        amount: Number(amount) || 0, 
        isAmex: !!isAmex, 
        categoryId: categoryId || null 
      },
      include: { category: true }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/expenses/:id', async (req, res) => {
  try {
    await prisma.budgetExpense.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── AMEX RECURRING ────────────────────────────────────────────────────────────

router.post('/amex/recurring', async (req, res) => {
  try {
    const { name, amount, myPortionAmount } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const item = await prisma.amexRecurring.create({
      data: { 
        name, 
        amount: Number(amount) || 0, 
        myPortionAmount: myPortionAmount !== undefined && myPortionAmount !== '' ? Number(myPortionAmount) : null,
        ownerId: req.user.userId 
      }
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/amex/recurring/:id', async (req, res) => {
  try {
    const { name, amount, myPortionAmount } = req.body
    const item = await prisma.amexRecurring.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { 
        ...(name !== undefined && { name }),
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(myPortionAmount !== undefined && { myPortionAmount: myPortionAmount === '' ? null : Number(myPortionAmount) })
      }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/amex/recurring/:id', async (req, res) => {
  try {
    await prisma.amexRecurring.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── AMEX GROCERY ──────────────────────────────────────────────────────────────

router.post('/amex/grocery', async (req, res) => {
  try {
    const { name, date, totalAmount, myPortionAmount } = req.body
    const item = await prisma.amexGroceryShop.create({
      data: { 
        name: name || 'Shop',
        date: date ? new Date(date) : new Date(), 
        totalAmount: Number(totalAmount) || 0, 
        myPortionAmount: Number(myPortionAmount) || 0, 
        ownerId: req.user.userId 
      }
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/amex/grocery/:id', async (req, res) => {
  try {
    const { name, date, totalAmount, myPortionAmount } = req.body
    const item = await prisma.amexGroceryShop.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { 
        ...(name !== undefined && { name }),
        ...(date && { date: new Date(date) }), 
        ...(totalAmount !== undefined && { totalAmount: Number(totalAmount) }),
        ...(myPortionAmount !== undefined && { myPortionAmount: Number(myPortionAmount) })
      }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/amex/grocery/:id', async (req, res) => {
  try {
    await prisma.amexGroceryShop.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── NON-AMEX EXPENSES ─────────────────────────────────────────────────────────

router.post('/non-amex', async (req, res) => {
  try {
    const { name, amount } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const item = await prisma.nonAmexExpense.create({
      data: { name, amount: Number(amount) || 0, ownerId: req.user.userId }
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/non-amex/:id', async (req, res) => {
  try {
    const { name, amount } = req.body
    const item = await prisma.nonAmexExpense.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { 
        ...(name !== undefined && { name }),
        ...(amount !== undefined && { amount: Number(amount) })
      }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/non-amex/:id', async (req, res) => {
  try {
    await prisma.nonAmexExpense.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
