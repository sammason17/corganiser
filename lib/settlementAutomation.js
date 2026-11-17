import prisma from './prisma.js'
import { getValidAccessToken, getCardBalance, getCardTransactions } from './truelayer.js'
import { sendPrecheckReminderEmail, sendMonthlySettlementEmail } from './resend.js'

/**
 * Generates an export name adhering to default "[Month]-[Year]"
 * and automatically appends iterating numbers if duplicates exist (e.g. "November-2026-1")
 */
export async function getUniqueExportName(date = new Date()) {
  const baseName = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(' ', '-')
  
  const existing = await prisma.sharedAmexExport.findMany({
    where: {
      name: {
        startsWith: baseName
      }
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
  partnerStatementAmount,
  autoExported = true,
  customName = null,
}) {
  // 1. Fetch current live shops
  const shops = await prisma.sharedAmexFoodShop.findMany({ orderBy: { date: 'asc' } })
  
  // 2. Compute settlement figures
  const { partnerOwesForMyShops, iOweForPartnerShops, finalAmountPartnerOwes } = calculateSettlement({
    shops,
    partnerStatementAmount: Number(partnerStatementAmount) || 0
  })

  // 3. Generate unique export name
  const name = customName || await getUniqueExportName()

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
    }
  })

  // 5. Clear current shops and reset live calculator statement amount
  await prisma.sharedAmexFoodShop.deleteMany({})
  await prisma.sharedAmexState.upsert({
    where: { id: 'singleton' },
    update: { partnerStatementAmount: 0 },
    create: { id: 'singleton', partnerStatementAmount: 0 }
  })

  // 6. Fetch Sam and Lauren's emails from the DB
  const users = await prisma.user.findMany({
    select: { email: true, name: true }
  })
  const recipients = users.map(u => u.email).filter(Boolean)

  // 7. Dispatch the monthly settlement summary email to both
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

  // Fetch Sam and Lauren's emails
  const users = await prisma.user.findMany({
    select: { email: true, name: true }
  })
  const recipients = users.map(u => u.email).filter(Boolean)

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
 * Pre-check runner: Sends reminder to Sam on the 18th
 */
export async function run18thPrecheckReminder() {
  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const config = await prisma.amexAutomationConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' }
  })

  // Check if reminder was already sent for this calendar month
  if (config.lastPrecheckSentMonth === currentMonthKey) {
    return { skipped: true, reason: 'Already sent for this month', currentMonthKey }
  }

  // Find Sam's email
  const sam = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { contains: 'Sam', mode: 'insensitive' } },
        { email: { contains: 'sam', mode: 'insensitive' } }
      ]
    }
  })

  if (!sam?.email) {
    throw new Error('Sam user record / email not found in database')
  }

  const result = await sendPrecheckReminderEmail({
    recipientEmail: sam.email,
    recipientName: sam.name || 'Sam',
    monthName,
  })

  await prisma.amexAutomationConfig.update({
    where: { id: 'singleton' },
    data: {
      lastPrecheckSentMonth: currentMonthKey
    }
  })

  return { success: true, email: sam.email, monthName, result }
}

/**
 * Statement settlement runner:
 * Runs on the 24th of each month (5 days after the 19th statement closing)
 * to allow all pending transactions to settle and Amex to release statement.
 * Sums Lauren's transactions (20th prev month - 19th current month),
 * executes export & clear, sends emails, and halts.
 */
export async function checkAndRunStatementSettlement({ force = false } = {}) {
  const tokenData = await getValidAccessToken()
  if (!tokenData) {
    return { status: 'DISCONNECTED', message: 'TrueLayer connection not active or missing tokens' }
  }

  const { accessToken, config } = tokenData
  if (!config.cardAccountId) {
    return { status: 'NO_CARD_ACCOUNT', message: 'No card account ID selected in configuration' }
  }

  const now = new Date()
  const currentDay = now.getDate()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed: 0 = Jan, 10 = Nov

  // Amex UK statements close on the 19th of each calendar month.
  // Target statement closing date for this month:
  const monthStr = String(currentMonth + 1).padStart(2, '0')
  const statementClosingDate = `${currentYear}-${monthStr}-19`

  // 1. If today is before the 24th and not forced, wait for the settlement day (24th)
  if (currentDay < 24 && !force) {
    return {
      status: 'AWAITING_SETTLEMENT_DATE',
      message: `Statement cycle closes on the 19th (${statementClosingDate}). Automated settlement runs on the 24th once all transactions have settled.`,
      lastStatementDate: config.lastProcessedStatementDate || 'None',
      nextStatementDate: statementClosingDate,
      settlementDate: `${currentYear}-${monthStr}-24`,
    }
  }

  // 2. Check if this month's statement was already processed
  if (config.lastProcessedStatementDate === statementClosingDate && !force) {
    return {
      status: 'ALREADY_PROCESSED',
      message: `Statement for ${statementClosingDate} has already been settled and exported.`,
      lastStatementDate: statementClosingDate,
    }
  }

  // 3. Determine transaction period for this closed statement:
  // Starts on the 20th of previous month and ends on the 19th of current month
  const prevDate = new Date(currentYear, currentMonth - 1, 20)
  const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, '0')
  const fromDate = `${prevDate.getFullYear()}-${prevMonthStr}-20T00:00:00.000Z`
  let toDate = `${statementClosingDate}T23:59:59.999Z`
  if (new Date(toDate) > now) {
    toDate = now.toISOString()
  }

  // 4. Fetch transactions within statement window
  const transactions = await getCardTransactions(accessToken, config.cardAccountId, fromDate, toDate)

  // 5. Calculate Lauren's statement spend from connected card transactions
  let laurenTotal = 0
  const laurenTxns = []

  for (const txn of transactions) {
    laurenTxns.push(txn)
    // TrueLayer transactions: debits represent spend, credits represent refunds/payments
    const isCredit = txn.meta?.transaction_type?.toLowerCase() === 'credit' || (txn.amount < 0 && txn.meta?.transaction_type?.toLowerCase() !== 'debit')
    const amt = Math.abs(Number(txn.amount) || 0)
    if (isCredit) {
      laurenTotal -= amt
    } else {
      laurenTotal += amt
    }
  }

  // Round to 2 decimal places, minimum 0
  const partnerStatementAmount = Math.max(0, Math.round(laurenTotal * 100) / 100)

  // 6. Execute export, clear, and email dispatch
  const exportResult = await executeSettlementExportAndClear({
    partnerStatementAmount,
    autoExported: true,
  })

  // 7. Update configuration record
  await prisma.amexAutomationConfig.update({
    where: { id: 'singleton' },
    data: {
      lastKnownStatementDate: statementClosingDate,
      lastProcessedStatementDate: statementClosingDate,
      lastSyncAt: new Date(),
      lastSyncStatus: 'SUCCESS',
      lastSyncMessage: `Automated settlement completed for ${statementClosingDate}. Exported as "${exportResult.export.name}".`,
    }
  })

  return {
    status: 'COMPLETED',
    lastStatementDate: statementClosingDate,
    partnerStatementAmount,
    exportResult,
    laurenTransactionsCount: laurenTxns.length,
  }
}
