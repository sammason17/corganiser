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
console.log('Current state:', currentState);

const result = simulatePayoff(currentState);
console.log('Result payoffDate:', result.payoffDate);
console.log('Result monthsToPayoff:', result.monthsToPayoff);
