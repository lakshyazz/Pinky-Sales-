import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle, 
  Tag, 
  Package, 
  Boxes, 
  ChevronRight, 
  Send, 
  ArrowLeft,
  X,
  History,
  FileText,
  Filter,
  Sparkles
} from 'lucide-react';

export default function BranchOrderStockPage({
  authedFetch,
  showToast,
  currentShop,
  shops = [],
  reference = {},
}) {
  const [activeView, setActiveView] = useState('catalog'); // 'catalog' | 'history'
  const [warehouseProducts, setWarehouseProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  
  // Requisition Cart State: Array of { product, color_breakdown: [{ color, qty }], total_qty, notes }
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Past Requisitions State
  const [pastRequests, setPastRequests] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedRequestDetails, setSelectedRequestDetails] = useState(null);

  // Load Warehouse Catalog
  const loadWarehouseCatalog = async () => {
    try {
      setLoading(true);
      const data = await authedFetch('/branch/warehouse-stock');
      setWarehouseProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(error.message || 'Unable to load central warehouse catalog');
    } finally {
      setLoading(false);
    }
  };

  // Load Past Requisitions
  const loadPastRequests = async () => {
    try {
      setLoadingHistory(true);
      const data = await authedFetch('/stock-requests');
      setPastRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(error.message || 'Unable to load past requisitions');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadWarehouseCatalog();
    loadPastRequests();
  }, [currentShop]);

  // Extract available colors for a product
  const getProductColors = (product) => {
    if (!product) return [];
    const colorSet = new Set();
    
    if (product.colour_stock && typeof product.colour_stock === 'object') {
      Object.keys(product.colour_stock).forEach((col) => {
        if (col && col !== 'Standard' && col !== 'undefined' && col !== 'null') colorSet.add(col.trim());
      });
    }

    if (Array.isArray(product.colours)) {
      product.colours.forEach((c) => { if (c) colorSet.add(String(c).trim()); });
    } else if (typeof product.colours === 'string' && product.colours.trim()) {
      try {
        const parsed = JSON.parse(product.colours);
        if (Array.isArray(parsed)) parsed.forEach((c) => { if (c) colorSet.add(String(c).trim()); });
        else product.colours.split(',').forEach((c) => { if (c.trim()) colorSet.add(c.trim()); });
      } catch {
        product.colours.split(',').forEach((c) => { if (c.trim()) colorSet.add(c.trim()); });
      }
    }

    if (Array.isArray(product.available_colors)) {
      product.available_colors.forEach((c) => { if (c) colorSet.add(String(c).trim()); });
    }

    return Array.from(colorSet).filter(Boolean);
  };

  // Categories & Brands for filtering
  const categories = useMemo(() => {
    const set = new Set();
    warehouseProducts.forEach((p) => {
      const cat = p.part_category || p.category;
      if (cat) set.add(cat);
    });
    return ['all', ...Array.from(set)];
  }, [warehouseProducts]);

  const brands = useMemo(() => {
    const set = new Set();
    warehouseProducts.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return ['all', ...Array.from(set)];
  }, [warehouseProducts]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return warehouseProducts.filter((p) => {
      if (selectedCategory !== 'all' && (p.part_category || p.category) !== selectedCategory) {
        return false;
      }
      if (selectedBrand !== 'all' && p.brand !== selectedBrand) {
        return false;
      }
      if (!q) return true;

      const title = (p.short_name || p.name || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      const mfg = (p.manufacturing_brand_name || '').toLowerCase();
      const variant = (p.quality_variant || '').toLowerCase();
      const models = (p.full_model_list || p.compatible || '').toLowerCase();

      return (
        title.includes(q) ||
        brand.includes(q) ||
        mfg.includes(q) ||
        variant.includes(q) ||
        models.includes(q)
      );
    });
  }, [warehouseProducts, search, selectedCategory, selectedBrand]);

  // Cart Operations
  const handleAddToCart = (product, colorBreakdown = [], defaultQty = 1) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => String(item.product.id) === String(product.id));
      const totalQty = colorBreakdown.length > 0
        ? colorBreakdown.reduce((sum, c) => sum + Number(c.qty || 0), 0)
        : defaultQty;

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          color_breakdown: colorBreakdown,
          total_qty: Math.max(1, totalQty),
        };
        return updated;
      }

      return [
        ...prev,
        {
          product,
          color_breakdown: colorBreakdown,
          total_qty: Math.max(1, totalQty),
        },
      ];
    });
    showToast(`Added "${product.short_name || product.name}" to requisition order`);
  };

  const handleUpdateCartQty = (productId, newQty) => {
    if (newQty <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        String(item.product.id) === String(productId)
          ? { ...item, total_qty: newQty }
          : item
      )
    );
  };

  const handleUpdateCartColorQty = (productId, colorName, newColorQty) => {
    setCart((prev) =>
      prev.map((item) => {
        if (String(item.product.id) !== String(productId)) return item;
        const breakdown = [...(item.color_breakdown || [])];
        const cIdx = breakdown.findIndex((b) => b.color === colorName);
        const parsed = Math.max(0, parseInt(newColorQty, 10) || 0);

        if (cIdx >= 0) {
          if (parsed === 0) breakdown.splice(cIdx, 1);
          else breakdown[cIdx] = { ...breakdown[cIdx], qty: parsed };
        } else if (parsed > 0) {
          breakdown.push({ color: colorName, qty: parsed });
        }

        const totalColorQty = breakdown.reduce((sum, b) => sum + Number(b.qty || 0), 0);
        return {
          ...item,
          color_breakdown: breakdown,
          total_qty: breakdown.length > 0 ? (totalColorQty || 1) : item.total_qty,
        };
      })
    );
  };

  const handleRemoveFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => String(item.product.id) !== String(productId)));
  };

  const totalCartUnits = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.total_qty || 0), 0);
  }, [cart]);

  // Submit Requisition
  const handleSubmitRequisition = async () => {
    if (!cart.length) {
      return showToast('Your requisition order is empty');
    }

    try {
      setSubmitting(true);
      const payload = {
        shop_id: currentShop,
        notes: orderNotes,
        items: cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.short_name || item.product.name,
          brand: item.product.brand,
          quality_grade: item.product.quality_variant,
          requested_qty: Number(item.total_qty),
          color_breakdown: item.color_breakdown || [],
        })),
      };

      const res = await authedFetch('/stock-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showToast(`Requisition ${res.request_number || ''} submitted successfully!`);
      setCart([]);
      setOrderNotes('');
      setIsCartOpen(false);
      await loadPastRequests();
      setActiveView('history');
    } catch (error) {
      showToast(error.message || 'Unable to submit requisition order');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={13} className="text-emerald-600" />
            Approved & Dispatched
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle size={13} className="text-rose-600" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={13} className="text-amber-600" />
            Pending Warehouse Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white/10 backdrop-blur-md text-teal-300 text-xs font-bold border border-white/10">
              <Boxes size={14} />
              Central Warehouse Stock Replenishment
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Order Stock for Branch
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Browse live inventory in Central Warehouse, select required color variants, and submit official stock replenishment requests directly to SuperAdmin.
            </p>
          </div>

          {/* Quick Actions & Navigation */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveView('catalog')}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
                activeView === 'catalog'
                  ? 'bg-white text-slate-900 shadow-md font-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Package size={16} />
              Warehouse Catalog ({warehouseProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveView('history')}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
                activeView === 'history'
                  ? 'bg-white text-slate-900 shadow-md font-black'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <History size={16} />
              My Requisitions ({pastRequests.length})
            </button>

            {/* Cart Trigger Button */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative px-5 py-2.5 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs transition-all flex items-center gap-2.5 shadow-lg shadow-teal-500/20 cursor-pointer"
            >
              <ShoppingCart size={17} />
              <span>Order Drawer</span>
              {totalCartUnits > 0 && (
                <span className="bg-slate-950 text-teal-400 px-2 py-0.5 rounded-full text-[11px] font-black">
                  {totalCartUnits} pcs
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeView === 'catalog' ? (
        <div className="space-y-6">
          {/* Filter & Search Bar */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[280px] relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search catalog by model, brand, variant (e.g. IP 13, OLED, V40e)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-medium focus:border-teal-500 focus:outline-hidden bg-slate-50/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white focus:border-teal-500 focus:outline-hidden cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === 'all' ? 'All Categories' : c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Brand:</span>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white focus:border-teal-500 focus:outline-hidden cursor-pointer"
              >
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b === 'all' ? 'All Brands' : b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-56 bg-slate-100 rounded-3xl animate-pulse" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
              <Package size={40} className="mx-auto text-slate-300" />
              <h3 className="text-base font-bold text-slate-700">No Warehouse Products Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No items currently have available stock in the central warehouse matching your search query.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredProducts.map((product) => {
                const availableColors = getProductColors(product);
                const colorStockMap = product.colour_stock || {};
                const cartItem = cart.find((c) => String(c.product.id) === String(product.id));
                const inCart = Boolean(cartItem);

                return (
                  <div
                    key={product.id}
                    className={`bg-white border rounded-3xl p-5 shadow-xs transition-all flex flex-col justify-between space-y-4 hover:shadow-md ${
                      inCart ? 'border-teal-400 ring-2 ring-teal-500/10' : 'border-slate-200/80'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                          {product.part_category || product.category || 'Display'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {product.warehouse_stock} pcs in Warehouse
                        </span>
                      </div>

                      {/* Title & Specs */}
                      <h3 className="text-sm font-black text-slate-900 leading-snug">
                        {product.short_name || product.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-slate-500 font-medium">
                        {product.brand && (
                          <span className="font-bold text-slate-700">{product.brand}</span>
                        )}
                        {product.quality_variant && (
                          <span className="text-teal-700 font-bold bg-teal-50 px-1.5 py-0.2 rounded">
                            {product.quality_variant}
                          </span>
                        )}
                        {product.manufacturing_brand_name && (
                          <span>Mfg: {product.manufacturing_brand_name}</span>
                        )}
                      </div>

                      {/* Available Colors Tags */}
                      {availableColors.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
                            Warehouse Color Options:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {availableColors.map((col) => {
                              const qty = colorStockMap[col];
                              return (
                                <span
                                  key={col}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"
                                >
                                  {col}
                                  {qty !== undefined && (
                                    <span className="text-[9px] text-slate-500 font-extrabold">({qty})</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Area */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase block">Wholesale Value</span>
                        <span className="text-xs font-black text-slate-800">
                          ₹{Number(product.wholesale_price || product.cost_price || 0).toLocaleString('en-IN')}
                        </span>
                      </div>

                      {inCart ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(product.id, (cartItem.total_qty || 1) - 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="w-8 text-center text-xs font-black text-slate-900">
                            {cartItem.total_qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(product.id, (cartItem.total_qty || 1) + 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                          >
                            <Plus size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromCart(product.id)}
                            className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer ml-1"
                            title="Remove from requisition"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddToCart(product, availableColors.length > 0 ? [{ color: availableColors[0], qty: 1 }] : [], 1)}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                        >
                          <Plus size={14} />
                          Add to Order
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Requisitions History View */
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900">Branch Requisition History</h2>
              <p className="text-xs text-slate-400">All past stock requests sent from this branch to Central Warehouse.</p>
            </div>
            <button
              type="button"
              onClick={loadPastRequests}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
            >
              Refresh Status
            </button>
          </div>

          {loadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : pastRequests.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <History size={36} className="mx-auto text-slate-300" />
              <p className="text-xs font-bold text-slate-600">No previous stock requisitions found for this branch.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pastRequests.map((req) => (
                <div key={req.id} className="py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          {req.request_number || `REQ-${req.id}`}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {new Date(req.created_at).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Requested by: <span className="font-bold text-slate-800">{req.created_by_name || 'Branch Manager'}</span> • Total: <span className="font-black text-slate-900">{req.total_quantity || req.quantity || 1} pcs</span> ({req.total_items || (req.items?.length || 1)} items)
                      </div>
                    </div>
                    <div>{getStatusBadge(req.status)}</div>
                  </div>

                  {/* Rejection / Note Notice */}
                  {req.rejection_reason && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-800 flex items-start gap-2">
                      <AlertCircle size={15} className="mt-0.5 text-rose-600 shrink-0" />
                      <div>
                        <span className="font-bold">Rejection Note: </span>
                        {req.rejection_reason}
                      </div>
                    </div>
                  )}

                  {/* Items Breakdown Accordion */}
                  {req.items && req.items.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                      {req.items.map((item, idx) => {
                        let colors = [];
                        try {
                          colors = typeof item.color_breakdown === 'string' ? JSON.parse(item.color_breakdown) : (item.color_breakdown || []);
                        } catch {}

                        return (
                          <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs space-y-1">
                            <div className="font-black text-slate-900 truncate">
                              {item.product_short_name || item.product_name}
                            </div>
                            <div className="flex items-center justify-between text-slate-500 text-[11px]">
                              <span>Qty: <strong className="text-slate-800">{item.requested_qty} pcs</strong></span>
                              {item.approved_qty > 0 && (
                                <span className="text-emerald-700 font-bold">Approved: {item.approved_qty}</span>
                              )}
                            </div>
                            {colors.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {colors.map((c, i) => (
                                  <span key={i} className="text-[10px] px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-700 font-bold">
                                    {c.color}: {c.qty}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Slide-out Requisition Drawer / Cart */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-lg bg-white h-full shadow-2xl z-10 flex flex-col justify-between overflow-hidden">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <ShoppingCart className="text-teal-600" size={20} />
                <div>
                  <h3 className="text-sm font-black text-slate-900">Requisition Order Cart</h3>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {cart.length} unique items ({totalCartUnits} total units)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 flex items-center justify-center text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Items List */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <ShoppingCart size={40} className="mx-auto text-slate-200" />
                  <p className="text-xs font-bold text-slate-600">Your requisition drawer is empty.</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Browse the warehouse catalog and click "Add to Order" to start building your requisition.
                  </p>
                </div>
              ) : (
                cart.map((item) => {
                  const product = item.product;
                  const availableColors = getProductColors(product);
                  const activeBreakdown = item.color_breakdown || [];

                  return (
                    <div key={product.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-900 truncate">
                            {product.short_name || product.name}
                          </h4>
                          <span className="text-[10px] text-slate-500 font-bold block">
                            {product.brand} {product.quality_variant ? `• ${product.quality_variant}` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(product.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Color Variant Breakdown Selector in Drawer */}
                      {availableColors.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] font-extrabold uppercase text-slate-500 block">
                            Color Variant Quantities:
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {availableColors.map((col) => {
                              const bItem = activeBreakdown.find((b) => b.color === col);
                              const qty = bItem ? bItem.qty : 0;
                              return (
                                <div
                                  key={col}
                                  className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs"
                                >
                                  <span className="text-[11px] font-bold text-slate-700 truncate">{col}</span>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      value={qty || ''}
                                      placeholder="0"
                                      onChange={(e) => handleUpdateCartColorQty(product.id, col, e.target.value)}
                                      className="w-10 text-center text-xs font-black border border-slate-200 rounded py-0.5 focus:border-teal-500 focus:outline-hidden"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Total Item Quantity Stepper */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                        <span className="text-xs font-bold text-slate-600">Total Item Units:</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(product.id, Math.max(1, Number(item.total_qty) - 1))}
                            className="w-6 h-6 flex items-center justify-center rounded bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.total_qty}
                            onChange={(e) => handleUpdateCartQty(product.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="w-12 text-center text-xs font-black border border-slate-200 rounded py-0.5 focus:border-teal-500 focus:outline-hidden bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateCartQty(product.id, Number(item.total_qty) + 1)}
                            className="w-6 h-6 flex items-center justify-center rounded bg-white hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Order Notes Field */}
              {cart.length > 0 && (
                <div className="pt-2">
                  <label className="block text-xs font-extrabold uppercase text-slate-500 mb-1">
                    Requisition Notes / Instructions (Optional):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Urgent weekend replenishment for customer pre-orders..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs font-medium focus:border-teal-500 focus:outline-hidden bg-slate-50"
                  />
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            {cart.length > 0 && (
              <div className="p-5 border-t border-slate-100 bg-slate-50/80 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-500 uppercase">Total Requested:</span>
                  <span className="font-black text-base text-slate-900">{totalCartUnits} units</span>
                </div>
                <button
                  type="button"
                  disabled={submitting || totalCartUnits <= 0}
                  onClick={handleSubmitRequisition}
                  className="w-full py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-600/20 disabled:opacity-50 transition-all"
                >
                  <Send size={15} />
                  {submitting ? 'Submitting Requisition...' : 'Submit Requisition to Warehouse'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
