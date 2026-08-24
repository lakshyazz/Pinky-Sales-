import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  Search, 
  X, 
  Download, 
  PackagePlus, 
  RefreshCw, 
  CheckCircle2, 
  Phone, 
  User, 
  Layers, 
  Store, 
  Clock, 
  ArrowRight,
  ShieldAlert,
  Loader2,
  ChevronRight,
  Tag,
  Building2
} from 'lucide-react';
import { exportLowStockExcel } from '../../utils/excelExport';

export default function LowStockPage({
  role,
  session,
  data = {},
  api,
  setGlobalToast,
  onUpdateStock,
  loadCore,
  setActivePage,
  priceLabel,
  productName,
  fullModelList,
  Empty = ({ title, message }) => (
    <div className="py-16 text-center text-slate-500 font-medium">
      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-80" />
      <div className="text-sm font-bold text-slate-800 dark:text-white">{title || 'Inventory Healthy'}</div>
      <div className="text-xs text-slate-400 mt-1">{message || 'No low or out-of-stock items detected.'}</div>
    </div>
  )
}) {
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all'); // 'all' | 'out_of_stock' | 'low_stock'
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Quick Restock Modal state
  const [restockProduct, setRestockProduct] = useState(null);
  const [restockShopId, setRestockShopId] = useState('');
  const [restockColour, setRestockColour] = useState('');
  const [restockQuantity, setRestockQuantity] = useState(10);
  const [restockCostPrice, setRestockCostPrice] = useState('');
  const [restockNote, setRestockNote] = useState('');
  const [isSubmittingRestock, setIsSubmittingRestock] = useState(false);

  const shops = data.shops || [];
  const suppliers = data.reference?.suppliers || [];
  const defaultShop = shops.find(s => s.location_type === 'warehouse') || shops[0];
  const lowStockThreshold = 5;

  // Accurate Stock Aggregation matching /models and /stock overview
  const computeProductStock = (item) => {
    if (!item) return 0;
    
    // 1. If batches array exists and has entries, sum their stock quantities
    if (Array.isArray(item.batches) && item.batches.length > 0) {
      return item.batches.reduce((sum, b) => sum + (Number(b.stock_qty ?? b.quantity_remaining ?? b.quantity) || 0), 0);
    }
    if (Array.isArray(item.supplier_batches) && item.supplier_batches.length > 0) {
      return item.supplier_batches.reduce((sum, b) => sum + (Number(b.stock_qty ?? b.quantity_remaining ?? b.quantity) || 0), 0);
    }
    
    // 2. If colour_stock breakdown exists, sum its values
    if (item.colour_stock && typeof item.colour_stock === 'object' && Object.keys(item.colour_stock).length > 0) {
      return Object.values(item.colour_stock).reduce((sum, val) => sum + (Number(val) || 0), 0);
    }
    
    // 3. Fallback to direct stock / quantity properties
    const directQty = item.quantity ?? item.available_quantity ?? item.total_available ?? item.total_stock ?? item.available_stock ?? item.stock_quantity ?? item.stock;
    if (directQty !== undefined && directQty !== null && directQty !== '') {
      const parsed = Number(directQty);
      return !isNaN(parsed) ? parsed : 0;
    }
    
    return 0;
  };

  // Aggregate all products and their accurate current stock
  const lowStockItems = useMemo(() => {
    const productMap = new Map();

    // 1. Index all catalog products
    const allProducts = [...(data.products || []), ...(data.catalog || [])];
    allProducts.forEach((p) => {
      const key = String(p.product_id || p.id);
      if (!key) return;
      if (!productMap.has(key)) {
        productMap.set(key, { ...p, id: key, _stockQty: 0, _hasLiveStockRecord: false });
      }
    });

    // 2. Aggregate live stock records from data.stock (which holds active batch sums per location)
    const stockList = Array.isArray(data.stock) ? data.stock : [];
    stockList.forEach((s) => {
      const key = String(s.product_id || s.id);
      if (!key) return;

      const stockQty = computeProductStock(s);

      if (!productMap.has(key)) {
        productMap.set(key, { ...s, id: key, _stockQty: stockQty, _hasLiveStockRecord: true });
      } else {
        const prod = productMap.get(key);
        prod._stockQty = Math.max(Number(prod._stockQty || 0), stockQty);
        prod._hasLiveStockRecord = true;
        if (s.colour_stock) prod.colour_stock = s.colour_stock;
        if (s.supplier_name && !prod.supplier_name) prod.supplier_name = s.supplier_name;
        if (s.supplier_id && !prod.supplier_id) prod.supplier_id = s.supplier_id;
      }
    });

    // 3. For any catalog products without a record in data.stock, compute directly from their own batches/fields
    productMap.forEach((prod) => {
      if (!prod._hasLiveStockRecord) {
        prod._stockQty = computeProductStock(prod);
      }
    });

    const supplierMap = new Map();
    suppliers.forEach((s) => supplierMap.set(String(s.id), s));

    const result = [];
    productMap.forEach((prod) => {
      const qty = Number(prod._stockQty ?? 0);

      // Determine if item is Low Stock (1 - 5 pcs) or Out of Stock (0 pcs)
      if (qty <= lowStockThreshold) {
        const sup = prod.supplier_id ? supplierMap.get(String(prod.supplier_id)) : null;
        result.push({
          ...prod,
          effectiveQuantity: qty,
          isOutOfStock: qty === 0,
          isLowStock: qty > 0 && qty <= lowStockThreshold,
          resolvedSupplier: sup || {
            name: prod.supplier_name || (prod.supplier_id ? `Supplier #${prod.supplier_id}` : 'Direct Stock'),
            phone: prod.supplier_phone || '',
            contact_person: prod.supplier_contact || '',
          }
        });
      }
    });

    // Sort: Out of stock first (0 pcs), then lowest stock (1 -> 5), then brand name
    return result.sort((a, b) => {
      if (a.effectiveQuantity !== b.effectiveQuantity) {
        return a.effectiveQuantity - b.effectiveQuantity;
      }
      return String(a.brand || '').localeCompare(String(b.brand || ''));
    });
  }, [data.products, data.catalog, data.stock, suppliers, lowStockThreshold]);

  // Extract unique brands and categories for filtering
  const availableBrands = useMemo(() => {
    return Array.from(new Set(lowStockItems.map(i => i.brand || i.company_brand_name).filter(Boolean))).sort();
  }, [lowStockItems]);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(lowStockItems.map(i => i.part_category || i.category).filter(Boolean))).sort();
  }, [lowStockItems]);

  // Filtered dataset based on search and active status tab
  const filteredItems = useMemo(() => {
    return lowStockItems.filter((item) => {
      // Tab filter
      if (statusTab === 'out_of_stock' && item.effectiveQuantity > 0) return false;
      if (statusTab === 'low_stock' && item.effectiveQuantity === 0) return false;

      // Brand & Category
      if (selectedBrand && (item.brand || item.company_brand_name) !== selectedBrand) return false;
      if (selectedCategory && (item.part_category || item.category) !== selectedCategory) return false;

      // Search keyword filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const brand = String(item.brand || item.company_brand_name || '').toLowerCase();
        const name = String(item.short_name || item.name || item.product_name || '').toLowerCase();
        const models = String(item.full_model_list || item.compatible_models || item.model || '').toLowerCase();
        const mfg = String(item.manufacturing_brand_name || item.manufacturing_brand || '').toLowerCase();
        const sup = String(item.resolvedSupplier?.name || '').toLowerCase();
        return brand.includes(q) || name.includes(q) || models.includes(q) || mfg.includes(q) || sup.includes(q);
      }

      return true;
    });
  }, [lowStockItems, statusTab, selectedBrand, selectedCategory, search]);

  // Overall statistics
  const outOfStockCount = useMemo(() => lowStockItems.filter(i => i.effectiveQuantity === 0).length, [lowStockItems]);
  const lowStockCount = useMemo(() => lowStockItems.filter(i => i.effectiveQuantity > 0).length, [lowStockItems]);
  const totalDeficitUnits = useMemo(() => {
    return lowStockItems.reduce((acc, item) => acc + Math.max(0, 10 - item.effectiveQuantity), 0);
  }, [lowStockItems]);

  // Open Quick Restock Modal for specific product
  const handleOpenRestockModal = (prod) => {
    setRestockProduct(prod);
    setRestockShopId(String(defaultShop?.id || ''));
    
    // Pick first available colour
    let initialCol = 'Standard';
    if (prod.colours && Array.isArray(prod.colours) && prod.colours.length > 0) {
      initialCol = prod.colours[0];
    } else if (prod.colour) {
      initialCol = prod.colour;
    }
    setRestockColour(initialCol);
    setRestockQuantity(10);
    setRestockCostPrice(prod.purchase_price || prod.avg_cost_price || '');
    setRestockNote('Low stock reorder replenishment');
  };

  // Submit quick restock
  const handleSubmitRestock = async (e) => {
    e.preventDefault();
    if (!restockProduct) return;
    if (!restockQuantity || Number(restockQuantity) <= 0) {
      if (setGlobalToast) setGlobalToast('Please enter a valid stock quantity to add', 'error');
      return;
    }

    setIsSubmittingRestock(true);
    try {
      if (typeof onUpdateStock === 'function') {
        await onUpdateStock({
          product_id: restockProduct.product_id || restockProduct.id,
          shop_id: restockShopId || defaultShop?.id,
          colour: restockColour || 'Standard',
          quantity: Number(restockQuantity),
          purchase_price: restockCostPrice ? Number(restockCostPrice) : undefined,
          note: restockNote || 'Replenished from Low Stock Alerts'
        });
      } else if (api) {
        await api('/stock', {
          method: 'POST',
          body: JSON.stringify({
            product_id: restockProduct.product_id || restockProduct.id,
            shop_id: restockShopId || defaultShop?.id,
            colour: restockColour || 'Standard',
            quantity: Number(restockQuantity),
            purchase_price: restockCostPrice ? Number(restockCostPrice) : undefined,
            note: restockNote || 'Replenished from Low Stock Alerts'
          })
        }, session?.token);
      }

      if (setGlobalToast) {
        setGlobalToast(`Added ${restockQuantity} pcs to "${restockProduct.short_name || restockProduct.name}"`, 'success');
      }
      setRestockProduct(null);

      // Trigger core data refresh
      if (typeof loadCore === 'function') {
        loadCore();
      }
    } catch (err) {
      if (setGlobalToast) setGlobalToast(err.message || 'Failed to replenish stock', 'error');
    } finally {
      setIsSubmittingRestock(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (typeof loadCore === 'function') {
        await loadCore();
      }
      if (setGlobalToast) setGlobalToast('Inventory alerts updated', 'success');
    } catch (e) {
      console.warn('Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // Helper to format color breakdown pills
  const renderColourBreakdown = (item) => {
    if (item.colour_stock && typeof item.colour_stock === 'object' && Object.keys(item.colour_stock).length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {Object.entries(item.colour_stock).map(([col, count]) => {
            const qty = Number(count);
            return (
              <span
                key={col}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                  qty === 0 
                    ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/60' 
                    : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <span>{col}:</span>
                <span className={qty === 0 ? 'text-rose-600 font-extrabold' : 'font-bold'}>{qty}</span>
              </span>
            );
          })}
        </div>
      );
    }

    if (Array.isArray(item.colours) && item.colours.length > 0) {
      return (
        <div className="flex flex-wrap gap-1">
          {item.colours.map((col) => (
            <span key={col} className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {col}
            </span>
          ))}
        </div>
      );
    }

    return <span className="text-xs text-slate-400 font-medium">Standard</span>;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16 max-w-7xl mx-auto">
      {/* Top Header & Metrics Banner */}
      <div className="bg-gradient-to-r from-rose-900 via-slate-900 to-amber-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-rose-950/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-black uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5" /> Urgent Inventory Center
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Low & Out of Stock Alerts
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl font-medium">
              Monitor items below low-stock thresholds, review vendor contacts, and reorder stock with one click.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs flex items-center gap-2 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
              title="Refresh inventory counts"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                if (!filteredItems.length) {
                  if (setGlobalToast) setGlobalToast('No alert items found to export', 'error');
                  return;
                }
                exportLowStockExcel(filteredItems);
                if (setGlobalToast) setGlobalToast('Low stock reorder sheet (.xlsx) downloaded', 'success');
              }}
              className="px-5 py-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-black/20 transition-all active:scale-95 cursor-pointer"
              title="Download Excel reorder spreadsheet (.xlsx)"
            >
              <Download className="w-4 h-4 text-rose-600" /> Export Low Stock (Excel)
            </button>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] font-bold text-slate-300 block uppercase tracking-wider">Total Alerts</span>
            <strong className="text-xl sm:text-2xl font-black text-white block mt-0.5">
              {lowStockItems.length}
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/30 backdrop-blur-sm">
            <span className="text-[11px] font-bold text-rose-200 block uppercase tracking-wider">Out of Stock (0 pcs)</span>
            <strong className="text-xl sm:text-2xl font-black text-rose-400 block mt-0.5">
              {outOfStockCount}
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 backdrop-blur-sm">
            <span className="text-[11px] font-bold text-amber-200 block uppercase tracking-wider">Low Stock (&le; 5 pcs)</span>
            <strong className="text-xl sm:text-2xl font-black text-amber-400 block mt-0.5">
              {lowStockCount}
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <span className="text-[11px] font-bold text-slate-300 block uppercase tracking-wider">Est. Reorder Units</span>
            <strong className="text-xl sm:text-2xl font-black text-emerald-400 block mt-0.5">
              +{totalDeficitUnits} pcs
            </strong>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
        {/* Search Input with guaranteed non-overlapping structure */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search model, brand, supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '42px', paddingRight: search ? '36px' : '16px' }}
            className="w-full !pl-11 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 text-slate-900 placeholder-gray-400 transition-all shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full cursor-pointer z-10"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Pills & Selectors */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-start md:justify-end">
          <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setStatusTab('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusTab === 'all' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Alerts ({lowStockItems.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('out_of_stock')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusTab === 'out_of_stock' 
                  ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20' 
                  : 'text-rose-600 hover:text-rose-700'
              }`}
            >
              Out of Stock ({outOfStockCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusTab('low_stock')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusTab === 'low_stock' 
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20' 
                  : 'text-amber-700 hover:text-amber-800'
              }`}
            >
              Low Stock ({lowStockCount})
            </button>
          </div>

          {availableBrands.length > 0 && (
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer shadow-2xs"
            >
              <option value="">All Brands</option>
              {availableBrands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}

          {availableCategories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer shadow-2xs"
            >
              <option value="">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Clean Scannable Inventory Table (Strictly NO checkboxes) */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        {filteredItems.length === 0 ? (
          <Empty 
            title="No Items Match Filter" 
            message="No products currently meet the selected low-stock or out-of-stock criteria." 
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-4 px-5">Product & Compatibility</th>
                  <th className="py-4 px-4">Brand / Mfg</th>
                  <th className="py-4 px-4">Current Stock</th>
                  <th className="py-4 px-4">Color Breakdown</th>
                  <th className="py-4 px-4">Supplier Info</th>
                  <th className="py-4 px-4 text-right">Pricing (₹)</th>
                  <th className="py-4 px-5 text-right">Reorder Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredItems.map((item) => {
                  const isZero = item.effectiveQuantity === 0;
                  const sup = item.resolvedSupplier;
                  const partCat = item.part_category || item.category || 'Display';
                  const qualVariant = item.quality_variant || item.product_variant_name || item.quality;
                  const mfg = item.manufacturing_brand_name || item.manufacturing_brand;

                  return (
                    <tr 
                      key={item.product_id || item.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${isZero ? 'bg-rose-50/30' : ''}`}
                    >
                      {/* Product Name & Variants */}
                      <td className="py-4 px-5">
                        <div className="space-y-1 max-w-sm">
                          <strong className="block text-slate-900 font-extrabold text-sm leading-snug">
                            {item.short_name || item.name || item.product_name}
                          </strong>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200/60 uppercase tracking-wide">
                              {partCat}
                            </span>
                            {qualVariant && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                {qualVariant}
                              </span>
                            )}
                          </div>

                          {(item.full_model_list || item.compatible_models || item.model) && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 pt-0.5">
                              <span className="font-semibold text-slate-400">Compat: </span>
                              {item.full_model_list || item.compatible_models || item.model}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Brand & Mfg Brand */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span className="font-extrabold text-slate-900 block text-xs">
                            {item.brand || item.company_brand_name || 'Generic'}
                          </span>
                          {mfg && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/60">
                              <Building2 className="w-2.5 h-2.5" /> {mfg}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Current Stock Tag */}
                      <td className="py-4 px-4">
                        {isZero ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-100 text-rose-800 border border-rose-300 font-black text-xs shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                            0 pcs (Out of Stock)
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-100 text-amber-800 border border-amber-300 font-extrabold text-xs shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            {item.effectiveQuantity} pcs (Low Stock)
                          </div>
                        )}
                      </td>

                      {/* Color-wise Breakdown */}
                      <td className="py-4 px-4 max-w-xs">
                        {renderColourBreakdown(item)}
                      </td>

                      {/* Supplier Contact */}
                      <td className="py-4 px-4">
                        <div className="space-y-0.5 max-w-[200px]">
                          <strong className="block font-bold text-slate-800 truncate">
                            {sup?.name || 'Unassigned'}
                          </strong>
                          {sup?.contact_person && (
                            <span className="text-[11px] text-slate-500 block truncate flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" /> {sup.contact_person}
                            </span>
                          )}
                          {sup?.phone && (
                            <a
                              href={`tel:${sup.phone}`}
                              className="text-[11px] text-teal-700 font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" /> {sup.phone}
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Pricing Info */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="space-y-0.5">
                          <span className="block text-xs font-extrabold text-slate-900">
                            ₹{Number(item.purchase_price || item.avg_cost_price || 0).toLocaleString('en-IN')} <small className="text-slate-400 font-semibold">(Cost)</small>
                          </span>
                          <span className="block text-[11px] text-slate-500 font-semibold">
                            ₹{Number(item.wholesale_price || 0).toLocaleString('en-IN')} <small className="text-slate-400">(W/S)</small>
                          </span>
                        </div>
                      </td>

                      {/* Quick Restock Action Button */}
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenRestockModal(item)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                        >
                          <PackagePlus className="w-4 h-4" /> Add Stock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Add Stock / Reorder Modal */}
      <AnimatePresence>
        {restockProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden p-6 my-8"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                    <PackagePlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Replenish Stock Batch
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {restockProduct.short_name || restockProduct.name}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setRestockProduct(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitRestock} className="space-y-4 pt-4">
                {/* Shop Location */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Destination Branch / Warehouse
                  </label>
                  <select
                    value={restockShopId}
                    onChange={(e) => setRestockShopId(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.location_type === 'warehouse' ? 'Central Warehouse' : 'Branch'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color Selection & Quantity */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Variant Colour
                    </label>
                    <select
                      value={restockColour}
                      onChange={(e) => setRestockColour(e.target.value)}
                      className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                    >
                      {Array.isArray(restockProduct.colours) && restockProduct.colours.length > 0 ? (
                        restockProduct.colours.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))
                      ) : (
                        <option value="Standard">Standard</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Quantity to Add (pcs)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={restockQuantity}
                      onChange={(e) => setRestockQuantity(e.target.value)}
                      required
                      className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Cost Price */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Batch Purchase Cost Price (₹ per unit)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Enter cost price..."
                    value={restockCostPrice}
                    onChange={(e) => setRestockCostPrice(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Restock Note / Supplier Invoice Ref
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Reordered from AS Care Batch #204"
                    value={restockNote}
                    onChange={(e) => setRestockNote(e.target.value)}
                    className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setRestockProduct(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingRestock}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/25 active:scale-95 transition-all cursor-pointer"
                  >
                    {isSubmittingRestock ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Replenishing...
                      </>
                    ) : (
                      <>
                        <PackagePlus className="w-4 h-4" /> Confirm Add Stock
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
