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
} from 'lucide-react';
import { getCategoryIconInfo } from '../ui/ProductThumbnail';

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
  // Support product, selectedModel, or model props interchangeably
  const activeProduct = product || selectedModel || model;

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

    // 1. Array properties
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

    // 2. Single string image properties
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

  // Current active image source
  const rawActiveImage = imageList[activeImageIndex] || imageList[0] || null;
  const currentActiveSrc = rawActiveImage 
    ? (imageProxyMap[rawActiveImage] || rawActiveImage) 
    : null;
  const hasImageError = Boolean(rawActiveImage && imageErrorMap[rawActiveImage]);
  const isImageValid = Boolean(currentActiveSrc && !hasImageError);

  // Category Icon & Styling info
  const partCategory = activeProduct?.part_category || activeProduct?.category || 'Display';
  const catInfo = getCategoryIconInfo(partCategory);
  const CatIcon = catInfo.Icon;

  // Handle image loading error with proxy fallback
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

  // Parse compatible models list across commas, slashes, semicolons and newlines
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

  // Stock calculation & status badge
  const stockCount = Number(
    activeProduct?.warehouse_stock ??
    activeProduct?.available_stock ??
    activeProduct?.quantity ??
    activeProduct?.stock ??
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
  } else if (stockCount <= 5) {
    stockStatus = 'low_stock';
    stockHealthLabel = 'Low Stock Warning';
    stockLabel = `Low Stock (${stockCount} Units)`;
    stockBadgeClass = 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60';
    stockHealthColor = 'text-amber-600 dark:text-amber-400';
    stockProgressBarColor = 'bg-amber-500';
    StockIcon = AlertCircle;
    estimatedRunoutDays = Math.max(1, Math.round(stockCount * 1.2));
  }

  // Pricing calculations
  const retailPrice = Number(activeProduct?.sale_price || activeProduct?.retail_price || 0);
  const wholesalePrice = Number(activeProduct?.wholesale_price || 0);
  const purchasePrice = Number(activeProduct?.purchase_price || 0);
  const officialPrice = Number(activeProduct?.official_price || 0);

  const profitAmount = purchasePrice > 0 && retailPrice > purchasePrice ? retailPrice - purchasePrice : 0;
  const profitMargin = purchasePrice > 0 && retailPrice > purchasePrice 
    ? Math.round(((retailPrice - purchasePrice) / purchasePrice) * 100)
    : null;

  // Colors list
  const coloursList = useMemo(() => {
    if (!activeProduct?.colours) return [];
    if (Array.isArray(activeProduct.colours)) return activeProduct.colours.filter(Boolean);
    if (typeof activeProduct.colours === 'string') {
      return activeProduct.colours.split(',').map((c) => c.trim()).filter(Boolean);
    }
    return [];
  }, [activeProduct?.colours]);

  // Keyboard accessibility (Esc key)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isZoomModalOpen) setIsZoomModalOpen(false);
        else if (onClose) onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, isZoomModalOpen, onClose]);

  // Reset internal states when product changes
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-slate-950/40 backdrop-blur-sm transition-opacity overflow-hidden">
      {/* Backdrop Mask */}
      <div 
        className="fixed inset-0 cursor-pointer" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      {/* Modern Enterprise Modal Frame */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] overflow-hidden flex flex-col max-h-[92vh] z-10 text-slate-900 dark:text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* ================= STICKY ENTERPRISE HEADER ================= */}
        <div className="px-6 py-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 z-20">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            {/* Header Mini Thumbnail */}
            <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
              {isImageValid ? (
                <img
                  src={currentActiveSrc}
                  alt="Thumbnail"
                  className="w-full h-full object-contain p-1"
                />
              ) : (
                <CatIcon className="w-6 h-6 text-slate-400" />
              )}
            </div>

            {/* Title & Metadata Hierarchy */}
            <div className="min-w-0 flex-1">
              {/* Category Breadcrumbs & Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                <span>{activeProduct.brand || 'Generic'}</span>
                <span>•</span>
                <span>{partCategory}</span>
                {activeProduct.manufacturing_brand_name && (
                  <>
                    <span>•</span>
                    <span className="text-cyan-700 dark:text-cyan-400 font-extrabold">{activeProduct.manufacturing_brand_name}</span>
                  </>
                )}
                {qualityBadge && (
                  <>
                    <span>•</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">{qualityBadge}</span>
                  </>
                )}
              </div>

              {/* Title & Stock Status */}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight truncate">
                  {productName(activeProduct)}
                </h1>

                {/* Stock Status Pill */}
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold shadow-2xs ${stockBadgeClass}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  <span>{stockLabel}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(activeProduct);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center transition-all cursor-pointer ml-1"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ================= MODAL SCROLLABLE BODY ================= */}
        <div className="overflow-y-auto p-6 sm:p-7 space-y-6 flex-1 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">

            {/* ================= LEFT SIDE (40%): Image Gallery ================= */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              {/* Main Showcase Card */}
              <div
                className="relative w-full aspect-square bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/90 dark:border-slate-700/80 rounded-2xl overflow-hidden flex items-center justify-center select-none group shadow-xs"
                onMouseEnter={() => isImageValid && setIsHoveringImage(true)}
                onMouseLeave={() => setIsHoveringImage(false)}
                onMouseMove={handleMouseMove}
              >
                {isImageValid ? (
                  <>
                    <img
                      src={currentActiveSrc}
                      alt={productName(activeProduct)}
                      className={`w-full h-full object-contain p-5 transition-transform duration-200 ease-out ${
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

                    {/* Image Counter Badge */}
                    {imageList.length > 1 && (
                      <div className="absolute top-3.5 right-3.5 px-2.5 py-1 rounded-full bg-slate-900/70 text-white text-[10px] font-bold backdrop-blur-md shadow-sm pointer-events-none">
                        {activeImageIndex + 1} / {imageList.length}
                      </div>
                    )}

                    {/* Hover Zoom Button */}
                    <button
                      type="button"
                      onClick={() => setIsZoomModalOpen(true)}
                      className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white text-xs font-semibold backdrop-blur-md opacity-90 group-hover:opacity-100 transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                      title="Enlarge View"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Zoom</span>
                    </button>
                  </>
                ) : (
                  /* Fallback State */
                  <div
                    className="flex flex-col items-center justify-center text-center p-6 w-full h-full"
                    style={{ background: catInfo.gradient }}
                  >
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xs mb-2.5 border bg-white dark:bg-slate-800"
                      style={{
                        borderColor: catInfo.border,
                        color: catInfo.color,
                      }}
                    >
                      <CatIcon className="w-8 h-8" strokeWidth={2.2} />
                    </div>
                    <span
                      className="text-xs font-black uppercase tracking-widest"
                      style={{ color: catInfo.color }}
                    >
                      {catInfo.label} Component
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                      No high-res photo attached
                    </span>
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onEdit(activeProduct);
                        }}
                        className="mt-3 text-[11px] font-bold text-cyan-700 dark:text-cyan-300 hover:text-cyan-900 bg-white/90 dark:bg-slate-800 border border-cyan-200 dark:border-cyan-800 px-3 py-1.5 rounded-xl shadow-2xs transition-all cursor-pointer"
                      >
                        + Upload Image
                      </button>
                    )}
                  </div>
                )}

                {/* Floating Top-Left Quality Badge */}
                {qualityBadge && (
                  <div className="absolute top-3 left-3 pointer-events-none">
                    <span className="px-2.5 py-1 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 text-slate-800 dark:text-slate-100 font-extrabold text-[10px] uppercase tracking-wider shadow-xs flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                      {qualityBadge}
                    </span>
                  </div>
                )}
              </div>

              {/* Thumbnails Carousel Strip (if > 1 image) */}
              {imageList.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {imageList.map((imgUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative w-16 h-16 rounded-xl border-2 overflow-hidden flex-shrink-0 bg-slate-50 dark:bg-slate-800 p-1 transition-all cursor-pointer ${
                        activeImageIndex === idx
                          ? 'border-slate-900 dark:border-white shadow-md scale-105'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={imageProxyMap[imgUrl] || imgUrl}
                        alt={`Thumb ${idx + 1}`}
                        className="w-full h-full object-contain"
                        onError={() => handleImageError(imgUrl)}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ================= RIGHT SIDE (60%): Enterprise Cards ================= */}
            <div className="lg:col-span-7 flex flex-col space-y-5">

              {/* 1. Price Intelligence Card (KPI Grid) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <Activity className="w-3.5 h-3.5" /> Price Intelligence & Profitability
                  </div>
                  {profitMargin !== null && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black">
                      +{profitMargin}% Margin
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Retail Price Card */}
                  <motion.div 
                    whileHover={{ y: -2, boxShadow: '0 8px 20px -4px rgba(16, 185, 129, 0.12)' }}
                    className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 flex flex-col justify-between transition-all"
                  >
                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-700 dark:text-emerald-400">
                      Retail Price
                    </span>
                    <div className="mt-2">
                      <span className="text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-200 tracking-tight">
                        {priceLabel(retailPrice)}
                      </span>
                    </div>
                  </motion.div>

                  {/* Wholesale Price Card */}
                  <motion.div 
                    whileHover={{ y: -2, boxShadow: '0 8px 20px -4px rgba(99, 102, 241, 0.12)' }}
                    className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/50 flex flex-col justify-between transition-all"
                  >
                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-700 dark:text-indigo-400">
                      Wholesale
                    </span>
                    <div className="mt-2">
                      <span className="text-xl sm:text-2xl font-black text-indigo-950 dark:text-indigo-200 tracking-tight">
                        {canViewWholesale && wholesalePrice > 0 ? priceLabel(wholesalePrice) : '—'}
                      </span>
                    </div>
                  </motion.div>

                  {/* Cost Price Card */}
                  <motion.div 
                    whileHover={{ y: -2, boxShadow: '0 8px 20px -4px rgba(244, 63, 94, 0.12)' }}
                    className="p-3.5 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/50 flex flex-col justify-between transition-all"
                  >
                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-rose-700 dark:text-rose-400">
                      Cost Price
                    </span>
                    <div className="mt-2">
                      <span className="text-xl sm:text-2xl font-black text-rose-950 dark:text-rose-200 tracking-tight">
                        {canViewPurchase && purchasePrice > 0 ? priceLabel(purchasePrice) : '—'}
                      </span>
                    </div>
                  </motion.div>

                  {/* Profit Margin Card */}
                  <motion.div 
                    whileHover={{ y: -2, boxShadow: '0 8px 20px -4px rgba(16, 185, 129, 0.15)' }}
                    className="p-3.5 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white border border-slate-800 dark:border-slate-700 flex flex-col justify-between shadow-sm transition-all"
                  >
                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Profit
                    </span>
                    <div className="mt-2">
                      <span className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">
                        {canViewPurchase && profitMargin !== null ? `+${profitMargin}%` : 'N/A'}
                      </span>
                      {canViewPurchase && profitAmount > 0 && (
                        <span className="block text-[10px] text-slate-300 font-medium">
                          {priceLabel(profitAmount)} / unit
                        </span>
                      )}
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* 2. Product Specifications Section */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" /> Product Specifications
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Quality Grade */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200/70 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-400 shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 block">Quality Grade</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                        {qualityBadge || 'Standard Grade'}
                      </span>
                    </div>
                  </div>

                  {/* Part Category */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-400 shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 block">Part Category</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                        {partCategory}
                      </span>
                    </div>
                  </div>

                  {/* Device Brand */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 text-blue-700 dark:text-blue-400 shrink-0">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 block">Device Brand</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                        {activeProduct.brand || 'Generic'}
                      </span>
                    </div>
                  </div>

                  {/* Manufacturer */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/70 dark:border-teal-800/60 text-teal-700 dark:text-teal-400 shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 block">Manufacturer</span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate block">
                        {activeProduct.manufacturing_brand_name || 'Generic'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Colors & Variant Stock (if available) */}
                {(coloursList.length > 0 || (activeProduct.colour_stock && Object.keys(activeProduct.colour_stock).length > 0)) && (
                  <div className="mt-3 p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500">Color Variants & Stock</span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeProduct.colour_stock && Object.keys(activeProduct.colour_stock).length > 0 ? (
                        Object.entries(activeProduct.colour_stock).map(([col, qty]) => (
                          <span
                            key={col}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-bold shadow-2xs flex items-center gap-1.5 ${
                              Number(qty) > 0 
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' 
                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                            }`}
                          >
                            <span>{col}:</span>
                            <b className={Number(qty) > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400'}>{qty} pcs</b>
                          </span>
                        ))
                      ) : (
                        coloursList.map((col, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold shadow-2xs"
                          >
                            {col}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Stock Analytics & Inventory Health Overview */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-800/40 dark:via-slate-800/20 dark:to-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-700/60">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5" /> Stock & Inventory Analytics
                  </span>
                  <span className={`text-xs font-bold flex items-center gap-1 ${stockHealthColor}`}>
                    <span className="w-2 h-2 rounded-full bg-current" />
                    {stockHealthLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Available Stock</span>
                    <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">{stockCount} Units</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Stock Health</span>
                    <span className={`text-base font-black mt-0.5 block ${stockHealthColor}`}>
                      {stockCount > 5 ? 'Optimal' : stockCount > 0 ? 'Low' : 'Depleted'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Est. Runout</span>
                    <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                      {estimatedRunoutDays > 0 ? `~${estimatedRunoutDays} Days` : 'Immediate'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Reorder Status</span>
                    <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">
                      {stockCount <= 5 ? 'Reorder Now' : 'Sufficient'}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-700/60 h-2 rounded-full overflow-hidden mt-1">
                  <div 
                    className={`h-full ${stockProgressBarColor} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.min(100, Math.max(10, stockCount * 4))}%` }}
                  />
                </div>
              </div>

              {/* 4. Compatible Device Models (Individual Model Chips) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Compatible Devices
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                      {allCompatibleModels.length} Models
                    </span>
                  </div>

                  {allCompatibleModels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(allCompatibleModels.join(', '), 'compatible_list')}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'compatible_list' ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCheck className="w-3.5 h-3.5" /> Copied All
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Copy className="w-3.5 h-3.5" /> Copy List
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Compatibility Search Bar */}
                {allCompatibleModels.length > 5 && (
                  <div className="relative mb-2.5">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search compatible models (e.g. C55, C65, F23)..."
                      value={compatSearch}
                      onChange={(e) => setCompatSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-slate-400 transition-all"
                    />
                  </div>
                )}

                {/* Model Chips Grid */}
                {filteredCompatibleModels.length > 0 ? (
                  <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl">
                    <div className="flex flex-wrap gap-1.5">
                      {(isCompatExpanded ? filteredCompatibleModels : filteredCompatibleModels.slice(0, 14)).map((modelName, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => copyToClipboard(modelName, `m_${idx}`)}
                          className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-2xs cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                          title="Click to copy model name"
                        >
                          <Smartphone className="w-3 h-3 text-slate-400" />
                          <span>{modelName}</span>
                          {copiedField === `m_${idx}` && (
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 ml-0.5" />
                          )}
                        </button>
                      ))}
                    </div>

                    {filteredCompatibleModels.length > 14 && (
                      <button
                        type="button"
                        onClick={() => setIsCompatExpanded(!isCompatExpanded)}
                        className="mt-2.5 text-xs font-bold text-cyan-700 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {isCompatExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" /> Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" /> +{filteredCompatibleModels.length - 14} more models
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-xs text-slate-400 font-medium">
                    {compatSearch
                      ? `No models matching "${compatSearch}"`
                      : 'Universal or unspecified device compatibility'}
                  </div>
                )}
              </div>

              {/* 5. Description & Catalog Notes */}
              {activeProduct.description && (
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                    Catalog Notes & Description
                  </span>
                  <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl text-slate-700 dark:text-slate-300 text-xs font-medium leading-relaxed whitespace-pre-wrap">
                    {activeProduct.description}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ================= FIXED STICKY FOOTER ================= */}
        <div className="px-6 py-4 bg-slate-50/90 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-400 font-medium hidden sm:flex items-center gap-1.5">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] font-bold shadow-2xs text-slate-600 dark:text-slate-300">Esc</kbd>
            <span>to close</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => {
                const specSheet = `[PINKY SALES INVENTORY SPEC SHEET]\nProduct: ${productName(activeProduct)}\nBrand: ${activeProduct.brand || 'Generic'}\nCategory: ${partCategory}\nQuality: ${qualityBadge || 'Standard'}\nRetail Price: ${priceLabel(retailPrice)}\nStock: ${stockCount} Units\nSKU: ${skuCode}\nCompatible Models: ${allCompatibleModels.join(', ') || 'Universal'}`;
                copyToClipboard(specSheet, 'footer_share');
              }}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              {copiedField === 'footer_share' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copied Spec Sheet</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Spec Sheet</span>
                </>
              )}
            </button>

            {onAddStock && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddStock(activeProduct);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/15 active:scale-95 transition-all cursor-pointer"
              >
                <PackagePlus className="w-4 h-4" />
                <span>+ Update Stock</span>
              </button>
            )}

            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(activeProduct);
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Details</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>

      {/* ================= FULL-SCREEN ZOOM LIGHTBOX MODAL ================= */}
      <AnimatePresence>
        {isZoomModalOpen && isImageValid && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn"
            onClick={() => setIsZoomModalOpen(false)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Zoom Top Bar */}
              <div className="w-full flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-sm truncate max-w-md">
                    {productName(activeProduct)}
                  </span>
                  <span className="text-xs text-slate-400">· High-Res Inspector</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(1, z - 0.25))}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsZoomModalOpen(false)}
                    className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 ml-2 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Zoom Image Stage */}
              <div className="overflow-auto max-h-[78vh] w-full flex items-center justify-center p-4">
                <img
                  src={currentActiveSrc}
                  alt={productName(activeProduct)}
                  style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease-out' }}
                  className="max-h-[70vh] object-contain rounded-xl"
                />
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
