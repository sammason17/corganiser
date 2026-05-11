export const MAX_SIMULATION_MONTHS = 600; // 50 years sanity check

export function calculateCurrentState(card) {
  // Initial state
  const initialTransferTotal = card.balanceTransfers.reduce((sum, bt) => sum + bt.amount, 0);
  let aprBalance = Math.max(0, card.totalDebt - initialTransferTotal);
  
  let activeTransfers = card.balanceTransfers.map(bt => ({
    ...bt,
    currentBalance: bt.amount,
    endDate: new Date(bt.endDate)
  }));

  let currentMonthlyPayment = card.monthlyPayment;

  // Set base date (defaulting missing or old dates to April 30, 2026)
  let baseDate = new Date(card.updatedAt || card.createdAt || '2026-04-30T00:00:00Z');
  const defaultDate = new Date('2026-04-30T00:00:00Z');
  if (baseDate < defaultDate) baseDate = defaultDate;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let simulationDate = new Date(baseDate);
  simulationDate.setHours(0, 0, 0, 0);

  const dailyRate = (card.apr / 100) / 365;
  let uncapitalizedInterest = 0;

  const paymentDay = card.paymentDate || 1;
  const statementDay = card.statementDate || paymentDay;

  while (simulationDate <= today) {
    // 1. Process expired transfers
    const expired = activeTransfers.filter(t => simulationDate >= t.endDate && t.currentBalance > 0);
    expired.forEach(t => {
      aprBalance += t.currentBalance;
      t.currentBalance = 0;
      if (t.postOfferPayment && t.postOfferPayment > currentMonthlyPayment) {
        currentMonthlyPayment = t.postOfferPayment;
      }
    });
    activeTransfers = activeTransfers.filter(t => simulationDate < t.endDate || t.currentBalance > 0);

    // 2. Accrue Daily Interest
    uncapitalizedInterest += aprBalance * dailyRate;

    const simYear = simulationDate.getFullYear();
    const simMonth = simulationDate.getMonth();
    const lastDayOfMonth = new Date(simYear, simMonth + 1, 0).getDate();

    // 3. Payment Date?
    if (simulationDate.getDate() === Math.min(paymentDay, lastDayOfMonth)) {
      let paymentRemaining = currentMonthlyPayment;
      
      while (paymentRemaining > 0 && (aprBalance > 0 || activeTransfers.some(t => t.currentBalance > 0))) {
        let targetPot = null;
        if (aprBalance > 0) {
          targetPot = { type: 'apr', balance: aprBalance, id: 'apr' };
        } else {
          const transfers = activeTransfers.filter(t => t.currentBalance > 0).sort((a, b) => b.currentBalance - a.currentBalance);
          if (transfers.length > 0) {
            targetPot = { type: 'transfer', balance: transfers[0].currentBalance, id: transfers[0].id };
          }
        }

        if (!targetPot) break;

        const amountToPay = Math.min(targetPot.balance, paymentRemaining);
        
        if (targetPot.type === 'apr') {
          aprBalance -= amountToPay;
        } else {
          const transfer = activeTransfers.find(t => t.id === targetPot.id);
          if (transfer) transfer.currentBalance -= amountToPay;
        }
        
        paymentRemaining -= amountToPay;
      }
    }

    // 4. Statement Date?
    if (simulationDate.getDate() === Math.min(statementDay, lastDayOfMonth)) {
      aprBalance += uncapitalizedInterest;
      uncapitalizedInterest = 0;

      // Post BT logic if all BTs are paid off
      if (activeTransfers.every(t => t.currentBalance <= 0) && card.balanceTransfers.length > 0) {
        const maxPostOffer = Math.max(...card.balanceTransfers.map(t => Number(t.postOfferPayment) || 0));
        if (maxPostOffer > currentMonthlyPayment) {
          currentMonthlyPayment = maxPostOffer;
        }
      }
    }

    simulationDate.setDate(simulationDate.getDate() + 1);
  }

  const totalRemaining = aprBalance + activeTransfers.reduce((sum, t) => sum + t.currentBalance, 0);

  return {
    ...card,
    calculatedTotalDebt: Math.max(0, totalRemaining),
    calculatedAprBalance: Math.max(0, aprBalance),
    calculatedTransfers: activeTransfers,
    calculatedMonthlyPayment: currentMonthlyPayment,
    uncapitalizedInterest
  };
}

export function simulatePayoff(currentState) {
  const steps = [];
  let currentMonth = 0;
  let totalInterest = 0;
  
  let aprBalance = currentState.calculatedAprBalance;
  let activeTransfers = currentState.calculatedTransfers.map(t => ({ ...t, endDate: new Date(t.endDate) }));
  let currentMonthlyPayment = currentState.calculatedMonthlyPayment;

  const card = currentState; 
  let uncapitalizedInterest = currentState.uncapitalizedInterest || 0;
  const dailyRate = (card.apr / 100) / 365;

  let simulationDate = new Date();
  simulationDate.setHours(0, 0, 0, 0);
  
  const paymentDay = card.paymentDate || 1;
  const statementDay = card.statementDate || paymentDay;

  let daysSimulated = 0;
  const MAX_DAYS = MAX_SIMULATION_MONTHS * 31;
  let monthlyPaymentApplied = 0;

  while ((aprBalance > 0 || activeTransfers.some(t => t.currentBalance > 0) || uncapitalizedInterest > 0) && daysSimulated < MAX_DAYS) {
    
    // Process expired transfers
    const expired = activeTransfers.filter(t => simulationDate >= t.endDate && t.currentBalance > 0);
    expired.forEach(t => {
      aprBalance += t.currentBalance;
      t.currentBalance = 0;
      if (t.postOfferPayment && t.postOfferPayment > currentMonthlyPayment) {
        currentMonthlyPayment = t.postOfferPayment;
      }
    });
    activeTransfers = activeTransfers.filter(t => simulationDate < t.endDate || t.currentBalance > 0);

    // Accrue Daily Interest
    uncapitalizedInterest += aprBalance * dailyRate;

    const simYear = simulationDate.getFullYear();
    const simMonth = simulationDate.getMonth();
    const lastDayOfMonth = new Date(simYear, simMonth + 1, 0).getDate();

    // Payment Date?
    if (simulationDate.getDate() === Math.min(paymentDay, lastDayOfMonth)) {
      let paymentRemaining = currentMonthlyPayment;
      
      while (paymentRemaining > 0 && (aprBalance > 0 || activeTransfers.some(t => t.currentBalance > 0))) {
        let targetPot = null;
        if (aprBalance > 0) {
          targetPot = { type: 'apr', balance: aprBalance, id: 'apr' };
        } else {
          const transfers = activeTransfers.filter(t => t.currentBalance > 0).sort((a, b) => b.currentBalance - a.currentBalance);
          if (transfers.length > 0) {
            targetPot = { type: 'transfer', balance: transfers[0].currentBalance, id: transfers[0].id };
          }
        }

        if (!targetPot) break;

        const amountToPay = Math.min(targetPot.balance, paymentRemaining);
        
        if (targetPot.type === 'apr') {
          aprBalance -= amountToPay;
        } else {
          const transfer = activeTransfers.find(t => t.id === targetPot.id);
          if (transfer) transfer.currentBalance -= amountToPay;
        }
        
        paymentRemaining -= amountToPay;
        monthlyPaymentApplied += amountToPay;
      }
    }

    // Statement Date?
    if (simulationDate.getDate() === Math.min(statementDay, lastDayOfMonth)) {
      aprBalance += uncapitalizedInterest;
      totalInterest += uncapitalizedInterest;
      
      let interestChargedThisMonth = uncapitalizedInterest;
      uncapitalizedInterest = 0;

      // Post BT logic
      if (activeTransfers.every(t => t.currentBalance <= 0) && card.balanceTransfers.length > 0) {
        const maxPostOffer = Math.max(...card.balanceTransfers.map(t => Number(t.postOfferPayment) || 0));
        if (maxPostOffer > currentMonthlyPayment) {
          currentMonthlyPayment = maxPostOffer;
        }
      }

      currentMonth++;
      const totalRemaining = aprBalance + activeTransfers.reduce((sum, t) => sum + t.currentBalance, 0);

      steps.push({
        month: currentMonth,
        date: new Date(simulationDate),
        totalRemaining: Math.max(0, totalRemaining),
        interestCharged: interestChargedThisMonth,
        paymentApplied: monthlyPaymentApplied,
        aprBalance,
        transferBalances: activeTransfers.map(t => t.currentBalance)
      });

      monthlyPaymentApplied = 0;

      // Safety check
      if (aprBalance > 0 && currentMonthlyPayment <= interestChargedThisMonth && currentMonth > 100) {
         return { steps, totalInterest, payoffDate: null, monthsToPayoff: currentMonth, isInfinite: true };
      }

      if (totalRemaining <= 0 && uncapitalizedInterest <= 0) break;
    }

    simulationDate.setDate(simulationDate.getDate() + 1);
    daysSimulated++;
  }

  return {
    steps,
    totalInterest,
    payoffDate: currentMonth < MAX_SIMULATION_MONTHS ? simulationDate : null,
    monthsToPayoff: currentMonth,
    isInfinite: currentMonth >= MAX_SIMULATION_MONTHS || daysSimulated >= MAX_DAYS
  };
}
