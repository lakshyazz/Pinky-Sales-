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
  Percent,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
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

  // Fetch Report Data from API
  const fetchReport = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);
      if (selectedShopId && selectedShopId !== 'all') params.append('shopId', selectedShopId);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
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
  }, [api, dateFrom, dateTo, selectedShopId, searchQuery, statusFilter, setGlobalToast]);

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

  const summary = reportData?.summary || {
    total_sales: 0,
    total_cost: 0,
    total_expenses: 0,
    gross_profit: 0,
    margin_pct: 0,
    invoices_count: 0,
    total_pcs_sold: 0,
    previous_period_sales: 0,
    sales_change_pct: null,
  };

  const invoices = reportData?.invoices || [];

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
            onClick={handleExportCSV}
            disabled={!invoices.length}
            className="px-3.5 py-2 text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Export CSV of current report"
          >
            <Download size={13} className="text-teal-600" />
            <span>Export CSV</span>
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

          {/* Custom Date Pickers */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <span className="text-[11px] font-bold text-slate-400">From:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActivePreset('custom');
                }}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              />
            </div>
            <span className="text-slate-400 font-bold">to</span>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <span className="text-[11px] font-bold text-slate-400">To:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActivePreset('custom');
                }}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Search, Branch, and Payment Status Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-2 border-t border-slate-100">
          {/* Search Box */}
          <div className="sm:col-span-6 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer name, mobile, address, or INV-xxxxxx..."
              className="w-full h-10 pl-9 pr-4 text-xs font-semibold bg-slate-50 hover:bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-teal-500 rounded-xl focus:outline-none transition-all placeholder:text-slate-400"
            />
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
        {/* Card 1: Total Sales */}
        <div className="bg-gradient-to-br from-white to-slate-50/70 border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total Sales</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Receipt size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 tracking-tight">
            {currency(summary.total_sales)}
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
        </div>

        {/* Card 2: Total Cost of Goods Sold (COGS) */}
        <div className="bg-gradient-to-br from-white to-slate-50/70 border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Total Cost (COGS)</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Boxes size={16} />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900 tracking-tight">
            {currency(summary.total_cost)}
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
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-600/20">
              <IndianRupee size={16} />
            </div>
          </div>
          <div className={`text-xl font-black tracking-tight ${summary.gross_profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {summary.gross_profit >= 0 ? `+${currency(summary.gross_profit)}` : currency(summary.gross_profit)}
          </div>
          <div className="flex items-center justify-between text-[11px] font-medium text-emerald-900/80">
            <span>Sales minus COGS &amp; expenses</span>
            {summary.total_expenses > 0 && (
              <span className="text-[10px] text-slate-500 font-bold">(-{currency(summary.total_expenses)} exp)</span>
            )}
          </div>
        </div>

        {/* Card 4: Overall Profit Margin % */}
        <div className="bg-gradient-to-br from-white to-teal-50/40 border border-teal-200/80 rounded-2xl p-4 shadow-xs space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-teal-800 uppercase tracking-wider">Profit Margin</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <Percent size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-black tracking-tight ${summary.margin_pct >= 15 ? 'text-teal-800' : summary.margin_pct > 0 ? 'text-amber-700' : 'text-rose-700'}`}>
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
          </div>

          {/* Progress gauge bar */}
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                summary.margin_pct >= 20 ? 'bg-emerald-500' : summary.margin_pct >= 10 ? 'bg-teal-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(Math.max(summary.margin_pct, 0), 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* ─── Detailed Invoices & Sales Table ─── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Header Bar with count and Expand/Collapse All */}
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <FileText size={14} className="text-teal-600" />
              Invoices &amp; Margin Ledger
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
              {invoices.length} {invoices.length === 1 ? 'order' : 'orders'}
            </span>
          </div>

          <div className="flex items-center gap-2">
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
          </div>
        </div>

        {/* Invoices List / Table */}
        {loading ? (
          <div className="py-20 text-center space-y-2">
            <RefreshCw size={28} className="mx-auto text-teal-600 animate-spin" />
            <p className="text-xs font-bold text-slate-600">Calculating purchase costs and margins...</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <Package size={36} className="mx-auto text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No sales invoices found</p>
            <p className="text-xs text-slate-400">
              No sales recorded for the selected date range and branch filters.
            </p>
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

                        {/* Billed Amount */}
                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 whitespace-nowrap">
                          {currency(inv.billed_amount)}
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
    </div>
  );
}
