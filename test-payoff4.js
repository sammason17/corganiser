import { calculateCurrentState, simulatePayoff } from './client/src/lib/debtUtils.js';

const card = {
  totalDebt: 1409,
  apr: 28.67,
  monthlyPayment: 100,
  balanceTransfers: [],
  createdAt: new Date().toISOString(),
  paymentDate: 1,
  statementDate: 1
};

const currentState = calculateCurrentState(card);

// Mock simulatePayoff to test the fix
function simulatePayoffFixed(currentState) {
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
  const MAX_SIMULATION_MONTHS = 600;
  const MAX_DAYS = MAX_SIMULATION_MONTHS * 31;
  let monthlyPaymentApplied = 0;

  while ((aprBalance > 0.01 || activeTransfers.some(t => t.currentBalance > 0.01) || uncapitalizedInterest > 0.01) && daysSimulated < MAX_DAYS) {
    
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

      if (totalRemaining < 0.01 && uncapitalizedInterest < 0.01) break;
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

const resultFixed = simulatePayoffFixed(currentState);
console.log('Result monthsToPayoff:', resultFixed.monthsToPayoff);
console.log('Last step totalRemaining:', resultFixed.steps[resultFixed.steps.length - 1].totalRemaining);
