import api from './api'

export async function getBudgetData() {
  const { data } = await api.get('/budget/all')
  return data
}

// Incomes
export async function createIncome(payload) {
  const { data } = await api.post('/budget/incomes', payload)
  return data
}
export async function updateIncome(id, payload) {
  const { data } = await api.put(`/budget/incomes/${id}`, payload)
  return data
}
export async function deleteIncome(id) {
  const { data } = await api.delete(`/budget/incomes/${id}`)
  return data
}

// Categories
export async function createCategory(payload) {
  const { data } = await api.post('/budget/categories', payload)
  return data
}
export async function updateCategory(id, payload) {
  const { data } = await api.put(`/budget/categories/${id}`, payload)
  return data
}
export async function deleteCategory(id) {
  const { data } = await api.delete(`/budget/categories/${id}`)
  return data
}

// Shared Bills
export async function createSharedBill(payload) {
  const { data } = await api.post('/budget/shared-bills', payload)
  return data
}
export async function updateSharedBill(id, payload) {
  const { data } = await api.put(`/budget/shared-bills/${id}`, payload)
  return data
}
export async function deleteSharedBill(id) {
  const { data } = await api.delete(`/budget/shared-bills/${id}`)
  return data
}
export async function reorderSharedBills(items) {
  const { data } = await api.put('/budget/shared-bills/reorder/batch', { items })
  return data
}

// Expenses
export async function createExpense(payload) {
  const { data } = await api.post('/budget/expenses', payload)
  return data
}
export async function updateExpense(id, payload) {
  const { data } = await api.put(`/budget/expenses/${id}`, payload)
  return data
}
export async function deleteExpense(id) {
  const { data } = await api.delete(`/budget/expenses/${id}`)
  return data
}
export async function reorderExpenses(items) {
  const { data } = await api.put('/budget/expenses/reorder/batch', { items })
  return data
}

// Amex Recurring
export async function createAmexRecurring(payload) {
  const { data } = await api.post('/budget/amex/recurring', payload)
  return data
}
export async function updateAmexRecurring(id, payload) {
  const { data } = await api.put(`/budget/amex/recurring/${id}`, payload)
  return data
}
export async function deleteAmexRecurring(id) {
  const { data } = await api.delete(`/budget/amex/recurring/${id}`)
  return data
}

// Amex Grocery
export async function createAmexGrocery(payload) {
  const { data } = await api.post('/budget/amex/grocery', payload)
  return data
}
export async function updateAmexGrocery(id, payload) {
  const { data } = await api.put(`/budget/amex/grocery/${id}`, payload)
  return data
}
export async function deleteAmexGrocery(id) {
  const { data } = await api.delete(`/budget/amex/grocery/${id}`)
  return data
}
export async function clearAmexGrocery() {
  const { data } = await api.delete('/budget/amex/grocery')
  return data
}

// Non-Amex Expenses
export async function createNonAmex(payload) {
  const { data } = await api.post('/budget/non-amex', payload)
  return data
}
export async function updateNonAmex(id, payload) {
  const { data } = await api.put(`/budget/non-amex/${id}`, payload)
  return data
}
export async function deleteNonAmex(id) {
  const { data } = await api.delete(`/budget/non-amex/${id}`)
  return data
}
export async function clearNonAmex() {
  const { data } = await api.delete('/budget/non-amex')
  return data
}

// Allowance
export async function updateAmexAllowance(amount) {
  const { data } = await api.put('/budget/allowance', { amount })
  return data
}

// ── Shared Amex Calculator ──────────────────────────────────────────────────
export async function getCalculatorState() {
  const { data } = await api.get('/budget/calculator/state')
  return data
}
export async function createSharedAmexShop(payload) {
  const { data } = await api.post('/budget/calculator/shops', payload)
  return data
}
export async function deleteSharedAmexShop(id) {
  const { data } = await api.delete(`/budget/calculator/shops/${id}`)
  return data
}
export async function clearCalculatorShops() {
  const { data } = await api.delete('/budget/calculator/shops')
  return data
}
export async function updateCalculatorStatement(amount) {
  const { data } = await api.put('/budget/calculator/statement', { amount })
  return data
}

