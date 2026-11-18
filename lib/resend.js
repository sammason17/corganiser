import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Corganiser <sam@goardr.com>'

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(amount || 0)
}

/**
 * Sends a reminder email on the 18th to Sam to check all food shops are logged
 */
export async function sendPrecheckReminderEmail({ recipientEmail, recipientName, monthName }) {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY is not configured; skipping email')
    return { success: false, reason: 'missing_api_key' }
  }

  const subject = `Action Needed: Credit Card Statement Closes Tomorrow (${monthName})`
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .card { background-color: #1e293b; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); max-width: 600px; margin: 0 auto; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .badge { display: inline-block; background-color: rgba(59, 130, 246, 0.2); color: #60a5fa; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 6px; margin-bottom: 12px; }
    h1 { margin: 0 0 16px; font-size: 22px; font-weight: 800; color: #ffffff; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
    .box { background-color: rgba(15, 23, 42, 0.6); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); padding: 16px; margin: 20px 0; }
    .box-title { color: #cbd5e1; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
    .box-desc { color: #64748b; font-size: 12px; margin: 0; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Pre-Statement Reminder</div>
    <h1>Hi ${recipientName || 'there'},</h1>
    <p>Your shared credit card statement period closes tomorrow on the <strong>19th</strong>.</p>
    <div class="box">
      <div class="box-title">📋 Please review shared expenses</div>
      <p class="box-desc">Make sure all shared grocery and food shops for <strong>${monthName}</strong> have been recorded in Corganiser before the automatic statement cycle runs.</p>
    </div>
    <p>Once your card provider generates the closed statement, Corganiser will automatically retrieve the statement amount, compute the final settlement, archive the month, and email both of you with the summary breakdown.</p>
    <div class="footer">
      Sent automatically by Corganiser
    </div>
  </div>
</body>
</html>
`

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      subject,
      html,
    })
    if (error) {
      console.error('[Resend Error]', error)
      return { success: false, error }
    }
    return { success: true, data }
  } catch (err) {
    console.error('[Resend Exception]', err)
    return { success: false, error: err.message }
  }
}

/**
 * Sends the final settlement breakdown email to both Sam and Lauren
 */
export async function sendMonthlySettlementEmail({
  recipients,
  exportName,
  partnerStatementAmount,
  shops = [],
  partnerOwesForMyShops,
  iOweForPartnerShops,
  finalAmountPartnerOwes,
  isOverride = false,
  overrideReason = null,
}) {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY is not configured; skipping email')
    return { success: false, reason: 'missing_api_key' }
  }

  const subject = isOverride
    ? `[AMENDED] Credit Card Settlement Summary — ${exportName}`
    : `Credit Card Settlement Summary — ${exportName}`

  const shopsRowsHtml = shops.length > 0
    ? shops.map(shop => {
        const remainder = shop.totalAmount - shop.payerCoveredAmount
        const owesLabel = shop.payerName === 'Sam' ? 'Lauren Owes' : 'Sam Owes'
        return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
          <td style="padding: 10px 8px; font-size: 13px; color: #f1f5f9;">${shop.vendorName}</td>
          <td style="padding: 10px 8px; font-size: 13px; color: #94a3b8; font-family: monospace;">${formatCurrency(shop.totalAmount)}</td>
          <td style="padding: 10px 8px; font-size: 13px; color: #60a5fa;">${shop.payerName}</td>
          <td style="padding: 10px 8px; font-size: 13px; color: #34d399; font-weight: 700; font-family: monospace; text-align: right;">
            ${formatCurrency(remainder)} <span style="font-size: 10px; color: #64748b; font-weight: normal;">(${owesLabel})</span>
          </td>
        </tr>
      `
      }).join('')
    : `<tr><td colspan="4" style="padding: 16px; text-align: center; color: #64748b; font-size: 13px;">No shared shops recorded this month.</td></tr>`

  const badgeHtml = isOverride
    ? `<div class="badge" style="background-color: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);">Amended Settlement • Manual Override</div>`
    : `<div class="badge">Credit Card Settlement</div>`

  const titleHtml = isOverride ? `Credit Card Settlement (Amended) — ${exportName}` : `Credit Card Settlement — ${exportName}`
  const subtitleHtml = isOverride
    ? `This statement total was manually adjusted and recalculated due to an incorrect statement amount.`
    : `This month's shared credit card settlement has been automatically calculated, archived, and reset.`

  const overrideNoticeHtml = isOverride
    ? `
    <div style="background-color: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 14px; padding: 16px 20px; margin-bottom: 24px;">
      <div style="color: #fbbf24; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
        ⚠️ Manual Override Statement Notice
      </div>
      <p style="color: #fef3c7; font-size: 13px; line-height: 1.5; margin: 0;">
        This statement has been updated via a <strong>manual override</strong> due to an incorrect statement amount${overrideReason ? `: <em>"${overrideReason}"</em>` : '.'} The recalculated figures below reflect the corrected final settlement.
      </p>
    </div>
`
    : ''

  const footerHtml = isOverride
    ? `Updated export archive: <strong>${exportName}</strong><br/>This updated summary was dispatched following a manual override in Corganiser.`
    : `Archived to export: <strong>${exportName}</strong><br/>Corganiser has been cleared and reset for the new month.`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .card { background-color: #1e293b; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); max-width: 620px; margin: 0 auto; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
    .badge { display: inline-block; background-color: rgba(96, 165, 250, 0.15); color: #60a5fa; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; padding: 5px 12px; border-radius: 9999px; margin-bottom: 12px; }
    h1 { margin: 0 0 6px; font-size: 24px; font-weight: 900; color: #ffffff; }
    .subtitle { color: #94a3b8; font-size: 13px; margin: 0 0 24px; }
    
    .hero-card { background: linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(59, 130, 246, 0.2)); border: 1px solid rgba(96, 165, 250, 0.3); border-radius: 16px; padding: 20px 24px; margin-bottom: 24px; text-align: center; }
    .hero-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #93c5fd; margin-bottom: 6px; }
    .hero-value { font-size: 36px; font-weight: 900; color: #ffffff; font-family: monospace; }
    
    .breakdown-box { background-color: rgba(15, 23, 42, 0.6); border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); padding: 18px 20px; margin-bottom: 28px; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    
    .footer { text-align: center; margin-top: 28px; font-size: 12px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    ${badgeHtml}
    <h1>${titleHtml}</h1>
    <p class="subtitle">${subtitleHtml}</p>
    
    ${overrideNoticeHtml}

    <div class="hero-card">
      <div class="hero-label">Final Amount Lauren Owes</div>
      <div class="hero-value">${formatCurrency(finalAmountPartnerOwes)}</div>
    </div>

    <div class="breakdown-box">
      <table style="width: 100%; margin: 0;">
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; font-size: 13px;">Lauren's Statement Amount</td>
          <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #ffffff; text-align: right;">${formatCurrency(partnerStatementAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; font-size: 13px;">Lauren owes for Sam's shops</td>
          <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #34d399; text-align: right;">+${formatCurrency(partnerOwesForMyShops)}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
          <td style="padding: 6px 0; color: #94a3b8; font-size: 13px;">Sam owes for Lauren's shops</td>
          <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #f87171; text-align: right;">-${formatCurrency(iOweForPartnerShops)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0 4px; color: #ffffff; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Total Settlement</td>
          <td style="padding: 10px 0 4px; font-family: monospace; font-weight: 900; font-size: 16px; color: #60a5fa; text-align: right;">${formatCurrency(finalAmountPartnerOwes)}</td>
        </tr>
      </table>
    </div>

    <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin: 0 0 10px;">Itemized Shared Shops (${shops.length})</h3>
    <table>
      <thead>
        <tr>
          <th>Vendor</th>
          <th>Total</th>
          <th>Paid By</th>
          <th style="text-align: right;">Split</th>
        </tr>
      </thead>
      <tbody>
        ${shopsRowsHtml}
      </tbody>
    </table>

    <div class="footer">
      ${footerHtml}
    </div>
  </div>
</body>
</html>
`

  try {
    const toRecipients = Array.isArray(recipients) ? recipients : [recipients]
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toRecipients,
      subject,
      html,
    })

    if (error) {
      console.error('[Resend Error]', error)
      return { success: false, error }
    }
    return { success: true, data }
  } catch (err) {
    console.error('[Resend Exception]', err)
    return { success: false, error: err.message }
  }
}
