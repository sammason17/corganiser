import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'
import { getUniqueExportName, executeSettlementExportAndClear, executeExportManualOverride } from '../../lib/settlementAutomation.js'

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
      nonAmexExpenses,
      user
    ] = await Promise.all([
      prisma.budgetIncome.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.budgetCategory.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.budgetSharedBill.findMany({ 
        where: { ownerId: userId }, 
        include: { category: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
      }),
      prisma.budgetExpense.findMany({ 
        where: { ownerId: userId }, 
        include: { category: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
      }),
      prisma.amexRecurring.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.amexGroceryShop.findMany({ where: { ownerId: userId }, orderBy: { date: 'desc' } }),
      prisma.nonAmexExpense.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.user.findUnique({ where: { id: userId }, select: { amexAllowance: true } })
    ])

    res.json({ incomes, categories, sharedBills, expenses, amexRecurring, amexGrocery, nonAmexExpenses, amexAllowance: user?.amexAllowance || 0 })
  } catch (err) {
    console.error('[GET /budget]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── ALLOWANCE ─────────────────────────────────────────────────────────────────

router.put('/allowance', async (req, res) => {
  try {
    const { amount } = req.body
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { amexAllowance: Number(amount) || 0 },
      select: { amexAllowance: true }
    })
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
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

router.put('/shared-bills/reorder/batch', async (req, res) => {
  try {
    const { items } = req.body // array of { id, sortOrder }
    const updates = items.map(item => 
      prisma.budgetSharedBill.update({
        where: { id: item.id, ownerId: req.user.userId },
        data: { sortOrder: item.sortOrder }
      })
    )
    await prisma.$transaction(updates)
    res.json({ message: 'Reordered' })
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

router.put('/expenses/reorder/batch', async (req, res) => {
  try {
    const { items } = req.body // array of { id, sortOrder }
    const updates = items.map(item => 
      prisma.budgetExpense.update({
        where: { id: item.id, ownerId: req.user.userId },
        data: { sortOrder: item.sortOrder }
      })
    )
    await prisma.$transaction(updates)
    res.json({ message: 'Reordered' })
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

router.delete('/amex/grocery', async (req, res) => {
  try {
    await prisma.amexGroceryShop.deleteMany({ where: { ownerId: req.user.userId } })
    res.json({ message: 'All deleted' })
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

router.delete('/non-amex', async (req, res) => {
  try {
    await prisma.nonAmexExpense.deleteMany({ where: { ownerId: req.user.userId } })
    res.json({ message: 'All deleted' })
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

// ── SHARED CREDIT CARD CALCULATOR ──────────────────────────────────────────────

router.get('/calculator/state', async (req, res) => {
  try {
    const familyId = req.user.familyId
    const shops = await prisma.sharedAmexFoodShop.findMany({
      where: familyId ? { familyId } : {},
      orderBy: { date: 'asc' }
    })
    let state = familyId ? await prisma.sharedAmexState.findUnique({ where: { familyId } }) : null
    if (!state && familyId) {
      state = await prisma.sharedAmexState.create({
        data: { familyId, partnerStatementAmount: 0 }
      })
    } else if (!state) {
      state = await prisma.sharedAmexState.findFirst()
    }
    res.json({ shops, partnerStatementAmount: state?.partnerStatementAmount || 0 })
  } catch (err) {
    console.error('[Calculator State Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/calculator/shops', async (req, res) => {
  try {
    const { vendorName, date, totalAmount, payerName, payerCoveredAmount } = req.body
    if (!vendorName) return res.status(400).json({ error: 'Vendor name is required' })
    const item = await prisma.sharedAmexFoodShop.create({
      data: {
        vendorName,
        date: date ? new Date(date) : new Date(),
        totalAmount: Number(totalAmount) || 0,
        payerName: payerName || 'Me',
        payerCoveredAmount: Number(payerCoveredAmount) || 0,
        familyId: req.user.familyId || null
      }
    })
    res.status(201).json(item)
  } catch (err) {
    console.error('[Create Shop Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/calculator/shops/:id', async (req, res) => {
  try {
    const where = { id: req.params.id }
    if (req.user.familyId) {
      where.familyId = req.user.familyId
    }
    await prisma.sharedAmexFoodShop.delete({ where })
    res.json({ message: 'Deleted' })
  } catch (err) {
    console.error('[Delete Shop Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/calculator/shops', async (req, res) => {
  try {
    const familyId = req.user.familyId
    await prisma.sharedAmexFoodShop.deleteMany({
      where: familyId ? { familyId } : {}
    })
    if (familyId) {
      await prisma.sharedAmexState.upsert({
        where: { familyId },
        update: { partnerStatementAmount: 0 },
        create: { familyId, partnerStatementAmount: 0 }
      })
    } else {
      await prisma.sharedAmexState.upsert({
        where: { id: 'singleton' },
        update: { partnerStatementAmount: 0 },
        create: { id: 'singleton', partnerStatementAmount: 0 }
      })
    }
    res.json({ message: 'Cleared' })
  } catch (err) {
    console.error('[Clear Shops Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/calculator/statement', async (req, res) => {
  try {
    const { amount } = req.body
    const familyId = req.user.familyId
    let state
    if (familyId) {
      state = await prisma.sharedAmexState.upsert({
        where: { familyId },
        update: { partnerStatementAmount: Number(amount) || 0 },
        create: { familyId, partnerStatementAmount: Number(amount) || 0 }
      })
    } else {
      state = await prisma.sharedAmexState.upsert({
        where: { id: 'singleton' },
        update: { partnerStatementAmount: Number(amount) || 0 },
        create: { id: 'singleton', partnerStatementAmount: Number(amount) || 0 }
      })
    }
    res.json(state)
  } catch (err) {
    console.error('[Update Statement Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/calculator/next-export-name', async (req, res) => {
  try {
    const nextName = await getUniqueExportName(new Date(), req.user.familyId)
    res.json({ nextName })
  } catch (err) {
    console.error('[Next Export Name Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/calculator/exports', async (req, res) => {
  try {
    const familyId = req.user.familyId
    const exports = await prisma.sharedAmexExport.findMany({
      where: familyId ? { familyId } : {},
      orderBy: { createdAt: 'desc' }
    })
    res.json(exports)
  } catch (err) {
    console.error('[Get Exports Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/calculator/exports', async (req, res) => {
  try {
    const familyId = req.user.familyId
    let { name } = req.body
    if (!name) {
      name = await getUniqueExportName(new Date(), familyId)
    } else {
      const existing = await prisma.sharedAmexExport.findFirst({
        where: {
          name,
          ...(familyId ? { familyId } : {})
        }
      })
      if (existing) {
        name = await getUniqueExportName(new Date(), familyId)
      }
    }

    const shops = await prisma.sharedAmexFoodShop.findMany({
      where: familyId ? { familyId } : {},
      orderBy: { date: 'asc' }
    })
    const state = familyId
      ? await prisma.sharedAmexState.findUnique({ where: { familyId } })
      : await prisma.sharedAmexState.findUnique({ where: { id: 'singleton' } })
    const partnerStatementAmount = state?.partnerStatementAmount || 0

    const newExport = await prisma.sharedAmexExport.create({
      data: {
        name,
        partnerStatementAmount,
        shopsData: shops,
        familyId: familyId || null
      }
    })
    res.status(201).json(newExport)
  } catch (err) {
    console.error('[Create Export Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/calculator/settle', async (req, res) => {
  try {
    const familyId = req.user.familyId
    const { partnerStatementAmount, name } = req.body
    const state = familyId
      ? await prisma.sharedAmexState.findUnique({ where: { familyId } })
      : await prisma.sharedAmexState.findUnique({ where: { id: 'singleton' } })
    const finalPartnerStatement = partnerStatementAmount !== undefined 
      ? Number(partnerStatementAmount) 
      : (state?.partnerStatementAmount || 0)

    const result = await executeSettlementExportAndClear({
      familyId,
      partnerStatementAmount: finalPartnerStatement,
      autoExported: false,
      customName: name || null,
    })

    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[Manual Settle Error]', err)
    res.status(500).json({ error: err.message || 'Settlement failed' })
  }
})

router.post('/calculator/exports/:id/override', async (req, res) => {
  try {
    const { partnerStatementAmount, reason } = req.body
    if (partnerStatementAmount === undefined || isNaN(Number(partnerStatementAmount))) {
      return res.status(400).json({ error: 'Valid partnerStatementAmount is required' })
    }

    const result = await executeExportManualOverride({
      exportId: req.params.id,
      partnerStatementAmount: Number(partnerStatementAmount),
      reason: reason || 'Manual override due to incorrect statement amount',
    })

    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[Export Override Error]', err)
    res.status(500).json({ error: err.message || 'Failed to apply manual override' })
  }
})

export default router
