import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getValidAccessToken,
  getCards,
  getCardBalance,
  getCardTransactions
} from '../../lib/truelayer.js'
import { checkAndRunStatementSettlement } from '../../lib/settlementAutomation.js'

const router = express.Router()

function getCleanBaseUrl() {
  let url = (process.env.APP_URL || '').trim()
  // Cleanly strip any accidental callback or sub-paths if pasted
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
  // Fallback to request host
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
 * Returns current connection state for the authenticated user's family
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const familyId = req.user.familyId
    let config = null
    if (familyId) {
      config = await prisma.amexAutomationConfig.findUnique({ where: { familyId } })
    }
    if (!config) {
      config = await prisma.amexAutomationConfig.findFirst({ where: familyId ? { familyId } : {} })
    }
    if (!config) {
      return res.json({
        isConnected: false,
        isActive: false,
        cardAccountId: null,
        lastProcessedStatementDate: null,
        consentDaysRemaining: null,
      })
    }

    let consentDaysRemaining = null
    if (config.consentExpiresAt) {
      const diff = new Date(config.consentExpiresAt).getTime() - Date.now()
      consentDaysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
    }

    res.json({
      isConnected: Boolean(config.accessToken && config.refreshToken),
      isActive: config.isActive,
      cardAccountId: config.cardAccountId,
      lastKnownStatementDate: config.lastKnownStatementDate,
      lastProcessedStatementDate: config.lastProcessedStatementDate,
      consentExpiresAt: config.consentExpiresAt,
      consentDaysRemaining,
      lastSyncAt: config.lastSyncAt,
      lastSyncStatus: config.lastSyncStatus,
      lastSyncMessage: config.lastSyncMessage,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch TrueLayer status' })
  }
})

/**
 * GET /api/truelayer/auth-url
 * Returns the OAuth consent URL to initiate connection, encoding familyId in state
 */
router.get('/auth-url', requireAuth, (req, res) => {
  try {
    const redirectUri = getRedirectUri(req)
    const state = req.user.familyId || ''
    const url = getAuthUrl({ redirectUri, state })
    res.json({ url, redirectUri })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to generate TrueLayer authorization URL' })
  }
})

/**
 * GET/POST /api/truelayer/callback
 * Handles OAuth callback from TrueLayer
 */
router.all('/callback', async (req, res) => {
  const code = req.query.code || req.body?.code
  const error = req.query.error || req.body?.error
  const error_description = req.query.error_description || req.body?.error_description
  const stateFamilyId = req.query.state || req.body?.state || null

  if (error) {
    console.error('[TrueLayer Callback Error]', error, error_description)
    return res.redirect(getAppRedirectUrl(`/budget?truelayer=error&msg=${encodeURIComponent(error_description || error)}`))
  }

  if (!code) {
    return res.redirect(getAppRedirectUrl('/budget?truelayer=error&msg=No+code+provided'))
  }

  try {
    const redirectUri = getRedirectUri(req)
    const tokens = await exchangeCodeForTokens({ code, redirectUri })

    const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)
    // UK Open Banking 90-day consent window
    const consentExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)

    // Discover available cards
    let defaultCardId = null
    try {
      const cards = await getCards(tokens.access_token)
      if (cards.length > 0) {
        defaultCardId = cards[0].account_id
      }
    } catch (cardErr) {
      console.warn('Could not list cards immediately after connect:', cardErr.message)
    }

    let targetFamilyId = stateFamilyId
    if (!targetFamilyId) {
      const firstFamily = await prisma.family.findFirst()
      targetFamilyId = firstFamily?.id || null
    }

    if (targetFamilyId) {
      await prisma.amexAutomationConfig.upsert({
        where: { familyId: targetFamilyId },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
          consentExpiresAt,
          isActive: true,
          lastSyncStatus: 'CONNECTED',
          lastSyncMessage: 'Connected to TrueLayer successfully',
          ...(defaultCardId && { cardAccountId: defaultCardId }),
        },
        create: {
          familyId: targetFamilyId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
          consentExpiresAt,
          isActive: true,
          lastSyncStatus: 'CONNECTED',
          lastSyncMessage: 'Connected to TrueLayer successfully',
          cardAccountId: defaultCardId,
        }
      })
    } else {
      await prisma.amexAutomationConfig.upsert({
        where: { id: 'singleton' },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
          consentExpiresAt,
          isActive: true,
          lastSyncStatus: 'CONNECTED',
          lastSyncMessage: 'Connected to TrueLayer successfully',
          ...(defaultCardId && { cardAccountId: defaultCardId }),
        },
        create: {
          id: 'singleton',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt,
          consentExpiresAt,
          isActive: true,
          lastSyncStatus: 'CONNECTED',
          lastSyncMessage: 'Connected to TrueLayer successfully',
          cardAccountId: defaultCardId,
        }
      })
    }

    return res.redirect(getAppRedirectUrl('/budget?truelayer=connected'))
  } catch (err) {
    console.error('[TrueLayer Token Exchange Exception]', err)
    return res.redirect(getAppRedirectUrl(`/budget?truelayer=error&msg=${encodeURIComponent(err.message)}`))
  }
})

/**
 * GET /api/truelayer/cards
 * Lists available cards for the authenticated family
 */
router.get('/cards', requireAuth, async (req, res) => {
  try {
    const tokenData = await getValidAccessToken(req.user.familyId)
    if (!tokenData) {
      return res.status(401).json({ error: 'TrueLayer is not connected' })
    }

    const { accessToken, config } = tokenData
    const cards = await getCards(accessToken)

    let currentBalance = null
    const targetCardId = config.cardAccountId || (cards[0] ? cards[0].account_id : null)
    if (targetCardId) {
      try {
        currentBalance = await getCardBalance(accessToken, targetCardId)
      } catch (e) {
        console.warn('Could not fetch balance:', e.message)
      }
    }

    res.json({
      cards,
      selectedCardId: config.cardAccountId,
      balance: currentBalance,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || 'Failed to fetch cards' })
  }
})

/**
 * POST /api/truelayer/config
 * Update card account selection or active status for family
 */
router.post('/config', requireAuth, async (req, res) => {
  try {
    const { cardAccountId, isActive } = req.body
    const familyId = req.user.familyId

    const updateData = {}
    if (cardAccountId !== undefined) updateData.cardAccountId = cardAccountId
    if (isActive !== undefined) updateData.isActive = Boolean(isActive)

    let updated
    if (familyId) {
      updated = await prisma.amexAutomationConfig.upsert({
        where: { familyId },
        update: updateData,
        create: { familyId, ...updateData }
      })
    } else {
      updated = await prisma.amexAutomationConfig.upsert({
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
 * Disconnects TrueLayer and removes tokens for the family
 */
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const familyId = req.user.familyId
    if (familyId) {
      await prisma.amexAutomationConfig.updateMany({
        where: { familyId },
        data: {
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          consentExpiresAt: null,
          isActive: false,
          lastSyncStatus: 'DISCONNECTED',
          lastSyncMessage: 'Disconnected by user',
        }
      })
    } else {
      await prisma.amexAutomationConfig.upsert({
        where: { id: 'singleton' },
        update: {
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          consentExpiresAt: null,
          isActive: false,
          lastSyncStatus: 'DISCONNECTED',
          lastSyncMessage: 'Disconnected by user',
        },
        create: {
          id: 'singleton',
          isActive: false,
          lastSyncStatus: 'DISCONNECTED'
        }
      })
    }
    res.json({ message: 'Disconnected' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to disconnect TrueLayer' })
  }
})

export default router
