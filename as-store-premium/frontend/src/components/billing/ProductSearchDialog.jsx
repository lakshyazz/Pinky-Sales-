import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  X,
  Plus,
  Box,
  Check,
  CornerDownLeft,
  ArrowRight,
  Filter,
  Sparkles,
  Layers,
  Tag,
  Palette,
} from 'lucide-react';

const formatCurrency = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const getColorDot = (colourName) => {
  if (!colourName) return 'bg-zinc-400';
  const c = String(colourName).toLowerCase().trim();
  if (c.includes('black')) return 'bg-zinc-900 border border-zinc-700';
  if (c.includes('white')) return 'bg-white border border-zinc-300';
  if (c.includes('blue') || c.includes('cyan') || c.includes('sky')) return 'bg-sky-500';
  if (c.includes('gold') || c.includes('yellow')) return 'bg-amber-400';
  if (c.includes('green') || c.includes('mint') || c.includes('forest')) return 'bg-emerald-500';
  if (c.includes('red') || c.includes('crimson')) return 'bg-rose-500';
  if (c.includes('purple') || c.includes('violet')) return 'bg-violet-500';
  if (c.includes('pink') || c.includes('rose')) return 'bg-pink-400';
  if (c.includes('silver') || c.includes('grey') || c.includes('gray')) return 'bg-slate-400';
  if (c.includes('orange') || c.includes('bronze')) return 'bg-orange-500';
  return 'bg-violet-400';
};

/**
 * ProductSearchDialog - Instant Command Palette / Search Modal (Cmd+K)
 * Full-width, unclipped dialog with category filter tabs, structured columns,
 * smooth keyboard navigation, and "Add & Select Next" batch capability.
 */
export default function ProductSearchDialog({
  isOpen = false,
  onClose,
  products = [],
  onSelect,
  activeRowIndex = 0,
  onCreateNewProduct = null,
}) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedColors, setSelectedColors] = useState({});

  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // Extract dynamic categories from catalog
  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      if (p.category && String(p.category).trim()) {
        set.add(String(p.category).trim());
      }
    });
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  // Filter products based on search term and category
  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategory !== 'All') {
      const catLower = selectedCategory.toLowerCase();
      result = result.filter(
        (p) => String(p.category || '').toLowerCase() === catLower
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const terms = q.split(/\s+/).filter(Boolean);

      result = result.filter((p) => {
        const text = [
          p.label,
          p.name,
          p.model,
          p.brand,
          p.category,
          p.sku,
          p.sublabel,
          Array.isArray(p.colors) ? p.colors.join(' ') : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return terms.every((t) => text.includes(t));
      });
    }

    return result;
  }, [products, search, selectedCategory]);

  // Reset highlight index when filter or search changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search, selectedCategory]);

  // Auto-focus search field when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setHighlightedIndex(0);
      setSelectedColors({});
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex];
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Global Keyboard listener for dialog navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose && onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredProducts.length - 1
      );
    } else if (e.key === 'ArrowRight') {
      const target = filteredProducts[highlightedIndex];
      if (target && target.colors && target.colors.length > 1) {
        e.preventDefault();
        const curCol = selectedColors[target.id] || target.colors[0];
        const curIdx = target.colors.indexOf(curCol);
        const nextIdx = curIdx < target.colors.length - 1 ? curIdx + 1 : 0;
        setSelectedColors((prev) => ({ ...prev, [target.id]: target.colors[nextIdx] }));
      }
    } else if (e.key === 'ArrowLeft') {
      const target = filteredProducts[highlightedIndex];
      if (target && target.colors && target.colors.length > 1) {
        e.preventDefault();
        const curCol = selectedColors[target.id] || target.colors[0];
        const curIdx = target.colors.indexOf(curCol);
        const prevIdx = curIdx > 0 ? curIdx - 1 : target.colors.length - 1;
        setSelectedColors((prev) => ({ ...prev, [target.id]: target.colors[prevIdx] }));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredProducts[highlightedIndex];
      if (target) {
        // Shift + Enter triggers "Add & Select Next" (Batch Mode)
        const isBatch = Boolean(e.shiftKey);
        const colors = target.colors || [];
        const chosenColor = selectedColors[target.id] || (colors.length > 0 ? colors[0] : '');
        handleSelectProduct(target, isBatch, chosenColor);
        if (isBatch) {
          setSearch('');
          setHighlightedIndex(0);
        }
      } else if (onCreateNewProduct) {
        onCreateNewProduct();
        onClose && onClose();
      }
    }
  };

  const handleSelectProduct = (product, isBatch = false, chosenColor = null) => {
    if (!product) return;
    const colors = product.colors || [];
    const finalColor = chosenColor !== null && chosenColor !== undefined
      ? chosenColor
      : (selectedColors[product.id] || (colors.length > 0 ? colors[0] : ''));
    onSelect && onSelect(product, isBatch, finalColor);
    if (isBatch) {
      setSearch('');
      setHighlightedIndex(0);
      searchInputRef.current?.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-zinc-950/60 backdrop-blur-md overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 shadow-2xl rounded-2xl w-full max-w-3xl min-w-[650px] flex flex-col overflow-hidden max-h-[88vh] text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ─── Header & Sticky Search Bar ─── */}
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/90 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10.5px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 font-semibold border border-violet-200 dark:border-violet-800">
                  Line #{activeRowIndex + 1}
                </span>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
                  Product Finder
                </h3>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  Type to instantly search catalog
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg transition-colors cursor-pointer"
                  title="Close Finder (Esc)"
                >
                  <X className="w-4 h-4 stroke-[2]" />
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="w-5 h-5 text-zinc-400 absolute left-3.5 pointer-events-none stroke-[1.75]" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by model, brand name, SKU, or specs..."
                className="w-full h-11 pl-11 pr-24 bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden transition-all shadow-2xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded cursor-pointer"
                >
                  <X className="w-4 h-4 stroke-[2]" />
                </button>
              )}
            </div>

            {/* Category Filter Tabs */}
            {categories.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none text-[11px]">
                {categories.map((cat) => {
                  const isActive = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer shrink-0 ${
                        isActive
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700/70'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ─── Table Column Headers ─── */}
          <div className="grid grid-cols-12 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-[10.5px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider shrink-0 select-none">
            <div className="col-span-6">Brand / Product Model</div>
            <div className="col-span-3 text-right">Cost vs Sell Price</div>
            <div className="col-span-2 text-center">Inventory</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          {/* ─── Results View (Full Width, Fixed Height Scroll Area) ─── */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto max-h-[420px] min-h-[260px] divide-y divide-zinc-100 dark:divide-zinc-800/60"
          >
            {filteredProducts.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                  <Box className="w-6 h-6 stroke-[1.5]" />
                </div>
                <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  No products found
                </h4>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  {search
                    ? `No catalog items matched "${search}" in ${selectedCategory}`
                    : 'No items in this category'}
                </p>

                {onCreateNewProduct && (
                  <button
                    type="button"
                    onClick={() => {
                      onCreateNewProduct();
                      onClose && onClose();
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors cursor-pointer shadow-sm"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Create New Product
                  </button>
                )}
              </div>
            ) : (
              filteredProducts.map((p, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const stockNum = Number(p.stock ?? 0);
                const isInStock = stockNum > 5;
                const isLowStock = stockNum > 0 && stockNum <= 5;

                const colors = p.colors || [];
                const activeColor = selectedColors[p.id] || (colors.length > 0 ? colors[0] : '');

                return (
                  <div
                    key={p.id || idx}
                    role="button"
                    tabIndex={-1}
                    onClick={() => handleSelectProduct(p, false, activeColor)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`grid grid-cols-12 items-center px-4 py-3 cursor-pointer transition-all duration-100 border-l-[3.5px] select-none ${
                      isHighlighted
                        ? 'bg-violet-50/80 dark:bg-violet-950/40 border-l-violet-600 dark:border-l-violet-400'
                        : 'border-l-transparent hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40'
                    }`}
                  >
                    {/* Brand / Model / Specs */}
                    <div className="col-span-6 pr-3 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.brand && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-200/80 dark:border-violet-800/70 shrink-0">
                            {p.brand}
                          </span>
                        )}
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {p.label || p.name || p.model}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {p.category && (
                          <span className="font-medium text-zinc-600 dark:text-zinc-400 truncate">
                            {p.category}
                          </span>
                        )}
                        {p.category && p.sku && <span className="select-none">•</span>}
                        {p.sku && (
                          <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                            SKU: {p.sku}
                          </span>
                        )}
                      </div>

                      {/* Colour Options Display & Selection */}
                      {colors.length > 0 && (
                        <div
                          className="flex items-center gap-1.5 mt-2 flex-wrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1 shrink-0">
                            <Palette className="w-3 h-3 text-violet-500 dark:text-violet-400" />
                            <span>Colours:</span>
                          </span>
                          {colors.map((c) => {
                            const isColActive = activeColor === c;
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={(e) => {
                                  const isBatch = Boolean(e.shiftKey);
                                  setSelectedColors((prev) => ({ ...prev, [p.id]: c }));
                                  handleSelectProduct(p, isBatch, c);
                                }}
                                title={`Click to select ${c} (Shift+Click to Add & Next)`}
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer shadow-2xs border ${
                                  isColActive
                                    ? 'bg-violet-600 text-white border-violet-600 shadow-xs ring-2 ring-violet-500/30'
                                    : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-950/50 dark:hover:text-violet-300 border-zinc-200 dark:border-zinc-700'
                                }`}
                              >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${getColorDot(c)}`} />
                                <span>{c}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Pricing: Cost vs Sell */}
                    <div className="col-span-3 text-right pr-2">
                      <div className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        ₹{formatCurrency(p.purchase_price)}
                      </div>
                      <div className="text-[10.5px] font-mono text-zinc-400 dark:text-zinc-500">
                        Sell: ₹{formatCurrency(p.sale_price)}
                      </div>
                    </div>

                    {/* Inventory Badge */}
                    <div className="col-span-2 text-center">
                      {isInStock ? (
                        <span className="inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                          {stockNum} In Stock
                        </span>
                      ) : isLowStock ? (
                        <span className="inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60">
                          {stockNum} Low Stock
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          0 In Stock
                        </span>
                      )}
                    </div>

                    {/* Action Hint / Click to Pick */}
                    <div className="col-span-1 text-right">
                      {isHighlighted ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-600 text-white shadow-xs">
                          <CornerDownLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-600 text-[11px] font-mono pr-1">
                          ↵
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ─── Footer: Shortcuts & Batch Add Capability ─── */}
          <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-900 flex items-center justify-between shrink-0 flex-wrap gap-2">
            <div className="flex items-center gap-3 text-[10.5px] text-zinc-500 dark:text-zinc-400 flex-wrap">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[9.5px]">
                  ↑↓
                </kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[9.5px]">
                  ←→
                </kbd>
                Colour
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[9.5px]">
                  ↵
                </kbd>
                Select & Close
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[9.5px]">
                  Shift+↵
                </kbd>
                Add & Next
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded font-mono text-[9.5px]">
                  Esc
                </kbd>
                Close
              </span>
            </div>

            {/* Batch Add & Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = filteredProducts[highlightedIndex];
                  if (target) {
                    const colors = target.colors || [];
                    const chosenColor = selectedColors[target.id] || (colors.length > 0 ? colors[0] : '');
                    handleSelectProduct(target, true, chosenColor);
                  }
                }}
                disabled={filteredProducts.length === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-100/80 hover:bg-violet-200/80 dark:bg-violet-950/60 dark:hover:bg-violet-900/60 border border-violet-200 dark:border-violet-800 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add product and immediately open next blank line (Shift + Enter)"
              >
                <span>Add & Select Next</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = filteredProducts[highlightedIndex];
                  if (target) {
                    const colors = target.colors || [];
                    const chosenColor = selectedColors[target.id] || (colors.length > 0 ? colors[0] : '');
                    handleSelectProduct(target, false, chosenColor);
                  }
                }}
                disabled={filteredProducts.length === 0}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Select Item</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
