import React, { forwardRef } from 'react';
import { Search, X, ArrowLeftRight, Package } from 'lucide-react';

/**
 * ProductTableCell - Collapsed / Passive Table Cell component.
 * Replaces inline combobox with a clean, single-height trigger button.
 */
const ProductTableCell = forwardRef(function ProductTableCell(
  {
    product = null,
    onClick,
    onClear,
    disabled = false,
    className = '',
    placeholder = 'Search model, brand, or SKU...',
  },
  ref
) {
  const handleKeyDown = (e) => {
    if (disabled) return;
    // Enter, Space, or Ctrl+K / Cmd+K opens Finder dialog
    if (
      e.key === 'Enter' ||
      e.key === ' ' ||
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')
    ) {
      e.preventDefault();
      onClick && onClick();
    } else if (product && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      onClear && onClear();
    }
  };

  const isSelected = Boolean(product && (product.id || product.label || product.name));
  const stockNum = product?.stock !== undefined ? Number(product.stock) : null;

  return (
    <div className={`relative w-full ${className}`}>
      {isSelected ? (
        /* ─── Selected State: Compact 2-line summary card ─── */
        <div
          ref={ref}
          tabIndex={disabled ? -1 : 0}
          role="button"
          aria-label={`Selected product: ${product.label || product.name || product.model}. Click to swap.`}
          onClick={() => {
            if (!disabled && onClick) onClick();
          }}
          onKeyDown={handleKeyDown}
          className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-zinc-50/90 dark:bg-zinc-850/80 border border-zinc-200/90 dark:border-zinc-800 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/20 dark:hover:bg-violet-950/20 transition-all duration-150 shadow-2xs cursor-pointer select-none outline-hidden focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 ${
            disabled ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        >
          <div className="flex-1 min-w-0 pr-2">
            {/* Top Line: Bold product title */}
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate tracking-tight leading-snug">
              {product.label || product.name || product.model}
            </div>

            {/* Sub-line: Category chip + current stock count */}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {product.brand && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-violet-100/90 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-200/80 dark:border-violet-800/60 shrink-0">
                  {product.brand}
                </span>
              )}
              {product.category && (
                <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[140px]">
                  {product.category}
                </span>
              )}
              {stockNum !== null && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-600 text-[10px] select-none">•</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-semibold ${
                      stockNum > 5
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60'
                        : stockNum > 0
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    {stockNum > 0 ? `${stockNum} in stock` : 'Out of stock'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Trailing mini "✕" and "Swap" buttons */}
          {!disabled && (
            <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                title="Swap / Change product (Enter or Click)"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick && onClick();
                }}
                className="p-1 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/60 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2]" />
              </button>
              <button
                type="button"
                title="Remove product"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear && onClear();
                }}
                className="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 stroke-[2]" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ─── Unselected State: Clean input trigger displaying [ 🔍 Search... Ctrl+K ] ─── */
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          onClick={onClick}
          onKeyDown={handleKeyDown}
          className={`w-full h-9 px-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 text-left flex items-center justify-between gap-2 transition-all shadow-2xs cursor-pointer outline-hidden focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 ${
            disabled ? 'opacity-50 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800/40' : ''
          }`}
        >
          <div className="flex items-center gap-2 truncate min-w-0">
            <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0 stroke-[1.75]" />
            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal truncate">
              {placeholder}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <kbd className="inline-flex items-center px-1.5 py-0.5 text-[9.5px] font-mono font-medium rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200/80 dark:border-zinc-700/80 select-none">
              Ctrl+K
            </kbd>
          </div>
        </button>
      )}
    </div>
  );
});

export default ProductTableCell;
