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
 * Evaluates whether current date is in the statement gap window and returns billing cycle info.
 * Supports:
 * 1. statementDateType = 'FIXED_DAY' (closing on a set day of month, e.g. 19th)
 * 2. statementDateType = 'DAYS_BEFORE_PAYMENT' (closing X days prior to payment due date, e.g. 14 days prior)
 */
export function evaluateStatementGap({
  statementDateType = 'FIXED_DAY',
  statementClosingDay = 19,
  statementDaysBeforePayment = 14,
  paymentDueDay = 1,
  testDate = new Date()
}) {
  const year = testDate.getFullYear()
  const month = testDate.getMonth()

  const getPaymentDate = (y, m) => {
    const maxDays = new Date(y, m + 1, 0).getDate()
    const d = Math.min(Math.max(1, Number(paymentDueDay) || 1), maxDays)
    return new Date(y, m, d, 23, 59, 59, 999)
  }

  const getClosingDate = (pDate) => {
    if (statementDateType === 'DAYS_BEFORE_PAYMENT') {
      const s = new Date(pDate.getTime())
      s.setDate(s.getDate() - (Number(statementDaysBeforePayment) || 14))
      s.setHours(0, 0, 0, 0)
      return s
    } else {
      // Fixed day of month
      const sClosing = Number(statementClosingDay) || 19
      const pDue = Number(paymentDueDay) || 1
      if (pDue <= sClosing) {
        // e.g. Statement 19th, Payment 1st -> closing is in month prior to payment
        const sYear = pDate.getMonth() === 0 ? pDate.getFullYear() - 1 : pDate.getFullYear()
        const sMonth = pDate.getMonth() === 0 ? 11 : pDate.getMonth() - 1
        const maxDays = new Date(sYear, sMonth + 1, 0).getDate()
        const d = Math.min(sClosing, maxDays)
        return new Date(sYear, sMonth, d, 0, 0, 0, 0)
      } else {
        // e.g. Statement 5th, Payment 25th -> closing in same month as payment
        const sYear = pDate.getFullYear()
        const sMonth = pDate.getMonth()
        const maxDays = new Date(sYear, sMonth + 1, 0).getDate()
        const d = Math.min(sClosing, maxDays)
        return new Date(sYear, sMonth, d, 0, 0, 0, 0)
      }
    }
  }

  // Check 4 consecutive cycle windows around testDate
  const windows = [
    { y: year, m: month - 1 },
    { y: year, m: month },
    { y: year, m: month + 1 },
    { y: year, m: month + 2 }
  ].map(({ y, m }) => {
    const payment = getPaymentDate(y, m)
    const statement = getClosingDate(payment)
    return { statement, payment }
  })

  // Gap window is active if testDate is between statement closing date and payment date (inclusive)
  const activeWindow = windows.find(w => testDate >= w.statement && testDate <= w.payment)
  
  // Find current or upcoming cycle for display info
  const upcomingWindow = windows.find(w => testDate <= w.payment) || windows[windows.length - 1]

  const closingDayNum = upcomingWindow.statement.getDate()

  // Active spending cycle dates: payments on or before closing date count towards that statement,
  // while spending from the next day forward rolls into the active cycle.
  let cycleStartDate = null
  let cycleEndDate = null

  if (activeWindow) {
    const activeIndex = windows.indexOf(activeWindow)
    cycleStartDate = new Date(activeWindow.statement.getFullYear(), activeWindow.statement.getMonth(), activeWindow.statement.getDate() + 1)
    const nextWindow = windows[activeIndex + 1]
    cycleEndDate = nextWindow ? nextWindow.statement : null
  } else {
    const upcomingIndex = windows.indexOf(upcomingWindow)
    const prevWindow = upcomingIndex > 0 ? windows[upcomingIndex - 1] : null
    cycleStartDate = prevWindow ? new Date(prevWindow.statement.getFullYear(), prevWindow.statement.getMonth(), prevWindow.statement.getDate() + 1) : null
    cycleEndDate = upcomingWindow.statement
  }

  return {
    isGapActive: Boolean(activeWindow),
    activeWindow: activeWindow || null,
    closingDateFormatted: upcomingWindow.statement.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    paymentDateFormatted: upcomingWindow.payment.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    cycleStartFormatted: cycleStartDate ? cycleStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null,
    cycleEndFormatted: cycleEndDate ? cycleEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null,
    closingDayNumber: closingDayNum,
  }
}

/**
 * Backwards-compatible helper for isStatementGapActive
 */
export function isStatementGapActive(closingDayOrOpts = 19, paymentDueDay = 1, testDate = new Date()) {
  if (typeof closingDayOrOpts === 'object') {
    return evaluateStatementGap(closingDayOrOpts).isGapActive
  }
  return evaluateStatementGap({
    statementDateType: 'FIXED_DAY',
    statementClosingDay: closingDayOrOpts,
    paymentDueDay,
    testDate
  }).isGapActive
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
  const primaryGap = evaluateStatementGap({
    statementDateType: config?.statementDateType || 'FIXED_DAY',
    statementClosingDay: config?.statementClosingDay ?? 19,
    statementDaysBeforePayment: config?.statementDaysBeforePayment ?? 14,
    paymentDueDay: config?.paymentDueDay ?? 1,
    testDate: now
  })

  let primaryData = {
    isConnected: Boolean(config?.primaryAccessToken && config?.primaryRefreshToken),
    cardAccountId: config?.primaryCardAccountId || null,
    cardDisplayName: config?.primaryCardDisplayName || 'Primary Card',
    cardholderName: config?.primaryCardholderName || null,
    rawBalance: config?.primaryLastKnownBalance || 0,
    statementDateType: config?.statementDateType || 'FIXED_DAY',
    statementDaysBeforePayment: config?.statementDaysBeforePayment ?? 14,
    statementClosingDay: config?.statementDateType === 'DAYS_BEFORE_PAYMENT' ? primaryGap.closingDayNumber : (config?.statementClosingDay ?? 19),
    closingDateFormatted: primaryGap.closingDateFormatted,
    paymentDateFormatted: primaryGap.paymentDateFormatted,
    cycleStartFormatted: primaryGap.cycleStartFormatted,
    cycleEndFormatted: primaryGap.cycleEndFormatted,
    paymentDueDay: config?.paymentDueDay ?? 1,
    lastStatementAmount: config?.lastStatementAmount || 0,
    isGapActive: primaryGap.isGapActive,
    gapDeduction: primaryGap.isGapActive ? (config?.lastStatementAmount || 0) : 0,
    activeCycleSpend: Math.max(0, (config?.primaryLastKnownBalance || 0) - (primaryGap.isGapActive ? (config?.lastStatementAmount || 0) : 0)),
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
          primaryData.activeCycleSpend = Math.max(0, bal.current - primaryData.gapDeduction)
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

  // 2. Personal Secondary Card
  const secondaryGap = evaluateStatementGap({
    statementDateType: config?.secondaryStatementDateType || 'FIXED_DAY',
    statementClosingDay: config?.secondaryStatementClosingDay ?? 19,
    statementDaysBeforePayment: config?.secondaryStatementDaysBeforePayment ?? 14,
    paymentDueDay: config?.secondaryPaymentDueDay ?? 1,
    testDate: now
  })

  let secondaryData = {
    isConnected: Boolean((config?.secondaryAccessToken && config?.secondaryRefreshToken) || (config?.secondaryCardAccountId && config?.primaryAccessToken)),
    cardAccountId: config?.secondaryCardAccountId || null,
    cardDisplayName: config?.secondaryCardDisplayName || 'Secondary Card',
    cardholderName: config?.secondaryCardholderName || null,
    rawBalance: config?.secondaryLastKnownBalance || 0,
    statementDateType: config?.secondaryStatementDateType || 'FIXED_DAY',
    statementDaysBeforePayment: config?.secondaryStatementDaysBeforePayment ?? 14,
    statementClosingDay: config?.secondaryStatementDateType === 'DAYS_BEFORE_PAYMENT' ? secondaryGap.closingDayNumber : (config?.secondaryStatementClosingDay ?? 19),
    closingDateFormatted: secondaryGap.closingDateFormatted,
    paymentDateFormatted: secondaryGap.paymentDateFormatted,
    cycleStartFormatted: secondaryGap.cycleStartFormatted,
    cycleEndFormatted: secondaryGap.cycleEndFormatted,
    paymentDueDay: config?.secondaryPaymentDueDay ?? 1,
    lastStatementAmount: config?.secondaryLastStatementAmount || 0,
    isGapActive: secondaryGap.isGapActive,
    gapDeduction: secondaryGap.isGapActive ? (config?.secondaryLastStatementAmount || 0) : 0,
    activeCycleSpend: Math.max(0, (config?.secondaryLastKnownBalance || 0) - (secondaryGap.isGapActive ? (config?.secondaryLastStatementAmount || 0) : 0)),
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
          secondaryData.activeCycleSpend = Math.max(0, bal2.current - secondaryData.gapDeduction)
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

  return {
    primaryCard: primaryData,
    secondaryCard: secondaryData,
    totalLiveCardSpend: primaryData.activeCycleSpend + secondaryData.activeCycleSpend,
    lastSyncAt: now
  }
}

