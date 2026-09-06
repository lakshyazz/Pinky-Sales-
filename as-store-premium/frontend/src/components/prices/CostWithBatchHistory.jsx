import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { History, Eye, EyeOff, Calendar, Package, TrendingUp, TrendingDown, Minus, X, Info, Layers } from 'lucide-react';

/**
 * Default currency formatter fallback
 */
const defaultFormat = (val) => {
  const num = Number(val || 0);
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Formats date string to friendly readable format
 */
const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? String(dateStr).slice(0, 10)
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(dateStr).slice(0, 10);
  }
};

/**
 * CostWithBatchHistory
 * 
 * Displays the weighted average cost price with an interactive portal popover showing
 * historical/batch prices and quantities, completely immune to container overflow clipping.
 */
export default function CostWithBatchHistory({
  item = {},
  isCostVisible = true,
  onToggleVisibility,
  formatPrice,
  currency = '₹',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, showAbove: false });
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  const priceLabel = formatPrice || defaultFormat;

  // Resolve average cost
  const averageCost = Number(
    item.averageCost ?? item.avg_cost_price ?? item.purchase_price ?? item.cost_price ?? 0
  );

  // Normalize batch purchase history from various potential keys
  const batches = useMemo(() => {
    // 1. Check explicit purchaseHistory
    if (Array.isArray(item.purchaseHistory) && item.purchaseHistory.length > 0) {
      return item.purchaseHistory.map((b, idx) => ({
        id: b.id || b.batch_id || idx,
        price: Number(b.price ?? b.purchase_price ?? 0),
        quantity: Number(b.quantity ?? b.stock ?? 0),
        date: b.date || b.received_date || b.created_at || null,
        supplier: b.supplier || b.supplier_name || null,
        notes: b.notes || null,
      }));
    }

    // 2. Check supplier_breakdown (from productConsolidation.js)
    if (Array.isArray(item.supplier_breakdown) && item.supplier_breakdown.length > 0) {
      return item.supplier_breakdown.map((b, idx) => ({
        id: b.supplier_id ? `${b.supplier_id}-${idx}` : idx,
        price: Number(b.purchase_price ?? 0),
        quantity: Number(b.quantity ?? 0),
        date: b.received_date || null,
        supplier: b.supplier_name && b.supplier_name !== 'Direct Stock' ? b.supplier_name : null,
        notes: b.notes || null,
      }));
    }

    // 3. Check supplier_batches (from productConsolidation.js or DB)
    if (Array.isArray(item.supplier_batches) && item.supplier_batches.length > 0) {
      return item.supplier_batches.map((b, idx) => ({
        id: b.batch_id || b.id || idx,
        price: Number(b.purchase_price ?? 0),
        quantity: Number(b.quantity ?? b.quantity_remaining ?? 0),
        date: b.received_date || null,
        supplier: b.supplier_name && b.supplier_name !== 'Direct Stock' ? b.supplier_name : null,
        notes: b.notes || null,
      }));
    }

    return [];
  }, [item.purchaseHistory, item.supplier_breakdown, item.supplier_batches]);

  const hasMultipleBatches = batches.length > 1;
  const hasHistory = batches.length > 0;

  // Calculate viewport-aware fixed position for the floating portal
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(320, window.innerWidth - 24);
    const popoverEstimatedHeight = 260;

    // Check available space below vs above
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < popoverEstimatedHeight && rect.top > popoverEstimatedHeight;

    const top = showAbove ? rect.top - 8 : rect.bottom + 8;

    // Align right side of popover with right side of trigger button, bounded by viewport margins
    let left = rect.right - popoverWidth;
    if (left < 12) left = 12;
    if (left + popoverWidth > window.innerWidth - 12) {
      left = window.innerWidth - popoverWidth - 12;
    }

    setPopoverPos({ top, left, showAbove });
  }, []);

  // Update position on open, scroll, or window resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Privacy Sync: Automatically close popover if cost is masked globally or on row
  useEffect(() => {
    if (!isCostVisible && isOpen) {
      setIsOpen(false);
    }
  }, [isCostVisible, isOpen]);

  const handleTogglePopover = (e) => {
    e.stopPropagation();
    if (!isCostVisible) {
      if (typeof onToggleVisibility === 'function') {
        onToggleVisibility(e);
      }
      return;
    }
    setIsOpen((prev) => !prev);
  };

  return (
    <div className="relative inline-flex items-center justify-end gap-1.5 font-sans">
      {/* 1. Cost Value Display (Respects Privacy Visibility) */}
      {isCostVisible ? (
        <button
          type="button"
          onClick={onToggleVisibility}
          title="Click to hide cost price"
          className="text-sm font-semibold text-rose-700 hover:text-rose-800 transition-colors cursor-pointer font-mono"
        >
          {priceLabel(averageCost)}
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggleVisibility}
          title="Click to reveal cost price"
          className="text-xs font-mono font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50/60 px-1.5 py-0.5 rounded transition-all cursor-pointer inline-flex items-center gap-1"
        >
          <span className="tracking-widest">••••••</span>
          <Eye className="w-3 h-3 opacity-60" />
        </button>
      )}

      {/* 2. Interactive Toggle: Batch History Icon / Badge (Only displayed when cost is visible) */}
      {isCostVisible && hasHistory && (
        <div className="relative inline-block shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={handleTogglePopover}
            title={
              isOpen
                ? 'Close batch price history'
                : `View ${batches.length} batch purchase rate${batches.length > 1 ? 's' : ''}`
            }
            className={`p-1 rounded-md text-[10.5px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer border ${
              isOpen
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs ring-2 ring-rose-500/20'
                : hasMultipleBatches
                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 shadow-2xs hover:scale-105 active:scale-95'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            <History className="w-3 h-3" />
            {hasMultipleBatches && (
              <span className="text-[9.5px] font-extrabold pr-0.5 leading-none">
                {batches.length}
              </span>
            )}
          </button>

          {/* 3. Floating Portal Popover: 100% immune to overflow-hidden and container clipping */}
          {isOpen && isCostVisible && typeof document !== 'undefined' && createPortal(
            <div
              ref={popoverRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: `${popoverPos.top}px`,
                left: `${popoverPos.left}px`,
                transform: popoverPos.showAbove ? 'translateY(-100%)' : 'none',
                zIndex: 99999,
                width: '320px',
              }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left ring-1 ring-black/5"
            >
              {/* Header */}
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-rose-100 text-rose-700">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                      Batch Purchase Rates
                    </h4>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {batches.length} {batches.length === 1 ? 'batch' : 'separate batches'} recorded
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Weighted Average Summary Bar */}
              <div className="px-3.5 py-2 bg-rose-50/60 border-b border-rose-100 flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-rose-950">Weighted Average Cost:</span>
                <span className="font-mono font-black text-rose-700 text-sm">
                  {priceLabel(averageCost)}
                </span>
              </div>

              {/* Batch Rates List */}
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-1">
                {batches.map((batch, idx) => {
                  const bPrice = Number(batch.price || 0);
                  const bQty = Number(batch.quantity || 0);
                  const delta = bPrice - averageCost;
                  const isHigher = delta > 0.01;
                  const isLower = delta < -0.01;

                  return (
                    <div
                      key={batch.id || idx}
                      className="p-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-2.5 text-xs"
                    >
                      {/* Left: Supplier, Date & Quantity */}
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-slate-700 font-bold truncate">
                          <span className="truncate">
                            {batch.supplier || `Batch #${idx + 1}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-medium">
                          {batch.date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5 opacity-70" />
                              {formatDate(batch.date)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Package className="w-2.5 h-2.5 opacity-70" />
                            {bQty.toLocaleString('en-IN')} pcs
                          </span>
                        </div>
                      </div>

                      {/* Right: Rate & Delta Pill */}
                      <div className="text-right space-y-0.5 shrink-0">
                        <div className="font-mono font-black text-slate-900 text-xs">
                          {priceLabel(bPrice)}
                        </div>

                        {/* Delta vs Average */}
                        {hasMultipleBatches && (
                          <div className="inline-flex items-center text-[9px] font-bold">
                            {isHigher ? (
                              <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.2 rounded flex items-center gap-0.5">
                                <TrendingUp className="w-2.5 h-2.5" />
                                +{priceLabel(delta)}
                              </span>
                            ) : isLower ? (
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded flex items-center gap-0.5">
                                <TrendingDown className="w-2.5 h-2.5" />
                                -{priceLabel(Math.abs(delta))}
                              </span>
                            ) : (
                              <span className="text-slate-500 bg-slate-100 px-1 py-0.2 rounded flex items-center gap-0.5">
                                <Minus className="w-2 h-2" /> Avg
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Popover Footer */}
              <div className="px-3.5 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0 opacity-70" />
                <span>Older batch rates factored into current stock valuation.</span>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}
    </div>
  );
}
