import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Corganiser <noreply@corganiser.co.uk>'

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(amount || 0)
}

/**
 * Sends a reminder email on the 18th to the family lead to check all food shops are logged
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
 * Sends the final settlement breakdown email to family members
 */
export async function sendMonthlySettlementEmail({
  recipients,
  exportName,
  partnerStatementAmount,
  shops = [],
  partnerOwesForMyShops,
  iOweForPartnerShops,
  finalAmountPartnerOwes,
  primaryName = 'Primary Cardholder',
  partnerName = 'Partner',
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
        const owesLabel = shop.payerName === primaryName ? `${partnerName} Owes` : `${primaryName} Owes`
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

  const isPartnerOwing = (finalAmountPartnerOwes || 0) >= 0
  const heroLabel = isPartnerOwing ? `Final Amount ${partnerName} Owes` : `Final Amount ${primaryName} Owes`
  const heroValue = formatCurrency(Math.abs(finalAmountPartnerOwes || 0))

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
      <div class="hero-label">${heroLabel}</div>
      <div class="hero-value">${heroValue}</div>
    </div>

    <div class="breakdown-box">
      <table style="width: 100%; margin: 0;">
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; font-size: 13px;">${partnerName}'s Statement Amount</td>
          <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #ffffff; text-align: right;">${formatCurrency(partnerStatementAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #94a3b8; font-size: 13px;">${partnerName} owes for ${primaryName}'s shops</td>
          <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #34d399; text-align: right;">+${formatCurrency(partnerOwesForMyShops)}</td>
        </tr>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.08);">
          <td style="padding: 6px 0; color: #94a3b8; font-size: 13px;">${primaryName} owes for ${partnerName}'s shops</td>
          <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #f87171; text-align: right;">-${formatCurrency(iOweForPartnerShops)}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0 4px; color: #ffffff; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Total Settlement</td>
          <td style="padding: 10px 0 4px; font-family: monospace; font-weight: 900; font-size: 16px; color: #60a5fa; text-align: right;">${heroValue}</td>
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

/**
 * Sends a comprehensive 28th Monthly Financial Summary email to a user
 */
export async function sendMonthlyFinancialSummaryEmail({
  recipientEmail,
  recipientName,
  monthName,
  creditCardSummary = {},
  cashFlowSummary = {},
  debtSummary = {},
}) {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY is not configured; skipping email')
    return { success: false, reason: 'missing_api_key' }
  }

  const subject = `Financial Summary: ${monthName} Month-End & Budget Overview`

  const {
    hasCardData = false,
    primaryCardName = 'Primary Card',
    primaryStatementAmount = 0,
    primaryClosingDate = null,
    secondaryCardName = 'Secondary Card',
    secondaryStatementAmount = 0,
    secondaryClosingDate = null,
    totalStatementDue = 0,
    fixedCardBills = 0,
    netDiscretionarySpend = 0,
    manualSecondarySpend = 0,
    totalDiscretionarySpend = 0,
    allowance = 0,
    isOnBudget = true,
    varianceAmount = 0,
    paymentDueDate = '1st of next month',
  } = creditCardSummary

  const {
    totalIncome = 0,
    myShareOfBills = 0,
    monthlyExpenses = 0,
    debtMonthlyPayments = 0,
    leftoverBudget = 0,
  } = cashFlowSummary

  const {
    hasDebts = false,
    totalPortfolioDebt = 0,
    monthlyDebtPayment = 0,
    paidOffLastMonth = 0,
    activeAccountsCount = 0,
  } = debtSummary

  const leftoverColor = leftoverBudget >= 0 ? '#34d399' : '#f87171'
  const leftoverLabel = leftoverBudget >= 0 ? 'Monthly Leftover Budget' : 'Monthly Deficit'

  // Credit Card Hero Banner
  let cardStatusBadge = ''
  let cardHeroHtml = ''
  if (hasCardData) {
    if (allowance > 0) {
      if (isOnBudget) {
        cardStatusBadge = `<span style="display: inline-block; background-color: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 9999px;">On Budget</span>`
        cardHeroHtml = `
          <div style="background: linear-gradient(135deg, rgba(6, 78, 59, 0.35), rgba(16, 185, 129, 0.15)); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 14px; padding: 18px 20px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #6ee7b7; margin-bottom: 4px;">Statement Period Budget Performance</div>
            <div style="font-size: 28px; font-weight: 900; color: #34d399; font-family: monospace;">✓ On Budget</div>
            <div style="font-size: 13px; color: #cbd5e1; margin-top: 6px;">
              ${formatCurrency(totalDiscretionarySpend)} spent of ${formatCurrency(allowance)} allowance (${formatCurrency(varianceAmount)} remaining buffer)
            </div>
          </div>
        `
      } else {
        cardStatusBadge = `<span style="display: inline-block; background-color: rgba(239, 68, 68, 0.2); color: #f87171; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 9999px;">Over Budget</span>`
        cardHeroHtml = `
          <div style="background: linear-gradient(135deg, rgba(127, 29, 29, 0.35), rgba(239, 68, 68, 0.15)); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 14px; padding: 18px 20px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #fca5a5; margin-bottom: 4px;">Statement Period Budget Performance</div>
            <div style="font-size: 28px; font-weight: 900; color: #f87171; font-family: monospace;">⚠️ Over Budget by ${formatCurrency(varianceAmount)}</div>
            <div style="font-size: 13px; color: #cbd5e1; margin-top: 6px;">
              ${formatCurrency(totalDiscretionarySpend)} spent vs ${formatCurrency(allowance)} allowance
            </div>
          </div>
        `
      }
    } else {
      cardHeroHtml = `
        <div style="background: linear-gradient(135deg, rgba(30, 58, 138, 0.35), rgba(59, 130, 246, 0.15)); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 14px; padding: 18px 20px; margin-bottom: 20px; text-align: center;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #93c5fd; margin-bottom: 4px;">Total Closed Statement Due</div>
          <div style="font-size: 28px; font-weight: 900; color: #60a5fa; font-family: monospace;">${formatCurrency(totalStatementDue)}</div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Awaiting Direct Debit on ${paymentDueDate}</div>
        </div>
      `
    }
  }

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
    .subtitle { color: #94a3b8; font-size: 13px; margin: 0 0 24px; line-height: 1.5; }
    
    .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin: 28px 0 12px; display: flex; align-items: center; justify-content: space-between; }
    .box { background-color: rgba(15, 23, 42, 0.6); border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); padding: 18px 20px; margin-bottom: 20px; }
    
    table { width: 100%; border-collapse: collapse; }
    td { padding: 7px 0; font-size: 13px; }
    .label-td { color: #94a3b8; }
    .value-td { text-align: right; font-family: monospace; font-weight: 600; color: #ffffff; }
    .divider-tr { border-top: 1px solid rgba(255,255,255,0.08); }
    
    .cashflow-grid { width: 100%; margin-top: 12px; }
    .cashflow-cell { background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 12px 14px; }
    .cf-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 4px; }
    .cf-value { font-size: 16px; font-weight: 800; font-family: monospace; color: #f8fafc; }
    
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Monthly Financial Summary</div>
    <h1>${monthName} Summary</h1>
    <p class="subtitle">
      Hi ${recipientName || 'there'}, here is your personal financial overview for <strong>${monthName}</strong>, sent ahead of month-end and scheduled direct debits.
    </p>

    <!-- 1. Top of Page Cash Flow Overview -->
    <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8)); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px 24px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px;">
        <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8;">${leftoverLabel}</span>
        <span style="font-size: 28px; font-weight: 900; color: ${leftoverColor}; font-family: monospace;">${formatCurrency(leftoverBudget)}</span>
      </div>
      <table style="width: 100%;">
        <tr>
          <td class="label-td">Total Monthly Income</td>
          <td class="value-td" style="color: #34d399;">+${formatCurrency(totalIncome)}</td>
        </tr>
        <tr>
          <td class="label-td">Share of Household Bills</td>
          <td class="value-td" style="color: #fbbf24;">-${formatCurrency(myShareOfBills)}</td>
        </tr>
        <tr>
          <td class="label-td">Personal Monthly Expenses</td>
          <td class="value-td" style="color: #fbbf24;">-${formatCurrency(monthlyExpenses)}</td>
        </tr>
        <tr>
          <td class="label-td">Debt Monthly Payments</td>
          <td class="value-td" style="color: #f87171;">-${formatCurrency(debtMonthlyPayments)}</td>
        </tr>
      </table>
    </div>

    <!-- 2. Closed Credit Card Statements & Budget Performance -->
    <div class="section-title">
      <span>Credit Card Budget (Closed Period)</span>
      ${cardStatusBadge}
    </div>

    ${cardHeroHtml}

    ${hasCardData ? `
    <div class="box">
      <table>
        <tr>
          <td class="label-td">${primaryCardName} ${primaryClosingDate ? `(${primaryClosingDate})` : ''}</td>
          <td class="value-td">${formatCurrency(primaryStatementAmount)}</td>
        </tr>
        ${secondaryStatementAmount > 0 || secondaryCardName ? `
        <tr>
          <td class="label-td">${secondaryCardName} ${secondaryClosingDate ? `(${secondaryClosingDate})` : ''}</td>
          <td class="value-td">${formatCurrency(secondaryStatementAmount)}</td>
        </tr>
        ` : ''}
        <tr class="divider-tr">
          <td class="label-td" style="font-weight: 700; color: #cbd5e1;">Total Closed Statement Due</td>
          <td class="value-td" style="font-weight: 800; color: #60a5fa;">${formatCurrency(totalStatementDue)}</td>
        </tr>
        <tr>
          <td class="label-td" style="padding-left: 8px; font-size: 12px; color: #64748b;">Less Fixed Card Bills & Expenses</td>
          <td class="value-td" style="font-size: 12px; color: #94a3b8;">-${formatCurrency(fixedCardBills)}</td>
        </tr>
        ${manualSecondarySpend > 0 ? `
        <tr>
          <td class="label-td" style="padding-left: 8px; font-size: 12px; color: #64748b;">Manual Secondary Card Payments</td>
          <td class="value-td" style="font-size: 12px; color: #94a3b8;">+${formatCurrency(manualSecondarySpend)}</td>
        </tr>
        ` : ''}
        <tr class="divider-tr">
          <td class="label-td" style="font-weight: 700; color: #ffffff;">Discretionary Spend Charged to Allowance</td>
          <td class="value-td" style="font-weight: 900; color: ${isOnBudget ? '#34d399' : '#f87171'}; font-size: 15px;">
            ${formatCurrency(totalDiscretionarySpend)}
          </td>
        </tr>
        ${allowance > 0 ? `
        <tr>
          <td class="label-td">Budget Allowance Ceiling</td>
          <td class="value-td">${formatCurrency(allowance)}</td>
        </tr>
        <tr>
          <td class="label-td" style="font-weight: 700; color: ${isOnBudget ? '#34d399' : '#f87171'};">
            ${isOnBudget ? 'Remaining Buffer' : 'Budget Overspend'}
          </td>
          <td class="value-td" style="font-weight: 800; color: ${isOnBudget ? '#34d399' : '#f87171'};">
            ${isOnBudget ? '+' : '-'}${formatCurrency(varianceAmount)}
          </td>
        </tr>
        ` : ''}
      </table>
      <div style="margin-top: 12px; font-size: 11px; color: #64748b; line-height: 1.4;">
        * Closed statement figures reflect balances generated at statement close awaiting scheduled payment on <strong>${paymentDueDate}</strong>. Fresh purchases made since closing are tracked in your live cycle for next month.
      </div>
    </div>
    ` : `
    <div class="box" style="text-align: center; color: #64748b; font-size: 13px;">
      No credit card connection active.
    </div>
    `}

    <!-- 3. Debt Portfolio Overview (DebtFlow) -->
    <div class="section-title">
      <span>Debt Overview</span>
      ${hasDebts ? `<span style="font-size: 11px; color: #64748b; text-transform: none; font-weight: normal;">${activeAccountsCount} active ${activeAccountsCount === 1 ? 'account' : 'accounts'}</span>` : ''}
    </div>

    ${hasDebts ? `
    <div class="box">
      <table>
        <tr>
          <td class="label-td">Total Portfolio Debt Outstanding</td>
          <td class="value-td" style="font-weight: 800; font-size: 15px; color: #f87171;">${formatCurrency(totalPortfolioDebt)}</td>
        </tr>
        <tr>
          <td class="label-td">Monthly Payment (Due this month)</td>
          <td class="value-td" style="color: #fbbf24;">${formatCurrency(monthlyDebtPayment)}</td>
        </tr>
        <tr>
          <td class="label-td">Debt Payments Made Last Month</td>
          <td class="value-td" style="color: #34d399;">${formatCurrency(paidOffLastMonth)}</td>
        </tr>
      </table>
    </div>
    ` : `
    <div class="box" style="text-align: center; color: #34d399; font-size: 13px; font-weight: 600;">
      🎉 Debt-free! No outstanding debt accounts.
    </div>
    `}

    <div class="footer">
      Sent automatically on the 28th of every month by Corganiser.<br/>
      Review live tracking and details anytime in your Corganiser dashboard.
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

