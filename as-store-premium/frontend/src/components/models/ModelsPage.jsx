import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, LayoutGrid, List, Search, ArrowRight, Eye, X, Tag, Cpu, CheckCircle2, ShieldAlert, Edit3, Save, Check, Lock, PlusCircle, PackagePlus } from 'lucide-react';
import Pagination from '../ui/Pagination';
import ExpandableText from '../shared/ExpandableText';

export default function ModelsPage({
  items = [],
  search = '',
  onSearchChange,
  role,
  session,
  api,
  setGlobalToast,
  onProductUpdated,
  pager = {},
  loading = false,
  onPageChange,
  onPageSizeChange,
  onViewDetails,
  productName = (p) => p?.name || p?.short_name || p?.product_name || 'Product',
  fullModelList = (p) => p?.full_model_list || p?.model || '',
  priceLabel = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`,
  Empty = ({ title }) => (
    <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
      {title || 'No matching models found'}
    </div>
  ),
}) {
  const isSuperAdmin = role === 'superadmin';
  const isShopkeeper = role === 'shopkeeper' || role === 'admin';
  const canEditSellingPrice = isSuperAdmin || isShopkeeper;
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [inspectProduct, setInspectProduct] = useState(null);

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    short_name: '',
    brand: '',
    category: '',
    sale_price: '',
    wholesale_price: '',
    purchase_price: '',
    full_model_list: '',
    description: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Stock Modal State
  const [addStockProduct, setAddStockProduct] = useState(null);
  const [addStockForm, setAddStockForm] = useState({
    quantity: '',
    sale_price: '',
    colour: '',
    notes: '',
  });
  const [savingStock, setSavingStock] = useState(false);

  // Extract unique categories for quick filter pills
  const categories = useMemo(() => {
    const set = new Set(['All']);
    items.forEach((item) => {
      if (item.category) set.add(item.category.trim());
    });
    return Array.from(set);
  }, [items]);

  // Filter items by category
  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') return items;
    return items.filter((item) => String(item.category || '').trim().toLowerCase() === selectedCategory.toLowerCase());
  }, [items, selectedCategory]);

  const handleOpenDetails = (product) => {
    if (onViewDetails) {
      onViewDetails(product);
    } else {
      setInspectProduct(product);
    }
  };

  const handleOpenEdit = (product) => {
    setEditingProduct(product);
    setEditForm({
      short_name: product.short_name || product.name || '',
      brand: product.brand || '',
      category: product.category || '',
      sale_price: product.sale_price !== undefined && product.sale_price !== null ? String(product.sale_price) : '',
      wholesale_price: product.wholesale_price !== undefined && product.wholesale_price !== null ? String(product.wholesale_price) : '',
      purchase_price: product.purchase_price !== undefined && product.purchase_price !== null ? String(product.purchase_price) : '',
      full_model_list: product.full_model_list || product.model || '',
      description: product.description || '',
    });
  };

  const handleOpenAddStock = (product) => {
    setAddStockProduct(product);
    setAddStockForm({
      quantity: '',
      sale_price: product.sale_price !== undefined && product.sale_price !== null ? String(product.sale_price) : '',
      colour: '',
      notes: '',
    });
  };

  const handleSaveAddStock = async (e) => {
    if (e) e.preventDefault();
    if (!addStockProduct) return;
    const qty = Number(addStockForm.quantity);
    if (!addStockForm.quantity || isNaN(qty) || qty <= 0) {
      if (setGlobalToast) setGlobalToast('Please enter a valid stock quantity', 'error');
      else alert('Please enter a valid stock quantity');
      return;
    }

    try {
      setSavingStock(true);
      const token = session?.token || localStorage.getItem('token');
      const payload = {
        product_id: addStockProduct.id,
        quantity: qty,
        retail_price: addStockForm.sale_price ? Number(addStockForm.sale_price) : undefined,
        colour: addStockForm.colour || undefined,
        notes: addStockForm.notes || `Stock added via model catalog (${productName(addStockProduct)})`,
      };

      if (api) {
        await api('/stock', { method: 'PUT', body: JSON.stringify(payload) }, token);
      } else {
        const res = await fetch('/api/stock', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update stock');
      }

      // Update local product stock count for immediate visual reactivity
      if (addStockProduct.quantity !== undefined) {
        addStockProduct.quantity = Number(addStockProduct.quantity || 0) + qty;
      }
      if (addStockForm.sale_price) {
        addStockProduct.sale_price = Number(addStockForm.sale_price);
      }

      if (setGlobalToast) setGlobalToast(`Added ${qty} pcs to stock for ${productName(addStockProduct)}`, 'success');
      if (onProductUpdated) onProductUpdated();
      setAddStockProduct(null);
    } catch (err) {
      if (setGlobalToast) setGlobalToast(err.message || 'Failed to update stock', 'error');
      else alert(err.message || 'Failed to update stock');
    } finally {
      setSavingStock(false);
    }
  };

  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingProduct) return;

    try {
      setSavingEdit(true);
      const token = session?.token || localStorage.getItem('token');
      const payload = {
        short_name: editForm.short_name,
        name: editForm.short_name,
        brand: editForm.brand,
        category: editForm.category,
        sale_price: editForm.sale_price ? Number(editForm.sale_price) : 0,
        wholesale_price: editForm.wholesale_price ? Number(editForm.wholesale_price) : 0,
        purchase_price: editForm.purchase_price ? Number(editForm.purchase_price) : 0,
        full_model_list: editForm.full_model_list,
        description: editForm.description,
      };

      if (api) {
        await api(`/products/${editingProduct.id}`, { method: 'PUT', body: JSON.stringify(payload) }, token);
      } else {
        const res = await fetch(`/api/products/${editingProduct.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update product');
      }

      // Mutate local item properties for immediate UI reactivity
      Object.assign(editingProduct, {
        short_name: payload.short_name,
        name: payload.short_name,
        brand: payload.brand,
        category: payload.category,
        sale_price: payload.sale_price,
        wholesale_price: payload.wholesale_price,
        purchase_price: payload.purchase_price,
        full_model_list: payload.full_model_list,
        description: payload.description,
      });

      if (setGlobalToast) setGlobalToast('Product details & pricing updated successfully', 'success');
      if (onProductUpdated) onProductUpdated();
      setEditingProduct(null);
    } catch (err) {
      if (setGlobalToast) setGlobalToast(err.message || 'Failed to update product', 'error');
      else alert(err.message || 'Failed to update product');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 border border-slate-200/80 rounded-3xl p-6 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-500 text-white shadow-lg shadow-cyan-600/20">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs uppercase font-extrabold tracking-wider text-cyan-600">Hardware Catalog</span>
            <h2 className="text-2xl font-black text-slate-900 mt-0.5">Product Models</h2>
            <p className="text-xs text-slate-500 font-medium">Browse model codes, device compatibility, and price lists.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="flex items-center gap-1 p-1 bg-slate-100/80 border border-slate-200/80 rounded-2xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'grid' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" /> Grid
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'table' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View"
            >
              <List className="w-4 h-4" /> Table
            </button>
          </div>

          <span className="px-3.5 py-2 rounded-2xl bg-cyan-50 text-cyan-700 font-extrabold text-xs border border-cyan-200/60">
            {role !== 'customer' && pager.loaded ? `${filteredItems.length} of ${pager.total.toLocaleString('en-IN')}` : filteredItems.length} Models
          </span>
        </div>
      </div>

      {/* Dedicated Large Full-Width Search Bar */}
      <div className="w-full relative shadow-xl shadow-slate-200/50 rounded-3xl overflow-hidden bg-white border-2 border-slate-300 focus-within:border-cyan-500 focus-within:ring-4 focus-within:ring-cyan-500/10 transition-all">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search model, brand, category, or description..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full bg-transparent border-none outline-none font-bold text-slate-900 placeholder-slate-400"
          style={{
            paddingLeft: '56px',
            paddingRight: search ? '52px' : '24px',
            paddingTop: '16px',
            paddingBottom: '16px',
            fontSize: '17px',
            minHeight: '58px',
            width: '100%'
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredItems.map((product) => {
            const compatibleStr = fullModelList(product);
            const compatibleList = compatibleStr
              ? compatibleStr.split(',').map((s) => s.trim()).filter(Boolean)
              : [];

            return (
              <motion.div
                key={product.id}
                whileHover={{ y: -4, scale: 1.015 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="p-5 rounded-3xl bg-white/95 border border-slate-200/90 shadow-xl shadow-slate-200/40 backdrop-blur-xl flex flex-col justify-between cursor-pointer group hover:border-cyan-300 transition-all"
                onClick={() => handleOpenDetails(product)}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200/60 text-[11px] font-bold">
                      {product.category || 'General'}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">
                      {product.brand || 'Generic'}
                    </span>
                  </div>

                  <h3 className="text-base font-black text-slate-900 group-hover:text-cyan-700 transition-colors line-clamp-1">
                    {productName(product)}
                  </h3>

                  {product.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1 font-medium">
                      {product.description}
                    </p>
                  )}

                  {/* Device Compatibility Badges */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Compatible Devices
                    </span>
                    {compatibleList.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-h-16 overflow-hidden">
                        {compatibleList.slice(0, 3).map((dev, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            {dev}
                          </span>
                        ))}
                        {compatibleList.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-200/70 text-slate-600 text-[10px] font-bold">
                            +{compatibleList.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 italic font-normal">Universal / Unspecified</span>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Retail Price</span>
                    <span className="text-sm font-black text-emerald-600">{priceLabel(product.sale_price)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAddStock(product);
                      }}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-bold flex items-center gap-1 shadow-md shadow-emerald-600/20"
                      title="Add Stock for this Model"
                    >
                      <PackagePlus className="w-3.5 h-3.5" /> + Stock
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(product);
                      }}
                      className="px-3 py-2 rounded-xl bg-cyan-50 text-cyan-700 hover:bg-cyan-600 hover:text-white transition-all text-xs font-bold flex items-center gap-1 shadow-sm"
                      title="Edit Product & Prices"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetails(product);
                      }}
                      className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all shadow-sm"
                      title="View Specs"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {!filteredItems.length && (
            <div className="col-span-full p-12 text-center bg-white/80 border border-slate-200/80 rounded-3xl">
              <Smartphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-600">No matching models found</p>
              <p className="text-xs text-slate-400 mt-1">Try clearing filters or searching for another device model.</p>
            </div>
          )}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white/95 border border-slate-200/90 rounded-3xl shadow-xl shadow-slate-200/40 backdrop-blur-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="p-4">Model / Product</th>
                  <th className="p-4">Brand</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Compatible Devices</th>
                  <th className="p-4">Sale Price</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredItems.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4 font-bold text-slate-900">{productName(product)}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold">
                        {product.brand || 'Generic'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-700 border border-cyan-200/60 font-bold">
                        {product.category || 'General'}
                      </span>
                    </td>
                    <td className="p-4 max-w-xs">
                      <ExpandableText
                        className="model-compatible-preview text-slate-600"
                        text={fullModelList(product)}
                        emptyText="No compatible models listed"
                        limit={90}
                      />
                    </td>
                    <td className="p-4 font-black text-emerald-600">{priceLabel(product.sale_price)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenAddStock(product)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all text-xs inline-flex items-center gap-1 shadow-sm"
                        >
                          <PackagePlus className="w-3.5 h-3.5" /> + Stock
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(product)}
                          className="px-3 py-1.5 rounded-xl bg-cyan-50 text-cyan-700 hover:bg-cyan-600 hover:text-white font-bold transition-all text-xs inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(product)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all text-xs inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Specs
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredItems.length && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-semibold">
                      No matching models found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Specs Inspector Modal */}
      <AnimatePresence>
        {inspectProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-cyan-100 text-cyan-800">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{productName(inspectProduct)}</h3>
                    <p className="text-xs text-slate-500 font-semibold">{inspectProduct.brand || 'Generic'} · {inspectProduct.category || 'General'}</p>
                  </div>
                </div>
                <button onClick={() => setInspectProduct(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-4 space-y-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block mb-1">Compatible Device Variants</span>
                  <p className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 font-medium leading-relaxed">
                    {fullModelList(inspectProduct) || 'Universal compatibility'}
                  </p>
                </div>

                {inspectProduct.description && (
                  <div>
                    <span className="text-[10px] uppercase font-extrabold text-slate-400 block mb-1">Description & Notes</span>
                    <p className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 font-medium">
                      {inspectProduct.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <span className="text-[10px] uppercase font-extrabold text-emerald-600 block">Retail Sale Price</span>
                    <span className="text-lg font-black text-emerald-700">{priceLabel(inspectProduct.sale_price)}</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-teal-50 border border-teal-100">
                    <span className="text-[10px] uppercase font-extrabold text-teal-600 block">Official Price</span>
                    <span className="text-lg font-black text-teal-700">{priceLabel(inspectProduct.official_price || inspectProduct.sale_price)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    const prod = inspectProduct;
                    setInspectProduct(null);
                    handleOpenAddStock(prod);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <PackagePlus className="w-4 h-4" /> + Add Stock
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const prod = inspectProduct;
                      setInspectProduct(null);
                      handleOpenEdit(prod);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-cyan-50 hover:bg-cyan-600 hover:text-white text-cyan-700 font-bold text-xs flex items-center gap-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => setInspectProduct(null)}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Stock to Model Modal */}
      <AnimatePresence>
        {addStockProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden p-6 my-8"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
                    <PackagePlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Add Stock to Model</h3>
                    <p className="text-xs text-slate-500 font-medium">Add new inventory pieces to your shop for this existing model.</p>
                  </div>
                </div>
                <button onClick={() => setAddStockProduct(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="my-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                <div>
                  <span className="font-extrabold text-slate-900 text-sm block">{productName(addStockProduct)}</span>
                  <span className="text-slate-500 font-semibold">{addStockProduct.brand || 'Generic'} · {addStockProduct.category || 'General'}</span>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-black text-xs">
                  {priceLabel(addStockProduct.sale_price)}
                </span>
              </div>

              <form onSubmit={handleSaveAddStock} className="space-y-4 text-xs">
                <div>
                  <label className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider block mb-1">Stock Quantity to Add (Pcs) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={addStockForm.quantity}
                    onChange={(e) => setAddStockForm({ ...addStockForm, quantity: e.target.value })}
                    placeholder="e.g. 25"
                    className="w-full px-3.5 py-2.5 bg-emerald-50/60 border border-emerald-300 rounded-xl font-black text-emerald-900 text-sm outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Retail Selling Price (₹)</label>
                    <input
                      type="number"
                      step="any"
                      disabled={!canEditSellingPrice}
                      value={addStockForm.sale_price}
                      onChange={(e) => setAddStockForm({ ...addStockForm, sale_price: e.target.value })}
                      placeholder="e.g. 540"
                      className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs outline-none transition-all ${
                        !canEditSellingPrice
                          ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-slate-50 border border-slate-200 text-slate-900 focus:border-cyan-500 focus:bg-white'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Colour Variant (Optional)</label>
                    <input
                      type="text"
                      value={addStockForm.colour}
                      onChange={(e) => setAddStockForm({ ...addStockForm, colour: e.target.value })}
                      placeholder="e.g. Black, Silver, Transparent"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Batch Notes (Optional)</label>
                  <input
                    type="text"
                    value={addStockForm.notes}
                    onChange={(e) => setAddStockForm({ ...addStockForm, notes: e.target.value })}
                    placeholder="e.g. Received new shipment from vendor"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setAddStockProduct(null)}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingStock}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                  >
                    <PackagePlus className="w-4 h-4" /> {savingStock ? 'Updating Stock...' : 'Save Stock to Inventory'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Product & Prices Modal */}
      <AnimatePresence>
        {editingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden p-6 my-8"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-cyan-600 text-white shadow-md shadow-cyan-600/20">
                    <Edit3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Edit Product & Pricing</h3>
                    <p className="text-xs text-slate-500 font-medium">Update model specifications, device compatibility, and selling prices.</p>
                  </div>
                </div>
                <button onClick={() => setEditingProduct(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="py-5 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Product Display Name</label>
                    <input
                      type="text"
                      required
                      value={editForm.short_name}
                      onChange={(e) => setEditForm({ ...editForm, short_name: e.target.value })}
                      placeholder="e.g. iPhone 13 Display Original"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Brand Manufacturer</label>
                    <input
                      type="text"
                      value={editForm.brand}
                      onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                      placeholder="e.g. Apple, OnePlus, Samsung"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">Product Pricing Tiers</span>
                    {isShopkeeper && !isSuperAdmin && (
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/60 inline-flex items-center gap-1">
                        <Check className="w-3 h-3 text-teal-600" /> Shopkeeper Branch Selling Price Control Enabled
                      </span>
                    )}
                    {!isSuperAdmin && !isShopkeeper && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Price editing restricted
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider block mb-1">Retail Sale Price (₹)</label>
                      <input
                        type="number"
                        step="any"
                        disabled={!canEditSellingPrice}
                        value={editForm.sale_price}
                        onChange={(e) => setEditForm({ ...editForm, sale_price: e.target.value })}
                        placeholder="e.g. 540"
                        title={!canEditSellingPrice ? 'Only Shopkeepers and Super Admin can edit prices' : ''}
                        className={`w-full px-3.5 py-2.5 rounded-xl font-black text-xs outline-none transition-all ${
                          !canEditSellingPrice
                            ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-emerald-50/60 border border-emerald-200 text-emerald-700 focus:border-emerald-500 focus:bg-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-extrabold text-indigo-700 uppercase tracking-wider block mb-1">Wholesale Price (₹)</label>
                      <input
                        type="number"
                        step="any"
                        disabled={!isSuperAdmin}
                        value={editForm.wholesale_price}
                        onChange={(e) => setEditForm({ ...editForm, wholesale_price: e.target.value })}
                        placeholder="e.g. 480"
                        title={!isSuperAdmin ? 'Only Super Admin can edit prices' : ''}
                        className={`w-full px-3.5 py-2.5 rounded-xl font-black text-xs outline-none transition-all ${
                          !isSuperAdmin
                            ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-50/60 border border-indigo-200 text-indigo-700 focus:border-indigo-500 focus:bg-white'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-extrabold text-rose-700 uppercase tracking-wider block mb-1">Purchase Cost (₹)</label>
                      <input
                        type="number"
                        step="any"
                        disabled={!isSuperAdmin}
                        value={editForm.purchase_price}
                        onChange={(e) => setEditForm({ ...editForm, purchase_price: e.target.value })}
                        placeholder="e.g. 380"
                        title={!isSuperAdmin ? 'Only Super Admin can edit prices' : ''}
                        className={`w-full px-3.5 py-2.5 rounded-xl font-black text-xs outline-none transition-all ${
                          !isSuperAdmin
                            ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-rose-50/60 border border-rose-200 text-rose-700 focus:border-rose-500 focus:bg-white'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Product Category</label>
                    <input
                      type="text"
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      placeholder="e.g. Display, Battery, Spare Parts"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Compatible Devices List</label>
                    <input
                      type="text"
                      value={editForm.full_model_list}
                      onChange={(e) => setEditForm({ ...editForm, full_model_list: e.target.value })}
                      placeholder="e.g. iPhone 13, iPhone 13 Pro, A2633"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Description & Specs Notes</label>
                  <textarea
                    rows={3}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Provide additional details, warranty notes, or specifications..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs resize-none"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-600/20 active:scale-95 transition-all"
                  >
                    <Save className="w-4 h-4" /> {savingEdit ? 'Saving Changes...' : 'Save Product & Prices'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Pagination */}
      {role !== 'customer' && (
        <Pagination
          meta={pager}
          loading={loading}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          totalLabel="models"
        />
      )}
    </div>
  );
}
