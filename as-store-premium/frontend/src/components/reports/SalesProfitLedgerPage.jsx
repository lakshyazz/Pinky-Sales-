import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  Calendar,
  Search,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Building2,
  Package,
  Layers,
  IndianRupee,
  Receipt,
  Eye,
  EyeOff,
  Percent,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Wrench,
  Edit3,
  Check,
  X,
  ShieldAlert,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const currency = (v) => `₹${money(v).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const getTodayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getYesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getMonthStartStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

const getWeekStartStr = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dt = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dt}`;
};

const formatDateDMY = (isoDate) => {
  if (!isoDate) return '—';
  const parts = String(isoDate).slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return isoDate;
};

export default function SalesProfitLedgerPage({
  session,
  api,
  shops = [],
  setGlobalToast,
  onViewInvoice,
}) {
  const todayStr = getTodayStr();

  // Date range presets state
  const [activePreset, setActivePreset] = useState('month'); // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
  const [dateFrom, setDateFrom] = useState(getMonthStartStr());
  const [dateTo, setDateTo] = useState(todayStr);

  // Filters state
  const [selectedShopId, setSelectedShopId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Data & loading states
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState(new Set());
  const [hideDetails, setHideDetails] = useState(() => {
    try {
      return localStorage.getItem('as_store_hide_sales_profit_details') === 'true';
    } catch (_) {
      return false;
    }
  });

  // Card value privacy mask state (persisted)
  const [hiddenCardValues, setHiddenCardValues] = useState(() => {
    try {
      const saved = localStorage.getItem('as_store_hidden_sales_card_values');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (_) {
      return new Set();
    }
  });

  const toggleCardValue = (cardKey) => {
    setHiddenCardValues((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) {
        next.delete(cardKey);
      } else {
        next.add(cardKey);
      }
      try {
        localStorage.setItem('as_store_hidden_sales_card_values', JSON.stringify(Array.from(next)));
      } catch (_) {}
      return next;
    });
  };

  // COGS Recalculation Modal State
  const [cogsModalOpen, setCogsModalOpen] = useState(false);
  const [cogsScope, setCogsScope] = useState('all'); // 'filtered' | 'all'
  const [cogsForceAll, setCogsForceAll] = useState(false);
  const [isScanningCogs, setIsScanningCogs] = useState(false);
  const [isApplyingCogs, setIsApplyingCogs] = useState(false);
  const [cogsPreview, setCogsPreview] = useState(null);

  // Inline Item Cost Edit State
  const [editingItemId, setEditingItemId] = useState(null);
  const [editCostValue, setEditCostValue] = useState('');
  const [updatingItemId, setUpdatingItemId] = useState(null);

  // Handle Preset Changes
  const handlePresetSelect = (preset) => {
    setActivePreset(preset);
    if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'yesterday') {
      const yest = getYesterdayStr();
      setDateFrom(yest);
      setDateTo(yest);
    } else if (preset === 'week') {
      setDateFrom(getWeekStartStr());
      setDateTo(todayStr);
    } else if (preset === 'month') {
      setDateFrom(getMonthStartStr());
      setDateTo(todayStr);
    }
  };

  // Fetch Report Data from API (loads full dataset for selected date/branch/status)
  const fetchReport = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);
      if (selectedShopId && selectedShopId !== 'all') params.append('shopId', selectedShopId);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await api(`/reports/sales-profit?${params.toString()}`);
      setReportData(res);
    } catch (err) {
      console.error('Error fetching sales & profit report:', err);
      if (setGlobalToast) {
        setGlobalToast({ type: 'error', message: err.message || 'Failed to load Sales & Profit Ledger' });
      }
    } finally {
      setLoading(false);
    }
  }, [api, dateFrom, dateTo, selectedShopId, statusFilter, setGlobalToast]);

  // COGS Bulk Scan & Recalculate Handlers
  const handleScanCogs = async () => {
    if (!api) return;
    setIsScanningCogs(true);
    try {
      const body = {
        dryRun: true,
        forceAll: cogsForceAll,
        fromDate: cogsScope === 'filtered' ? dateFrom : undefined,
        toDate: cogsScope === 'filtered' ? dateTo : undefined,
      };
      const res = await api('/admin/recalculate-cogs', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCogsPreview(res);
      if (res.totalCorrupted === 0 && res.totalBatchesCorrupted === 0) {
        setGlobalToast?.({ type: 'success', message: 'No cost discrepancies detected! All COGS are clean.' });
      }
    } catch (err) {
      console.error('Error scanning COGS:', err);
      setGlobalToast?.({ type: 'error', message: err.message || 'Failed to scan COGS discrepancies' });
    } finally {
      setIsScanningCogs(false);
    }
  };

  const handleCommitCogs = async () => {
    if (!api) return;
    if (!window.confirm('Are you sure you want to commit these COGS corrections to the database? This will update invoice line costs and restore true margins.')) {
      return;
    }
    setIsApplyingCogs(true);
    try {
      const body = {
        dryRun: false,
        forceAll: cogsForceAll,
        fromDate: cogsScope === 'filtered' ? dateFrom : undefined,
        toDate: cogsScope === 'filtered' ? dateTo : undefined,
      };
      const res = await api('/admin/recalculate-cogs', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setGlobalToast?.({
        type: 'success',
        message: `Successfully recalculated ${res.totalCorrupted} items across ${res.affectedInvoices?.length || 0} invoices. Recovered ₹${Number(res.totalProfitDelta || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}!`,
      });
      setCogsModalOpen(false);
      setCogsPreview(null);
      fetchReport();
    } catch (err) {
      console.error('Error committing COGS:', err);
      setGlobalToast?.({ type: 'error', message: err.message || 'Failed to commit COGS recalculation' });
    } finally {
      setIsApplyingCogs(false);
    }
  };

  // Inline Item Correction Handlers
  const handleResetItemToMaster = async (itemId, e) => {
    e?.stopPropagation();
    if (!api) return;
    setUpdatingItemId(itemId);
    try {
      await api(`/admin/sale-items/${itemId}/cogs`, {
        method: 'PATCH',
        body: JSON.stringify({ resetToMaster: true }),
      });
      setGlobalToast?.({ type: 'success', message: 'Item COGS reset to master product purchase cost!' });
      fetchReport();
    } catch (err) {
      console.error('Error resetting item COGS:', err);
      setGlobalToast?.({ type: 'error', message: err.message || 'Failed to reset item COGS' });
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleSaveCustomCost = async (itemId, e) => {
    e?.stopPropagation();
    if (!api) return;
    const cost = parseFloat(editCostValue);
    if (isNaN(cost) || cost < 0) {
      setGlobalToast?.({ type: 'error', message: 'Please enter a valid cost price' });
      return;
    }
    setUpdatingItemId(itemId);
    try {
      await api(`/admin/sale-items/${itemId}/cogs`, {
        method: 'PATCH',
        body: JSON.stringify({ purchase_price: cost }),
      });
      setGlobalToast?.({ type: 'success', message: 'Item unit cost updated successfully!' });
      setEditingItemId(null);
      setEditCostValue('');
      fetchReport();
    } catch (err) {
      console.error('Error updating item COGS:', err);
      setGlobalToast?.({ type: 'error', message: err.message || 'Failed to update item cost' });
    } finally {
      setUpdatingItemId(null);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Toggle row expansion
  const toggleInvoiceExpand = (invoiceId) => {
    setExpandedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!reportData?.invoices) return;
    setExpandedInvoices(new Set(reportData.invoices.map((i) => i.id)));
  };

  const collapseAll = () => {
    setExpandedInvoices(new Set());
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    if (!reportData?.invoices?.length) {
      if (setGlobalToast) setGlobalToast({ type: 'error', message: 'No invoice records available to export' });
      return;
    }

    const headers = [
      'Invoice No',
      'Invoice Date',
      'Branch',
      'Customer Name',
      'Customer Mobile',
      'Customer Area',
      'Items Count',
      'Total Qty (Pcs)',
      'Total Purchase Cost (₹)',
      'Billed Amount (₹)',
      'Extra Expenses (₹)',
      'Gross Profit (₹)',
      'Profit Margin (%)',
      'Paid Amount (₹)',
      'Pending Amount (₹)',
      'Payment Status',
      'Payment Mode',
    ];

    const rows = reportData.invoices.map((inv) => [
      `"${inv.invoice_number}"`,
      `"${inv.invoice_date}"`,
      `"${inv.shop_name || ''}"`,
      `"${(inv.customer_name || '').replace(/"/g, '""')}"`,
      `"${inv.customer_mobile || ''}"`,
      `"${(inv.customer_address || '').replace(/"/g, '""')}"`,
      inv.items_count,
      inv.total_quantity,
      inv.total_cost,
      inv.billed_amount,
      inv.extra_expenses_total || 0,
      inv.profit_earned,
      inv.margin_pct,
      inv.paid_amount,
      inv.pending_amount,
      `"${inv.status}"`,
      `"${inv.payment_mode || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Sales_Profit_Ledger_${dateFrom}_to_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleHideDetails = () => {
    setHideDetails((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('as_store_hide_sales_profit_details', String(next));
      } catch (_) {}
      return next;
    });
  };

  const handleCardView = (type) => {
    if (hideDetails) {
      setHideDetails(false);
      try {
        localStorage.setItem('as_store_hide_sales_profit_details', 'false');
      } catch (_) {}
    }
    if (type === 'paid') {
      setStatusFilter('paid');
    } else if (type === 'pending' || type === 'due') {
      setStatusFilter('open');
    } else if (type === 'cogs' || type === 'profit' || type === 'margin') {
      expandAll();
    }
    setTimeout(() => {
      const el = document.getElementById('sales-profit-ledger-table');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  // ─── Instant In-Memory Search (0ms Latency, searches invoice #, customer name, mobile, address, and line-item products/models) ───
  const displayedInvoices = useMemo(() => {
    const list = reportData?.invoices || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    return list.filter((inv) => {
      if (inv.invoice_number && String(inv.invoice_number).toLowerCase().includes(q)) return true;
      if (inv.customer_name && String(inv.customer_name).toLowerCase().includes(q)) return true;
      if (inv.customer_mobile && String(inv.customer_mobile).includes(q)) return true;
      if (inv.customer_address && String(inv.customer_address).toLowerCase().includes(q)) return true;
      if (inv.status && String(inv.status).toLowerCase().includes(q)) return true;
      if (inv.shop_name && String(inv.shop_name).toLowerCase().includes(q)) return true;
      if (inv.items && Array.isArray(inv.items)) {
        return inv.items.some((it) => {
          return (
            (it.product_name && String(it.product_name).toLowerCase().includes(q)) ||
            (it.model && String(it.model).toLowerCase().includes(q)) ||
            (it.quality && String(it.quality).toLowerCase().includes(q)) ||
            (it.colour && String(it.colour).toLowerCase().includes(q)) ||
            (it.mfg_brand && String(it.mfg_brand).toLowerCase().includes(q)) ||
            (it.product_brand && String(it.product_brand).toLowerCase().includes(q))
          );
        });
      }
      return false;
    });
  }, [reportData?.invoices, searchQuery]);

  // ─── Dynamic Summary (Updates in Real-Time to Match Search Results) ───
  const displayedSummary = useMemo(() => {
    if (!searchQuery.trim()) {
      return (
        reportData?.summary || {
          total_sales: 0,
          total_paid: 0,
          total_pending: 0,
          total_cost: 0,
          total_expenses: 0,
          gross_profit: 0,
          margin_pct: 0,
          invoices_count: 0,
          total_pcs_sold: 0,
          previous_period_sales: 0,
          sales_change_pct: null,
        }
      );
    }

    const totalSales = displayedInvoices.reduce((sum, inv) => sum + (Number(inv.billed_amount) || Number(inv.total_amount) || 0), 0);
    const totalPaid = displayedInvoices.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
    const totalPending = displayedInvoices.reduce((sum, inv) => sum + (Number(inv.pending_amount) || 0), 0);
    const totalCost = displayedInvoices.reduce((sum, inv) => sum + (Number(inv.total_cost) || 0), 0);
    const totalExpenses = displayedInvoices.reduce((sum, inv) => sum + (Number(inv.extra_expenses_total) || 0), 0);
    const grossProfit = totalSales - totalCost - totalExpenses;
    const marginPct = totalSales > 0 ? Number(((grossProfit / totalSales) * 100).toFixed(2)) : 0;
    const totalPcs = displayedInvoices.reduce((sum, inv) => sum + (Number(inv.total_quantity) || 0), 0);

    return {
      total_sales: totalSales,
      total_paid: totalPaid,
      total_pending: totalPending,
      total_cost: totalCost,
      total_expenses: totalExpenses,
      gross_profit: grossProfit,
      margin_pct: marginPct,
      invoices_count: displayedInvoices.length,
      total_pcs_sold: totalPcs,
      previous_period_sales: 0,
      sales_change_pct: null,
    };
  }, [reportData?.summary, displayedInvoices, searchQuery]);

  const summary = displayedSummary;
  const invoices = displayedInvoices;

  return (
    <div className="space-y-5 w-full">
      {/* ─── Header & Title Bar ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-md shadow-teal-700/20 shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 tracking-tight">Sales &amp; Profit Ledger</h1>
              <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                COGS Verified
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Track business margins, cost of goods sold, itemized profit breakdown, and invoice profitability.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh Ledger"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={toggleHideDetails}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
              hideDetails
                ? 'text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-300'
                : 'text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200'
            }`}
            title={hideDetails ? 'Show Invoices & Margin Details' : 'Hide Invoices & Margin Details'}
          >
            {hideDetails ? <Eye size={13} className="text-teal-600" /> : <EyeOff size={13} className="text-slate-500" />}
            <span>{hideDetails ? 'Show Details' : 'Hide Details'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!invoices.length}
            className="px-3.5 py-2 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Export CSV of current report"
          >
            <Download size={13} className="text-teal-600" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCogsModalOpen(true);
              if (!cogsPreview) handleScanCogs();
            }}
            className="px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300/80 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Recalculate Profit & Repair Frozen COGS"
          >
            <Wrench size={13} className="text-amber-700" />
            <span>Re-sync COGS</span>
          </button>
        </div>
      </div>

      {/* ─── Filter Toolbar & Preset Chips ─── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3.5">
        {/* Row 1: Presets & Date Pickers */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar size={13} className="text-slate-400" /> Period:
            </span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => {
              const isSelected = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetSelect(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Date Pickers */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 absolute -top-2 left-2 bg-white px-1 z-10">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActivePreset('custom');
                }}
                className="h-9 px-3 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer"
              />
            </div>
            <span className="text-slate-400 text-xs font-bold">to</span>
            <div className="relative">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 absolute -top-2 left-2 bg-white px-1 z-10">
                To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActivePreset('custom');
                }}
                className="h-9 px-3 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Search, Branch, Status Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1 border-t border-slate-100">
          {/* Search Box with instant filtering & Clear Button */}
          <div className="sm:col-span-6 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer name, mobile, address, product, or INV-xxxxxx..."
              className="w-full h-10 pl-9 pr-9 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none placeholder:text-slate-400 font-medium transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded-full cursor-pointer hover:bg-slate-200/70 transition-colors"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Branch / Workspace Selector */}
          <div className="sm:col-span-3">
            <select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
              className="w-full h-10 px-3 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer text-slate-700"
            >
              <option value="all">All Branches / Workspaces</option>
              {shops.map((sh) => (
                <option key={sh.id} value={String(sh.id)}>
                  {sh.name} {sh.location_type === 'warehouse' ? '(Warehouse)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-10 px-3 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer text-slate-700"
            >
              <option value="all">All Payment Statuses</option>
              <option value="paid">Paid in Full</option>
              <option value="partial">Partially Paid</option>
              <option value="open">Credit / Pending</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── 4 Glassmorphism Summary Metric Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales & Collection Status */}
        <div className="bg-gradient-to-br from-white to-slate-50/70 border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total Sales</span>
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => toggleCardValue('sales')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs ${
                  hiddenCardValues.has('sales')
                    ? 'text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-300'
                    : 'text-blue-700 bg-blue-50/90 hover:bg-blue-100 border border-blue-200/80'
                }`}
                title={hiddenCardValues.has('sales') ? 'Reveal Total Sales' : 'Hide Total Sales'}
              >
                {hiddenCardValues.has('sales') ? <Eye size={12} className="text-slate-600" /> : <EyeOff size={12} />}
                <span>{hiddenCardValues.has('sales') ? 'View' : 'Hide'}</span>
              </motion.button>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Receipt size={16} />
              </div>
            </div>
          </div>
          <div className="min-h-[28px] flex items-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {hiddenCardValues.has('sales') ? (
                <motion.div
                  key="sales-masked"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: -2 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={{ opacity: 0, filter: 'blur(6px)', y: 2 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="text-xl font-black text-slate-400 tracking-widest font-mono select-none"
                >
                  ••••••••
                </motion.div>
              ) : (
                <motion.div
                  key="sales-visible"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: 2 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={{ opacity: 0, filter: 'blur(6px)', y: -2 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="text-xl font-black text-slate-900 tracking-tight"
                >
                  {currency(summary.total_sales)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold">
            {summary.sales_change_pct !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${
                  summary.sales_change_pct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {summary.sales_change_pct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {Math.abs(summary.sales_change_pct)}%
              </span>
            ) : (
              <span className="text-slate-400">vs prev. period</span>
            )}
            <span className="text-slate-400 font-medium">({summary.invoices_count} orders)</span>
          </div>
          {/* Collected vs Pending Breakdown */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold">
            <span className="text-emerald-700 flex items-center gap-1" title="Amount received for these sales">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Paid:{' '}
              <AnimatePresence mode="wait" initial={false}>
                {hiddenCardValues.has('sales') ? (
                  <motion.span
                    key="paid-hidden"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.2 }}
                    className="font-mono text-slate-400 font-bold"
                  >
                    ••••••
                  </motion.span>
                ) : (
                  <motion.strong
                    key="paid-visible"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.2 }}
                    className="font-extrabold"
                  >
                    {currency(summary.total_paid || 0)}
                  </motion.strong>
                )}
              </AnimatePresence>
            </span>
            <span className="text-rose-700 flex items-center gap-1" title="Amount pending/credit on these sales">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
              Due:{' '}
              <AnimatePresence mode="wait" initial={false}>
                {hiddenCardValues.has('sales') ? (
                  <motion.span
                    key="due-hidden"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.2 }}
                    className="font-mono text-slate-400 font-bold"
                  >
                    ••••••
                  </motion.span>
                ) : (
                  <motion.strong
                    key="due-visible"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.2 }}
                    className="font-extrabold"
                  >
                    {currency(summary.total_pending || 0)}
                  </motion.strong>
                )}
              </AnimatePresence>
            </span>
          </div>
        </div>

        {/* Card 2: Total Cost of Goods Sold (COGS) */}
        <div className="bg-gradient-to-br from-white to-slate-50/70 border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total Cost (COGS)</span>
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => toggleCardValue('cogs')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs ${
                  hiddenCardValues.has('cogs')
                    ? 'text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-300'
                    : 'text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100 border border-indigo-200/80'
                }`}
                title={hiddenCardValues.has('cogs') ? 'Reveal Total Cost' : 'Hide Total Cost'}
              >
                {hiddenCardValues.has('cogs') ? <Eye size={12} className="text-slate-600" /> : <EyeOff size={12} />}
                <span>{hiddenCardValues.has('cogs') ? 'View' : 'Hide'}</span>
              </motion.button>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Boxes size={16} />
              </div>
            </div>
          </div>
          <div className="min-h-[28px] flex items-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {hiddenCardValues.has('cogs') ? (
                <motion.div
                  key="cogs-masked"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: -2 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={{ opacity: 0, filter: 'blur(6px)', y: 2 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="text-xl font-black text-slate-400 tracking-widest font-mono select-none"
                >
                  ••••••••
                </motion.div>
              ) : (
                <motion.div
                  key="cogs-visible"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: 2 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={{ opacity: 0, filter: 'blur(6px)', y: -2 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="text-xl font-black text-slate-900 tracking-tight"
                >
                  {currency(summary.total_cost)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>Purchase value of sold items</span>
            <span className="font-bold text-slate-700">{summary.total_pcs_sold} pcs</span>
          </div>
        </div>

        {/* Card 3: Gross Profit Earned */}
        <div className="bg-gradient-to-br from-white to-emerald-50/40 border border-emerald-200/80 rounded-2xl p-4 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider">Gross Profit</span>
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => toggleCardValue('profit')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs ${
                  hiddenCardValues.has('profit')
                    ? 'text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-300'
                    : 'text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200/80 border border-emerald-300'
                }`}
                title={hiddenCardValues.has('profit') ? 'Reveal Gross Profit' : 'Hide Gross Profit'}
              >
                {hiddenCardValues.has('profit') ? <Eye size={12} className="text-slate-600" /> : <EyeOff size={12} />}
                <span>{hiddenCardValues.has('profit') ? 'View' : 'Hide'}</span>
              </motion.button>
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-600/20">
                <IndianRupee size={16} />
              </div>
            </div>
          </div>
          <div className="min-h-[28px] flex items-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {hiddenCardValues.has('profit') ? (
                <motion.div
                  key="profit-masked"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: -2 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={{ opacity: 0, filter: 'blur(6px)', y: 2 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="text-xl font-black text-slate-400 tracking-widest font-mono select-none"
                >
                  ••••••••
                </motion.div>
              ) : (
                <motion.div
                  key="profit-visible"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: 2 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={{ opacity: 0, filter: 'blur(6px)', y: -2 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className={`text-xl font-black tracking-tight ${
                    summary.gross_profit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {summary.gross_profit >= 0 ? `+${currency(summary.gross_profit)}` : currency(summary.gross_profit)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center justify-between text-[11px] font-medium text-emerald-900/80">
            <span>Sales minus COGS &amp; expenses</span>
            {summary.total_expenses > 0 && (
              <span className="text-[10px] text-slate-500 font-bold">
                {hiddenCardValues.has('profit') ? '(-•••• exp)' : `(-${currency(summary.total_expenses)} exp)`}
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Overall Profit Margin % */}
        <div className="bg-gradient-to-br from-white to-teal-50/40 border border-teal-200/80 rounded-2xl p-4 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-teal-800 uppercase tracking-wider">Profit Margin</span>
            <div className="flex items-center gap-1.5">
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => toggleCardValue('margin')}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs ${
                  hiddenCardValues.has('margin')
                    ? 'text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-300'
                    : 'text-teal-800 bg-teal-100/80 hover:bg-teal-200/80 border border-teal-300'
                }`}
                title={hiddenCardValues.has('margin') ? 'Reveal Profit Margin' : 'Hide Profit Margin'}
              >
                {hiddenCardValues.has('margin') ? <Eye size={12} className="text-slate-600" /> : <EyeOff size={12} />}
                <span>{hiddenCardValues.has('margin') ? 'View' : 'Hide'}</span>
              </motion.button>
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                <Percent size={16} />
              </div>
            </div>
          </div>
          <div className="min-h-[28px] flex items-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              {hiddenCardValues.has('margin') ? (
                <motion.div
                  key="margin-masked"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: -2 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={{ opacity: 0, filter: 'blur(6px)', y: 2 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="text-xl font-black text-slate-400 tracking-widest font-mono select-none"
                >
                  ••••%
                </motion.div>
              ) : (
                <motion.div
                  key="margin-visible"
                  initial={{ opacity: 0, filter: 'blur(6px)', y: 2 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                  exit={{ opacity: 0, filter: 'blur(6px)', y: -2 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="flex items-baseline gap-2"
                >
                  <span
                    className={`text-xl font-black tracking-tight ${
                      summary.margin_pct >= 15 ? 'text-teal-800' : summary.margin_pct > 0 ? 'text-amber-700' : 'text-rose-700'
                    }`}
                  >
                    {summary.margin_pct}%
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      summary.margin_pct >= 20
                        ? 'bg-emerald-100 text-emerald-800'
                        : summary.margin_pct >= 10
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {summary.margin_pct >= 20 ? 'High Margin' : summary.margin_pct >= 10 ? 'Healthy' : 'Low Margin'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Progress gauge bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                summary.margin_pct >= 20 ? 'bg-emerald-500' : summary.margin_pct >= 10 ? 'bg-teal-500' : 'bg-amber-500'
              }`}
              initial={false}
              animate={{
                width: hiddenCardValues.has('margin') ? '0%' : `${Math.min(Math.max(summary.margin_pct, 0), 100)}%`,
              }}
              transition={{ duration: 0.45, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </div>

      {/* ─── Detailed Invoices & Sales Table ─── */}
      <div id="sales-profit-ledger-table" className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden scroll-mt-6">
        {/* Table Header Bar with count, Hide Details toggle, and Expand/Collapse All */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <FileText size={14} className="text-teal-600" />
              Invoices &amp; Margin Ledger
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                searchQuery.trim()
                  ? 'bg-teal-100 text-teal-800 border border-teal-200'
                  : 'bg-slate-200/70 text-slate-700'
              }`}
            >
              {invoices.length} {invoices.length === 1 ? 'order' : 'orders'}
              {searchQuery.trim() ? ' matched' : ''}
            </span>
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer flex items-center gap-0.5 ml-1"
                title="Clear search filter"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleHideDetails}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                hideDetails
                  ? 'text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200'
                  : 'text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80'
              }`}
            >
              {hideDetails ? <Eye size={12} /> : <EyeOff size={12} />}
              <span>{hideDetails ? 'Show Details' : 'Hide Details'}</span>
            </button>
            {!hideDetails && (
              <>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={expandAll}
                  className="text-[11px] font-bold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer"
                >
                  Expand All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                >
                  Collapse All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Invoices List / Table / Hidden Placeholder */}
        {hideDetails && !searchQuery.trim() ? (
          <div className="py-14 px-6 text-center space-y-3 bg-gradient-to-b from-white to-slate-50/50">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <EyeOff size={22} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-extrabold text-slate-700">Invoice details are hidden</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Summary metrics above are active. Click below or use the "View" button on any metric card to reveal the complete invoice ledger.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleHideDetails}
              className="px-4 py-2 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-95"
            >
              <Eye size={13} />
              <span>Show Details ({invoices.length} {invoices.length === 1 ? 'order' : 'orders'})</span>
            </button>
          </div>
        ) : loading ? (
          <div className="py-20 text-center space-y-2">
            <RefreshCw size={28} className="mx-auto text-teal-600 animate-spin" />
            <p className="text-xs font-bold text-slate-600">Calculating purchase costs and margins...</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            {searchQuery.trim() ? (
              <>
                <Search size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">No matching orders found</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  No sales invoices match <span className="font-semibold text-slate-700">"{searchQuery.trim()}"</span> in the selected date range.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3.5 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  Clear Search Filter
                </button>
              </>
            ) : (
              <>
                <Package size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-bold text-slate-700">No sales invoices found</p>
                <p className="text-xs text-slate-400">
                  No sales recorded for the selected date range and branch filters.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/90 bg-slate-50/70 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10"></th>
                  <th className="py-3 px-4">Invoice &amp; Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4 text-center">Items (Qty)</th>
                  <th className="py-3 px-4 text-right">Cost (COGS)</th>
                  <th className="py-3 px-4 text-right">Billed Total</th>
                  <th className="py-3 px-4 text-right">Profit Earned</th>
                  <th className="py-3 px-4 text-center">Margin %</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => {
                  const isExpanded = expandedInvoices.has(inv.id);
                  const isProfit = inv.profit_earned >= 0;

                  return (
                    <React.Fragment key={inv.id}>
                      {/* Parent Invoice Row */}
                      <tr
                        onClick={() => toggleInvoiceExpand(inv.id)}
                        className={`hover:bg-slate-50/90 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-slate-50/60 font-medium' : ''
                        }`}
                      >
                        {/* Expand Toggle */}
                        <td className="py-3 px-4 text-center text-slate-400">
                          {isExpanded ? <ChevronUp size={16} className="text-teal-600" /> : <ChevronDown size={16} />}
                        </td>

                        {/* Invoice & Date */}
                        <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                          <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <span>{inv.invoice_number}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                            <Calendar size={11} /> {formatDateDMY(inv.invoice_date)}
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 truncate max-w-[180px]">
                            {inv.customer_name || 'Walk-in Cash Customer'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                            {inv.customer_mobile || inv.customer_address || '—'}
                          </div>
                        </td>

                        {/* Branch */}
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          <span className="font-semibold">{inv.shop_name}</span>
                        </td>

                        {/* Items / Pcs Count */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="font-bold text-slate-700">{inv.items_count} items</span>
                          <span className="text-[11px] text-slate-400 block font-normal">({inv.total_quantity} pcs)</span>
                        </td>

                        {/* Total Cost */}
                        <td className="py-3 px-4 text-right font-bold text-slate-600 whitespace-nowrap">
                          {currency(inv.total_cost)}
                        </td>

                        {/* Billed Amount & Collection Status */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-extrabold text-slate-900">{currency(inv.billed_amount)}</div>
                          {Number(inv.pending_amount || 0) > 0 ? (
                            <div className="text-[10.5px] font-bold text-rose-600">
                              Due: {currency(inv.pending_amount)}
                            </div>
                          ) : (
                            <div className="text-[10px] font-medium text-emerald-600">
                              Fully Paid
                            </div>
                          )}
                        </td>

                        {/* Profit Earned */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full font-black text-xs ${
                              isProfit
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {isProfit ? `+${currency(inv.profit_earned)}` : currency(inv.profit_earned)}
                          </span>
                        </td>

                        {/* Margin % */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`font-black text-xs ${
                              inv.margin_pct >= 15
                                ? 'text-teal-700'
                                : inv.margin_pct >= 5
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {inv.margin_pct}%
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10.5px] border ${
                              inv.pending_amount <= 0
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : inv.paid_amount > 0
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {inv.pending_amount <= 0 ? 'Paid' : inv.paid_amount > 0 ? 'Partial' : 'Credit'}
                          </span>
                        </td>

                        {/* Action: Expand & View */}
                        <td
                          className="py-3 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            {onViewInvoice && (
                              <button
                                type="button"
                                onClick={() => onViewInvoice(inv)}
                                className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="View / Print Invoice"
                              >
                                <Eye size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleInvoiceExpand(inv.id)}
                              className="px-2 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer"
                            >
                              {isExpanded ? 'Hide' : 'Items'}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ─── Expandable Line-Item Breakdown Accordion ─── */}
                      {isExpanded && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={11} className="py-3 px-6 sm:px-10 border-y border-slate-200/70">
                            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-3">
                              <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                                <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                                  <Package size={13} className="text-teal-600" />
                                  Itemized Profit Breakdown for #{inv.invoice_number}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  Frozen Purchase Cost recorded at time of sale
                                </span>
                              </div>

                              {/* Nested Table */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                                      <th className="py-1.5 px-2">#</th>
                                      <th className="py-1.5 px-2">Product Name</th>
                                      <th className="py-1.5 px-2">Quality / Model</th>
                                      <th className="py-1.5 px-2 text-center">Qty</th>
                                      <th className="py-1.5 px-2 text-right">Unit Cost (COGS)</th>
                                      <th className="py-1.5 px-2 text-right">Sold Price</th>
                                      <th className="py-1.5 px-2 text-right">Line Total</th>
                                      <th className="py-1.5 px-2 text-right">Unit Profit</th>
                                      <th className="py-1.5 px-2 text-right">Line Profit</th>
                                      <th className="py-1.5 px-2 text-center">Margin %</th>
                                      <th className="py-1.5 px-2 text-right">COGS Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {(inv.items || []).map((it, idx) => {
                                      const isLineProfit = it.line_profit >= 0;
                                      return (
                                        <tr key={it.id || idx} className="hover:bg-slate-50/50">
                                          <td className="py-2 px-2 text-slate-400 text-[11px]">{idx + 1}</td>
                                          <td className="py-2 px-2 font-bold text-slate-800">
                                            {it.product_name}
                                            {it.colour && (
                                              <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                                                ({it.colour})
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-slate-500">
                                            {it.quality && (
                                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 mr-1">
                                                {it.quality}
                                              </span>
                                            )}
                                            <span className="text-[11px]">{it.model || '—'}</span>
                                          </td>
                                          <td className="py-2 px-2 text-center font-bold text-slate-700">
                                            {it.quantity}
                                          </td>
                                          <td className="py-2 px-2 text-right font-medium text-slate-600">
                                            {currency(it.unit_cost)}
                                          </td>
                                          <td className="py-2 px-2 text-right font-bold text-slate-900">
                                            {currency(it.unit_price)}{' '}
                                            <span className="text-[10px] text-slate-400 font-normal">
                                              ({it.price_type || 'WS'})
                                            </span>
                                          </td>
                                          <td className="py-2 px-2 text-right font-bold text-slate-900">
                                            {currency(it.line_total)}
                                          </td>
                                          <td className="py-2 px-2 text-right font-semibold text-slate-700">
                                            {it.unit_profit >= 0 ? `+${currency(it.unit_profit)}` : currency(it.unit_profit)}
                                          </td>
                                          <td className="py-2 px-2 text-right">
                                            <span
                                              className={`font-extrabold ${
                                                isLineProfit ? 'text-emerald-700' : 'text-rose-700'
                                              }`}
                                            >
                                              {isLineProfit ? `+${currency(it.line_profit)}` : currency(it.line_profit)}
                                            </span>
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            <span
                                              className={`font-black text-[11px] ${
                                                it.margin_pct >= 15
                                                  ? 'text-teal-700'
                                                  : it.margin_pct >= 5
                                                  ? 'text-amber-700'
                                                  : 'text-rose-700'
                                              }`}
                                            >
                                              {it.margin_pct}%
                                            </span>
                                          </td>
                                          <td className="py-2 px-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            {editingItemId === it.id ? (
                                              <div className="flex items-center justify-end gap-1">
                                                <input
                                                  type="number"
                                                  value={editCostValue}
                                                  onChange={(e) => setEditCostValue(e.target.value)}
                                                  className="w-16 px-1.5 py-0.5 text-[11px] border border-slate-300 rounded font-bold text-right"
                                                  placeholder="Cost"
                                                  autoFocus
                                                />
                                                <button
                                                  type="button"
                                                  disabled={updatingItemId === it.id}
                                                  onClick={(e) => handleSaveCustomCost(it.id, e)}
                                                  className="p-1 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer"
                                                  title="Save Custom Cost"
                                                >
                                                  <Check size={12} />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); setEditingItemId(null); }}
                                                  className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                                                  title="Cancel"
                                                >
                                                  <X size={12} />
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex items-center justify-end gap-1.5">
                                                {it.is_anomalous_cost ? (
                                                  <span
                                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1"
                                                    title={`Master purchase price is ${currency(it.master_purchase_price)}`}
                                                  >
                                                    <ShieldAlert size={10} /> Discrepant
                                                  </span>
                                                ) : null}

                                                {it.master_purchase_price > 0 && Math.abs(it.unit_cost - it.master_purchase_price) > 0.01 && (
                                                  <button
                                                    type="button"
                                                    disabled={updatingItemId === it.id}
                                                    onClick={(e) => handleResetItemToMaster(it.id, e)}
                                                    className="px-2 py-0.5 text-[10.5px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors cursor-pointer flex items-center gap-1"
                                                    title={`Reset frozen cost to Master Cost (${currency(it.master_purchase_price)})`}
                                                  >
                                                    <RotateCcw size={10} className={updatingItemId === it.id ? 'animate-spin' : ''} />
                                                    Reset ({currency(it.master_purchase_price)})
                                                  </button>
                                                )}

                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingItemId(it.id);
                                                    setEditCostValue(String(it.unit_cost || ''));
                                                  }}
                                                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                                                  title="Edit item unit cost"
                                                >
                                                  <Edit3 size={12} />
                                                </button>
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Invoice Deductions Note (if Extra Expenses exist) */}
                              {Number(inv.extra_expenses_total || 0) > 0 && (
                                <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs flex items-center justify-between text-amber-900">
                                  <span>
                                    Extra Expenses on invoice (shipping, packing, or delivery fees):
                                  </span>
                                  <span className="font-extrabold text-amber-950">
                                    -{currency(inv.extra_expenses_total)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Recalculate & Re-sync COGS Modal ─── */}
      <AnimatePresence>
        {cogsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                    <Wrench size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      Recalculate &amp; Synchronize COGS
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Detect corrupted frozen unit costs and restore true business margins from master purchase prices.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setCogsModalOpen(false); setCogsPreview(null); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-5">
                {/* Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Recalculation Scope
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCogsScope('all')}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          cogsScope === 'all'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        All Invoices (Historical)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCogsScope('filtered')}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          cogsScope === 'filtered'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Current Filtered Period
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Scan Sensitivity
                    </label>
                    <label className="flex items-center gap-2 mt-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cogsForceAll}
                        onChange={(e) => setCogsForceAll(e.target.checked)}
                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <span>Force sync all items where cost differs from master price</span>
                    </label>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Default detects severe anomalies (costs &gt; 2x master price or &gt; selling price).
                    </span>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleScanCogs}
                    disabled={isScanningCogs}
                    className="px-5 py-2.5 rounded-xl font-extrabold text-xs text-white bg-slate-800 hover:bg-slate-900 transition-all flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isScanningCogs ? 'animate-spin' : ''} />
                    <span>{isScanningCogs ? 'Scanning Database...' : 'Scan & Preview Discrepancies (Dry Run)'}</span>
                  </button>
                </div>

                {/* Preview Results */}
                {cogsPreview && (
                  <div className="space-y-4 pt-2 border-t border-slate-100">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                        <div className="text-[11px] font-bold text-slate-500 uppercase">Scanned Items</div>
                        <div className="text-base font-black text-slate-800 mt-0.5">{cogsPreview.totalScanned}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-center">
                        <div className="text-[11px] font-bold text-rose-600 uppercase">Corrupted Items</div>
                        <div className="text-base font-black text-rose-700 mt-0.5">{cogsPreview.totalCorrupted}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
                        <div className="text-[11px] font-bold text-amber-700 uppercase">Affected Invoices</div>
                        <div className="text-base font-black text-amber-800 mt-0.5">{cogsPreview.affectedInvoices?.length || 0}</div>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                        <div className="text-[11px] font-bold text-emerald-700 uppercase">Profit Recovery</div>
                        <div className="text-base font-black text-emerald-700 mt-0.5">+{currency(cogsPreview.totalProfitDelta)}</div>
                      </div>
                    </div>

                    {cogsPreview.affectedItems?.length > 0 ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                        <div className="max-h-60 overflow-y-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-xs text-[10.5px] font-bold text-slate-600 uppercase border-b border-slate-200">
                              <tr>
                                <th className="py-2 px-3">Invoice &amp; Date</th>
                                <th className="py-2 px-3">Product</th>
                                <th className="py-2 px-2 text-center">Qty</th>
                                <th className="py-2 px-3 text-right">Old Unit Cost</th>
                                <th className="py-2 px-3 text-right">New Unit Cost</th>
                                <th className="py-2 px-3 text-right">Profit Delta</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {cogsPreview.affectedItems.map((it) => (
                                <tr key={it.item_id} className="hover:bg-slate-50/80">
                                  <td className="py-2 px-3 font-bold text-slate-800 whitespace-nowrap">
                                    <div>{it.invoice_number}</div>
                                    <div className="text-[10px] text-slate-400 font-normal">{it.sale_date}</div>
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="font-bold text-slate-800">{it.product_name}</div>
                                    <div className="text-[10.5px] text-slate-400">{it.model || '—'}</div>
                                  </td>
                                  <td className="py-2 px-2 text-center font-bold text-slate-700">
                                    {it.quantity}
                                  </td>
                                  <td className="py-2 px-3 text-right text-rose-700 font-bold line-through">
                                    {currency(it.old_unit_cost)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-emerald-700 font-extrabold">
                                    {currency(it.new_unit_cost)}
                                  </td>
                                  <td className="py-2 px-3 text-right text-emerald-700 font-black">
                                    +{currency(it.profit_delta)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center text-emerald-800 text-xs font-bold">
                        ✨ No COGS discrepancies found for this criteria!
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setCogsModalOpen(false); setCogsPreview(null); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  Close
                </button>

                {cogsPreview && cogsPreview.totalCorrupted > 0 && (
                  <button
                    type="button"
                    onClick={handleCommitCogs}
                    disabled={isApplyingCogs}
                    className="px-5 py-2 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-md shadow-emerald-700/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} className={isApplyingCogs ? 'animate-spin' : ''} />
                    <span>{isApplyingCogs ? 'Committing Changes...' : `Commit & Fix ${cogsPreview.totalCorrupted} Items (+${currency(cogsPreview.totalProfitDelta)})`}</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
