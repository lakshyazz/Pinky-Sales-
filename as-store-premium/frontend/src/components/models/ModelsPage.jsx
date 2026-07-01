import React from 'react';
import { Smartphone } from 'lucide-react';
import Pagination from '../ui/Pagination';
import SearchInput from '../ui/SearchInput';
import ExpandableText from '../shared/ExpandableText';

export default function ModelsPage({
  items,
  search,
  onSearchChange,
  role,
  pager,
  loading,
  onPageChange,
  onPageSizeChange,
  onViewDetails,
  productName,
  fullModelList,
  priceLabel,
  Empty,
}) {
  return (
    <section className="space">
      <div className="catalog-toolbar panel models-toolbar">
        <SearchInput
          placeholder="Search model, brand, category, or description"
          value={search}
          onChange={onSearchChange}
        />
        <div className="models-summary">
          <span className="status-badge stock-ok">{role !== 'customer' && pager.loaded ? `${items.length} of ${pager.total.toLocaleString('en-IN')}` : items.length} models</span>
          {role !== 'customer' && loading && <span className="status-badge due">Loading</span>}
          {role !== 'customer' && <span className="status-badge due">Official inventory view</span>}
          {role === 'customer' && <span className="status-badge paid">Browse all added models</span>}
        </div>
      </div>

      <div className="table compact-models-table">
        {items.map((product) => (
          <div className="row compact-model-row" key={product.id}>
            <div className="inventory-primary">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                <Smartphone size={18} />
              </div>
              <span>
                <b>{productName(product)}</b>
                <small>{product.brand || 'No brand'}</small>
                <span className="model-row-description" title={product.description || 'No description provided'}>
                  <b>Description:</b> {product.description || 'No description provided'}
                </span>
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
              <small>Category</small>
              <span className="status-badge stock-ok">{product.category || 'Uncategorized'}</span>
            </span>
            <span className="inventory-metric">
              <small>Sale price</small>
              <strong>{priceLabel(product.sale_price)}</strong>
            </span>
            <div className="model-row-actions">
              {role === 'customer' && <small>{product.available_shops || 'Currently unavailable'}</small>}
              <button className="soft" type="button" onClick={() => onViewDetails(product)}>View details</button>
            </div>
          </div>
        ))}
        {!items.length && <Empty title="No matching models found" />}
      </div>

      {role !== 'customer' && (
        <Pagination
          meta={pager}
          loading={loading}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          totalLabel="models"
        />
      )}
    </section>
  );
}
