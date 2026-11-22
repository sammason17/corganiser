import api from './api'

export async function getBudgetData() {
  const { data } = await api.get('/budget/all')
  return data
}
export const getAllBudgetData = getBudgetData

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

// Primary Card Recurring
export async function createPrimaryCardRecurring(payload) {
  const { data } = await api.post('/budget/primary-card/recurring', payload)
  return data
}
export async function updatePrimaryCardRecurring(id, payload) {
  const { data } = await api.put(`/budget/primary-card/recurring/${id}`, payload)
  return data
}
export async function deletePrimaryCardRecurring(id) {
  const { data } = await api.delete(`/budget/primary-card/recurring/${id}`)
  return data
}
export const createCardRecurring = createPrimaryCardRecurring
export const updateCardRecurring = updatePrimaryCardRecurring
export const deleteCardRecurring = deletePrimaryCardRecurring

// Primary Card Grocery
export async function createPrimaryCardGrocery(payload) {
  const { data } = await api.post('/budget/primary-card/grocery', payload)
  return data
}
export async function updatePrimaryCardGrocery(id, payload) {
  const { data } = await api.put(`/budget/primary-card/grocery/${id}`, payload)
  return data
}
export async function deletePrimaryCardGrocery(id) {
  const { data } = await api.delete(`/budget/primary-card/grocery/${id}`)
  return data
}
export async function clearPrimaryCardGrocery() {
  const { data } = await api.delete('/budget/primary-card/grocery')
  return data
}
export const createCardGrocery = createPrimaryCardGrocery
export const updateCardGrocery = updatePrimaryCardGrocery
export const deleteCardGrocery = deletePrimaryCardGrocery
export const clearCardGrocery = clearPrimaryCardGrocery

// Secondary Cards Expenses
export async function createSecondaryCardExpense(payload) {
  const { data } = await api.post('/budget/secondary-cards', payload)
  return data
}
export async function updateSecondaryCardExpense(id, payload) {
  const { data } = await api.put(`/budget/secondary-cards/${id}`, payload)
  return data
}
export async function deleteSecondaryCardExpense(id) {
  const { data } = await api.delete(`/budget/secondary-cards/${id}`)
  return data
}
export async function clearSecondaryCardExpenses() {
  const { data } = await api.delete('/budget/secondary-cards')
  return data
}
export const createNonCard = createSecondaryCardExpense
export const updateNonCard = updateSecondaryCardExpense
export const deleteNonCard = deleteSecondaryCardExpense
export const clearNonCard = clearSecondaryCardExpenses

// Primary Card Allowance
export async function updatePrimaryCardAllowance(amount) {
  const { data } = await api.put('/budget/primary-card/allowance', { amount })
  return data
}
export const updateCardAllowance = updatePrimaryCardAllowance
export const updateAllowance = updatePrimaryCardAllowance

// ── Shared Credit Card Calculator ───────────────────────────────────────────
export async function getCalculatorState() {
  const { data } = await api.get('/budget/calculator/state')
  return data
}
export async function createSharedShop(payload) {
  const { data } = await api.post('/budget/calculator/shops', payload)
  return data
}
export async function deleteSharedShop(id) {
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
export async function getCalculatorExports() {
  const { data } = await api.get('/budget/calculator/exports')
  return data
}
export async function createCalculatorExport(payload) {
  const { data } = await api.post('/budget/calculator/exports', payload)
  return data
}
export async function getNextCalculatorExportName() {
  const { data } = await api.get('/budget/calculator/next-export-name')
  return data.nextName
}
export async function settleCalculatorMonth(payload) {
  const { data } = await api.post('/budget/calculator/settle', payload)
  return data
}
export async function overrideCalculatorExport(id, payload) {
  const { data } = await api.post(`/budget/calculator/exports/${id}/override`, payload)
  return data
}

// ── TrueLayer Open Banking ──────────────────────────────────────────────────
export async function getTrueLayerStatus() {
  const { data } = await api.get('/truelayer/status')
  return data
}
export async function getTrueLayerAuthUrl(cardType = 'primary') {
  const { data } = await api.get('/truelayer/auth-url', { params: { cardType } })
  return data
}
export async function getTrueLayerCards(cardType = 'primary') {
  const { data } = await api.get('/truelayer/cards', { params: { cardType } })
  return data
}
export async function updateTrueLayerConfig(payload) {
  const { data } = await api.post('/truelayer/config', payload)
  return data
}
export async function syncTrueLayerNow() {
  const { data } = await api.post('/truelayer/sync-now')
  return data
}
export async function disconnectTrueLayer(cardType = 'all') {
  const { data } = await api.post('/truelayer/disconnect', { cardType })
  return data
}
export async function getLiveCardMonitor() {
  const { data } = await api.get('/truelayer/live-monitor')
  return data
}

// ── Family Management ────────────────────────────────────────────────────────
export async function getFamilyCurrent() {
  const { data } = await api.get('/family/current')
  return data
}
export async function joinFamily(inviteCode) {
  const { data } = await api.post('/family/join', { inviteCode })
  return data
}
export async function renameFamily(name) {
  const { data } = await api.put('/family/name', { name })
  return data
}
export async function regenerateFamilyInviteCode() {
  const { data } = await api.post('/family/invite-code/regenerate')
  return data
}
export async function removeFamilyMember(userId) {
  const { data } = await api.delete(`/family/members/${userId}`)
  return data
}


