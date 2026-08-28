import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Smartphone,
  Tag,
  Cpu,
  Package,
  PackagePlus,
  Edit3,
  Copy,
  Check,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Truck,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Barcode,
  TrendingUp,
  Layers,
  ShieldCheck,
  Activity,
  Boxes,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Calculator,
  Calendar,
  Eye,
  EyeOff
} from 'lucide-react';
import { getCategoryIconInfo } from '../ui/ProductThumbnail';
import { calculateConsolidatedProduct } from '../../utils/productConsolidation';

export default function ProductDetailModal({
  product,
  selectedModel,
  model,
  isOpen = true,
  onClose = () => {},
  onEdit,
  onAddStock,
  role = 'admin',
  priceVisibility = {},
  productName = (p) => p?.name || p?.short_name || p?.product_name || 'Product Details',
  fullModelList = (p) => p?.full_model_list || p?.model || '',
  priceLabel = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`,
}) {
  const rawProduct = product || selectedModel || model;
  
  // Calculate consolidated multi-supplier product metrics
  const activeProduct = useMemo(() => calculateConsolidatedProduct(rawProduct), [rawProduct]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageErrorMap, setImageErrorMap] = useState({});
  const [imageProxyMap, setImageProxyMap] = useState({});
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.5);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHoveringImage, setIsHoveringImage] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [compatSearch, setCompatSearch] = useState('');
  const [isCompatExpanded, setIsCompatExpanded] = useState(false);

  const isSuperAdmin = role === 'superadmin';
  const isShopkeeper = role === 'shopkeeper' || role === 'admin';
  const isSupplier = role === 'supplier';
  const canViewWholesale = isSuperAdmin || isSupplier || Boolean(priceVisibility?.show_wholesale_price_shopkeeper) || isShopkeeper;
  const canViewPurchase = !isSupplier && (isSuperAdmin || Boolean(priceVisibility?.show_purchase_price_shopkeeper));
  const [showWholesale, setShowWholesale] = useState(!isShopkeeper);

  // Normalize image list across all possible schema variations
  const imageList = useMemo(() => {
    if (!activeProduct) return [];
    const collected = [];

    const addUrl = (url) => {
      if (!url) return;
      if (typeof url === 'string') {
        const trimmed = url.trim();
        if (trimmed.length > 0 && !collected.includes(trimmed)) {
          collected.push(trimmed);
        }
      } else if (typeof url === 'object' && url !== null) {
        const u = url.url || url.src || url.image_url || url.imageUrl;
        if (u && typeof u === 'string' && u.trim().length > 0 && !collected.includes(u.trim())) {
          collected.push(u.trim());
        }
      }
    };

    const arraySources = [
      activeProduct.image_urls,
      activeProduct.imageUrls,
      activeProduct.images,
      activeProduct.photos,
    ];

    for (const source of arraySources) {
      if (Array.isArray(source)) {
        source.forEach(addUrl);
      } else if (typeof source === 'string' && source.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(source);
          if (Array.isArray(parsed)) {
            parsed.forEach(addUrl);
          }
        } catch {}
      }
    }

    const singleSources = [
      activeProduct.image,
      activeProduct.imageUrl,
      activeProduct.image_url,
      activeProduct.src,
      activeProduct.photo,
      activeProduct.photo_url,
      activeProduct.thumbnail,
      activeProduct.thumbnail_url,
    ];

    for (const single of singleSources) {
      addUrl(single);
    }

    return collected;
  }, [activeProduct]);

  const rawActiveImage = imageList[activeImageIndex] || imageList[0] || null;
  const currentActiveSrc = rawActiveImage 
    ? (imageProxyMap[rawActiveImage] || rawActiveImage) 
    : null;
  const hasImageError = Boolean(rawActiveImage && imageErrorMap[rawActiveImage]);
  const isImageValid = Boolean(currentActiveSrc && !hasImageError);

  const partCategory = activeProduct?.part_category || activeProduct?.category || 'Display';
  const catInfo = getCategoryIconInfo(partCategory);
  const CatIcon = catInfo.Icon;

  const handleImageError = (imgUrl) => {
    if (!imgUrl) return;
    if (!imageProxyMap[imgUrl] && !imgUrl.startsWith('data:') && !imgUrl.startsWith('blob:')) {
      let key = imgUrl;
      if (key.includes('/public/')) {
        const parts = key.split('/public/')[1].split('/');
        parts.shift();
        key = parts.join('/');
      } else if (key.includes('/products/')) {
        key = 'products/' + key.split('/products/')[1];
      } else if (key.startsWith('http')) {
        try {
          const u = new URL(key);
          key = u.pathname.replace(/^\/+/, '');
        } catch {}
      }
      if (key) {
        const proxyUrl = `/api/images/${key.replace(/^\/+/, '')}`;
        if (proxyUrl !== imgUrl) {
          setImageProxyMap((prev) => ({ ...prev, [imgUrl]: proxyUrl }));
          return;
        }
      }
    }
    setImageErrorMap((prev) => ({ ...prev, [imgUrl]: true }));
  };

  const rawCompat = fullModelList(activeProduct);
  const allCompatibleModels = useMemo(() => {
    if (!rawCompat) return [];
    return String(rawCompat)
      .split(/[,/;\n\r]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [rawCompat]);

  const filteredCompatibleModels = useMemo(() => {
    if (!compatSearch.trim()) return allCompatibleModels;
    const q = compatSearch.toLowerCase().trim();
    return allCompatibleModels.filter((m) => m.toLowerCase().includes(q));
  }, [allCompatibleModels, compatSearch]);

  const stockCount = Number(
    activeProduct?.available_stock ??
    activeProduct?.quantity ??
    activeProduct?.stock_quantity ??
    activeProduct?.stock ??
    activeProduct?.warehouse_stock ??
    0
  );

  let stockStatus = 'in_stock';
  let stockHealthLabel = 'Healthy Stock';
  let stockLabel = `In Stock (${stockCount} Units)`;
  let stockBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60';
  let stockHealthColor = 'text-emerald-600 dark:text-emerald-400';
  let stockProgressBarColor = 'bg-emerald-500';
  let StockIcon = CheckCircle2;
  let estimatedRunoutDays = Math.max(7, Math.round(stockCount * 1.8));

  if (stockCount <= 0) {
    stockStatus = 'out_of_stock';
    stockHealthLabel = 'Out of Stock';
    stockLabel = 'Out of Stock (0 Units)';
    stockBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60';
    stockHealthColor = 'text-rose-600 dark:text-rose-400';
    stockProgressBarColor = 'bg-rose-500';
    StockIcon = AlertCircle;
    estimatedRunoutDays = 0;
  } else if (stockCount <= 4) {
    stockStatus = 'low_stock';
    stockHealthLabel = 'Low Stock Warning';
    stockLabel = `Low Stock (${stockCount} Units)`;
    stockBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60';
    stockHealthColor = 'text-amber-600 dark:text-amber-400';
    stockProgressBarColor = 'bg-amber-500';
    StockIcon = AlertCircle;
    estimatedRunoutDays = Math.max(1, Math.round(stockCount * 1.2));
  }

  const retailPrice = Number(activeProduct?.sale_price || activeProduct?.retail_price || 0);
  const wholesalePrice = Number(activeProduct?.wholesale_price || 0);
  const avgCostPrice = Number(activeProduct?.avg_cost_price ?? activeProduct?.purchase_price ?? 0);
  const profitAmount = activeProduct?.profit_amount ?? (avgCostPrice > 0 && retailPrice > avgCostPrice ? retailPrice - avgCostPrice : 0);
  const profitMargin = activeProduct?.profit_margin ?? (avgCostPrice > 0 && retailPrice > avgCostPrice ? Math.round(((retailPrice - avgCostPrice) / avgCostPrice) * 100) : null);
  const supplierBreakdown = activeProduct?.supplier_breakdown || [];
  const associatedSuppliers = activeProduct?.associated_suppliers || [];

  const coloursList = useMemo(() => {
    if (!activeProduct?.colours) return [];
    if (Array.isArray(activeProduct.colours)) return activeProduct.colours.filter(Boolean);
    if (typeof activeProduct.colours === 'string') {
      return activeProduct.colours.split(',').map((c) => c.trim()).filter(Boolean);
    }
    return [];
  }, [activeProduct?.colours]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isZoomModalOpen) setIsZoomModalOpen(false);
        else onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isZoomModalOpen, onClose]);

  useEffect(() => {
    setActiveImageIndex(0);
    setCompatSearch('');
    setImageErrorMap({});
    setImageProxyMap({});
    setIsCompatExpanded(false);
  }, [activeProduct?.id]);

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  if (!isOpen || !activeProduct) return null;

  const skuCode = activeProduct.product_code || activeProduct.sku || `PRD-${activeProduct.id}`;
  const qualityBadge = activeProduct.quality_variant || activeProduct.product_variant_name;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/60 backdrop-blur-sm overflow-y-auto animate-fadeIn"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden my-auto max-h-[92vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs border shrink-0"
                style={{ background: catInfo.gradient, borderColor: catInfo.border, color: catInfo.color }}
              >
                <CatIcon className="w-5 h-5" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {activeProduct.brand || 'Generic'} · {partCategory}
                  </span>
                  {associatedSuppliers.length > 1 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[10px] font-extrabold">
                      {associatedSuppliers.length} Suppliers Unified
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                  {productName(activeProduct)}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onAddStock && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAddStock(activeProduct);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <PackagePlus className="w-4 h-4" />
                  <span>+ Stock</span>
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(activeProduct);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Content Scroll Area */}
          <div className="p-6 overflow-y-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Image Showcase */}
              <div className="md:col-span-5 flex flex-col gap-3">
                <div
                  className="relative w-full aspect-square bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl overflow-hidden flex items-center justify-center select-none group shadow-inner"
                  onMouseEnter={() => isImageValid && setIsHoveringImage(true)}
                  onMouseLeave={() => setIsHoveringImage(false)}
                  onMouseMove={handleMouseMove}
                >
                  {isImageValid ? (
                    <>
                      <img
                        src={currentActiveSrc}
                        alt={productName(activeProduct)}
                        className={`w-full h-full object-contain p-4 transition-transform duration-200 ease-out ${
                          isHoveringImage ? 'scale-125' : 'scale-100'
                        }`}
                        style={
                          isHoveringImage
                            ? {
                                transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
                              }
                            : undefined
                        }
                        onError={() => handleImageError(rawActiveImage)}
                        loading="lazy"
                      />

                      {imageList.length > 1 && (
                        <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-slate-900/70 text-white text-[10px] font-bold backdrop-blur-md shadow-sm pointer-events-none">
                          {activeImageIndex + 1} / {imageList.length}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setIsZoomModalOpen(true)}
                        className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-semibold backdrop-blur-md opacity-90 group-hover:opacity-100 transition-all flex items-center gap-1 shadow-md cursor-pointer"
                        title="Enlarge View"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Zoom</span>
                      </button>
                    </>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center text-center p-6 w-full h-full"
                      style={{ background: catInfo.gradient }}
                    >
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xs mb-2 border bg-white dark:bg-slate-800"
                        style={{ borderColor: catInfo.border, color: catInfo.color }}
                      >
                        <CatIcon className="w-8 h-8" strokeWidth={2.2} />
                      </div>
                      <span className="text-xs font-black uppercase tracking-wider" style={{ color: catInfo.color }}>
                        {catInfo.label}
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5">No photo uploaded</span>
                    </div>
                  )}

                  {qualityBadge && (
                    <div className="absolute top-3 left-3 pointer-events-none">
                      <span className="px-2 py-0.5 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 text-slate-800 dark:text-slate-100 font-extrabold text-[10px] uppercase tracking-wider shadow-xs flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                        {qualityBadge}
                      </span>
                    </div>
                  )}
                </div>

                {imageList.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {imageList.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveImageIndex(idx)}
                        className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                          activeImageIndex === idx
                            ? 'border-cyan-600 shadow-md scale-105'
                            : 'border-slate-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img
                          src={imageProxyMap[url] || url}
                          alt={`Thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={() => handleImageError(url)}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Pricing & Quick Analytics */}
              <div className="md:col-span-7 flex flex-col gap-4">
                
                {/* Pricing Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/80 dark:border-teal-800/50 flex flex-col justify-between">
                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-teal-700 dark:text-teal-400">Sale</span>
                    <span className="text-xl font-black text-teal-950 dark:text-teal-200 mt-1">
                      {retailPrice > 0 ? priceLabel(retailPrice) : '—'}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/50 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-700 dark:text-indigo-400">Wholesale</span>
                      {canViewWholesale && (
                        <button
                          type="button"
                          onClick={() => setShowWholesale((prev) => !prev)}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 p-0.5 rounded cursor-pointer transition-colors"
                          title={showWholesale ? "Hide wholesale price" : "Show wholesale price"}
                        >
                          {showWholesale ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                    <span className="text-xl font-black text-indigo-950 dark:text-indigo-200 mt-1">
                      {canViewWholesale && wholesalePrice > 0 ? (showWholesale ? priceLabel(wholesalePrice) : '••••••') : '—'}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/50 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-extrabold tracking-wider text-rose-700 dark:text-rose-400">Cost Price</span>
                      <span className="text-[8px] font-bold px-1 py-0.2 rounded bg-rose-200/60 text-rose-800">Weighted</span>
                    </div>
                    <span className="text-xl font-black text-rose-950 dark:text-rose-200 mt-1">
                      {canViewPurchase && avgCostPrice > 0 ? priceLabel(avgCostPrice) : '—'}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-900 text-white flex flex-col justify-between shadow-sm">
                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Profit
                    </span>
                    <span className="text-xl font-black text-emerald-400 mt-1">
                      {canViewPurchase && profitMargin !== null ? `+${profitMargin}%` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Stock Analytics Card */}
                <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Total Combined Stock</span>
                    <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">{stockCount} Units</span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${stockBadgeClass} flex items-center gap-1.5`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {stockHealthLabel}
                  </span>
                </div>

                {/* Quick Spec List */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70">
                    <span className="text-[9px] uppercase font-extrabold text-slate-400 block">Brand</span>
                    <span className="font-bold text-slate-900 dark:text-white truncate block">{activeProduct.brand || 'Generic'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70">
                    <span className="text-[9px] uppercase font-extrabold text-slate-400 block">Category</span>
                    <span className="font-bold text-slate-900 dark:text-white truncate block">{partCategory}</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Multi-Supplier & Batches Breakdown */}
            {canViewPurchase && supplierBreakdown.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/70 dark:border-slate-700/60">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-indigo-600" /> Suppliers & Batches Breakdown
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {supplierBreakdown.length} Sources
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase font-extrabold text-slate-400 border-b border-slate-200/60">
                        <th className="pb-2 px-2">Supplier</th>
                        <th className="pb-2 px-2 text-right">Unit Cost</th>
                        <th className="pb-2 px-2 text-right">Stock Qty</th>
                        <th className="pb-2 px-2 text-right">Stock Share</th>
                        <th className="pb-2 px-2 text-right">Batch Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {supplierBreakdown.map((s, idx) => {
                        const sharePercent = stockCount > 0 ? Math.round((s.quantity / stockCount) * 100) : 0;
                        const batchValue = (Number(s.purchase_price) || 0) * (Number(s.quantity) || 0);

                        return (
                          <tr key={idx} className="hover:bg-white/60 dark:hover:bg-slate-800/50">
                            <td className="py-2.5 px-2">
                              <strong className="font-bold text-slate-900 dark:text-white">{s.supplier_name}</strong>
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold text-rose-600">
                              {priceLabel(s.purchase_price)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-extrabold text-slate-900 dark:text-white">
                              {s.quantity} pcs
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
                                {sharePercent}%
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-semibold text-slate-600">
                              {priceLabel(batchValue)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {supplierBreakdown.length > 1 && (
                  <div className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 text-[11px] font-mono text-indigo-900 dark:text-indigo-300">
                    Weighted Avg: ({supplierBreakdown.map(s => `${s.quantity} @ ${priceLabel(s.purchase_price)}`).join(' + ')}) ÷ {stockCount} = <strong>{priceLabel(avgCostPrice)}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Compatible Models */}
            {allCompatibleModels.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block">
                  Compatible Device Models ({allCompatibleModels.length})
                </span>
                <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                  {allCompatibleModels.map((m, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 text-slate-700 text-xs font-semibold">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
