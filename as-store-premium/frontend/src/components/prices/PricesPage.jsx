import React, { useState, useMemo } from 'react';
import { 
  Download, 
  Trash2, 
  Search, 
  Eye, 
  EyeOff,
  MoreHorizontal, 
  Plus, 
  Minus, 
  PackagePlus, 
  X, 
  Check, 
  ArrowRight,
  RotateCcw,
  Tag,
  Truck,
  Calculator
} from 'lucide-react';
import ExpandableText from '../shared/ExpandableText';
import ProductThumbnail from '../ui/ProductThumbnail';
import { calculateConsolidatedProduct, consolidateProductList } from '../../utils/productConsolidation';

function getProductStockCount(product) {
  if (!product) return 0;
  
  // 1. Direct computed numbers or string numbers
  const direct = product.warehouse_stock ?? product.available_stock ?? product.quantity ?? product.stock_quantity ?? product.total_stock ?? product.stock;
  if (direct !== undefined && direct !== null && direct !== '') {
    const num = Number(direct);
    if (!isNaN(num) && num > 0) return num;
  }

  // 2. Aggregate from batch breakdown if available
  if (Array.isArray(product.batches) && product.batches.length > 0) {
    const sum = product.batches.reduce((acc, b) => acc + (Number(b.stock_qty ?? b.stock ?? b.quantity ?? b.quantity_remaining) || 0), 0);
    if (sum > 0) return sum;
  }
  if (Array.isArray(product.supplier_batches) && product.supplier_batches.length > 0) {
    const sum = product.supplier_batches.reduce((acc, b) => acc + (Number(b.stock_qty ?? b.stock ?? b.quantity ?? b.quantity_remaining) || 0), 0);
    if (sum > 0) return sum;
  }

  // 3. Aggregate from colour_stock if available
  if (Array.isArray(product.colour_stock) && product.colour_stock.length > 0) {
    const sum = product.colour_stock.reduce((acc, c) => acc + (Number(c.qty ?? c.stock ?? c.quantity) || 0), 0);
    if (sum > 0) return sum;
  }
  if (product.colour_stock && typeof product.colour_stock === 'object' && Object.keys(product.colour_stock).length > 0) {
    const sum = Object.values(product.colour_stock).reduce((acc, val) => acc + (Number(val) || 0), 0);
    if (sum > 0) return sum;
  }

  return Math.max(0, Number(direct || 0));
}

export default function PricesPage({
  role,
  shopId,
  shops = [],
  suppliers = [],
  stock = [],
  updateStock,
  showToast,
  saving = false,
  items = [],
  search = '',
  pager = {},
  loading = false,
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
}) {
  const [activeMenuId, setActiveMenuId] = useState(null);

  const normalizeString = (str) => {
    if (!str) return '';
    return String(str).toLowerCase().replace(/[\s\-_/\\+]/g, '');
  };

  // Consolidate identical products from different suppliers into unified entries and blend live stock
  const consolidatedItems = useMemo(() => {
    const stockMap = new Map();
    if (Array.isArray(stock) && stock.length > 0) {
      stock.forEach((s) => {
        const pId = String(s.product_id || s.id || '');
        if (pId) {
          const qty = Number(s.quantity ?? s.available_stock ?? s.stock ?? s.warehouse_stock ?? 0);
          stockMap.set(pId, Math.max(stockMap.get(pId) || 0, qty));
        }
      });
    }

    const enhancedItems = items.map((item) => {
      const pId = String(item.product_id || item.id || '');
      const liveStockQty = stockMap.get(pId);
      if (liveStockQty !== undefined && liveStockQty > 0) {
        return {
          ...item,
          available_stock: liveStockQty,
          warehouse_stock: liveStockQty,
          quantity: liveStockQty,
          stock_quantity: liveStockQty,
          total_stock: liveStockQty,
          stock: liveStockQty,
        };
      }
      return item;
    });

    const consolidated = consolidateProductList(enhancedItems);

    const query = String(search || '').trim();
    if (!query) return consolidated;

    // Split query into lowercase individual search terms
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    return consolidated.filter((product) => {
      // Build a searchable string combining all attributes
      const searchableHaystack = [
        product.name,
        product.short_name,
        product.product_name,
        product.model,
        product.title,
        product.brand,
        product.brand_name,
        product.company_brand_name,
        product.mfg_brand,
        product.mfg_brand_name,
        product.manufacturing_brand,
        product.manufacturing_brand_name,
        product.manufacturer,
        product.category,
        product.part_category,
        product.sub_category,
        product.quality,
        product.quality_variant,
        product.display_type,
        product.compatible_models,
        product.full_model_list,
        product.description,
        Array.isArray(product.colours) ? product.colours.join(' ') : (product.colours || ''),
        String(product.cost_price || product.cost || product.purchase_price || product.avg_cost_price || ''),
        String(product.wholesale_price || product.wholesale || ''),
        String(product.sale_price || product.price || product.retail_price || product.official_price || '')
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      // Match if EVERY typed token is present in the haystack
      return tokens.every((token) => searchableHaystack.includes(token));
    });
  }, [items, stock, search]);

  // Quick Stock Modal State
  const [stockProduct, setStockProduct] = useState(null);
  const [stockQty, setStockQty] = useState('10');
  const [stockAdjustmentMode, setStockAdjustmentMode] = useState('add'); // 'add' | 'set' | 'deduct'
  const [stockSupplierId, setStockSupplierId] = useState('');
  const [stockPurchasePrice, setStockPurchasePrice] = useState('');
  const [stockNotes, setStockNotes] = useState('');
  const [isSubmittingStock, setIsSubmittingStock] = useState(false);

  // Optimistic stock override tracker
  const [stockOverrides, setStockOverrides] = useState({});

  const isSuperAdmin = role === 'superadmin';
  const hasPurchase = isSuperAdmin;
  const isShopkeeper = role === 'shopkeeper' || role !== 'superadmin';

  // Wholesale Price Privacy Visibility
  // For shopkeepers, wholesale price is hidden by default until the eye button is clicked
  const [globalShowWholesale, setGlobalShowWholesale] = useState(!isShopkeeper);
  const [revealedWholesaleIds, setRevealedWholesaleIds] = useState(() => new Set());
  const [hiddenWholesaleIds, setHiddenWholesaleIds] = useState(() => new Set());

  const isWholesaleRevealed = (productId) => {
    const pId = String(productId || '');
    if (globalShowWholesale) {
      return !hiddenWholesaleIds.has(pId);
    }
    return revealedWholesaleIds.has(pId);
  };

  const toggleWholesaleVisibility = (productId) => {
    const pId = String(productId || '');
    if (globalShowWholesale) {
      setHiddenWholesaleIds((prev) => {
        const next = new Set(prev);
        if (next.has(pId)) next.delete(pId);
        else next.add(pId);
        return next;
      });
    } else {
      setRevealedWholesaleIds((prev) => {
        const next = new Set(prev);
        if (next.has(pId)) next.delete(pId);
        else next.add(pId);
        return next;
      });
    }
  };

  const toggleGlobalWholesale = () => {
    if (globalShowWholesale) {
      setGlobalShowWholesale(false);
      setRevealedWholesaleIds(new Set());
      setHiddenWholesaleIds(new Set());
    } else {
      setGlobalShowWholesale(true);
      setRevealedWholesaleIds(new Set());
      setHiddenWholesaleIds(new Set());
    }
  };

  // Cost Price Privacy Visibility (Super Admin)
  const [globalShowCost, setGlobalShowCost] = useState(true);
  const [revealedCostIds, setRevealedCostIds] = useState(() => new Set());
  const [hiddenCostIds, setHiddenCostIds] = useState(() => new Set());

  const isCostRevealed = (productId) => {
    const pId = String(productId || '');
    if (globalShowCost) {
      return !hiddenCostIds.has(pId);
    }
    return revealedCostIds.has(pId);
  };

  const toggleCostVisibility = (productId) => {
    const pId = String(productId || '');
    if (globalShowCost) {
      setHiddenCostIds((prev) => {
        const next = new Set(prev);
        if (next.has(pId)) next.delete(pId);
        else next.add(pId);
        return next;
      });
    } else {
      setRevealedCostIds((prev) => {
        const next = new Set(prev);
        if (next.has(pId)) next.delete(pId);
        else next.add(pId);
        return next;
      });
    }
  };

  const toggleGlobalCost = () => {
    if (globalShowCost) {
      setGlobalShowCost(false);
      setRevealedCostIds(new Set());
      setHiddenCostIds(new Set());
    } else {
      setGlobalShowCost(true);
      setRevealedCostIds(new Set());
      setHiddenCostIds(new Set());
    }
  };

  const selectedShopRecord = useMemo(() => {
    return shops.find((s) => String(s.id) === String(shopId));
  }, [shops, shopId]);

  const currentShopLabel = selectedShopRecord ? selectedShopRecord.name : (shopId ? 'Branch' : 'Warehouse');

  const getEffectiveStock = (product) => {
    if (!product) return 0;
    if (stockOverrides[product.id] !== undefined) {
      return stockOverrides[product.id];
    }
    return getProductStockCount(product);
  };

  const openStockModal = (product) => {
    setStockProduct(product);
    setStockQty('10');
    setStockAdjustmentMode('add');
    setStockSupplierId(product.supplier_id ? String(product.supplier_id) : '');
    setStockPurchasePrice(
      product.avg_cost_price !== undefined && product.avg_cost_price !== null
        ? String(product.avg_cost_price)
        : (product.purchase_price !== undefined && product.purchase_price !== null ? String(product.purchase_price) : '')
    );
    setStockNotes('');
  };

  const closeStockModal = () => {
    if (isSubmittingStock) return;
    setStockProduct(null);
  };

  const handleStockSubmit = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!stockProduct) return;

    const qty = Math.max(1, Number(stockQty) || 0);
    if (!stockQty || isNaN(qty) || qty <= 0) {
      if (showToast) showToast('Please enter a valid stock quantity greater than 0.');
      return;
    }

    const currentQty = getEffectiveStock(stockProduct);
    let resultingQty = currentQty;
    if (stockAdjustmentMode === 'add') resultingQty = currentQty + qty;
    else if (stockAdjustmentMode === 'deduct') resultingQty = Math.max(0, currentQty - qty);
    else resultingQty = qty;

    setIsSubmittingStock(true);

    // Apply immediate optimistic update
    setStockOverrides((prev) => ({ ...prev, [stockProduct.id]: resultingQty }));

    try {
      if (updateStock) {
        await updateStock({
          product_id: stockProduct.id,
          quantity: qty,
          adjustment_mode: stockAdjustmentMode,
          shop_id: shopId,
          supplier_id: stockSupplierId ? Number(stockSupplierId) : undefined,
          purchase_price: stockPurchasePrice ? Number(stockPurchasePrice) : undefined,
          notes: stockNotes ? stockNotes.trim() : undefined,
        });
      }

      if (showToast) {
        const actionLabel = stockAdjustmentMode === 'add' ? `Added +${qty} pcs` : stockAdjustmentMode === 'deduct' ? `Deducted -${qty} pcs` : `Set stock to ${qty} pcs`;
        showToast(`${actionLabel} for ${productName(stockProduct)}`);
      }
      setStockProduct(null);
    } catch (err) {
      console.error('[PricesPage Quick Stock Intake Error]', err);
      // Rollback optimistic update on error
      setStockOverrides((prev) => {
        const copy = { ...prev };
        delete copy[stockProduct.id];
        return copy;
      });
      if (showToast) showToast(err.message || 'Failed to update stock. Please try again.');
    } finally {
      setIsSubmittingStock(false);
    }
  };

  const currentStockForModal = stockProduct ? getEffectiveStock(stockProduct) : 0;
  const numStockQty = Math.max(0, Number(stockQty) || 0);
  let calculatedResultStock = currentStockForModal;
  if (stockAdjustmentMode === 'add') calculatedResultStock = currentStockForModal + numStockQty;
  else if (stockAdjustmentMode === 'deduct') calculatedResultStock = Math.max(0, currentStockForModal - numStockQty);
  else calculatedResultStock = numStockQty;

  // Computed KPI Metrics for Stock & Prices
  const totalStockUnits = useMemo(() => {
    if (Array.isArray(stock) && stock.length > 0) {
      return stock.reduce((sum, item) => sum + Number(item.quantity ?? item.available_stock ?? item.stock ?? item.warehouse_stock ?? 0), 0);
    }
    return consolidatedItems.reduce((sum, item) => sum + getEffectiveStock(item), 0);
  }, [stock, consolidatedItems, stockOverrides]);

  const stockRowsCount = Number(pager?.total || items?.length || consolidatedItems.length);
  const catalogModelsCount = consolidatedItems.length || stockRowsCount;

  const lowStockCount = useMemo(() => {
    return consolidatedItems.filter((item) => {
      const qty = getEffectiveStock(item);
      return qty > 0 && qty <= 4;
    }).length;
  }, [consolidatedItems, stockOverrides]);

  const outOfStockCount = useMemo(() => {
    return consolidatedItems.filter((item) => getEffectiveStock(item) === 0).length;
  }, [consolidatedItems, stockOverrides]);

  return (
    <div className="space-y-5 animate-fadeIn pb-12">
      {/* Floating KPI Stat Chips Bar */}
      <div className="kpi-chip-group">
        <div className="kpi-chip">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
          <span className="value">{totalStockUnits.toLocaleString('en-IN')}</span>
          <span className="label">Total Units</span>
        </div>
        <div className="kpi-chip">
          <span className="value">{stockRowsCount.toLocaleString('en-IN')}</span>
          <span className="label">Stock Rows</span>
        </div>
        {catalogModelsCount > 0 && (
          <div className="kpi-chip">
            <span className="value">{catalogModelsCount.toLocaleString('en-IN')}</span>
            <span className="label">Catalog Models</span>
          </div>
        )}
        {lowStockCount > 0 && (
          <div className="kpi-chip border-amber-200 bg-amber-50/60">
            <span className="value text-amber-700">{lowStockCount}</span>
            <span className="label text-amber-800">Low Stock</span>
          </div>
        )}
        {outOfStockCount > 0 && (
          <div className="kpi-chip border-rose-200 bg-rose-50/60">
            <span className="value text-rose-700">{outOfStockCount}</span>
            <span className="label text-rose-800">Out of Stock</span>
          </div>
        )}
      </div>

      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search catalog or models..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ paddingLeft: '42px', paddingRight: search ? '36px' : '16px' }}
            className="w-full !pl-11 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 placeholder-gray-400 transition-all shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full cursor-pointer z-10"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
          {hasPurchase && (
            <button
              type="button"
              onClick={toggleGlobalCost}
              className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                globalShowCost
                  ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-rose-700'
              }`}
              title={globalShowCost ? "Hide all cost prices" : "Reveal all cost prices"}
            >
              {globalShowCost ? (
                <EyeOff className="w-3.5 h-3.5 text-rose-600" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>{globalShowCost ? 'Hide Cost' : 'Show Cost'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleGlobalWholesale}
            className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer ${
              globalShowWholesale
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-700'
            }`}
            title={globalShowWholesale ? "Hide all wholesale prices" : "Reveal all wholesale prices"}
          >
            {globalShowWholesale ? (
              <EyeOff className="w-3.5 h-3.5 text-indigo-600" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>{globalShowWholesale ? 'Hide Wholesale' : 'Show Wholesale'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (typeof onExportProducts === 'function') {
                onExportProducts(consolidatedItems);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 hover:border-emerald-300 transition-all shadow-2xs cursor-pointer"
            title="Download consolidated Stock Prices spreadsheet (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Main Stock & Price Table View */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-semibold text-xs animate-pulse">
            Loading consolidated product catalog...
          </div>
        ) : consolidatedItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-medium text-xs">
            No products found matching your search.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {consolidatedItems.map((product) => {
              const stockQtyVal = getEffectiveStock(product);
              const isOutOfStock = stockQtyVal <= 0;
              const isLowStock = stockQtyVal > 0 && stockQtyVal <= 4;
              const displayCostPrice = product.avg_cost_price ?? product.purchase_price;
              const associatedSups = product.associated_suppliers || [];
              const isCostShown = isCostRevealed(product.id);
              const isWholesaleShown = isWholesaleRevealed(product.id);

              return (
                <div 
                  key={product.id} 
                  className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col lg:grid lg:grid-cols-12 gap-3 items-center group relative"
                >
                  {/* Column 1: Image & Identity (lg:col-span-5) */}
                  <div className="w-full lg:col-span-5 flex items-start gap-3.5 min-w-0">
                    <div className="shrink-0 pt-0.5">
                      <ProductThumbnail
                        src={product.image_url}
                        imageUrl={product.image_url}
                        imageUrls={product.image_urls}
                        alt={productName(product)}
                        category={product.part_category || product.category || 'Display'}
                        size={48}
                        rounded="12px"
                        showZoom={false}
                      />
                    </div>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onViewDetails(product)}
                          className="font-black text-slate-900 hover:text-cyan-700 text-sm text-left truncate max-w-full transition-colors cursor-pointer"
                          title="View Product Specifications"
                        >
                          {productName(product)}
                        </button>

                        {/* Quality Variant Pill */}
                        {(product.quality_variant || product.product_variant_name) && (
                          <span className="px-2 py-0.5 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-800 text-[10px] font-black uppercase tracking-wider shrink-0">
                            {product.quality_variant || product.product_variant_name}
                          </span>
                        )}

                        {/* Multi-Supplier Consolidated Badge */}
                        {associatedSups.length > 1 && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-extrabold shrink-0" title={`Aggregated across ${associatedSups.join(', ')}`}>
                            {associatedSups.length} Suppliers
                          </span>
                        )}
                      </div>

                      {/* Brand, Part Category & Supplier Meta Line */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 font-medium flex-wrap">
                        <span className="font-bold text-slate-700">{product.brand || 'Generic'}</span>
                        <span className="text-slate-300">•</span>
                        <span>{product.part_category || product.category || 'Display'}</span>
                        {product.manufacturing_brand_name && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-slate-600">Mfg: {product.manufacturing_brand_name}</span>
                          </>
                        )}
                        {associatedSups.length > 0 && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="font-semibold text-blue-600">
                              {associatedSups.length === 1 ? `Supplier: ${associatedSups[0]}` : `Suppliers: ${associatedSups.slice(0, 2).join(', ')}${associatedSups.length > 2 ? '...' : ''}`}
                            </span>
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
                    {/* Available Stock with Interactive Quick Click Trigger */}
                    <div className="flex flex-col justify-center items-end">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block" title={`Stock in ${currentShopLabel}`}>
                        {currentShopLabel} Stock
                      </span>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openStockModal(product);
                        }}
                        title={isOutOfStock ? `0 pcs in ${currentShopLabel} — Click to quick add stock` : `${stockQtyVal} pcs in ${currentShopLabel} — Click to quick add stock`}
                        className={`text-[10px] font-black px-2 py-0.5 rounded-lg border mt-1 inline-flex items-center gap-1 shadow-xs cursor-pointer hover:ring-2 hover:ring-emerald-400/50 transition-all ${
                          isOutOfStock
                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            : isLowStock
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                        }`} />
                        <span className="truncate max-w-[70px]">
                          {isOutOfStock ? '0 Out' : `${stockQtyVal} pcs`}
                        </span>
                        <Plus className="w-2.5 h-2.5 opacity-60 ml-0.5" />
                      </button>
                    </div>

                    {/* Cost / Purchase Price (Super Admin only - Weighted Average) */}
                    {hasPurchase && (
                      <div className="flex flex-col justify-center">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Cost</span>
                          {associatedSups.length > 1 && (
                            <span className="text-[8px] font-bold text-rose-600 bg-rose-50 px-1 py-0.2 rounded">Avg</span>
                          )}
                        </div>
                        {isCostShown ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCostVisibility(product.id);
                            }}
                            title="Click to hide cost price"
                            className="text-sm font-semibold text-rose-700 hover:text-rose-800 mt-0.5 inline-flex items-center justify-end gap-1 transition-colors cursor-pointer"
                          >
                            <span>{priceLabel(displayCostPrice)}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCostVisibility(product.id);
                            }}
                            title="Click to reveal cost price"
                            className="text-xs font-mono font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50/60 px-1.5 py-0.5 rounded transition-all cursor-pointer inline-flex items-center justify-end gap-1 self-end mt-0.5"
                          >
                            <span className="tracking-widest">••••••</span>
                            <Eye className="w-3 h-3 opacity-60" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Wholesale Price */}
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Wholesale</span>
                      {isWholesaleShown ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWholesaleVisibility(product.id);
                          }}
                          title="Click to hide wholesale price"
                          className="text-sm font-semibold text-slate-700 hover:text-indigo-600 mt-0.5 inline-flex items-center justify-end gap-1 transition-colors cursor-pointer"
                        >
                          <span>{priceLabel(product.wholesale_price)}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWholesaleVisibility(product.id);
                          }}
                          title="Click to reveal wholesale price"
                          className="text-xs font-mono font-bold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/60 px-1.5 py-0.5 rounded transition-all cursor-pointer inline-flex items-center justify-end gap-1 self-end mt-0.5"
                        >
                          <span className="tracking-widest">••••••</span>
                          <Eye className="w-3 h-3 opacity-60" />
                        </button>
                      )}
                    </div>

                    {/* Sale Price */}
                    <div className="flex flex-col justify-center">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Sale</span>
                      <span className="text-sm font-black text-emerald-700 mt-0.5">{priceLabel(product.sale_price)}</span>
                    </div>
                  </div>

                  {/* Column 3: Actions controls (lg:col-span-2) */}
                  <div className="w-full lg:col-span-2 flex items-center justify-start lg:justify-end gap-1.5 mt-2 lg:mt-0 flex-wrap">
                    {/* Inline Quick Add Stock Action */}
                    <button
                      type="button"
                      title="Quick Add Stock"
                      onClick={(e) => {
                        e.stopPropagation();
                        openStockModal(product);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-all text-xs font-bold flex items-center gap-1 shadow-xs active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Stock
                    </button>

                    <button
                      type="button"
                      onClick={() => onViewDetails(product)}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all text-xs font-semibold shadow-sm active:scale-95 cursor-pointer"
                    >
                      View
                    </button>

                    {/* Eye toggle button at the end of the row */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWholesaleVisibility(product.id);
                      }}
                      title={isWholesaleShown ? "Hide Wholesale Price" : "Show Wholesale Price"}
                      className={`p-1.5 rounded-lg border transition-all cursor-pointer active:scale-95 flex items-center justify-center ${
                        isWholesaleShown
                          ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 shadow-2xs'
                          : 'bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 border-slate-200 shadow-2xs'
                      }`}
                    >
                      {isWholesaleShown ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === product.id ? null : product.id);
                        }}
                        className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 transition-all cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {activeMenuId === product.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-20" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(null);
                            }} 
                          />
                          <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 text-xs">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(null);
                                onCloneProduct(product);
                              }}
                              className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2 cursor-pointer"
                            >
                              Clone Model
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(null);
                                onEditProduct(product);
                              }}
                              className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 font-medium flex items-center gap-2 cursor-pointer"
                            >
                              Edit Details
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(null);
                                  onDeleteProduct(product);
                                }}
                                className="w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50 font-medium flex items-center gap-2 cursor-pointer border-t border-slate-100"
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
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* QUICK INLINE STOCK INTAKE / ADJUSTMENT MODAL DIALOG                       */}
      {/* ========================================================================= */}
      {stockProduct && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fadeIn"
          onClick={closeStockModal}
        >
          <div 
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-scaleUp my-auto max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
                  <PackagePlus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Quick Stock Adjustment</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Record intake or adjust inventory count</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={closeStockModal}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleStockSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
              
              {/* Product Reference Card */}
              <div className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/80 flex items-center gap-3">
                <ProductThumbnail
                  src={stockProduct.image_url}
                  imageUrl={stockProduct.image_url}
                  imageUrls={stockProduct.image_urls}
                  alt={productName(stockProduct)}
                  category={stockProduct.part_category || stockProduct.category || 'Display'}
                  size={42}
                  rounded="10px"
                  showZoom={false}
                />
                <div className="min-w-0 flex-1">
                  <span className="font-extrabold text-slate-900 text-xs truncate block">{productName(stockProduct)}</span>
                  <span className="text-[10px] text-slate-500 font-semibold block mt-0.5 truncate">
                    {stockProduct.brand || 'Generic'} · {stockProduct.part_category || stockProduct.category || 'Display'}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Retail</span>
                  <span className="text-xs font-black text-emerald-700 block">
                    {priceLabel(stockProduct.sale_price)}
                  </span>
                </div>
              </div>

              {/* Segmented Pill Control for Adjustment Mode */}
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1.5 text-center">
                  Adjustment Mode
                </label>
                <div className="p-1 bg-slate-100/90 rounded-2xl flex items-center gap-1 border border-slate-200/50">
                  <button
                    type="button"
                    onClick={() => setStockAdjustmentMode('add')}
                    className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                      stockAdjustmentMode === 'add'
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Add Stock (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockAdjustmentMode('set')}
                    className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                      stockAdjustmentMode === 'set'
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" /> Set Total (=)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockAdjustmentMode('deduct')}
                    className={`flex-1 py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                      stockAdjustmentMode === 'deduct'
                        ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    <Minus className="w-3.5 h-3.5 stroke-[2.5]" /> Deduct (-)
                  </button>
                </div>
              </div>

              {/* Hero Quantity Card with Interactive Stepper */}
              <div className="py-2 px-4 rounded-2xl bg-gradient-to-b from-slate-50 to-white border border-slate-200/80 shadow-xs flex flex-col items-center justify-center space-y-3">
                <div className="flex items-center justify-center gap-4 w-full pt-1">
                  {/* Minus Stepper Button */}
                  <button
                    type="button"
                    title="Decrease quantity by 1"
                    onClick={() => setStockQty((prev) => String(Math.max(1, (Number(prev) || 1) - 1)))}
                    className="w-11 h-11 rounded-2xl bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-100 hover:border-slate-300 active:scale-90 flex items-center justify-center shadow-xs transition-all cursor-pointer"
                  >
                    <Minus className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  {/* Centered Hero Numerical Typography */}
                  <div className="flex items-baseline justify-center gap-1.5 min-w-[130px]">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      autoFocus
                      value={stockQty}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => setStockQty(e.target.value)}
                      className={`w-28 text-center text-4xl font-black font-mono bg-transparent outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none selection:bg-emerald-500 selection:text-white ${
                        stockAdjustmentMode === 'add'
                          ? 'text-emerald-600 focus:text-emerald-700'
                          : stockAdjustmentMode === 'deduct'
                          ? 'text-rose-600 focus:text-rose-700'
                          : 'text-amber-600 focus:text-amber-700'
                      }`}
                      placeholder="10"
                    />
                    <span className="text-xs font-black uppercase text-slate-400 tracking-wider">pcs</span>
                  </div>

                  {/* Plus Stepper Button */}
                  <button
                    type="button"
                    title="Increase quantity by 1"
                    onClick={() => setStockQty((prev) => String((Number(prev) || 0) + 1))}
                    className="w-11 h-11 rounded-2xl bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-100 hover:border-slate-300 active:scale-90 flex items-center justify-center shadow-xs transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>

                {/* Real-time Dynamic Feedback Calculation Badge */}
                <div className="flex items-center justify-center pb-1">
                  <div className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold border transition-all shadow-xs ${
                    stockAdjustmentMode === 'add'
                      ? 'bg-emerald-50 border-emerald-200/80 text-emerald-800'
                      : stockAdjustmentMode === 'deduct'
                      ? 'bg-rose-50 border-rose-200/80 text-rose-800'
                      : 'bg-amber-50 border-amber-200/80 text-amber-800'
                  }`}>
                    <span className="text-slate-500 font-medium">Current: <strong className="text-slate-800 font-bold">{currentStockForModal} pcs</strong></span>
                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Result: <strong className="font-extrabold">{calculatedResultStock} pcs</strong></span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                      stockAdjustmentMode === 'add' 
                        ? 'bg-emerald-200/80 text-emerald-900' 
                        : stockAdjustmentMode === 'deduct' 
                        ? 'bg-rose-200/80 text-rose-900' 
                        : 'bg-amber-200/80 text-amber-900'
                    }`}>
                      {stockAdjustmentMode === 'add' ? `+${numStockQty}` : stockAdjustmentMode === 'deduct' ? `-${numStockQty}` : `=${numStockQty}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Interactive Quick-Pill Badges */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {[5, 10, 20, 50, 100].map((num) => (
                    <button
                      type="button"
                      key={num}
                      onClick={() => {
                        if (stockAdjustmentMode === 'add') {
                          setStockQty((prev) => String((Number(prev) || 0) + num));
                        } else {
                          setStockQty(String(num));
                        }
                      }}
                      className="bg-slate-100 hover:bg-emerald-500 hover:text-white transition-all text-xs font-semibold text-slate-700 py-1 px-3 rounded-full shadow-xs active:scale-95 cursor-pointer"
                    >
                      +{num}
                    </button>
                  ))}
                  <button
                    type="button"
                    title="Reset quantity to 10"
                    onClick={() => setStockQty('10')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all text-xs font-semibold py-1 px-2.5 rounded-full shadow-xs active:scale-95 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                </div>
              </div>

              {/* Supplier & Cost Price Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block mb-1">
                    Supplier (Optional)
                  </label>
                  <select
                    value={stockSupplierId}
                    onChange={(e) => setStockSupplierId(e.target.value)}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                  >
                    <option value="">Direct Stock / Default</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {isSuperAdmin && (
                  <div>
                    <label className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider block mb-1">
                      Batch Unit Cost (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 390"
                      value={stockPurchasePrice}
                      onChange={(e) => setStockPurchasePrice(e.target.value)}
                      className="w-full h-9 px-3 bg-rose-50/40 border border-rose-200 rounded-xl text-xs font-bold text-rose-900 outline-none focus:border-rose-400 focus:bg-white transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Live Blended Weighted Cost Calculation Preview */}
              {isSuperAdmin && stockAdjustmentMode === 'add' && numStockQty > 0 && stockPurchasePrice && (
                <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200/70 text-xs text-indigo-950 flex items-start gap-2">
                  <Calculator className="w-3.5 h-3.5 text-indigo-600 mt-0.5 shrink-0" />
                  <div className="text-[11px] leading-relaxed">
                    {(() => {
                      const curQty = currentStockForModal;
                      const curCost = Number(stockProduct.avg_cost_price || stockProduct.purchase_price || 0);
                      const addQty = numStockQty;
                      const addCost = Number(stockPurchasePrice || 0);
                      const totQty = curQty + addQty;
                      const newBlendedCost = totQty > 0 ? ((curQty * curCost) + (addQty * addCost)) / totQty : addCost;
                      return (
                        <span>
                          Current Avg: {priceLabel(curCost)} ({curQty} pcs) → <strong>New Blended Avg Cost: {priceLabel(Math.round(newBlendedCost * 100) / 100)}</strong> ({totQty} pcs)
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Clean Layout Intake Note / Reference Input */}
              <div className="space-y-1 pt-0.5">
                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Intake Note / Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received new consignment, batch invoice #402"
                  value={stockNotes}
                  onChange={(e) => setStockNotes(e.target.value)}
                  className="w-full h-9.5 px-3.5 bg-slate-50/80 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-500 focus:bg-white transition-all"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmittingStock}
                  onClick={closeStockModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStock || !stockQty || Number(stockQty) <= 0}
                  className={`px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                    stockAdjustmentMode === 'add'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                      : stockAdjustmentMode === 'deduct'
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/25'
                      : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/25'
                  }`}
                >
                  {isSubmittingStock ? (
                    'Updating Stock...'
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      {stockAdjustmentMode === 'add' 
                        ? `Confirm +${numStockQty} Stock` 
                        : stockAdjustmentMode === 'deduct' 
                        ? `Confirm Deduct -${numStockQty} Stock` 
                        : `Confirm Set to ${numStockQty} Stock`}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
