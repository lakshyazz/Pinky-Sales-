import React from 'react';
import { ArrowLeft, ArrowRight, Boxes, PackageSearch, Smartphone, Tags } from 'lucide-react';
import SearchInput from '../ui/SearchInput';
import ExpandableText from '../shared/ExpandableText';

const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export default function BrandsPage({
  brands,
  selectedBrand,
  products,
  search,
  loading,
  productLoading,
  onSearchChange,
  onSelectBrand,
  onClearBrand,
  onOpenStockBrand,
  onViewDetails,
  productName,
  fullModelList,
  priceLabel,
  Empty,
}) {
  const query = search.trim().toLowerCase();
  const filteredBrands = brands.filter((item) => !query || String(item.brand || '').toLowerCase().includes(query));
  const activeBrand = selectedBrand || '';
  const totalProducts = brands.reduce((sum, item) => sum + Number(item.product_count || 0), 0);
  const totalQuantity = brands.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <section className="space">
      <div className="catalog-toolbar panel models-toolbar">
        <SearchInput
          placeholder="Search brand"
          value={search}
          onChange={onSearchChange}
        />
        <div className="models-summary">
          <span className="status-badge stock-ok">{filteredBrands.length} brands</span>
          <span className="status-badge due">{totalProducts.toLocaleString('en-IN')} products</span>
          <span className="status-badge paid">{totalQuantity.toLocaleString('en-IN')} pcs</span>
          {loading && <span className="status-badge due">Loading</span>}
        </div>
      </div>

      <div className="brand-card-grid">
        {filteredBrands.map((brand) => {
          const isSelected = activeBrand && activeBrand.toLowerCase() === String(brand.brand).toLowerCase();
          const quantity = Number(brand.quantity || 0);
          return (
            <button
              type="button"
              key={brand.id || brand.brand}
              className={`panel brand-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectBrand(brand.brand)}
            >
              <span className="brand-card-icon"><Tags size={20} /></span>
              <span className="brand-card-copy">
                <strong>{brand.brand}</strong>
                <small>{Number(brand.product_count || 0).toLocaleString('en-IN')} products</small>
              </span>
              <span className="brand-card-metrics">
                <b>{quantity.toLocaleString('en-IN')} pcs</b>
                <small>{currency(brand.stock_value)}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          );
        })}
        {!filteredBrands.length && <Empty title="No brands found" />}
      </div>

      {activeBrand ? (
        <section className="panel brand-detail-panel">
          <div className="brand-detail-header">
            <button className="soft" type="button" onClick={onClearBrand}>
              <ArrowLeft size={16} /> Brands
            </button>
            <div>
              <span className="stock-eyebrow">Brand Products</span>
              <h2>{activeBrand}</h2>
            </div>
            <button className="primary" type="button" onClick={() => onOpenStockBrand(activeBrand)}>
              <PackageSearch size={16} /> Open Stock
            </button>
          </div>

          {productLoading ? (
            <div className="loading">Loading brand products...</div>
          ) : products.length ? (
            <div className="table compact-models-table brand-products-table">
              {products.map((product) => (
                <div className="row compact-model-row" key={product.id}>
                  <div className="inventory-primary">
                    <div className="w-10 h-10 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                      <Smartphone size={18} />
                    </div>
                    <span>
                      <b>{productName(product)}</b>
                      <small>{product.category || 'Uncategorized'}</small>
                      <ExpandableText
                        className="model-compatible-preview"
                        label="Compatible:"
                        text={fullModelList(product)}
                        emptyText="No compatible models listed"
                        limit={120}
                      />
                    </span>
                  </div>
                  <span className="inventory-metric">
                    <small>Stock</small>
                    <strong>{Number(product.quantity || 0).toLocaleString('en-IN')} pcs</strong>
                  </span>
                  <span className="inventory-metric">
                    <small>Sale price</small>
                    <strong>{priceLabel(product.sale_price)}</strong>
                  </span>
                  <span className="inventory-metric">
                    <small>Colours</small>
                    <strong>{product.stock_colours || (Array.isArray(product.colours) ? product.colours.join(', ') : '') || 'None'}</strong>
                  </span>
                  <div className="model-row-actions">
                    <button className="soft" type="button" onClick={() => onViewDetails(product)}>View details</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No products under this brand yet" />
          )}
        </section>
      ) : (
        <section className="panel brand-empty-panel">
          <Boxes size={22} />
          <span>Choose a company card to view its products and stock.</span>
        </section>
      )}
    </section>
  );
}
