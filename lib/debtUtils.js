/**
 * Utility functions for Debt calculations on the server
 */
export const MAX_SIMULATION_MONTHS = 600

export function calculateCurrentState(card) {
  const initialTransferTotal = (card.balanceTransfers || []).reduce((sum, bt) => sum + (Number(bt.amount) || 0), 0)
  let aprBalance = Math.max(0, (Number(card.totalDebt) || 0) - initialTransferTotal)
  
  let activeTransfers = (card.balanceTransfers || []).map(bt => ({
    ...bt,
    currentBalance: Number(bt.amount) || 0,
    endDate: new Date(bt.endDate)
  }))

  let currentMonthlyPayment = Number(card.monthlyPayment) || 0

  // Set base date (defaulting missing or old dates to April 30, 2026)
  let baseDate = new Date(card.updatedAt || card.createdAt || '2026-04-30T00:00:00Z')
  const defaultDate = new Date('2026-04-30T00:00:00Z')
  if (baseDate < defaultDate) baseDate = defaultDate

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let simulationDate = new Date(baseDate)
  simulationDate.setHours(0, 0, 0, 0)

  const dailyRate = ((Number(card.apr) || 0) / 100) / 365
  let uncapitalizedInterest = 0

  const paymentDay = card.paymentDate || 1
  const statementDay = card.statementDate || paymentDay

  while (simulationDate <= today) {
    // 1. Process expired transfers
    const expired = activeTransfers.filter(t => simulationDate >= t.endDate && t.currentBalance > 0)
    expired.forEach(t => {
      aprBalance += t.currentBalance
      t.currentBalance = 0
      if (t.postOfferPayment && t.postOfferPayment > currentMonthlyPayment) {
        currentMonthlyPayment = t.postOfferPayment
      }
    })
    activeTransfers = activeTransfers.filter(t => simulationDate < t.endDate || t.currentBalance > 0)

    // 2. Accrue Daily Interest
    uncapitalizedInterest += aprBalance * dailyRate

    const simYear = simulationDate.getFullYear()
    const simMonth = simulationDate.getMonth()
    const lastDayOfMonth = new Date(simYear, simMonth + 1, 0).getDate()

    // 3. Payment Date?
    if (simulationDate.getDate() === Math.min(paymentDay, lastDayOfMonth)) {
      let paymentRemaining = currentMonthlyPayment
      
      while (paymentRemaining > 0 && (aprBalance > 0 || activeTransfers.some(t => t.currentBalance > 0))) {
        let targetPot = null
        if (aprBalance > 0) {
          targetPot = { type: 'apr', balance: aprBalance, id: 'apr' }
        } else {
          const transfers = activeTransfers.filter(t => t.currentBalance > 0).sort((a, b) => b.currentBalance - a.currentBalance)
          if (transfers.length > 0) {
            targetPot = { type: 'transfer', balance: transfers[0].currentBalance, id: transfers[0].id }
          }
        }

        if (!targetPot) break

        const amountToPay = Math.min(targetPot.balance, paymentRemaining)
        
        if (targetPot.type === 'apr') {
          aprBalance -= amountToPay
        } else {
          const transfer = activeTransfers.find(t => t.id === targetPot.id)
          if (transfer) transfer.currentBalance -= amountToPay
        }
        
        paymentRemaining -= amountToPay
      }
    }

    // 4. Statement Date?
    if (simulationDate.getDate() === Math.min(statementDay, lastDayOfMonth)) {
      aprBalance += uncapitalizedInterest
      uncapitalizedInterest = 0

      if (activeTransfers.every(t => t.currentBalance <= 0) && (card.balanceTransfers || []).length > 0) {
        const maxPostOffer = Math.max(...(card.balanceTransfers || []).map(t => Number(t.postOfferPayment) || 0))
        if (maxPostOffer > currentMonthlyPayment) {
          currentMonthlyPayment = maxPostOffer
        }
      }
    }

    simulationDate.setDate(simulationDate.getDate() + 1)
  }

  const totalRemaining = aprBalance + activeTransfers.reduce((sum, t) => sum + t.currentBalance, 0)

  return {
    ...card,
    calculatedTotalDebt: Math.max(0, totalRemaining),
    calculatedAprBalance: Math.max(0, aprBalance),
    calculatedTransfers: activeTransfers,
    calculatedMonthlyPayment: currentMonthlyPayment,
    uncapitalizedInterest
  }
}
