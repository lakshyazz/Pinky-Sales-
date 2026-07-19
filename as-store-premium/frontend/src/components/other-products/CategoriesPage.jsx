import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Folder, AlertCircle, Search, ArrowRight, Layers, Package, Tag } from 'lucide-react';

function Input({ label, value, onChange, type = 'text', className = '', ...inputProps }) {
  const hasValue = value !== null && value !== undefined && String(value).length > 0;
  return (
    <label className={`field-label ${hasValue ? 'has-value' : ''} ${className}`}>
      <span className="field-label-text">{label}</span>
      <input {...inputProps} placeholder={inputProps.placeholder || ' '} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const capitalizeWord = (str) => {
  if (!str) return 'Uncategorized';
  const clean = String(str).trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export function CategoriesPage({ session, setGlobalToast, api, data = {}, onCategoryChange, currency = (v) => `₹${v}`, productName = (p) => p.name || p.short_name || p.product_name || 'Product' }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '' });
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null); // Category name for Product Explorer
  const [categorySearch, setCategorySearch] = useState('');

  const loadData = async () => {
    try {
      const res = await api('/reference-data', {}, session.token);
      if (res?.categories) {
        setCategories(res.categories);
      }
    } catch (e) {
      console.error('Failed to load categories', e);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

  const refCategories = categories.length > 0 ? categories : (data.reference?.categories || []);

  // Combine products from products, catalog, and stock
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

  // Group products by category
  const categoryStatsMap = React.useMemo(() => {
    const map = new Map();
    refCategories.forEach((c) => {
      const formattedName = capitalizeWord(c.name);
      map.set(c.name.toLowerCase(), { category: c, name: formattedName, rawName: c.name, products: [], totalStock: 0 });
    });

    allProducts.forEach((p) => {
      const pCat = String(p.category || 'General').trim();
      const catKey = pCat.toLowerCase();

      if (!map.has(catKey)) {
        const formattedName = capitalizeWord(pCat);
        map.set(catKey, { category: { id: `temp-${catKey}`, name: pCat }, name: formattedName, rawName: pCat, products: [], totalStock: 0 });
      }

      const item = map.get(catKey);
      const pId = p.id || p.product_id;
      if (!item.products.some((existing) => (existing.id || existing.product_id) === pId)) {
        item.products.push(p);
        item.totalStock += Number(p.total_stock || p.available_quantity || p.quantity || 0);
      }
    });

    return map;
  }, [refCategories, allProducts]);

  const categoryList = React.useMemo(() => {
    return Array.from(categoryStatsMap.values()).filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [categoryStatsMap, searchQuery]);

  const resetForm = () => {
    setFormData({ name: '' });
    setShowAdd(false);
    setEditingId(null);
  };

  const handleEdit = (cat) => {
    setFormData({ name: cat.name });
    setEditingId(cat.id);
    setShowAdd(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = formData.name.trim();
    if (!cleanName) {
      setGlobalToast('Category name is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const url = editingId ? `/reference-data/categories/${editingId}` : '/reference-data/categories';
      const method = editingId ? 'PUT' : 'POST';
      await api(url, {
        method,
        body: JSON.stringify({ name: cleanName })
      }, session.token);

      setGlobalToast('Category saved successfully', 'success');
      resetForm();
      await loadData();
      if (onCategoryChange) await onCategoryChange();
    } catch (err) {
      setGlobalToast(err.message || 'Unable to save category', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete category "${name}"?`)) return;
    try {
      await api(`/reference-data/categories/${id}`, { method: 'DELETE' }, session.token);
      setGlobalToast('Category deleted successfully', 'success');
      await loadData();
      if (onCategoryChange) await onCategoryChange();
    } catch (err) {
      setGlobalToast(err.message || 'Unable to delete category', 'error');
    }
  };

  // Products belonging to selected category in Explorer
  const selectedCategoryData = selectedCategory ? categoryStatsMap.get(selectedCategory.toLowerCase()) : null;
  const filteredExplorerProducts = (selectedCategoryData?.products || []).filter((p) =>
    (p.name || p.short_name || p.product_name || '').toLowerCase().includes(categorySearch.toLowerCase()) ||
    (p.model || '').toLowerCase().includes(categorySearch.toLowerCase()) ||
    (p.brand || '').toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 border border-slate-200/80 rounded-3xl p-6 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-teal-600">Inventory Classification</span>
          <h2 className="text-2xl font-black text-slate-900 mt-1">Product Categories</h2>
          <p className="text-xs text-slate-500 font-medium">Browse products grouped by catalog category.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAdd(true); }}
          className="px-5 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-teal-600/20 transition-all active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', maxWidth: '380px' }}>
        <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#94a3b8', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search category name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', paddingLeft: '38px', paddingRight: '16px', paddingTop: '10px', paddingBottom: '10px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', fontSize: '13px', fontWeight: '600', color: '#0f172a', outline: 'none' }}
        />
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {categoryList.map((item) => (
          <motion.div
            key={item.name}
            whileHover={{ y: -4, scale: 1.015 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="p-5 rounded-3xl bg-white/95 border border-slate-200/90 shadow-xl shadow-slate-200/40 backdrop-blur-xl flex flex-col justify-between cursor-pointer group hover:border-teal-300 transition-all"
            onClick={() => setSelectedCategory(item.rawName)}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-all">
                  <Folder className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {item.category?.id && !String(item.category.id).startsWith('temp-') && (
                    <>
                      <button
                        onClick={() => handleEdit(item.category)}
                        className="p-2 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-xl transition-all"
                        title="Edit Category"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.category.id, item.name)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Delete Category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-black text-slate-900 group-hover:text-teal-700 transition-all">{item.name}</h3>

              <div className="mt-4 space-y-1.5 text-xs font-medium text-slate-500">
                <div className="flex justify-between items-center">
                  <span>Total Products:</span>
                  <span className="font-extrabold text-slate-800">{item.products.length} models</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Stock Quantity:</span>
                  <span className="font-extrabold text-emerald-600">{item.totalStock} units</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-teal-600 group-hover:text-teal-700">
              <span>View All Products</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-all" />
            </div>
          </motion.div>
        ))}

        {categoryList.length === 0 && (
          <div className="col-span-full p-12 text-center bg-white/80 border border-slate-200/80 rounded-3xl">
            <Folder className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">No categories found</p>
            <p className="text-xs text-slate-400 mt-1">Try searching for another category or add a new category.</p>
          </div>
        )}
      </div>

      {/* Category Product Explorer Modal */}
      <AnimatePresence>
        {selectedCategoryData && (
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
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{selectedCategoryData.name} Products</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Showing {selectedCategoryData.products.length} products in category "{selectedCategoryData.name}"
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCategory(null)}
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
                    placeholder={`Search ${selectedCategoryData.name} products...`}
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    style={{ width: '100%', paddingLeft: '38px', paddingRight: '14px', paddingTop: '8px', paddingBottom: '8px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: '#0f172a', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Modal Table Content */}
              <div className="p-4 overflow-y-auto flex-1">
                {filteredExplorerProducts.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider">
                          <th className="p-3">Product Name</th>
                          <th className="p-3">Model</th>
                          <th className="p-3">Brand</th>
                          <th className="p-3">Retail Price</th>
                          <th className="p-3">Available Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredExplorerProducts.map((p) => (
                          <tr key={p.id || p.product_id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-bold text-slate-900">{productName(p)}</td>
                            <td className="p-3 font-semibold text-slate-600">{p.model || '—'}</td>
                            <td className="p-3">
                              <span className="px-2 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/60 font-semibold">
                                {p.brand || 'Generic'}
                              </span>
                            </td>
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
                    No products found in category "{selectedCategoryData.name}".
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Category Modal */}
      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl p-6"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <h3 className="text-lg font-black text-slate-900">{editingId ? 'Edit Category' : 'Add New Category'}</h3>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Category Name"
                  required
                  placeholder="Example: Display, Battery, Charging Port, Tool"
                  value={formData.name}
                  onChange={(v) => setFormData({ name: v })}
                  autoFocus
                />

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-lg shadow-teal-600/20 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : editingId ? 'Update Category' : 'Add Category'}
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

export default CategoriesPage;
