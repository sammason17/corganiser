import prisma from './prisma.js'
import { fetchCardLiveMetrics } from './truelayer.js'
import { sendMonthlyFinancialSummaryEmail } from './resend.js'
import { calculateCurrentState } from './debtUtils.js'

/**
 * Monthly Financial Summary Runner:
 * Scheduled for the 28th of every month.
 * Provides a personal month-end financial overview ahead of payday and Direct Debits:
 * 1. Top of page cash flow summary (Income, Bills share, Expenses, Debt payments, Leftover budget)
 * 2. Closed statement period credit card totals & budget allowance adherence
 * 3. Debt overview (Total portfolio debt, monthly payment commitment, active accounts)
 */
export async function run28thMonthlyFinancialSummary({ force = false, targetUserId = null } = {}) {
  const now = new Date()
  const currentDay = now.getDate()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Only run automatically on the 28th unless forced
  if (currentDay !== 28 && !force) {
    return {
      status: 'SKIPPED',
      reason: `Today is the ${currentDay}th. The monthly financial summary runs automatically on the 28th.`,
      currentDay,
    }
  }

  // Query eligible users with their related financial data.
  // Siloed delivery: Target only users who manage the card monitor / allowance (> 0)
  // or are the primary family owner, ensuring personal finances are never sent to non-owner members.
  const users = await prisma.user.findMany({
    where: targetUserId
      ? { id: targetUserId }
      : {
          OR: [
            { primaryCardAllowance: { gt: 0 } },
            { familyMemberships: { some: { role: 'OWNER' } } },
          ],
        },
    include: {
      familyMemberships: {
        include: {
          family: {
            include: {
              automationConfig: true,
            },
          },
        },
      },
      budgetIncomes: true,
      budgetSharedBills: true,
      budgetExpenses: true,
      primaryCardRecurring: true,
      secondaryCardExpenses: true,
      debtCards: {
        include: {
          balanceTransfers: true,
        },
      },
    },
  })

  if (users.length === 0) {
    return { status: 'NO_USERS', message: 'No eligible users found' }
  }

  const results = []

  for (const user of users) {
    if (!user.email) continue

    const family = user.familyMemberships?.[0]?.family || null
    const config = family?.automationConfig || null

    // Check idempotency if not forced
    if (config?.lastFinancialSummarySentMonth === currentMonthKey && !force) {
      results.push({
        userId: user.id,
        email: user.email,
        skipped: true,
        reason: `Monthly summary already sent for ${currentMonthKey}`,
      })
      continue
    }

    // 1. Calculate Top of Page Cash Flow Summary
    const totalIncome = user.budgetIncomes.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const myShareOfBills = user.budgetSharedBills.reduce(
      (s, b) => s + (Number(b.amount) || 0) * (b.myShare ?? 0.5),
      0
    )
    const monthlyExpenses = user.budgetExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

    // Process debt cards with simulation helper
    const processedDebts = user.debtCards.map(calculateCurrentState)
    const debtMonthlyPayments = processedDebts.reduce(
      (s, d) => s + (Number(d.calculatedMonthlyPayment) || 0),
      0
    )
    const totalPortfolioDebt = processedDebts.reduce(
      (s, d) => s + (Number(d.calculatedTotalDebt) || 0),
      0
    )
    const paidOffLastMonth = debtMonthlyPayments
    const activeAccountsCount = processedDebts.filter(d => (d.calculatedTotalDebt || 0) > 0.01).length

    const leftoverBudget = totalIncome - myShareOfBills - monthlyExpenses - debtMonthlyPayments

    // 2. Calculate Credit Card Closed Statement Period & Budget Adherence
    let cardMetrics = null
    try {
      cardMetrics = await fetchCardLiveMetrics(family?.id || null)
    } catch (err) {
      console.warn(`[Monthly Summary] Failed to fetch card metrics for user ${user.id}:`, err.message)
    }

    const primaryStatementAmount =
      cardMetrics?.primaryCard?.gapDeduction || cardMetrics?.primaryCard?.lastStatementAmount || 0
    const secondaryStatementAmount =
      cardMetrics?.secondaryCard?.gapDeduction || cardMetrics?.secondaryCard?.lastStatementAmount || 0
    const totalStatementDue = primaryStatementAmount + secondaryStatementAmount

    const recurringBills = user.primaryCardRecurring.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const cardAssignedExpenses = user.budgetExpenses
      .filter(e => e.isPrimaryCard)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const fixedCardBills = recurringBills + cardAssignedExpenses
    const manualSecondarySpend = user.secondaryCardExpenses.reduce(
      (s, m) => s + (Number(m.amount) || 0),
      0
    )

    const netDiscretionarySpend = Math.max(0, totalStatementDue - fixedCardBills)
    const totalDiscretionarySpend = netDiscretionarySpend + manualSecondarySpend
    const allowance = Number(user.primaryCardAllowance) || 0
    const isOnBudget = allowance > 0 ? totalDiscretionarySpend <= allowance : true
    const varianceAmount = allowance > 0 ? Math.abs(allowance - totalDiscretionarySpend) : 0
    const hasCardData = Boolean(
      cardMetrics?.primaryCard?.isConnected ||
        cardMetrics?.secondaryCard?.isConnected ||
        totalStatementDue > 0
    )

    const primaryCardName = cardMetrics?.primaryCard?.cardDisplayName || 'Primary Card'
    const secondaryCardName = cardMetrics?.secondaryCard?.cardDisplayName || 'Secondary Card'
    const primaryClosingDate = cardMetrics?.primaryCard?.closingDateFormatted || null
    const secondaryClosingDate = cardMetrics?.secondaryCard?.closingDateFormatted || null
    const paymentDueDate =
      cardMetrics?.primaryCard?.paymentDateFormatted ||
      cardMetrics?.secondaryCard?.paymentDateFormatted ||
      '1st of next month'

    // 3. Dispatch the financial summary email
    const emailResult = await sendMonthlyFinancialSummaryEmail({
      recipientEmail: user.email,
      recipientName: user.name || 'there',
      monthName,
      creditCardSummary: {
        hasCardData,
        primaryCardName,
        primaryStatementAmount,
        primaryClosingDate,
        secondaryCardName,
        secondaryStatementAmount,
        secondaryClosingDate,
        totalStatementDue,
        fixedCardBills,
        netDiscretionarySpend,
        manualSecondarySpend,
        totalDiscretionarySpend,
        allowance,
        isOnBudget,
        varianceAmount,
        paymentDueDate,
      },
      cashFlowSummary: {
        totalIncome,
        myShareOfBills,
        monthlyExpenses,
        debtMonthlyPayments,
        leftoverBudget,
      },
      debtSummary: {
        hasDebts: user.debtCards.length > 0,
        totalPortfolioDebt,
        monthlyDebtPayment: debtMonthlyPayments,
        paidOffLastMonth,
        activeAccountsCount,
      },
    })

    // Update config to mark as sent for this month
    if (config?.id) {
      await prisma.cardAutomationConfig
        .update({
          where: { id: config.id },
          data: { lastFinancialSummarySentMonth: currentMonthKey },
        })
        .catch(err => console.warn('[Monthly Summary Config Update Warning]', err.message))
    }

    results.push({
      userId: user.id,
      email: user.email,
      success: emailResult?.success ?? false,
      monthName,
      leftoverBudget,
      totalStatementDue,
      allowance,
      isOnBudget,
      emailResult,
    })
  }

  return {
    status: 'COMPLETED',
    monthName,
    currentMonthKey,
    processedCount: results.length,
    results,
  }
}
