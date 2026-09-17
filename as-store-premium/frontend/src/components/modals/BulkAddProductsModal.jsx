import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  Check,
  Package,
  Layers,
  Plus,
  Minus,
} from 'lucide-react';

export default function BulkAddProductsModal({
  isOpen,
  onClose,
  salesProductOptions = [],
  onConfirm,
  defaultPriceType = 'wholesale',
}) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [defaultQty, setDefaultQty] = useState(1);
  const [selection, setSelection] = useState({}); // { [productId]: { quantity: number, price_type: string, selling_price: number } }
  const searchInputRef = useRef(null);

  // Auto focus search input when opened & reset state
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedCategory('all');
      setInStockOnly(false);
      setDefaultQty(1);
      setSelection({});
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Extract unique categories (deduped case-insensitively e.g. DISPLAY vs Display)
  const categories = useMemo(() => {
    const map = new Map();
    salesProductOptions.forEach((p) => {
      const cat = String(p.category || '').trim();
      if (!cat) return;
      const key = cat.toUpperCase();
      if (!map.has(key)) {
        map.set(key, cat.toUpperCase());
      }
    });
    return Array.from(map.values()).sort();
  }, [salesProductOptions]);

  const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Helper to extract clean product title without repeated category, brand, or prices
  const getCleanTitle = (product) => {
    if (product.clean_name) return product.clean_name;
    if (product.title) return product.title;
    let name = String(product.name || '');
    // Strip trailing prices parenthetical e.g. (₹8,600 | WS: ₹8,300)
    name = name.replace(/\s*\([^)]*₹[^)]*\)/g, '');
    // Strip category bracket if present e.g. [Display]
    if (product.category) {
      name = name.replace(new RegExp(`\\s*\\[${escapeRegex(product.category)}\\]`, 'gi'), '');
    }
    // Strip quality variant if present e.g. (FRESH NEW CARE ORIGINAL)
    if (product.quality) {
      name = name.replace(new RegExp(`\\s*\\(${escapeRegex(product.quality)}\\)`, 'gi'), '');
    }
    // Strip brand suffix e.g. · OnePlus
    if (product.brand) {
      name = name.replace(new RegExp(`\\s*·\\s*${escapeRegex(product.brand)}`, 'gi'), '');
    }
    return name.trim() || product.name;
  };

  // Filter products based on search query, category, and stock
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return salesProductOptions.filter((p) => {
      if (inStockOnly && Number(p.stock || 0) <= 0) {
        return false;
      }
      if (
        selectedCategory !== 'all' &&
        String(p.category || '').trim().toUpperCase() !== selectedCategory.toUpperCase()
      ) {
        return false;
      }
      if (!q) return true;
      const cleanTitle = getCleanTitle(p).toLowerCase();
      const haystack = (p.keywords || `${cleanTitle} ${p.brand} ${p.model} ${p.category} ${p.quality}`).toLowerCase();
      return haystack.includes(q);
    });
  }, [salesProductOptions, search, selectedCategory, inStockOnly]);

  const toggleSelect = (product) => {
    const id = String(product.id);
    setSelection((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        const pType = defaultPriceType || 'wholesale';
        const price = pType === 'retail' && product.retailPrice
          ? Number(product.retailPrice)
          : Number(product.wholesalePrice || product.retailPrice || 0);
        next[id] = {
          product_id: id,
          quantity: Math.max(1, Number(defaultQty) || 1),
          price_type: pType,
          selling_price: price,
          name: getCleanTitle(product),
        };
      }
      return next;
    });
  };

  const updateItemQty = (id, newQty) => {
    const strId = String(id);
    const num = parseInt(newQty, 10);
    setSelection((prev) => {
      if (!prev[strId]) return prev;
      if (isNaN(num) || num <= 0) {
        const next = { ...prev };
        delete next[strId];
        return next;
      }
      return {
        ...prev,
        [strId]: {
          ...prev[strId],
          quantity: num,
        },
      };
    });
  };

  const selectAllFiltered = () => {
    setSelection((prev) => {
      const next = { ...prev };
      filteredProducts.forEach((p) => {
        const id = String(p.id);
        if (!next[id]) {
          const pType = defaultPriceType || 'wholesale';
          const price = pType === 'retail' && p.retailPrice
            ? Number(p.retailPrice)
            : Number(p.wholesalePrice || p.retailPrice || 0);
          next[id] = {
            product_id: id,
            quantity: Math.max(1, Number(defaultQty) || 1),
            price_type: pType,
            selling_price: price,
            name: getCleanTitle(p),
          };
        }
      });
      return next;
    });
  };

  const deselectAll = () => {
    setSelection({});
  };

  const selectedCount = Object.keys(selection).length;
  const totalUnits = Object.values(selection).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const estimatedTotal = Object.values(selection).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.selling_price) || 0),
    0
  );

  const handleConfirm = () => {
    const items = Object.values(selection);
    if (!items.length) return;
    onConfirm(items);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
        />

        {/* Modal Window Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-5xl h-[85vh] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col z-10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
                <Layers size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-extrabold text-slate-800 tracking-tight">
                    Bulk Add Products to Invoice
                  </h3>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {salesProductOptions.length} available
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Search, filter, select multiple items, and add them all to the invoice in one action.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search, Controls & Filter Bar */}
          <div className="p-4 sm:px-6 border-b border-slate-100 bg-white space-y-3 shrink-0">
            {/* Top row: Unified height and clean alignment */}
            <div className="flex items-center gap-3">
              {/* Search Bar Container */}
              <div className="relative flex-1 flex items-center">
                <Search className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search model, brand, quality..."
                  className="w-full h-10 pl-10 pr-9 py-2.5 text-sm rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* In Stock Only Pill Button */}
              <button
                type="button"
                onClick={() => setInStockOnly(!inStockOnly)}
                className={`h-10 px-3.5 flex items-center gap-2 rounded-lg border cursor-pointer text-xs font-medium transition-colors shrink-0 ${
                  inStockOnly
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full transition-colors ${
                    inStockOnly ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
                <span>In Stock Only</span>
              </button>

              {/* Default Qty Joined Input Group */}
              <div className="h-10 border border-slate-200 rounded-lg overflow-hidden flex items-center bg-slate-50 shrink-0">
                <span className="px-3 text-xs text-slate-500 font-medium whitespace-nowrap">Default Qty:</span>
                <input
                  type="number"
                  min="1"
                  value={defaultQty}
                  onChange={(e) => setDefaultQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-14 h-full bg-white text-center text-sm font-semibold border-l border-slate-200 focus:outline-none text-slate-800"
                />
              </div>
            </div>

            {/* Category Filter & Action Row */}
            <div className="flex items-center justify-between mt-3 gap-2">
              {/* Category pill tabs */}
              <div className="flex flex-wrap items-center gap-1.5 max-h-14 overflow-y-auto pr-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`text-xs px-3 py-1.5 rounded-full cursor-pointer transition-all ${
                    selectedCategory === 'all'
                      ? 'bg-slate-900 text-white font-medium shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  ALL ({salesProductOptions.length})
                </button>
                {categories.map((cat) => {
                  const isCatSelected = selectedCategory.toUpperCase() === cat.toUpperCase();
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(isCatSelected ? 'all' : cat)}
                      className={`text-xs px-3 py-1.5 rounded-full cursor-pointer transition-all ${
                        isCatSelected
                          ? 'bg-slate-900 text-white font-medium shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>

              {/* Action buttons on right */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Select All Shown ({filteredProducts.length})
                </button>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Clear ({selectedCount})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Product Items List (Aligned Grid Structure) */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredProducts.length === 0 ? (
              <div className="py-20 text-center">
                <Package size={38} className="mx-auto text-slate-300 mb-2.5" />
                <p className="text-sm font-bold text-slate-700">No matching products found</p>
                <p className="text-xs text-slate-400 mt-0.5">Try adjusting your search keywords or category filters.</p>
                {(search || selectedCategory !== 'all' || inStockOnly) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setSelectedCategory('all');
                      setInStockOnly(false);
                    }}
                    className="mt-3.5 px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div>
                {filteredProducts.map((product) => {
                  const id = String(product.id);
                  const isSelected = Boolean(selection[id]);
                  const itemState = selection[id] || {};
                  const stock = Number(product.stock || 0);
                  const cleanName = getCleanTitle(product);
                  const currentQty = itemState.quantity || defaultQty || 1;

                  return (
                    <div
                      key={id}
                      onClick={() => toggleSelect(product)}
                      className={`grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer ${
                        isSelected ? 'bg-emerald-50/30' : 'bg-white'
                      }`}
                    >
                      {/* Col 1: Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(product)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                      />

                      {/* Col 2: Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-900 truncate">{cleanName}</span>
                          {product.quality && (
                            <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                              {product.quality}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          Brand: <span className="text-slate-700">{product.brand || '—'}</span> · Cat:{' '}
                          <span className="text-slate-700">{product.category || '—'}</span>
                          {product.model ? ` · ${product.model}` : ''}
                        </p>
                      </div>

                      {/* Col 3: Stock */}
                      <div className="w-24 text-center shrink-0">
                        <span
                          className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${
                            stock > 10
                              ? 'bg-emerald-50 text-emerald-700'
                              : stock > 0
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          Stock: {stock}
                        </span>
                      </div>

                      {/* Col 4: Price */}
                      <div className="w-32 text-right shrink-0">
                        <div className="text-sm font-bold text-slate-900">
                          ₹{Number(product.wholesalePrice || product.retailPrice || 0).toLocaleString('en-IN')}{' '}
                          <span className="text-[10px] font-normal text-emerald-600">WS</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Retail: ₹{Number(product.retailPrice || 0).toLocaleString('en-IN')}
                        </div>
                      </div>

                      {/* Col 5: Active Quantity Stepper */}
                      <div
                        className="w-24 flex justify-end shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isSelected ? (
                          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-emerald-300 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => updateItemQty(id, currentQty - 1)}
                              className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
                              title="Decrease quantity"
                            >
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={currentQty}
                              onChange={(e) => updateItemQty(id, e.target.value)}
                              className="w-8 h-6 text-center text-xs font-bold text-slate-900 bg-white border-0 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateItemQty(id, currentQty + 1)}
                              className="w-6 h-6 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
                              title="Increase quantity"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="w-6 h-6" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/90 backdrop-blur-xs flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            {/* Left side: Selected summary */}
            <div className="flex items-center gap-3 text-xs">
              <span className="font-extrabold text-slate-700">
                Selected: <span className="text-emerald-700 text-sm font-black">{selectedCount}</span>{' '}
                {selectedCount === 1 ? 'product' : 'products'}
              </span>
              {selectedCount > 0 && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="font-bold text-slate-600">
                    Total Units: <span className="text-slate-900 font-extrabold">{totalUnits}</span>
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="font-bold text-slate-600">
                    Est. Value:{' '}
                    <span className="text-emerald-800 font-extrabold">
                      ₹{Math.round(estimatedTotal).toLocaleString('en-IN')}
                    </span>
                  </span>
                </>
              )}
            </div>

            {/* Right side: Cancel & Add Selected Buttons */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/70 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selectedCount === 0}
                className={`px-5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                  selectedCount > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-98'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                <Check size={14} />
                <span>
                  Add {selectedCount > 0 ? `${selectedCount} Selected` : 'Products'} to Invoice
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
