import { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, PieChart as PieChartIcon, CreditCard, Plus, Trash2, 
  PoundSterling, ShoppingCart, Repeat, Landmark
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as api from '../../lib/budgetApi';
import { getDebtCards } from '../../lib/debtApi';
import { calculateCurrentState } from '../../lib/debtUtils';

const formatCurrency = (val) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(val || 0);

export default function BudgetDashboard() {
  const [data, setData] = useState({
    incomes: [], categories: [], sharedBills: [], expenses: [], amexRecurring: [], amexGrocery: [], nonAmexExpenses: []
  });
  const [debtCards, setDebtCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setError(null);
    try {
      // Fetch both independently so one failure doesn't block the other
      const [budgetResult, debtResult] = await Promise.allSettled([
        api.getBudgetData(),
        getDebtCards()
      ]);

      if (budgetResult.status === 'fulfilled') {
        setData(budgetResult.value);
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

  // Amex Area calculations
  const totalAmexRecurringFull = useMemo(() => data.amexRecurring.reduce((s, i) => s + i.amount, 0), [data.amexRecurring]);
  const totalAmexRecurringMine = useMemo(() => data.amexRecurring.reduce((s, i) => s + (i.myPortionAmount ?? i.amount), 0), [data.amexRecurring]);
  const totalAmexExpenses = useMemo(() => data.expenses.filter(e => e.isAmex).reduce((s, e) => s + e.amount, 0), [data.expenses]);
  const totalNonAmex = useMemo(() => data.nonAmexExpenses?.reduce((s, i) => s + i.amount, 0) || 0, [data.nonAmexExpenses]);

  // Grocery totals
  const totalAmexGroceryFull = useMemo(() => data.amexGrocery.reduce((s, i) => s + i.totalAmount, 0), [data.amexGrocery]);
  const totalAmexGroceryMine = useMemo(() => data.amexGrocery.reduce((s, i) => s + i.myPortionAmount, 0), [data.amexGrocery]);

  const effectiveDayToDayBudget = totalAmexExpenses - totalNonAmex;

  // Statement = recurring(full) + amex expenses - non amex + full grocery
  const expectedAmexStatement = totalAmexRecurringFull + effectiveDayToDayBudget + totalAmexGroceryFull;
  
  // My true portion = my recurring + amex expenses - non amex + my grocery
  const myAmexPortion = totalAmexRecurringMine + effectiveDayToDayBudget + totalAmexGroceryMine;
  
  // Warning calculation
  const groceryOverBudget = effectiveDayToDayBudget > 0 && totalAmexGroceryMine > effectiveDayToDayBudget;
  const overspendAmount = totalAmexGroceryMine - effectiveDayToDayBudget;

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
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {/* Overview Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 rounded-[2rem] p-8 text-white shadow-xl shadow-slate-200 relative overflow-hidden flex flex-col justify-center">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
              
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1">
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <PieChartIcon size={14} className="text-emerald-400" />
                    Leftover Monthly Budget
                  </h2>
                  <div className="text-5xl font-black tracking-tighter mb-6 text-emerald-400">
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
               <p className="text-xs text-slate-500 mb-4 font-medium">Add daily spending estimates. Mark as 'Amex' to add to your credit card projection.</p>
               <ExpenseList data={data.expenses} categories={data.categories} refresh={fetchData} />
            </Card>
          </div>

          {/* Amex Tracking Area */}
          <div className="bg-indigo-950 rounded-[2rem] p-8 text-white shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
            
            <div className="relative z-10 flex items-center gap-3 mb-8">
              <CreditCard size={28} className="text-indigo-400" />
              <div>
                <h2 className="text-2xl font-black tracking-tight">Amex Credit Card Projection</h2>
                <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mt-1">Expected Statement Tracker</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-4 flex items-center gap-2">
                  <Repeat size={12} /> Recurring Amex Payments
                </h3>
                <AmexRecurringList data={data.amexRecurring} refresh={fetchData} amexExpenses={data.expenses.filter(e => e.isAmex)} />
              </div>

              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-4 flex items-center gap-2">
                  <ShoppingCart size={12} /> Grocery Shop Tracker
                </h3>
                <AmexGroceryList data={data.amexGrocery} refresh={fetchData} />
              </div>

              <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-300 mb-4 flex items-center gap-2">
                  <Wallet size={12} /> Non-Amex Expenses
                </h3>
                <NonAmexExpenseList data={data.nonAmexExpenses || []} refresh={fetchData} />
              </div>
            </div>

            {groceryOverBudget && (
              <div className="flex items-start gap-3 bg-red-500/20 border border-red-500/40 rounded-2xl p-4 mb-2">
                <span className="text-red-400 text-lg mt-0.5">⚠️</span>
                <div>
                  <p className="text-red-300 font-black text-xs uppercase tracking-widest">Grocery budget exceeded!</p>
                  <p className="text-red-200 text-xs mt-1">
                    Your grocery portion this month is <span className="font-bold">{formatCurrency(totalAmexGroceryMine)}</span>, which exceeds your effective day-to-day budget of <span className="font-bold">{formatCurrency(effectiveDayToDayBudget)}</span> by <span className="font-bold text-red-400">{formatCurrency(overspendAmount)}</span>.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-black/20 p-6 rounded-2xl border border-white/5">
              <div className="flex flex-col md:flex-row gap-8 mb-6">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Total Statement Should Be</p>
                  <p className="text-3xl font-black font-mono text-white">{formatCurrency(expectedAmexStatement)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">My Personal Portion</p>
                  <p className={`text-3xl font-black font-mono ${groceryOverBudget ? 'text-red-400' : 'text-indigo-400'}`}>{formatCurrency(myAmexPortion)}</p>
                </div>
              </div>
              <div className="border-t border-white/10 pt-4 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-3">Breakdown</p>
                <div className="flex justify-between text-xs text-indigo-200">
                  <span>Recurring subscriptions (full)</span>
                  <span className="font-mono">{formatCurrency(totalAmexRecurringFull)}</span>
                </div>
                <div className="flex justify-between text-xs text-indigo-200">
                  <span>Day-to-day / Amex expenses budget</span>
                  <span className="font-mono">{formatCurrency(totalAmexExpenses)}</span>
                </div>
                {totalNonAmex > 0 && (
                  <div className="flex justify-between text-xs text-rose-300">
                    <span>Non-Amex spend deduction</span>
                    <span className="font-mono">-{formatCurrency(totalNonAmex)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-indigo-200">
                  <span>Grocery shop total (full)</span>
                  <span className="font-mono">{formatCurrency(totalAmexGroceryFull)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-300 border-t border-white/10 pt-2">
                  <span>↳ My grocery portion + recurring share</span>
                  <span className="font-mono">{formatCurrency(totalAmexGroceryMine + totalAmexRecurringMine)} of {formatCurrency(effectiveDayToDayBudget + totalAmexRecurringMine)} budget</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
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
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [myShare, setMyShare] = useState('0.5');
  const [categoryId, setCategoryId] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createSharedBill({ name, amount, myShare, categoryId });
    setName(''); setAmount(''); refresh();
  };

  return (
    <div className="space-y-3">
      {data.map(b => (
        <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between group p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div>
             <span className="text-sm font-bold text-slate-700 block">{b.name}</span>
             {b.category && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{b.category.name}</span>}
          </div>
          <div className="flex items-center gap-4 mt-2 sm:mt-0">
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase">Full Bill</p>
              <p className="font-mono text-xs">{formatCurrency(b.amount)}</p>
            </div>
            <div className="text-right border-l border-slate-200 pl-4">
              <p className="text-[10px] text-emerald-600 font-bold uppercase">My Half ({(b.myShare*100).toFixed(0)}%)</p>
              <p className="font-mono font-bold text-sm text-emerald-700">{formatCurrency(b.amount * b.myShare)}</p>
            </div>
            <button onClick={() => api.deleteSharedBill(b.id).then(refresh)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
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
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [isAmex, setIsAmex] = useState(false);
  const [categoryId, setCategoryId] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createExpense({ name, amount, isAmex, categoryId });
    setName(''); setAmount(''); setIsAmex(false); refresh();
  };

  return (
    <div className="space-y-3">
      {data.map(e => (
        <div key={e.id} className="flex justify-between items-center group p-3 bg-slate-50 rounded-xl border border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-700">{e.name}</span>
              {e.isAmex && <span className="bg-indigo-100 text-indigo-700 text-[8px] font-black uppercase px-1.5 py-0.5 rounded">Amex</span>}
            </div>
            {e.category && <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{e.category.name}</span>}
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono font-bold text-slate-800">{formatCurrency(e.amount)}</span>
            <button onClick={() => api.deleteExpense(e.id).then(refresh)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 mt-2">
        <input placeholder="Expense Name" value={name} onChange={e=>setName(e.target.value)} className="flex-1 min-w-[120px] bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none" />
        <input placeholder="£" type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-20 bg-slate-50 text-xs px-3 py-2 rounded-lg border border-slate-200 outline-none" />
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500 bg-slate-50 px-2 rounded-lg border border-slate-200 cursor-pointer">
          <input type="checkbox" checked={isAmex} onChange={e=>setIsAmex(e.target.checked)} />
          Amex
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

function AmexRecurringList({ data, refresh, amexExpenses }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [myPortionAmount, setMyPortionAmount] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createAmexRecurring({ name, amount, myPortionAmount });
    setName(''); setAmount(''); setMyPortionAmount(''); refresh();
  };

  return (
    <div className="space-y-3">
      {/* Read-only: Amex-flagged monthly expenses */}
      {amexExpenses?.length > 0 && (
        <>
          {amexExpenses.map(e => (
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
      {/* Editable recurring Amex entries */}
      {data.map(i => (
        <div key={i.id} className="flex flex-col sm:flex-row sm:items-center justify-between group border-b border-white/5 pb-2 gap-2">
          <span className="text-xs font-bold text-indigo-100">{i.name}</span>
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right">
              <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest block mb-0.5">Full £</span>
              <span className="font-mono text-xs font-bold text-white">{formatCurrency(i.amount)}</span>
            </div>
            <div className="text-right border-l border-white/10 pl-3">
              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest block mb-0.5">My Portion</span>
              <span className="font-mono text-xs font-bold text-emerald-300">{formatCurrency(i.myPortionAmount ?? i.amount)}</span>
            </div>
            <button onClick={() => api.deleteAmexRecurring(i.id).then(refresh)} className="text-indigo-400 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-1">
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

function AmexGroceryList({ data, refresh }) {
  const [name, setName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [myPortionAmount, setMyPortionAmount] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!totalAmount) return;
    await api.createAmexGrocery({ name: name || 'Shop', totalAmount, myPortionAmount: myPortionAmount || (totalAmount/2) });
    setName(''); setTotalAmount(''); setMyPortionAmount(''); refresh();
  };

  const handleRename = async (id) => {
    if (!editName.trim()) return;
    await api.updateAmexGrocery(id, { name: editName });
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
                <span className="text-xs font-bold text-indigo-100 block group-hover/name:text-indigo-300 transition-colors">
                  {i.name || 'Shop'} <span className="opacity-0 group-hover/name:opacity-50 text-[9px]">✎</span>
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
            <button onClick={() => api.deleteAmexGrocery(i.id).then(refresh)} className="text-indigo-400 hover:text-red-400 opacity-0 group-hover:opacity-100">
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

function NonAmexExpenseList({ data, refresh }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name || !amount) return;
    await api.createNonAmex({ name, amount });
    setName(''); setAmount(''); refresh();
  };

  return (
    <div className="space-y-3">
      {data.map(i => (
        <div key={i.id} className="flex justify-between items-center group border-b border-white/5 pb-2">
          <span className="text-xs font-bold text-rose-100">{i.name}</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs font-bold text-white">-{formatCurrency(i.amount)}</span>
            <button onClick={() => api.deleteNonAmex(i.id).then(refresh)} className="text-rose-400 hover:text-red-400 opacity-0 group-hover:opacity-100">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ))}
      <form onSubmit={handleAdd} className="flex gap-2 pt-2">
        <input placeholder="Non-Amex spend..." value={name} onChange={e=>setName(e.target.value)} className="flex-1 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-rose-400" />
        <input placeholder="£" type="number" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="w-16 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-rose-400" />
        <button type="submit" className="bg-rose-500 text-white p-2 rounded-lg hover:bg-rose-600"><Plus size={14} /></button>
      </form>
    </div>
  );
}
