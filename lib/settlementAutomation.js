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
 * Polls TrueLayer to check if last_statement_date has rolled over into this month.
 * When rolled over: sums Lauren's transactions, executes export & clear, sends emails, and halts.
 */
export async function checkAndRunStatementSettlement() {
  const tokenData = await getValidAccessToken()
  if (!tokenData) {
    return { status: 'DISCONNECTED', message: 'TrueLayer connection not active or missing tokens' }
  }

  const { accessToken, config } = tokenData
  if (!config.cardAccountId) {
    return { status: 'NO_CARD_ACCOUNT', message: 'No card account ID selected in configuration' }
  }

  // 1. Fetch card balance to check last_statement_date
  const balance = await getCardBalance(accessToken, config.cardAccountId)
  if (!balance || !balance.last_statement_date) {
    return { status: 'NO_STATEMENT_DATA', message: 'Provider returned no statement date in balance endpoint' }
  }

  const lastStatementDate = balance.last_statement_date // e.g. "2026-11-19"

  // 2. Check if this statement was already processed
  if (config.lastProcessedStatementDate === lastStatementDate) {
    return {
      status: 'ALREADY_PROCESSED',
      message: `Statement for ${lastStatementDate} has already been processed and exported.`,
      lastStatementDate,
    }
  }

  // 3. Check if statement date belongs to current month cycle
  const now = new Date()
  const statementDateObj = new Date(lastStatementDate)
  
  // If the statement date is older than 25 days ago, it hasn't rolled over to the current cycle yet
  const diffDays = (now.getTime() - statementDateObj.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays > 25) {
    return {
      status: 'AWAITING_NEW_STATEMENT',
      message: `Latest statement date (${lastStatementDate}) is from a previous cycle. Waiting for Amex to cut current statement.`,
      lastStatementDate,
    }
  }

  // 4. Determine transaction period for this closed statement
  // Start date is either previous known statement date or 32 days prior to lastStatementDate
  let fromDate = config.lastKnownStatementDate
  if (!fromDate) {
    const prior = new Date(statementDateObj)
    prior.setDate(prior.getDate() - 31)
    fromDate = prior.toISOString().split('T')[0]
  }
  const toDate = lastStatementDate

  // 5. Fetch transactions within statement window
  const transactions = await getCardTransactions(accessToken, config.cardAccountId, fromDate, toDate)

  // 6. Filter by Lauren's supplementary card ID
  const laurenCardId = config.laurenSupplementaryCardId
  let laurenTotal = 0
  const laurenTxns = []

  for (const txn of transactions) {
    const isLauren = laurenCardId 
      ? txn.meta?.supplementary_card_id === laurenCardId
      : Boolean(txn.meta?.supplementary_card_id) // if only one supplementary card exists

    if (isLauren) {
      laurenTxns.push(txn)
      // TrueLayer transaction amounts: negative is usually debit/charge, or positive depending on representation
      // We take absolute value of debit transactions
      const amount = Math.abs(Number(txn.amount) || 0)
      laurenTotal += amount
    }
  }

  // Round to 2 decimal places
  const partnerStatementAmount = Math.round(laurenTotal * 100) / 100

  // 7. Execute export, clear, and email dispatch
  const exportResult = await executeSettlementExportAndClear({
    partnerStatementAmount,
    autoExported: true,
  })

  // 8. Update configuration record
  await prisma.amexAutomationConfig.update({
    where: { id: 'singleton' },
    data: {
      lastKnownStatementDate: lastStatementDate,
      lastProcessedStatementDate: lastStatementDate,
      lastSyncAt: new Date(),
      lastSyncStatus: 'SUCCESS',
      lastSyncMessage: `Automated settlement completed for ${lastStatementDate}. Exported as "${exportResult.export.name}".`,
    }
  })

  return {
    status: 'COMPLETED',
    lastStatementDate,
    partnerStatementAmount,
    exportResult,
    laurenTransactionsCount: laurenTxns.length,
  }
}
