import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'
import { getUniqueExportName, executeSettlementExportAndClear, executeExportManualOverride, resolveFamilyNames } from '../../lib/settlementAutomation.js'

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
      primaryCardRecurring,
      primaryCardGrocery,
      secondaryCardExpenses,
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
      prisma.primaryCardRecurring.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.primaryCardGroceryShop.findMany({ where: { ownerId: userId }, orderBy: { date: 'desc' } }),
      prisma.secondaryCardExpense.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.user.findUnique({ where: { id: userId }, select: { primaryCardAllowance: true } })
    ])

    const formattedExpenses = expenses.map(e => ({
      ...e,
      isPrimaryCard: !!e.isPrimaryCard,
      isCreditCard: !!e.isPrimaryCard
    }))

    res.json({ 
      incomes, 
      categories, 
      sharedBills, 
      expenses: formattedExpenses, 
      primaryCardRecurring,
      primaryCardGrocery,
      secondaryCardExpenses,
      secondaryCards: secondaryCardExpenses,
      primaryCardAllowance: user?.primaryCardAllowance || 0,
      // Compatibility aliases
      cardRecurring: primaryCardRecurring,
      cardGrocery: primaryCardGrocery,
      nonCardExpenses: secondaryCardExpenses,
      cardAllowance: user?.primaryCardAllowance || 0
    })
  } catch (err) {
    console.error('[GET /budget]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ── ALLOWANCE ─────────────────────────────────────────────────────────────────

const handleAllowanceUpdate = async (req, res) => {
  try {
    const { amount } = req.body
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { primaryCardAllowance: Number(amount) || 0 },
      select: { primaryCardAllowance: true }
    })
    res.json({
      ...user,
      primaryCardAllowance: user.primaryCardAllowance,
      cardAllowance: user.primaryCardAllowance
    })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
}
router.put('/allowance', handleAllowanceUpdate)
router.put('/primary-card/allowance', handleAllowanceUpdate)

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
      data: { 
        ...(name !== undefined && { name }), 
        ...(amount !== undefined && { amount: Number(amount) }), 
        ...(isSalary !== undefined && { isSalary: !!isSalary }) 
      }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/incomes/:id', async (req, res) => {
  try {
    await prisma.budgetIncome.delete({
      where: { id: req.params.id, ownerId: req.user.userId }
    })
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
      data: { name, color: color || '#6366f1', ownerId: req.user.userId }
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
      data: { 
        ...(name !== undefined && { name }), 
        ...(color !== undefined && { color }) 
      }
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/categories/:id', async (req, res) => {
  try {
    await prisma.budgetCategory.delete({
      where: { id: req.params.id, ownerId: req.user.userId }
    })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── SHARED BILLS ──────────────────────────────────────────────────────────────

router.post('/shared-bills', async (req, res) => {
  try {
    const { name, amount, myPortion, paidBy, categoryId } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    
    // Find highest sort order
    const last = await prisma.budgetSharedBill.findFirst({
      where: { ownerId: req.user.userId },
      orderBy: { sortOrder: 'desc' }
    })
    const sortOrder = (last?.sortOrder ?? -1) + 1

    const item = await prisma.budgetSharedBill.create({
      data: { 
        name, 
        amount: Number(amount) || 0, 
        myPortion: Number(myPortion) || 0, 
        paidBy: paidBy || 'Me', 
        categoryId: categoryId || null,
        sortOrder,
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
    const { name, amount, myPortion, paidBy, categoryId, sortOrder } = req.body
    const item = await prisma.budgetSharedBill.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { 
        ...(name !== undefined && { name }), 
        ...(amount !== undefined && { amount: Number(amount) }), 
        ...(myPortion !== undefined && { myPortion: Number(myPortion) }), 
        ...(paidBy !== undefined && { paidBy }), 
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) })
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
    await prisma.budgetSharedBill.delete({
      where: { id: req.params.id, ownerId: req.user.userId }
    })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/shared-bills/reorder/batch', async (req, res) => {
  try {
    const { items } = req.body // [{ id, sortOrder }]
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Invalid items array' })
    await Promise.all(
      items.map(item =>
        prisma.budgetSharedBill.update({
          where: { id: item.id, ownerId: req.user.userId },
          data: { sortOrder: item.sortOrder }
        })
      )
    )
    res.json({ message: 'Reordered' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── EXPENSES ──────────────────────────────────────────────────────────────────

router.post('/expenses', async (req, res) => {
  try {
    const { name, amount, isPrimaryCard, isCreditCard, categoryId } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const primaryCardFlag = isPrimaryCard !== undefined ? !!isPrimaryCard : !!isCreditCard
    const item = await prisma.budgetExpense.create({
      data: { 
        name, 
        amount: Number(amount) || 0, 
        isPrimaryCard: primaryCardFlag, 
        categoryId: categoryId || null,
        ownerId: req.user.userId 
      },
      include: { category: true }
    })
    res.status(201).json({
      ...item,
      isPrimaryCard: item.isPrimaryCard,
      isCreditCard: item.isPrimaryCard
    })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/expenses/:id', async (req, res) => {
  try {
    const { name, amount, isPrimaryCard, isCreditCard, categoryId } = req.body
    const primaryCardFlag = isPrimaryCard !== undefined ? !!isPrimaryCard : (isCreditCard !== undefined ? !!isCreditCard : undefined)
    const item = await prisma.budgetExpense.update({
      where: { id: req.params.id, ownerId: req.user.userId },
      data: { 
        name, 
        amount: Number(amount) || 0, 
        ...(primaryCardFlag !== undefined && { isPrimaryCard: primaryCardFlag }), 
        categoryId: categoryId || null 
      },
      include: { category: true }
    })
    res.json({
      ...item,
      isPrimaryCard: item.isPrimaryCard,
      isCreditCard: item.isPrimaryCard
    })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/expenses/:id', async (req, res) => {
  try {
    await prisma.budgetExpense.delete({
      where: { id: req.params.id, ownerId: req.user.userId }
    })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/expenses/reorder/batch', async (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Invalid items array' })
    await Promise.all(
      items.map(item =>
        prisma.budgetExpense.update({
          where: { id: item.id, ownerId: req.user.userId },
          data: { sortOrder: item.sortOrder }
        })
      )
    )
    res.json({ message: 'Reordered' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PRIMARY CARD RECURRING ────────────────────────────────────────────────────

const createPrimaryRecurringHandler = async (req, res) => {
  try {
    const { name, amount, myPortionAmount } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const item = await prisma.primaryCardRecurring.create({
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
}
router.post('/primary-card/recurring', createPrimaryRecurringHandler)
router.post('/card/recurring', createPrimaryRecurringHandler)

const updatePrimaryRecurringHandler = async (req, res) => {
  try {
    const { name, amount, myPortionAmount } = req.body
    const item = await prisma.primaryCardRecurring.update({
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
}
router.put('/primary-card/recurring/:id', updatePrimaryRecurringHandler)
router.put('/card/recurring/:id', updatePrimaryRecurringHandler)

const deletePrimaryRecurringHandler = async (req, res) => {
  try {
    await prisma.primaryCardRecurring.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
}
router.delete('/primary-card/recurring/:id', deletePrimaryRecurringHandler)
router.delete('/card/recurring/:id', deletePrimaryRecurringHandler)

// ── PRIMARY CARD GROCERY ──────────────────────────────────────────────────────

const createPrimaryGroceryHandler = async (req, res) => {
  try {
    const { name, date, totalAmount, myPortionAmount } = req.body
    const item = await prisma.primaryCardGroceryShop.create({
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
}
router.post('/primary-card/grocery', createPrimaryGroceryHandler)
router.post('/card/grocery', createPrimaryGroceryHandler)

const updatePrimaryGroceryHandler = async (req, res) => {
  try {
    const { name, date, totalAmount, myPortionAmount } = req.body
    const item = await prisma.primaryCardGroceryShop.update({
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
}
router.put('/primary-card/grocery/:id', updatePrimaryGroceryHandler)
router.put('/card/grocery/:id', updatePrimaryGroceryHandler)

const clearPrimaryGroceryHandler = async (req, res) => {
  try {
    await prisma.primaryCardGroceryShop.deleteMany({ where: { ownerId: req.user.userId } })
    res.json({ message: 'All deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
}
router.delete('/primary-card/grocery', clearPrimaryGroceryHandler)
router.delete('/card/grocery', clearPrimaryGroceryHandler)

const deleteOnePrimaryGroceryHandler = async (req, res) => {
  try {
    await prisma.primaryCardGroceryShop.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
}
router.delete('/primary-card/grocery/:id', deleteOnePrimaryGroceryHandler)
router.delete('/card/grocery/:id', deleteOnePrimaryGroceryHandler)

// ── SECONDARY CARDS EXPENSES ──────────────────────────────────────────────────

const createSecondaryCardHandler = async (req, res) => {
  try {
    const { name, amount } = req.body
    if (!name) return res.status(400).json({ error: 'Name is required' })
    const item = await prisma.secondaryCardExpense.create({
      data: { name, amount: Number(amount) || 0, ownerId: req.user.userId }
    })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
}
router.post('/secondary-cards', createSecondaryCardHandler)
router.post('/non-card', createSecondaryCardHandler)

const updateSecondaryCardHandler = async (req, res) => {
  try {
    const { name, amount } = req.body
    const item = await prisma.secondaryCardExpense.update({
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
}
router.put('/secondary-cards/:id', updateSecondaryCardHandler)
router.put('/non-card/:id', updateSecondaryCardHandler)

const clearSecondaryCardsHandler = async (req, res) => {
  try {
    await prisma.secondaryCardExpense.deleteMany({ where: { ownerId: req.user.userId } })
    res.json({ message: 'All deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
}
router.delete('/secondary-cards', clearSecondaryCardsHandler)
router.delete('/non-card', clearSecondaryCardsHandler)

const deleteOneSecondaryCardHandler = async (req, res) => {
  try {
    await prisma.secondaryCardExpense.delete({ where: { id: req.params.id, ownerId: req.user.userId } })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
}
router.delete('/secondary-cards/:id', deleteOneSecondaryCardHandler)
router.delete('/non-card/:id', deleteOneSecondaryCardHandler)

// ── SHARED STATEMENT CALCULATOR ───────────────────────────────────────────────

router.get('/calculator/state', async (req, res) => {
  try {
    const familyId = req.user.familyId
    const shops = await prisma.sharedFoodShop.findMany({
      where: familyId ? { familyId } : {},
      orderBy: { date: 'asc' }
    })
    let state = familyId ? await prisma.sharedStatementState.findUnique({ where: { familyId } }) : null
    if (!state && familyId) {
      state = await prisma.sharedStatementState.create({
        data: { familyId, partnerStatementAmount: 0 }
      })
    } else if (!state) {
      state = await prisma.sharedStatementState.findFirst()
    }

    // Resolve family members
    let familyMembers = []
    if (familyId) {
      const members = await prisma.familyMember.findMany({
        where: { familyId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' }
      })
      familyMembers = members.map(m => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role
      }))
    } else {
      const currentUser = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, name: true, email: true }
      })
      if (currentUser) {
        familyMembers = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, role: 'OWNER' }]
      }
    }

    // Resolve dynamic primary and partner names
    const { primaryName, partnerName } = await resolveFamilyNames(familyId)

    // Retrieve card configuration metadata if connected
    const config = familyId
      ? await prisma.cardAutomationConfig.findUnique({ where: { familyId } })
      : await prisma.cardAutomationConfig.findFirst()

    res.json({
      shops,
      partnerStatementAmount: state?.partnerStatementAmount || 0,
      familyMembers,
      primaryName,
      partnerName,
      cardholderName: config?.cardholderName || null,
      cardDisplayName: config?.cardDisplayName || null,
    })
  } catch (err) {
    console.error('[Calculator State Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/calculator/shops', async (req, res) => {
  try {
    const { vendorName, date, totalAmount, payerName, payerCoveredAmount } = req.body
    if (!vendorName) return res.status(400).json({ error: 'Vendor name is required' })
    const item = await prisma.sharedFoodShop.create({
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
    await prisma.sharedFoodShop.delete({ where })
    res.json({ message: 'Deleted' })
  } catch (err) {
    console.error('[Delete Shop Error]', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/calculator/shops', async (req, res) => {
  try {
    const familyId = req.user.familyId
    await prisma.sharedFoodShop.deleteMany({
      where: familyId ? { familyId } : {}
    })
    if (familyId) {
      await prisma.sharedStatementState.upsert({
        where: { familyId },
        update: { partnerStatementAmount: 0 },
        create: { familyId, partnerStatementAmount: 0 }
      })
    } else {
      await prisma.sharedStatementState.upsert({
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
      state = await prisma.sharedStatementState.upsert({
        where: { familyId },
        update: { partnerStatementAmount: Number(amount) || 0 },
        create: { familyId, partnerStatementAmount: Number(amount) || 0 }
      })
    } else {
      state = await prisma.sharedStatementState.upsert({
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
    const exports = await prisma.sharedStatementExport.findMany({
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
      const existing = await prisma.sharedStatementExport.findFirst({
        where: {
          name,
          ...(familyId ? { familyId } : {})
        }
      })
      if (existing) {
        name = await getUniqueExportName(new Date(), familyId)
      }
    }

    const shops = await prisma.sharedFoodShop.findMany({
      where: familyId ? { familyId } : {},
      orderBy: { date: 'asc' }
    })
    const state = familyId
      ? await prisma.sharedStatementState.findUnique({ where: { familyId } })
      : await prisma.sharedStatementState.findUnique({ where: { id: 'singleton' } })
    const partnerStatementAmount = state?.partnerStatementAmount || 0

    const { primaryName, partnerName } = await resolveFamilyNames(familyId)

    const newExport = await prisma.sharedStatementExport.create({
      data: {
        name,
        partnerStatementAmount,
        shopsData: shops,
        primaryName,
        partnerName,
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
      ? await prisma.sharedStatementState.findUnique({ where: { familyId } })
      : await prisma.sharedStatementState.findUnique({ where: { id: 'singleton' } })
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
