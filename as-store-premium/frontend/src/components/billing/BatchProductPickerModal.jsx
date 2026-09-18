import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Search, X, Check, Filter, Package, AlertTriangle, ChevronDown } from 'lucide-react';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const currency = (v) => `₹${money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getColorDot = (colourName) => {
  if (!colourName) return null;
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

export default function BatchProductPickerModal({
  isOpen,
  onClose,
  products = [],
  onAddSelectedLines,
}) {
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Map of selected items: productId -> { selected: boolean, colour: string, qty: number, price: number }
  const [rowStates, setRowStates] = useState({});

  // Derive unique brands and categories for filtering
  const brands = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      if (p.brand) set.add(p.brand.trim());
    });
    return Array.from(set).sort();
  }, [products]);

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach((p) => {
      if (p.category) set.add(p.category.trim());
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedBrand !== 'all' && p.brand !== selectedBrand) return false;
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const str = `${p.short_name || ''} ${p.name || ''} ${p.brand || ''} ${p.category || ''} ${p.model || ''} ${p.full_model_list || ''}`.toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });
  }, [products, selectedBrand, selectedCategory, search]);

  const getProductColors = (product) => {
    let list = [];
    const raw = product.colours || product.available_colours;
    if (Array.isArray(raw)) {
      list = raw.map(c => String(c).trim()).filter(Boolean);
    } else if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed.map(c => String(c).trim()).filter(Boolean);
        else list = raw.split(',').map(c => c.trim()).filter(Boolean);
      } catch {
        list = raw.split(',').map(c => c.trim()).filter(Boolean);
      }
    }
    return list;
  };

  const getRowState = (product) => {
    if (rowStates[product.id]) return rowStates[product.id];
    const colors = getProductColors(product);
    return {
      selected: false,
      colour: colors[0] || '',
      qty: 10,
      price: product.purchase_price || '',
    };
  };

  const updateRowState = (productId, updates) => {
    setRowStates((prev) => {
      const current = prev[productId] || {
        selected: true,
        colour: '',
        qty: 10,
        price: '',
      };
      return {
        ...prev,
        [productId]: { ...current, ...updates },
      };
    });
  };

  const toggleSelect = (product) => {
    const current = getRowState(product);
    updateRowState(product.id, { selected: !current.selected });
  };

  // Selected summaries
  const selectedItems = useMemo(() => {
    const result = [];
    for (const [productId, state] of Object.entries(rowStates)) {
      if (state.selected) {
        const prod = products.find((p) => String(p.id) === String(productId));
        if (prod && Number(state.qty) > 0 && Number(state.price) > 0) {
          result.push({
            product: prod,
            colour: state.colour,
            qty: Number(state.qty),
            price: Number(state.price),
            lineTotal: money(Number(state.qty) * Number(state.price)),
          });
        }
      }
    }
    return result;
  }, [rowStates, products]);

  const totalSelectedCount = selectedItems.length;
  const totalSelectedQty = selectedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalSelectedAmount = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const handleApply = () => {
    if (selectedItems.length === 0) return;
    const linesToAdd = selectedItems.map((item) => ({
      product_id: item.product.id,
      custom_product_name: item.colour
        ? `${item.product.short_name || item.product.name} - ${item.colour}`
        : (item.product.short_name || item.product.name),
      colour: item.colour || null,
      quantity: item.qty,
      unit_price: item.price,
      discount_amount: 0,
    }));

    onAddSelectedLines(linesToAdd);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-zinc-950/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.14 }}
          className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 flex items-center justify-center shadow-xs">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Browse &amp; Multi-Add Catalog</h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">Batch select multiple products &amp; variants into your purchase bill</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-6 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by model, brand, category, or code..."
                className="w-full pl-9 pr-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-50/50 dark:bg-zinc-900 focus:bg-white dark:focus:bg-zinc-900 focus:border-violet-500 outline-hidden"
              />
            </div>

            <div className="sm:col-span-3 relative">
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                style={{ backgroundImage: 'none' }}
                className="w-full pl-3 pr-8 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-50/50 dark:bg-zinc-900 focus:bg-white dark:focus:bg-zinc-900 outline-hidden appearance-none cursor-pointer"
              >
                <option value="all">All Brands ({brands.length})</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>

            <div className="sm:col-span-3 relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{ backgroundImage: 'none' }}
                className="w-full pl-3 pr-8 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-50/50 dark:bg-zinc-900 focus:bg-white dark:focus:bg-zinc-900 outline-hidden appearance-none cursor-pointer"
              >
                <option value="all">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>
          </div>

          {/* Product Grid / Table */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredProducts.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 space-y-2">
                <Package size={36} className="mx-auto opacity-40 text-zinc-400" />
                <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No products match your filters</div>
                <div className="text-xs text-zinc-500">Try clearing search filters or add a new product.</div>
              </div>
            ) : (
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-x-auto shadow-2xs">
                <table className="w-full min-w-[920px] text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/90 backdrop-blur-xs text-[10.5px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">Select</th>
                      <th className="py-2.5 px-3 min-w-[200px]">Product Name &amp; Model</th>
                      <th className="py-2.5 px-3 w-28 min-w-[100px]">Category</th>
                      <th className="py-2.5 px-3 w-48 min-w-[160px]">Variant / Color</th>
                      <th className="py-2.5 px-3 text-right w-24 min-w-[80px]">Qty</th>
                      <th className="py-2.5 px-3 text-right w-32 min-w-[110px]">Unit Cost</th>
                      <th className="py-2.5 px-3 text-right w-28 min-w-[100px]">Selling Price</th>
                      <th className="py-2.5 px-3 text-right w-32 min-w-[110px]">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850">
                    {filteredProducts.map((p) => {
                      const row = getRowState(p);
                      const colors = getProductColors(p);
                      const sellingPrice = Number(p.sale_price || 0);
                      const enteredPrice = Number(row.price || 0);
                      const isInflatedCost = enteredPrice > 0 && sellingPrice > 0 && enteredPrice > sellingPrice;
                      const subtotal = money(Number(row.qty || 0) * enteredPrice);

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 transition-colors ${
                            row.selected ? 'bg-violet-50/50 dark:bg-violet-950/20' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              onChange={() => toggleSelect(p)}
                              className="rounded border-zinc-300 dark:border-zinc-700 text-violet-600 focus:ring-violet-500 cursor-pointer w-4 h-4"
                            />
                          </td>

                          <td className="py-2.5 px-3 font-semibold text-zinc-900 dark:text-zinc-100">
                            <div className="flex items-center gap-1.5">
                              {p.brand && (
                                <span className="text-[10px] font-bold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 px-1.5 py-0.2 rounded shrink-0">
                                  {p.brand}
                                </span>
                              )}
                              <span className="truncate">{p.short_name || p.name}</span>
                            </div>
                            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal mt-0.5 truncate max-w-xs">
                              {p.model || p.full_model_list || '—'}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 font-medium whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-zinc-100 dark:bg-zinc-800 font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60">
                              {p.category || 'Standard'}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {colors.length === 0 ? (
                              <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 pl-1">—</span>
                            ) : colors.length === 1 ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-zinc-100 font-semibold text-xs border border-zinc-200 dark:border-zinc-700 shadow-2xs">
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getColorDot(colors[0])}`} />
                                <span className="truncate max-w-[120px]">{colors[0]}</span>
                              </div>
                            ) : (
                              <div className="relative inline-block w-full max-w-[160px]">
                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center">
                                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getColorDot(row.colour)}`} />
                                </div>
                                <select
                                  value={row.colour}
                                  onChange={(e) => updateRowState(p.id, { colour: e.target.value, selected: true })}
                                  style={{ backgroundImage: 'none' }}
                                  className="w-full pl-7 pr-7 py-1 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:border-violet-500 outline-hidden appearance-none cursor-pointer shadow-2xs"
                                >
                                  {colors.map((c) => (
                                    <option key={c} value={c} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold">
                                      {c}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min={1}
                              value={row.qty}
                              onChange={(e) => updateRowState(p.id, { qty: e.target.value, selected: true })}
                              className="w-16 px-2 py-1 text-xs font-mono font-semibold text-right border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:border-violet-500 outline-hidden shadow-2xs"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <div className="relative inline-block">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={row.price}
                                onChange={(e) => updateRowState(p.id, { price: e.target.value, selected: true })}
                                placeholder="0.00"
                                className={`w-28 px-2.5 py-1 text-xs font-mono font-semibold text-right border rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 outline-hidden shadow-2xs ${
                                  isInflatedCost
                                    ? 'border-amber-400 dark:border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
                                    : 'border-zinc-200 dark:border-zinc-800 focus:border-violet-500'
                                }`}
                              />
                              {isInflatedCost && (
                                <span
                                  className="absolute -top-2 right-0 text-[9px] font-bold px-1 rounded bg-amber-500 text-white flex items-center gap-0.5"
                                  title="Cost exceeds master selling price"
                                >
                                  &gt; Sell
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {currency(sellingPrice)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {currency(subtotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              <div>
                Selected Products: <span className="font-semibold text-violet-700 dark:text-violet-300">{totalSelectedCount}</span>
              </div>
              <div>
                Total Units: <span className="font-semibold font-mono text-zinc-900 dark:text-zinc-100">{totalSelectedQty}</span>
              </div>
              <div>
                Batch Total: <span className="font-bold font-mono text-zinc-900 dark:text-zinc-100 text-sm">{currency(totalSelectedAmount)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={totalSelectedCount === 0}
                onClick={handleApply}
                className="px-5 py-2 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 rounded-xl transition-all shadow-md shadow-violet-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check size={14} />
                <span>Add {totalSelectedCount} Products to Bill ({currency(totalSelectedAmount)})</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

