import React from 'react';
import { 
  Plus, 
  Copy, 
  Edit3, 
  Trash2, 
  Smartphone, 
  BatteryCharging, 
  Camera, 
  Volume2, 
  Zap, 
  Layers, 
  Package 
} from 'lucide-react';

// Title case formatter preserving hardware acronyms
const formatTitleCase = (str) => {
  if (!str) return '';
  const acronyms = new Set(['IP', 'IPHONE', 'PRO', 'MAX', 'PLUS', 'MINI', 'OLED', 'LCD', 'IC', 'WS', '5G', '4G', 'SE', 'AS', 'OG', 'CC', 'AMOLED', 'TFT']);
  return str.replace(/\b[A-Za-z0-9-]+\b/g, (word) => {
    const upper = word.toUpperCase();
    if (acronyms.has(upper)) return upper;
    if (upper.startsWith('IP') && upper.length > 2 && /\d/.test(upper)) return upper;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
};

// Margin calculation helper
const calculateMargin = (salePrice, purchasePrice) => {
  const sale = Number(salePrice || 0);
  const cost = Number(purchasePrice || 0);
  if (sale <= 0 || cost <= 0) return null;
  const profit = sale - cost;
  const marginPct = ((profit / sale) * 100).toFixed(1);
  return {
    profit,
    marginPct,
    isProfit: profit > 0,
    isNeutral: profit === 0,
    isLoss: profit < 0,
  };
};

// Brand cleaner
const cleanBrandName = (brand) => {
  const b = String(brand || '').trim();
  if (!b || b.toLowerCase() === 'generic' || b.toLowerCase() === 'no brand') return 'Generic';
  if (b.toLowerCase() === 'app' || b.toUpperCase() === 'APP') return 'Apple';
  return b;
};

// Non-redundant compatibility text
const getCleanCompatibility = (item) => {
  const full = String(item.full_model_list || item.compatible_models || '').trim();
  const short = String(item.short_name || '').trim();
  const name = String(item.name || '').trim();
  if (!full) return null;
  if (full.toLowerCase() === short.toLowerCase() || full.toLowerCase() === name.toLowerCase()) return null;
  return full;
};

// Category icon selector
const getCategoryIcon = (category = '') => {
  const cat = String(category || '').toLowerCase().trim();
  if (cat.includes('display') || cat.includes('screen') || cat.includes('combo') || cat.includes('touch') || cat.includes('folder') || cat.includes('oled') || cat.includes('lcd')) {
    return Smartphone;
  }
  if (cat.includes('battery') || cat.includes('cell') || cat.includes('power')) {
    return BatteryCharging;
  }
  if (cat.includes('camera') || cat.includes('lens') || cat.includes('cam')) {
    return Camera;
  }
  if (cat.includes('speaker') || cat.includes('ringer') || cat.includes('mic') || cat.includes('audio')) {
    return Volume2;
  }
  if (cat.includes('charging') || cat.includes('charge') || cat.includes('port') || cat.includes('flex')) {
    return Zap;
  }
  if (cat.includes('housing') || cat.includes('glass') || cat.includes('back glass') || cat.includes('frame')) {
    return Layers;
  }
  return Package;
};

/**
 * Modern High-Density SaaS Stock Item Card
 */
const StockCardItem = React.memo(function StockCardItem({
  item,
  data = {},
  role,
  productName = (it) => it.short_name || it.name || 'Product',
  priceLabel = (price) => price !== null && price !== undefined ? `₹${Number(price).toLocaleString('en-IN')}` : '—',
  onCloneProduct,
  onEditProduct,
  handleDeleteProductConfirm,
  setForms,
  setColorSplitQuantities,
  setIsSetStockOpen,
  setIsAddProductOpen,
  setEditingProductId,
  showCost = false,
}) {
  const shopThreshold = data.shops?.find((s) => s.id === item.shop_id)?.low_stock_threshold || 4;
  const isLowStock = item.quantity > 0 && item.quantity <= shopThreshold;
  const isOutOfStock = Number(item.quantity) === 0;
  const retailPrice = item.retail_price ?? item.sale_price ?? item.official_price;
  const wholesalePrice = item.wholesale_price;
  const hasRetailPrice = retailPrice !== null && retailPrice !== undefined && retailPrice !== '';
  const hasWholesalePrice = wholesalePrice !== null && wholesalePrice !== undefined && wholesalePrice !== '';
  const hasSalePrice = item.sale_price !== null && item.sale_price !== undefined && item.sale_price !== '';
  const marginInfo = calculateMargin(retailPrice || item.sale_price, item.purchase_price);
  const cleanBrand = cleanBrandName(item.brand);
  const compatText = getCleanCompatibility(item);
  const displayName = productName(item);
  const CategoryIcon = getCategoryIcon(item.part_category || item.category);

  // Quick Stock Action
  const handleAddStock = (e) => {
    e?.stopPropagation();
    if (setForms) {
      const prod = (data.products || []).find((p) => String(p.id) === String(item.product_id)) || item;
      setForms((prev) => ({
        ...prev,
        stock: {
          product_id: String(item.product_id),
          quantity: '',
          colour: '',
          purchase_price: prod?.purchase_price !== undefined && prod?.purchase_price !== null 
            ? String(prod.purchase_price) 
            : (prod?.avg_cost_price !== undefined && prod?.avg_cost_price !== null ? String(prod.avg_cost_price) : ''),
          sale_price: prod?.sale_price !== undefined && prod?.sale_price !== null 
            ? String(prod.sale_price) 
            : (prod?.retail_price !== undefined && prod?.retail_price !== null ? String(prod.retail_price) : ''),
          retail_price: prod?.retail_price !== undefined && prod?.retail_price !== null 
            ? String(prod.retail_price) 
            : (prod?.sale_price !== undefined && prod?.sale_price !== null ? String(prod.sale_price) : ''),
          supplier_id: prod?.supplier_id ? String(prod.supplier_id) : (item?.supplier_id ? String(item.supplier_id) : ''),
        },
      }));
    }
    if (setColorSplitQuantities) setColorSplitQuantities({});
    if (setIsSetStockOpen) setIsSetStockOpen(true);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  // Duplicate / Clone Action
  const handleClone = (e) => {
    e?.stopPropagation();
    if (onCloneProduct) {
      onCloneProduct(item);
    } else if (onEditProduct) {
      onEditProduct(item);
      if (setEditingProductId) setEditingProductId('');
    }
    if (setIsAddProductOpen) setIsAddProductOpen(true);
  };

  // Edit Action
  const handleEdit = (e) => {
    e?.stopPropagation();
    if (onEditProduct) onEditProduct(item);
    if (setIsAddProductOpen) setIsAddProductOpen(true);
  };

  // Delete Action
  const handleDelete = (e) => {
    e?.stopPropagation();
    if (handleDeleteProductConfirm) handleDeleteProductConfirm(item);
  };

  return (
    <div className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-4 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-3.5 overflow-hidden">
      {/* Upper Card Content */}
      <div className="space-y-2.5">
        {/* Header: Icon + Title + Pill Badges */}
        <div className="flex items-start gap-3 min-w-0">
          {/* Monochrome / subtle tinted icon wrapper */}
          {item.image_url ? (
            <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/50 flex items-center justify-center">
              <img
                src={item.image_url}
                alt={displayName}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('.icon-fallback');
                  if (fallback) fallback.classList.remove('hidden');
                }}
              />
              <div className="icon-fallback hidden w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                <CategoryIcon className="w-4 h-4" strokeWidth={1.8} />
              </div>
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 text-zinc-500 dark:text-zinc-400">
              <CategoryIcon className="w-4 h-4" strokeWidth={1.8} />
            </div>
          )}

          {/* Title & Metadata */}
          <div className="flex-1 min-w-0">
            <h4
              className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 truncate"
              title={displayName}
            >
              {formatTitleCase(displayName)}
            </h4>

            {/* Subtle semi-transparent pill badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {item.part_category || item.category || 'Display'}
              </span>
              {cleanBrand && (
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {cleanBrand}
                </span>
              )}
              {item.manufacturing_brand_name && (
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  Mfg: {item.manufacturing_brand_name}
                </span>
              )}
              {item.quality_variant && (
                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {item.quality_variant}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Variant Chips directly below header */}
        {item.colour_stock && Object.keys(item.colour_stock).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {Object.entries(item.colour_stock).map(([colName, colQty]) => (
              <span
                key={colName}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/50"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    Number(colQty) > 0 ? 'bg-emerald-500' : 'bg-rose-400'
                  }`}
                />
                <span>{colName}:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{colQty}</span>
              </span>
            ))}
          </div>
        )}

        {/* Compatibility note */}
        {compatText && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate" title={compatText}>
            Fits: <span className="text-zinc-600 dark:text-zinc-400 font-medium">{compatText}</span>
          </p>
        )}
      </div>

      {/* Lower Card Section: Metrics & Action Footer */}
      <div className="space-y-3">
        {/* Streamlined Split Row: Price & Stock Status */}
        <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80">
          <div>
            <span className="text-[10px] uppercase font-semibold text-zinc-400 dark:text-zinc-500 tracking-wider block leading-none mb-1.5">
              {showCost ? 'Price & Margin' : 'Selling Prices'}
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 uppercase">W/S</span>
                <span className="font-mono text-sm font-black text-indigo-700 dark:text-indigo-300 tracking-tight">
                  {hasWholesalePrice ? priceLabel(wholesalePrice) : '—'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 text-[8.5px] font-bold rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 uppercase">Ret</span>
                <span className="font-mono text-xs font-semibold text-zinc-600 dark:text-zinc-400 tracking-tight">
                  {hasRetailPrice ? priceLabel(retailPrice) : hasSalePrice ? priceLabel(item.sale_price) : '—'}
                </span>
              </div>
              {showCost && (role === 'superadmin' || role === 'owner') && marginInfo && (
                <span
                  className={`text-[10px] font-semibold px-1 py-0.5 rounded self-start mt-0.5 ${
                    marginInfo.isProfit
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : marginInfo.isLoss
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {marginInfo.isProfit ? `+${marginInfo.marginPct}%` : `${marginInfo.marginPct}%`}
                </span>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase font-semibold text-zinc-400 dark:text-zinc-500 tracking-wider block leading-none mb-1">
              Stock Status
            </span>
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200/50 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Out of Stock
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200/50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Low Stock ({item.quantity})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {item.quantity} in stock
              </span>
            )}
          </div>
        </div>

        {/* Action Footer: Sleek compact button on left, ghost icon group on right */}
        <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/80">
          {/* Left: Compact "+ Stock" Button */}
          <button
            type="button"
            onClick={handleAddStock}
            className="h-8 px-3 text-xs font-medium rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 inline-flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span>+ Stock</span>
          </button>

          {/* Right: Secondary Action Ghost Icons */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
            <button
              type="button"
              title="Duplicate / Clone"
              onClick={handleClone}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Edit Product"
              onClick={handleEdit}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer active:scale-95"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            {role === 'superadmin' && (
              <button
                type="button"
                title="Delete Product"
                onClick={handleDelete}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:text-zinc-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default StockCardItem;
