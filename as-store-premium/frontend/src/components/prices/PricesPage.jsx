import React from 'react';
import { Download, IndianRupee, Trash2 } from 'lucide-react';
import Pagination from '../ui/Pagination';
import SearchInput from '../ui/SearchInput';
import ExpandableText from '../shared/ExpandableText';

export default function PricesPage({
  role,
  forms = { product: {} },
  reference = { categories: [], colours: [], brands: [] },
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
    <form onSubmit={onSubmit} className="panel space-y-4">
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
          <div key={item.id} className="panel p-4 flex flex-col justify-between">
            {render(item)}
          </div>
        ))}
      </div>
    ) : (
      <div className="p-12 text-center text-slate-400 font-bold bg-white rounded-3xl border border-slate-200">{emptyTitle}</div>
    )
  ),
}) {
  const productForm = forms.product || {};
  const appendColour = (value) => {
    const selected = productForm.colours.split(',').map((item) => item.trim()).filter(Boolean);
    if (value && !selected.includes(value)) onProductFieldChange('colours', [...selected, value].join(', '));
  };

  return (
    <section className="space">
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

      <section className="panel product-data-tools-panel">
        <div className="product-data-tools-copy">
          <span className="product-data-tools-icon"><Download size={21} /></span>
          <div>
            <span className="product-data-tools-kicker">Catalog export</span>
            <h2>Product data tools</h2>
            <p>Download the complete product and model list as a CSV file.</p>
          </div>
        </div>
        <button className="soft" type="button" onClick={onExportProducts}><Download size={17} /> Export products/models CSV</button>
      </section>

      <div className="catalog-toolbar panel models-toolbar">
        <SearchInput
          placeholder="Search model, brand, category, compatible models, colour, or price"
          value={search}
          onChange={onSearchChange}
        />
        <div className="models-summary">
          <span className="status-badge stock-ok">{pager.loaded ? `${items.length} of ${pager.total.toLocaleString('en-IN')}` : items.length} prices</span>
          {loading && <span className="status-badge due">Loading</span>}
        </div>
      </div>

      <CardGrid className="product-grid compact-price-grid" items={items} emptyTitle="No matching model or price found." render={(product) => (
        <>
          <div className="flex items-start justify-between w-full mb-3">
            <div className="card-icon-wrapper indigo !mb-0">
              <IndianRupee size={18} />
            </div>
            <span className="status-badge stock-ok">{product.category}</span>
          </div>
          <div className="price-product-copy">
            <h3 className="product-title" title={fullModelList(product)}>{productName(product)}</h3>
            <p className="product-description" title={product.description || 'No description provided.'}>
              {product.description || 'No description provided.'}
            </p>
            <ExpandableText
              className="price-compatible-preview"
              label="Compatible:"
              text={fullModelList(product)}
              emptyText="No compatible models listed"
              limit={92}
            />
            <p className="text-xs text-slate-500">{product.brand}{product.colours?.length ? ` \u00b7 ${product.colours.join(', ')}` : ''}</p>
          </div>
          <div className="price-stack">
            <span><small>Sale</small><strong>{priceLabel(product.sale_price)}</strong></span>
            {(role === 'superadmin' || priceVisibility.show_purchase_price_shopkeeper) && <span><small>Purchase</small><strong>{priceLabel(product.purchase_price)}</strong></span>}
            {(role === 'superadmin' || priceVisibility.show_wholesale_price_shopkeeper) && <span><small>Wholesale</small><strong>{priceLabel(product.wholesale_price)}</strong></span>}
          </div>
          <div className="flex gap-2 w-full mt-3">
            <button className="soft flex-1 !min-h-[38px] text-xs font-bold" type="button" onClick={() => onViewDetails(product)}>View Details</button>
            {role === 'superadmin' && <button className="soft flex-1 !min-h-[38px] text-xs font-bold" type="button" onClick={() => onEditProduct(product)}>Edit</button>}
            {role === 'superadmin' && (
              <button className="soft product-delete-button flex-1 !min-h-[38px] text-xs font-bold" type="button" disabled={saving} onClick={() => onDeleteProduct(product)}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </>
      )} />

      <Pagination
        meta={pager}
        loading={loading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </section>
  );
}
