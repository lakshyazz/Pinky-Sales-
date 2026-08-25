import React, { useState, useMemo, useEffect } from 'react';
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
import { 
  LOW_STOCK_THRESHOLD, 
  isOutOfStock, 
  isLowStock, 
  isAlertStock, 
  computeProductStock, 
  getStockStatusDetails 
} from '../../utils/stockThresholds';
import { consolidateProductList } from '../../utils/productConsolidation';

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
  const [remoteProducts, setRemoteProducts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

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

  // Self-contained fetch ensuring all products are retrieved without dropping 0-stock items
  const fetchAlertProducts = async () => {
    try {
      setLoadingAlerts(true);
      const token = session?.token || localStorage.getItem('token');
      let loaded = [];
      if (api) {
        try {
          const res = await api('/low-stock');
          loaded = Array.isArray(res) ? res : (res?.data || []);
        } catch {
          const res2 = await api('/products?limit=5000');
          loaded = Array.isArray(res2) ? res2 : (res2?.data || []);
        }
      } else {
        const res = await fetch('/api/low-stock', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const json = await res.json();
          loaded = Array.isArray(json) ? json : (json?.data || []);
        } else {
          const res2 = await fetch('/api/products?limit=5000', {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (res2.ok) {
            const json2 = await res2.json();
            loaded = Array.isArray(json2) ? json2 : (json2?.data || []);
          }
        }
      }
      if (Array.isArray(loaded) && loaded.length > 0) {
        setRemoteProducts(loaded);
      }
    } catch (err) {
      console.warn('Failed to load alert products:', err);
    } finally {
      setLoadingAlerts(false);
    }
  };

  useEffect(() => {
    fetchAlertProducts();
  }, [session?.token]);

  // Aggregate all products across all available dataset sources and consolidate them
  const lowStockItems = useMemo(() => {
    const rawList = [
      ...remoteProducts,
      ...(Array.isArray(data.products) ? data.products : (data.products?.data || [])),
      ...(Array.isArray(data.productResults) ? data.productResults : (data.productResults?.data || [])),
      ...(Array.isArray(data.catalog) ? data.catalog : (data.catalog?.data || []))
    ];

    // Group identical items matching /models catalog grouping logic
    const consolidated = consolidateProductList(rawList);

    const productMap = new Map();

    consolidated.forEach((p) => {
      const key = String(p.product_id || p.id);
      if (!key) return;
      const initialQty = computeProductStock(p);
      if (!productMap.has(key)) {
        productMap.set(key, { ...p, id: key, _stockQty: initialQty });
      } else {
        const existing = productMap.get(key);
        existing._stockQty = Math.max(Number(existing._stockQty || 0), initialQty);
        if (!existing.brand && p.brand) existing.brand = p.brand;
        if (!existing.manufacturing_brand_name && p.manufacturing_brand_name) existing.manufacturing_brand_name = p.manufacturing_brand_name;
        if (!existing.supplier_name && p.supplier_name) existing.supplier_name = p.supplier_name;
        if (!existing.supplier_id && p.supplier_id) existing.supplier_id = p.supplier_id;
      }
    });

    // Aggregate batch data from data.stock
    const stockList = Array.isArray(data.stock) ? data.stock : (data.stock?.data || []);
    stockList.forEach((s) => {
      const key = String(s.product_id || s.id);
      if (!key) return;

      const stockQty = computeProductStock(s);

      if (!productMap.has(key)) {
        productMap.set(key, { ...s, id: key, _stockQty: stockQty });
      } else {
        const prod = productMap.get(key);
        prod._stockQty = Math.max(Number(prod._stockQty || 0), stockQty);
        if (s.colour_stock) prod.colour_stock = s.colour_stock;
        if (s.supplier_name && !prod.supplier_name) prod.supplier_name = s.supplier_name;
        if (s.supplier_id && !prod.supplier_id) prod.supplier_id = s.supplier_id;
      }
    });

    const supplierMap = new Map();
    suppliers.forEach((s) => supplierMap.set(String(s.id), s));

    const result = [];
    productMap.forEach((prod) => {
      const qty = Number(prod._stockQty ?? 0);

      // Unified Alert Rule: Only include products where totalStock <= 4 (0 pcs or 1-4 pcs). Exclude >= 5 pcs!
      if (isAlertStock(qty, LOW_STOCK_THRESHOLD)) {
        const sup = prod.supplier_id ? supplierMap.get(String(prod.supplier_id)) : null;
        result.push({
          ...prod,
          effectiveQuantity: qty,
          isOutOfStock: isOutOfStock(qty),
          isLowStock: isLowStock(qty, LOW_STOCK_THRESHOLD),
          resolvedSupplier: sup || {
            name: prod.supplier_name || (prod.supplier_id ? `Supplier #${prod.supplier_id}` : 'Direct Stock'),
            phone: prod.supplier_phone || '',
            contact_person: prod.supplier_contact || '',
          }
        });
      }
    });

    // Sort: Out of stock first (0 pcs), then lowest stock (1 -> 4), then brand & name
    return result.sort((a, b) => {
      if (a.effectiveQuantity !== b.effectiveQuantity) {
        return a.effectiveQuantity - b.effectiveQuantity;
      }
      const brandCompare = String(a.brand || a.company_brand_name || '').localeCompare(String(b.brand || b.company_brand_name || ''));
      if (brandCompare !== 0) return brandCompare;
      return String(a.short_name || a.name || '').localeCompare(String(b.short_name || b.name || ''));
    });
  }, [remoteProducts, data.products, data.productResults, data.catalog, data.stock, suppliers]);

  // Extract unique brands and categories for filtering
  const availableBrands = useMemo(() => {
    return Array.from(new Set(lowStockItems.map(i => i.brand || i.company_brand_name).filter(Boolean))).sort();
  }, [lowStockItems]);

  const availableCategories = useMemo(() => {
    return Array.from(new Set(lowStockItems.map(i => i.part_category || i.category).filter(Boolean))).sort();
  }, [lowStockItems]);

  // Filtered dataset based on search, active status tab, brand and category
  const filteredItems = useMemo(() => {
    return lowStockItems.filter((item) => {
      const qty = Number(item.effectiveQuantity || 0);

      // Tab filter rules:
      // - All Alerts: stock <= 4 (already filtered in lowStockItems)
      // - Out of Stock: strictly stock === 0
      // - Low Stock: strictly stock >= 1 && stock <= 4
      if (statusTab === 'out_of_stock' && !isOutOfStock(qty)) return false;
      if (statusTab === 'low_stock' && !isLowStock(qty, LOW_STOCK_THRESHOLD)) return false;

      // Brand & Category filters
      if (selectedBrand && (item.brand || item.company_brand_name) !== selectedBrand) return false;
      if (selectedCategory && (item.part_category || item.category) !== selectedCategory) return false;

      // Comprehensive Search Bar Logic:
      // Checks across: modelName, brand, manufacturerBrand (Mfg), category, qualityGrade, compatibleModels (array or string), supplierName
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const brand = String(item.brand || item.company_brand_name || '').toLowerCase();
        const modelName = String(item.short_name || item.name || item.product_name || item.model || item.display_model || '').toLowerCase();
        const mfg = String(item.manufacturing_brand_name || item.manufacturing_brand || item.mfg || '').toLowerCase();
        const category = String(item.part_category || item.category || item.part_category_name || '').toLowerCase();
        const qualityGrade = String(item.quality_variant || item.quality || item.product_variant_name || item.quality_grade || '').toLowerCase();
        
        let compatibleModels = '';
        if (Array.isArray(item.compatible_models)) {
          compatibleModels = item.compatible_models.join(' ');
        } else if (Array.isArray(item.compatibleModels)) {
          compatibleModels = item.compatibleModels.join(' ');
        } else {
          compatibleModels = String(item.full_model_list || item.compatible_models || item.compatibleModels || item.model || '');
        }
        compatibleModels = compatibleModels.toLowerCase();

        const supplier = String(item.resolvedSupplier?.name || item.supplier_name || '').toLowerCase();

        const matches = 
          brand.includes(q) || 
          modelName.includes(q) || 
          mfg.includes(q) || 
          category.includes(q) || 
          qualityGrade.includes(q) || 
          compatibleModels.includes(q) || 
          supplier.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [lowStockItems, statusTab, selectedBrand, selectedCategory, search]);

  // Overall statistics matching exact threshold definitions
  const outOfStockCount = useMemo(() => lowStockItems.filter(i => isOutOfStock(i.effectiveQuantity)).length, [lowStockItems]);
  const lowStockCount = useMemo(() => lowStockItems.filter(i => isLowStock(i.effectiveQuantity, LOW_STOCK_THRESHOLD)).length, [lowStockItems]);
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

      // Trigger data refreshes
      fetchAlertProducts();
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
      await fetchAlertProducts();
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
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : qty <= LOW_STOCK_THRESHOLD
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                <span>{col}:</span>
                <strong>{qty}</strong>
              </span>
            );
          })}
        </div>
      );
    }

    const qty = Number(item.effectiveQuantity || 0);
    return (
      <span className="text-[11px] text-slate-400 font-semibold">
        {item.colour ? `${item.colour} (${qty} pcs)` : `Standard (${qty} pcs)`}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner & Action Controls */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-black uppercase tracking-wider border border-rose-500/30 backdrop-blur-md">
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
              disabled={refreshing || loadingAlerts}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs flex items-center gap-2 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
              title="Refresh inventory counts"
            >
              <RefreshCw className={`w-4 h-4 ${(refreshing || loadingAlerts) ? 'animate-spin' : ''}`} />
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
            <span className="text-[11px] font-bold text-rose-200 block uppercase tracking-wider">Out of Stock (0 PCS)</span>
            <strong className="text-xl sm:text-2xl font-black text-rose-400 block mt-0.5">
              {outOfStockCount}
            </strong>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 backdrop-blur-sm">
            <span className="text-[11px] font-bold text-amber-200 block uppercase tracking-wider">Low Stock (&le; 4 PCS)</span>
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
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search model, brand, mfg, grade, supplier..."
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

      {/* Scannable Inventory Table */}
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
                  const qty = Number(item.effectiveQuantity || 0);
                  const isZero = isOutOfStock(qty);
                  const sup = item.resolvedSupplier;
                  const partCat = item.part_category || item.category || 'Display';
                  const qualVariant = item.quality_variant || item.product_variant_name || item.quality;
                  const mfg = item.manufacturing_brand_name || item.manufacturing_brand;
                  const statusDetails = getStockStatusDetails(qty, LOW_STOCK_THRESHOLD);

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

                          {(item.full_model_list || item.compatible_models || item.compatibleModels || item.model) && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 pt-0.5">
                              <span className="font-semibold text-slate-400">Compat: </span>
                              {item.full_model_list || (Array.isArray(item.compatible_models) ? item.compatible_models.join(', ') : item.compatible_models) || item.model}
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
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl font-black text-xs border shadow-2xs ${statusDetails.badgeClass}`}>
                          <span className={`w-2 h-2 rounded-full ${statusDetails.dotClass}`} />
                          {statusDetails.label}
                        </div>
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
