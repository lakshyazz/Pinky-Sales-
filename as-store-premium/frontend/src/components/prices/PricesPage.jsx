import React, { useState } from 'react';
import { Download, IndianRupee, Trash2, Search, Eye, Edit3, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import Pagination from '../ui/Pagination';
import SearchInput from '../ui/SearchInput';
import ExpandableText from '../shared/ExpandableText';

export default function PricesPage({
  role,
  forms = { product: {} },
  reference = { categories: [], colours: [], brands: [], manufacturingBrands: [] },
  priceVisibility = {},
  newReference = {},
  editingProductId,
  saving,
  items = [],
  search = '',
  pager = {},
  loading = false,
  onSubmitProduct = () => {},
  onProductFieldChange = () => {},
  onNewReferenceChange = () => {},
  onAddReferenceOption = () => {},
  onCancelEdit = () => {},
  onExportProducts = () => {},
  onSearchChange = () => {},
  onPageChange = () => {},
  onPageSizeChange = () => {},
  onViewDetails = () => {},
  onEditProduct = () => {},
  onDeleteProduct = () => {},
  productName = (p) => p?.name || p?.short_name || 'Product',
  fullModelList = (p) => p?.full_model_list || p?.model || '',
  priceLabel = (val) => `₹${Number(val || 0).toLocaleString('en-IN')}`,
  FormPanel = ({ children, title, action, onSubmit }) => (
    <form onSubmit={onSubmit} className="panel space-y-4 glass-card-premium">
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{children}</div>
      <button type="submit" className="primary mt-4">{action}</button>
    </form>
  ),
  Input = ({ label, value, onChange, type = "text", className = "" }) => (
    <div className={className}>
      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-1">{label}</label>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-cyan-500" />
    </div>
  ),
  Select = ({ label, value, onChange, options = [], className = "" }) => (
    <div className={className}>
      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-1">{label}</label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-cyan-500 bg-white">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  ),
  CardGrid = ({ items = [], render, emptyTitle }) => (
    items.length ? (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <motion.div 
            key={item.id} 
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="panel p-4 flex flex-col justify-between glass-card-premium cursor-pointer"
          >
            {render(item)}
          </motion.div>
        ))}
      </div>
    ) : (
      <div className="p-12 text-center text-slate-400 font-bold bg-white rounded-3xl border border-slate-200">{emptyTitle}</div>
    )
  ),
}) {
  const [activeMenuId, setActiveMenuId] = useState(null);
  const productForm = forms.product || {};
  const appendColour = (value) => {
    const selected = productForm.colours.split(',').map((item) => item.trim()).filter(Boolean);
    if (value && !selected.includes(value)) onProductFieldChange('colours', [...selected, value].join(', '));
  };

  const SkeletonRow = () => (
    <div className="rounded-xl bg-white border border-slate-200 p-4 animate-pulse">
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 items-start lg:items-center">
        <div className="w-full lg:col-span-5 flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-100 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-100 rounded w-2/3" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
        </div>
        <div className="w-full lg:col-span-5 grid grid-cols-3 gap-4">
          <div className="h-8 bg-slate-100 rounded" />
          <div className="h-8 bg-slate-100 rounded" />
          <div className="h-8 bg-slate-100 rounded" />
        </div>
        <div className="w-full lg:col-span-2 h-8 bg-slate-100 rounded" />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Prices</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">Manage sale, purchase and wholesale pricing for your products.</p>
      </div>

      {role === 'superadmin' && (
        <FormPanel title={editingProductId ? 'Edit product and prices' : 'Add product and prices'} action={saving ? 'Saving...' : editingProductId ? 'Update product' : 'Add product'} onSubmit={onSubmitProduct} disabled={saving}>
          <Input label="Short display name" className="md:col-span-2" value={productForm.short_name} onChange={(value) => onProductFieldChange('short_name', value)} />
          <Input label="Full compatible models" className="md:col-span-2" value={productForm.full_model_list} onChange={(value) => onProductFieldChange('full_model_list', value)} />
          <Input label="Brand" className="md:col-span-1" value={productForm.brand} onChange={(value) => onProductFieldChange('brand', value)} />
          <Select
            label="Product Category"
            className="md:col-span-1"
            value={productForm.category}
            onChange={(value) => value === '__new__' ? onNewReferenceChange({ type: 'categories', name: '' }) : onProductFieldChange('category', value)}
            options={[...(reference?.categories || []).map((item) => [item.name, item.name]), ['__new__', '+ Add New Category']]}
          />
          <Select
            label="Manufacturing Brand"
            className="md:col-span-1"
            value={productForm.manufacturing_brand_id || ''}
            onChange={(value) => onProductFieldChange('manufacturing_brand_id', value)}
            options={[
              ['', 'Choose Manufacturing Brand'],
              ...(reference?.manufacturingBrands || [])
                .filter(mb => mb.is_active || String(mb.id) === String(productForm.manufacturing_brand_id))
                .map((mb) => [mb.id, mb.name])
            ]}
          />
          <Select
            label="Supplier (Optional)"
            className="md:col-span-1"
            value={productForm.supplier_id || ''}
            onChange={(value) => onProductFieldChange('supplier_id', value)}
            options={[
              ['', 'Choose Supplier'],
              ...(reference?.suppliers || [])
                .filter(s => s.is_active || String(s.id) === String(productForm.supplier_id))
                .map((s) => [s.id, s.name])
            ]}
          />
          {newReference.type === 'categories' && (
            <div className="inline-reference-control md:col-span-2">
              <Input label="New category" value={newReference.name} onChange={(name) => onNewReferenceChange({ type: 'categories', name })} />
              <button className="soft" type="button" onClick={() => onAddReferenceOption('categories', newReference.name)}>Add category</button>
            </div>
          )}
          <Input label="Purchase price" type="number" className="md:col-span-1" value={productForm.purchase_price} onChange={(value) => onProductFieldChange('purchase_price', value)} />
          <Input label="Sale price" type="number" className="md:col-span-1" value={productForm.sale_price} onChange={(value) => onProductFieldChange('sale_price', value)} />
          <Input label="Wholesale price" type="number" className="md:col-span-1" value={productForm.wholesale_price} onChange={(value) => onProductFieldChange('wholesale_price', value)} />
          {!editingProductId && <Input label="Opening stock" type="number" className="md:col-span-1" value={productForm.opening_stock} onChange={(value) => onProductFieldChange('opening_stock', value)} />}
          <Input label="Description" className="md:col-span-4" value={productForm.description} onChange={(value) => onProductFieldChange('description', value)} />
          <Select
            label="Add Colour"
            className="md:col-span-1"
            value=""
            onChange={(value) => {
              if (value === '__new__') return onNewReferenceChange({ type: 'colours', name: '' });
              appendColour(value);
            }}
            options={[...(reference?.colours || []).map((item) => [item.name, item.name]), ['__new__', '+ Add New Colour']]}
          />
          <Input label="Selected colours" className="md:col-span-3" value={productForm.colours} onChange={(value) => onProductFieldChange('colours', value)} />
          {newReference.type === 'colours' && (
            <div className="inline-reference-control md:col-span-2">
              <Input label="New colour" value={newReference.name} onChange={(name) => onNewReferenceChange({ type: 'colours', name })} />
              <button className="soft" type="button" onClick={() => onAddReferenceOption('colours', newReference.name)}>Add colour</button>
            </div>
          )}
          {editingProductId && <button className="soft" type="button" onClick={onCancelEdit}>Cancel edit</button>}
        </FormPanel>
      )}

      {/* Catalog Export Box */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Data Export</span>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">Product Data Tools</h2>
            <p className="text-xs text-slate-500 font-medium">Download the complete product and model list as a CSV file.</p>
          </div>
        </div>
        <button
          className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all text-xs font-semibold flex items-center gap-1.5 active:scale-95 shadow-sm self-start sm:self-auto"
          type="button"
          onClick={onExportProducts}
        >
          <Download className="w-3.5 h-3.5" /> Export products/models CSV
        </button>
      </section>

      {/* Compact Search & Counter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search model, brand, category, compatible models..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder-slate-400 outline-none focus:border-slate-400 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 font-semibold text-xs border border-slate-200">
            {pager.loaded ? `${items.length} of ${pager.total.toLocaleString('en-IN')}` : items.length} Prices
          </span>
          {loading && (
            <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-semibold text-xs border border-amber-205">
              Loading
            </span>
          )}
        </div>
      </div>

      {/* Aligned Structured Table Rows */}
      {loading && !items.length ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : items.length ? (
        <div className="space-y-3">
          {items.map((product) => {
            const hasPurchase = role === 'superadmin' || priceVisibility.show_purchase_price_shopkeeper;
            const hasWholesale = role === 'superadmin' || priceVisibility.show_wholesale_price_shopkeeper;
            return (
              <div
                key={product.id}
                className="rounded-xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all duration-150"
              >
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 items-stretch lg:items-center p-4">
                  {/* Column 1: Product / Model details (lg:col-span-5) */}
                  <div className="w-full lg:col-span-5 flex items-start gap-3">
                    {/* Image Thumbnail Preview container */}
                    <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center text-slate-450 shrink-0 overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={productName(product)} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-slate-500">₹</span>
                      )}
                    </div>
                    
                    {/* Info Hierarchy */}
                    <div className="min-w-0 flex-1">
                      <h3 
                        className="text-sm font-semibold text-slate-900 truncate hover:text-slate-700 cursor-pointer" 
                        onClick={() => onViewDetails(product)}
                      >
                        {productName(product)}
                      </h3>
                      
                      <div className="text-[11px] text-slate-500 mt-0.5 font-medium flex items-center gap-1.5 flex-wrap">
                        <span>{product.brand || 'Generic'}</span>
                        {product.category && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span>{product.category}</span>
                          </>
                        )}
                        {product.manufacturing_brand_name && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-slate-600">Mfg: {product.manufacturing_brand_name}</span>
                          </>
                        )}
                      </div>

                      {/* Truncated Compatibility Label */}
                      {product.full_model_list && (
                        <div className="mt-1.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Compatible:</span>
                          <ExpandableText
                            className="text-[11px] text-slate-500 leading-relaxed font-medium"
                            text={fullModelList(product)}
                            emptyText="No compatible models listed"
                            limit={75}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Column 2: Aligned Pricing details (lg:col-span-5) */}
                  <div className="w-full lg:col-span-5 grid grid-cols-3 gap-4 text-right pr-0 lg:pr-4 border-b lg:border-b-0 pb-3 lg:pb-0 lg:border-r border-slate-200/60 h-full py-1">
                    {/* Sale Price */}
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Sale</span>
                      <span className="text-sm font-semibold text-emerald-700 mt-0.5">{priceLabel(product.sale_price)}</span>
                    </div>
                    
                    {/* Purchase Price */}
                    <div className="flex flex-col justify-center">
                      {hasPurchase ? (
                        <>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Purchase</span>
                          <span className="text-sm font-semibold text-slate-700 mt-0.5">{priceLabel(product.purchase_price)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider block">Purchase</span>
                          <span className="text-xs text-slate-300 italic mt-0.5 block">-</span>
                        </>
                      )}
                    </div>

                    {/* Wholesale Price */}
                    <div className="flex flex-col justify-center">
                      {hasWholesale ? (
                        <>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Wholesale</span>
                          <span className="text-sm font-semibold text-slate-700 mt-0.5">{priceLabel(product.wholesale_price)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider block">Wholesale</span>
                          <span className="text-xs text-slate-300 italic mt-0.5 block">-</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Column 3: Actions controls (lg:col-span-2) */}
                  <div className="w-full lg:col-span-2 flex items-center justify-start lg:justify-end gap-1.5 mt-2 lg:mt-0">
                    <button
                      type="button"
                      onClick={() => onViewDetails(product)}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all text-xs font-semibold shadow-sm active:scale-95"
                    >
                      View
                    </button>
                    {role === 'superadmin' && (
                      <button
                        type="button"
                        onClick={() => onEditProduct(product)}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all text-xs font-semibold shadow-sm active:scale-95"
                      >
                        Edit
                      </button>
                    )}
                    
                    {/* More action menu dropdown */}
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
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                            }}
                          />
                          <div className="absolute right-0 bottom-full mb-1.5 w-32 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 text-xs text-left">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(null);
                                onViewDetails(product);
                              }}
                              className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 font-semibold flex items-center gap-1.5"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Specs
                            </button>
                            {role === 'superadmin' && onDeleteProduct && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(null);
                                  onDeleteProduct(product);
                                }}
                                className="w-full px-3 py-1.5 text-rose-600 hover:bg-rose-50 font-semibold flex items-center gap-1.5"
                                disabled={saving}
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
            );
          })}
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400 font-bold bg-white rounded-xl border border-slate-200">
          No pricing records found. Try changing your search or filters.
        </div>
      )}

      {/* Pagination */}
      {pager.loaded && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500 font-medium">
          <div>
            Showing {Math.min((pager.page - 1) * pager.limit + 1, pager.total)}–{Math.min(pager.page * pager.limit, pager.total)} of {pager.total.toLocaleString('en-IN')} products
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
