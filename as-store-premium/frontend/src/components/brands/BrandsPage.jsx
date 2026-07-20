import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Tags, Search, ArrowRight, Smartphone, AlertCircle, Check, Loader2 } from 'lucide-react';

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
    const seen = new Set();
    return list.filter((p) => {
      const key = p.id || p.product_id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
      const pId = p.id || p.product_id;
      if (!item.products.some((existing) => (existing.id || existing.product_id) === pId)) {
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

  const activeBrandData = activeBrandName ? brandStatsMap.get(activeBrandName.toLowerCase()) : null;
  const explorerProducts = propProducts || activeBrandData?.products || [];
  const filteredExplorerProducts = explorerProducts.filter((p) =>
    (p.name || p.short_name || p.product_name || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
    (p.model || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(modalSearch.toLowerCase())
  );

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
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 font-extrabold text-xs border border-teal-200/60">
            {brandList.length} Brands
          </span>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
      </AnimatePresence>

      {/* Brand Product Explorer Modal */}
      <AnimatePresence>
        {activeBrandName && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="relative w-full max-w-4xl bg-white/95 border border-slate-200/90 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-teal-100 text-teal-800 border border-teal-200">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{capitalizeBrand(activeBrandName)} Products</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Showing {filteredExplorerProducts.length} products under brand "{capitalizeBrand(activeBrandName)}"
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filter inside Modal */}
              <div className="p-4 bg-slate-50/80 border-b border-slate-100">
                <div style={{ position: 'relative', maxWidth: '340px' }}>
                  <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder={`Search ${capitalizeBrand(activeBrandName)} products...`}
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    style={{ width: '100%', paddingLeft: '38px', paddingRight: '14px', paddingTop: '8px', paddingBottom: '8px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: '#0f172a', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Modal Table Content */}
              <div className="p-4 overflow-y-auto flex-1">
                {productLoading ? (
                  <div className="p-8 text-center text-slate-500 font-medium">Loading brand products...</div>
                ) : filteredExplorerProducts.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider">
                          <th className="p-3">Product Name</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Model</th>
                          <th className="p-3">Retail Price</th>
                          <th className="p-3">Stock Units</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredExplorerProducts.map((p) => (
                          <tr key={p.id || p.product_id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-bold text-slate-900">{productName(p)}</td>
                            <td className="p-3">
                              <span className="px-2 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/60 font-semibold">
                                {p.category || 'General'}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-slate-600">{p.model || '—'}</td>
                            <td className="p-3 font-extrabold text-slate-800">
                              {currency(p.sale_price || p.retail_price || p.official_price || 0)}
                            </td>
                            <td className="p-3">
                              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200">
                                {Number(p.total_stock || p.available_quantity || p.quantity || 0)} units
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 font-semibold">
                    No products found under brand "{capitalizeBrand(activeBrandName)}".
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
