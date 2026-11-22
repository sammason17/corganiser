import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getValidAccessToken,
  getCards,
  getCardBalance,
  getCardTransactions,
  fetchCardLiveMetrics
} from '../../lib/truelayer.js'
import { checkAndRunStatementSettlement } from '../../lib/settlementAutomation.js'

const router = express.Router()

function getCleanBaseUrl() {
  let url = (process.env.APP_URL || '').trim()
  url = url.replace(/\/api\/truelayer\/callback\/?$/i, '')
           .replace(/\/api\/truelayer\/?$/i, '')
           .replace(/\/api\/?$/i, '')
           .replace(/\/$/, '')
  return url
}

function getRedirectUri(req) {
  if (process.env.TRUELAYER_REDIRECT_URI) {
    return process.env.TRUELAYER_REDIRECT_URI.trim()
  }
  const base = getCleanBaseUrl()
  if (base && base.startsWith('http')) {
    return `${base}/api/truelayer/callback`
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.headers['x-forwarded-host'] || req.get('host')
  return `${proto}://${host}/api/truelayer/callback`
}

function getAppRedirectUrl(path = '/budget') {
  const base = getCleanBaseUrl()
  return `${base}${path}`
}

/**
 * GET /api/truelayer/status
 * Returns current connection state for both primary and secondary cards
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const familyId = req.user.familyId
    let config = null
    if (familyId) {
      config = await prisma.cardAutomationConfig.findUnique({ where: { familyId } })
    }
    if (!config) {
      config = await prisma.cardAutomationConfig.findFirst({ where: familyId ? { familyId } : {} })
    }

    if (!config) {
      return res.json({
        isActive: false,
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncMessage: null,
        primary: {
          isConnected: false,
          cardAccountId: null,
          cardDisplayName: 'Primary Card',
          cardholderName: null,
          statementClosingDay: 19,
          paymentDueDay: 1,
          lastStatementAmount: 0,
          rawBalance: 0,
          consentExpiresAt: null,
          consentDaysRemaining: null
        },
        secondary: {
          isConnected: false,
          cardAccountId: null,
          cardDisplayName: 'Secondary Card',
          cardholderName: null,
          statementClosingDay: 19,
          paymentDueDay: 1,
          lastStatementAmount: 0,
          rawBalance: 0,
          consentExpiresAt: null,
          consentDaysRemaining: null
        }
      })
    }

    let primaryConsentDays = null
    if (config.consentExpiresAt) {
      const diff = new Date(config.consentExpiresAt).getTime() - Date.now()
      primaryConsentDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
    }

    let secondaryConsentDays = null
    const secConsentDate = config.secondaryConsentExpiresAt || config.consentExpiresAt
    if (secConsentDate) {
      const diff = new Date(secConsentDate).getTime() - Date.now()
      secondaryConsentDays = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
    }

    const isPrimaryConnected = Boolean(config.accessToken && config.refreshToken)
    const isSecondaryConnected = Boolean(
      (config.secondaryAccessToken && config.secondaryRefreshToken) ||
      (config.secondaryCardAccountId && config.accessToken)
    )

    res.json({
      isActive: config.isActive,
      lastSyncAt: config.lastSyncAt,
      lastSyncStatus: config.lastSyncStatus,
      lastSyncMessage: config.lastSyncMessage,
      // Backward-compatible top-level fields
      isConnected: isPrimaryConnected,
      cardAccountId: config.cardAccountId,
      lastKnownStatementDate: config.lastKnownStatementDate,
      lastProcessedStatementDate: config.lastProcessedStatementDate,
      consentExpiresAt: config.consentExpiresAt,
      consentDaysRemaining: primaryConsentDays,
      // Dual-card detailed structure
      primary: {
        isConnected: isPrimaryConnected,
        cardAccountId: config.cardAccountId,
        cardDisplayName: config.cardDisplayName || 'Primary Card',
        cardholderName: config.cardholderName,
        statementClosingDay: config.statementClosingDay ?? 19,
        paymentDueDay: config.paymentDueDay ?? 1,
        lastStatementAmount: config.lastStatementAmount ?? 0,
        rawBalance: config.primaryLastKnownBalance ?? 0,
        consentExpiresAt: config.consentExpiresAt,
        consentDaysRemaining: primaryConsentDays
      },
      secondary: {
        isConnected: isSecondaryConnected,
        cardAccountId: config.secondaryCardAccountId,
        cardDisplayName: config.secondaryCardDisplayName || 'Secondary Card',
        cardholderName: config.secondaryCardholderName,
        statementClosingDay: config.secondaryStatementClosingDay ?? 19,
        paymentDueDay: config.secondaryPaymentDueDay ?? 1,
        lastStatementAmount: config.secondaryLastStatementAmount ?? 0,
        rawBalance: config.secondaryLastKnownBalance ?? 0,
        consentExpiresAt: config.secondaryConsentExpiresAt || config.consentExpiresAt,
        consentDaysRemaining: secondaryConsentDays
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch TrueLayer status' })
  }
})

/**
 * GET /api/truelayer/auth-url
 * Returns the OAuth consent URL to initiate connection, encoding familyId and cardType in state
 */
router.get('/auth-url', requireAuth, (req, res) => {
  try {
    const redirectUri = getRedirectUri(req)
    const cardType = req.query.cardType === 'secondary' ? 'secondary' : 'primary'
    const stateObj = { familyId: req.user.familyId || 'singleton', cardType }
    const state = JSON.stringify(stateObj)
    const url = getAuthUrl({ redirectUri, state })
    res.json({ url, redirectUri, cardType })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate TrueLayer authorization URL' })
  }
})

/**
 * GET/POST /api/truelayer/callback
 * Handles OAuth callback from TrueLayer for primary or secondary card
 */
router.all('/callback', async (req, res) => {
  const code = req.query.code || req.body?.code
  const error = req.query.error || req.body?.error
  const error_description = req.query.error_description || req.body?.error_description
  const rawState = req.query.state || req.body?.state || null

  if (error) {
    console.error('[TrueLayer Callback Error]', error, error_description)
    return res.redirect(getAppRedirectUrl(`/budget?truelayer=error&msg=${encodeURIComponent(error_description || error)}`))
  }

  if (!code) {
    return res.redirect(getAppRedirectUrl('/budget?truelayer=error&msg=No+code+provided'))
  }

  try {
    let targetFamilyId = null
    let cardType = 'primary'

    if (rawState) {
      try {
        const parsed = JSON.parse(rawState)
        if (parsed && typeof parsed === 'object') {
          targetFamilyId = parsed.familyId || null
          cardType = parsed.cardType === 'secondary' ? 'secondary' : 'primary'
        }
      } catch {
        targetFamilyId = rawState
      }
    }

    if (!targetFamilyId || targetFamilyId === 'singleton') {
      const firstFamily = await prisma.family.findFirst()
      targetFamilyId = firstFamily?.id || null
    }

    const redirectUri = getRedirectUri(req)
    const tokens = await exchangeCodeForTokens({ code, redirectUri })
    const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)
    const consentExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)

    // Discover available cards
    let defaultCardId = null
    let cardholderName = null
    let cardDisplayName = null
    try {
      const cards = await getCards(tokens.access_token)
      if (cards.length > 0) {
        defaultCardId = cards[0].account_id
        cardholderName = cards[0].name_on_card || null
        cardDisplayName = cards[0].display_name || null
      }
    } catch (cardErr) {
      console.warn('Could not list cards immediately after connect:', cardErr.message)
    }

    const isSecondary = cardType === 'secondary'
    const configUpdate = isSecondary
      ? {
          secondaryAccessToken: tokens.access_token,
          secondaryRefreshToken: tokens.refresh_token,
          secondaryTokenExpiresAt: tokenExpiresAt,
          secondaryConsentExpiresAt: consentExpiresAt,
          ...(defaultCardId && { secondaryCardAccountId: defaultCardId }),
          ...(cardholderName && { secondaryCardholderName: cardholderName }),
          ...(cardDisplayName && { secondaryCardDisplayName: cardDisplayName }),
          lastSyncStatus: 'CONNECTED',
          lastSyncMessage: 'Connected Secondary Card to TrueLayer successfully'
        }
      : {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
          consentExpiresAt,
          isActive: true,
          lastSyncStatus: 'CONNECTED',
          lastSyncMessage: 'Connected Primary Card to TrueLayer successfully',
          ...(defaultCardId && { cardAccountId: defaultCardId }),
          ...(cardholderName && { cardholderName }),
          ...(cardDisplayName && { cardDisplayName }),
        }

    if (targetFamilyId) {
      await prisma.cardAutomationConfig.upsert({
        where: { familyId: targetFamilyId },
        update: configUpdate,
        create: {
          familyId: targetFamilyId,
          ...configUpdate
        }
      })
    } else {
      await prisma.cardAutomationConfig.upsert({
        where: { id: 'singleton' },
        update: configUpdate,
        create: {
          id: 'singleton',
          ...configUpdate
        }
      })
    }

    return res.redirect(getAppRedirectUrl(`/budget?truelayer=connected&cardType=${cardType}`))
  } catch (err) {
    console.error('[TrueLayer Token Exchange Exception]', err)
    return res.redirect(getAppRedirectUrl(`/budget?truelayer=error&msg=${encodeURIComponent(err.message)}`))
  }
})

/**
 * GET /api/truelayer/cards
 * Lists available cards for primary or secondary slot
 */
router.get('/cards', requireAuth, async (req, res) => {
  try {
    const cardType = req.query.cardType === 'secondary' ? 'secondary' : 'primary'
    const tokenData = await getValidAccessToken(req.user.familyId, cardType)
    if (!tokenData) {
      return res.status(401).json({ error: `TrueLayer is not connected for ${cardType} card` })
    }

    const { accessToken, config } = tokenData
    const cards = await getCards(accessToken)

    const isSecondary = cardType === 'secondary'
    const targetCardId = isSecondary
      ? (config.secondaryCardAccountId || (cards[0] ? cards[0].account_id : null))
      : (config.cardAccountId || (cards[0] ? cards[0].account_id : null))

    let currentBalance = null
    if (targetCardId) {
      try {
        currentBalance = await getCardBalance(accessToken, targetCardId)
      } catch (e) {
        console.warn(`Could not fetch ${cardType} balance:`, e.message)
      }
    }

    const activeCard = cards.find(c => c.account_id === targetCardId) || cards[0]
    const cardholderName = isSecondary
      ? (activeCard?.name_on_card || config.secondaryCardholderName)
      : (activeCard?.name_on_card || config.cardholderName)
    const cardDisplayName = isSecondary
      ? (activeCard?.display_name || config.secondaryCardDisplayName)
      : (activeCard?.display_name || config.cardDisplayName)

    res.json({
      cardType,
      cards,
      selectedCardId: targetCardId,
      cardholderName,
      cardDisplayName,
      balance: currentBalance,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to fetch cards' })
  }
})

/**
 * POST /api/truelayer/config
 * Update card account selection, statement days, or payment days for family
 */
router.post('/config', requireAuth, async (req, res) => {
  try {
    const {
      cardAccountId,
      cardDisplayName,
      statementClosingDay,
      paymentDueDay,
      lastStatementAmount,
      secondaryCardAccountId,
      secondaryCardDisplayName,
      secondaryStatementClosingDay,
      secondaryPaymentDueDay,
      secondaryLastStatementAmount,
      isActive
    } = req.body

    const familyId = req.user.familyId
    const updateData = {}

    // Primary Card fields
    if (cardAccountId !== undefined) updateData.cardAccountId = cardAccountId
    if (cardDisplayName !== undefined) updateData.cardDisplayName = cardDisplayName
    if (statementClosingDay !== undefined) updateData.statementClosingDay = Number(statementClosingDay)
    if (paymentDueDay !== undefined) updateData.paymentDueDay = Number(paymentDueDay)
    if (lastStatementAmount !== undefined) updateData.lastStatementAmount = Number(lastStatementAmount)

    // Secondary Card fields
    if (secondaryCardAccountId !== undefined) updateData.secondaryCardAccountId = secondaryCardAccountId
    if (secondaryCardDisplayName !== undefined) updateData.secondaryCardDisplayName = secondaryCardDisplayName
    if (secondaryStatementClosingDay !== undefined) updateData.secondaryStatementClosingDay = Number(secondaryStatementClosingDay)
    if (secondaryPaymentDueDay !== undefined) updateData.secondaryPaymentDueDay = Number(secondaryPaymentDueDay)
    if (secondaryLastStatementAmount !== undefined) updateData.secondaryLastStatementAmount = Number(secondaryLastStatementAmount)

    if (isActive !== undefined) updateData.isActive = Boolean(isActive)

    // Auto-resolve card names if cardAccountId changed
    if (cardAccountId) {
      const tokenData = await getValidAccessToken(familyId, 'primary')
      if (tokenData?.accessToken) {
        try {
          const cards = await getCards(tokenData.accessToken)
          const matched = cards.find(c => c.account_id === cardAccountId)
          if (matched) {
            if (matched.name_on_card) updateData.cardholderName = matched.name_on_card
            if (matched.display_name && !cardDisplayName) updateData.cardDisplayName = matched.display_name
          }
        } catch (e) {
          console.warn('Could not lookup primary card name:', e.message)
        }
      }
    }

    if (secondaryCardAccountId) {
      const tokenData = await getValidAccessToken(familyId, 'secondary')
      if (tokenData?.accessToken) {
        try {
          const cards = await getCards(tokenData.accessToken)
          const matched = cards.find(c => c.account_id === secondaryCardAccountId)
          if (matched) {
            if (matched.name_on_card) updateData.secondaryCardholderName = matched.name_on_card
            if (matched.display_name && !secondaryCardDisplayName) updateData.secondaryCardDisplayName = matched.display_name
          }
        } catch (e) {
          console.warn('Could not lookup secondary card name:', e.message)
        }
      }
    }

    let updated
    if (familyId) {
      updated = await prisma.cardAutomationConfig.upsert({
        where: { familyId },
        update: updateData,
        create: { familyId, ...updateData }
      })
    } else {
      updated = await prisma.cardAutomationConfig.upsert({
        where: { id: 'singleton' },
        update: updateData,
        create: { id: 'singleton', ...updateData }
      })
    }

    res.json(updated)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to update TrueLayer configuration' })
  }
})

/**
 * GET /api/truelayer/live-monitor
 * Fetches real-time live spending metrics for Primary & Secondary cards,
 * minusing recurring credit card bills and tracking against set budget allowance.
 */
router.get('/live-monitor', requireAuth, async (req, res) => {
  try {
    const familyId = req.user.familyId
    const userId = req.user.userId

    const [cardMetrics, creditCardBills, user, manualSecondaryExpenses] = await Promise.all([
      fetchCardLiveMetrics(familyId),
      prisma.primaryCardRecurring.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.user.findUnique({ where: { id: userId }, select: { primaryCardAllowance: true } }),
      prisma.secondaryCardExpense.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } })
    ])

    const totalCreditCardBills = creditCardBills.reduce((acc, b) => acc + (b.amount || 0), 0)
    const totalManualPayments = manualSecondaryExpenses.reduce((acc, m) => acc + (m.amount || 0), 0)
    const budgetAllowance = user?.primaryCardAllowance || 0

    // Net discretionary card spend = active card spend across both cards minus credit card bills
    const netLiveCardSpend = Math.max(0, cardMetrics.totalLiveCardSpend - totalCreditCardBills)
    const totalSpendUsed = netLiveCardSpend + totalManualPayments
    const remainingBudget = budgetAllowance - totalSpendUsed
    const isOverBudget = totalSpendUsed > budgetAllowance
    const overspendAmount = Math.max(0, totalSpendUsed - budgetAllowance)
    const burnRatePercentage = budgetAllowance > 0 ? Math.round((totalSpendUsed / budgetAllowance) * 100) : 0

    res.json({
      primaryCard: cardMetrics.primaryCard,
      secondaryCard: cardMetrics.secondaryCard,
      totalLiveCardSpend: cardMetrics.totalLiveCardSpend,
      totalCreditCardBills,
      netLiveCardSpend,
      manualPayments: totalManualPayments,
      totalSpendUsed,
      budgetAllowance,
      remainingBudget,
      isOverBudget,
      overspendAmount,
      burnRatePercentage,
      lastSyncAt: cardMetrics.lastSyncAt,
    })
  } catch (err) {
    console.error('[Live Monitor Error]', err)
    res.status(500).json({ error: err.message || 'Failed to fetch live card monitor metrics' })
  }
})

/**
 * POST /api/truelayer/sync-now
 * Runs an on-demand settlement sync for the authenticated user's family
 */
router.post('/sync-now', requireAuth, async (req, res) => {
  try {
    const force = Boolean(req.body?.force || req.query?.force === 'true')
    const result = await checkAndRunStatementSettlement({ force, familyId: req.user.familyId })
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Sync failed' })
  }
})

/**
 * POST /api/truelayer/disconnect
 * Disconnects TrueLayer tokens: accepts cardType = 'primary' | 'secondary' | 'all'
 */
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const familyId = req.user.familyId
    const cardType = req.body?.cardType || req.query?.cardType || 'all'

    let updateData = {}
    if (cardType === 'secondary') {
      updateData = {
        secondaryAccessToken: null,
        secondaryRefreshToken: null,
        secondaryTokenExpiresAt: null,
        secondaryConsentExpiresAt: null,
        secondaryCardAccountId: null,
      }
    } else if (cardType === 'primary') {
      updateData = {
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        consentExpiresAt: null,
        cardAccountId: null,
        isActive: false,
        lastSyncStatus: 'DISCONNECTED',
        lastSyncMessage: 'Disconnected Primary Card',
      }
    } else {
      // all
      updateData = {
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        consentExpiresAt: null,
        cardAccountId: null,
        secondaryAccessToken: null,
        secondaryRefreshToken: null,
        secondaryTokenExpiresAt: null,
        secondaryConsentExpiresAt: null,
        secondaryCardAccountId: null,
        isActive: false,
        lastSyncStatus: 'DISCONNECTED',
        lastSyncMessage: 'Disconnected all cards by user',
      }
    }

    if (familyId) {
      await prisma.cardAutomationConfig.updateMany({
        where: { familyId },
        data: updateData
      })
    } else {
      await prisma.cardAutomationConfig.upsert({
        where: { id: 'singleton' },
        update: updateData,
        create: { id: 'singleton', ...updateData }
      })
    }

    res.json({ message: `Disconnected ${cardType} successfully` })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to disconnect TrueLayer' })
  }
})

export default router
