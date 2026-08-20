import React, { useState } from 'react';
import { Download, IndianRupee, Trash2, Search, Eye, Edit3, MoreHorizontal, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import Pagination from '../ui/Pagination';
import SearchInput from '../ui/SearchInput';
import ExpandableText from '../shared/ExpandableText';
import ProductThumbnail from '../ui/ProductThumbnail';
import ProductImageUpload from '../ui/ProductImageUpload';

export default function PricesPage({
  role,
  forms = { product: {} },
  reference = { categories: [], colours: [], brands: [], manufacturingBrands: [], partCategories: [], productVariants: [] },
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
  onCloneProduct = () => {},
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
  Input = ({ label, value, onChange, type = "text", className = "", placeholder = "" }) => (
    <div className={className}>
      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-1">{label}</label>
      <input type={type} placeholder={placeholder} value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-cyan-500" />
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
  const [isCustomPartCategory, setIsCustomPartCategory] = useState(false);
  const [isCustomQualityVariant, setIsCustomQualityVariant] = useState(false);

  const defaultPartCategories = ['Display', 'Battery', 'Camera', 'Speaker', 'Charging IC', 'Main Flex', 'Frame', 'Charging Port', 'Vibrator', 'Ear Speaker', 'Back Glass', 'Middle Frame', 'Sim Tray', 'Housing', 'Mic'];
  const refPartCategories = (reference?.partCategories || []).map(pc => typeof pc === 'string' ? pc : pc.name).filter(Boolean);
  const uniquePartCategories = Array.from(new Set([...defaultPartCategories, ...refPartCategories]));

  const defaultQualityVariants = ['OLED', 'Soft OLED', 'Hard OLED', 'Incell', 'With Frame', 'Without Frame', 'Fresh New', 'Set Remove', 'Original', 'Refurbished', 'Copy', 'Premium Copy'];
  const refQualityVariants = (reference?.productVariants || []).map(qv => typeof qv === 'string' ? qv : qv.name).filter(Boolean);
  const uniqueQualityVariants = Array.from(new Set([...defaultQualityVariants, ...refQualityVariants]));

  const productForm = forms.product || {};
  const appendColour = (value) => {
    const selected = (productForm.colours || '').split(',').map((item) => item.trim()).filter(Boolean);
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
          
          <div className="md:col-span-1">
            <Select
              label="Brand *"
              value={productForm.brand}
              onChange={(value) => {
                onProductFieldChange('brand', value);
                if (!productForm.short_name) {
                  onProductFieldChange('short_name', [value, productForm.part_category].filter(Boolean).join(' '));
                }
              }}
              options={[['', 'Select Brand'], ...(reference?.brands || []).map((b) => [b.name, b.name])]}
            />
          </div>

          <Select
            label="Manufacturing Brand (Optional)"
            className="md:col-span-1"
            value={productForm.manufacturing_brand_id || ''}
            onChange={(value) => onProductFieldChange('manufacturing_brand_id', value)}
            options={[
              ['', 'Select Manufacturing Brand'],
              ...(reference?.manufacturingBrands || [])
                .filter(mb => mb.is_active || String(mb.id) === String(productForm.manufacturing_brand_id))
                .map((mb) => [mb.id, mb.name])
            ]}
          />
          <Select
            label="Supplier (Optional)"
            className="md:col-span-2"
            value={productForm.supplier_id || ''}
            onChange={(value) => onProductFieldChange('supplier_id', value)}
            options={[
              ['', 'Select Supplier'],
              ...(reference?.suppliers || [])
                .filter(s => s.is_active || String(s.id) === String(productForm.supplier_id))
                .map((s) => [s.id, s.name])
            ]}
          />

          {/* Separate Part Category & Quality / Variant Container */}
          <div className="md:col-span-4 border border-emerald-300 dark:border-teal-800/80 rounded-2xl p-4 bg-emerald-50/20 dark:bg-emerald-950/10 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Field 1: Part Category */}
            <div className="flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider block">PART CATEGORY *</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !isCustomPartCategory;
                      setIsCustomPartCategory(nextState);
                      if (nextState) {
                        onProductFieldChange('part_category', '');
                        onProductFieldChange('category', '');
                      }
                    }}
                    className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} /> {isCustomPartCategory ? 'Select Part Category' : 'Add New Part Category'}
                  </button>
                </div>

                {isCustomPartCategory ? (
                  <Input
                    label="New Part Category"
                    placeholder="Type part category (e.g. Display, Battery, Camera)"
                    value={productForm.part_category || productForm.category || ''}
                    onChange={(v) => {
                      onProductFieldChange('part_category', v);
                      onProductFieldChange('category', v);
                    }}
                  />
                ) : (
                  <Select
                    label="Part Category *"
                    value={productForm.part_category || productForm.category || ''}
                    onChange={(v) => {
                      if (v === '__ADD_NEW__') {
                        setIsCustomPartCategory(true);
                        onProductFieldChange('part_category', '');
                        onProductFieldChange('category', '');
                      } else {
                        onProductFieldChange('part_category', v);
                        onProductFieldChange('category', v);
                      }
                    }}
                    options={[
                      ['', 'Select Part Category'],
                      ...uniquePartCategories.map(pc => [pc, pc]),
                      ['__ADD_NEW__', '➕ Add New Part Category...']
                    ]}
                  />
                )}

                {/* Quick Type Chips */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-[10px] font-bold text-slate-400 mr-1">Quick Categories:</span>
                  {['Display', 'Battery', 'Camera', 'Speaker', 'Charging Port', 'Back Glass', 'Frame'].map((chip) => (
                    <button
                      type="button"
                      key={chip}
                      onClick={() => {
                        setIsCustomPartCategory(false);
                        onProductFieldChange('part_category', chip);
                        onProductFieldChange('category', chip);
                      }}
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                        (productForm.part_category || productForm.category) === chip
                          ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-500'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold italic">Defines WHAT spare part this is (Display, Battery, Camera, etc.)</p>
            </div>

            {/* Field 2: Product Quality / Variant */}
            <div className="flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider block">QUALITY / VARIANT (OPTIONAL)</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !isCustomQualityVariant;
                      setIsCustomQualityVariant(nextState);
                      if (nextState) {
                        onProductFieldChange('quality_variant', '');
                      }
                    }}
                    className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} /> {isCustomQualityVariant ? 'Select Variant' : 'Add New Variant'}
                  </button>
                </div>

                {isCustomQualityVariant ? (
                  <Input
                    label="New Quality / Variant"
                    placeholder="Type variant (e.g. OLED, Incell, With Frame)"
                    value={productForm.quality_variant || ''}
                    onChange={(v) => onProductFieldChange('quality_variant', v)}
                  />
                ) : (
                  <Select
                    label="Quality / Variant (Optional)"
                    value={productForm.quality_variant || ''}
                    onChange={(v) => {
                      if (v === '__ADD_NEW__') {
                        setIsCustomQualityVariant(true);
                        onProductFieldChange('quality_variant', '');
                      } else {
                        onProductFieldChange('quality_variant', v);
                      }
                    }}
                    options={[
                      ['', '(None / Default)'],
                      ...uniqueQualityVariants.map(qv => [qv, qv]),
                      ['__ADD_NEW__', '➕ Add New Variant...']
                    ]}
                  />
                )}

                {/* Quick Variant Chips */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-[10px] font-bold text-slate-400 mr-1">Quick Variants:</span>
                  {['OLED', 'Incell', 'With Frame', 'Without Frame', 'Fresh New', 'Set Remove', 'Original'].map((chip) => (
                    <button
                      type="button"
                      key={chip}
                      onClick={() => {
                        setIsCustomQualityVariant(false);
                        onProductFieldChange('quality_variant', chip);
                      }}
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                        productForm.quality_variant === chip
                          ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-500'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold italic">Defines WHICH VERSION/QUALITY it is (OLED, Incell, With Frame, etc.)</p>
            </div>
          </div>

          <Input label="Purchase price" type="number" className="md:col-span-1" value={productForm.purchase_price} onChange={(value) => onProductFieldChange('purchase_price', value)} />
          <Input label="Sale price" type="number" className="md:col-span-1" value={productForm.sale_price} onChange={(value) => onProductFieldChange('sale_price', value)} />
          <Input label="Wholesale price" type="number" className="md:col-span-1" value={productForm.wholesale_price} onChange={(value) => onProductFieldChange('wholesale_price', value)} />
          {!editingProductId ? (
            <Input label="Opening stock" type="number" className="md:col-span-1" value={productForm.opening_stock} onChange={(value) => onProductFieldChange('opening_stock', value)} />
          ) : (
            <div className="md:col-span-1 flex flex-col justify-center">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-1">Available Stock</span>
              <div className="h-10 px-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs font-bold">
                <span className="text-slate-500">Warehouse:</span>
                <span className={Number(productForm.stock_quantity ?? productForm.quantity ?? 0) <= 0 ? 'text-rose-600 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                  {Number(productForm.stock_quantity ?? productForm.quantity ?? 0)} pcs
                </span>
              </div>
            </div>
          )}
          <Input label="Description" className="md:col-span-4" value={productForm.description} onChange={(value) => onProductFieldChange('description', value)} />
          
          {/* Product Image Upload Section */}
          <div className="md:col-span-4 pt-1">
            <ProductImageUpload
              imageUrl={productForm.image_url}
              imageUrls={productForm.image_urls}
              category={productForm.part_category || productForm.category || 'Display'}
              disabled={saving}
              onImageChange={({ imageUrl, imageUrls }) => {
                onProductFieldChange('image_url', imageUrl);
                onProductFieldChange('image_urls', imageUrls);
              }}
            />
          </div>

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
            const hasPurchase = role === 'superadmin';
            const hasWholesale = true;
            return (
              <div
                key={product.id}
                className="rounded-xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all duration-150"
              >
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 items-stretch lg:items-center p-4">
                  {/* Column 1: Product / Model details (lg:col-span-5) */}
                  <div className="w-full lg:col-span-5 flex items-start gap-3">
                    {/* Image Thumbnail Preview container */}
                    <ProductThumbnail
                      src={product.image_url}
                      alt={productName(product)}
                      category={product.part_category || product.category || 'Display'}
                      size={48}
                      rounded="10px"
                    />
                    
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
                        {product.supplier_name && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-blue-600">Supplier: {product.supplier_name}</span>
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
                  
                  {/* Column 2: Aligned Stock & Pricing details (lg:col-span-5) */}
                  <div className={`w-full lg:col-span-5 grid ${hasPurchase ? 'grid-cols-4' : 'grid-cols-3'} gap-2 text-right pr-0 lg:pr-4 border-b lg:border-b-0 pb-3 lg:pb-0 lg:border-r border-slate-200/60 h-full py-1 items-center`}>
                    {/* Available Stock */}
                    {(() => {
                      const stockQty = Number(product.quantity ?? product.available_stock ?? product.stock_quantity ?? product.warehouse_stock ?? product.stock ?? 0);
                      const isOutOfStock = stockQty <= 0;
                      const isLowStock = stockQty > 0 && stockQty <= 5;
                      return (
                        <div className="flex flex-col justify-center items-end">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Available</span>
                          <span 
                            title={isOutOfStock ? 'No stock available in warehouse' : isLowStock ? `${stockQty} pcs remaining (Low Stock)` : `${stockQty} pcs in stock`}
                            className={`text-[10px] font-black px-2 py-0.5 rounded-lg border mt-1 inline-flex items-center gap-1 shadow-xs ${
                              isOutOfStock
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : isLowStock
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                            }`} />
                            <span className="truncate max-w-[70px]">
                              {isOutOfStock ? '0 Out' : `${stockQty} pcs`}
                            </span>
                          </span>
                        </div>
                      );
                    })()}

                    {/* Sale Price */}
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Sale</span>
                      <span className="text-sm font-black text-emerald-700 mt-0.5">{priceLabel(product.sale_price)}</span>
                    </div>
                    
                    {/* Purchase Price (Super Admin only) */}
                    {hasPurchase && (
                      <div className="flex flex-col justify-center">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Purchase</span>
                        <span className="text-sm font-semibold text-slate-700 mt-0.5">{priceLabel(product.purchase_price)}</span>
                      </div>
                    )}

                    {/* Wholesale Price */}
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Wholesale</span>
                      <span className="text-sm font-semibold text-slate-700 mt-0.5">{priceLabel(product.wholesale_price)}</span>
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
                    <button
                      type="button"
                      title="Duplicate / Clone Product"
                      onClick={() => onCloneProduct(product)}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 transition-all text-xs font-semibold shadow-sm active:scale-95"
                    >
                      Clone
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
