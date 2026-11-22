import { useState, useEffect } from 'react';
import { 
  CreditCard, RefreshCw, Settings2, AlertTriangle, CheckCircle2, 
  Plus, Trash2, ShieldCheck, Unlink, Calendar, HelpCircle, ArrowDownRight, 
  ArrowUpRight, DollarSign, Wallet, ShieldAlert
} from 'lucide-react';
import * as api from '../../lib/budgetApi';

const formatCurrency = (val) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(val || 0);

export default function LiveCreditCardBudgetMonitor({ 
  primaryCardAllowance = 0, 
  expenses = [],
  recurringBills = [],
  onAllowanceChange, 
  refreshParent 
}) {
  const [metrics, setMetrics] = useState(null);
  const [creditCardBills, setCreditCardBills] = useState(recurringBills || []);
  const [cardExpenses, setCardExpenses] = useState((expenses || []).filter(e => e.isPrimaryCard || e.isCreditCard));
  const [manualPayments, setManualPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [allowanceInput, setAllowanceInput] = useState(primaryCardAllowance || '');

  useEffect(() => {
    if (expenses?.length) {
      setCardExpenses(expenses.filter(e => e.isPrimaryCard || e.isCreditCard));
    }
  }, [expenses]);

  useEffect(() => {
    if (recurringBills?.length) {
      setCreditCardBills(recurringBills);
    }
  }, [recurringBills]);

  // Modal State for Card Configuration
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [activeTab, setActiveTab] = useState('primary'); // 'primary' | 'secondary'
  const [tlStatus, setTlStatus] = useState(null);
  const [primaryCardsList, setPrimaryCardsList] = useState([]);
  const [secondaryCardsList, setSecondaryCardsList] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);

  // Form State for Card Settings
  const [configForm, setConfigForm] = useState({
    // Primary
    cardAccountId: '',
    cardDisplayName: 'Primary Card',
    statementClosingDay: 19,
    paymentDueDay: 1,
    lastStatementAmount: '',
    // Secondary
    secondaryCardAccountId: '',
    secondaryCardDisplayName: 'Secondary Card',
    secondaryStatementClosingDay: 19,
    secondaryPaymentDueDay: 1,
    secondaryLastStatementAmount: ''
  });

  // Forms for adding Bills & Manual Payments
  const [newBillName, setNewBillName] = useState('');
  const [newBillAmount, setNewBillAmount] = useState('');
  const [newManualName, setNewManualName] = useState('');
  const [newManualAmount, setNewManualAmount] = useState('');

  const fetchLiveMonitorData = async () => {
    try {
      const [monitorData, budgetAll] = await Promise.all([
        api.getLiveCardMonitor(),
        api.getAllBudgetData()
      ]);
      setMetrics(monitorData);
      setCreditCardBills(budgetAll.primaryCardRecurring || budgetAll.cardRecurring || []);
      setCardExpenses((budgetAll.expenses || []).filter(e => e.isPrimaryCard || e.isCreditCard));
      setManualPayments(budgetAll.secondaryCardExpenses || budgetAll.secondaryCards || []);
      if (budgetAll.primaryCardAllowance !== undefined) {
        setAllowanceInput(budgetAll.primaryCardAllowance);
      }
    } catch (err) {
      console.error('[Live Card Monitor Fetch Error]', err);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchLiveMonitorData();

    // Check for TrueLayer OAuth redirect return
    const params = new URLSearchParams(window.location.search);
    if (params.get('truelayer') === 'connected') {
      const type = params.get('cardType') || 'card';
      alert(`${type === 'secondary' ? 'Secondary' : 'Primary'} card connected successfully via TrueLayer!`);
      window.history.replaceState({}, '', window.location.pathname);
      fetchLiveMonitorData();
    } else if (params.get('truelayer') === 'error') {
      alert(`TrueLayer connection error: ${params.get('msg') || 'Authentication failed'}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await fetchLiveMonitorData();
  };

  const handleSaveAllowance = async () => {
    const val = Number(allowanceInput) || 0;
    try {
      await api.updatePrimaryCardAllowance(val);
      if (onAllowanceChange) onAllowanceChange(val);
      await fetchLiveMonitorData();
    } catch (err) {
      console.error('Failed to update allowance', err);
    }
  };

  // ── Credit Card Bills (Subtracted from live balance) ─────────────────────────
  const handleAddBill = async (e) => {
    e.preventDefault();
    if (!newBillName.trim() || !newBillAmount) return;
    try {
      await api.createPrimaryCardRecurring({
        name: newBillName.trim(),
        amount: Number(newBillAmount),
        myPortionAmount: Number(newBillAmount)
      });
      setNewBillName('');
      setNewBillAmount('');
      await fetchLiveMonitorData();
      if (refreshParent) refreshParent();
    } catch (err) {
      alert(err.message || 'Failed to add credit card bill');
    }
  };

  const handleDeleteBill = async (id) => {
    try {
      await api.deletePrimaryCardRecurring(id);
      await fetchLiveMonitorData();
      if (refreshParent) refreshParent();
    } catch (err) {
      alert(err.message || 'Failed to delete bill');
    }
  };

  // ── Manual Extra Payments / Spend (Additive pot) ───────────────────────────
  const handleAddManual = async (e) => {
    e.preventDefault();
    if (!newManualName.trim() || !newManualAmount) return;
    try {
      await api.createSecondaryCardExpense({
        name: newManualName.trim(),
        amount: Number(newManualAmount)
      });
      setNewManualName('');
      setNewManualAmount('');
      await fetchLiveMonitorData();
      if (refreshParent) refreshParent();
    } catch (err) {
      alert(err.message || 'Failed to add manual payment');
    }
  };

  const handleDeleteManual = async (id) => {
    try {
      await api.deleteSecondaryCardExpense(id);
      await fetchLiveMonitorData();
      if (refreshParent) refreshParent();
    } catch (err) {
      alert(err.message || 'Failed to delete payment');
    }
  };

  // ── Modal & Card Configuration ──────────────────────────────────────────────
  const handleOpenConfigModal = async () => {
    setShowConfigModal(true);
    setLoadingCards(true);
    try {
      const status = await api.getTrueLayerStatus();
      setTlStatus(status);
      setConfigForm({
        cardAccountId: status.primary?.cardAccountId || '',
        cardDisplayName: status.primary?.cardDisplayName || 'Primary Card',
        statementClosingDay: status.primary?.statementClosingDay ?? 19,
        paymentDueDay: status.primary?.paymentDueDay ?? 1,
        lastStatementAmount: status.primary?.lastStatementAmount ?? '',
        secondaryCardAccountId: status.secondary?.cardAccountId || '',
        secondaryCardDisplayName: status.secondary?.cardDisplayName || 'Secondary Card',
        secondaryStatementClosingDay: status.secondary?.statementClosingDay ?? 19,
        secondaryPaymentDueDay: status.secondary?.paymentDueDay ?? 1,
        secondaryLastStatementAmount: status.secondary?.lastStatementAmount ?? ''
      });

      // Fetch cards for primary if connected
      if (status.primary?.isConnected) {
        try {
          const res = await api.getTrueLayerCards('primary');
          setPrimaryCardsList(res.cards || []);
        } catch (e) {
          console.warn('Could not list primary cards:', e);
        }
      }

      // Fetch cards for secondary if connected
      if (status.secondary?.isConnected) {
        try {
          const res2 = await api.getTrueLayerCards('secondary');
          setSecondaryCardsList(res2.cards || []);
        } catch (e) {
          console.warn('Could not list secondary cards:', e);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCards(false);
    }
  };

  const handleConnectCard = async (cardType) => {
    try {
      const { url } = await api.getTrueLayerAuthUrl(cardType);
      window.location.href = url;
    } catch (err) {
      alert(err.message || `Failed to initiate connection for ${cardType} card`);
    }
  };

  const handleDisconnectCard = async (cardType) => {
    if (!window.confirm(`Are you sure you want to disconnect your ${cardType} card?`)) return;
    try {
      await api.disconnectTrueLayer(cardType);
      alert(`Disconnected ${cardType} card.`);
      setShowConfigModal(false);
      await fetchLiveMonitorData();
    } catch (err) {
      alert(err.message || 'Failed to disconnect card');
    }
  };

  const handleSaveCardConfig = async (e) => {
    e.preventDefault();
    try {
      await api.updateTrueLayerConfig({
        primaryCardAccountId: configForm.cardAccountId || null,
        primaryCardDisplayName: configForm.cardDisplayName,
        statementClosingDay: Number(configForm.statementClosingDay) || 19,
        paymentDueDay: Number(configForm.paymentDueDay) || 1,
        lastStatementAmount: Number(configForm.lastStatementAmount) || 0,
        secondaryCardAccountId: configForm.secondaryCardAccountId || null,
        secondaryCardDisplayName: configForm.secondaryCardDisplayName,
        secondaryStatementClosingDay: Number(configForm.secondaryStatementClosingDay) || 19,
        secondaryPaymentDueDay: Number(configForm.secondaryPaymentDueDay) || 1,
        secondaryLastStatementAmount: Number(configForm.secondaryLastStatementAmount) || 0
      });
      alert('Card configurations updated successfully!');
      setShowConfigModal(false);
      await fetchLiveMonitorData();
    } catch (err) {
      alert(err.message || 'Failed to update configuration');
    }
  };

  const primary = metrics?.primaryCard;
  const secondary = metrics?.secondaryCard;
  const allowance = Number(allowanceInput) || metrics?.budgetAllowance || 0;

  const totalCardExpenses = cardExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalRecurringBills = creditCardBills.reduce((s, b) => s + (b.amount || 0), 0);
  const totalCreditCardBills = metrics?.totalCreditCardBills ?? (totalRecurringBills + totalCardExpenses);

  const totalLiveCardSpend = metrics?.totalLiveCardSpend ?? ((primary?.activeCycleSpend || 0) + (secondary?.activeCycleSpend || 0));
  const netLiveCardSpend = Math.max(0, totalLiveCardSpend - totalCreditCardBills);
  const manualPaymentsTotal = metrics?.manualPayments ?? manualPayments.reduce((s, m) => s + (m.amount || 0), 0);
  const totalSpendUsed = netLiveCardSpend + manualPaymentsTotal;
  const remainingBudget = allowance - totalSpendUsed;
  const isOverBudget = allowance > 0 && totalSpendUsed > allowance;
  const overspendAmount = Math.max(0, totalSpendUsed - allowance);
  const burnPercent = allowance > 0 ? Math.min(100, Math.round((totalSpendUsed / allowance) * 100)) : 0;

  return (
    <div className="bg-gradient-to-br from-indigo-950 via-slate-950 to-indigo-950 rounded-[2rem] p-6 sm:p-8 text-white shadow-2xl overflow-hidden relative border border-indigo-900/50">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none" />

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
            <CreditCard size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black tracking-tight text-white">Live Credit Card Budget Monitor</h2>
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live TrueLayer
              </span>
            </div>
            <p className="text-indigo-300/80 text-xs font-semibold mt-0.5">
              Live balances & real-time spending tracker against your monthly budget allowance
            </p>
          </div>
        </div>

        {/* Action Controls & Allowance */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Allowance Box */}
          <div className="bg-white/10 rounded-xl px-3 py-2 border border-white/15 flex items-center gap-3 shadow-inner">
            <div>
              <p className="text-[9px] text-indigo-300 font-bold uppercase tracking-wider">Budget Allowance</p>
              <p className="text-[11px] text-slate-300 font-medium">Monthly ceiling</p>
            </div>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/80 font-bold text-sm">£</span>
              <input 
                type="number"
                value={allowanceInput}
                onChange={(e) => setAllowanceInput(e.target.value)}
                onBlur={handleSaveAllowance}
                placeholder="1000"
                className="w-24 bg-indigo-950/70 text-white font-mono font-bold text-base px-2 py-1 pl-6 rounded-lg border border-indigo-400/40 outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 bg-indigo-600/40 hover:bg-indigo-600/60 text-indigo-200 text-xs font-bold px-3 py-2.5 rounded-xl border border-indigo-400/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            title="Refresh live balances from TrueLayer"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Live'}</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={handleOpenConfigModal}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-2.5 rounded-xl border border-white/20 transition-all hover:scale-105 active:scale-95"
          >
            <Settings2 size={14} />
            <span>Card Settings</span>
          </button>
        </div>
      </div>

      {/* ── OVERSPEND WARNING BANNER ────────────────────────────────────────── */}
      {isOverBudget && (
        <div className="relative z-10 mb-6 bg-rose-500/20 border-2 border-rose-500/50 rounded-2xl p-4 sm:p-5 flex items-start gap-4 shadow-xl backdrop-blur-md animate-pulse">
          <div className="p-2 rounded-xl bg-rose-600 text-white shrink-0 mt-0.5">
            <ShieldAlert size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-black text-rose-200 uppercase tracking-wide flex items-center gap-2">
              ⚠️ Budget Exceeded Warning
            </h4>
            <p className="text-rose-100 text-xs sm:text-sm mt-1">
              You are currently <span className="font-extrabold text-white underline">{formatCurrency(overspendAmount)}</span> over your set budget allowance limit! 
              Total spend counted against your budget is <span className="font-extrabold text-white">{formatCurrency(totalSpendUsed)}</span> versus your allowance of <span className="font-extrabold text-white">{formatCurrency(allowance)}</span>.
            </p>
          </div>
        </div>
      )}

      {/* ── TOP HERO METRICS & PROGRESS BAR ─────────────────────────────────── */}
      <div className="relative z-10 bg-white/5 rounded-2xl p-5 sm:p-6 border border-white/10 backdrop-blur-md mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
          {/* Card 1: Total Spend Used */}
          <div className="border-b sm:border-b-0 sm:border-r border-white/10 pb-4 sm:pb-0 sm:pr-6">
            <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <ArrowDownRight size={13} className="text-rose-400" />
              Total Discretionary Spend
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black font-mono text-white tracking-tight">
                {formatCurrency(totalSpendUsed)}
              </p>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Live Card Spend − Bills + Manual
            </p>
          </div>

          {/* Card 2: Budget Remaining */}
          <div className="border-b sm:border-b-0 sm:border-r border-white/10 pb-4 sm:pb-0 sm:pr-6">
            <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <ArrowUpRight size={13} className={remainingBudget >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              Budget Remaining
            </p>
            <div className="flex items-baseline gap-2">
              <p className={`text-3xl font-black font-mono tracking-tight ${remainingBudget >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(remainingBudget)}
              </p>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {remainingBudget >= 0 ? 'Available allowance to spend' : 'Over limit by ' + formatCurrency(Math.abs(remainingBudget))}
            </p>
          </div>

          {/* Card 3: Monthly Limit */}
          <div>
            <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Wallet size={13} className="text-indigo-400" />
              Budget Allowance
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black font-mono text-indigo-200 tracking-tight">
                {formatCurrency(allowance)}
              </p>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {burnPercent}% of allowance utilized
            </p>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-slate-300">
            <span>Spend Velocity</span>
            <span className={isOverBudget ? 'text-rose-400 font-mono font-bold' : 'text-indigo-300 font-mono'}>
              {burnPercent}% used ({formatCurrency(totalSpendUsed)} of {formatCurrency(allowance)})
            </span>
          </div>
          <div className="h-3.5 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                isOverBudget 
                  ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-lg shadow-rose-500/50' 
                  : burnPercent > 80 
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500' 
                    : 'bg-gradient-to-r from-emerald-500 to-indigo-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(2, burnPercent))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── TWO LIVE CARD STATUS TILES ───────────────────────────────────────── */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* 1. Primary Card Tile */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <CreditCard size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    {primary?.cardDisplayName || 'Primary Card'}
                  </h3>
                  <span className="text-[10px] text-indigo-300 font-semibold block">
                    {primary?.cardholderName ? `Cardholder: ${primary.cardholderName}` : 'Primary Account'}
                  </span>
                </div>
              </div>

              {primary?.isConnected ? (
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Connected
                </span>
              ) : (
                <button
                  onClick={() => handleConnectCard('primary')}
                  className="text-[10px] font-bold uppercase tracking-wider bg-indigo-500 hover:bg-indigo-600 text-white px-2.5 py-1 rounded-lg transition-colors"
                >
                  Connect TrueLayer
                </button>
              )}
            </div>

            <div className="bg-black/30 rounded-xl p-4 border border-white/5 space-y-3 mb-4">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-400 font-medium">TrueLayer Live Balance</span>
                <span className="font-mono text-xl font-bold text-white">
                  {formatCurrency(primary?.rawBalance)}
                </span>
              </div>

              {/* Statement Gap Status */}
              <div className="border-t border-white/10 pt-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                    <Calendar size={11} className="text-indigo-400" />
                    Statement Gap Window ({primary?.statementClosingDay || 19}th → {primary?.paymentDueDay || 1}st)
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {primary?.isGapActive 
                      ? 'Deducting unpaid statement awaiting Direct Debit'
                      : 'Inactive (Direct Debit already cleared)'}
                  </span>
                </div>
                <span className={`font-mono text-xs font-bold px-2 py-1 rounded-lg ${
                  primary?.isGapActive 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                    : 'bg-white/5 text-slate-400'
                }`}>
                  {primary?.isGapActive ? `-${formatCurrency(primary?.gapDeduction)}` : '£0.00'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-indigo-950/60 rounded-xl p-3 border border-indigo-400/20 flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-200">Net Active Cycle Spend</span>
            <span className="font-mono text-base font-black text-indigo-100">
              {formatCurrency(primary?.activeCycleSpend)}
            </span>
          </div>
        </div>

        {/* 2. Secondary Card Tile */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                  <CreditCard size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    {secondary?.cardDisplayName || 'Secondary Card'}
                  </h3>
                  <span className="text-[10px] text-purple-300 font-semibold block">
                    {secondary?.cardholderName ? `Cardholder: ${secondary.cardholderName}` : 'Secondary Account'}
                  </span>
                </div>
              </div>

              {secondary?.isConnected ? (
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Connected
                </span>
              ) : (
                <button
                  onClick={() => handleConnectCard('secondary')}
                  className="text-[10px] font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded-lg transition-colors"
                >
                  Connect TrueLayer
                </button>
              )}
            </div>

            <div className="bg-black/30 rounded-xl p-4 border border-white/5 space-y-3 mb-4">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-slate-400 font-medium">TrueLayer Live Balance</span>
                <span className="font-mono text-xl font-bold text-white">
                  {formatCurrency(secondary?.rawBalance)}
                </span>
              </div>

              {/* Statement Gap Status */}
              <div className="border-t border-white/10 pt-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1">
                    <Calendar size={11} className="text-purple-400" />
                    Statement Gap Window ({secondary?.statementClosingDay || 19}th → {secondary?.paymentDueDay || 1}st)
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {secondary?.isGapActive 
                      ? 'Deducting unpaid statement awaiting Direct Debit'
                      : 'Inactive (Direct Debit already cleared)'}
                  </span>
                </div>
                <span className={`font-mono text-xs font-bold px-2 py-1 rounded-lg ${
                  secondary?.isGapActive 
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                    : 'bg-white/5 text-slate-400'
                }`}>
                  {secondary?.isGapActive ? `-${formatCurrency(secondary?.gapDeduction)}` : '£0.00'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-purple-950/60 rounded-xl p-3 border border-purple-400/20 flex items-center justify-between">
            <span className="text-xs font-bold text-purple-200">Net Active Cycle Spend</span>
            <span className="font-mono text-base font-black text-purple-100">
              {formatCurrency(secondary?.activeCycleSpend)}
            </span>
          </div>
        </div>

      </div>

      {/* ── DEDUCTIONS & MANUAL SPEND LISTS ──────────────────────────────────── */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        
        {/* 1. Credit Card Bills (Subtracted from live balance) */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-300 flex items-center gap-2">
                <CreditCard size={14} className="text-indigo-400" />
                Credit Card Bills (Deducted from Balance)
              </h3>
              <span className="font-mono text-xs font-bold text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                -{formatCurrency(metrics?.totalCreditCardBills)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Fixed recurring subscriptions or bills paid on your credit card. These are subtracted from your live balance so only discretionary spending counts against your budget.
            </p>

            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto pr-1">
              {/* Flagged Monthly Expenses from Budget */}
              {cardExpenses?.length > 0 && (
                <>
                  <div className="text-[9px] font-black uppercase tracking-wider text-indigo-300/80 pt-1 pb-1 flex items-center justify-between">
                    <span>Monthly Expenses (Card-Flagged)</span>
                    <span className="font-mono text-[10px] text-indigo-300">
                      -{formatCurrency(cardExpenses.reduce((s, e) => s + (e.amount || 0), 0))}
                    </span>
                  </div>
                  {cardExpenses.map((e) => (
                    <div key={e.id} className="flex items-center justify-between group border-b border-white/5 pb-2 opacity-85">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-400/10 px-1.5 py-0.5 rounded shrink-0">
                          Expense
                        </span>
                        <span className="text-xs font-bold text-indigo-100 truncate">{e.name}</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-white shrink-0">
                        -{formatCurrency(e.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="text-[9px] font-black uppercase tracking-wider text-indigo-300/80 pt-3 pb-1 border-t border-white/10 flex items-center justify-between">
                    <span>Recurring Card Subscriptions</span>
                    <span className="font-mono text-[10px] text-indigo-300">
                      -{formatCurrency(creditCardBills.reduce((s, b) => s + (b.amount || 0), 0))}
                    </span>
                  </div>
                </>
              )}

              {/* Recurring Card Subscriptions */}
              {creditCardBills.length === 0 && (!cardExpenses || cardExpenses.length === 0) ? (
                <p className="text-xs text-slate-500 italic py-2">No credit card bills logged yet.</p>
              ) : (
                creditCardBills.map((b) => (
                  <div key={b.id} className="flex items-center justify-between group border-b border-white/5 pb-2">
                    <span className="text-xs font-bold text-indigo-100 truncate pr-2">{b.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">-{formatCurrency(b.amount)}</span>
                      <button 
                        onClick={() => handleDeleteBill(b.id)}
                        className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 p-1 transition-opacity"
                        title="Delete bill"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add Bill Form */}
          <form onSubmit={handleAddBill} className="flex gap-2 pt-2 border-t border-white/10">
            <input 
              placeholder="e.g. Netflix, Gym, Utilities..." 
              value={newBillName} 
              onChange={e => setNewBillName(e.target.value)} 
              className="flex-1 min-w-[120px] bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-indigo-400" 
            />
            <input 
              placeholder="£ amount" 
              type="number" 
              step="0.01" 
              value={newBillAmount} 
              onChange={e => setNewBillAmount(e.target.value)} 
              className="w-20 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-indigo-400" 
            />
            <button 
              type="submit" 
              className="bg-indigo-500 text-white px-3 py-2 rounded-lg hover:bg-indigo-600 transition-colors shrink-0"
              title="Add credit card bill"
            >
              <Plus size={14} />
            </button>
          </form>
        </div>

        {/* 2. Manual Additional Payments / Spending (Additive pot) */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-purple-300 flex items-center gap-2">
                <Wallet size={14} className="text-purple-400" />
                Manual Additional Payments / Spend
              </h3>
              <span className="font-mono text-xs font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                +{formatCurrency(metrics?.manualPayments)}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Optional manual spending or extra card payments added to your total spend pot. (Unlikely to be needed, but available for ad-hoc tracking).
            </p>

            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto pr-1">
              {manualPayments.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">No manual payments logged.</p>
              ) : (
                manualPayments.map((m) => (
                  <div key={m.id} className="flex items-center justify-between group border-b border-white/5 pb-2">
                    <span className="text-xs font-bold text-purple-100 truncate pr-2">{m.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">+{formatCurrency(m.amount)}</span>
                      <button 
                        onClick={() => handleDeleteManual(m.id)}
                        className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 p-1 transition-opacity"
                        title="Delete payment"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add Manual Form */}
          <form onSubmit={handleAddManual} className="flex gap-2 pt-2 border-t border-white/10">
            <input 
              placeholder="e.g. Cash purchase, extra item..." 
              value={newManualName} 
              onChange={e => setNewManualName(e.target.value)} 
              className="flex-1 min-w-[120px] bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-purple-400" 
            />
            <input 
              placeholder="£ amount" 
              type="number" 
              step="0.01" 
              value={newManualAmount} 
              onChange={e => setNewManualAmount(e.target.value)} 
              className="w-20 bg-white/10 text-white placeholder:text-white/30 text-xs px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-purple-400" 
            />
            <button 
              type="submit" 
              className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors shrink-0"
              title="Add manual item"
            >
              <Plus size={14} />
            </button>
          </form>
        </div>

      </div>

      {/* ── EXACT CALCULATION SUMMARY EQUATION ─────────────────────────────────── */}
      <div className="relative z-10 bg-black/25 rounded-2xl p-5 border border-white/5 text-xs">
        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-3">
          Budget Adherence Formula Breakdown
        </p>
        <div className="space-y-1.5 font-mono text-slate-300">
          <div className="flex justify-between">
            <span>1. Combined Live Cards Active Spend (Primary + Secondary):</span>
            <span className="text-white font-bold">{formatCurrency(metrics?.totalLiveCardSpend)}</span>
          </div>
          <div className="flex justify-between text-rose-300">
            <span>2. Minus Credit Card Bills (Fixed subscriptions/bills):</span>
            <span>-{formatCurrency(metrics?.totalCreditCardBills)}</span>
          </div>
          <div className="flex justify-between text-purple-300">
            <span>3. Plus Manual Extra Payments / Spend:</span>
            <span>+{formatCurrency(metrics?.manualPayments)}</span>
          </div>
          <div className="border-t border-white/10 pt-2 flex justify-between text-sm text-white font-bold">
            <span className="font-sans">Total Discretionary Spend Counted Against Budget:</span>
            <span className={isOverBudget ? 'text-rose-400' : 'text-indigo-300'}>
              {formatCurrency(totalSpendUsed)}
            </span>
          </div>
          <div className="flex justify-between text-slate-400 text-xs pt-1">
            <span className="font-sans">Monthly Budget Allowance Ceiling:</span>
            <span>{formatCurrency(allowance)}</span>
          </div>
          <div className="border-t border-white/10 pt-2 flex justify-between font-sans font-black text-sm">
            <span>Status:</span>
            <span className={isOverBudget ? 'text-rose-400' : 'text-emerald-400'}>
              {isOverBudget ? `OVER BUDGET BY ${formatCurrency(overspendAmount)}` : `WITHIN BUDGET (${formatCurrency(remainingBudget)} Remaining)`}
            </span>
          </div>
        </div>
      </div>

      {/* ── CARD SETTINGS MODAL ──────────────────────────────────────────────── */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl text-white relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <Settings2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-white">Dual Credit Card Configuration</h3>
                  <p className="text-xs text-slate-400">Manage TrueLayer connections, statement closing & payment days</p>
                </div>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Tabs for Primary vs Secondary */}
            <div className="flex border-b border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => setActiveTab('primary')}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-all ${
                  activeTab === 'primary' 
                    ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Primary Card {tlStatus?.primary?.isConnected ? '✓' : ''}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('secondary')}
                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-all ${
                  activeTab === 'secondary' 
                    ? 'border-purple-500 text-purple-400 bg-purple-500/10' 
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Secondary Card {tlStatus?.secondary?.isConnected ? '✓' : ''}
              </button>
            </div>

            <form onSubmit={handleSaveCardConfig} className="space-y-6">
              
              {/* PRIMARY CARD SETTINGS */}
              {activeTab === 'primary' && (
                <div className="space-y-4">
                  <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">TrueLayer Connection</p>
                      <p className="text-[11px] text-slate-400">
                        {tlStatus?.primary?.isConnected ? 'Active & authenticated' : 'Not linked to a bank yet'}
                      </p>
                    </div>
                    {tlStatus?.primary?.isConnected ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConnectCard('primary')}
                          className="text-xs font-bold text-indigo-400 hover:text-indigo-300 underline"
                        >
                          Re-authenticate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnectCard('primary')}
                          className="text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleConnectCard('primary')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Connect Primary Card
                      </button>
                    )}
                  </div>

                  {primaryCardsList.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Select Primary Card Account
                      </label>
                      <select
                        value={configForm.cardAccountId}
                        onChange={e => setConfigForm({ ...configForm, cardAccountId: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                      >
                        <option value="">-- Choose account --</option>
                        {primaryCardsList.map(c => (
                          <option key={c.account_id} value={c.account_id}>
                            {c.display_name || c.name_on_card || c.account_id} ({c.currency} {c.card_network || 'Card'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Card Display Label
                    </label>
                    <input
                      type="text"
                      value={configForm.cardDisplayName}
                      onChange={e => setConfigForm({ ...configForm, cardDisplayName: e.target.value })}
                      placeholder="e.g. Primary Amex"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Statement Closing Day
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={configForm.statementClosingDay}
                        onChange={e => setConfigForm({ ...configForm, statementClosingDay: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Day of month (default: 19th)</span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Payment Due Day
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={configForm.paymentDueDay}
                        onChange={e => setConfigForm({ ...configForm, paymentDueDay: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Direct Debit clearance day (default: 1st)</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Last Statement Amount (£)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={configForm.lastStatementAmount}
                      onChange={e => setConfigForm({ ...configForm, lastStatementAmount: e.target.value })}
                      placeholder="e.g. 1450.00"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      This amount is automatically subtracted from your live balance between the closing day and payment day to avoid double-counting last month's unpaid bill.
                    </span>
                  </div>
                </div>
              )}

              {/* SECONDARY CARD SETTINGS */}
              {activeTab === 'secondary' && (
                <div className="space-y-4">
                  <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">Secondary Card Connection</p>
                      <p className="text-[11px] text-slate-400">
                        {tlStatus?.secondary?.isConnected ? 'Active & authenticated' : 'Supports different bank login'}
                      </p>
                    </div>
                    {tlStatus?.secondary?.isConnected ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConnectCard('secondary')}
                          className="text-xs font-bold text-purple-400 hover:text-purple-300 underline"
                        >
                          Re-authenticate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnectCard('secondary')}
                          className="text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleConnectCard('secondary')}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Connect Secondary Card
                      </button>
                    )}
                  </div>

                  {(secondaryCardsList.length > 0 || primaryCardsList.length > 0) && (
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Select Secondary Card Account
                      </label>
                      <select
                        value={configForm.secondaryCardAccountId}
                        onChange={e => setConfigForm({ ...configForm, secondaryCardAccountId: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                      >
                        <option value="">-- Choose account --</option>
                        {(secondaryCardsList.length > 0 ? secondaryCardsList : primaryCardsList).map(c => (
                          <option key={c.account_id} value={c.account_id}>
                            {c.display_name || c.name_on_card || c.account_id} ({c.currency} {c.card_network || 'Card'})
                          </option>
                        ))}
                      </select>
                      {secondaryCardsList.length === 0 && primaryCardsList.length > 0 && (
                        <span className="text-[10px] text-purple-300 mt-0.5 block">
                          Listing cards from your primary TrueLayer connection (e.g. second card from same bank).
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Secondary Card Display Label
                    </label>
                    <input
                      type="text"
                      value={configForm.secondaryCardDisplayName}
                      onChange={e => setConfigForm({ ...configForm, secondaryCardDisplayName: e.target.value })}
                      placeholder="e.g. Barclaycard / Visa"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Statement Closing Day
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={configForm.secondaryStatementClosingDay}
                        onChange={e => setConfigForm({ ...configForm, secondaryStatementClosingDay: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Day of month (default: 19th)</span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                        Payment Due Day
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={configForm.secondaryPaymentDueDay}
                        onChange={e => setConfigForm({ ...configForm, secondaryPaymentDueDay: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                      />
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Direct Debit clearance day (default: 1st)</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Last Statement Amount (£)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={configForm.secondaryLastStatementAmount}
                      onChange={e => setConfigForm({ ...configForm, secondaryLastStatementAmount: e.target.value })}
                      placeholder="e.g. 500.00"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Subtracted from secondary live balance during the statement gap period.
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all"
                >
                  Save Settings
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
