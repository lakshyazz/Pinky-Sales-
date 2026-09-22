import React, { useState, useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, X, ArrowLeftRight, Plus, Sparkles, Box, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const formatCurrency = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ProductLineItemCombobox = forwardRef(function ProductLineItemCombobox(
  {
    options = [],
    value = '',
    onChange,
    onAction = null,
    actionText = '+ Create New Product',
    disabled = false,
    className = '',
    placeholder = 'Search model, brand, or SKU...',
  },
  ref
) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 480,
    flipUp: false,
    maxHeight: 340,
  });

  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const menuRef = useRef(null);

  // Selected item object from catalog
  const selectedItem = useMemo(() => {
    if (!value) return null;
    return options.find((opt) => String(opt.id) === String(value)) || null;
  }, [options, value]);

  // Expose imperative focus method to parent table
  useImperativeHandle(ref, () => ({
    focus: () => {
      setIsEditing(true);
      setIsOpen(true);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select?.();
        }
      }, 30);
    },
  }));

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);

    return options.filter((opt) => {
      const searchBlob = [
        opt.label,
        opt.model,
        opt.brand,
        opt.category,
        opt.sku,
        opt.sublabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return terms.every((t) => searchBlob.includes(t));
    });
  }, [options, search]);

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions]);

  // Viewport-aware Floating Portal calculation
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();

    // Ensure adequate width for structured 2-column flex item without feeling cramped
    const desiredWidth = Math.min(Math.max(rect.width, 480), window.innerWidth - 24);

    // Calculate boundary & alignment
    let left = rect.left;
    if (left + desiredWidth > window.innerWidth - 16) {
      left = Math.max(12, window.innerWidth - desiredWidth - 16);
    }

    const estimatedHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const flipUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    const maxHeight = flipUp
      ? Math.max(180, Math.min(spaceAbove - 16, 360))
      : Math.max(180, Math.min(spaceBelow - 16, 360));

    const top = flipUp
      ? Math.max(8, rect.top - 6)
      : rect.bottom + 6;

    setMenuPosition({
      top,
      left,
      width: desiredWidth,
      flipUp,
      maxHeight,
    });
  };

  // Re-position on open, resize, or scroll
  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleScrollOrResize = (e) => {
      // Ignore scroll inside dropdown menu itself
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  // Outside click detection (supporting Portal anchored to document.body)
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setIsEditing(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
    };
  }, [isOpen]);

  // Auto-focus input when opened or editing
  useEffect(() => {
    if ((isOpen || isEditing) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isEditing]);

  // Scroll active option into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex];
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Keyboard Navigation
  const handleKeyDown = (e) => {
    // Global shortcut Ctrl+K inside this cell
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setIsEditing(true);
      setIsOpen(true);
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsEditing(true);
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex]);
      } else if (actionText && onAction) {
        onAction();
        setIsOpen(false);
        setIsEditing(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setIsEditing(false);
      setSearch('');
    } else if (e.key === 'Tab') {
      // If user tabs while an option is highlighted and search text was entered, pick it
      if (search.trim() && filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex]);
      } else {
        setIsOpen(false);
        setIsEditing(false);
      }
    }
  };

  const handleSelect = (option) => {
    if (!option) return;
    onChange && onChange(option.id, option);
    setIsOpen(false);
    setIsEditing(false);
    setSearch('');
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    onChange && onChange('', null);
    setSearch('');
    setIsEditing(true);
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
  };

  const isSelectedState = selectedItem && !isEditing;

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* ─── State 1: Confirmed Selected State (Clean Badge / Card) ─── */}
      {isSelectedState ? (
        <div
          ref={triggerRef}
          tabIndex={0}
          role="button"
          aria-label={`Selected product: ${selectedItem.label}`}
          onClick={() => {
            if (!disabled) {
              setIsEditing(true);
              setIsOpen(true);
              updatePosition();
            }
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              setIsEditing(true);
              setIsOpen(true);
              updatePosition();
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
              e.preventDefault();
              handleClear(e);
            }
          }}
          className={`group relative flex items-center justify-between p-2 rounded-xl bg-zinc-50/80 dark:bg-zinc-850/70 border border-zinc-200/90 dark:border-zinc-800 hover:border-violet-400/80 dark:hover:border-violet-600/70 hover:bg-violet-50/20 dark:hover:bg-violet-950/20 transition-all duration-150 shadow-2xs cursor-pointer select-none outline-hidden focus:ring-2 focus:ring-violet-500/30 ${
            disabled ? 'opacity-60 cursor-not-allowed' : ''
          }`}
        >
          <div className="flex-1 min-w-0 pr-2">
            {/* Line 1: Item Name / Model (Bold, Crisp text) */}
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate tracking-tight leading-snug">
              {selectedItem.label || selectedItem.model}
            </div>

            {/* Line 2: Small category/brand chip and current stock badge */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {selectedItem.brand && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-violet-100/90 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-200/80 dark:border-violet-800/60 shrink-0">
                  {selectedItem.brand}
                </span>
              )}
              {selectedItem.category && (
                <span className="text-[10.5px] text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[140px]">
                  {selectedItem.category}
                </span>
              )}
              {selectedItem.stock !== undefined && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-600 text-[10px] select-none">•</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded border font-semibold ${
                      Number(selectedItem.stock) > 5
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60'
                        : Number(selectedItem.stock) > 0
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    Stock: {selectedItem.stock}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Inline Action Buttons (Hover / Focus) */}
          {!disabled && (
            <div className="flex items-center gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                title="Swap / Change product (Enter)"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setIsOpen(true);
                  updatePosition();
                }}
                className="p-1 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/60 rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 stroke-[2]" />
              </button>
              <button
                type="button"
                title="Clear selection (Delete/Backspace)"
                onClick={handleClear}
                className="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 stroke-[2]" />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ─── State 2: Empty / Active Search Input ─── */
        <div ref={triggerRef} className="relative flex items-center w-full">
          <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-2.5 pointer-events-none stroke-[1.75]" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            disabled={disabled}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!isOpen) {
                setIsOpen(true);
                updatePosition();
              }
            }}
            onFocus={() => {
              setIsOpen(true);
              updatePosition();
            }}
            placeholder={placeholder}
            className={`w-full h-9 pl-8 pr-16 bg-white dark:bg-zinc-900 border rounded-xl text-xs font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all outline-hidden ${
              isOpen
                ? 'border-violet-500 dark:border-violet-400 ring-2 ring-violet-500/20 shadow-xs'
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-2xs'
            } ${disabled ? 'opacity-50 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800/40' : ''}`}
          />
          <div className="absolute right-2.5 flex items-center gap-1 pointer-events-none select-none">
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9.5px] font-mono font-medium rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200/80 dark:border-zinc-700/80">
              Ctrl+K
            </kbd>
          </div>
        </div>
      )}

      {/* ─── Floating Portal Combobox (Rendered at document.body) ─── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: menuPosition.flipUp ? 6 : -6, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: menuPosition.flipUp ? 6 : -6, scale: 0.99 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  top: menuPosition.flipUp ? 'auto' : `${menuPosition.top}px`,
                  bottom: menuPosition.flipUp ? `${window.innerHeight - menuPosition.top}px` : 'auto',
                  left: `${menuPosition.left}px`,
                  width: `${menuPosition.width}px`,
                  zIndex: 9999,
                }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/10"
              >
                {/* Floating Search Bar Inside Portal if opened from Selected state */}
                {isSelectedState && (
                  <div className="p-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/90 flex items-center gap-2">
                    <Search className="w-4 h-4 text-zinc-400 ml-1 shrink-0 stroke-[1.75]" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search to swap product..."
                      autoFocus
                      className="w-full text-xs font-medium bg-transparent border-none outline-hidden text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5 stroke-[1.75]" />
                      </button>
                    )}
                  </div>
                )}

                {/* Optional Top Action Button */}
                {actionText && onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      onAction();
                      setIsOpen(false);
                      setIsEditing(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50/80 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/70 border-b border-violet-100 dark:border-violet-900/50 flex items-center justify-between transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-violet-200/60 dark:bg-violet-900/60 flex items-center justify-center text-violet-700 dark:text-violet-300">
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </div>
                      <span>{actionText}</span>
                    </div>
                    <span className="text-[10px] font-normal text-violet-500/90 dark:text-violet-400/80">
                      Quick Catalog Entry
                    </span>
                  </button>
                )}

                {/* Suggestions List */}
                <div
                  ref={listRef}
                  style={{ maxHeight: `${menuPosition.maxHeight}px` }}
                  className="overflow-y-auto py-1 divide-y divide-zinc-100/70 dark:divide-zinc-800/40"
                >
                  {filteredOptions.length === 0 ? (
                    <div className="p-6 text-center text-xs">
                      <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                        <Box className="w-5 h-5 stroke-[1.5]" />
                      </div>
                      <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                        No matching catalog items
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Try searching by model, brand, or SKU
                      </p>
                      {actionText && onAction && (
                        <button
                          type="button"
                          onClick={() => {
                            onAction();
                            setIsOpen(false);
                            setIsEditing(false);
                          }}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 hover:bg-violet-100 dark:hover:bg-violet-900/50 rounded-lg border border-violet-200 dark:border-violet-800 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2]" />
                          Create "{search || 'New Product'}"
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredOptions.map((opt, idx) => {
                      const isSelected = String(opt.id) === String(value);
                      const isHighlighted = idx === highlightedIndex;

                      const stockNum = Number(opt.stock ?? 0);
                      const isLowStock = stockNum > 0 && stockNum <= 5;
                      const isInStock = stockNum > 5;

                      return (
                        <div
                          key={opt.id || idx}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleSelect(opt)}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          className={`px-3.5 py-2.5 text-xs flex items-center justify-between gap-3 cursor-pointer transition-all duration-100 border-l-[3px] ${
                            isSelected
                              ? 'bg-violet-50/90 dark:bg-violet-950/60 border-l-violet-600 dark:border-l-violet-400'
                              : isHighlighted
                              ? 'bg-zinc-100/90 dark:bg-zinc-800/90 border-l-violet-500 dark:border-l-violet-400'
                              : 'border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          {/* ─── Left Column: Brand, Model, Category ─── */}
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {opt.brand && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-violet-100/90 dark:bg-violet-950/80 text-violet-700 dark:text-violet-300 border border-violet-200/80 dark:border-violet-800/70 shrink-0">
                                  {opt.brand}
                                </span>
                              )}
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                {opt.label || opt.model}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                              {opt.category && (
                                <span className="truncate max-w-[130px] font-medium">{opt.category}</span>
                              )}
                              {opt.category && opt.sku && <span className="select-none">•</span>}
                              {opt.sku && (
                                <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                                  SKU: {opt.sku}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ─── Right Column: Cost, Sell, Stock Status ─── */}
                          <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                            <div className="text-[11px] font-mono font-medium whitespace-nowrap">
                              <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">Cost: </span>
                              <span className="font-bold text-zinc-800 dark:text-zinc-200">
                                ₹{formatCurrency(opt.purchase_price)}
                              </span>
                              <span className="text-zinc-300 dark:text-zinc-600 mx-1 select-none">|</span>
                              <span className="text-zinc-400 dark:text-zinc-500 text-[10px]">Sell: </span>
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                ₹{formatCurrency(opt.sale_price)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isInStock ? (
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                                  In Stock: {stockNum}
                                </span>
                              ) : isLowStock ? (
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                                  Low Stock: {stockNum}
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700">
                                  Out of Stock
                                </span>
                              )}
                              {isSelected && (
                                <Check className="w-4 h-4 text-violet-600 dark:text-violet-400 stroke-[2.5]" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer status line with navigation hints */}
                <div className="px-3.5 py-1.5 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-zinc-400 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>
                      <kbd className="px-1 py-0.2 bg-zinc-200 dark:bg-zinc-800 rounded text-[9px] font-mono text-zinc-600 dark:text-zinc-400">
                        ↑↓
                      </kbd>{' '}
                      Navigate
                    </span>
                    <span>
                      <kbd className="px-1 py-0.2 bg-zinc-200 dark:bg-zinc-800 rounded text-[9px] font-mono text-zinc-600 dark:text-zinc-400">
                        ↵
                      </kbd>{' '}
                      Select
                    </span>
                    <span>
                      <kbd className="px-1 py-0.2 bg-zinc-200 dark:bg-zinc-800 rounded text-[9px] font-mono text-zinc-600 dark:text-zinc-400">
                        esc
                      </kbd>{' '}
                      Close
                    </span>
                  </div>
                  <span className="font-mono">{filteredOptions.length} results</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
});

export default ProductLineItemCombobox;
