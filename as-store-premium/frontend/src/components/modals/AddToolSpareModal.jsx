import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Wrench, 
  Cpu, 
  Tag, 
  Truck, 
  Boxes, 
  IndianRupee, 
  Loader2, 
  Check, 
  Plus, 
  Minus,
  Sparkles,
  AlertCircle,
  Layers,
  TrendingUp,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import ProductImageUpload from '../ui/ProductImageUpload';
import SearchableCombobox from '../ui/SearchableCombobox';

// Popular Brands
const POPULAR_TOOL_BRANDS = [
  'RELIFE', 'MECHANIC', 'QUICK', 'SUNSHINE', 'KAISI', 'ATTEN', 'JAKEMY', 'MAANT', 'RF4', 'Generic'
];

const POPULAR_SPARE_BRANDS = [
  'Apple', 'Samsung', 'Vivo', 'Oppo', 'Realme', 'Xiaomi', 'OnePlus', 'Motorola', 'Generic'
];

// Popular Sub-Categories for Spares & Tools
const POPULAR_SPARE_CATEGORIES = [
  'Charging Flex',
  'Battery',
  'Display / Folder',
  'Ear Speaker',
  'Ringer / Buzzer',
  'Back Glass',
  'Housing & Frame',
  'Main Camera',
  'Front Camera',
  'Sim Tray',
  'OCA Glass',
  'Fingerprint Sensor',
  'Volume / Power Flex',
  'Sub Board / CC Board',
  'IC / Chip'
];

const POPULAR_TOOL_CATEGORIES = [
  'Soldering Station',
  'SMD Rework Gun',
  'Microscope & Lens',
  'Digital Multimeter',
  'DC Power Supply',
  'Screwdriver Set',
  'Opening & Pry Tools',
  'Chemicals, Flux & Glue',
  'Stencils & Reballing',
  'Thermal Camera',
  'Separator Machine',
  'Battery Activator',
  'Tweezers & Cutters'
];

export default function AddToolSpareModal({
  isOpen,
  onClose,
  initialCategory = 'tools',
  suppliers = [],
  brands = [],
  categories = [],
  partCategories = [],
  shopId = null,
  onSuccess,
  showToast,
  authedFetch,
}) {
  const [category, setCategory] = useState(initialCategory === 'spares' ? 'spares' : 'tools');
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUrls, setImageUrls] = useState([]);
  const [showImageSection, setShowImageSection] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nameInputRef = useRef(null);

  // Sync initialCategory when modal opens
  useEffect(() => {
    if (isOpen) {
      setCategory(initialCategory === 'spares' ? 'spares' : 'tools');
      setProductName('');
      setProductCategory('');
      setBrand('');
      setSupplierId('');
      setQuantity('1');
      setPurchasePrice('');
      setWholesalePrice('');
      setRetailPrice('');
      setImageUrl('');
      setImageUrls([]);
      setShowImageSection(false);
      setError('');
      setSubmitting(false);

      const timer = setTimeout(() => {
        if (nameInputRef.current) {
          nameInputRef.current.focus({ preventScroll: true });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialCategory]);

  // Lock scroll
  useEffect(() => {
    if (isOpen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isOpen]);

  // Handle escape & ctrl+enter keys
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !submitting) {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && isOpen && !submitting) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose, productName, productCategory, brand, quantity, purchasePrice, wholesalePrice, retailPrice, supplierId]);

  // Category Options for Combobox
  const categoryOptions = useMemo(() => {
    const popular = category === 'tools' ? POPULAR_TOOL_CATEGORIES : POPULAR_SPARE_CATEGORIES;
    const fromPartCats = (partCategories || []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
    const fromCats = (categories || []).map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
    const combined = Array.from(new Set([...popular, ...fromPartCats, ...fromCats]));
    return combined.map((name) => ({ id: name, name, label: name }));
  }, [categories, partCategories, category]);

  // Combined Brand Options for Combobox
  const brandOptions = useMemo(() => {
    const existing = (brands || []).map((b) => (typeof b === 'string' ? b : b.name)).filter(Boolean);
    const popular = category === 'tools' ? POPULAR_TOOL_BRANDS : POPULAR_SPARE_BRANDS;
    const combined = Array.from(new Set([...popular, ...existing]));
    return combined.map((name) => ({ id: name, name, label: name }));
  }, [brands, category]);

  // Supplier Options for Combobox
  const supplierOptions = useMemo(() => {
    return (suppliers || [])
      .filter((s) => s.is_active !== false)
      .map((s) => ({ id: String(s.id), name: s.name, label: s.name }));
  }, [suppliers]);

  // Live profit calculation
  const margins = useMemo(() => {
    const cost = Number(purchasePrice) || 0;
    const wholesale = Number(wholesalePrice) || 0;
    const retail = Number(retailPrice) || 0;

    let wholesaleMargin = null;
    if (cost > 0 && wholesale > 0) {
      const profit = Math.round((wholesale - cost) * 100) / 100;
      const pct = Math.round((profit / cost) * 100);
      wholesaleMargin = { profit, pct };
    }

    let retailMargin = null;
    if (cost > 0 && retail > 0) {
      const profit = Math.round((retail - cost) * 100) / 100;
      const pct = Math.round((profit / cost) * 100);
      retailMargin = { profit, pct };
    }

    return { wholesaleMargin, retailMargin };
  }, [purchasePrice, wholesalePrice, retailPrice]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (submitting) return;

    const cleanName = productName.trim();
    if (!cleanName) {
      setError('Please enter the Product Name');
      if (nameInputRef.current) nameInputRef.current.focus();
      return;
    }

    const cleanBrand = brand.trim() || 'Generic';
    const targetCategory = category === 'tools' ? 'Tools' : 'Spares';
    const cleanProductCategory = (productCategory || '').trim() || targetCategory;

    const numQty = Math.max(0, parseInt(quantity, 10) || 0);
    const numPurchase = purchasePrice !== '' ? Number(purchasePrice) : null;
    const numWholesale = wholesalePrice !== '' ? Number(wholesalePrice) : null;
    const numRetail = retailPrice !== '' ? Number(retailPrice) : null;

    if (numPurchase !== null && (isNaN(numPurchase) || numPurchase < 0)) {
      setError('Purchase price must be a valid positive number');
      return;
    }
    if (numWholesale !== null && (isNaN(numWholesale) || numWholesale < 0)) {
      setError('Wholesale price must be a valid positive number');
      return;
    }
    if (numRetail !== null && (isNaN(numRetail) || numRetail < 0)) {
      setError('Retail price must be a valid positive number');
      return;
    }

    const payload = {
      name: cleanName,
      short_name: cleanName,
      full_model_list: cleanName,
      model: cleanName,
      brand: cleanBrand,
      category: targetCategory,
      part_category: cleanProductCategory,
      supplier_id: supplierId ? Number(supplierId) : null,
      opening_stock: numQty,
      purchase_price: numPurchase,
      wholesale_price: numWholesale,
      sale_price: numRetail,
      retail_price: numRetail,
      official_price: numRetail,
      image_url: imageUrl || null,
      image_urls: imageUrls.length ? imageUrls : (imageUrl ? [imageUrl] : []),
      shop_id: shopId || null,
    };

    try {
      setSubmitting(true);
      setError('');

      const res = await authedFetch('/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const createdProduct = res?.data || res || {};
      const newId = createdProduct.id || res?.id;

      if (showToast) {
        showToast(
          numQty > 0
            ? `Added "${cleanName}" (${cleanProductCategory}) with ${numQty} pcs stock!`
            : `Added "${cleanName}" (${cleanProductCategory}) to catalog!`
        );
      }

      if (onSuccess) {
        onSuccess({
          ...payload,
          ...createdProduct,
          id: newId,
        }, numQty);
      }

      onClose();
    } catch (err) {
      console.error('[AddToolSpareModal error]', err);
      setError(err.message || 'Failed to save product. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentPopularCategories = category === 'tools' ? POPULAR_TOOL_CATEGORIES : POPULAR_SPARE_CATEGORIES;
  const currentPopularBrands = category === 'tools' ? POPULAR_TOOL_BRANDS : POPULAR_SPARE_BRANDS;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => !submitting && onClose()}
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden z-10 my-auto"
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-slate-50">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs transition-colors ${
                category === 'tools' 
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/20' 
                  : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-indigo-500/20'
              }`}>
                {category === 'tools' ? <Wrench className="w-4.5 h-4.5" /> : <Cpu className="w-4.5 h-4.5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-black text-slate-900 leading-tight">
                    Add {category === 'tools' ? 'Tool & Equipment' : 'Spare Component'}
                  </h2>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border tracking-wider ${
                    category === 'tools'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  }`}>
                    {category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Fast inventory cataloging with instant category & margin tracking
                </p>
              </div>
            </div>

            {/* Type Switcher in Header */}
            <div className="flex items-center gap-2">
              <div className="flex items-center p-0.5 bg-slate-100/90 rounded-xl border border-slate-200/70">
                <button
                  type="button"
                  onClick={() => {
                    setCategory('tools');
                    setProductCategory('');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    category === 'tools'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Wrench className={`w-3.5 h-3.5 ${category === 'tools' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline">Tools</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCategory('spares');
                    setProductCategory('');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    category === 'spares'
                      ? 'bg-white text-indigo-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Cpu className={`w-3.5 h-3.5 ${category === 'spares' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline">Spares</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ml-1"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700 font-semibold"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* 1. Product Name */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="inline-flex items-center text-xs font-bold text-slate-800 whitespace-nowrap">
                  <span>Product Name</span>
                  <span className="text-rose-500 font-black ml-1 text-sm leading-none">*</span>
                </label>
                <span className="text-[10.5px] text-slate-400 font-medium">
                  {category === 'tools' ? 'Tool name & model specs' : 'Device model & spare component'}
                </span>
              </div>
              <div className="relative">
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder={
                    category === 'tools'
                      ? 'e.g. Relife RL-004M Anti-Static Pad, Mechanic 0.02mm Wire, Quick 861DW Gun'
                      : 'e.g. iPhone 13 Pro Charging Flex, Samsung A52 Ear Speaker, Redmi Note 10 Sim Tray'
                  }
                  className="w-full px-3.5 py-2 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
                />
                {productName && (
                  <button
                    type="button"
                    onClick={() => setProductName('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 2. Product Category (NEW) & Brand / Make */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Product Category */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Product Category</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Type or select</span>
                </div>
                <SearchableCombobox
                  value={productCategory}
                  onChange={(val) => setProductCategory(val)}
                  options={categoryOptions}
                  placeholder={category === 'tools' ? 'e.g. Soldering, Microscope...' : 'e.g. Charging Flex, Battery...'}
                  searchPlaceholder="Search category..."
                  onAddNew={(newCat) => setProductCategory(newCat)}
                  addNewLabel="+ Use Category"
                  allowClear
                />
                {/* Horizontal chips with no scrollbar */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[9.5px] font-bold text-slate-400 shrink-0">Quick:</span>
                  {currentPopularCategories.slice(0, 6).map((catName) => {
                    const isSelected = productCategory.toLowerCase() === catName.toLowerCase();
                    return (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => setProductCategory(isSelected ? '' : catName)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 transition-all cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-1 ring-indigo-300'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {catName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brand */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Brand / Make</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Type or select</span>
                </div>
                <SearchableCombobox
                  value={brand}
                  onChange={(val) => setBrand(val)}
                  options={brandOptions}
                  placeholder="e.g. RELIFE, Apple, Samsung..."
                  searchPlaceholder="Search brand..."
                  onAddNew={(newBrand) => setBrand(newBrand)}
                  addNewLabel="+ Use Brand"
                  allowClear
                />
                {/* Horizontal chips with no scrollbar */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[9.5px] font-bold text-slate-400 shrink-0">Quick:</span>
                  {currentPopularBrands.slice(0, 6).map((b) => {
                    const isSelected = brand.toLowerCase() === b.toLowerCase();
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBrand(isSelected ? '' : b)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 transition-all cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-1 ring-emerald-300'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. Supplier & Initial Stock Quantity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Supplier */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                    <Truck className="w-3.5 h-3.5 text-slate-500" />
                    <span>Supplier / Vendor</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Optional</span>
                </div>
                <SearchableCombobox
                  value={supplierId}
                  onChange={(val) => setSupplierId(val)}
                  options={supplierOptions}
                  placeholder="Choose vendor or supplier..."
                  searchPlaceholder="Search supplier..."
                  allowClear
                />
              </div>

              {/* Initial Stock Stepper with Presets */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                    <Boxes className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Initial Stock Quantity</span>
                  </label>
                  <div className="flex items-center gap-1">
                    {[0, 5, 10, 25].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuantity(String(preset))}
                        className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                          quantity === String(preset)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset === 0 ? '0' : `+${preset}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center bg-slate-50 border border-slate-300 rounded-xl p-0.5 shadow-2xs h-[38px]">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => String(Math.max(0, (parseInt(q, 10) || 0) - 1)))}
                    className="h-full px-3 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-white transition-colors cursor-pointer flex items-center justify-center"
                    title="Decrease by 1"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1 flex items-center justify-center gap-1">
                    <input
                      type="number"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-14 text-center font-black text-slate-900 text-sm bg-transparent focus:outline-none"
                    />
                    <span className="text-[11px] font-semibold text-slate-400">pcs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => String((parseInt(q, 10) || 0) + 1))}
                    className="h-full px-3 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-white transition-colors cursor-pointer flex items-center justify-center"
                    title="Increase by 1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 4. Pricing Structure (Cost, Wholesale, Retail) */}
            <div className="bg-slate-50/80 border border-slate-200/90 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                  <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pricing Structure (₹)</span>
                </span>
                {(margins.wholesaleMargin || margins.retailMargin) && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    {margins.wholesaleMargin && (
                      <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-indigo-600" />
                        <span>WS: +₹{margins.wholesaleMargin.profit} ({margins.wholesaleMargin.pct}%)</span>
                      </span>
                    )}
                    {margins.retailMargin && (
                      <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-emerald-600" />
                        <span>Retail: +₹{margins.retailMargin.profit} ({margins.retailMargin.pct}%)</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Purchase Price (Cost) */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Purchase Cost</span>
                    <span className="text-[9.5px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">Buy</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-6 pr-2 py-1 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:border-slate-500 transition-all"
                    />
                  </div>
                </div>

                {/* Wholesale Price */}
                <div className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
                  <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Wholesale Price</span>
                    <span className="text-[9.5px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">Technician</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-400 text-xs font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-6 pr-2 py-1 bg-indigo-50/30 hover:bg-white focus:bg-white border border-indigo-200 rounded-lg text-sm font-bold text-indigo-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>

                {/* Retail Price */}
                <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                  <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Retail Price</span>
                    <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">Customer</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={retailPrice}
                      onChange={(e) => setRetailPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-6 pr-2 py-1 bg-emerald-50/30 hover:bg-white focus:bg-white border border-emerald-200 rounded-lg text-sm font-bold text-emerald-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Product Image (Collapsible to save vertical space) */}
            <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowImageSection((prev) => !prev)}
                className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Product Image</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {imageUrl ? '(1 image attached)' : '(Optional)'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-slate-400 text-xs">
                  <span>{showImageSection ? 'Hide' : 'Add Image'}</span>
                  {showImageSection ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </button>

              {showImageSection && (
                <div className="p-3 bg-white border-t border-slate-100">
                  <ProductImageUpload
                    imageUrl={imageUrl}
                    imageUrls={imageUrls}
                    onImageChange={({ imageUrl: newPrimary, imageUrls: newAll }) => {
                      setImageUrl(newPrimary || '');
                      setImageUrls(newAll || []);
                    }}
                    category={category === 'tools' ? 'Tools' : 'Spares'}
                    showMultiple={false}
                  />
                </div>
              )}
            </div>
          </form>

          {/* Footer Action Bar */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
              <span className="font-medium text-slate-400">Target:</span>
              <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                {productCategory || (category === 'tools' ? 'Tools' : 'Spares')}
              </span>
              {brand && (
                <span className="font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                  {brand}
                </span>
              )}
              {Number(quantity) > 0 ? (
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  +{quantity} Stock
                </span>
              ) : (
                <span className="font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                  Catalog only
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold text-white transition-all shadow-md active:scale-95 disabled:opacity-60 cursor-pointer ${
                  category === 'tools'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-emerald-600/20'
                    : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-indigo-600/20'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>
                      Add {category === 'tools' ? 'Tool' : 'Spare'}
                      {Number(quantity) > 0 ? ` (+${quantity})` : ''}
                    </span>
                    <span className="opacity-70 text-[10px] hidden md:inline-flex items-center pl-1 border-l border-white/25">
                      Ctrl+↵
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
