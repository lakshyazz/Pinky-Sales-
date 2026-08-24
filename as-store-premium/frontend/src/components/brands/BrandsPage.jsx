import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Tags, Search, ArrowRight, Smartphone, AlertCircle, Check, Loader2, Layers, Coins, Activity, Clock, SlidersHorizontal, Inbox, ChevronRight, Download } from 'lucide-react';
import { exportProductBrandsExcel } from '../../utils/excelExport';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const capitalizeBrand = (str) => {
  if (!str) return 'Generic';
  const clean = String(str).trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export default function BrandsPage({
  session,
  setGlobalToast,
  api,
  data = {},
  onBrandChange,
  onAddReferenceOption,
  onEditReferenceOption,
  onDeleteReferenceOption,
  currency = formatCurrency,
  productName = (p) => p?.name || p?.short_name || p?.product_name || 'Product',
  brands: propBrands,
  selectedBrand: propSelectedBrand,
  products: propProducts,
  search: propSearch = '',
  loading = false,
  productLoading = false,
  onSearchChange,
  onSelectBrand,
  onClearBrand,
  onOpenStockBrand,
  onViewDetails,
  fullModelList = (p) => p?.full_model_list || p?.model || '',
  priceLabel = (val) => formatCurrency(val),
  Empty = ({ title }) => (
    <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
      {title || 'No records found'}
    </div>
  )
}) {
  const [internalSearch, setInternalSearch] = useState('');
  const [selectedBrandState, setSelectedBrandState] = useState(null);
  const [modalSearch, setModalSearch] = useState('');
  const [modalCategory, setModalCategory] = useState('All');
  const [modalStockStatus, setModalStockStatus] = useState('All');
  const [modalSortBy, setModalSortBy] = useState('name-asc');

  // Add/Edit Brand Modal state
  const [showAddBrandModal, setShowAddBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null); // { id, name, rawName }
  const [brandFormName, setBrandFormName] = useState('');
  const [deletingBrand, setDeletingBrand] = useState(null); // { id, name, rawName }
  const [actionSaving, setActionSaving] = useState(false);

  const searchVal = propSearch !== undefined && onSearchChange ? propSearch : internalSearch;
  const activeBrandName = propSelectedBrand || selectedBrandState;
  const isSuperAdmin = session?.role === 'superadmin' || session?.role === 'owner' || !session?.role;

  // Combine products from data.products, data.catalog, data.stock
  const allProducts = React.useMemo(() => {
    const list = [...(data.products || []), ...(data.catalog || []), ...(data.stock || [])];
    const productMap = new Map();
    list.forEach((p) => {
      const key = p.product_id || p.id;
      if (!key) return;
      if (!productMap.has(key)) {
        productMap.set(key, { ...p });
      } else {
        const existing = productMap.get(key);
        // Merge quantities safely
        const existingQty = Number(existing.quantity ?? existing.total_stock ?? existing.available_quantity ?? 0);
        const newQty = Number(p.quantity ?? p.total_stock ?? p.available_quantity ?? 0);
        existing.quantity = Math.max(existingQty, newQty);
        existing.total_stock = Math.max(existingQty, newQty);
        existing.available_quantity = Math.max(existingQty, newQty);
        
        // Merge last stocked / updated timestamps
        if (p.last_stocked_at && (!existing.last_stocked_at || new Date(p.last_stocked_at) > new Date(existing.last_stocked_at))) {
          existing.last_stocked_at = p.last_stocked_at;
        }
        if (p.updated_at && (!existing.updated_at || new Date(p.updated_at) > new Date(existing.updated_at))) {
          existing.updated_at = p.updated_at;
        }
      }
    });
    return Array.from(productMap.values());
  }, [data.products, data.catalog, data.stock]);

  // Aggregate brand statistics
  const brandStatsMap = React.useMemo(() => {
    const map = new Map();

    // Add reference brands
    const refBrands = data.reference?.brands || [];
    refBrands.forEach((b) => {
      const bName = typeof b === 'string' ? b : b.name || b.brand;
      const bId = typeof b === 'object' ? b.id : null;
      if (bName) {
        const key = String(bName).trim().toLowerCase();
        map.set(key, { id: bId, rawName: bName, name: capitalizeBrand(bName), products: [], totalStock: 0, stockValue: 0 });
      }
    });

    // Add brands from products
    allProducts.forEach((p) => {
      const pBrand = String(p.brand || 'Generic').trim();
      const key = pBrand.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { id: null, rawName: pBrand, name: capitalizeBrand(pBrand), products: [], totalStock: 0, stockValue: 0 });
      }
      const item = map.get(key);
      const pId = p.product_id || p.id;
      if (!item.products.some((existing) => (existing.product_id || existing.id) === pId)) {
        item.products.push(p);
        const qty = Number(p.total_stock || p.available_quantity || p.quantity || 0);
        const price = Number(p.sale_price || p.retail_price || p.official_price || 0);
        item.totalStock += qty;
        item.stockValue += qty * price;
      }
    });

    return map;
  }, [data.reference, allProducts]);

  const brandList = React.useMemo(() => {
    if (propBrands && Array.isArray(propBrands) && propBrands.length > 0) {
      return propBrands.map((b) => ({
        id: b.id,
        rawName: b.brand || b.name,
        name: capitalizeBrand(b.brand || b.name),
        products: [],
        totalStock: Number(b.quantity || 0),
        stockValue: Number(b.stock_value || 0),
        productCount: Number(b.product_count || 0)
      })).filter((b) => !searchVal || b.name.toLowerCase().includes(searchVal.toLowerCase()));
    }

    return Array.from(brandStatsMap.values()).filter((item) =>
      !searchVal || item.name.toLowerCase().includes(searchVal.toLowerCase())
    );
  }, [propBrands, brandStatsMap, searchVal]);

  const explorerProducts = React.useMemo(() => {
    if (propProducts && Array.isArray(propProducts) && propProducts.length > 0) {
      return propProducts;
    }
    if (!activeBrandName) return [];
    
    // 1. Try brandStatsMap match first
    const activeData = brandStatsMap.get(activeBrandName.toLowerCase());
    if (activeData && Array.isArray(activeData.products) && activeData.products.length > 0) {
      return activeData.products;
    }

    // 2. Comprehensive fallback: filter allProducts across brand & manufacturing brand names
    const targetBrand = activeBrandName.trim().toLowerCase();
    return allProducts.filter((p) => {
      const pBrand = String(p.brand || p.company_brand_name || p.brand_name || '').trim().toLowerCase();
      const pMfgBrand = String(p.manufacturing_brand_name || p.mfg_brand_name || p.manufacturing_brand || '').trim().toLowerCase();
      return pBrand === targetBrand || pMfgBrand === targetBrand || (pBrand && targetBrand.includes(pBrand)) || (targetBrand && pBrand.includes(targetBrand));
    });
  }, [propProducts, activeBrandName, brandStatsMap, allProducts]);

  // Calculate live summary stats for the current brand before search filters
  const modalStats = React.useMemo(() => {
    let totalStock = 0;
    let totalValue = 0;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;

    explorerProducts.forEach((p) => {
      const qty = Number(p.quantity ?? p.total_stock ?? p.available_quantity ?? 0);
      const price = Number(p.sale_price ?? p.retail_price ?? p.official_price ?? 0);
      totalStock += qty;
      totalValue += qty * price;

      if (qty === 0) {
        outOfStock++;
      } else if (qty <= 5) {
        lowStock++;
      } else {
        inStock++;
      }
    });

    return {
      totalProducts: explorerProducts.length,
      totalStock,
      totalValue,
      inStock,
      lowStock,
      outOfStock
    };
  }, [explorerProducts]);

  // Extract unique categories from explorerProducts
  const modalCategories = React.useMemo(() => {
    const categories = new Set();
    explorerProducts.forEach((p) => {
      if (p.category) categories.add(p.category.trim());
    });
    return ['All', ...Array.from(categories)];
  }, [explorerProducts]);

  // Filter and sort products reactively
  const filteredExplorerProducts = React.useMemo(() => {
    let list = explorerProducts.filter((p) => {
      // Search match
      const search = modalSearch.trim().toLowerCase();
      const matchesSearch = !search ||
        (p.name || p.short_name || p.product_name || '').toLowerCase().includes(search) ||
        (p.model || '').toLowerCase().includes(search) ||
        (p.category || '').toLowerCase().includes(search) ||
        (p.manufacturing_brand_name || '').toLowerCase().includes(search);

      // Category match
      const matchesCategory = modalCategory === 'All' || p.category === modalCategory;

      // Stock status match
      const qty = Number(p.quantity ?? p.total_stock ?? p.available_quantity ?? 0);
      let matchesStock = true;
      if (modalStockStatus === 'in_stock') {
        matchesStock = qty > 5;
      } else if (modalStockStatus === 'low_stock') {
        matchesStock = qty > 0 && qty <= 5;
      } else if (modalStockStatus === 'out_of_stock') {
        matchesStock = qty === 0;
      }

      return matchesSearch && matchesCategory && matchesStock;
    });

    // Sorting
    list.sort((a, b) => {
      const nameA = productName(a).toLowerCase();
      const nameB = productName(b).toLowerCase();
      const priceA = Number(a.sale_price ?? a.retail_price ?? a.official_price ?? 0);
      const priceB = Number(b.sale_price ?? b.retail_price ?? b.official_price ?? 0);
      const qtyA = Number(a.quantity ?? a.total_stock ?? a.available_quantity ?? 0);
      const qtyB = Number(b.quantity ?? b.total_stock ?? b.available_quantity ?? 0);

      if (modalSortBy === 'name-asc') {
        return nameA.localeCompare(nameB);
      } else if (modalSortBy === 'name-desc') {
        return nameB.localeCompare(nameA);
      } else if (modalSortBy === 'price-asc') {
        return priceA - priceB;
      } else if (modalSortBy === 'price-desc') {
        return priceB - priceA;
      } else if (modalSortBy === 'stock-asc') {
        return qtyA - qtyB;
      } else if (modalSortBy === 'stock-desc') {
        return qtyB - qtyA;
      }
      return 0;
    });

    return list;
  }, [explorerProducts, modalSearch, modalCategory, modalStockStatus, modalSortBy, productName]);

  const handleSelectBrand = (brandName) => {
    if (onSelectBrand) {
      onSelectBrand(brandName);
    } else {
      setSelectedBrandState(brandName);
    }
  };

  const handleCloseModal = () => {
    if (onClearBrand) {
      onClearBrand();
    } else {
      setSelectedBrandState(null);
    }
  };

  // Add / Edit Brand submission
  const handleSaveBrand = async (e) => {
    if (e) e.preventDefault();
    const cleanName = brandFormName.trim();
    if (!cleanName) {
      if (setGlobalToast) setGlobalToast('Enter a valid brand name', 'error');
      return;
    }
    setActionSaving(true);
    try {
      if (editingBrand) {
        if (onEditReferenceOption && editingBrand.id) {
          await onEditReferenceOption('brands', editingBrand.id, cleanName);
        } else {
          const brandId = editingBrand.id || editingBrand.rawName;
          await api(`/reference-data/brands/${encodeURIComponent(brandId)}`, {
            method: 'PUT',
            body: JSON.stringify({ name: cleanName }),
          });
          if (setGlobalToast) setGlobalToast(`Brand renamed to "${cleanName}"`, 'success');
        }
      } else {
        if (onAddReferenceOption) {
          await onAddReferenceOption('brands', cleanName);
        } else {
          await api('/reference-data/brands', {
            method: 'POST',
            body: JSON.stringify({ name: cleanName }),
          });
          if (setGlobalToast) setGlobalToast(`Brand "${cleanName}" created successfully`, 'success');
        }
      }
      setShowAddBrandModal(false);
      setEditingBrand(null);
      setBrandFormName('');
      if (onBrandChange) await onBrandChange();
    } catch (err) {
      if (setGlobalToast) setGlobalToast(err.message || 'Unable to save brand', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  // Delete / Archive Brand confirmation
  const handleConfirmDeleteBrand = async () => {
    if (!deletingBrand) return;
    setActionSaving(true);
    try {
      const brandId = deletingBrand.id || deletingBrand.rawName;
      if (onDeleteReferenceOption && deletingBrand.id) {
        await onDeleteReferenceOption('brands', deletingBrand.id);
      } else {
        await api(`/reference-data/brands/${encodeURIComponent(brandId)}`, {
          method: 'DELETE',
        });
        if (setGlobalToast) setGlobalToast(`Brand "${deletingBrand.name}" removed successfully`, 'success');
      }
      setDeletingBrand(null);
      if (onBrandChange) await onBrandChange();
    } catch (err) {
      if (setGlobalToast) setGlobalToast(err.message || 'Unable to delete brand', 'error');
    } finally {
      setActionSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 border border-slate-200/80 rounded-3xl p-6 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-teal-600">Product Portfolio</span>
          <h2 className="text-2xl font-black text-slate-900 mt-1">Product Brands</h2>
          <p className="text-xs text-slate-500 font-medium">Browse hardware and spare parts catalog grouped by brand manufacturer.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <span className="px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 font-extrabold text-xs border border-teal-200/60">
            {brandList.length} Brands
          </span>
          <button
            type="button"
            onClick={() => {
              if (!brandList.length) {
                if (setGlobalToast) setGlobalToast('No brands found to export', 'error');
                return;
              }
              exportProductBrandsExcel(brandList);
              if (setGlobalToast) setGlobalToast('Product Brands Excel (.xlsx) downloaded', 'success');
            }}
            className="px-4 py-3 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 hover:border-teal-300 text-slate-700 hover:text-teal-700 font-bold text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
            title="Download Product Brands spreadsheet (.xlsx)"
          >
            <Download className="w-4 h-4 text-teal-600" /> Export Excel
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingBrand(null);
              setBrandFormName('');
              setShowAddBrandModal(true);
            }}
            className="px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-600/25 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Brand
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '580px' }}>
        <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', width: '20px', height: '20px', color: '#64748b', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search brand name..."
          value={searchVal}
          onChange={(e) => onSearchChange ? onSearchChange(e.target.value) : setInternalSearch(e.target.value)}
          style={{
            width: '100%',
            paddingLeft: '48px',
            paddingRight: searchVal ? '40px' : '20px',
            paddingTop: '13px',
            paddingBottom: '13px',
            backgroundColor: '#ffffff',
            border: '2px solid #cbd5e1',
            borderRadius: '20px',
            fontSize: '15px',
            fontWeight: '600',
            color: '#0f172a',
            outline: 'none',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.06)'
          }}
        />
        {searchVal && (
          <button
            type="button"
            onClick={() => onSearchChange ? onSearchChange('') : setInternalSearch('')}
            style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Brand Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {brandList.map((item) => (
          <motion.div
            key={item.name}
            whileHover={{ y: -4, scale: 1.015 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="p-5 rounded-3xl bg-white/95 border border-slate-200/90 shadow-xl shadow-slate-200/40 backdrop-blur-xl flex flex-col justify-between cursor-pointer group hover:border-teal-300 transition-all relative overflow-hidden"
            onClick={() => handleSelectBrand(item.rawName)}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-all">
                  <Tags className="w-5 h-5" />
                </div>
                
                {/* Brand Action Buttons: Edit and Delete */}
                <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title={`Rename brand ${item.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingBrand(item);
                      setBrandFormName(item.rawName || item.name);
                      setShowAddBrandModal(true);
                    }}
                    className="p-2 rounded-xl bg-slate-100/80 hover:bg-teal-50 text-slate-500 hover:text-teal-600 border border-slate-200/60 hover:border-teal-200 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={`Delete brand ${item.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingBrand(item);
                    }}
                    className="p-2 rounded-xl bg-slate-100/80 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/60 hover:border-rose-200 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg font-black text-slate-900 group-hover:text-teal-700 transition-all">{item.name}</h3>

              <div className="mt-4 space-y-1.5 text-xs font-medium text-slate-500">
                <div className="flex justify-between items-center">
                  <span>Product Models:</span>
                  <span className="font-extrabold text-slate-800">
                    {item.productCount !== undefined ? item.productCount : item.products.length} models
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Stock Available:</span>
                  <span className="font-extrabold text-emerald-600">{item.totalStock} units</span>
                </div>
                {item.stockValue > 0 && (
                  <div className="flex justify-between items-center">
                    <span>Valuation:</span>
                    <span className="font-extrabold text-slate-700">{currency(item.stockValue)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-teal-600 group-hover:text-teal-700">
              <span>View Brand Products</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-all" />
            </div>
          </motion.div>
        ))}

        {brandList.length === 0 && (
          <div className="col-span-full p-12 text-center bg-white/80 border border-slate-200/80 rounded-3xl">
            <Tags className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">No brands found</p>
            <p className="text-xs text-slate-400 mt-1">Click "+ Add Brand" above to register a new brand manufacturer.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Brand Modal */}
      <AnimatePresence>
        {showAddBrandModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-teal-100 text-teal-700 border border-teal-200">
                    <Tags className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {editingBrand ? 'Edit Brand Name' : 'Add New Brand'}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      {editingBrand ? 'Rename this phone or spare parts brand.' : 'Register a new phone or spare parts brand.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBrandModal(false);
                    setEditingBrand(null);
                    setBrandFormName('');
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveBrand} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-600 mb-2">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Realme, Vivo, OnePlus, Motorola..."
                    value={brandFormName}
                    onChange={(e) => setBrandFormName(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 text-sm font-bold text-slate-900 outline-none transition-all"
                  />
                  <p className="text-[11px] text-slate-400 font-medium mt-1.5">
                    This brand will automatically appear across products, stock entries, and filters.
                  </p>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddBrandModal(false);
                      setEditingBrand(null);
                      setBrandFormName('');
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionSaving || !brandFormName.trim()}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-teal-600/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    {actionSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" /> {editingBrand ? 'Update Brand' : 'Save Brand'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Brand Confirmation Modal */}
      <AnimatePresence>
        {deletingBrand && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-3xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto shadow-inner">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Delete Brand "{deletingBrand.name}"?
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1.5 leading-relaxed">
                    This brand will be archived and hidden from dropdowns and filters. Product stock records will remain safe.
                  </p>
                </div>

                <div className="pt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDeletingBrand(null)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={actionSaving}
                    onClick={handleConfirmDeleteBrand}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold shadow-lg shadow-rose-600/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    {actionSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" /> Delete Brand
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>      {/* Brand Product Explorer Modal */}
      <AnimatePresence>
        {activeBrandName && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-md">
            {/* Backdrop click listener */}
            <div className="absolute inset-0 cursor-default" onClick={handleCloseModal} />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 30 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="relative w-full h-full sm:h-auto sm:max-h-[85vh] md:max-h-[90vh] sm:max-w-5xl bg-white border-0 sm:border border-slate-200/80 rounded-none sm:rounded-[24px] shadow-2xl backdrop-blur-2xl overflow-hidden flex flex-col z-10"
            >
              {/* Modal Header */}
              <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 sticky top-0 backdrop-blur-md z-20">
                <div className="flex items-start gap-4">
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/20">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">{capitalizeBrand(activeBrandName)} Products</h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-slate-500 mt-1">
                      <span>{modalStats.totalProducts} Products</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-teal-600">{currency(modalStats.totalValue)} Valuation</span>
                      <span className="text-slate-300">•</span>
                      <span className={modalStats.outOfStock > 0 ? "text-rose-600 font-extrabold" : "text-emerald-600 font-extrabold"}>
                        {modalStats.outOfStock} Out of Stock
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary Stats Cards */}
              <div className="px-5 sm:px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3 bg-white">
                {/* Total Models */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 shadow-sm flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 border border-slate-200/40">
                    <Inbox className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Total Models</span>
                    <span className="text-base font-black text-slate-800">{modalStats.totalProducts}</span>
                  </div>
                </div>

                {/* Total Stock Units */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 shadow-sm flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600 border border-teal-200/40">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Stock Units</span>
                    <span className="text-base font-black text-slate-800">{modalStats.totalStock} units</span>
                  </div>
                </div>

                {/* Inventory Valuation */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 shadow-sm flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/40">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Valuation</span>
                    <span className="text-base font-black text-emerald-700">{currency(modalStats.totalValue)}</span>
                  </div>
                </div>

                {/* Stock Health */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 shadow-sm flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/40">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Stock Health</span>
                    <span className="text-xs font-extrabold text-slate-700 block mt-0.5">
                      <span className="text-rose-600">{modalStats.outOfStock} Out</span> / <span className="text-emerald-600">{modalStats.inStock} In</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Search & Filters Toolbar */}
              <div className="p-5 sm:p-6 bg-white border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-teal-500 transition-colors pointer-events-none" />
                  <input
                    type="text"
                    placeholder={`Search ${capitalizeBrand(activeBrandName)} products...`}
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 focus:bg-white border-2 border-slate-200/70 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 text-xs font-bold text-slate-900 rounded-2xl outline-none transition-all shadow-sm focus:shadow-md"
                  />
                  {modalSearch && (
                    <button
                      type="button"
                      onClick={() => setModalSearch('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdowns Filters Row */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  {/* Category Filter */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-1.5 shadow-sm">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Category</span>
                    <select
                      value={modalCategory}
                      onChange={(e) => setModalCategory(e.target.value)}
                      className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      {modalCategories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Stock Status Filter */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-1.5 shadow-sm">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Stock</span>
                    <select
                      value={modalStockStatus}
                      onChange={(e) => setModalStockStatus(e.target.value)}
                      className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      <option value="in_stock">In Stock (&gt;5)</option>
                      <option value="low_stock">Low Stock (1-5)</option>
                      <option value="out_of_stock">Out of Stock (0)</option>
                    </select>
                  </div>

                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 rounded-xl px-3 py-1.5 shadow-sm">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Sort By</span>
                    <select
                      value={modalSortBy}
                      onChange={(e) => setModalSortBy(e.target.value)}
                      className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="name-asc">Name: A-Z</option>
                      <option value="name-desc">Name: Z-A</option>
                      <option value="price-asc">Price: Low to High</option>
                      <option value="price-desc">Price: High to Low</option>
                      <option value="stock-desc">Stock: High to Low</option>
                      <option value="stock-asc">Stock: Low to High</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Modal Products List Container */}
              <div className="p-5 sm:p-6 overflow-y-auto flex-1 bg-slate-50/30">
                {productLoading ? (
                  <div className="flex flex-col items-center justify-center p-12 space-y-3">
                    <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                    <span className="text-xs text-slate-500 font-bold">Loading brand products...</span>
                  </div>
                ) : filteredExplorerProducts.length > 0 ? (
                  <>
                    {/* Desktop View Table */}
                    <div className="hidden md:block overflow-hidden rounded-[20px] border border-slate-200/70 bg-white shadow-sm">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50/80 border-b border-slate-200/60 text-slate-400 font-extrabold uppercase tracking-wider text-[9px]">
                            <th className="p-4">Product details</th>
                            <th className="p-4">Category</th>
                            <th className="p-4">Model Code</th>
                            <th className="p-4 text-right">Retail Price</th>
                            <th className="p-4">Stock Level</th>
                            <th className="p-4">Last Stocked</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredExplorerProducts.map((p) => {
                            const qty = Number(p.quantity ?? p.total_stock ?? p.available_quantity ?? 0);
                            const price = Number(p.sale_price ?? p.retail_price ?? p.official_price ?? 0);
                            const lastUpdatedStr = p.last_stocked_at 
                              ? new Date(p.last_stocked_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                              : (p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

                            return (
                              <tr key={p.product_id || p.id} className="hover:bg-slate-50/50 transition-all group">
                                <td className="p-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200/40 text-slate-500 flex items-center justify-center group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                                      <Smartphone className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="font-extrabold text-slate-900 group-hover:text-teal-700 transition-colors text-sm">
                                        {productName(p)}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-extrabold mt-0.5">
                                        Mfg: {p.manufacturing_brand_name || 'Generic'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4">
                                  <span className="inline-flex px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-200/40 font-extrabold">
                                    {p.category || 'General'}
                                  </span>
                                </td>
                                <td className="p-4 font-mono font-bold text-slate-500">
                                  {p.model || '—'}
                                </td>
                                <td className="p-4 text-right font-black text-slate-950 text-sm">
                                  {currency(price)}
                                </td>
                                <td className="p-4">
                                  {qty === 0 ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200/60">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> Out of Stock ({qty})
                                    </span>
                                  ) : qty <= 5 ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200/60">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Low Stock ({qty})
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> In Stock ({qty})
                                    </span>
                                  )}
                                </td>
                                <td className="p-4 text-slate-400 font-semibold">
                                  {lastUpdatedStr}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Tablet & Mobile Adaptive Card Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
                      {filteredExplorerProducts.map((p) => {
                        const qty = Number(p.quantity ?? p.total_stock ?? p.available_quantity ?? 0);
                        const price = Number(p.sale_price ?? p.retail_price ?? p.official_price ?? 0);
                        const lastUpdatedStr = p.last_stocked_at 
                          ? new Date(p.last_stocked_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                          : (p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');

                        return (
                          <motion.div
                            key={p.product_id || p.id}
                            whileHover={{ y: -2, scale: 1.01 }}
                            className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all active:scale-[0.99] group flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div>
                                  <h4 className="text-sm font-extrabold text-slate-900 tracking-tight leading-snug">
                                    {productName(p)}
                                  </h4>
                                  <p className="text-[10px] text-slate-400 font-extrabold mt-0.5">
                                    {p.manufacturing_brand_name || 'Generic'} • {p.category || 'General'}
                                  </p>
                                </div>
                                <span className="text-sm font-black text-teal-600 bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-100 flex-shrink-0">
                                  {currency(price)}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold mb-3">
                                <span className="font-extrabold">Model:</span>
                                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md font-mono">{p.model || '—'}</span>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
                              <div>
                                {qty === 0 ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200/60">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> Out ({qty})
                                  </span>
                                ) : qty <= 5 ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200/60">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Low ({qty})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> In Stock ({qty})
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{lastUpdatedStr}</span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  /* Premium Empty State */
                  <div className="p-12 text-center bg-white border border-slate-200/60 rounded-[24px] max-w-md mx-auto my-6 space-y-4 shadow-sm">
                    <div className="w-16 h-16 bg-slate-50 border border-slate-200/40 rounded-2xl flex items-center justify-center mx-auto text-slate-400 shadow-inner">
                      <Inbox className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800">
                        {explorerProducts.length === 0 ? "No products under this brand" : "No matching products found"}
                      </h4>
                      <p className="text-xs text-slate-400 font-semibold mt-1 leading-relaxed">
                        {explorerProducts.length === 0 
                          ? `There are currently no products registered for "${capitalizeBrand(activeBrandName)}".` 
                          : "Try adjusting your search terms, changing category or resetting filter."}
                      </p>
                    </div>
                    {explorerProducts.length === 0 ? (
                      <button
                        onClick={() => {
                          handleCloseModal();
                          if (setGlobalToast) setGlobalToast("Switch to the Stock List tab to add a new product under this brand.", "info");
                        }}
                        className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-teal-600/20 active:scale-95 transition-all cursor-pointer"
                      >
                        Add Product
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setModalSearch('');
                          setModalCategory('All');
                          setModalStockStatus('All');
                        }}
                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/50 flex justify-end sticky bottom-0 z-20 backdrop-blur-md">
                <button
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs transition-all cursor-pointer active:scale-95"
                >
                  Close Explorer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
