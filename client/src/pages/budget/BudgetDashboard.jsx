import { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, PieChart as PieChartIcon, CreditCard, Plus, Trash2, 
  PoundSterling, ShoppingCart, Repeat, Landmark, Pencil, GripVertical, Calculator,
  Mail, RefreshCw, CheckCircle2, Settings2, ShieldCheck, Unlink, Sparkles,
  ChevronDown, ChevronUp, Edit3, AlertTriangle, Users, Copy, UserCheck, Shield
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'motion/react';
import * as api from '../../lib/budgetApi';
import { getDebtCards } from '../../lib/debtApi';
import { calculateCurrentState } from '../../lib/debtUtils';

const formatCurrency = (val) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(val || 0);

export default function BudgetDashboard() {
  const [data, setData] = useState({
    incomes: [], categories: [], sharedBills: [], expenses: [], 
    primaryCardRecurring: [], primaryCardGrocery: [], secondaryCardExpenses: [], primaryCardAllowance: 0,
    cardRecurring: [], cardGrocery: [], nonCardExpenses: [], cardAllowance: 0
  });
  const [debtCards, setDebtCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Family State
  const [familyInfo, setFamilyInfo] = useState(null);
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [editingFamilyName, setEditingFamilyName] = useState(false);
  const [familyNameInput, setFamilyNameInput] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    fetchData();
    fetchFamily();
  }, []);

  const fetchFamily = async () => {
    try {
      const res = await api.getFamilyCurrent();
      setFamilyInfo(res);
      setFamilyNameInput(res.name || res.family?.name || '');
    } catch (err) {
      console.warn('Could not fetch family:', err);
    }
  };

  const handleCopyInvite = () => {
    const code = familyInfo?.inviteCode || familyInfo?.family?.inviteCode;
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  const handleRegenerateInvite = async () => {
    if (!window.confirm('Regenerate family invite code? The old code will immediately stop working.')) return;
    try {
      const res = await api.regenerateFamilyInviteCode();
      setFamilyInfo(prev => ({
        ...prev,
        inviteCode: res.inviteCode,
        ...(prev?.family ? { family: { ...prev.family, inviteCode: res.inviteCode } } : {})
      }));
      alert('New invite code generated!');
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to regenerate invite code');
    }
  };

  const handleSaveFamilyName = async (e) => {
    e.preventDefault();
    if (!familyNameInput.trim()) return;
    setIsRenaming(true);
    try {
      const res = await api.renameFamily(familyNameInput.trim());
      setFamilyInfo(prev => ({ ...prev, family: { ...prev.family, name: res.name } }));
      setEditingFamilyName(false);
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to rename family');
    } finally {
      setIsRenaming(false);
    }
  };

  const handleJoinFamily = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    setIsJoining(true);
    try {
      await api.joinFamily(joinCodeInput.trim().toUpperCase());
      alert('Successfully joined family!');
      setJoinCodeInput('');
      await fetchFamily();
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to join family');
    } finally {
      setIsJoining(false);
    }
  };

  const handleRemoveMember = async (userId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from this family? They will no longer have access to shared cards or settlements.`)) return;
    try {
      await api.removeFamilyMember(userId);
      await fetchFamily();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to remove member');
    }
  };

  const fetchData = async () => {
    setError(null);
    try {
      // Fetch both independently so one failure doesn't block the other
      const [budgetResult, debtResult] = await Promise.allSettled([
        api.getBudgetData(),
        getDebtCards()
      ]);

      if (budgetResult.status === 'fulfilled') {
        const bData = budgetResult.value;
        setData({
          ...bData,
          primaryCardRecurring: bData.primaryCardRecurring || bData.cardRecurring || [],
          primaryCardGrocery: bData.primaryCardGrocery || bData.cardGrocery || [],
          secondaryCardExpenses: bData.secondaryCardExpenses || bData.secondaryCards || bData.nonCardExpenses || [],
          primaryCardAllowance: bData.primaryCardAllowance ?? bData.cardAllowance ?? 0,
          cardRecurring: bData.primaryCardRecurring || bData.cardRecurring || [],
          cardGrocery: bData.primaryCardGrocery || bData.cardGrocery || [],
          nonCardExpenses: bData.secondaryCardExpenses || bData.secondaryCards || bData.nonCardExpenses || [],
          cardAllowance: bData.primaryCardAllowance ?? bData.cardAllowance ?? 0,
        });
      } else {
        const status = budgetResult.reason?.response?.status;
        const msg = budgetResult.reason?.response?.data?.error || budgetResult.reason?.message || 'Unknown error';
        setError(`Budget data failed to load (${status || 'network error'}): ${msg}`);
        console.error('[budget fetch]', budgetResult.reason);
      }

      if (debtResult.status === 'fulfilled') {
        setDebtCards(debtResult.value);
      } else {
        console.error('[debt fetch]', debtResult.reason);
      }
    } finally {
      setLoading(false);
    }
  };

  const debtMonthlyTotal = useMemo(() => {
    return debtCards.reduce((sum, c) => sum + calculateCurrentState(c).calculatedMonthlyPayment, 0);
  }, [debtCards]);

  const totalIncome = useMemo(() => data.incomes.reduce((sum, item) => sum + item.amount, 0), [data.incomes]);
  const totalSharedBillsHalf = useMemo(() => data.sharedBills.reduce((sum, item) => sum + (item.amount * item.myShare), 0), [data.sharedBills]);
  const totalExpenses = useMemo(() => data.expenses.reduce((sum, item) => sum + item.amount, 0), [data.expenses]);
  const leftoverBudget = totalIncome - totalSharedBillsHalf - totalExpenses - debtMonthlyTotal;

  // Pie chart calculation
  const categorySpends = useMemo(() => {
    const spends = {};
    data.categories.forEach(c => spends[c.id] = { name: c.name, color: c.color, total: 0 });
    spends['uncategorized'] = { name: 'Uncategorized', color: '#cbd5e1', total: 0 };

    data.sharedBills.forEach(b => {
      const cat = b.categoryId || 'uncategorized';
      if (spends[cat]) spends[cat].total += (b.amount * b.myShare);
    });
    data.expenses.forEach(e => {
      const cat = e.categoryId || 'uncategorized';
      if (spends[cat]) spends[cat].total += e.amount;
    });

    return Object.values(spends).filter(s => s.total > 0).sort((a, b) => b.total - a.total);
  }, [data]);

  const totalCategorizedSpend = categorySpends.reduce((s, c) => s + c.total, 0);

  let cumulativePercent = 0;
  const conicSegments = categorySpends.map(c => {
    const percent = (c.total / totalCategorizedSpend) * 100;
    const segment = `${c.color} ${cumulativePercent}% ${cumulativePercent + percent}%`;
    cumulativePercent += percent;
    return segment;
  }).join(', ');

  // Primary & Secondary Cards Area calculations
  const primaryCardRecurring = data.primaryCardRecurring || data.cardRecurring || [];
  const primaryCardGrocery = data.primaryCardGrocery || data.cardGrocery || [];
  const secondaryCardExpenses = data.secondaryCardExpenses || data.secondaryCards || data.nonCardExpenses || [];

  const totalPrimaryCardRecurringFull = useMemo(() => primaryCardRecurring.reduce((s, i) => s + i.amount, 0), [primaryCardRecurring]);
  const totalPrimaryCardRecurringMine = useMemo(() => primaryCardRecurring.reduce((s, i) => s + (i.myPortionAmount ?? i.amount), 0), [primaryCardRecurring]);
  const totalPrimaryCardExpenses = useMemo(() => data.expenses.filter(e => e.isPrimaryCard || e.isCreditCard).reduce((s, e) => s + e.amount, 0), [data.expenses]);
  const totalSecondaryCards = useMemo(() => secondaryCardExpenses.reduce((s, i) => s + i.amount, 0), [secondaryCardExpenses]);

  // Grocery totals
  const totalPrimaryCardGroceryFull = useMemo(() => primaryCardGrocery.reduce((s, i) => s + i.totalAmount, 0), [primaryCardGrocery]);
  const totalPrimaryCardGroceryMine = useMemo(() => primaryCardGrocery.reduce((s, i) => s + i.myPortionAmount, 0), [primaryCardGrocery]);

  const effectiveDayToDayBudget = data.primaryCardAllowance ?? data.cardAllowance ?? 0;

  // Statement = recurring(full) + fixed primary card expenses + full grocery (Note: does NOT include Allowance to avoid double counting)
  const expectedPrimaryCardStatement = totalPrimaryCardRecurringFull + totalPrimaryCardExpenses + totalPrimaryCardGroceryFull;
  
  // My true portion = my recurring + fixed primary card expenses + my grocery + secondary cards
  const myPrimaryCardPortion = totalPrimaryCardRecurringMine + totalPrimaryCardExpenses + totalPrimaryCardGroceryMine + totalSecondaryCards;
  
  // Warning calculation: day-to-day spend strictly monitors grocery portions + secondary cards
  const myDayToDaySpend = totalPrimaryCardGroceryMine + totalSecondaryCards;
  const groceryOverBudget = effectiveDayToDayBudget > 0 && myDayToDaySpend > effectiveDayToDayBudget;
  const overspendAmount = myDayToDaySpend - effectiveDayToDayBudget;

  if (loading) return <div className="p-8 text-center text-slate-500">Loading budget...</div>;

  if (error) return (
    <div className="p-8 flex flex-col gap-4 items-start">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-lg">
        <p className="text-red-700 font-bold text-sm mb-1">Failed to load budget data</p>
        <p className="text-red-500 text-xs font-mono">{error}</p>
        <button onClick={fetchData} className="mt-4 bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-red-700">
          Retry
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 text-slate-900 font-sans flex flex-col min-h-full rounded-2xl overflow-hidden border border-slate-200">
      <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm shadow-emerald-100">
            <Wallet size={18} />
          </div>
          <span className="text-xl font-bold tracking-tight">Budget & Finances</span>
        </div>

        <button
          onClick={() => setShowFamilyModal(true)}
          className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl border border-slate-200 transition-colors shadow-sm"
          title="Household and Family Sharing Settings"
        >
          <Users size={15} className="text-indigo-600" />
          <span>{familyInfo?.name || familyInfo?.family?.name || 'Household'}</span>
          {(familyInfo?.members?.length > 0 || familyInfo?.family?.members?.length > 0) && (
            <span className="text-[10px] bg-white text-indigo-700 px-1.5 py-0.5 rounded-full border border-indigo-200 font-mono font-bold">
              {(familyInfo.members || familyInfo.family?.members || []).length} {((familyInfo.members || familyInfo.family?.members || []).length === 1) ? 'member' : 'members'}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Overview Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 rounded-[2rem] p-8 text-white shadow-xl shadow-slate-200 relative overflow-hidden flex flex-col justify-center">
              <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none ${leftoverBudget < 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}></div>
              
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <PieChartIcon size={14} className={leftoverBudget < 0 ? 'text-red-400' : 'text-emerald-400'} />
                    Leftover Monthly Budget
                  </h2>
                  <div className={`text-5xl font-black tracking-tighter mb-6 ${leftoverBudget < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatCurrency(leftoverBudget)}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Total Income</p>
                      <p className="font-mono text-base">{formatCurrency(totalIncome)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Debt Payments</p>
                      <p className="font-mono text-base text-rose-400">-{formatCurrency(debtMonthlyTotal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">My Share of Bills</p>
                      <p className="font-mono text-base text-amber-400">-{formatCurrency(totalSharedBillsHalf)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Monthly Expenses</p>
                      <p className="font-mono text-base text-amber-400">-{formatCurrency(totalExpenses)}</p>
                    </div>
                  </div>
                </div>
                
                {/* Pie Chart */}
                {totalCategorizedSpend > 0 && (
                  <div className="flex flex-col items-center">
                    <div 
                      className="w-40 h-40 rounded-full shadow-lg border-4 border-slate-800"
                      style={{ background: conicSegments ? `conic-gradient(${conicSegments})` : '#334155' }}
                    />
                    <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-[200px]">
                      {categorySpends.map(c => (
                        <div key={c.name} className="flex items-center gap-1.5 text-[9px] font-bold text-slate-300 uppercase">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }}></span>
                          {c.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Incomes & Categories Config */}
            <div className="flex flex-col gap-6">
              <Card title="Income Sources" icon={<Landmark size={14} />}>
                <IncomeList data={data.incomes} refresh={fetchData} />
              </Card>
              <Card title="Budget Categories" icon={<PieChartIcon size={14} />}>
                <CategoryList data={data.categories} refresh={fetchData} />
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Shared Household Bills" icon={<Wallet size={14} />}>
               <p className="text-xs text-slate-500 mb-4 font-medium">Add the full bill amount, it will automatically divide by your split percentage.</p>
               <SharedBillList data={data.sharedBills} categories={data.categories} refresh={fetchData} />
            </Card>

            <Card title="Personal Monthly Expenses" icon={<ShoppingCart size={14} />}>
               <p className="text-xs text-slate-500 mb-4 font-medium">Add daily spending estimates. Mark as 'Credit Card' to add to your credit card projection.</p>
               <ExpenseList data={data.expenses} categories={data.categories} refresh={fetchData} />
            </Card>
          </div>

          {/* 1. Shared Credit Card Statement Calculator (Shared Settlement) */}
          <SharedCreditCardStatementCalculator />

          {/* 2. Credit Card Projection */}
          <div className="bg-indigo-950 rounded-[2rem] p-8 text-white shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <CreditCard size={28} className="text-indigo-400" />
                <div>
                  <h2 className="text-2xl font-black tracking-tight">Primary Card Projection</h2>
                  <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mt-1">Expected Statement Tracker</p>
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 border border-white/20 flex items-center gap-3 shadow-inner">
                <div>
                  <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">Primary Card Allowance</p>
                  <p className="text-xs text-indigo-200">Base budget limit</p>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white font-bold">£</span>
                  <input 
                    type="number"
                    value={data.primaryCardAllowance ?? data.cardAllowance ?? ''}
                    onChange={(e) => setData({...data, primaryCardAllowance: Number(e.target.value) || 0, cardAllowance: Number(e.target.value) || 0})}
                    onBlur={(e) => api.updatePrimaryCardAllowance(Number(e.target.value) || 0)}
                    className="w-24 bg-indigo-950/50 text-white font-mono font-bold text-lg px-3 py-2 pl-7 rounded-lg border border-indigo-400/30 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10 overflow-hidden">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-4 flex items-center gap-2">
                  <Repeat size={12} /> Recurring Primary Card Payments
                </h3>
                <PrimaryCardRecurringList data={primaryCardRecurring} refresh={fetchData} cardExpenses={data.expenses.filter(e => e.isPrimaryCard || e.isCreditCard)} />
              </div>

              <div className="bg-white/5 rounded-2xl p-6 border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-300 flex items-center gap-2">
                    <Wallet size={12} /> Secondary Cards Expenses
                  </h3>
                  {secondaryCardExpenses?.length > 0 && (
                    <button onClick={() => { if(window.confirm('Clear all secondary cards expenses?')) { api.clearSecondaryCardExpenses().then(fetchData) } }} className="text-[9px] text-rose-400 hover:text-white font-bold uppercase tracking-widest bg-rose-400/10 hover:bg-rose-500/50 px-2 py-1 rounded transition-colors">
                      Clear All
                    </button>
                  )}
                </div>
                <SecondaryCardExpenseList data={secondaryCardExpenses} refresh={fetchData} />
              </div>

              <div className="lg:col-span-2 bg-white/5 rounded-2xl p-6 border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-300 flex items-center gap-2">
                    <ShoppingCart size={12} /> Grocery Shop Tracker
                  </h3>
                  {primaryCardGrocery?.length > 0 && (
                    <button onClick={() => { if(window.confirm('Clear all grocery shops?')) { api.clearPrimaryCardGrocery().then(fetchData) } }} className="text-[9px] text-indigo-400 hover:text-white font-bold uppercase tracking-widest bg-indigo-400/10 hover:bg-indigo-500/50 px-2 py-1 rounded transition-colors">
                      Clear All
                    </button>
                  )}
                </div>
                <PrimaryCardGroceryList data={primaryCardGrocery} refresh={fetchData} />
              </div>
            </div>

            {groceryOverBudget && (
              <div className="flex items-start gap-3 bg-red-500/20 border border-red-500/40 rounded-2xl p-4 mb-2">
                <span className="text-red-400 text-lg mt-0.5">⚠️</span>
                <div>
                  <p className="text-red-300 font-black text-xs uppercase tracking-widest">Budget exceeded!</p>
                  <p className="text-red-200 text-xs mt-1">
                    Your day-to-day spend (grocery + secondary cards) is <span className="font-bold">{formatCurrency(myDayToDaySpend)}</span>, which exceeds your day-to-day limit of <span className="font-bold">{formatCurrency(effectiveDayToDayBudget)}</span> by <span className="font-bold text-red-400">{formatCurrency(overspendAmount)}</span>.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-black/20 p-6 rounded-2xl border border-white/5">
              <div className="flex flex-col md:flex-row gap-8 mb-6">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Total Statement Should Be</p>
                  <p className="text-3xl font-black font-mono text-white">{formatCurrency(expectedPrimaryCardStatement)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">My Personal Portion</p>
                  <p className={`text-3xl font-black font-mono ${groceryOverBudget ? 'text-red-400' : 'text-indigo-400'}`}>{formatCurrency(myPrimaryCardPortion)}</p>
                </div>
              </div>
              <div className="border-t border-white/10 pt-4 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-3">Breakdown</p>
                <div className="flex justify-between text-xs text-indigo-200">
                  <span>Recurring subscriptions (full)</span>
                  <span className="font-mono">{formatCurrency(totalPrimaryCardRecurringFull)}</span>
                </div>
                <div className="flex justify-between text-xs text-indigo-200 opacity-60 ml-4 mb-2">
                  <span>↳ My recurring portion</span>
                  <span className="font-mono">{formatCurrency(totalPrimaryCardRecurringMine)}</span>
                </div>
                {totalPrimaryCardExpenses > 0 && (
                  <div className="flex justify-between text-xs text-indigo-200 mb-2">
                    <span>Fixed Primary Card expenses</span>
                    <span className="font-mono">{formatCurrency(totalPrimaryCardExpenses)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-indigo-200">
                  <span>Monthly day-to-day allowance</span>
                  <span className="font-mono">{formatCurrency(effectiveDayToDayBudget)}</span>
                </div>
                {totalSecondaryCards > 0 && (
                  <div className="flex justify-between text-xs text-rose-300">
                    <span>Secondary Cards spend</span>
                    <span className="font-mono">+{formatCurrency(totalSecondaryCards)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-indigo-200">
                  <span>Grocery shop total (full)</span>
                  <span className="font-mono">{formatCurrency(totalPrimaryCardGroceryFull)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-300 border-t border-white/10 pt-2">
                  <span>↳ My day-to-day spend (grocery + secondary cards)</span>
                  <span className="font-mono">{formatCurrency(myDayToDaySpend)} of {formatCurrency(effectiveDayToDayBudget)} limit</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* Family Sharing Modal */}
      {showFamilyModal && (familyInfo?.family || familyInfo) && (() => {
        const currentFamily = familyInfo.family || familyInfo;
        const isOwner = familyInfo.isOwner !== undefined ? familyInfo.isOwner : (familyInfo.userRole === 'OWNER');
        const currentUserId = familyInfo.currentUserId || familyInfo.userId;
        const membersList = currentFamily.members || [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 text-slate-800 relative">
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Users size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-slate-900">Household & Family Sharing</h3>
                    <p className="text-xs text-slate-500">Shared cards, food shops, and settlement emails</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFamilyModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 rounded-lg hover:bg-slate-100"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Family Name */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Family Name</span>
                    {isOwner && !editingFamilyName && (
                      <button
                        onClick={() => setEditingFamilyName(true)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                      >
                        <Pencil size={11} /> Rename
                      </button>
                    )}
                  </div>

                  {editingFamilyName ? (
                    <form onSubmit={handleSaveFamilyName} className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={familyNameInput}
                        onChange={e => setFamilyNameInput(e.target.value)}
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={isRenaming}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        {isRenaming ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingFamilyName(false); setFamilyNameInput(currentFamily.name); }}
                        className="text-slate-500 hover:text-slate-700 text-xs px-2 py-1.5"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <p className="text-base font-black text-slate-900 tracking-tight">{currentFamily.name}</p>
                  )}
                </div>

                {/* Invite Code Box */}
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Family Invite Code</span>
                    <span className="text-[11px] text-indigo-500">Share with household members</span>
                  </div>
                  <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-indigo-200/70 shadow-sm">
                    <span className="font-mono text-lg font-black tracking-widest text-indigo-950">
                      {currentFamily.inviteCode}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyInvite}
                        className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                      >
                        <Copy size={13} />
                        {copiedInvite ? 'Copied!' : 'Copy Code'}
                      </button>
                      {isOwner && (
                        <button
                          onClick={handleRegenerateInvite}
                          title="Regenerate invite code"
                          className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                        >
                          <RefreshCw size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Members List */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                    Family Members ({membersList.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {membersList.map(m => (
                      <div
                        key={m.id || m.userId}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                            {(m.name || m.user?.name || 'U').charAt(0)?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900 leading-tight">
                              {m.name || m.user?.name} {m.userId === currentUserId && <span className="text-slate-400 font-normal">(You)</span>}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">{m.email || m.user?.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            m.role === 'OWNER' 
                              ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {m.role}
                          </span>
                          {isOwner && m.userId !== currentUserId && (
                            <button
                              onClick={() => handleRemoveMember(m.userId, m.name || m.user?.name)}
                              className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-slate-100 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Join another family */}
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Join a Different Family
                  </p>
                  <form onSubmit={handleJoinFamily} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter Invite Code (e.g. FAM-XYZ123)"
                      value={joinCodeInput}
                      onChange={e => setJoinCodeInput(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase placeholder:normal-case placeholder:font-sans outline-none focus:border-indigo-500 focus:bg-white"
                    />
                    <button
                      type="submit"
                      disabled={isJoining || !joinCodeInput.trim()}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      {isJoining ? 'Joining...' : 'Join'}
                    </button>
                  </form>
                </div>

              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Shared UI Components ──────────────────────────────────────────────────────

function Card({ title, icon, children }) {
  return (
    <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-200">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

// ── Inline Lists ──────────────────────────────────────────────────────────────

function IncomeList({ data, refresh }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createIncome({ name, amount, isSalary: false });
    setName(''); setAmount(''); refresh();
  };

  return (
    <div className="space-y-3">
      {data.map(i => (
        <div key={i.id} className="flex items-center gap-2 group min-w-0">
          <span className="flex-1 text-sm font-bold text-slate-700 truncate min-w-0">{i.name}</span>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="font-mono font-bold text-emerald-600 text-sm">{formatCurrency(i.amount)}</span>
            <button onClick={() => api.deleteIncome(i.id).then(refresh)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={handleAdd} className="flex gap-2 pt-2 border-t border-slate-100 mt-2">
        <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} className="min-w-0 flex-1 bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-emerald-500" />
        <input placeholder="£" type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-20 flex-shrink-0 bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-emerald-500" />
        <button type="submit" className="flex-shrink-0 bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700"><Plus size={14} /></button>
      </form>
    </div>
  );
}

function CategoryList({ data, refresh }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name) return;
    await api.createCategory({ name, color });
    setName(''); refresh();
  };

  return (
    <div className="space-y-3">
      {data.map(c => (
        <div key={c.id} className="flex justify-between items-center group">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="text-sm font-bold text-slate-700">{c.name}</span>
          </div>
          <button onClick={() => api.deleteCategory(c.id).then(refresh)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <form onSubmit={handleAdd} className="flex gap-2 pt-2 border-t border-slate-100 mt-2">
        <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
        <input placeholder="Category Name" value={name} onChange={e=>setName(e.target.value)} className="flex-1 bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-slate-500" />
        <button type="submit" className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-900"><Plus size={14} /></button>
      </form>
    </div>
  );
}

function SharedBillList({ data, categories, refresh }) {
  const [items, setItems] = useState(data);
  useEffect(() => { setItems(data); }, [data]);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [myShare, setMyShare] = useState('0.5');
  const [categoryId, setCategoryId] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', amount: '', myShare: '0.5', categoryId: '' });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createSharedBill({ name, amount, myShare, categoryId });
    setName(''); setAmount(''); refresh();
  };

  const handleUpdate = async (e, id) => {
    e.preventDefault();
    if (!editForm.name || !editForm.amount) return;
    await api.updateSharedBill(id, editForm);
    setEditingId(null);
    refresh();
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const startIndex = result.source.index;
    const endIndex = result.destination.index;
    if (startIndex === endIndex) return;

    const newItems = Array.from(items);
    const [removed] = newItems.splice(startIndex, 1);
    newItems.splice(endIndex, 0, removed);
    
    setItems(newItems);
    
    const updates = newItems.map((item, index) => ({ id: item.id, sortOrder: index }));
    await api.reorderSharedBills(updates);
    refresh();
  };

  return (
    <div className="space-y-3">
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="shared-bills">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
              {items.map((b, index) => (
                <Draggable key={b.id} draggableId={b.id} index={index}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.draggableProps} className="flex flex-col sm:flex-row sm:items-center justify-between group p-3 bg-slate-50 rounded-xl border border-slate-100 bg-white">
                      
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div {...provided.dragHandleProps} className="text-slate-400 cursor-grab opacity-50 hover:opacity-100 flex-shrink-0">
                          <GripVertical size={16} />
                        </div>
                        
                        {editingId === b.id ? (
                          <form onSubmit={(e) => handleUpdate(e, b.id)} className="flex flex-wrap gap-2 w-full pr-2">
                            <input value={editForm.name} onChange={e=>setEditForm({...editForm, name: e.target.value})} className="flex-1 min-w-[120px] bg-white text-xs px-2 py-1 rounded border border-slate-200 outline-none" placeholder="Name" />
                            <input type="number" value={editForm.amount} onChange={e=>setEditForm({...editForm, amount: e.target.value})} className="w-16 bg-white text-xs px-2 py-1 rounded border border-slate-200 outline-none" placeholder="£" />
                            <select value={editForm.myShare} onChange={e=>setEditForm({...editForm, myShare: e.target.value})} className="bg-white text-xs px-1 py-1 rounded border border-slate-200 outline-none">
                              <option value="0.5">50%</option>
                              <option value="1">100%</option>
                              <option value="0.33">33%</option>
                            </select>
                            <select value={editForm.categoryId} onChange={e=>setEditForm({...editForm, categoryId: e.target.value})} className="bg-white text-xs px-1 py-1 rounded border border-slate-200 outline-none">
                              <option value="">None</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button type="submit" className="bg-emerald-600 text-white px-2 py-1 rounded text-xs">Save</button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 text-xs px-1">Cancel</button>
                          </form>
                        ) : (
                          <div className="flex-1">
                            <span className="text-sm font-bold text-slate-700 block">{b.name}</span>
                            {b.category && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{b.category.name}</span>}
                          </div>
                        )}
                      </div>

                      {editingId !== b.id && (
                        <div className="flex items-center gap-4 mt-2 sm:mt-0 pl-6 sm:pl-0 shrink-0">
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Full Bill</p>
                            <p className="font-mono text-xs">{formatCurrency(b.amount)}</p>
                          </div>
                          <div className="text-right border-l border-slate-200 pl-4">
                            <p className="text-[10px] text-emerald-600 font-bold uppercase">My Half ({(b.myShare*100).toFixed(0)}%)</p>
                            <p className="font-mono font-bold text-sm text-emerald-700">{formatCurrency(b.amount * b.myShare)}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <button onClick={() => { setEditingId(b.id); setEditForm({ name: b.name, amount: b.amount, myShare: b.myShare.toString(), categoryId: b.categoryId || '' }); }} className="text-slate-300 hover:text-indigo-500 p-1">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => api.deleteSharedBill(b.id).then(refresh)} className="text-slate-300 hover:text-red-500 p-1">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 mt-2">
        <input placeholder="Bill Name" value={name} onChange={e=>setName(e.target.value)} className="flex-1 min-w-[120px] bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none" />
        <input placeholder="Full £" type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-20 bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none" />
        <select value={myShare} onChange={e=>setMyShare(e.target.value)} className="bg-slate-50 text-xs px-2 py-2 rounded-lg border border-slate-200 outline-none">
          <option value="0.5">50% Split</option>
          <option value="1">100% Mine</option>
          <option value="0.33">33% Split</option>
        </select>
        <select value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="bg-slate-50 text-xs px-2 py-2 rounded-lg border border-slate-200 outline-none">
          <option value="">No Category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit" className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-900"><Plus size={14} /></button>
      </form>
    </div>
  );
}

function ExpenseList({ data, categories, refresh }) {
  const [items, setItems] = useState(data);
  useEffect(() => { setItems(data); }, [data]);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [isCreditCard, setIsCreditCard] = useState(false);
  const [categoryId, setCategoryId] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', amount: '', isCreditCard: false, categoryId: '' });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createExpense({ name, amount, isCreditCard, categoryId });
    setName(''); setAmount(''); setIsCreditCard(false); refresh();
  };

  const handleUpdate = async (e, id) => {
    e.preventDefault();
    if (!editForm.name || !editForm.amount) return;
    await api.updateExpense(id, editForm);
    setEditingId(null);
    refresh();
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const startIndex = result.source.index;
    const endIndex = result.destination.index;
    if (startIndex === endIndex) return;

    const newItems = Array.from(items);
    const [removed] = newItems.splice(startIndex, 1);
    newItems.splice(endIndex, 0, removed);
    
    setItems(newItems);
    
    const updates = newItems.map((item, index) => ({ id: item.id, sortOrder: index }));
    await api.reorderExpenses(updates);
    refresh();
  };

  return (
    <div className="space-y-3">
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="expenses">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
              {items.map((e, index) => (
                <Draggable key={e.id} draggableId={e.id} index={index}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.draggableProps} className="flex flex-col sm:flex-row sm:items-center justify-between group p-3 bg-slate-50 rounded-xl border border-slate-100 bg-white">
                      
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div {...provided.dragHandleProps} className="text-slate-400 cursor-grab opacity-50 hover:opacity-100 flex-shrink-0">
                          <GripVertical size={16} />
                        </div>

                        {editingId === e.id ? (
                          <form onSubmit={(ev) => handleUpdate(ev, e.id)} className="flex flex-wrap gap-2 w-full pr-2 items-center">
                            <input value={editForm.name} onChange={ev=>setEditForm({...editForm, name: ev.target.value})} className="flex-1 min-w-[120px] bg-white text-xs px-2 py-1 rounded border border-slate-200 outline-none" placeholder="Name" />
                            <input type="number" value={editForm.amount} onChange={ev=>setEditForm({...editForm, amount: ev.target.value})} className="w-16 bg-white text-xs px-2 py-1 rounded border border-slate-200 outline-none" placeholder="£" />
                            <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500">
                              <input type="checkbox" checked={editForm.isCreditCard} onChange={ev=>setEditForm({...editForm, isCreditCard: ev.target.checked})} />
                              Primary Card
                            </label>
                            <select value={editForm.categoryId} onChange={ev=>setEditForm({...editForm, categoryId: ev.target.value})} className="bg-white text-xs px-1 py-1 rounded border border-slate-200 outline-none">
                              <option value="">None</option>
                              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button type="submit" className="bg-emerald-600 text-white px-2 py-1 rounded text-xs">Save</button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 text-xs px-1">Cancel</button>
                          </form>
                        ) : (
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-700">{e.name}</span>
                              {(e.isPrimaryCard || e.isCreditCard) && <span className="bg-indigo-100 text-indigo-700 text-[8px] font-black uppercase px-1.5 py-0.5 rounded">Primary Card</span>}
                            </div>
                            {e.category && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{e.category.name}</span>}
                          </div>
                        )}
                      </div>

                      {editingId !== e.id && (
                        <div className="flex items-center gap-4 mt-2 sm:mt-0 pl-6 sm:pl-0 shrink-0">
                          <span className="font-mono font-bold text-slate-800">{formatCurrency(e.amount)}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            <button onClick={() => { setEditingId(e.id); setEditForm({ name: e.name, amount: e.amount, isCreditCard: !!(e.isPrimaryCard || e.isCreditCard), categoryId: e.categoryId || '' }); }} className="text-slate-300 hover:text-indigo-500 p-1">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => api.deleteExpense(e.id).then(refresh)} className="text-slate-300 hover:text-red-500 p-1">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 mt-2">
        <input placeholder="Expense Name" value={name} onChange={e=>setName(e.target.value)} className="flex-1 min-w-[120px] bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none" />
        <input placeholder="£" type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-20 bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none" />
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500 bg-slate-50 px-2 rounded-lg border border-slate-200 cursor-pointer">
          <input type="checkbox" checked={isCreditCard} onChange={e=>setIsCreditCard(e.target.checked)} />
          Primary Card
        </label>
        <select value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="bg-slate-50 text-xs px-2 py-2 rounded-lg border border-slate-200 outline-none">
          <option value="">Category</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit" className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-900"><Plus size={14} /></button>
      </form>
    </div>
  );
}

function PrimaryCardRecurringList({ data, refresh, cardExpenses }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [myPortionAmount, setMyPortionAmount] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createPrimaryCardRecurring({ name, amount, myPortionAmount });
    setName(''); setAmount(''); setMyPortionAmount(''); refresh();
  };

  return (
    <div className="space-y-3">
      {/* Read-only: Primary-card-flagged monthly expenses */}
      {cardExpenses?.length > 0 && (
        <>
          {cardExpenses.map(e => (
            <div key={e.id} className="flex justify-between items-center border-b border-white/5 pb-2 opacity-70">
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded">Expense</span>
                <span className="text-xs font-bold text-indigo-200">{e.name}</span>
              </div>
              <span className="font-mono text-xs text-indigo-200">{formatCurrency(e.amount)}</span>
            </div>
          ))}
          <div className="border-b border-white/10" />
        </>
      )}
      {/* Editable recurring primary card entries */}
      {data.map(i => (
        <div key={i.id} className="flex flex-col sm:flex-row sm:items-center justify-between group border-b border-white/5 pb-2 gap-2 min-w-0">
          <span className="text-xs font-bold text-indigo-100 truncate flex-1 pr-2">{i.name}</span>
          <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
            <div className="text-right">
              <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest block mb-0.5">Full £</span>
              <span className="font-mono text-xs font-bold text-white">{formatCurrency(i.amount)}</span>
            </div>
            <div className="text-right border-l border-white/10 pl-3">
              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest block mb-0.5">My Portion</span>
              <span className="font-mono text-xs font-bold text-emerald-300">{formatCurrency(i.myPortionAmount ?? i.amount)}</span>
            </div>
            <button onClick={() => api.deletePrimaryCardRecurring(i.id).then(refresh)} className="text-indigo-400 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-1">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 pt-2">
        <input placeholder="Subscription..." value={name} onChange={e=>setName(e.target.value)} className="flex-1 min-w-[100px] bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-indigo-400" />
        <input placeholder="Full £" type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="w-16 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-indigo-400" />
        <input placeholder="My £" type="number" step="0.01" value={myPortionAmount} onChange={e=>setMyPortionAmount(e.target.value)} className="w-16 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-emerald-400/50" />
        <button type="submit" className="bg-indigo-500 text-white p-2 rounded-lg hover:bg-indigo-600"><Plus size={14} /></button>
      </form>
    </div>
  );
}

function PrimaryCardGroceryList({ data, refresh }) {
  const [name, setName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [myPortionAmount, setMyPortionAmount] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!totalAmount) return;
    await api.createPrimaryCardGrocery({ name: name || 'Shop', totalAmount, myPortionAmount: myPortionAmount || (totalAmount/2) });
    setName(''); setTotalAmount(''); setMyPortionAmount(''); refresh();
  };

  const handleRename = async (id) => {
    if (!editName.trim()) return;
    await api.updatePrimaryCardGrocery(id, { name: editName });
    setEditingId(null); setEditName(''); refresh();
  };

  return (
    <div className="space-y-3">
      {data.map(i => (
        <div key={i.id} className="flex justify-between items-center group border-b border-white/5 pb-2">
          <div className="flex-1 min-w-0 mr-3">
            {editingId === i.id ? (
              <form onSubmit={e => { e.preventDefault(); handleRename(i.id); }} className="flex gap-1">
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="flex-1 min-w-0 bg-white/10 text-white text-xs px-2 py-1 rounded border border-indigo-400 outline-none"
                />
                <button type="submit" className="text-indigo-400 hover:text-white text-xs px-2">Save</button>
                <button type="button" onClick={() => setEditingId(null)} className="text-indigo-500 hover:text-white text-xs">✕</button>
              </form>
            ) : (
              <button
                onClick={() => { setEditingId(i.id); setEditName(i.name || 'Shop'); }}
                className="text-left group/name"
              >
                <span className="text-xs font-bold text-indigo-100 block group-hover/name:text-indigo-300 transition-colors truncate">
                  {i.name || 'Shop'} <span className="opacity-0 group-hover/name:opacity-50 text-[9px] ml-1">✎</span>
                </span>
                <span className="text-[8px] font-bold uppercase tracking-widest text-indigo-300">
                  {new Date(i.date).toLocaleDateString('en-GB')}
                </span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right">
              <span className="text-[8px] text-indigo-300 uppercase block">Total</span>
              <span className="font-mono text-xs text-white">{formatCurrency(i.totalAmount)}</span>
            </div>
            <div className="text-right border-l border-white/10 pl-3">
              <span className="text-[8px] text-emerald-400 uppercase block">My Portion</span>
              <span className="font-mono text-xs font-bold text-emerald-400">{formatCurrency(i.myPortionAmount)}</span>
            </div>
            <button onClick={() => api.deletePrimaryCardGrocery(i.id).then(refresh)} className="text-indigo-400 hover:text-red-400 opacity-0 group-hover:opacity-100">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={handleAdd} className="flex flex-col gap-2 pt-2">
        <input placeholder="Shop name (e.g. Tesco)" value={name} onChange={e=>setName(e.target.value)} className="w-full bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-indigo-400" />
        <div className="flex gap-2">
          <input placeholder="Total £" type="number" value={totalAmount} onChange={e=>setTotalAmount(e.target.value)} className="flex-1 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-indigo-400" />
          <input placeholder="My portion £" type="number" value={myPortionAmount} onChange={e=>setMyPortionAmount(e.target.value)} className="flex-1 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-indigo-400" />
          <button type="submit" className="bg-indigo-500 text-white p-2 rounded-lg hover:bg-indigo-600"><Plus size={14} /></button>
        </div>
      </form>
    </div>
  );
}

function SecondaryCardExpenseList({ data, refresh }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createSecondaryCardExpense({ name, amount });
    setName(''); setAmount(''); refresh();
  };

  return (
    <div className="space-y-3">
      {data.map(i => (
        <div key={i.id} className="flex justify-between items-center group border-b border-white/5 pb-2 min-w-0">
          <span className="text-xs font-bold text-rose-100 truncate flex-1 pr-2">{i.name}</span>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-xs font-bold text-white">-{formatCurrency(i.amount)}</span>
            <button onClick={() => api.deleteSecondaryCardExpense(i.id).then(refresh)} className="text-rose-400 hover:text-red-400 opacity-0 group-hover:opacity-100">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 pt-2">
        <input placeholder="Secondary card spend..." value={name} onChange={e=>setName(e.target.value)} className="flex-1 min-w-[100px] bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-rose-400" />
        <input placeholder="£" type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="w-16 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-rose-400" />
        <button type="submit" className="bg-rose-500 text-white p-2 rounded-lg hover:bg-rose-600"><Plus size={14} /></button>
      </form>
    </div>
  );
}
function SharedCreditCardStatementCalculator() {
  const [liveShops, setLiveShops] = useState([]);
  const [livePartnerStatement, setLivePartnerStatement] = useState(0);
  const [exportsList, setExportsList] = useState([]);
  const [selectedExportId, setSelectedExportId] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAllShops, setShowAllShops] = useState(false);

  // Dynamic names & family state
  const [familyMembers, setFamilyMembers] = useState([]);
  const [primaryName, setPrimaryName] = useState('Me');
  const [partnerName, setPartnerName] = useState('Partner');
  const [cardDisplayName, setCardDisplayName] = useState(null);
  const [cardholderName, setCardholderName] = useState(null);

  // TrueLayer state
  const [tlStatus, setTlStatus] = useState(null);
  const [tlCardsData, setTlCardsData] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [showTlConfig, setShowTlConfig] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState('');

  // Override Modal State
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverriding, setIsOverriding] = useState(false);
  const [overrideAlert, setOverrideAlert] = useState(null);

  // Form State
  const [vendorName, setVendorName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerCoveredAmount, setPayerCoveredAmount] = useState('');

  const fetchTlStatus = async () => {
    try {
      const status = await api.getTrueLayerStatus();
      setTlStatus(status);
      if (status.cardAccountId) setSelectedCardId(status.cardAccountId);
    } catch (err) {
      console.warn('Could not fetch TrueLayer status:', err);
    }
  };

  const fetchData = async () => {
    try {
      const [stateData, exportsData] = await Promise.all([
        api.getCalculatorState(),
        api.getCalculatorExports()
      ]);
      setLiveShops(stateData.shops);
      setLivePartnerStatement(stateData.partnerStatementAmount);
      setExportsList(exportsData);
      if (stateData.familyMembers) setFamilyMembers(stateData.familyMembers);
      if (stateData.primaryName) {
        setPrimaryName(stateData.primaryName);
        setPayerName(prev => prev || stateData.primaryName);
      }
      if (stateData.partnerName) setPartnerName(stateData.partnerName);
      if (stateData.cardDisplayName) setCardDisplayName(stateData.cardDisplayName);
      if (stateData.cardholderName) setCardholderName(stateData.cardholderName);
      await fetchTlStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Check for OAuth redirect return
    const params = new URLSearchParams(window.location.search);
    if (params.get('truelayer') === 'connected') {
      alert('Credit card connected successfully via TrueLayer!');
      window.history.replaceState({}, '', window.location.pathname);
      fetchTlStatus();
    } else if (params.get('truelayer') === 'error') {
      alert(`TrueLayer connection error: ${params.get('msg') || 'Authentication failed'}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnectTrueLayer = async () => {
    try {
      const { url } = await api.getTrueLayerAuthUrl();
      window.location.href = url;
    } catch (err) {
      alert(err.message || 'Failed to start TrueLayer connection');
    }
  };

  const handleOpenTlConfig = async () => {
    setShowTlConfig(!showTlConfig);
    if (!showTlConfig) {
      try {
        const cardsData = await api.getTrueLayerCards();
        setTlCardsData(cardsData);
        if (cardsData.selectedCardId) setSelectedCardId(cardsData.selectedCardId);
      } catch (err) {
        console.warn('Could not load card details:', err);
      }
    }
  };

  const handleSaveTlConfig = async () => {
    try {
      await api.updateTrueLayerConfig({
        cardAccountId: selectedCardId,
      });
      alert('TrueLayer card configuration saved!');
      setShowTlConfig(false);
      fetchTlStatus();
    } catch (err) {
      alert(err.message || 'Failed to save configuration');
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await api.syncTrueLayerNow();
      if (res.status === 'COMPLETED') {
        alert(`Settlement complete! Month archived as "${res.exportResult?.export?.name || 'export'}" and statement emails sent.`);
        fetchData();
      } else if (res.status === 'ALREADY_PROCESSED') {
        alert(`Statement for ${res.lastStatementDate} has already been settled and exported.`);
      } else if (res.status === 'AWAITING_NEW_STATEMENT') {
        alert(res.message || `Current cycle has not closed yet. Awaiting statement closing date.`);
      } else {
        alert(`Status: ${res.status} - ${res.message || 'Checked'}`);
      }
      fetchTlStatus();
    } catch (err) {
      alert(err.message || 'Sync check failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect TrueLayer from Credit Card account?')) return;
    try {
      await api.disconnectTrueLayer();
      alert('TrueLayer disconnected.');
      setShowTlConfig(false);
      fetchTlStatus();
    } catch (err) {
      alert(err.message || 'Failed to disconnect');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!vendorName || !totalAmount || !payerCoveredAmount) return;
    await api.createSharedShop({
      vendorName,
      totalAmount,
      payerName: payerName || primaryName,
      payerCoveredAmount
    });
    setVendorName('');
    setTotalAmount('');
    setPayerCoveredAmount('');
    fetchData();
  };

  const handleClearMonth = async () => {
    if (window.confirm('Are you sure you want to clear all data and reset for a new month?')) {
      await api.clearCalculatorShops();
      fetchData();
    }
  };

  const handleExportMonth = async () => {
    const defaultName = await api.getNextCalculatorExportName().catch(() => new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(' ', '-'));
    const name = window.prompt('Name this export:', defaultName);
    if (!name) return;
    try {
      await api.createCalculatorExport({ name });
      alert('Month exported successfully!');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to export');
    }
  };

  const activeExport = exportsList.find(e => e.id === selectedExportId);
  const isReadOnly = !!activeExport;
  const shops = activeExport ? activeExport.shopsData : liveShops;
  const partnerStatement = activeExport ? activeExport.partnerStatementAmount : livePartnerStatement;

  const currentPrimary = (activeExport?.primaryName && activeExport.primaryName !== 'Me') ? activeExport.primaryName : primaryName;
  const currentPartner = (activeExport?.partnerName && activeExport.partnerName !== 'Partner') ? activeExport.partnerName : partnerName;
  const familyNamesList = familyMembers.length > 0 ? familyMembers.map(m => m.name).join(' & ') : `${currentPrimary} & ${currentPartner}`;

  const handleSettleAndEmail = async () => {
    const nextName = await api.getNextCalculatorExportName().catch(() => new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).replace(' ', '-'));
    const confirmMsg = `Are you sure you want to finalize this month?\n\nThis will:\n1. Archive to "${nextName}"\n2. Send statement summary emails to ${familyNamesList}\n3. Clear shops and reset calculator for next month`;
    if (!window.confirm(confirmMsg)) return;

    setIsSettling(true);
    try {
      const res = await api.settleCalculatorMonth({ partnerStatementAmount: livePartnerStatement });
      alert(`Month settled successfully!\nArchived to: ${res.export?.name}\nEmails sent to: ${res.recipients?.join(', ')}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to settle month');
    } finally {
      setIsSettling(false);
    }
  };

  const handleOpenOverrideModal = () => {
    const currentActive = exportsList.find(e => e.id === selectedExportId);
    if (!currentActive) return;
    setOverrideAmount(currentActive.partnerStatementAmount !== undefined ? String(currentActive.partnerStatementAmount) : '0');
    setOverrideReason('Amended statement total due to statement outlier / timing discrepancy');
    setShowOverrideModal(true);
  };

  const handleConfirmOverride = async (e) => {
    e.preventDefault();
    const currentActive = exportsList.find(e => e.id === selectedExportId);
    if (!currentActive) return;
    const parsed = Number(overrideAmount);
    if (isNaN(parsed) || parsed < 0) {
      alert('Please enter a valid statement amount.');
      return;
    }

    setIsOverriding(true);
    try {
      const res = await api.overrideCalculatorExport(currentActive.id, {
        partnerStatementAmount: parsed,
        reason: overrideReason.trim() || undefined,
      });

      setExportsList(prev => prev.map(exp => exp.id === currentActive.id ? res.export : exp));
      setShowOverrideModal(false);
      setOverrideAlert({
        type: 'success',
        message: `Manual override applied for ${currentActive.name}! An amended statement email has been sent to ${currentPrimary} and ${currentPartner}.`
      });
      setTimeout(() => setOverrideAlert(null), 8000);
    } catch (err) {
      console.error('Manual override failed:', err);
      alert(err.response?.data?.error || err.message || 'Failed to apply manual override');
    } finally {
      setIsOverriding(false);
    }
  };

  if (loading) return null;

  const sortedShops = [...shops].sort((a, b) => new Date(b.date) - new Date(a.date));
  const visibleShops = showAllShops ? sortedShops : sortedShops.slice(0, 3);

  let partnerOwesForMyShops = 0;
  let iOweForPartnerShops = 0;

  shops.forEach(shop => {
    const remainder = shop.totalAmount - shop.payerCoveredAmount;
    const isPrimaryPayer = (shop.payerName || '').trim().toLowerCase() === (currentPrimary || '').trim().toLowerCase() || (shop.payerName || '').toLowerCase() === 'me';
    if (isPrimaryPayer) {
      partnerOwesForMyShops += remainder;
    } else {
      iOweForPartnerShops += remainder;
    }
  });

  const finalAmountPartnerOwes = partnerStatement + partnerOwesForMyShops - iOweForPartnerShops;
  const previewAmount = Number(overrideAmount) || 0;
  const previewFinalOwes = previewAmount + partnerOwesForMyShops - iOweForPartnerShops;

  return (
    <div className="bg-slate-900 rounded-[2rem] p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
      
      {/* Top Banner: TrueLayer Sync Status */}
      <div className="relative z-10 flex flex-wrap items-center justify-between pb-6 mb-6 border-b border-white/10 gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${tlStatus?.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                {tlStatus?.isConnected ? 'Account Live Sync (TrueLayer)' : 'Account Automation'}
              </span>
              {tlStatus?.consentDaysRemaining !== null && (
                <span className="text-[10px] font-mono bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                  {tlStatus.consentDaysRemaining}d consent
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {tlStatus?.isConnected
                ? `Auto-settles on 24th (Statement 20th–19th) • Last settled: ${tlStatus.lastProcessedStatementDate || 'None this cycle'}`
                : `Connect credit card to automatically populate ${currentPartner}'s statement and settle monthly`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tlStatus?.isConnected ? (
            <>
              <button
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="flex items-center gap-1.5 text-[10px] text-blue-300 hover:text-white font-bold uppercase tracking-widest bg-blue-500/10 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg border border-blue-500/20 transition-all disabled:opacity-50"
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Checking...' : 'Check / Sync Now'}
              </button>
              <button
                onClick={handleOpenTlConfig}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                title="TrueLayer Card Settings"
              >
                <Settings2 size={16} />
              </button>
            </>
          ) : (
            <button
              onClick={handleConnectTrueLayer}
              className="flex items-center gap-1.5 text-[10px] text-white font-bold uppercase tracking-widest bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-3 py-1.5 rounded-lg shadow-md transition-all"
            >
              <CreditCard size={12} />
              Connect Card Account
            </button>
          )}
        </div>
      </div>

      {/* TrueLayer Card Config Drawer */}
      {showTlConfig && (
        <div className="relative z-10 bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
              <ShieldCheck size={14} /> TrueLayer Card Configuration
            </h4>
            <button
              onClick={handleDisconnect}
              className="text-[10px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-wider flex items-center gap-1"
            >
              <Unlink size={12} /> Disconnect
            </button>
          </div>
          <div className="text-xs max-w-md">
            <label className="block text-slate-400 mb-1 text-[11px] font-bold uppercase">Connected Card Account</label>
            <select
              value={selectedCardId}
              onChange={e => setSelectedCardId(e.target.value)}
              className="w-full bg-slate-900/80 text-white text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-blue-400"
            >
              <option value="">Select Card</option>
              {tlCardsData?.cards?.map(c => (
                <option key={c.account_id} value={c.account_id}>
                  {c.display_name || c.name_on_card} (•••• {c.partial_card_number})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowTlConfig(false)}
              className="text-[10px] text-slate-400 hover:text-white px-3 py-1.5 rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTlConfig}
              className="text-[10px] bg-blue-500 hover:bg-blue-600 text-white font-bold uppercase tracking-wider px-4 py-1.5 rounded-lg"
            >
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {/* Main Stacked Content */}
      <div className="relative z-10 space-y-6">
        
        {/* Header: Title and Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Calculator size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Shared Credit Card Statement Calculator</h2>
              <p className="text-slate-400 text-xs">Shared Food Shops & Monthly Settlement Breakdown</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <select 
              value={selectedExportId} 
              onChange={e => setSelectedExportId(e.target.value)}
              className="bg-white/10 text-white text-xs px-3 py-2 rounded-lg outline-none border border-white/10 focus:border-blue-400"
            >
              <option value="">Current Month</option>
              {exportsList.map(exp => (
                <option key={exp.id} value={exp.id}>
                  {exp.name} {exp.isOverridden ? '• [Amended]' : ''}
                </option>
              ))}
            </select>

            {isReadOnly ? (
              <button
                type="button"
                onClick={handleOpenOverrideModal}
                className="flex items-center gap-1.5 text-[10px] text-amber-300 hover:text-white font-bold uppercase tracking-widest bg-amber-500/20 hover:bg-amber-500/40 px-3 py-2 rounded-lg border border-amber-500/30 transition-all shadow-sm"
                title={`Manually adjust ${currentPartner}'s statement spend and send amended statement email to ${currentPrimary} and ${currentPartner}`}
              >
                <Edit3 size={12} />
                Manual Override
              </button>
            ) : (
              <>
                <button
                  onClick={handleSettleAndEmail}
                  disabled={isSettling}
                  className="flex items-center gap-1.5 text-[10px] text-emerald-300 hover:text-white font-bold uppercase tracking-widest bg-emerald-500/20 hover:bg-emerald-600 px-3 py-2 rounded-lg border border-emerald-500/30 transition-all shadow-sm"
                  title={`Archive month, send breakdown email to ${familyNamesList}, and clear for next month`}
                >
                  <Mail size={12} />
                  {isSettling ? 'Settling...' : 'Settle & Email'}
                </button>
                <button 
                  onClick={handleExportMonth} 
                  className="text-[10px] text-blue-300 hover:text-white font-bold uppercase tracking-widest bg-blue-500/10 hover:bg-blue-500/30 px-3 py-2 rounded-lg border border-blue-500/20 transition-colors"
                >
                  Export
                </button>
                <button 
                  onClick={handleClearMonth} 
                  className="text-[10px] text-red-300 hover:text-white font-bold uppercase tracking-widest bg-red-500/10 hover:bg-red-500/30 px-3 py-2 rounded-lg border border-red-500/20 transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {/* Alerts & Overridden Status Banners */}
        {overrideAlert && (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 flex items-center justify-between text-xs text-emerald-300 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
              <span>{overrideAlert.message}</span>
            </div>
            <button onClick={() => setOverrideAlert(null)} className="text-emerald-400 hover:text-white font-bold text-xs px-2 py-1 rounded hover:bg-white/10">✕</button>
          </div>
        )}

        {activeExport?.isOverridden && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-center gap-3 text-xs text-amber-200 shadow-sm">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
            <div>
              <span className="font-bold text-amber-300">Amended Statement (Manual Override):</span> This exported month was manually amended due to an incorrect statement amount{activeExport.overrideReason ? `: "${activeExport.overrideReason}"` : ''}.
            </div>
          </div>
        )}

        {/* Add Shop Form (Full Width 12-Column Responsive Grid) */}
        {!isReadOnly && (
          <div className="bg-white/5 rounded-2xl p-6 border border-white/5 shadow-inner">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-4 flex items-center gap-2">
              <ShoppingCart size={13} /> Add Shared Grocery Shop
            </h3>
            <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-4">
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Vendor</label>
                <input 
                  placeholder="e.g. Tesco, Aldi, M&S" 
                  value={vendorName} 
                  onChange={e => setVendorName(e.target.value)} 
                  className="w-full bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2.5 rounded-lg border border-white/10 outline-none focus:border-blue-400" 
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total (£)</label>
                <input 
                  placeholder="0.00" 
                  type="number" 
                  step="0.01" 
                  value={totalAmount} 
                  onChange={e => setTotalAmount(e.target.value)} 
                  className="w-full bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2.5 rounded-lg border border-white/10 outline-none focus:border-blue-400 font-mono" 
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Who Paid?</label>
                <select 
                  value={payerName || currentPrimary} 
                  onChange={e => setPayerName(e.target.value)} 
                  className="w-full bg-slate-900 text-white text-xs px-3 py-2.5 rounded-lg border border-white/10 outline-none focus:border-blue-400"
                >
                  {(familyMembers && familyMembers.length > 0 ? familyMembers : [{ name: currentPrimary }, { name: currentPartner }]).map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{payerName || currentPrimary} Covers (£)</label>
                <input 
                  placeholder="0.00" 
                  type="number" 
                  step="0.01" 
                  value={payerCoveredAmount} 
                  onChange={e => setPayerCoveredAmount(e.target.value)} 
                  className="w-full bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2.5 rounded-lg border border-white/10 outline-none focus:border-blue-400 font-mono" 
                />
              </div>
              <div className="lg:col-span-2">
                <button 
                  type="submit" 
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20"
                >
                  <Plus size={14} /> Add Shop
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Shops List (Shows 3 most recent by default, expandable) */}
        <div className="space-y-3">
          {sortedShops.length === 0 && (
            <div className="bg-white/5 rounded-xl p-8 text-center border border-white/5">
              <p className="text-slate-400 text-xs font-medium">No shops added for this month.</p>
              <p className="text-[11px] text-slate-500 mt-1">Use the form above to add shared groceries, or select a previous month from the dropdown.</p>
            </div>
          )}
          {visibleShops.map(shop => (
            <div 
              key={shop.id} 
              className="flex flex-col sm:flex-row sm:items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/[0.07] group gap-3 sm:gap-0 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs flex-shrink-0">
                  <ShoppingCart size={14} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white tracking-tight">{shop.vendorName}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{new Date(shop.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:gap-6 w-full sm:w-auto">
                <div className="text-left sm:text-right hidden sm:block">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total</p>
                  <p className="font-mono text-xs font-semibold text-white">{formatCurrency(shop.totalAmount)}</p>
                </div>
                <div className="text-left sm:text-right sm:border-l border-white/10 sm:pl-4 flex-1 sm:flex-none">
                  <p className="text-[9px] text-blue-400 font-bold uppercase tracking-wider">{shop.payerName} Paid</p>
                  <p className="font-mono text-xs font-semibold text-blue-200">{formatCurrency(shop.totalAmount)}</p>
                </div>
                <div className="text-left sm:text-right border-l border-white/10 pl-3 sm:pl-4 flex-1 sm:flex-none">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                    {(shop.payerName || '').trim().toLowerCase() === (currentPrimary || '').trim().toLowerCase() ? `${currentPartner} Owes` : `${currentPrimary} Owes`}
                  </p>
                  <p className="font-mono text-xs font-bold text-emerald-400">{formatCurrency(shop.totalAmount - shop.payerCoveredAmount)}</p>
                </div>
                {!isReadOnly && (
                  <button 
                    onClick={() => api.deleteSharedShop(shop.id).then(fetchData)} 
                    className="text-slate-400 hover:text-red-400 sm:opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/10"
                    title="Delete shop"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {sortedShops.length > 3 && (
            <div className="pt-2 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllShops(!showAllShops)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-300 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl border border-white/10 transition-all shadow-sm"
              >
                {showAllShops ? (
                  <>
                    <ChevronUp size={14} /> Show Less (Showing all {sortedShops.length})
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} /> Show All ({sortedShops.length} shops)
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Bottom Section: Partner's Statement Amount & Settlement Breakdown */}
        <div className="mt-8 pt-8 border-t border-white/10 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          
          {/* Left Card: Partner's Statement Amount */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2">
                  <CreditCard size={15} className="text-indigo-400" />
                  {currentPartner}'s Statement Amount
                </h3>
                {tlStatus?.isConnected && (
                  <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={10} /> Auto-Syncs 24th
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mb-4">
                Total charges on {currentPartner}'s card for this statement cycle (20th to 19th). Auto-settles on 24th via TrueLayer or editable manually.
              </p>
            </div>
            
            <div className="relative mt-2">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white font-bold text-2xl">£</span>
              <input 
                type="number"
                step="0.01"
                disabled={isReadOnly}
                value={partnerStatement || ''}
                onChange={(e) => {
                  setLivePartnerStatement(Number(e.target.value));
                }}
                onBlur={(e) => {
                  api.updateCalculatorStatement(Number(e.target.value) || 0);
                }}
                className="w-full bg-slate-900/60 text-white font-mono font-black text-3xl px-4 py-3.5 pl-10 rounded-xl border border-white/10 outline-none focus:border-blue-400 disabled:opacity-75 disabled:cursor-not-allowed"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Right Card: Settlement Breakdown */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-3 flex items-center gap-2">
                <Calculator size={15} /> Settlement Breakdown
              </h3>
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">{currentPartner}'s Statement Amount</span>
                  <span className="font-mono text-white font-semibold">{formatCurrency(partnerStatement)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">{currentPartner} owes for {currentPrimary}'s shops</span>
                  <span className="font-mono text-emerald-400 font-semibold">+{formatCurrency(partnerOwesForMyShops)}</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-3 border-b border-white/10">
                  <span className="text-slate-400">{currentPrimary} owes for {currentPartner}'s shops</span>
                  <span className="font-mono text-rose-400 font-semibold">-{formatCurrency(iOweForPartnerShops)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                  {finalAmountPartnerOwes >= 0 ? `Final Amount ${currentPartner} Owes` : `Final Amount ${currentPrimary} Owes`}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Total settlement due for this month</p>
              </div>
              <span className="font-mono text-2xl sm:text-3xl font-black text-blue-400">{formatCurrency(Math.abs(finalAmountPartnerOwes))}</span>
            </div>
          </div>

        </div>

      </div>

      {/* Manual Override Modal */}
      {showOverrideModal && activeExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-white shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Manual Override — {activeExport.name}</h3>
                  <p className="text-[11px] text-slate-400">Adjust statement total & re-send amended statement</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOverrideModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmOverride} className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 text-xs text-amber-200/90 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <AlertTriangle size={15} />
                  <span>Outlier & Statement Correction</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-200/80">
                  Confirming this manual override will update the archived records for <strong>{activeExport.name}</strong> and immediately re-send an amended statement email to <strong>{currentPrimary}</strong> and <strong>{currentPartner}</strong> stating that the total was manually updated due to an incorrect statement amount.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  {currentPartner}'s Statement Amount (£)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white font-bold text-lg">£</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={overrideAmount}
                    onChange={e => setOverrideAmount(e.target.value)}
                    className="w-full bg-slate-800 text-white font-mono font-bold text-xl px-4 py-2.5 pl-8 rounded-xl border border-white/20 outline-none focus:border-amber-400"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Current recorded amount: <span className="font-mono text-slate-300">{formatCurrency(activeExport.partnerStatementAmount)}</span>
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Reason / Note (Included in Email)
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs px-3.5 py-2.5 rounded-xl border border-white/20 outline-none focus:border-amber-400"
                  placeholder="e.g. July Amazon payment arrived on next statement outlier"
                />
              </div>

              <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Recalculated Settlement Preview
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">{currentPartner}'s Statement Spend</span>
                  <span className="font-mono text-white font-semibold">{formatCurrency(previewAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">{currentPartner} owes for {currentPrimary}'s shops ({shops.filter(s=>((s.payerName||'').toLowerCase()===(currentPrimary||'').toLowerCase())).length})</span>
                  <span className="font-mono text-emerald-400 font-semibold">+{formatCurrency(partnerOwesForMyShops)}</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-white/10">
                  <span className="text-slate-400">{currentPrimary} owes for {currentPartner}'s shops ({shops.filter(s=>((s.payerName||'').toLowerCase()!==(currentPrimary||'').toLowerCase())).length})</span>
                  <span className="font-mono text-rose-400 font-semibold">-{formatCurrency(iOweForPartnerShops)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-bold uppercase text-slate-300">
                    Amended Final Amount {previewFinalOwes >= 0 ? currentPartner : currentPrimary} Owes
                  </span>
                  <span className="font-mono text-xl font-black text-amber-400">{formatCurrency(Math.abs(previewFinalOwes))}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  disabled={isOverriding}
                  className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isOverriding}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl shadow-lg transition-all disabled:opacity-50"
                >
                  <Mail size={14} />
                  {isOverriding ? 'Saving & Sending Email...' : 'Confirm & Send Amended Statement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
