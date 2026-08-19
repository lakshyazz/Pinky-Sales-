import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, LayoutGrid, List, Search, ArrowRight, Eye, X, Tag, Cpu, CheckCircle2, ShieldAlert, Edit3, Save, Check, Lock, PlusCircle, PackagePlus, Trash2, MoreHorizontal, XCircle, Info } from 'lucide-react';
import Pagination from '../ui/Pagination';
import ExpandableText from '../shared/ExpandableText';
import SearchInput from '../ui/SearchInput';
import ProductThumbnail from '../ui/ProductThumbnail';
import ProductImageUpload from '../ui/ProductImageUpload';
import ProductDetailModal from './ProductDetailModal';
import ProductDetailPage from './ProductDetailPage';

export default function ModelsPage({
  items = [],
  search = '',
  onSearchChange,
  role,
  session,
  api,
  setGlobalToast,
  onProductUpdated,
  onDeleteProduct,
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
  reference = { manufacturingBrands: [] },
}) {
  const isSuperAdmin = role === 'superadmin';
  const isShopkeeper = role === 'shopkeeper' || role === 'admin';
  const canEditSellingPrice = isSuperAdmin || isShopkeeper;
  const [viewMode, setViewModeState] = useState(() => {
    try {
      return localStorage.getItem('models_view_mode') || 'table';
    } catch {
      return 'table';
    }
  }); // 'table' | 'grid'

  const setViewMode = (mode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem('models_view_mode', mode);
    } catch {
      // ignore storage errors
    }
  };
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [inspectProduct, setInspectProduct] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);

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
    colours: '',
    manufacturing_brand_id: '',
    supplier_id: '',
    stock_status: 'in_stock',
    stock_quantity: '',
    image_url: '',
    image_urls: [],
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
    setInspectProduct(product);
  };

  const handleOpenEdit = (product) => {
    const availableQty = Number(product.stock_quantity ?? product.available_stock ?? product.quantity ?? product.stock ?? 0);
    if (!isSuperAdmin && availableQty <= 0) {
      if (setGlobalToast) {
        setGlobalToast('Cannot edit model: You can only edit models when you have available stock in your shop.', 'error');
      } else {
        alert('Cannot edit model: You can only edit models when you have available stock in your shop.');
      }
      return;
    }

    setEditingProduct(product);
    let initialStatus = 'in_stock';
    if (availableQty <= 0) {
      initialStatus = 'no_stock';
    } else if (availableQty <= 5) {
      initialStatus = 'low_stock';
    }

    setEditForm({
      short_name: product.short_name || product.name || '',
      brand: product.brand || '',
      category: product.category || '',
      product_type: product.part_category || product.part_category_name || product.category || '',
      quality_variant: product.quality_variant || product.product_variant_name || '',
      sale_price: product.sale_price !== undefined && product.sale_price !== null ? String(product.sale_price) : '',
      wholesale_price: product.wholesale_price !== undefined && product.wholesale_price !== null ? String(product.wholesale_price) : '',
      purchase_price: product.purchase_price !== undefined && product.purchase_price !== null ? String(product.purchase_price) : '',
      full_model_list: product.full_model_list || product.model || '',
      description: product.description || '',
      colours: Array.isArray(product.colours) ? product.colours.join(', ') : (product.colours || ''),
      manufacturing_brand_id: product.manufacturing_brand_id !== undefined && product.manufacturing_brand_id !== null ? String(product.manufacturing_brand_id) : '',
      supplier_id: product.supplier_id !== undefined && product.supplier_id !== null ? String(product.supplier_id) : '',
      stock_status: initialStatus,
      stock_quantity: String(availableQty),
      image_url: product.image_url || '',
      image_urls: product.image_urls || [],
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
      const isNoStock = editForm.stock_status === 'no_stock';
      const partCat = editForm.product_type || editForm.category || 'Display';
      const parsedColours = typeof editForm.colours === 'string'
        ? editForm.colours.split(',').map(c => c.trim()).filter(Boolean)
        : (Array.isArray(editForm.colours) ? editForm.colours : []);

      const payload = {
        short_name: editForm.short_name,
        name: editForm.short_name,
        brand: editForm.brand,
        category: partCat,
        part_category: partCat,
        quality_variant: editForm.quality_variant || null,
        model: editForm.full_model_list || editForm.short_name || '',
        full_model_list: editForm.full_model_list || '',
        sale_price: editForm.sale_price !== '' && editForm.sale_price !== null ? Number(editForm.sale_price) : 0,
        wholesale_price: editForm.wholesale_price !== '' && editForm.wholesale_price !== null ? Number(editForm.wholesale_price) : 0,
        purchase_price: editForm.purchase_price !== '' && editForm.purchase_price !== null ? Number(editForm.purchase_price) : 0,
        description: editForm.description || '',
        colours: parsedColours,
        manufacturing_brand_id: editForm.manufacturing_brand_id ? Number(editForm.manufacturing_brand_id) : null,
        supplier_id: editForm.supplier_id ? Number(editForm.supplier_id) : null,
        stock_status: editForm.stock_status,
        set_stock_zero: isNoStock,
        stock_quantity: isNoStock ? 0 : (editForm.stock_quantity !== '' ? Number(editForm.stock_quantity) : undefined),
        image_url: editForm.image_url || null,
        image_urls: editForm.image_urls || [],
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
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to update product');
        }
      }

      // Mutate local item properties for immediate UI reactivity
      const mfgBrandObject = reference?.manufacturingBrands?.find(mb => Number(mb.id) === Number(payload.manufacturing_brand_id));
      const supplierObject = reference?.suppliers?.find(s => Number(s.id) === Number(payload.supplier_id));
      Object.assign(editingProduct, {
        short_name: payload.short_name,
        name: payload.short_name,
        brand: payload.brand,
        category: payload.category,
        part_category: payload.part_category,
        quality_variant: payload.quality_variant,
        model: payload.model,
        sale_price: payload.sale_price,
        wholesale_price: payload.wholesale_price,
        purchase_price: payload.purchase_price,
        full_model_list: payload.full_model_list,
        description: payload.description,
        colours: payload.colours,
        manufacturing_brand_id: payload.manufacturing_brand_id,
        manufacturing_brand_name: mfgBrandObject ? mfgBrandObject.name : editingProduct.manufacturing_brand_name,
        supplier_id: payload.supplier_id,
        supplier_name: supplierObject ? supplierObject.name : editingProduct.supplier_name,
        image_url: payload.image_url,
        image_urls: payload.image_urls,
        ...(isNoStock ? { quantity: 0, available_stock: 0, warehouse_stock: 0, stock: 0 } : {}),
      });

      if (setGlobalToast) {
        setGlobalToast(
          isNoStock 
            ? 'Product updated & available stock set to 0 (No Stock in Warehouse)'
            : 'Product details & pricing updated successfully',
          'success'
        );
      }
      if (onProductUpdated) onProductUpdated();
      setEditingProduct(null);
    } catch (err) {
      if (setGlobalToast) setGlobalToast(err.message || 'Failed to update product', 'error');
      else alert(err.message || 'Failed to update product');
    } finally {
      setSavingEdit(false);
    }
  };

  if (inspectProduct) {
    return (
      <div className="space-y-6">
        <ProductDetailPage
          product={inspectProduct}
          onBack={() => setInspectProduct(null)}
          onEdit={(prod) => handleOpenEdit(prod)}
          onAddStock={(prod) => handleOpenAddStock(prod)}
          role={role}
          priceVisibility={reference?.priceVisibility}
          productName={productName}
          fullModelList={fullModelList}
          priceLabel={priceLabel}
        />

        {/* Add Stock to Model Modal */}
        <AnimatePresence>
          {addStockProduct && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm overflow-y-auto">
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
                  <button onClick={() => setAddStockProduct(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="my-4 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-extrabold text-slate-900 text-sm block">{productName(addStockProduct)}</span>
                    <span className="text-slate-500 font-semibold">{addStockProduct.brand || 'Generic'} · {addStockProduct.manufacturing_brand_name && `Mfg: ${addStockProduct.manufacturing_brand_name} · `}{addStockProduct.category || 'General'}</span>
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

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAddStockProduct(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingStock}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                    >
                      {savingStock ? 'Saving...' : 'Add Stock'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Product Modal */}
        <AnimatePresence>
          {editingProduct && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm overflow-y-auto">
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
                      <h3 className="text-xl font-black text-slate-900">Edit Model Details</h3>
                      <p className="text-xs text-slate-500 font-medium">Update pricing, compatibility, brand, supplier and specifications.</p>
                    </div>
                  </div>
                  <button onClick={() => setEditingProduct(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveEdit} className="py-4 space-y-4 text-xs">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Product / Model Name *</label>
                    <input
                      type="text"
                      required
                      value={editForm.short_name}
                      onChange={(e) => setEditForm({ ...editForm, short_name: e.target.value })}
                      placeholder="e.g. iPhone 13 Pro Display Combo"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Device Brand</label>
                      <input
                        type="text"
                        value={editForm.brand}
                        onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                        placeholder="e.g. Apple, Samsung, Xiaomi"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Part Category</label>
                      <input
                        type="text"
                        value={editForm.product_type}
                        onChange={(e) => setEditForm({ ...editForm, product_type: e.target.value, category: e.target.value })}
                        placeholder="e.g. Display, Battery, Camera"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Quality Variant</label>
                      <input
                        type="text"
                        value={editForm.quality_variant}
                        onChange={(e) => setEditForm({ ...editForm, quality_variant: e.target.value })}
                        placeholder="e.g. OLED, HD+ LCD, Original OEM"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Manufacturing Brand</label>
                      <select
                        value={editForm.manufacturing_brand_id}
                        onChange={(e) => setEditForm({ ...editForm, manufacturing_brand_id: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all"
                      >
                        <option value="">Select Manufacturing Brand (Optional)</option>
                        {reference?.manufacturingBrands?.map((mb) => (
                          <option key={mb.id} value={mb.id}>{mb.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Retail Selling Price (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        required
                        disabled={!canEditSellingPrice}
                        value={editForm.sale_price}
                        onChange={(e) => setEditForm({ ...editForm, sale_price: e.target.value })}
                        placeholder="e.g. 1250"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Wholesale Price (₹)</label>
                      <input
                        type="number"
                        step="any"
                        value={editForm.wholesale_price}
                        onChange={(e) => setEditForm({ ...editForm, wholesale_price: e.target.value })}
                        placeholder="e.g. 1100"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Cost / Purchase (₹)</label>
                      <input
                        type="number"
                        step="any"
                        disabled={!isSuperAdmin}
                        value={editForm.purchase_price}
                        onChange={(e) => setEditForm({ ...editForm, purchase_price: e.target.value })}
                        placeholder="e.g. 950"
                        className={`w-full px-3.5 py-2.5 rounded-xl font-bold text-xs outline-none transition-all ${
                          !isSuperAdmin
                            ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-50 border border-slate-200 text-slate-900 focus:border-cyan-500 focus:bg-white'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Compatible Device Models (Comma or Slash separated)</label>
                    <textarea
                      rows={2}
                      value={editForm.full_model_list}
                      onChange={(e) => setEditForm({ ...editForm, full_model_list: e.target.value })}
                      placeholder="e.g. RLM C55, RLM C65 5G, Nord N30, Reno 6"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all resize-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Product Photo / Image URL</label>
                    <ProductImageUpload
                      value={editForm.image_url}
                      urls={editForm.image_urls}
                      onChange={({ image_url, image_urls }) => {
                        setEditForm((prev) => ({
                          ...prev,
                          image_url,
                          image_urls: image_urls || (image_url ? [image_url] : []),
                        }));
                      }}
                      api={api}
                      session={session}
                      disabled={savingEdit}
                    />
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingProduct(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
                    >
                      {savingEdit ? 'Saving...' : 'Save Changes'}
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

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Catalog</span>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">Product Models</h2>
            <p className="text-xs text-slate-500 font-medium">Manage your product catalog, variants, pricing and compatibility.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="flex items-center gap-1 p-1 bg-slate-50 border border-slate-200 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'grid' ? 'bg-white text-slate-950 border border-slate-200/80 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Grid
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'table' ? 'bg-white text-slate-950 border border-slate-200/80 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" /> Table
            </button>
          </div>

          <span className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 font-semibold text-xs border border-slate-200">
            {role !== 'customer' && pager.loaded ? `${filteredItems.length} of ${pager.total.toLocaleString('en-IN')}` : filteredItems.length} Models
          </span>
        </div>
      </div>

      {/* Refined Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search models, brands or categories..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-11 pl-10 pr-4 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all shadow-sm"
        />
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                isSelected 
                  ? 'bg-slate-900 border-slate-900 text-white shadow-sm' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredItems.map((product) => {
            const compatibleStr = fullModelList(product);
            const compatibleList = compatibleStr
              ? String(compatibleStr).split(/[,/;\n\r]+/).map((s) => s.trim()).filter(Boolean)
              : [];

            return (
              <div
                key={product.id}
                className="rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between overflow-hidden relative group hover:border-slate-300 transition-all duration-150"
              >
                {/* Image Area */}
                <div 
                  onClick={() => handleOpenDetails(product)}
                  className="w-full h-36 bg-slate-50 border-b border-slate-100 flex items-center justify-center cursor-pointer overflow-hidden relative"
                >
                  <ProductThumbnail
                    src={product.image_url}
                    imageUrl={product.image_url}
                    imageUrls={product.image_urls}
                    alt={productName(product)}
                    category={product.part_category || product.category || 'Display'}
                    size="100%"
                    className="w-full h-full rounded-none border-none"
                    showZoom={false}
                  />
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Top Row: Category and Brand */}
                    <div className="flex items-center justify-between gap-2 mb-2 text-[10px] uppercase font-bold text-slate-400">
                      <span>{product.category || 'General'}</span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span>{product.brand || 'Generic'}</span>
                        {product.manufacturing_brand_name && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-500 font-semibold">{product.manufacturing_brand_name}</span>
                          </>
                        )}
                        {product.supplier_name && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span className="text-blue-600 font-semibold">Sup: {product.supplier_name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Model Name & description */}
                    <h3 
                      onClick={() => handleOpenDetails(product)}
                      className="text-sm font-semibold text-slate-900 line-clamp-1 hover:text-slate-700 cursor-pointer"
                    >
                      {productName(product)}
                    </h3>

                    {product.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1 font-medium leading-relaxed">
                        {product.description}
                      </p>
                    )}

                    {/* Device Compatibility */}
                    <div className="mt-3.5 pt-3.5 border-t border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Compatible Devices
                      </span>
                      {compatibleList.length > 0 ? (
                        <div className="flex flex-wrap gap-1 items-center">
                          {compatibleList.slice(0, 2).map((dev, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-semibold max-w-[130px] truncate">
                              {dev}
                            </span>
                          ))}
                          {compatibleList.length > 2 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDetails(product);
                              }}
                              className="px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200/80 text-slate-600 text-[10px] font-bold transition-colors cursor-pointer"
                              title="Click to view all compatible devices"
                            >
                              +{compatibleList.length - 2} more
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic font-normal">Universal / Unspecified</span>
                      )}
                    </div>
                  </div>

                  {/* Footer containing Price & Actions */}
                  <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between relative">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-400 block">Retail Price</span>
                      <span className="text-base font-semibold text-emerald-700">{priceLabel(product.sale_price)}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddStock(product);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all text-xs font-semibold flex items-center gap-1 shadow-sm shadow-emerald-600/10 active:scale-95"
                        title="Add Stock"
                      >
                        <PackagePlus className="w-3.5 h-3.5" /> Stock
                      </button>
                      {(() => {
                        const hasStock = isSuperAdmin || Number(product.stock_quantity ?? product.available_stock ?? product.quantity ?? product.stock ?? 0) > 0;
                        return (
                          <button
                            type="button"
                            disabled={!hasStock}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!hasStock) return;
                              handleOpenEdit(product);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border transition-all text-xs font-semibold flex items-center gap-1 shadow-sm ${
                              !hasStock
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95'
                            }`}
                            title={!hasStock ? 'Cannot edit: No stock available in your shop' : 'Edit Product'}
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                        );
                      })()}
                      
                      {/* More Menu Dropdown trigger */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === product.id ? null : product.id);
                          }}
                          className={`p-1.5 rounded-lg border transition-all ${
                            activeMenuId === product.id 
                              ? 'bg-slate-50 border-slate-400 text-slate-900' 
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                          title="More Actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {activeMenuId === product.id && (
                          <>
                            {/* Overlay to close menu */}
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(null);
                              }}
                            />
                            {/* Dropdown body */}
                            <div className="absolute right-0 bottom-full mb-1.5 w-32 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 text-xs text-left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(null);
                                  handleOpenDetails(product);
                                }}
                                className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 font-semibold flex items-center gap-1.5"
                              >
                                <Eye className="w-3.5 h-3.5" /> View Specs
                              </button>
                              {isSuperAdmin && onDeleteProduct && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(null);
                                    onDeleteProduct(product);
                                  }}
                                  className="w-full px-3 py-1.5 text-rose-600 hover:bg-rose-50 font-semibold flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-4 px-5">Model / Product</th>
                  <th className="p-4">Brand</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Compatible Devices</th>
                  <th className="p-4">Sale Price</th>
                  <th className="p-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredItems.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/50 transition-colors duration-150">
                    <td 
                      className="p-4 px-5 font-semibold text-slate-900 cursor-pointer hover:text-cyan-700 transition-colors group/cell"
                      onClick={() => handleOpenDetails(product)}
                      title="Click to view product details"
                    >
                      <div className="flex items-center gap-3">
                        <ProductThumbnail
                          src={product.image_url}
                          imageUrl={product.image_url}
                          imageUrls={product.image_urls}
                          alt={productName(product)}
                          category={product.part_category || product.category || 'Display'}
                          size={38}
                          rounded="10px"
                          showZoom={false}
                        />
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 group-hover/cell:text-cyan-700 transition-colors">{productName(product)}</span>
                          {product.model && product.model !== productName(product) && (
                            <span className="text-[10px] text-slate-400 font-medium">{product.model}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-slate-900 font-semibold">{product.brand || 'Generic'}</span>
                        {product.manufacturing_brand_name && (
                          <span className="text-[10px] text-slate-500 font-medium">Mfg: {product.manufacturing_brand_name}</span>
                        )}
                        {product.supplier_name && (
                          <span className="text-[10px] text-blue-600 font-medium">Supplier: {product.supplier_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold">
                        {product.category || 'General'}
                      </span>
                    </td>
                    <td className="p-4 max-w-xs">
                      <ExpandableText
                        className="model-compatible-preview text-slate-500 font-medium"
                        text={fullModelList(product)}
                        emptyText="No compatible models listed"
                        limit={90}
                      />
                    </td>
                    <td className="p-4 font-semibold text-emerald-700">{priceLabel(product.sale_price)}</td>
                    <td className="p-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenAddStock(product)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all text-xs inline-flex items-center gap-1 active:scale-95 shadow-sm shadow-emerald-600/10"
                        >
                          <PackagePlus className="w-3.5 h-3.5" /> Stock
                        </button>
                        {(() => {
                          const hasStock = isSuperAdmin || Number(product.stock_quantity ?? product.available_stock ?? product.quantity ?? product.stock ?? 0) > 0;
                          return (
                            <button
                              type="button"
                              disabled={!hasStock}
                              onClick={() => {
                                if (!hasStock) return;
                                handleOpenEdit(product);
                              }}
                              className={`px-2.5 py-1.5 rounded-lg border font-semibold transition-all text-xs inline-flex items-center gap-1 shadow-sm ${
                                !hasStock
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95'
                              }`}
                              title={!hasStock ? 'Cannot edit: No stock available in your shop' : 'Edit Product'}
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Edit
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(product)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold transition-all text-xs inline-flex items-center gap-1 active:scale-95"
                        >
                          <Eye className="w-3.5 h-3.5" /> Specs
                        </button>
                        {isSuperAdmin && onDeleteProduct && (
                          <button
                            type="button"
                            onClick={() => onDeleteProduct(product)}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 font-semibold transition-all text-xs inline-flex items-center gap-1 active:scale-95"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        )}
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
                  <span className="text-slate-500 font-semibold">{addStockProduct.brand || 'Generic'} · {addStockProduct.manufacturing_brand_name && `Mfg: ${addStockProduct.manufacturing_brand_name} · `}{addStockProduct.category || 'General'}</span>
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
                {/* Row 1: Display Name & Compatible Devices */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Product Display Name *</label>
                    <input
                      type="text"
                      value={editForm.short_name}
                      onChange={(e) => setEditForm({ ...editForm, short_name: e.target.value })}
                      placeholder="e.g. iPhone 13 Display Original"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Compatible Phone Models (Full List)</label>
                    <input
                      type="text"
                      value={editForm.full_model_list}
                      onChange={(e) => setEditForm({ ...editForm, full_model_list: e.target.value })}
                      placeholder="e.g. iPhone 13, iPhone 13 Pro, A2633"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>
                </div>

                {/* Row 2: Brand, Manufacturing Brand & Supplier */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Brand *</label>
                    <select
                      value={editForm.brand}
                      onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    >
                      <option value="">Select Brand</option>
                      {(reference?.brands || []).map((b) => (
                        <option key={b.id || b.name} value={b.name}>{b.name}</option>
                      ))}
                      {editForm.brand && !(reference?.brands || []).some(b => b.name === editForm.brand) && (
                        <option value={editForm.brand}>{editForm.brand}</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Manufacturing Brand</label>
                    <select
                      value={editForm.manufacturing_brand_id}
                      onChange={(e) => setEditForm({ ...editForm, manufacturing_brand_id: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    >
                      <option value="">Select Mfg Brand</option>
                      {(reference?.manufacturingBrands || [])
                        .filter(mb => mb.is_active || String(mb.id) === String(editForm.manufacturing_brand_id))
                        .map((mb) => (
                          <option key={mb.id} value={mb.id}>{mb.name}</option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Supplier (Optional)</label>
                    <select
                      value={editForm.supplier_id}
                      onChange={(e) => setEditForm({ ...editForm, supplier_id: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    >
                      <option value="">Select Supplier</option>
                      {(reference?.suppliers || [])
                        .filter(s => s.is_active || String(s.id) === String(editForm.supplier_id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Row 3: Part Category & Quality Variant */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Part Category *</label>
                    <input
                      type="text"
                      value={editForm.product_type || editForm.category || ''}
                      onChange={(e) => setEditForm({ ...editForm, product_type: e.target.value, category: e.target.value })}
                      placeholder="e.g. Display, Battery, Camera, Speaker"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block mb-1">Product Quality / Variant</label>
                    <input
                      type="text"
                      value={editForm.quality_variant || ''}
                      onChange={(e) => setEditForm({ ...editForm, quality_variant: e.target.value })}
                      placeholder="e.g. OLED, Incell, With Frame, Fresh New"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-cyan-500 focus:bg-white transition-all text-xs"
                    />
                  </div>
                </div>

                {/* Row 4: Pricing Tiers */}
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
                        onWheel={(e) => e.target.blur()}
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
                        onWheel={(e) => e.target.blur()}
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
                        onWheel={(e) => e.target.blur()}
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

                {/* Cloudflare R2 Product Image Storage */}
                <div className="pt-1">
                  <ProductImageUpload
                    imageUrl={editForm.image_url || ''}
                    imageUrls={editForm.image_urls || []}
                    onImageChange={({ imageUrl, imageUrls }) => {
                      setEditForm(prev => ({
                        ...prev,
                        image_url: imageUrl,
                        image_urls: imageUrls,
                      }));
                    }}
                    category={editForm.product_type || editForm.category || 'Display'}
                    disabled={savingEdit}
                  />
                </div>

                {/* Stock Status Selector Section */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">STOCK STATUS</span>
                      <div className="group relative inline-flex items-center">
                        <Info className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-slate-600 transition-colors" />
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover:block w-52 p-2 bg-slate-900 text-white text-[10px] rounded-lg shadow-lg z-20 pointer-events-none text-center">
                          Selecting "No Stock" sets available warehouse quantity to zero so other shopkeepers see no stock in warehouse.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {editForm.stock_status === 'no_stock'
                        ? 'Warehouse stock will be set to 0'
                        : editForm.stock_status === 'low_stock'
                        ? 'Marked as low stock'
                        : 'In stock & available'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, stock_status: 'in_stock' })}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 border ${
                        editForm.stock_status === 'in_stock'
                          ? 'bg-emerald-50/90 text-emerald-700 border-emerald-300 shadow-sm ring-2 ring-emerald-500/20'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100/60 hover:text-slate-700'
                      }`}
                    >
                      <CheckCircle2 className={`w-4 h-4 ${editForm.stock_status === 'in_stock' ? 'text-emerald-600' : 'text-emerald-500'}`} />
                      In Stock
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, stock_status: 'low_stock' })}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 border ${
                        editForm.stock_status === 'low_stock'
                          ? 'bg-amber-50/90 text-amber-700 border-amber-300 shadow-sm ring-2 ring-amber-500/20'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100/60 hover:text-slate-700'
                      }`}
                    >
                      <ShieldAlert className={`w-4 h-4 ${editForm.stock_status === 'low_stock' ? 'text-amber-600' : 'text-amber-500'}`} />
                      Low Stock
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, stock_status: 'no_stock', stock_quantity: '0' })}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 border ${
                        editForm.stock_status === 'no_stock'
                          ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-sm ring-2 ring-rose-500/20'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100/60 hover:text-slate-700'
                      }`}
                    >
                      <XCircle className={`w-4 h-4 ${editForm.stock_status === 'no_stock' ? 'text-rose-600' : 'text-rose-500'}`} />
                      No Stock
                    </button>
                  </div>
                </div>

                {/* Color Management Section */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider block">Model Available Colours</span>
                    <span className="text-[10px] text-slate-400 font-semibold">Click chip to toggle on/off</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(reference?.colours || []).map((col) => {
                      const activeColours = (editForm.colours || '').split(',').map(c => c.trim()).filter(Boolean);
                      const isSelected = activeColours.some(c => c.toLowerCase() === col.name.toLowerCase());
                      return (
                        <button
                          type="button"
                          key={col.id || col.name}
                          onClick={() => {
                            let next;
                            if (isSelected) {
                              next = activeColours.filter(c => c.toLowerCase() !== col.name.toLowerCase());
                            } else {
                              next = [...activeColours, col.name];
                            }
                            setEditForm({ ...editForm, colours: next.join(', ') });
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            isSelected
                              ? 'bg-teal-600 text-white border-teal-700 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {isSelected ? `✓ ${col.name}` : `+ ${col.name}`}
                        </button>
                      );
                    })}
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
      {role !== 'customer' && pager.loaded && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500 font-medium">
          <div>
            Showing {Math.min((pager.page - 1) * pager.limit + 1, pager.total)}–{Math.min(pager.page * pager.limit, pager.total)} of {pager.total.toLocaleString('en-IN')} models
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={loading || pager.page <= 1}
              onClick={() => onPageChange(pager.page - 1)}
              className={`px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold transition-all ${
                pager.page <= 1 ? 'opacity-50 cursor-not-allowed' : 'bg-white hover:bg-slate-50'
              }`}
            >
              ‹ Previous
            </button>
            <span className="font-bold text-slate-900 px-2.5 py-1 rounded bg-slate-50 border border-slate-200">{pager.page}</span>
            <button
              type="button"
              disabled={loading || pager.page >= pager.totalPages}
              onClick={() => onPageChange(pager.page + 1)}
              className={`px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold transition-all ${
                pager.page >= pager.totalPages ? 'opacity-50 cursor-not-allowed' : 'bg-white hover:bg-slate-50'
              }`}
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
