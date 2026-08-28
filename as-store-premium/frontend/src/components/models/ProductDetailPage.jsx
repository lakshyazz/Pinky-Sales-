import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
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
  X,
  Calculator,
  Calendar,
  Layers2,
  Eye,
  EyeOff
} from 'lucide-react';
import { getCategoryIconInfo } from '../ui/ProductThumbnail';
import { calculateConsolidatedProduct } from '../../utils/productConsolidation';

export default function ProductDetailPage({
  product,
  selectedModel,
  model,
  onBack = () => {},
  onEdit,
  onAddStock,
  role = 'admin',
  priceVisibility = {},
  productName = (p) => p?.name || p?.short_name || p?.product_name || 'Product Details',
  fullModelList = (p) => p?.full_model_list || p?.model || '',
  priceLabel = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`,
}) {
  const rawProduct = product || selectedModel || model;
  const [liveProduct, setLiveProduct] = useState(null);

  useEffect(() => {
    const targetId = rawProduct?.product_id || rawProduct?.id;
    if (!targetId) return;
    const token = localStorage.getItem('token');
    const urlParams = new URLSearchParams(window.location.search);
    const shopQuery = urlParams.get('shop_id') || urlParams.get('shopId') ? `?shop_id=${urlParams.get('shop_id') || urlParams.get('shopId')}` : '';
    fetch(`/api/products/${targetId}${shopQuery}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then(res => res.json())
      .then(data => {
        if (data && !data.error && data.id) {
          setLiveProduct(data);
        }
      })
      .catch(() => {});
  }, [rawProduct?.id, rawProduct?.product_id]);

  const effectiveProduct = useMemo(() => {
    if (!liveProduct) return rawProduct;
    return { ...rawProduct, ...liveProduct };
  }, [rawProduct, liveProduct]);

  // Calculate consolidated multi-supplier product metrics
  const activeProduct = useMemo(() => calculateConsolidatedProduct(effectiveProduct), [effectiveProduct]);

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

  // Parse compatible models list
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
        else if (onBack) onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomModalOpen, onBack]);

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

  if (!activeProduct) return null;

  const skuCode = activeProduct.product_code || activeProduct.sku || `PRD-${activeProduct.id}`;
  const qualityBadge = activeProduct.quality_variant || activeProduct.product_variant_name;

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* ================= FULL PAGE NAVIGATION & BREADCRUMB HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 transition-all font-bold text-xs flex items-center gap-1.5 shadow-2xs group cursor-pointer shrink-0"
            title="Back to Catalog (Esc)"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back</span>
          </button>

          <div className="min-w-0">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 font-semibold truncate">
              <span onClick={onBack} className="hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer">Catalog</span>
              <span>/</span>
              <span onClick={onBack} className="hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer">Models</span>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-bold truncate">{activeProduct.brand || 'Generic'}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white truncate">
                {productName(activeProduct)}
              </h2>
              {associatedSuppliers.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[10px] font-extrabold shrink-0">
                  {associatedSuppliers.length} Suppliers Unified
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => {
              const specSheet = `[PINKY SALES INVENTORY SPEC SHEET]\nProduct: ${productName(activeProduct)}\nBrand: ${activeProduct.brand || 'Generic'}\nCategory: ${partCategory}\nQuality: ${qualityBadge || 'Standard'}\nRetail Price: ${priceLabel(retailPrice)}\nWeighted Avg Cost: ${priceLabel(avgCostPrice)}\nStock: ${stockCount} Units\nSKU: ${skuCode}\nCompatible Models: ${allCompatibleModels.join(', ') || 'Universal'}`;
              copyToClipboard(specSheet, 'nav_share');
            }}
            className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer"
          >
            {copiedField === 'nav_share' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Share</span>
              </>
            )}
          </button>

          {onAddStock && (
            <button
              type="button"
              onClick={() => onAddStock(activeProduct)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              <span>+ Stock</span>
            </button>
          )}

          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(activeProduct)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Model</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= FULL PAGE MAIN CONTENT GRID (40% / 60%) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ================= LEFT COLUMN: Image Showcase & Gallery ================= */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
            {/* Main Image Showcase Card */}
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
                    className={`w-full h-full object-contain p-6 transition-transform duration-200 ease-out ${
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
                    className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-xs mb-3 border bg-white dark:bg-slate-800"
                    style={{
                      borderColor: catInfo.border,
                      color: catInfo.color,
                    }}
                  >
                    <CatIcon className="w-10 h-10" strokeWidth={2.2} />
                  </div>
                  <span
                    className="text-xs font-black uppercase tracking-widest"
                    style={{ color: catInfo.color }}
                  >
                    {catInfo.label} Component
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                    No high-resolution photo attached
                  </span>
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(activeProduct)}
                      className="mt-3 text-xs font-bold text-cyan-700 dark:text-cyan-300 hover:text-cyan-900 bg-white/90 dark:bg-slate-800 border border-cyan-200 dark:border-cyan-800 px-3.5 py-1.5 rounded-xl shadow-2xs transition-all cursor-pointer"
                    >
                      + Upload Image in Edit
                    </button>
                  )}
                </div>
              )}

              {/* Floating Quality Tag */}
              {qualityBadge && (
                <div className="absolute top-3.5 left-3.5 pointer-events-none">
                  <span className="px-2.5 py-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 text-slate-800 dark:text-slate-100 font-extrabold text-[10px] uppercase tracking-wider shadow-xs flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                    {qualityBadge}
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails Gallery Strip */}
            {imageList.length > 1 && (
              <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                {imageList.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                      activeImageIndex === idx
                        ? 'border-cyan-600 dark:border-cyan-400 shadow-md scale-105'
                        : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
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
        </div>

        {/* ================= RIGHT COLUMN: Specs, Multi-Supplier Pricing & Inventory ================= */}
        <div className="lg:col-span-7 flex flex-col gap-6">

          {/* 1. Commercial Pricing Tier Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <Tag className="w-4 h-4" /> Commercial Pricing & Valuation
              </span>
              {supplierBreakdown.length > 1 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                  Blended Multi-Supplier Pricing
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Retail / Sale Price Card */}
              <motion.div 
                whileHover={{ y: -2, boxShadow: '0 8px 20px -4px rgba(13, 148, 136, 0.15)' }}
                className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/80 dark:border-teal-800/50 flex flex-col justify-between transition-all"
              >
                <span className="text-[10px] uppercase font-extrabold tracking-wider text-teal-700 dark:text-teal-400">
                  Sale / Retail
                </span>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-teal-950 dark:text-teal-200 tracking-tight">
                    {retailPrice > 0 ? priceLabel(retailPrice) : '—'}
                  </span>
                </div>
              </motion.div>

              {/* Wholesale Price Card */}
              <motion.div 
                whileHover={{ y: -2, boxShadow: '0 8px 20px -4px rgba(99, 102, 241, 0.12)' }}
                className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-800/50 flex flex-col justify-between transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-indigo-700 dark:text-indigo-400">
                    Wholesale
                  </span>
                  {canViewWholesale && (
                    <button
                      type="button"
                      onClick={() => setShowWholesale((prev) => !prev)}
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 p-0.5 rounded cursor-pointer transition-colors"
                      title={showWholesale ? "Hide wholesale price" : "Show wholesale price"}
                    >
                      {showWholesale ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-indigo-950 dark:text-indigo-200 tracking-tight">
                    {canViewWholesale && wholesalePrice > 0 ? (showWholesale ? priceLabel(wholesalePrice) : '••••••') : '—'}
                  </span>
                </div>
              </motion.div>

              {/* Weighted Average Cost Price Card */}
              <motion.div 
                whileHover={{ y: -2, boxShadow: '0 8px 20px -4px rgba(244, 63, 94, 0.12)' }}
                className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/50 flex flex-col justify-between transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold tracking-wider text-rose-700 dark:text-rose-400">
                    Cost Price
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-200/60 text-rose-800">
                    Weighted Avg
                  </span>
                </div>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-rose-950 dark:text-rose-200 tracking-tight">
                    {canViewPurchase && avgCostPrice > 0 ? priceLabel(avgCostPrice) : '—'}
                  </span>
                  {canViewPurchase && supplierBreakdown.length > 1 && (
                    <span className="block text-[10px] text-rose-600 font-semibold mt-0.5">
                      across {supplierBreakdown.length} supplier batches
                    </span>
                  )}
                </div>
              </motion.div>

              {/* Profit Margin Card (Calculated vs Weighted Average Cost) */}
              <motion.div 
                whileHover={{ y: -2, boxShadow: '0 8px 20px -4px rgba(16, 185, 129, 0.15)' }}
                className="p-4 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white border border-slate-800 dark:border-slate-700 flex flex-col justify-between shadow-sm transition-all"
              >
                <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Profit Margin
                </span>
                <div className="mt-2">
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
                    {canViewPurchase && profitMargin !== null ? `+${profitMargin}%` : 'N/A'}
                  </span>
                  {canViewPurchase && profitAmount > 0 && (
                    <span className="block text-[11px] text-slate-300 font-medium mt-0.5">
                      +{priceLabel(profitAmount)} / unit
                    </span>
                  )}
                </div>
              </motion.div>
            </div>
          </div>

          {/* 2. Multi-Supplier & Batches Breakdown Section */}
          {canViewPurchase && supplierBreakdown.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                      Suppliers & Batches Breakdown
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">Individual supplier cost tiers and inventory volume</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                    {supplierBreakdown.length} Active {supplierBreakdown.length === 1 ? 'Source' : 'Sources'}
                  </span>
                </div>
              </div>

              {/* Multi-Supplier Batches Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-slate-700/80 text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">
                      <th className="py-2.5 px-3">Supplier Name</th>
                      <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      <th className="py-2.5 px-3 text-right">Stock Qty</th>
                      <th className="py-2.5 px-3 text-right">Stock Share</th>
                      <th className="py-2.5 px-3 text-right">Batch Value</th>
                      <th className="py-2.5 px-3 text-right">Last Restock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                    {supplierBreakdown.map((s, idx) => {
                      const sharePercent = stockCount > 0 ? Math.round((s.quantity / stockCount) * 100) : 0;
                      const batchValue = (Number(s.purchase_price) || 0) * (Number(s.quantity) || 0);

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                              <strong className="font-bold text-slate-900 dark:text-slate-100">{s.supplier_name}</strong>
                              {s.notes && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={s.notes}>
                                  ({s.notes})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                            {priceLabel(s.purchase_price)}
                          </td>
                          <td className="py-3 px-3 text-right font-extrabold text-slate-900 dark:text-white">
                            {s.quantity} pcs
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                              {sharePercent}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-600 dark:text-slate-300">
                            {priceLabel(batchValue)}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-500 text-[11px]">
                            {s.received_date ? new Date(s.received_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Weighted Average Formula Info Card */}
              {supplierBreakdown.length > 1 && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/30 dark:from-slate-800/50 dark:to-indigo-950/30 border border-slate-200/80 dark:border-slate-700/80 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <Calculator className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 leading-relaxed">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      Weighted Average Cost Calculation:
                    </span>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Avg Cost = ({supplierBreakdown.map(s => `${s.quantity} pcs × ${priceLabel(s.purchase_price)}`).join(' + ')}) ÷ {stockCount} Total Units = <strong className="text-rose-600 font-bold">{priceLabel(avgCostPrice)}</strong>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Product Specifications Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
              <Cpu className="w-4 h-4" /> Product Specifications
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200/70 dark:border-cyan-800/60 text-cyan-700 dark:text-cyan-400 shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 block">Quality Grade</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate block">
                    {qualityBadge || 'Standard Grade'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-400 shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 block">Part Category</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate block">
                    {partCategory}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 text-blue-700 dark:text-blue-400 shrink-0">
                  <Tag className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 block">Device Brand</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate block">
                    {activeProduct.brand || 'Generic'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200/70 dark:border-teal-800/60 text-teal-700 dark:text-teal-400 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 dark:text-slate-500 block">Manufacturer</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate block">
                    {activeProduct.manufacturing_brand_name || 'Generic'}
                  </span>
                </div>
              </div>
            </div>

            {/* Colors */}
            {coloursList.length > 0 && (
              <div className="mt-3 p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase">Available Colors</span>
                <div className="flex flex-wrap gap-1.5">
                  {coloursList.map((col, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold shadow-2xs"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Stock Analytics & Inventory Health Overview */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <Boxes className="w-4 h-4" /> Stock & Inventory Analytics
              </span>
              <span className={`text-xs font-bold flex items-center gap-1.5 ${stockHealthColor}`}>
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                {stockHealthLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Total Combined Stock</span>
                <span className="text-lg font-black text-slate-900 dark:text-white mt-0.5 block">{stockCount} Units</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Stock Health</span>
                <span className={`text-lg font-black mt-0.5 block ${stockHealthColor}`}>
                  {stockCount > 5 ? 'Optimal' : stockCount > 0 ? 'Low' : 'Depleted'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Est. Runout</span>
                <span className="text-lg font-black text-slate-900 dark:text-white mt-0.5 block">
                  {estimatedRunoutDays > 0 ? `~${estimatedRunoutDays} Days` : 'Immediate'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Reorder Status</span>
                <span className="text-lg font-black text-slate-900 dark:text-white mt-0.5 block">
                  {stockCount <= 4 ? 'Reorder Now' : 'Sufficient'}
                </span>
              </div>
            </div>

            {/* Visual Stock Level Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mt-1">
              <div 
                className={`h-full ${stockProgressBarColor} rounded-full transition-all duration-500`}
                style={{ width: `${Math.min(100, Math.max(10, stockCount * 4))}%` }}
              />
            </div>
          </div>

          {/* 5. Compatible Device Models Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Compatible Device Models
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                  {allCompatibleModels.length} Models
                </span>
              </div>

              {allCompatibleModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(allCompatibleModels.join(', '), 'compatible_list')}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedField === 'compatible_list' ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCheck className="w-4 h-4" /> Copied All
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Copy className="w-4 h-4" /> Copy All
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Compatibility Search Bar */}
            {allCompatibleModels.length > 5 && (
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search compatible models (e.g. C55, C65, F23)..."
                  value={compatSearch}
                  onChange={(e) => setCompatSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-slate-400 transition-all"
                />
              </div>
            )}

            {/* Model Chips Matrix */}
            {filteredCompatibleModels.length > 0 ? (
              <div className="p-4 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl">
                <div className="flex flex-wrap gap-2">
                  {(isCompatExpanded ? filteredCompatibleModels : filteredCompatibleModels.slice(0, 18)).map((modelName, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => copyToClipboard(modelName, `m_${idx}`)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/90 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold shadow-2xs cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                      title="Click to copy model name"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{modelName}</span>
                      {copiedField === `m_${idx}` && (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ml-0.5" />
                      )}
                    </button>
                  ))}
                </div>

                {filteredCompatibleModels.length > 18 && (
                  <button
                    type="button"
                    onClick={() => setIsCompatExpanded(!isCompatExpanded)}
                    className="mt-3 text-xs font-bold text-cyan-700 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {isCompatExpanded ? (
                      <>
                        <ChevronDown className="w-4 h-4 rotate-180" /> Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" /> +{filteredCompatibleModels.length - 18} more models
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="p-6 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-xs text-slate-400 font-medium">
                {compatSearch
                  ? `No models matching "${compatSearch}"`
                  : 'Universal compatibility'}
              </div>
            )}
          </div>

          {/* 6. Description & Catalog Notes */}
          {activeProduct.description && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Catalog Notes & Description
              </span>
              <div className="p-4 bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl text-slate-700 dark:text-slate-300 text-xs font-medium leading-relaxed whitespace-pre-wrap">
                {activeProduct.description}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ================= FULL-SCREEN ZOOM LIGHTBOX ================= */}
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
