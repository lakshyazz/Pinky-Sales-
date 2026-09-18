import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, X, Check, Loader2, AlertCircle, Plus, Tag } from 'lucide-react';

export default function QuickAddProductModal({
  isOpen,
  onClose,
  onProductCreated,
  api,
  categories = [],
  brands = [],
  setGlobalToast,
}) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [colorInput, setColorInput] = useState('');
  const [colours, setColours] = useState(['Black']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleAddColor = (e) => {
    e?.preventDefault();
    const c = colorInput.trim();
    if (c && !colours.map(x => x.toLowerCase()).includes(c.toLowerCase())) {
      setColours([...colours, c]);
      setColorInput('');
    }
  };

  const handleRemoveColor = (cToRemove) => {
    setColours(colours.filter((c) => c !== cToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter product name or model.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        short_name: name.trim(),
        brand: brand.trim() || 'Generic',
        category: category.trim() || 'Other',
        model: name.trim(),
        full_model_list: name.trim(),
        purchase_price: purchasePrice ? parseFloat(purchasePrice) : 0,
        sale_price: salePrice ? parseFloat(salePrice) : (purchasePrice ? parseFloat(purchasePrice) * 1.2 : 0),
        wholesale_price: wholesalePrice ? parseFloat(wholesalePrice) : (purchasePrice ? parseFloat(purchasePrice) * 1.1 : 0),
        colours: JSON.stringify(colours),
      };

      const res = await api('/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const newProduct = res.product || res;
      setGlobalToast?.({
        type: 'success',
        message: `Product "${newProduct.short_name || newProduct.name}" created!`,
      });

      onProductCreated && onProductCreated(newProduct);
      onClose();
    } catch (err) {
      console.error('Failed to create product:', err);
      setError(err.message || 'Failed to create product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.14 }}
          className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 flex items-center justify-center">
                <Package size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Quick Create Product</h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">Add master model, variants, and costs on the fly</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-2 font-medium text-xs">
                <AlertCircle size={14} className="shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                Product / Model Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. RLM C55, VIV Y20, IP13 OLED"
                autoFocus
                required
                className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                  Brand (Type or Select)
                </label>
                <input
                  type="text"
                  list="brand-suggestions"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Realme, Vivo, Apple"
                  className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden"
                />
                <datalist id="brand-suggestions">
                  {brands.map((b) => (
                    <option key={b.id || b.name} value={b.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                  Category (Type or Select)
                </label>
                <input
                  type="text"
                  list="category-suggestions"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Folder / LCD, Battery"
                  className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 dark:focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-hidden"
                />
                <datalist id="category-suggestions">
                  {categories.map((c) => (
                    <option key={c.id || c.name} value={c.name} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Colors / Variants */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 mb-1 uppercase tracking-wider">
                Color Variants
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddColor();
                    }
                  }}
                  placeholder="Type a color (e.g. Black, Blue, Gold) and press Enter"
                  className="flex-1 px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddColor}
                  className="px-3 py-1.5 rounded-xl font-medium text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus size={12} /> Add
                </button>
              </div>

              {/* Tag Badges */}
              <div className="flex flex-wrap gap-1.5 min-h-[28px] p-2 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl">
                {colours.length === 0 ? (
                  <span className="text-[11px] text-zinc-400 italic">No color variants specified (Universal)</span>
                ) : (
                  colours.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 shadow-2xs"
                    >
                      <Tag size={10} className="text-violet-500" />
                      {c}
                      <button
                        type="button"
                        onClick={() => handleRemoveColor(c)}
                        className="text-zinc-400 hover:text-rose-500 p-0.5 cursor-pointer ml-0.5"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Pricing Grid */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-zinc-50/70 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl">
              <div>
                <label className="block font-semibold text-zinc-600 dark:text-zinc-400 text-[10.5px] uppercase tracking-wider mb-1">
                  Purchase Cost (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden text-right text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-600 dark:text-zinc-400 text-[10.5px] uppercase tracking-wider mb-1">
                  Selling Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden text-right text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-600 dark:text-zinc-400 text-[10.5px] uppercase tracking-wider mb-1">
                  Wholesale (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg font-mono text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 focus:border-violet-500 outline-hidden text-right text-xs"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 flex items-center justify-end gap-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 rounded-xl transition-all shadow-md shadow-violet-600/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>Create &amp; Add Line</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

