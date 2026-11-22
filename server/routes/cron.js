import express from 'express'
import { run18thPrecheckReminder, checkAndRunStatementSettlement } from '../../lib/settlementAutomation.js'
import { run28thMonthlyFinancialSummary } from '../../lib/financialSummaryAutomation.js'

const router = express.Router()

// Middleware to verify Vercel Cron Secret
function verifyCronSecret(req, res, next) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    // If no secret configured in dev, allow
    return next()
  }

  const authHeader = req.headers.authorization
  const querySecret = req.query.secret

  if (authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret) {
    return next()
  }

  // Vercel Cron also sends header 'x-vercel-cron': '1' in production
  // but validating CRON_SECRET ensures secure execution
  return res.status(401).json({ error: 'Unauthorized: Invalid cron secret' })
}

/**
 * GET /api/cron/precheck
 * Triggered on the 18th of each month to send pre-statement reminder to family lead
 */
router.get('/precheck', verifyCronSecret, async (req, res) => {
  try {
    const result = await run18thPrecheckReminder()
    res.json({ success: true, timestamp: new Date().toISOString(), result })
  } catch (err) {
    console.error('[Cron precheck Error]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/cron/settlement
 * Triggered on the 24th of each month to poll TrueLayer and settle the closed 20th-19th statement
 */
router.get('/settlement', verifyCronSecret, async (req, res) => {
  try {
    const result = await checkAndRunStatementSettlement()
    res.json({ success: true, timestamp: new Date().toISOString(), result })
  } catch (err) {
    console.error('[Cron settlement Error]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/cron/monthly-summary
 * Triggered on the 28th of each month to send personal financial summary ahead of month-end
 */
router.get('/monthly-summary', verifyCronSecret, async (req, res) => {
  try {
    const force = Boolean(req.query.force === 'true')
    const result = await run28thMonthlyFinancialSummary({ force })
    res.json({ success: true, timestamp: new Date().toISOString(), result })
  } catch (err) {
    console.error('[Cron monthly-summary Error]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router

