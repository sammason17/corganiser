import prisma from './prisma.js'
import { getValidAccessToken, getCardBalance, getCardTransactions } from './truelayer.js'
import { sendPrecheckReminderEmail, sendMonthlySettlementEmail } from './resend.js'

/**
 * Generates an export name adhering to default "[Month]-[Year]"
 * and automatically appends iterating numbers if duplicates exist (e.g. "November-2026-1")
 */
export async function getUniqueExportName(date = new Date(), familyId = null) {
  const baseName = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(' ', '-')
  
  const existing = await prisma.sharedStatementExport.findMany({
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
 * Resolves dynamic names (primaryName and partnerName) for a family
 */
export async function resolveFamilyNames(familyId = null) {
  let primaryName = 'Me'
  let partnerName = 'Partner'

  if (familyId) {
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' }
        },
        automationConfig: {
          select: { cardholderName: true, cardDisplayName: true }
        }
      }
    })

    if (family?.members && family.members.length > 0) {
      // Primary is typically the family OWNER or first member
      const ownerMember = family.members.find(m => m.role === 'OWNER') || family.members[0]
      primaryName = ownerMember.user.name || 'Me'

      // Partner: match cardholderName against members if available
      const cardholder = (family.automationConfig?.cardholderName || '').toLowerCase()
      if (cardholder) {
        const matched = family.members.find(m => {
          const mName = (m.user.name || '').toLowerCase()
          return mName && cardholder.includes(mName)
        })
        if (matched) {
          partnerName = matched.user.name
        }
      }

      // If partnerName is still default 'Partner', pick the first member who is not the primary
      if (partnerName === 'Partner') {
        const otherMember = family.members.find(m => m.user.name?.toLowerCase() !== primaryName.toLowerCase())
        if (otherMember) {
          partnerName = otherMember.user.name
        } else if (family.automationConfig?.cardholderName) {
          // Fall back to first word of cardholder name (e.g. "Jane" from "JANE DOE")
          const firstWord = family.automationConfig.cardholderName.trim().split(/\s+/)[0]
          partnerName = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
        }
      }
    }
  } else {
    // If no familyId, check if any family exists
    const firstFamily = await prisma.family.findFirst({
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        automationConfig: true
      }
    })
    if (firstFamily) {
      return resolveFamilyNames(firstFamily.id)
    }
  }

  return { primaryName, partnerName }
}

/**
 * Calculates settlement amounts from a list of shops and partner statement amount
 */
export function calculateSettlement({ shops = [], partnerStatementAmount = 0, primaryName = 'Me' }) {
  let partnerOwesForMyShops = 0
  let iOweForPartnerShops = 0

  const primaryClean = (primaryName || '').trim().toLowerCase()

  shops.forEach(shop => {
    const remainder = Number(shop.totalAmount || 0) - Number(shop.payerCoveredAmount || 0)
    const payerClean = (shop.payerName || '').trim().toLowerCase()
    if (payerClean === primaryClean || payerClean === 'me') {
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
  const { primaryName, partnerName } = await resolveFamilyNames(familyId)

  // 1. Fetch current live shops for this family
  const shops = await prisma.sharedFoodShop.findMany({
    where: familyId ? { familyId } : {},
    orderBy: { date: 'asc' }
  })
  
  // 2. Compute settlement figures
  const { partnerOwesForMyShops, iOweForPartnerShops, finalAmountPartnerOwes } = calculateSettlement({
    shops,
    partnerStatementAmount: Number(partnerStatementAmount) || 0,
    primaryName
  })

  // 3. Generate unique export name
  const name = customName || await getUniqueExportName(new Date(), familyId)

  // 4. Create the export record
  const newExport = await prisma.sharedStatementExport.create({
    data: {
      name,
      partnerStatementAmount: Number(partnerStatementAmount) || 0,
      shopsData: shops,
      partnerOwesForMyShops,
      iOweForPartnerShops,
      finalAmountPartnerOwes,
      primaryName,
      partnerName,
      autoExported,
      ...(familyId ? { familyId } : {})
    }
  })

  // 5. Clear current shops and reset live calculator statement amount for this family
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
    const defaultState = await prisma.sharedStatementState.findFirst()
    if (defaultState) {
      await prisma.sharedStatementState.update({
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
      primaryName,
      partnerName,
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
      primaryName,
      partnerName,
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
  const existingExport = await prisma.sharedStatementExport.findUnique({
    where: { id: exportId }
  })
  if (!existingExport) {
    throw new Error('Export not found')
  }

  const { primaryName, partnerName } = (existingExport.primaryName && existingExport.partnerName && existingExport.primaryName !== 'Me')
    ? { primaryName: existingExport.primaryName, partnerName: existingExport.partnerName }
    : await resolveFamilyNames(existingExport.familyId)

  const shops = Array.isArray(existingExport.shopsData) ? existingExport.shopsData : []
  const newAmount = Math.max(0, Number(partnerStatementAmount) || 0)

  // Recalculate settlement amounts
  const { partnerOwesForMyShops, iOweForPartnerShops, finalAmountPartnerOwes } = calculateSettlement({
    shops,
    partnerStatementAmount: newAmount,
    primaryName
  })

  // Update the exported record in the database
  const updatedExport = await prisma.sharedStatementExport.update({
    where: { id: exportId },
    data: {
      partnerStatementAmount: newAmount,
      partnerOwesForMyShops,
      iOweForPartnerShops,
      finalAmountPartnerOwes,
      primaryName,
      partnerName,
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
      primaryName,
      partnerName,
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
  let configs = await prisma.cardAutomationConfig.findMany({
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
    const fallback = await prisma.cardAutomationConfig.findFirst({
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

    await prisma.cardAutomationConfig.update({
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
    const conf = await prisma.cardAutomationConfig.findUnique({ where: { familyId } })
    if (conf) configs = [conf]
  } else {
    configs = await prisma.cardAutomationConfig.findMany({ where: { isActive: true } })
  }

  if (configs.length === 0) {
    const fallback = await prisma.cardAutomationConfig.findFirst()
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
    await prisma.cardAutomationConfig.update({
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
