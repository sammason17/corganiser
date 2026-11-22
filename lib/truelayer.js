import prisma from './prisma.js'

const CLIENT_ID = process.env.TRUELAYER_CLIENT_ID
const CLIENT_SECRET = process.env.TRUELAYER_CLIENT_SECRET
const IS_LIVE = process.env.TRUELAYER_ENV === 'live' || (CLIENT_ID && !CLIENT_ID.startsWith('sandbox-'))

const AUTH_BASE_URL = IS_LIVE ? 'https://auth.truelayer.com' : 'https://auth.truelayer-sandbox.com'
const API_BASE_URL = IS_LIVE ? 'https://api.truelayer.com' : 'https://api.truelayer-sandbox.com'

/**
 * Generates the TrueLayer OAuth consent URL
 */
export function getAuthUrl({ redirectUri, state }) {
  const scopes = [
    'info',
    'accounts',
    'balance',
    'cards',
    'transactions',
    'offline_access'
  ].join('%20')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: scopes,
    redirect_uri: redirectUri,
    response_mode: 'form_post', // or query
    providers: 'uk-ob-all uk-oauth-all'
  })

  // We can pass response_mode=query for simple browser redirect
  return `${AUTH_BASE_URL}/?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query${state ? `&state=${encodeURIComponent(state)}` : ''}&providers=uk-ob-all%20uk-oauth-all`
}

/**
 * Exchanges the authorization code for access & refresh tokens
 */
export async function exchangeCodeForTokens({ code, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: redirectUri,
    code,
  })

  const res = await fetch(`${AUTH_BASE_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange TrueLayer authorization code')
  }

  return data
}

/**
 * Refreshes an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: refreshToken,
  })

  const res = await fetch(`${AUTH_BASE_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to refresh TrueLayer access token')
  }

  return data
}

/**
 * Gets a guaranteed valid access token from the database, refreshing if expired.
 * Supports cardType = 'shared' | 'primary' | 'secondary'.
 */
export async function getValidAccessToken(familyId = null, cardType = 'shared') {
  let config = null
  if (familyId) {
    config = await prisma.cardAutomationConfig.findUnique({ where: { familyId } })
  }
  if (!config) {
    config = await prisma.cardAutomationConfig.findFirst()
  }
  if (!config) return null

  let accessToken = null
  let refreshToken = null
  let tokenExpiresAt = null

  if (cardType === 'primary') {
    accessToken = config.primaryAccessToken
    refreshToken = config.primaryRefreshToken
    tokenExpiresAt = config.primaryTokenExpiresAt
  } else if (cardType === 'secondary') {
    accessToken = config.secondaryAccessToken
    refreshToken = config.secondaryRefreshToken
    tokenExpiresAt = config.secondaryTokenExpiresAt

    // Fallback to personal primary card token if secondary card is under the same bank connection
    if ((!accessToken || !refreshToken) && config.primaryAccessToken && config.primaryRefreshToken) {
      accessToken = config.primaryAccessToken
      refreshToken = config.primaryRefreshToken
      tokenExpiresAt = config.primaryTokenExpiresAt
    }
  } else {
    // 'shared' settlement card (used for household statement settlements)
    accessToken = config.accessToken
    refreshToken = config.refreshToken
    tokenExpiresAt = config.tokenExpiresAt
  }

  if (!accessToken || !refreshToken) return null

  // Check if token expires within 5 minutes
  const now = new Date()
  const expiresAt = tokenExpiresAt ? new Date(tokenExpiresAt) : new Date(0)
  const isExpiringSoon = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000

  if (!isExpiringSoon) {
    return { accessToken, config }
  }

  // Refresh token
  try {
    const refreshed = await refreshAccessToken(refreshToken)
    const newExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000)

    let updateData = {}
    if (cardType === 'primary') {
      updateData = {
        primaryAccessToken: refreshed.access_token,
        primaryRefreshToken: refreshed.refresh_token || config.primaryRefreshToken,
        primaryTokenExpiresAt: newExpiresAt,
      }
    } else if (cardType === 'secondary' && config.secondaryRefreshToken) {
      updateData = {
        secondaryAccessToken: refreshed.access_token,
        secondaryRefreshToken: refreshed.refresh_token || config.secondaryRefreshToken,
        secondaryTokenExpiresAt: newExpiresAt,
      }
    } else {
      updateData = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || config.refreshToken,
        tokenExpiresAt: newExpiresAt,
        lastSyncStatus: 'ACTIVE',
        lastSyncMessage: 'Token refreshed successfully'
      }
    }

    const updated = await prisma.cardAutomationConfig.update({
      where: { id: config.id },
      data: updateData
    })

    const finalToken = cardType === 'primary' 
      ? updated.primaryAccessToken 
      : (cardType === 'secondary' && config.secondaryRefreshToken ? updated.secondaryAccessToken : updated.accessToken)

    return { accessToken: finalToken, config: updated }
  } catch (err) {
    console.error(`[TrueLayer Token Refresh Error (${cardType})]`, err.message)
    return null
  }
}

/**
 * Determines if current date is in the statement gap window (between statementClosingDay and paymentDueDay)
 * and returns whether deduction is active.
 */
export function isStatementGapActive(statementClosingDay = 19, paymentDueDay = 1, testDate = new Date()) {
  const day = testDate.getDate()
  if (!statementClosingDay || !paymentDueDay || statementClosingDay === paymentDueDay) return false

  if (paymentDueDay < statementClosingDay) {
    // e.g. Statement is 19th, Payment is 1st of next month
    // Active gap: day >= statementClosingDay OR day <= paymentDueDay
    return day >= statementClosingDay || day <= paymentDueDay
  } else {
    // e.g. Statement is 5th, Payment is 25th of same month
    // Active gap: day >= statementClosingDay && day <= paymentDueDay
    return day >= statementClosingDay && day <= paymentDueDay
  }
}

/**
 * Fetch all cards connected under this token
 */
export async function getCards(accessToken) {
  const res = await fetch(`${API_BASE_URL}/data/v1/cards`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch cards from TrueLayer')
  return data.results || []
}

/**
 * Fetch card balance for a given card account (includes last_statement_date & last_statement_balance)
 */
export async function getCardBalance(accessToken, cardAccountId) {
  const res = await fetch(`${API_BASE_URL}/data/v1/cards/${cardAccountId}/balance`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch card balance from TrueLayer')
  return data.results?.[0] || null
}

/**
 * Fetch card transactions for a given card account between fromDate and toDate (inclusive)
 */
export async function getCardTransactions(accessToken, cardAccountId, fromDate, toDate) {
  const params = new URLSearchParams()
  if (fromDate) params.set('from', fromDate)
  if (toDate) params.set('to', toDate)

  const url = `${API_BASE_URL}/data/v1/cards/${cardAccountId}/transactions?${params.toString()}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch transactions from TrueLayer')
  return data.results || []
}

/**
 * Fetches real-time live metrics for both Personal Primary and Personal Secondary cards,
 * automatically applying statement gap deductions. Completely decoupled from the shared settlement card.
 */
export async function fetchCardLiveMetrics(familyId = null) {
  let config = null
  if (familyId) {
    config = await prisma.cardAutomationConfig.findUnique({ where: { familyId } })
  }
  if (!config) {
    config = await prisma.cardAutomationConfig.findFirst()
  }

  const now = new Date()

  // 1. Personal Primary Card (Decoupled from shared household card)
  let primaryData = {
    isConnected: Boolean(config?.primaryAccessToken && config?.primaryRefreshToken),
    cardAccountId: config?.primaryCardAccountId || null,
    cardDisplayName: config?.primaryCardDisplayName || 'Primary Card',
    cardholderName: config?.primaryCardholderName || null,
    rawBalance: config?.primaryLastKnownBalance || 0,
    statementClosingDay: config?.statementClosingDay || 19,
    paymentDueDay: config?.paymentDueDay || 1,
    lastStatementAmount: config?.lastStatementAmount || 0,
    isGapActive: false,
    gapDeduction: 0,
    activeCycleSpend: config?.primaryLastKnownBalance || 0,
    lastUpdated: config?.lastSyncAt || null
  }

  if (config?.primaryCardAccountId) {
    const primaryTokenData = await getValidAccessToken(familyId, 'primary')
    if (primaryTokenData?.accessToken) {
      primaryData.isConnected = true
      try {
        const bal = await getCardBalance(primaryTokenData.accessToken, config.primaryCardAccountId)
        if (bal && typeof bal.current === 'number') {
          primaryData.rawBalance = bal.current
          await prisma.cardAutomationConfig.update({
            where: { id: config.id },
            data: { primaryLastKnownBalance: bal.current, lastSyncAt: now }
          }).catch(() => {})
        }
      } catch (err) {
        console.warn('[Personal Primary Card Balance Fetch Warning]', err.message)
      }
    }
  }

  primaryData.isGapActive = isStatementGapActive(primaryData.statementClosingDay, primaryData.paymentDueDay, now)
  primaryData.gapDeduction = primaryData.isGapActive ? (primaryData.lastStatementAmount || 0) : 0
  primaryData.activeCycleSpend = Math.max(0, primaryData.rawBalance - primaryData.gapDeduction)

  // 2. Personal Secondary Card
  let secondaryData = {
    isConnected: Boolean((config?.secondaryAccessToken && config?.secondaryRefreshToken) || (config?.secondaryCardAccountId && config?.primaryAccessToken)),
    cardAccountId: config?.secondaryCardAccountId || null,
    cardDisplayName: config?.secondaryCardDisplayName || 'Secondary Card',
    cardholderName: config?.secondaryCardholderName || null,
    rawBalance: config?.secondaryLastKnownBalance || 0,
    statementClosingDay: config?.secondaryStatementClosingDay || 19,
    paymentDueDay: config?.secondaryPaymentDueDay || 1,
    lastStatementAmount: config?.secondaryLastStatementAmount || 0,
    isGapActive: false,
    gapDeduction: 0,
    activeCycleSpend: config?.secondaryLastKnownBalance || 0,
    lastUpdated: config?.lastSyncAt || null
  }

  if (config?.secondaryCardAccountId) {
    const secondaryTokenData = await getValidAccessToken(familyId, 'secondary')
    if (secondaryTokenData?.accessToken) {
      secondaryData.isConnected = true
      try {
        const bal2 = await getCardBalance(secondaryTokenData.accessToken, config.secondaryCardAccountId)
        if (bal2 && typeof bal2.current === 'number') {
          secondaryData.rawBalance = bal2.current
          await prisma.cardAutomationConfig.update({
            where: { id: config.id },
            data: { secondaryLastKnownBalance: bal2.current, lastSyncAt: now }
          }).catch(() => {})
        }
      } catch (err) {
        console.warn('[Personal Secondary Card Balance Fetch Warning]', err.message)
      }
    }
  }

  secondaryData.isGapActive = isStatementGapActive(secondaryData.statementClosingDay, secondaryData.paymentDueDay, now)
  secondaryData.gapDeduction = secondaryData.isGapActive ? (secondaryData.lastStatementAmount || 0) : 0
  secondaryData.activeCycleSpend = Math.max(0, secondaryData.rawBalance - secondaryData.gapDeduction)

  return {
    primaryCard: primaryData,
    secondaryCard: secondaryData,
    totalLiveCardSpend: primaryData.activeCycleSpend + secondaryData.activeCycleSpend,
    lastSyncAt: now
  }
}

