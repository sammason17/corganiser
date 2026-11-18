import express from 'express'
import { run18thPrecheckReminder, checkAndRunStatementSettlement } from '../../lib/settlementAutomation.js'

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
 * GET /api/cron/amex-precheck
 * Triggered on the 18th of each month to send pre-statement reminder to family lead
 */
router.get('/amex-precheck', verifyCronSecret, async (req, res) => {
  try {
    const result = await run18thPrecheckReminder()
    res.json({ success: true, timestamp: new Date().toISOString(), result })
  } catch (err) {
    console.error('[Cron amex-precheck Error]', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/cron/amex-settlement
 * Triggered on the 24th of each month to poll TrueLayer and settle the closed 20th-19th statement
 */
router.get('/amex-settlement', verifyCronSecret, async (req, res) => {
  try {
    const result = await checkAndRunStatementSettlement()
    res.json({ success: true, timestamp: new Date().toISOString(), result })
  } catch (err) {
    console.error('[Cron amex-settlement Error]', err)
    res.status(500).json({ error: err.message })
  }
})

export default router
