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
 * Gets a guaranteed valid access token from the database, refreshing if expired
 */
export async function getValidAccessToken(familyId = null) {
  let config = null
  if (familyId) {
    config = await prisma.cardAutomationConfig.findUnique({ where: { familyId } })
  }
  if (!config) {
    config = await prisma.cardAutomationConfig.findFirst({
      where: { accessToken: { not: null }, refreshToken: { not: null } }
    })
  }
  if (!config || !config.accessToken || !config.refreshToken) {
    return null
  }

  // Check if token expires within 5 minutes
  const now = new Date()
  const expiresAt = config.tokenExpiresAt ? new Date(config.tokenExpiresAt) : new Date(0)
  const isExpiringSoon = expiresAt.getTime() - now.getTime() < 5 * 60 * 1000

  if (!isExpiringSoon) {
    return { accessToken: config.accessToken, config }
  }

  // Refresh token
  try {
    const refreshed = await refreshAccessToken(config.refreshToken)
    const tokenExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000)

    const updated = await prisma.cardAutomationConfig.update({
      where: { id: config.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || config.refreshToken,
        tokenExpiresAt,
        lastSyncStatus: 'ACTIVE',
        lastSyncMessage: 'Token refreshed successfully'
      }
    })

    return { accessToken: updated.accessToken, config: updated }
  } catch (err) {
    console.error('[TrueLayer Token Refresh Error]', err)
    await prisma.cardAutomationConfig.update({
      where: { id: config.id },
      data: {
        lastSyncStatus: 'AUTH_ERROR',
        lastSyncMessage: `Failed to refresh token: ${err.message}`
      }
    })
    return null
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
