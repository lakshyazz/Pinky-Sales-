import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, X, Tags, Search, ArrowRight, Smartphone, Boxes, PackageSearch } from 'lucide-react';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

const capitalizeBrand = (str) => {
  if (!str) return 'Generic';
  const clean = String(str).trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export default function BrandsPage({
  session,
  setGlobalToast,
  api,
  data = {},
  onBrandChange,
  currency = formatCurrency,
  productName = (p) => p?.name || p?.short_name || p?.product_name || 'Product',
  brands: propBrands,
  selectedBrand: propSelectedBrand,
  products: propProducts,
  search: propSearch = '',
  loading = false,
  productLoading = false,
  onSearchChange,
  onSelectBrand,
  onClearBrand,
  onOpenStockBrand,
  onViewDetails,
  fullModelList = (p) => p?.full_model_list || p?.model || '',
  priceLabel = (val) => formatCurrency(val),
  Empty = ({ title }) => (
    <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: '600' }}>
      {title || 'No records found'}
    </div>
  )
}) {
  const [internalSearch, setInternalSearch] = useState('');
  const [selectedBrandState, setSelectedBrandState] = useState(null);
  const [modalSearch, setModalSearch] = useState('');

  const searchVal = propSearch !== undefined && onSearchChange ? propSearch : internalSearch;
  const activeBrandName = propSelectedBrand || selectedBrandState;

  // Combine products from data.products, data.catalog, data.stock
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

  // Aggregate brand statistics
  const brandStatsMap = React.useMemo(() => {
    const map = new Map();

    // Add reference brands
    const refBrands = data.reference?.brands || [];
    refBrands.forEach((b) => {
      const bName = typeof b === 'string' ? b : b.name || b.brand;
      if (bName) {
        const key = String(bName).trim().toLowerCase();
        map.set(key, { rawName: bName, name: capitalizeBrand(bName), products: [], totalStock: 0, stockValue: 0 });
      }
    });

    // Add brands from products
    allProducts.forEach((p) => {
      const pBrand = String(p.brand || 'Generic').trim();
      const key = pBrand.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { rawName: pBrand, name: capitalizeBrand(pBrand), products: [], totalStock: 0, stockValue: 0 });
      }
      const item = map.get(key);
      const pId = p.id || p.product_id;
      if (!item.products.some((existing) => (existing.id || existing.product_id) === pId)) {
        item.products.push(p);
        const qty = Number(p.total_stock || p.available_quantity || p.quantity || 0);
        const price = Number(p.sale_price || p.retail_price || p.official_price || 0);
        item.totalStock += qty;
        item.stockValue += qty * price;
      }
    });

    return map;
  }, [data.reference, allProducts]);

  const brandList = React.useMemo(() => {
    if (propBrands && Array.isArray(propBrands)) {
      return propBrands.map((b) => ({
        rawName: b.brand,
        name: capitalizeBrand(b.brand),
        products: [],
        totalStock: Number(b.quantity || 0),
        stockValue: Number(b.stock_value || 0),
        productCount: Number(b.product_count || 0)
      })).filter((b) => !searchVal || b.name.toLowerCase().includes(searchVal.toLowerCase()));
    }

    return Array.from(brandStatsMap.values()).filter((item) =>
      !searchVal || item.name.toLowerCase().includes(searchVal.toLowerCase())
    );
  }, [propBrands, brandStatsMap, searchVal]);

  const activeBrandData = activeBrandName ? brandStatsMap.get(activeBrandName.toLowerCase()) : null;
  const explorerProducts = propProducts || activeBrandData?.products || [];
  const filteredExplorerProducts = explorerProducts.filter((p) =>
    (p.name || p.short_name || p.product_name || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
    (p.model || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(modalSearch.toLowerCase())
  );

  const handleSelectBrand = (brandName) => {
    if (onSelectBrand) {
      onSelectBrand(brandName);
    } else {
      setSelectedBrandState(brandName);
    }
  };

  const handleCloseModal = () => {
    if (onClearBrand) {
      onClearBrand();
    } else {
      setSelectedBrandState(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 border border-slate-200/80 rounded-3xl p-6 shadow-xl shadow-slate-200/40 backdrop-blur-xl">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-teal-600">Product Portfolio</span>
          <h2 className="text-2xl font-black text-slate-900 mt-1">Product Brands</h2>
          <p className="text-xs text-slate-500 font-medium">Browse hardware and spare parts catalog grouped by brand manufacturer.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 font-extrabold text-xs border border-teal-200/60">
            {brandList.length} Brands
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', maxWidth: '380px' }}>
        <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#94a3b8', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Search brand..."
          value={searchVal}
          onChange={(e) => onSearchChange ? onSearchChange(e.target.value) : setInternalSearch(e.target.value)}
          style={{ width: '100%', paddingLeft: '38px', paddingRight: '16px', paddingTop: '10px', paddingBottom: '10px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', fontSize: '13px', fontWeight: '600', color: '#0f172a', outline: 'none' }}
        />
      </div>

      {/* Brand Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {brandList.map((item) => (
          <motion.div
            key={item.name}
            whileHover={{ y: -4, scale: 1.015 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="p-5 rounded-3xl bg-white/95 border border-slate-200/90 shadow-xl shadow-slate-200/40 backdrop-blur-xl flex flex-col justify-between cursor-pointer group hover:border-teal-300 transition-all"
            onClick={() => handleSelectBrand(item.rawName)}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-2xl bg-teal-50 border border-teal-100 text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-all">
                  <Tags className="w-5 h-5" />
                </div>
              </div>

              <h3 className="text-lg font-black text-slate-900 group-hover:text-teal-700 transition-all">{item.name}</h3>

              <div className="mt-4 space-y-1.5 text-xs font-medium text-slate-500">
                <div className="flex justify-between items-center">
                  <span>Product Models:</span>
                  <span className="font-extrabold text-slate-800">
                    {item.productCount !== undefined ? item.productCount : item.products.length} models
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Stock Available:</span>
                  <span className="font-extrabold text-emerald-600">{item.totalStock} units</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-teal-600 group-hover:text-teal-700">
              <span>View Brand Products</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-all" />
            </div>
          </motion.div>
        ))}

        {brandList.length === 0 && (
          <div className="col-span-full p-12 text-center bg-white/80 border border-slate-200/80 rounded-3xl">
            <Tags className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">No brands found</p>
            <p className="text-xs text-slate-400 mt-1">Try searching for another brand name.</p>
          </div>
        )}
      </div>

      {/* Brand Product Explorer Modal */}
      <AnimatePresence>
        {activeBrandName && (
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
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{capitalizeBrand(activeBrandName)} Products</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Showing {filteredExplorerProducts.length} products under brand "{capitalizeBrand(activeBrandName)}"
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
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
                    placeholder={`Search ${capitalizeBrand(activeBrandName)} products...`}
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    style={{ width: '100%', paddingLeft: '38px', paddingRight: '14px', paddingTop: '8px', paddingBottom: '8px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '12px', fontWeight: '600', color: '#0f172a', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Modal Table Content */}
              <div className="p-4 overflow-y-auto flex-1">
                {productLoading ? (
                  <div className="p-8 text-center text-slate-500 font-medium">Loading brand products...</div>
                ) : filteredExplorerProducts.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200/80 text-slate-600 font-bold uppercase tracking-wider">
                          <th className="p-3">Product Name</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Model</th>
                          <th className="p-3">Retail Price</th>
                          <th className="p-3">Stock Units</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredExplorerProducts.map((p) => (
                          <tr key={p.id || p.product_id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-bold text-slate-900">{productName(p)}</td>
                            <td className="p-3">
                              <span className="px-2 py-1 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/60 font-semibold">
                                {p.category || 'General'}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-slate-600">{p.model || '—'}</td>
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
                    No products found under brand "{capitalizeBrand(activeBrandName)}".
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
