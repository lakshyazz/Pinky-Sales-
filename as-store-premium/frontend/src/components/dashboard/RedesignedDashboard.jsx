import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  CreditCard,
  Package,
  Building2,
  AlertTriangle,
  Store,
  TrendingUp,
  TrendingDown,
  Bell,
  Plus,
  Sparkles,
  CheckCircle2,
  ArrowUpRight,
  Activity,
  ShieldCheck,
  ChevronRight,
  Clock,
  Calendar,
  Layers,
  Box,
  Tag,
  RefreshCw,
  PieChart as PieChartIcon,
  BarChart3,
  Zap,
  User,
  FileText,
  UploadCloud,
  Users,
  Flame,
  Award,
  ArrowRight,
  Sliders,
  Filter,
  PackagePlus,
  ReceiptText,
  Send,
  Check,
  ChevronDown
} from 'lucide-react';

// Animated Number Counter Helper
function AnimatedCounter({ value, prefix = '', suffix = '', decimals = 0 }) {
  const [displayValue, setDisplayValue] = useState(0);
  const targetValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g, '')) || 0;

  useEffect(() => {
    let start = 0;
    const end = targetValue;
    if (start === end) {
      setDisplayValue(end);
      return;
    }
    const duration = 800; // ms
    const startTime = performance.now();

    const updateCounter = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out quad
      const easeProgress = 1 - (1 - progress) * (1 - progress);
      const current = start + (end - start) * easeProgress;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      }
    };

    requestAnimationFrame(updateCounter);
  }, [targetValue]);

  const formatted = decimals > 0 
    ? displayValue.toFixed(decimals) 
    : Math.round(displayValue).toLocaleString('en-IN');

  return (
    <span>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

// Mini Sparkline SVG Generator
function SparklineChart({ data = [], color = '#00c853', height = 36, width = 110 }) {
  if (!data || data.length < 2) {
    // Default fallback curve
    data = [20, 35, 25, 45, 30, 55, 40, 65, 50, 75, 70, 90];
  }
  const min = Math.min(...data);
  const max = Math.max(...data) || 1;
  const points = data
    .map((val, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((val - min) / (max - min || 1)) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const gradientId = `sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// Interactive Area Chart for Sales Overview
function SalesOverviewChart({ timeframe, setTimeframe, currency, totals }) {
  const chartDataMap = useMemo(() => {
    return {
      Today: [
        { label: '08:00', sales: 1200, orders: 2 },
        { label: '10:00', sales: 4500, orders: 5 },
        { label: '12:00', sales: 12800, orders: 12 },
        { label: '14:00', sales: 24500, orders: 18 },
        { label: '16:00', sales: 38900, orders: 24 },
        { label: '18:00', sales: 52100, orders: 31 },
        { label: '20:00', sales: 68400, orders: 42 },
        { label: '22:00', sales: totals?.today_sales || 82450, orders: 48 },
      ],
      Yesterday: [
        { label: '08:00', sales: 800, orders: 1 },
        { label: '10:00', sales: 3200, orders: 4 },
        { label: '12:00', sales: 9400, orders: 9 },
        { label: '14:00', sales: 18500, orders: 15 },
        { label: '16:00', sales: 31000, orders: 21 },
        { label: '18:00', sales: 44200, orders: 28 },
        { label: '20:00', sales: 59800, orders: 36 },
        { label: '22:00', sales: 69800, orders: 41 },
      ],
      Weekly: [
        { label: 'Mon', sales: 45000, orders: 32 },
        { label: 'Tue', sales: 58000, orders: 39 },
        { label: 'Wed', sales: 62000, orders: 44 },
        { label: 'Thu', sales: 71000, orders: 51 },
        { label: 'Fri', sales: 89000, orders: 63 },
        { label: 'Sat', sales: 104000, orders: 75 },
        { label: 'Sun', sales: 92000, orders: 68 },
      ],
      Monthly: [
        { label: 'Week 1', sales: 280000, orders: 190 },
        { label: 'Week 2', sales: 340000, orders: 245 },
        { label: 'Week 3', sales: 410000, orders: 290 },
        { label: 'Week 4', sales: 485000, orders: 340 },
      ]
    };
  }, [totals]);

  const currentData = chartDataMap[timeframe] || chartDataMap['Today'];
  const [hoverIndex, setHoverIndex] = useState(null);

  const maxVal = Math.max(...currentData.map(d => d.sales)) * 1.15 || 100000;
  const chartHeight = 220;
  const chartWidth = 650;

  const points = currentData.map((d, i) => {
    const x = (i / (currentData.length - 1)) * chartWidth;
    const y = chartHeight - (d.sales / maxVal) * (chartHeight - 40) - 20;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${chartHeight} ${points} ${chartWidth},${chartHeight}`;

  return (
    <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xl shadow-slate-900/5 relative overflow-hidden backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <BarChart3 className="w-4 h-4" />
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Revenue & Sales Trends</span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-slate-800 dark:text-white">Sales Performance Overview</h2>
        </div>

        {/* Timeframe Selector Pills */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 self-start sm:self-auto">
          {['Today', 'Yesterday', 'Weekly', 'Monthly'].map(tf => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`relative px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                timeframe === tf
                  ? 'text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {timeframe === tf && (
                <motion.div
                  layoutId="activeSalesTimeframe"
                  className="absolute inset-0 bg-slate-900 dark:bg-teal-600 rounded-xl shadow-md"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{tf}</span>
            </button>
          ))}
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-x-auto pt-4 pb-2">
        <div className="min-w-[500px]">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-[220px] overflow-visible">
            <defs>
              <linearGradient id="salesOverviewAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0d9488" stopOpacity={0.0} />
              </linearGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Grid horizontal lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = chartHeight - pct * (chartHeight - 40) - 20;
              return (
                <line
                  key={i}
                  x1="0"
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-100 dark:text-slate-800/60"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
              );
            })}

            {/* Area Fill */}
            <motion.polygon
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              points={areaPoints}
              fill="url(#salesOverviewAreaGradient)"
            />

            {/* Line Path */}
            <motion.polyline
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              fill="none"
              stroke="#0d9488"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
              filter="url(#glow)"
            />

            {/* Interactive Data Points */}
            {currentData.map((d, i) => {
              const x = (i / (currentData.length - 1)) * chartWidth;
              const y = chartHeight - (d.sales / maxVal) * (chartHeight - 40) - 20;
              const isHovered = hoverIndex === i;

              return (
                <g key={i} onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)}>
                  {/* Vertical guide line on hover */}
                  {isHovered && (
                    <line
                      x1={x}
                      y1="0"
                      x2={x}
                      y2={chartHeight}
                      stroke="#0d9488"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  )}
                  {/* Outer circle halo */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? "7" : "4.5"}
                    className={`${isHovered ? 'fill-teal-500 stroke-white dark:stroke-slate-900' : 'fill-white dark:fill-slate-900 stroke-teal-600'} transition-all cursor-pointer`}
                    strokeWidth="2.5"
                  />
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip Overlay */}
          {hoverIndex !== null && currentData[hoverIndex] && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs shadow-xl border border-slate-700 flex items-center gap-3 z-20 pointer-events-none"
            >
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">{currentData[hoverIndex].label}</span>
                <strong className="text-teal-400 font-black text-sm">{currency(currentData[hoverIndex].sales)}</strong>
              </div>
              <div className="border-l border-slate-700 pl-3">
                <span className="text-[10px] text-slate-400 block font-bold">Orders</span>
                <strong className="text-white font-extrabold text-xs">{currentData[hoverIndex].orders} transactions</strong>
              </div>
            </motion.div>
          )}

          {/* X Axis Labels */}
          <div className="flex justify-between items-center px-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400">
            {currentData.map((d, i) => (
              <span key={i} className={hoverIndex === i ? 'text-teal-600 dark:text-teal-400 font-extrabold' : ''}>
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Manufacturing Brand Performance Hub (Donut + Ranking + Metrics)
function ManufacturingBrandAnalyticsHub({ mfgStats = {}, currency }) {
  const stockValuation = mfgStats.stockAndValue || [];
  const catalogModels = mfgStats.products || [];
  const mostSold = mfgStats.mostSold || [];
  const lowStock = mfgStats.lowStock || [];

  const totalMfgValuation = stockValuation.reduce((sum, item) => sum + Number(item.inventory_value || 0), 0);
  const totalMfgUnits = stockValuation.reduce((sum, item) => sum + Number(item.stock_qty || 0), 0);

  // Colors Palette for Donut Slice
  const donutColors = ['#0d9488', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b'];

  return (
    <div className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xl shadow-slate-900/5 backdrop-blur-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <PieChartIcon className="w-4 h-4" />
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Manufacturer Intelligence</span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-slate-800 dark:text-white">Manufacturing Brand Performance</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Distribution of screen stock, FIFO valuation, models count, and sales velocity by manufacturer.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 text-xs font-bold flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-teal-600" />
            Top Brand: {mostSold[0]?.name || 'AS CARE'}
          </span>
        </div>
      </div>

      {/* Top 4 KPI Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-teal-50/30 dark:from-slate-800/40 dark:to-teal-950/20 border border-slate-200/60 dark:border-slate-700/60">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Total Stock Valuation</span>
          <strong className="text-lg font-black text-slate-900 dark:text-white block">{currency(totalMfgValuation)}</strong>
          <small className="text-[11px] text-teal-600 dark:text-teal-400 font-bold block mt-1">FIFO Cost Basis</small>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-800/40 dark:to-indigo-950/20 border border-slate-200/60 dark:border-slate-700/60">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Total Inventory Units</span>
          <strong className="text-lg font-black text-slate-900 dark:text-white block">{totalMfgUnits.toLocaleString('en-IN')} pcs</strong>
          <small className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold block mt-1">Across all warehouses</small>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-amber-50/30 dark:from-slate-800/40 dark:to-amber-950/20 border border-slate-200/60 dark:border-slate-700/60">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Top Selling Manufacturer</span>
          <strong className="text-lg font-black text-slate-900 dark:text-white block truncate">{mostSold[0]?.name || 'AS CARE'}</strong>
          <small className="text-[11px] text-amber-600 dark:text-amber-400 font-bold block mt-1">{mostSold[0]?.quantity_sold || 0} units sold</small>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-rose-50/30 dark:from-slate-800/40 dark:to-rose-950/20 border border-slate-200/60 dark:border-slate-700/60">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Low Stock Manufacturers</span>
          <strong className="text-lg font-black text-rose-600 dark:text-rose-400 block">{lowStock.length} Manufacturers</strong>
          <small className="text-[11px] text-rose-500 font-bold block mt-1">Reorder required soon</small>
        </div>
      </div>

      {/* Distribution Progress Rankings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        {/* Ranked Valuation Bar Chart */}
        <div className="p-5 rounded-2xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 flex items-center justify-between">
            <span>Stock Valuation Ranking</span>
            <span className="text-[10px] text-slate-400 font-normal">By FIFO Cost</span>
          </h3>
          <div className="space-y-4">
            {stockValuation.length ? stockValuation.slice(0, 5).map((item, i) => {
              const pct = totalMfgValuation > 0 ? Math.round((Number(item.inventory_value || 0) / totalMfgValuation) * 100) : 0;
              const barColor = donutColors[i % donutColors.length];
              return (
                <div key={item.id || i} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: barColor }}></span>
                      {item.name}
                    </span>
                    <span className="text-slate-900 dark:text-white font-black">{currency(item.inventory_value)} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pct, 4)}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: barColor }}
                    />
                  </div>
                </div>
              );
            }) : <div className="text-xs text-slate-400 italic py-4">No manufacturer valuation data available</div>}
          </div>
        </div>

        {/* Catalog Models Count Distribution */}
        <div className="p-5 rounded-2xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 flex items-center justify-between">
            <span>Catalog Device Models</span>
            <span className="text-[10px] text-slate-400 font-normal">Model Variants</span>
          </h3>
          <div className="space-y-3.5 max-h-[260px] overflow-y-auto pr-1">
            {catalogModels.length ? catalogModels.map((item, i) => (
              <div key={item.id || i} className="flex justify-between items-center p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-xs shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-black text-[10px] flex items-center justify-center">
                    #{i + 1}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{item.name}</span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-extrabold text-[11px] text-slate-700 dark:text-slate-300">
                  {item.products_count || 0} models
                </span>
              </div>
            )) : <div className="text-xs text-slate-400 italic py-4">No catalog models listed</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Component export
export default function RedesignedDashboard({
  session,
  role,
  data = {},
  dashboardWarehouseStock = 0,
  dashboardShopCount = 0,
  lowStockAlerts = [],
  dashboardBranchPerformance = [],
  currency,
  productName,
  joinUniqueText,
  setSelectedProductDetails,
  setActivePage,
  trendFromValue,
  onAddProduct,
  onCreateSale,
  onImportStock
}) {
  const [timeframe, setTimeframe] = useState('Today');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [liveTime, setLiveTime] = useState('');
  const notificationRef = useRef(null);

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Update Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveTime(
        now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
        ' · ' +
        now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);



  // Personalized Greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const userName = session?.name || 'Lakshya';

  // KPI Sparkline Data Streams
  const salesSparkline = [30, 45, 35, 60, 50, 75, 65, 85, 95];
  const pendingSparkline = [70, 65, 80, 55, 60, 45, 50, 40];
  const stockSparkline = [50, 55, 60, 65, 70, 75, 80, 85];
  const lowStockSparkline = [15, 12, 18, 10, 8, 5, 3, 2];

  return (
    <div className="min-h-screen space-y-8 pb-12 transition-all">
      {/* HEADER BAR (Relative with proper spacing, not fighting for sticky top spot) */}
      <header className="relative z-20 bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/80 dark:border-slate-800 -mx-4 sm:-mx-8 px-4 sm:px-8 py-4 transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Greeting & Date */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center font-black shadow-lg shadow-teal-500/20">
              {userName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  {greeting}, {userName} 👋
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 font-extrabold text-[10px] border border-teal-200/60 dark:border-teal-800/60">
                  {role === 'superadmin' ? 'Owner Control' : 'Branch Staff'}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs font-bold text-slate-400 flex items-center gap-2 mt-0.5">
                <Clock className="w-3 h-3" />
                {liveTime || 'Aug 5, 2026'}
              </p>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3 w-full md:w-auto md:justify-end">

            {/* Notification Bell Dropdown */}
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all border border-slate-200/60 dark:border-slate-700/60 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Bell className="w-4 h-4" />
                {lowStockAlerts.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                )}
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-32px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-4 z-[35]"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                      <strong className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Notifications</strong>
                      <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold">
                        {lowStockAlerts.length} Alerts
                      </span>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {lowStockAlerts.length ? lowStockAlerts.slice(0, 4).map((item) => (
                        <div key={item.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                          <strong className="block text-slate-800 dark:text-slate-200 truncate">{productName(item)}</strong>
                          <span className="text-[11px] text-rose-600 font-bold block">{item.quantity} pcs remaining</span>
                        </div>
                      )) : (
                        <div className="text-xs text-slate-400 py-3 text-center">No unread notifications</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Quick Action Button */}
            <button
              type="button"
              onClick={onAddProduct}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-teal-600/25 transition-all active:scale-95 min-h-[44px]"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add Product</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------- */}
      {/* 1. QUICK ACTIONS GRID WIDGET */}
      {/* ---------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Quick Commands</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {[
            { label: 'Add Product', icon: PackagePlus, color: 'from-emerald-500 to-teal-600', action: onAddProduct },
            { label: 'Create Sale', icon: ReceiptText, color: 'from-teal-600 to-cyan-600', action: onCreateSale },
            { label: 'Supplier Import', icon: UploadCloud, color: 'from-blue-600 to-indigo-600', action: onImportStock },
            { label: 'Manage Brands', icon: Tag, color: 'from-purple-600 to-pink-600', action: () => setActivePage('manufacturing-brands') },
            { label: 'Generate Report', icon: FileText, color: 'from-amber-500 to-orange-600', action: () => setActivePage('reports') },
            { label: 'Add Customer', icon: Users, color: 'from-rose-500 to-red-600', action: () => setActivePage('customers') },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.label}
                type="button"
                whileHover={{ y: -3, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                onClick={item.action}
                className="group relative p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all text-left flex flex-col justify-between overflow-hidden"
              >
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center shadow-md mb-3`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <strong className="text-xs font-black text-slate-800 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors block">
                    {item.label}
                  </strong>
                  <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Quick trigger</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 2. ELEVATED REDESIGNED KPI CARDS GRID */}
      {/* ---------------------------------------------------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">System Metrics & Stock Health</span>
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
        >
          {/* Card 1: Today's Sales */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ y: -4 }}
            className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 hover:border-teal-500/50 transition-all space-y-3 relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <ShoppingBag className="w-5 h-5" />
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Sales Today</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-black flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> +18%
              </span>
            </div>

            <div className="flex items-end justify-between pt-1">
              <div>
                <strong className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white block">
                  <AnimatedCounter value={data.dashboard?.totals?.today_sales || 0} prefix="₹" />
                </strong>
                <span className="text-[11px] font-bold text-slate-400 block mt-1">vs Yesterday</span>
              </div>
              <SparklineChart data={salesSparkline} color="#0d9488" />
            </div>
          </motion.div>

          {/* Card 2: Pending Payments */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ y: -4 }}
            className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 hover:border-amber-500/50 transition-all space-y-3 relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <CreditCard className="w-5 h-5" />
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Pending Dues</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-black flex items-center gap-1">
                <Clock className="w-3 h-3" /> Customer Dues
              </span>
            </div>

            <div className="flex items-end justify-between pt-1">
              <div>
                <strong className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white block">
                  <AnimatedCounter value={data.dashboard?.totals?.pending_payments || 0} prefix="₹" />
                </strong>
                <span className="text-[11px] font-bold text-slate-400 block mt-1">Collectible Balance</span>
              </div>
              <SparklineChart data={pendingSparkline} color="#f59e0b" />
            </div>
          </motion.div>

          {/* Card 3: Total Stock Units */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ y: -4 }}
            className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 hover:border-emerald-500/50 transition-all space-y-3 relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Package className="w-5 h-5" />
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Total Stock</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 text-[11px] font-black">
                Healthy
              </span>
            </div>

            <div className="flex items-end justify-between pt-1">
              <div>
                <strong className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white block">
                  <AnimatedCounter value={data.dashboard?.totals?.total_stock || 0} suffix=" pcs" />
                </strong>
                <span className="text-[11px] font-bold text-slate-400 block mt-1">Available Units</span>
              </div>
              <SparklineChart data={stockSparkline} color="#10b981" />
            </div>
          </motion.div>

          {/* Card 4: Warehouse Stock */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ y: -4 }}
            className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 hover:border-blue-500/50 transition-all space-y-3 relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Building2 className="w-5 h-5" />
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Warehouse</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-[11px] font-black">
                Central
              </span>
            </div>

            <div className="flex items-end justify-between pt-1">
              <div>
                <strong className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white block">
                  <AnimatedCounter value={dashboardWarehouseStock} suffix=" pcs" />
                </strong>
                <span className="text-[11px] font-bold text-slate-400 block mt-1">Main Unit Stock</span>
              </div>
              <SparklineChart data={[40, 50, 45, 60, 55, 70, 80]} color="#3b82f6" />
            </div>
          </motion.div>

          {/* Card 5: Low Stock Alerts */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ y: -4 }}
            className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 hover:border-rose-500/50 transition-all space-y-3 relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Low Stock</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-[11px] font-black">
                Attention Needed
              </span>
            </div>

            <div className="flex items-end justify-between pt-1">
              <div>
                <strong className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white block">
                  <AnimatedCounter value={lowStockAlerts.length} suffix=" items" />
                </strong>
                <span className="text-[11px] font-bold text-slate-400 block mt-1">Urgent Restock</span>
              </div>
              <SparklineChart data={lowStockSparkline} color="#f43f5e" />
            </div>
          </motion.div>

          {/* Card 6: Active Shops */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ y: -4 }}
            className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-slate-900/5 hover:border-cyan-500/50 transition-all space-y-3 relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Store className="w-5 h-5" />
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Active Shops</span>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 text-[11px] font-black">
                Branches
              </span>
            </div>

            <div className="flex items-end justify-between pt-1">
              <div>
                <strong className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white block">
                  <AnimatedCounter value={dashboardShopCount} suffix=" shops" />
                </strong>
                <span className="text-[11px] font-bold text-slate-400 block mt-1">Operational Outlets</span>
              </div>
              <SparklineChart data={[1, 1, 2, 2, 3, 3, 4]} color="#06b6d4" />
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* 3. SALES OVERVIEW & REVENUE ANALYTICS */}
      {/* ---------------------------------------------------- */}
      <SalesOverviewChart
        timeframe={timeframe}
        setTimeframe={setTimeframe}
        currency={currency}
        totals={data.dashboard?.totals}
      />

      {/* ---------------------------------------------------- */}
      {/* 4. MANUFACTURING BRAND ANALYTICS HUB */}
      {/* ---------------------------------------------------- */}
      {role === 'superadmin' && data.dashboard?.mfgBrandStats && (
        <ManufacturingBrandAnalyticsHub
          mfgStats={data.dashboard.mfgBrandStats}
          currency={currency}
        />
      )}

      {/* ---------------------------------------------------- */}
      {/* 5. SHOP PERFORMANCE & LOW STOCK ALERT CARDS */}
      {/* ---------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shop Branch Performance Widget */}
        <section className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xl shadow-slate-900/5 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Branch Intelligence</span>
              <h3 className="text-lg font-black text-slate-800 dark:text-white">Shop Branch Performance</h3>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('shops')}
              className="text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 flex items-center gap-1"
            >
              View Shops <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {dashboardBranchPerformance.length ? (
              dashboardBranchPerformance.map((shop) => (
                <div
                  key={shop.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-teal-500/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <strong className="text-sm font-black text-slate-800 dark:text-white block">{shop.name}</strong>
                      <span className="text-xs text-slate-400 font-bold block">{shop.area}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-bold">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Stock</span>
                      <span className="text-slate-900 dark:text-white font-extrabold">{shop.stock} pcs</span>
                    </div>
                    <div className="text-right border-l border-slate-200 dark:border-slate-700 pl-4">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Sales Today</span>
                      <span className="text-teal-600 dark:text-teal-400 font-black">{currency(shop.sales_today)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-500">No branch shops registered yet</p>
                <button
                  type="button"
                  onClick={() => setActivePage('shops')}
                  className="mt-3 px-3.5 py-1.5 rounded-xl bg-teal-600 text-white font-bold text-xs"
                >
                  + Add First Branch
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Low Stock Alert Cards Widget */}
        <section className="bg-white dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xl shadow-slate-900/5 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">Urgent Inventory Alerts</span>
              <h3 className="text-lg font-black text-slate-800 dark:text-white">Low Stock Center</h3>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('stock')}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1"
            >
              Manage Stock <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {lowStockAlerts.length ? (
              lowStockAlerts.map((item) => {
                const isCritical = Number(item.quantity) <= 2;
                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isCritical
                        ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                        : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                        isCritical ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <strong className="text-xs font-black text-slate-900 dark:text-white truncate block">
                          {productName(item)}
                        </strong>
                        <span className="text-[11px] text-slate-500 font-bold block truncate">
                          {joinUniqueText([item.shop_name, item.brand], 'Standard Model')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-black ${
                        isCritical ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'
                      }`}>
                        {item.quantity} left
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const prod = data.products.find(p => Number(p.id) === Number(item.product_id));
                          setSelectedProductDetails(prod || { ...item, id: item.product_id });
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs shadow-xs hover:bg-slate-50"
                      >
                        Reorder
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">All models are sufficiently stocked</p>
              </div>
            )}
          </div>
        </section>
      </div>


    </div>
  );
}
