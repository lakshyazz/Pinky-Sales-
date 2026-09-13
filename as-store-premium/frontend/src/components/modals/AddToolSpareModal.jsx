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
  UploadCloud, 
  Loader2, 
  Check, 
  Plus, 
  Minus,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import ProductImageUpload from '../ui/ProductImageUpload';
import SearchableCombobox from '../ui/SearchableCombobox';

const POPULAR_TOOL_BRANDS = [
  'RELIFE', 'MECHANIC', 'QUICK', 'SUNSHINE', 'KAISI', 'ATTEN', 'JAKEMY', 'MAANT', 'RF4', 'Generic'
];

const POPULAR_SPARE_BRANDS = [
  'Apple', 'Samsung', 'Vivo', 'Oppo', 'Realme', 'Xiaomi', 'OnePlus', 'Motorola', 'Generic'
];

export default function AddToolSpareModal({
  isOpen,
  onClose,
  initialCategory = 'tools',
  suppliers = [],
  brands = [],
  shopId = null,
  onSuccess,
  showToast,
  authedFetch,
}) {
  const [category, setCategory] = useState(initialCategory === 'spares' ? 'spares' : 'tools');
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUrls, setImageUrls] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nameInputRef = useRef(null);

  // Sync initialCategory when modal opens
  useEffect(() => {
    if (isOpen) {
      setCategory(initialCategory === 'spares' ? 'spares' : 'tools');
      setProductName('');
      setBrand('');
      setSupplierId('');
      setQuantity('1');
      setPurchasePrice('');
      setWholesalePrice('');
      setRetailPrice('');
      setImageUrl('');
      setImageUrls([]);
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

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

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
      const profit = wholesale - cost;
      const pct = Math.round((profit / cost) * 100);
      wholesaleMargin = { profit, pct };
    }

    let retailMargin = null;
    if (cost > 0 && retail > 0) {
      const profit = retail - cost;
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

    const targetCategory = category === 'tools' ? 'Tools' : 'Spares';

    const payload = {
      name: cleanName,
      short_name: cleanName,
      full_model_list: cleanName,
      model: cleanName,
      brand: cleanBrand,
      category: targetCategory,
      part_category: targetCategory,
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
            ? `Added ${cleanName} to ${targetCategory} with ${numQty} pcs stock!`
            : `Added ${cleanName} to ${targetCategory} catalog!`
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

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => !submitting && onClose()}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
                category === 'tools' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : 'bg-indigo-100 text-indigo-700'
              }`}>
                {category === 'tools' ? <Wrench className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  Add New {category === 'tools' ? 'Tool' : 'Spare'}
                </h2>
                <p className="text-xs text-slate-500">
                  Quick stock entry with simplified pricing & brand options
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Type Toggle Tabs */}
          <div className="px-6 pt-4 pb-2 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl">
              <button
                type="button"
                onClick={() => setCategory('tools')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  category === 'tools'
                    ? 'bg-white text-emerald-700 shadow-xs ring-1 ring-emerald-500/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Tools & Equipment</span>
              </button>
              <button
                type="button"
                onClick={() => setCategory('spares')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  category === 'spares'
                    ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-500/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Spares & Components</span>
              </button>
            </div>

            <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">
              Category: <span className="text-slate-700 font-bold uppercase">{category}</span>
            </span>
          </div>

          {/* Form Body (Scrollable) */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700 font-medium"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            {/* 1. Product Name */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Product Name <span className="text-rose-500">*</span>
              </label>
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
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
              />
            </div>

            {/* 2. Brand & Supplier (Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Brand */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    Brand
                  </label>
                  <span className="text-[10px] text-slate-400">Select or type brand</span>
                </div>
                <SearchableCombobox
                  value={brand}
                  onChange={(val) => setBrand(val)}
                  options={brandOptions}
                  placeholder="e.g. RELIFE, MECHANIC, Generic"
                  searchPlaceholder="Search or select brand..."
                  onAddNew={(newBrand) => setBrand(newBrand)}
                  addNewLabel="+ Use Brand"
                  allowClear
                />
                {/* Popular Brand Pills */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-400 mr-0.5">Quick:</span>
                  {(category === 'tools' ? POPULAR_TOOL_BRANDS : POPULAR_SPARE_BRANDS).slice(0, 6).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBrand(b)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-all ${
                        brand.toLowerCase() === b.toLowerCase()
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Supplier
                </label>
                <SearchableCombobox
                  value={supplierId}
                  onChange={(val) => setSupplierId(val)}
                  options={supplierOptions}
                  placeholder="Choose vendor or supplier..."
                  searchPlaceholder="Search supplier..."
                  allowClear
                />
              </div>
            </div>

            {/* 3. Initial Stock Quantity */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-2xs">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800">Initial Stock Quantity</div>
                  <div className="text-[11px] text-slate-500">Number of units received into inventory</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => String(Math.max(0, (parseInt(q, 10) || 0) - 1)))}
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-16 text-center font-bold text-slate-900 text-sm focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => String((parseInt(q, 10) || 0) + 1))}
                  className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 4. Pricing (Cost, Wholesale, Retail) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pricing Structure (₹)</span>
                </label>
                {(margins.wholesaleMargin || margins.retailMargin) && (
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    {margins.wholesaleMargin && (
                      <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                        WS: +₹{margins.wholesaleMargin.profit} ({margins.wholesaleMargin.pct}%)
                      </span>
                    )}
                    {margins.retailMargin && (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        Retail: +₹{margins.retailMargin.profit} ({margins.retailMargin.pct}%)
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3.5 border border-slate-200 rounded-xl shadow-2xs">
                {/* Purchase Price (Cost) */}
                <div>
                  <div className="text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                    <span>Purchase Price</span>
                    <span className="text-[10px] text-slate-400">Cost</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Wholesale Price */}
                <div>
                  <div className="text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                    <span>Wholesale Price</span>
                    <span className="text-[10px] text-indigo-600 font-semibold">Technician</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Retail Price */}
                <div>
                  <div className="text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                    <span>Retail Price</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">Sale</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={retailPrice}
                      onChange={(e) => setRetailPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Product Image Upload */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Product Image <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
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
            </div>
          </form>

          {/* Footer Action Bar */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 disabled:opacity-60 cursor-pointer ${
                category === 'tools'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving {category === 'tools' ? 'Tool' : 'Spare'}...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>
                    Add {category === 'tools' ? 'Tool' : 'Spare'}
                    {Number(quantity) > 0 ? ` (+${quantity} Stock)` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
