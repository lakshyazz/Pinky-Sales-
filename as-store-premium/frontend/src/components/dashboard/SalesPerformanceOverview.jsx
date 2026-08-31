import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { BarChart3, TrendingUp, DollarSign, ArrowUpRight } from 'lucide-react';

// Mock data datasets for each time filter
const DATA_SETS = {
  Today: [
    { time: '08:00', sales: 1250, orders: 14 },
    { time: '10:00', sales: 2340, orders: 28 },
    { time: '12:00', sales: 3890, orders: 45 },
    { time: '14:00', sales: 4620, orders: 53 },
    { time: '16:00', sales: 5980, orders: 68 },
    { time: '18:00', sales: 7450, orders: 84 },
    { time: '20:00', sales: 9120, orders: 102 },
    { time: '22:00', sales: 11480, orders: 128 },
  ],
  Yesterday: [
    { time: '08:00', sales: 980, orders: 11 },
    { time: '10:00', sales: 1850, orders: 22 },
    { time: '12:00', sales: 3100, orders: 36 },
    { time: '14:00', sales: 3950, orders: 44 },
    { time: '16:00', sales: 4800, orders: 55 },
    { time: '18:00', sales: 6200, orders: 71 },
    { time: '20:00', sales: 7600, orders: 86 },
    { time: '22:00', sales: 8950, orders: 99 },
  ],
  Weekly: [
    { time: 'Mon', sales: 12400, orders: 142 },
    { time: 'Tue', sales: 14800, orders: 168 },
    { time: 'Wed', sales: 16200, orders: 185 },
    { time: 'Thu', sales: 19400, orders: 210 },
    { time: 'Fri', sales: 24500, orders: 275 },
    { time: 'Sat', sales: 31200, orders: 340 },
    { time: 'Sun', sales: 36800, orders: 395 },
  ],
  Monthly: [
    { time: 'Week 1', sales: 48000, orders: 540 },
    { time: 'Week 2', sales: 62500, orders: 710 },
    { time: 'Week 3', sales: 79800, orders: 890 },
    { time: 'Week 4', sales: 104200, orders: 1150 },
  ],
};

const TIME_FILTERS = ['Today', 'Yesterday', 'Weekly', 'Monthly'];

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-800 backdrop-blur-sm text-xs transition-all duration-150 animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-1.5 text-slate-400 font-medium mb-1">
          <span>Time:</span>
          <span className="text-slate-200 font-semibold">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300">Sales:</span>
          <span className="text-emerald-400 font-bold text-sm">
            ${Number(payload[0].value).toLocaleString()}
          </span>
        </div>
        {data.orders && (
          <div className="text-[11px] text-slate-400 mt-1 pt-1 border-t border-slate-800 flex justify-between gap-3">
            <span>Orders:</span>
            <span className="text-slate-200 font-medium">{data.orders} orders</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

// Custom Dot marker matching exact design specs (White circle + Teal border)
const CustomDot = (props) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4.5}
      fill="#ffffff"
      stroke="#10b981"
      strokeWidth={2.5}
      className="transition-all duration-200 hover:r-6 cursor-pointer drop-shadow-sm"
    />
  );
};

// Custom Active Dot on Hover
const CustomActiveDot = (props) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={7}
        fill="#ffffff"
        stroke="#10b981"
        strokeWidth={3}
        className="drop-shadow-md"
      />
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill="#10b981"
      />
    </g>
  );
};

export default function SalesPerformanceOverview() {
  const [activeFilter, setActiveFilter] = useState('Today');
  const chartData = DATA_SETS[activeFilter] || DATA_SETS.Today;

  // Calculate high-level summary metrics for display
  const latestSales = chartData[chartData.length - 1]?.sales || 0;
  const initialSales = chartData[0]?.sales || 0;
  const growthRate = initialSales > 0 
    ? (((latestSales - initialSales) / initialSales) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 w-full max-w-4xl font-sans transition-all">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100/80">
        {/* Top Left: Icon + Subtitle + Main Title */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm border border-emerald-100/60">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              REVENUE & SALES TRENDS
            </p>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Sales Performance Overview
            </h2>
          </div>
        </div>

        {/* Top Right: Time Filter Toggle Group */}
        <div className="inline-flex p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 self-start sm:self-center">
          {TIME_FILTERS.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                {filter}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary Stat Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-5 pb-2">
        <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5">
          <p className="text-xs font-medium text-slate-500">Total Peak Volume</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-slate-900">
              ${latestSales.toLocaleString()}
            </span>
          </div>
        </div>
        <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5">
          <p className="text-xs font-medium text-slate-500">Period Trend</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-2xl font-extrabold text-emerald-600">
              +{growthRate}%
            </span>
            <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
              <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> Upward
            </span>
          </div>
        </div>
        <div className="hidden sm:block bg-slate-50/70 border border-slate-100 rounded-xl p-3.5">
          <p className="text-xs font-medium text-slate-500">Status</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-slate-700">Live Updating</span>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="w-full h-72 pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            {/* SVG Linear Gradient for Teal Area Fill */}
            <defs>
              <linearGradient id="salesTealGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.38} />
                <stop offset="50%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            {/* Horizontal Dashed Grid lines only */}
            <CartesianGrid
              strokeDasharray="4 4"
              vertical={false}
              stroke="#f1f5f9"
            />

            {/* X-Axis: Time intervals in small gray text */}
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              dy={10}
            />

            {/* Y-Axis: Hidden axis line and ticks */}
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(value) =>
                value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`
              }
              dx={-5}
            />

            {/* Interactive Tooltip */}
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: '#10b981',
                strokeWidth: 1.5,
                strokeDasharray: '4 4',
              }}
            />

            {/* Monotone Area Chart with strokeWidth 3, Teal line, custom gradient & dots */}
            <Area
              type="monotone"
              dataKey="sales"
              stroke="#10b981"
              strokeWidth={3}
              fill="url(#salesTealGradient)"
              dot={<CustomDot />}
              activeDot={<CustomActiveDot />}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
