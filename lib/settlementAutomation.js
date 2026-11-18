import prisma from './prisma.js'
import { getValidAccessToken, getCardBalance, getCardTransactions } from './truelayer.js'
import { sendPrecheckReminderEmail, sendMonthlySettlementEmail } from './resend.js'

/**
 * Generates an export name adhering to default "[Month]-[Year]"
 * and automatically appends iterating numbers if duplicates exist (e.g. "November-2026-1")
 */
export async function getUniqueExportName(date = new Date(), familyId = null) {
  const baseName = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(' ', '-')
  
  const existing = await prisma.sharedAmexExport.findMany({
    where: {
      name: {
        startsWith: baseName
      },
      ...(familyId ? { familyId } : {})
    },
    select: { name: true }
  })

  if (existing.length === 0) {
    return baseName
  }

  const existingNames = new Set(existing.map(e => e.name))
  if (!existingNames.has(baseName)) {
    return baseName
  }

  // Iterate to find the next available number: baseName-1, baseName-2, etc.
  let counter = 1
  while (existingNames.has(`${baseName}-${counter}`)) {
    counter++
  }
  return `${baseName}-${counter}`
}

/**
 * Calculates settlement amounts from a list of shops and partner statement amount
 */
export function calculateSettlement({ shops = [], partnerStatementAmount = 0 }) {
  let partnerOwesForMyShops = 0
  let iOweForPartnerShops = 0

  shops.forEach(shop => {
    const remainder = Number(shop.totalAmount || 0) - Number(shop.payerCoveredAmount || 0)
    if (shop.payerName === 'Sam') {
      partnerOwesForMyShops += remainder
    } else {
      iOweForPartnerShops += remainder
    }
  })

  const finalAmountPartnerOwes = Number(partnerStatementAmount || 0) + partnerOwesForMyShops - iOweForPartnerShops

  return {
    partnerOwesForMyShops,
    iOweForPartnerShops,
    finalAmountPartnerOwes,
  }
}

/**
 * Executes the complete export, clearing, and email dispatch sequence
 */
export async function executeSettlementExportAndClear({
  familyId = null,
  partnerStatementAmount,
  autoExported = true,
  customName = null,
}) {
  // 1. Fetch current live shops for this family
  const shops = await prisma.sharedAmexFoodShop.findMany({
    where: familyId ? { familyId } : {},
    orderBy: { date: 'asc' }
  })
  
  // 2. Compute settlement figures
  const { partnerOwesForMyShops, iOweForPartnerShops, finalAmountPartnerOwes } = calculateSettlement({
    shops,
    partnerStatementAmount: Number(partnerStatementAmount) || 0
  })

  // 3. Generate unique export name
  const name = customName || await getUniqueExportName(new Date(), familyId)

  // 4. Create the export record
  const newExport = await prisma.sharedAmexExport.create({
    data: {
      name,
      partnerStatementAmount: Number(partnerStatementAmount) || 0,
      shopsData: shops,
      partnerOwesForMyShops,
      iOweForPartnerShops,
      finalAmountPartnerOwes,
      autoExported,
      ...(familyId ? { familyId } : {})
    }
  })

  // 5. Clear current shops and reset live calculator statement amount for this family
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
    const defaultState = await prisma.sharedAmexState.findFirst()
    if (defaultState) {
      await prisma.sharedAmexState.update({
        where: { id: defaultState.id },
        data: { partnerStatementAmount: 0 }
      })
    }
  }

  // 6. Fetch recipients strictly from this family!
  let recipients = []
  if (familyId) {
    const members = await prisma.familyMember.findMany({
      where: { familyId },
      include: { user: { select: { email: true, name: true } } }
    })
    recipients = members.map(m => m.user.email).filter(Boolean)
  }
  if (recipients.length === 0) {
    const users = await prisma.user.findMany({ select: { email: true, name: true } })
    recipients = users.map(u => u.email).filter(Boolean)
  }

  // 7. Dispatch the monthly settlement summary email to the family members
  let emailResult = null
  if (recipients.length > 0) {
    emailResult = await sendMonthlySettlementEmail({
      recipients,
      exportName: name,
      partnerStatementAmount: Number(partnerStatementAmount) || 0,
      shops,
      partnerOwesForMyShops,
      iOweForPartnerShops,
      finalAmountPartnerOwes,
    })
  }

  return {
    export: newExport,
    settlement: {
      exportName: name,
      partnerStatementAmount,
      partnerOwesForMyShops,
      iOweForPartnerShops,
      finalAmountPartnerOwes,
    },
    recipients,
    emailResult,
  }
}

/**
 * Executes a manual override for an already exported month:
 * updates statement amount, recalculates settlement, updates DB, and sends amended email.
 */
export async function executeExportManualOverride({
  exportId,
  partnerStatementAmount,
  reason = 'Manual override due to incorrect statement amount',
}) {
  const existingExport = await prisma.sharedAmexExport.findUnique({
    where: { id: exportId }
  })
  if (!existingExport) {
    throw new Error('Export not found')
  }

  const shops = Array.isArray(existingExport.shopsData) ? existingExport.shopsData : []
  const newAmount = Math.max(0, Number(partnerStatementAmount) || 0)

  // Recalculate settlement amounts
  const { partnerOwesForMyShops, iOweForPartnerShops, finalAmountPartnerOwes } = calculateSettlement({
    shops,
    partnerStatementAmount: newAmount,
  })

  // Update the exported record in the database
  const updatedExport = await prisma.sharedAmexExport.update({
    where: { id: exportId },
    data: {
      partnerStatementAmount: newAmount,
      partnerOwesForMyShops,
      iOweForPartnerShops,
      finalAmountPartnerOwes,
      isOverridden: true,
      overrideReason: reason || null,
    }
  })

  // Fetch recipients strictly from this export's family
  let recipients = []
  if (existingExport.familyId) {
    const members = await prisma.familyMember.findMany({
      where: { familyId: existingExport.familyId },
      include: { user: { select: { email: true, name: true } } }
    })
    recipients = members.map(m => m.user.email).filter(Boolean)
  }
  if (recipients.length === 0) {
    const users = await prisma.user.findMany({ select: { email: true, name: true } })
    recipients = users.map(u => u.email).filter(Boolean)
  }

  // Dispatch amended statement email
  let emailResult = null
  if (recipients.length > 0) {
    emailResult = await sendMonthlySettlementEmail({
      recipients,
      exportName: existingExport.name,
      partnerStatementAmount: newAmount,
      shops,
      partnerOwesForMyShops,
      iOweForPartnerShops,
      finalAmountPartnerOwes,
      isOverride: true,
      overrideReason: reason,
    })
  }

  return {
    export: updatedExport,
    settlement: {
      exportName: existingExport.name,
      partnerStatementAmount: newAmount,
      partnerOwesForMyShops,
      iOweForPartnerShops,
      finalAmountPartnerOwes,
    },
    recipients,
    emailResult,
  }
}

/**
 * Pre-check runner: Sends reminder to family owners on the 18th
 */
export async function run18thPrecheckReminder() {
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Find all active automation configs
  let configs = await prisma.amexAutomationConfig.findMany({
    where: { isActive: true },
    include: {
      family: {
        include: {
          members: {
            where: { role: 'OWNER' },
            include: { user: true }
          }
        }
      }
    }
  })

  // Fallback to legacy config if none explicitly marked
  if (configs.length === 0) {
    const fallback = await prisma.amexAutomationConfig.findFirst({
      include: {
        family: {
          include: {
            members: {
              where: { role: 'OWNER' },
              include: { user: true }
            }
          }
        }
      }
    })
    if (fallback) configs = [fallback]
  }

  const results = []

  for (const config of configs) {
    if (config.lastPrecheckSentMonth === currentMonthKey) {
      results.push({ skipped: true, reason: 'Already sent for this month', configId: config.id })
      continue
    }

    // Find recipient for this config: family owner or first user
    const owner = config.family?.members?.[0]?.user || await prisma.user.findFirst()
    if (!owner?.email) continue

    const result = await sendPrecheckReminderEmail({
      recipientEmail: owner.email,
      recipientName: owner.name || 'there',
      monthName,
    })

    await prisma.amexAutomationConfig.update({
      where: { id: config.id },
      data: { lastPrecheckSentMonth: currentMonthKey }
    })

    results.push({ success: true, email: owner.email, monthName, configId: config.id, result })
  }

  return results
}

/**
 * Statement settlement runner:
 * Runs on the 24th of each month (5 days after the 19th statement closing).
 * Can be called for a specific familyId or across all active families.
 */
export async function checkAndRunStatementSettlement({ force = false, familyId = null } = {}) {
  // Find target configs
  let configs = []
  if (familyId) {
    const conf = await prisma.amexAutomationConfig.findUnique({ where: { familyId } })
    if (conf) configs = [conf]
  } else {
    configs = await prisma.amexAutomationConfig.findMany({ where: { isActive: true } })
  }

  if (configs.length === 0) {
    const fallback = await prisma.amexAutomationConfig.findFirst()
    if (fallback) configs = [fallback]
  }

  if (configs.length === 0) {
    return { status: 'DISCONNECTED', message: 'No active card automation configuration found' }
  }

  const now = new Date()
  const currentDay = now.getDate()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const monthStr = String(currentMonth + 1).padStart(2, '0')
  const statementClosingDate = `${currentYear}-${monthStr}-19`

  const settlementResults = []

  for (const config of configs) {
    const tokenData = await getValidAccessToken(config.familyId)
    if (!tokenData || !tokenData.accessToken) {
      settlementResults.push({ configId: config.id, status: 'AUTH_ERROR', message: 'Invalid or missing TrueLayer tokens' })
      continue
    }

    if (!config.cardAccountId) {
      settlementResults.push({ configId: config.id, status: 'NO_CARD_ACCOUNT', message: 'No card account ID selected' })
      continue
    }

    // 1. Wait for settlement day (24th) unless forced
    if (currentDay < 24 && !force) {
      settlementResults.push({
        configId: config.id,
        status: 'AWAITING_SETTLEMENT_DATE',
        message: `Statement cycle closes on the 19th (${statementClosingDate}). Automated settlement runs on the 24th once all transactions have settled.`,
        lastStatementDate: config.lastProcessedStatementDate || 'None',
        nextStatementDate: statementClosingDate,
        settlementDate: `${currentYear}-${monthStr}-24`,
      })
      continue
    }

    // 2. Check if already processed
    if (config.lastProcessedStatementDate === statementClosingDate && !force) {
      settlementResults.push({
        configId: config.id,
        status: 'ALREADY_PROCESSED',
        message: `Statement for ${statementClosingDate} has already been settled and exported.`,
        lastStatementDate: statementClosingDate,
      })
      continue
    }

    // 3. Determine transaction period (20th prev month - 19th current month)
    const prevDate = new Date(currentYear, currentMonth - 1, 20)
    const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, '0')
    const fromDate = `${prevDate.getFullYear()}-${prevMonthStr}-20T00:00:00.000Z`
    let toDate = `${statementClosingDate}T23:59:59.999Z`
    if (new Date(toDate) > now) {
      toDate = now.toISOString()
    }

    // 4. Fetch transactions within statement window
    const transactions = await getCardTransactions(tokenData.accessToken, config.cardAccountId, fromDate, toDate)

    // 5. Calculate partner's statement spend from connected card transactions
    let partnerTotal = 0
    for (const txn of transactions) {
      const isCredit = txn.meta?.transaction_type?.toLowerCase() === 'credit' || (txn.amount < 0 && txn.meta?.transaction_type?.toLowerCase() !== 'debit')
      const amt = Math.abs(Number(txn.amount) || 0)
      if (isCredit) {
        partnerTotal -= amt
      } else {
        partnerTotal += amt
      }
    }

    const partnerStatementAmount = Math.max(0, Math.round(partnerTotal * 100) / 100)

    // 6. Execute export, clear, and email dispatch for this family
    const exportResult = await executeSettlementExportAndClear({
      familyId: config.familyId,
      partnerStatementAmount,
      autoExported: true,
    })

    // 7. Update configuration record
    await prisma.amexAutomationConfig.update({
      where: { id: config.id },
      data: {
        lastKnownStatementDate: statementClosingDate,
        lastProcessedStatementDate: statementClosingDate,
        lastSyncAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        lastSyncMessage: `Automated settlement completed for ${statementClosingDate}. Exported as "${exportResult.export.name}".`,
      }
    })

    settlementResults.push({
      configId: config.id,
      familyId: config.familyId,
      status: 'COMPLETED',
      lastStatementDate: statementClosingDate,
      partnerStatementAmount,
      exportResult,
      transactionsCount: transactions.length,
    })
  }

  // If called for a single family, return that single object
  if (familyId && settlementResults.length === 1) {
    return settlementResults[0]
  }

  return settlementResults.length === 1 ? settlementResults[0] : { results: settlementResults }
}
