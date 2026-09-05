import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Smartphone, 
  LayoutGrid, 
  Table,
  Send, 
  Filter, 
  Plus, 
  Trash2, 
  Edit3, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Printer, 
  Save, 
  RefreshCw, 
  X, 
  HelpCircle, 
  Check, 
  ArrowRight,
  Settings,
  AlertCircle,
  Search,
  PackagePlus,
  Copy,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Percent,
  Layers,
  Boxes,
  SlidersHorizontal,
  Sliders,
  Sparkles,
  Zap,
  BatteryCharging,
  Camera,
  Volume2,
  Store,
  PackageCheck
} from 'lucide-react';
import Pagination from '../ui/Pagination';
import SearchFilter from '../shared/SearchFilter';
import ExpandableText from '../shared/ExpandableText';
import ProductThumbnail from '../ui/ProductThumbnail';
import ProductImageUpload from '../ui/ProductImageUpload';
import QuickAddReferenceModal from '../modals/QuickAddReferenceModal';
import SearchableCombobox from '../ui/SearchableCombobox';

// Helper to format title case cleanly without destroying hardware acronyms
const formatTitleCase = (str) => {
  if (!str) return '';
  const acronyms = new Set(['IP', 'IPHONE', 'PRO', 'MAX', 'PLUS', 'MINI', 'OLED', 'LCD', 'IC', 'WS', '5G', '4G', 'SE', 'AS', 'OG', 'CC', 'AMOLED', 'TFT']);
  return str.replace(/\b[A-Za-z0-9-]+\b/g, (word) => {
    const upper = word.toUpperCase();
    if (acronyms.has(upper)) return upper;
    if (upper.startsWith('IP') && upper.length > 2 && /\d/.test(upper)) return upper; // e.g. IP11, IP6G
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
};

// Helper to calculate profit margin
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

// Helper to normalize brand presentation
const cleanBrandName = (brand) => {
  const b = String(brand || '').trim();
  if (!b || b.toLowerCase() === 'generic' || b.toLowerCase() === 'no brand') return 'Generic';
  if (b.toLowerCase() === 'app' || b.toUpperCase() === 'APP') return 'Apple';
  return b;
};

// Helper to get clean, non-redundant compatibility text
const getCleanCompatibility = (item) => {
  const full = String(item.full_model_list || '').trim();
  const short = String(item.short_name || '').trim();
  const name = String(item.name || '').trim();
  if (!full) return null;
  if (full.toLowerCase() === short.toLowerCase() || full.toLowerCase() === name.toLowerCase()) return null;
  return full;
};

// Memoized Table Row for 60 FPS scrolling
const StockTableRow = React.memo(function StockTableRow({
  item,
  data,
  role,
  shopId,
  productName,
  priceLabel,
  onCloneProduct,
  onEditProduct,
  handleDeleteProductConfirm,
  setForms,
  setColorSplitQuantities,
  setIsSetStockOpen,
  setIsAddProductOpen,
  setEditingProductId,
}) {
  const isLowStock = item.quantity > 0 && item.quantity <= (data.shops?.find(s => s.id === item.shop_id)?.low_stock_threshold || 4);
  const isOutOfStock = Number(item.quantity) === 0;
  const isWarehouseRow = item.location_type === 'warehouse' || String(item.shop_id) === String(data.warehouse?.id);

  const hasSalePrice = item.sale_price !== null && item.sale_price !== undefined && item.sale_price !== '';
  const hasPurchasePrice = item.purchase_price !== null && item.purchase_price !== undefined && item.purchase_price !== '';
  const marginInfo = calculateMargin(item.sale_price, item.purchase_price);
  const cleanBrand = cleanBrandName(item.brand);
  const compatText = getCleanCompatibility(item);

  return (
    <tr 
      className={`stock-table-row-enhanced ${isOutOfStock ? 'out-of-stock-highlight' : isLowStock ? 'low-stock-highlight' : ''}`} 
      key={item.id}
    >
      {/* Product Name, Thumbnail, Model */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <ProductThumbnail
            src={item.image_url}
            alt={productName(item)}
            category={item.part_category || item.category || 'Display'}
            size={44}
            rounded="14px"
          />
          <div className="flex flex-col min-w-0">
            <span className="text-sm text-slate-900 font-extrabold leading-snug break-words">
              {formatTitleCase(productName(item))}
            </span>
            
            {compatText && (
              <div className="mt-0.5">
                <ExpandableText
                  className="text-[11.5px] text-slate-500 font-semibold leading-relaxed"
                  text={`Compatible: ${compatText}`}
                  limit={55}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="badge-subtle badge-subtle-slate font-bold">
                {cleanBrand}
              </span>
              {item.quality_variant && (
                <span className="badge-subtle badge-subtle-teal font-extrabold">
                  {item.quality_variant}
                </span>
              )}
              {!shopId && (
                <span className="text-slate-400 text-[10.5px] font-medium">· {item.shop_name}</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Category & MFG Brand */}
      <td className="py-3.5 px-4">
        <div className="flex flex-col gap-1 items-start">
          <span className="badge-subtle badge-subtle-teal">
            {item.category || 'Display'}
          </span>
          {item.manufacturing_brand_name && (
            <span className="badge-subtle badge-subtle-emerald font-bold">
              Mfg: {item.manufacturing_brand_name}
            </span>
          )}
          {item.supplier_name && (
            <span className="badge-subtle badge-subtle-blue">
              {item.supplier_name}
            </span>
          )}
        </div>
      </td>

      {/* Variants & Colours */}
      <td className="py-3.5 px-4">
        <div className="text-xs">
          {item.colour_stock && Object.keys(item.colour_stock).length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {Object.entries(item.colour_stock).map(([colName, colQty]) => (
                <span
                  key={colName}
                  className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold border ${
                    Number(colQty) > 0 
                      ? 'bg-teal-50/80 text-teal-800 border-teal-200' 
                      : 'bg-rose-50/80 text-rose-700 border-rose-200'
                  }`}
                >
                  {colName}: <b>{colQty}</b>
                </span>
              ))}
            </div>
          ) : Array.isArray(item.colours) && item.colours.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {item.colours.map((col, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg text-[10.5px] font-semibold text-slate-700">
                  {col}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-slate-400 text-xs font-semibold italic">Standard</span>
          )}
        </div>
      </td>

      {/* Price & Margin */}
      <td className="py-3.5 px-4">
        <div className="flex flex-col gap-0.5">
          {hasSalePrice ? (
            <strong className="text-base font-black text-slate-900 tracking-tight">
              {priceLabel(item.sale_price)}
            </strong>
          ) : (
            <span className="text-[10px] text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded self-start font-bold uppercase">
              No Price
            </span>
          )}

          {role === 'superadmin' && (
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {hasPurchasePrice && (
                <small className="text-[10.5px] text-slate-500 font-medium">
                  Cost: <b className="text-slate-700">{priceLabel(item.purchase_price)}</b>
                </small>
              )}
              {marginInfo && (
                <span className={`margin-pill ${marginInfo.isProfit ? 'profit' : marginInfo.isLoss ? 'loss' : 'neutral'}`}>
                  {marginInfo.isProfit ? `+${marginInfo.marginPct}%` : `${marginInfo.marginPct}%`}
                </span>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Stock Health */}
      <td className="py-3.5 px-4">
        <div className="flex flex-col gap-1 items-start">
          {isOutOfStock ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Out of Stock
            </span>
          ) : isLowStock ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span> Low Stock ({item.quantity})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {item.quantity} pcs
            </span>
          )}

          <small className="text-[10px] text-slate-500 font-semibold">
            {isWarehouseRow ? 'Warehouse' : role === 'shopkeeper' ? 'Branch' : 'Owner'}: <b className="text-slate-700">{item.owner_quantity}</b> · Assigned: <b className="text-slate-700">{role === 'shopkeeper' ? item.my_quantity : item.shopkeeper_quantity}</b>
          </small>
        </div>
      </td>

      {/* Actions */}
      <td className="py-3.5 px-4 text-right">
        <div className="flex gap-1.5 justify-end items-center">
          <button
            type="button"
            title="Set Stock Level"
            onClick={() => {
              setForms((prev) => ({
                ...prev,
                stock: { 
                  product_id: String(item.product_id), 
                  quantity: '',
                  colour: '' 
                }
              }));
              setColorSplitQuantities({});
              setIsSetStockOpen(true);
              window.scrollTo({ top: 120, behavior: 'smooth' });
            }}
            className="px-2.5 py-1.5 text-xs bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold rounded-xl shadow-xs active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
          >
            <Plus size={13} strokeWidth={2.5} /> Stock
          </button>
          
          <button
            type="button"
            title="Clone Product"
            onClick={() => {
              if (onCloneProduct) onCloneProduct(item);
              else if (onEditProduct) { onEditProduct(item); setEditingProductId(''); }
              setIsAddProductOpen(true);
            }}
            className="stock-action-icon-btn bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200"
          >
            <Copy size={13} />
          </button>

          <button
            type="button"
            title="Edit Product Details"
            onClick={() => { onEditProduct(item); setIsAddProductOpen(true); }}
            className="stock-action-icon-btn bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
          >
            <Edit3 size={13} />
          </button>

          {role === 'superadmin' && (
            <button
              type="button"
              title="Delete Product"
              onClick={() => handleDeleteProductConfirm(item)}
              className="stock-action-icon-btn bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

// Memoized Card Item for 60 FPS grid view
const StockCardItem = React.memo(function StockCardItem({
  item,
  data,
  role,
  productName,
  priceLabel,
  onCloneProduct,
  onEditProduct,
  handleDeleteProductConfirm,
  setForms,
  setColorSplitQuantities,
  setIsSetStockOpen,
  setIsAddProductOpen,
  setEditingProductId,
}) {
  const isLowStock = item.quantity > 0 && item.quantity <= (data.shops?.find(s => s.id === item.shop_id)?.low_stock_threshold || 4);
  const isOutOfStock = Number(item.quantity) === 0;
  const hasSalePrice = item.sale_price !== null && item.sale_price !== undefined && item.sale_price !== '';
  const hasPurchasePrice = item.purchase_price !== null && item.purchase_price !== undefined && item.purchase_price !== '';
  const marginInfo = calculateMargin(item.sale_price, item.purchase_price);
  const cleanBrand = cleanBrandName(item.brand);
  const compatText = getCleanCompatibility(item);

  return (
    <div 
      className={`bg-white border rounded-2xl p-5 shadow-xs hover:shadow-lg transition-all duration-200 flex flex-col justify-between gap-4 relative overflow-hidden ${
        isOutOfStock 
          ? 'border-rose-200 hover:border-rose-300' 
          : isLowStock 
            ? 'border-amber-200 hover:border-amber-300' 
            : 'border-slate-200/90 hover:border-teal-300'
      }`}
    >
      {/* Top Status Border Accent */}
      <div className={`absolute top-0 left-0 right-0 h-1.5 ${
        isOutOfStock ? 'bg-rose-500' : isLowStock ? 'bg-amber-500' : 'bg-gradient-to-r from-teal-500 to-emerald-500'
      }`} />

      {/* Header: Thumbnail + Title + Badges */}
      <div className="flex items-start gap-3.5 pt-1">
        <ProductThumbnail
          src={item.image_url}
          alt={productName(item)}
          category={item.part_category || item.category || 'Display'}
          size={48}
          rounded="14px"
        />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-black text-slate-900 leading-snug break-words">
            {formatTitleCase(productName(item))}
          </h4>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="badge-subtle badge-subtle-teal">{item.category || 'Display'}</span>
            <span className="badge-subtle badge-subtle-slate">{cleanBrand}</span>
            {item.manufacturing_brand_name && (
              <span className="badge-subtle badge-subtle-emerald">Mfg: {item.manufacturing_brand_name}</span>
            )}
            {item.quality_variant && (
              <span className="badge-subtle badge-subtle-blue">{item.quality_variant}</span>
            )}
          </div>
        </div>
      </div>

      {/* Compatible Models */}
      {compatText && (
        <div className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 font-semibold">
          <ExpandableText text={`Fits: ${compatText}`} limit={55} />
        </div>
      )}

      {/* Colours */}
      {item.colour_stock && Object.keys(item.colour_stock).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(item.colour_stock).map(([colName, colQty]) => (
            <span
              key={colName}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                Number(colQty) > 0 ? 'bg-teal-50 text-teal-800 border-teal-200' : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {colName}: <b>{colQty}</b>
            </span>
          ))}
        </div>
      )}

      {/* Metric Box: Price vs Stock */}
      <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Price</span>
          <strong className="text-base font-black text-slate-900">{priceLabel(item.sale_price)}</strong>
          {role === 'superadmin' && marginInfo && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`margin-pill ${marginInfo.isProfit ? 'profit' : marginInfo.isLoss ? 'loss' : 'neutral'}`}>
                {marginInfo.isProfit ? `+${marginInfo.marginPct}%` : `${marginInfo.marginPct}%`}
              </span>
            </div>
          )}
        </div>

        <div className="text-right">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Stock Level</span>
          {isOutOfStock ? (
            <span className="badge-subtle badge-subtle-rose font-black">Out of Stock</span>
          ) : isLowStock ? (
            <span className="badge-subtle badge-subtle-amber font-black">⚠️ {item.quantity} pcs</span>
          ) : (
            <span className="badge-subtle badge-subtle-teal font-black">🟢 {item.quantity} pcs</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setForms((prev) => ({
              ...prev,
              stock: { 
                product_id: String(item.product_id), 
                quantity: '',
                colour: '' 
              }
            }));
            setColorSplitQuantities({});
            setIsSetStockOpen(true);
            window.scrollTo({ top: 120, behavior: 'smooth' });
          }}
          className="flex-1 py-2 text-xs bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold rounded-xl shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus size={14} strokeWidth={2.5} /> Add Stock
        </button>
        <button
          type="button"
          title="Clone"
          onClick={() => {
            if (onCloneProduct) onCloneProduct(item);
            else if (onEditProduct) { onEditProduct(item); setEditingProductId(''); }
            setIsAddProductOpen(true);
          }}
          className="stock-action-icon-btn bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200"
        >
          <Copy size={13} />
        </button>
        <button
          type="button"
          title="Edit"
          onClick={() => { onEditProduct(item); setIsAddProductOpen(true); }}
          className="stock-action-icon-btn bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
        >
          <Edit3 size={13} />
        </button>
        {role === 'superadmin' && (
          <button
            type="button"
            title="Delete"
            onClick={() => handleDeleteProductConfirm(item)}
            className="stock-action-icon-btn bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
});

export default function StockPage({
  role,
  shopId,
  forms = {},
  setForms,
  data = {},
  ownerInventoryQuantity,
  myInventoryQuantity,
  updateStock,
  setTransferDrawerOpen,
  stockFilters,
  setStockFilters,
  stockPager,
  pageLoading,
  setStockPager,
  onStockPageSizeChange,
  setSelectedProductDetails,
  productName,
  fullModelList,
  priceLabel,
  onSubmitProduct,
  onEditProduct,
  onCloneProduct,
  onDeleteProduct,
  onAddReferenceOption,
  onEditReferenceOption,
  onDeleteReferenceOption,
  editingProductId,
  setEditingProductId,
  saving,
  setSaving,
  initialForms,
  exportCsv,
  exportExcel,
  onPrintStock,
  stockWithOwnership,
  FormPanel,
  Input,
  Select,
  Empty,
  api,
  setGlobalToast,
  loadCore,
}) {
  // Dual-view mode: 'table' (dense grid) or 'cards' (compact cards)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('stock_view_mode') || 'table';
    } catch {
      return 'table';
    }
  });

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('stock_view_mode', mode);
    } catch {}
  };

  // Collapsible sections toggle states
  const [isSetStockOpen, setIsSetStockOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isCustomPartCategory, setIsCustomPartCategory] = useState(false);
  const [isCustomQualityVariant, setIsCustomQualityVariant] = useState(false);
  const [isCustomNameEdited, setIsCustomNameEdited] = useState(false);

  // Relative Stock Adjustment mode ('add' | 'deduct' | 'set')
  const [adjustmentMode, setAdjustmentMode] = useState('add');
  const [isColorSplitMode, setIsColorSplitMode] = useState(false);
  const [colorSplitQuantities, setColorSplitQuantities] = useState({});

  const defaultPartCategories = ['Display', 'Battery', 'Camera', 'Speaker', 'Charging IC', 'Main Flex', 'Frame', 'Charging Port', 'Vibrator', 'Ear Speaker', 'Back Glass', 'Middle Frame', 'Sim Tray', 'Housing', 'Mic'];
  const refPartCategories = (data.reference?.partCategories || []).map(pc => typeof pc === 'string' ? pc : pc.name).filter(Boolean);
  const uniquePartCategories = Array.from(new Set([...defaultPartCategories, ...refPartCategories]));

  const defaultQualityVariants = ['OLED', 'Soft OLED', 'Hard OLED', 'Incell', 'With Frame', 'Without Frame', 'Fresh New', 'Set Remove', 'Original', 'Refurbished', 'Copy', 'Premium Copy'];
  const refQualityVariants = (data.reference?.productVariants || []).map(qv => typeof qv === 'string' ? qv : qv.name).filter(Boolean);
  const uniqueQualityVariants = Array.from(new Set([...defaultQualityVariants, ...refQualityVariants]));

  // Model Picker Modal state for quick stock addition from existing models
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelPickerSearch, setModelPickerSearch] = useState('');

  // Quick Category Filter Definitions
  const quickCategories = [
    { id: '', label: 'All Items', icon: Boxes },
    { id: 'Display', label: 'Displays', icon: Smartphone },
    { id: 'Battery', label: 'Batteries', icon: BatteryCharging },
    { id: 'Camera', label: 'Cameras', icon: Camera },
    { id: 'Speaker', label: 'Speakers', icon: Volume2 },
    { id: 'Charging Port', label: 'Charging Flex', icon: Zap },
    { id: 'Housing', label: 'Housing & Glass', icon: Layers },
  ];

  // Reference Manager state
  const [refTab, setRefTab] = useState('colours'); // 'colours', 'brands', 'categories'
  const [newColorInput, setNewColorInput] = useState('');
  const [newBrandInput, setNewBrandInput] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [editingRef, setEditingRef] = useState(null); // { type, id, name }
  const [editingRefName, setEditingRefName] = useState('');
  const stockSummaryTotals = data?.stockSummary?.totals || {};
  const stockModelTotal = Number(stockSummaryTotals.products || 0);

  // Computed summary metrics
  const totalStockItemsQty = useMemo(() => {
    return stockWithOwnership.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [stockWithOwnership]);

  const healthyStockCount = useMemo(() => {
    return stockWithOwnership.filter(item => {
      const threshold = (data.shops.find(s => s.id === item.shop_id)?.low_stock_threshold || 4);
      return Number(item.quantity || 0) > threshold;
    }).length;
  }, [stockWithOwnership, data.shops]);

  const lowStockCount = useMemo(() => {
    return stockWithOwnership.filter(item => {
      const threshold = (data.shops.find(s => s.id === item.shop_id)?.low_stock_threshold || 4);
      return item.quantity > 0 && item.quantity <= threshold;
    }).length;
  }, [stockWithOwnership, data.shops]);

  const outOfStockCount = useMemo(() => {
    return stockWithOwnership.filter(item => Number(item.quantity || 0) === 0).length;
  }, [stockWithOwnership]);

  // Quick Add Reference Modal state
  const [quickAddModal, setQuickAddModal] = useState({
    isOpen: false,
    type: 'brand', // 'brand' | 'manufacturing-brand' | 'supplier'
  });

  // Auto-listen to URL query parameters on mount or when location changes (e.g. /stock?filter=low_stock or /stock?status=out_of_stock)
  useEffect(() => {
    if (typeof window === 'undefined' || !setStockFilters) return;
    const searchParams = new URLSearchParams(window.location.search);
    const filterParam = searchParams.get('filter') || searchParams.get('status');
    if (filterParam) {
      const normalized = filterParam.toLowerCase().trim();
      if (normalized === 'low_stock' || normalized === 'low' || normalized === 'warning') {
        setStockFilters((prev) => (prev.status === 'low_stock' ? prev : { ...prev, status: 'low_stock' }));
        setIsFiltersOpen(true);
      } else if (normalized === 'out_of_stock' || normalized === 'no_stock' || normalized === 'out') {
        setStockFilters((prev) => (prev.status === 'out_of_stock' ? prev : { ...prev, status: 'out_of_stock' }));
        setIsFiltersOpen(true);
      } else if (normalized === 'in_stock') {
        setStockFilters((prev) => (prev.status === 'in_stock' ? prev : { ...prev, status: 'in_stock' }));
      }
    }
  }, []);

  const handleOpenQuickAdd = (type, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setQuickAddModal({ isOpen: true, type });
  };

  const handleCloseQuickAdd = () => {
    setQuickAddModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleSaveQuickAdd = async (cleanName) => {
    const { type } = quickAddModal;
    if (type === 'brand') {
      let created = null;
      if (onAddReferenceOption) {
        created = await onAddReferenceOption('brands', cleanName);
      } else if (api) {
        created = await api('/reference-data/brands', { method: 'POST', body: JSON.stringify({ name: cleanName }) });
        if (loadCore) await loadCore();
      }
      const brandName = created?.name || cleanName;
      setForms((prev) => {
        const autoName = [brandName, prev.product.part_category].filter(Boolean).join(' ');
        return {
          ...prev,
          product: {
            ...prev.product,
            brand: brandName,
            short_name: isCustomNameEdited ? prev.product.short_name : autoName,
          },
        };
      });
      if (setGlobalToast) setGlobalToast(`Brand "${brandName}" added successfully`, 'success');
    } else if (type === 'manufacturing-brand') {
      let created = null;
      if (onAddReferenceOption) {
        created = await onAddReferenceOption('manufacturing-brands', cleanName);
      } else if (api) {
        created = await api('/reference-data/manufacturing-brands', { method: 'POST', body: JSON.stringify({ name: cleanName }) });
        if (loadCore) await loadCore();
      }
      const mfgId = created?.id ? String(created.id) : '';
      if (mfgId) {
        setForms((prev) => ({
          ...prev,
          product: {
            ...prev.product,
            manufacturing_brand_id: mfgId,
          },
        }));
      }
      if (setGlobalToast) setGlobalToast(`Manufacturing brand "${cleanName}" created successfully`, 'success');
    } else if (type === 'supplier') {
      let created = null;
      if (onAddReferenceOption) {
        created = await onAddReferenceOption('suppliers', cleanName);
      } else if (api) {
        created = await api('/reference-data/suppliers', { method: 'POST', body: JSON.stringify({ name: cleanName }) });
        if (loadCore) await loadCore();
      }
      const supplierId = created?.id ? String(created.id) : '';
      if (supplierId) {
        setForms((prev) => ({
          ...prev,
          product: {
            ...prev.product,
            supplier_id: supplierId,
          },
        }));
      }
      if (setGlobalToast) setGlobalToast(`Supplier "${cleanName}" created successfully`, 'success');
    }
  };

  // Inline color adder & category creator for product creation form
  const [inlineColorInput, setInlineColorInput] = useState('');
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [inlineCategoryInput, setInlineCategoryInput] = useState('');

  const handleAddInlineCategory = async () => {
    const clean = inlineCategoryInput.trim();
    if (!clean) return;
    if (onAddReferenceOption) {
      await onAddReferenceOption('categories', clean);
    }
    setInlineCategoryInput('');
    setShowAddCategoryInput(false);
  };

  // Automatically expand product panel when editing a product
  useEffect(() => {
    if (editingProductId) {
      setIsAddProductOpen(true);
      setIsCustomNameEdited(true);
    } else if (!forms.product?.short_name) {
      setIsCustomNameEdited(false);
    }
  }, [editingProductId, forms.product?.short_name]);

  // Brand alias detection mapping
  const detectBrand = (name) => {
    const lower = String(name || '').toLowerCase();
    if (/1\+|one\s*plus|oneplus/.test(lower)) return 'OnePlus';
    if (/iphone|ipad|apple|i\s*phone/.test(lower)) return 'Apple';
    if (/redmi/.test(lower)) return 'Redmi';
    if (/xiaomi|\bmi\b|\bmi\d|\bmi\s/.test(lower)) return 'Xiaomi';
    if (/pixel|google/.test(lower)) return 'Google Pixel';
    if (/poco/.test(lower)) return 'Poco';
    if (/samsung|galaxy|\bsam\b/.test(lower)) return 'Samsung';
    if (/vivo/.test(lower)) return 'Vivo';
    if (/oppo/.test(lower)) return 'Oppo';
    if (/realme/.test(lower)) return 'Realme';
    if (/nothing/.test(lower)) return 'Nothing';
    if (/motorola|moto/.test(lower)) return 'Motorola';
    if (/huawei/.test(lower)) return 'Huawei';
    if (/honor/.test(lower)) return 'Honor';
    if (/nokia/.test(lower)) return 'Nokia';
    if (/infinix/.test(lower)) return 'Infinix';
    if (/tecno/.test(lower)) return 'Tecno';
    if (/lava/.test(lower)) return 'Lava';
    if (/micromax/.test(lower)) return 'Micromax';
    if (/iqoo/.test(lower)) return 'IQOO';
    if (/asus/.test(lower)) return 'Asus';
    if (/sony/.test(lower)) return 'Sony';
    if (/lenovo/.test(lower)) return 'Lenovo';
    return '';
  };

  // Run brand detection on name changes and auto-apply if not manually overridden
  const handleProductNameChange = (value, field) => {
    if (field === 'short_name') {
      setIsCustomNameEdited(Boolean(value && value.trim()));
    }
    setForms((prev) => {
      const updatedProduct = { ...prev.product, [field]: value };
      
      // Auto detect brand based on title/compatible models if brand is not already set
      if (!prev.product.brand) {
        const detected = detectBrand(updatedProduct.short_name || updatedProduct.full_model_list);
        if (detected) {
          const match = data.reference.brands.find(b => b.name.toLowerCase() === detected.toLowerCase());
          if (match) {
            updatedProduct.brand = match.name;
          }
        }
      }
      return { ...prev, product: updatedProduct };
    });
  };

  // Toggle color array selection in product form
  const handleToggleColour = (colourName) => {
    const selected = forms.product.colours.split(',').map((c) => c.trim()).filter(Boolean);
    let next;
    if (selected.includes(colourName)) {
      next = selected.filter((c) => c !== colourName);
    } else {
      next = [...selected, colourName];
    }
    setForms((prev) => ({
      ...prev,
      product: { ...prev.product, colours: next.join(', ') }
    }));
  };

  // Inline colour tag submit handler
  const handleAddInlineColour = async (e) => {
    e.preventDefault();
    const clean = inlineColorInput.trim();
    if (!clean) return;
    await onAddReferenceOption('colours', clean);
    setInlineColorInput('');
  };

  // Reference Manager tab helper lists
  const getReferenceList = () => {
    if (refTab === 'colours') return data.reference.colours;
    if (refTab === 'brands') return data.reference.brands;
    return data.reference.categories;
  };

  // Delete reference with confirmation prompt
  const handleDeleteReference = (type, item) => {
    onDeleteReferenceOption(type, item.id);
  };

  // Delete product with confirmation
  const handleDeleteProductConfirm = (product) => {
    onDeleteProduct(product);
  };

  // Extract selected product colours list
  const getSelectedProductColours = () => {
    const prodId = forms.stock.product_id;
    if (!prodId) return [];
    const prod = data.products.find(p => String(p.id) === String(prodId));
    if (!prod) return [];
    return Array.isArray(prod.colours) ? prod.colours : String(prod.colours || '').split(',').map(c => c.trim()).filter(Boolean);
  };

  const selectedProductColours = getSelectedProductColours();
  const selectedProductDetails = data.products.find(p => String(p.id) === String(forms.stock.product_id));
  const selectedLocation = data.shops.find((location) => String(location.id) === String(shopId));
  const isWarehouseScope = role === 'superadmin' && selectedLocation?.location_type === 'warehouse';
  const stockFormTitle = role === 'shopkeeper'
    ? 'Set My Stock Quantity'
    : isWarehouseScope
      ? 'Set Warehouse Stock Quantity'
      : 'Set Branch Stock Quantity';
  const ownerQuantityLabel = isWarehouseScope
    ? 'Warehouse'
    : role === 'shopkeeper'
      ? 'Branch stock'
      : 'Owner stock';
  const assignedQuantityLabel = role === 'shopkeeper' ? 'My assigned stock' : 'Assigned stock';

  // Determine current stock item metrics for selected product
  const getStockMetricPreview = () => {
    if (!forms.stock.product_id) return null;
    const matches = stockWithOwnership.filter(item => String(item.product_id) === String(forms.stock.product_id));
    if (matches.length > 0) {
      return matches.reduce((total, item) => ({
        quantity: total.quantity + Number(item.quantity || 0),
        owner_quantity: total.owner_quantity + Number(item.owner_quantity || 0),
        my_quantity: total.my_quantity + Number(item.my_quantity || 0),
        shopkeeper_quantity: total.shopkeeper_quantity + Number(item.shopkeeper_quantity || 0),
      }), { quantity: 0, owner_quantity: 0, my_quantity: 0, shopkeeper_quantity: 0 });
    }

    // Fallback to data.products / data.catalog when product is not in the currently loaded paginated stock page
    const productRecord = (data.products || []).find(p => String(p.id) === String(forms.stock.product_id))
      || (data.catalog || []).find(p => String(p.id) === String(forms.stock.product_id));

    if (productRecord) {
      const qty = Number(
        isWarehouseScope
          ? (productRecord.warehouse_stock ?? productRecord.available_stock ?? productRecord.quantity ?? 0)
          : (productRecord.available_stock ?? productRecord.quantity ?? 0)
      );
      const ownerQty = Number(productRecord.warehouse_stock ?? productRecord.owner_quantity ?? productRecord.quantity ?? 0);
      return {
        quantity: qty,
        owner_quantity: ownerQty,
        my_quantity: Number(productRecord.my_quantity || 0),
        shopkeeper_quantity: Number(productRecord.shopkeeper_quantity || 0),
      };
    }

    return { quantity: 0, owner_quantity: 0, my_quantity: 0, shopkeeper_quantity: 0 };
  };
  const stockPreview = getStockMetricPreview();

  // Filtered products list for model picker modal
  const filteredModelPickerProducts = useMemo(() => {
    const list = data.products || [];
    if (!modelPickerSearch.trim()) return list;
    const term = modelPickerSearch.toLowerCase().trim();
    return list.filter((p) => {
      const nameMatch = String(p.short_name || p.name || '').toLowerCase().includes(term);
      const brandMatch = String(p.brand || '').toLowerCase().includes(term);
      const catMatch = String(p.category || '').toLowerCase().includes(term);
      const modelMatch = String(p.full_model_list || p.model || '').toLowerCase().includes(term);
      return nameMatch || brandMatch || catMatch || modelMatch;
    });
  }, [data.products, modelPickerSearch]);

  return (
    <section className="space">
      
      {/* ==================== 1. HERO CONTROL BANNER ==================== */}
      <div className="stock-hero-banner p-5 sm:p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-teal-500/10 text-teal-700 border border-teal-200 shadow-2xs">
                <Sparkles size={13} className="text-teal-600 animate-spin" style={{ animationDuration: '6s' }} />
                Live Inventory Engine
              </span>
              <span className="text-xs font-bold text-slate-500 bg-white/70 px-2.5 py-0.5 rounded-full border border-slate-200/80">
                🏬 {selectedLocation?.name || (role === 'shopkeeper' ? 'Assigned Shop' : 'Central Warehouse')}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              {role === 'shopkeeper' ? 'Shop Stock Inventory' : 'Consolidated Stock Overview'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-2xl">
              {role === 'shopkeeper'
                ? 'Manage assigned shop inventory, trace color stock variants, and prepare customer orders.'
                : 'Monitor real-time warehouse inventory, restock branch reserves, track FIFO profit margins, and manage catalog items.'}
            </p>
          </div>

          {/* Quick Action Buttons Toolbar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                if (isSetStockOpen) setIsSetStockOpen(false);
                else {
                  setIsSetStockOpen(true);
                  setIsAddProductOpen(false);
                }
              }}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border ${
                isSetStockOpen
                  ? 'bg-teal-700 text-white border-teal-800 shadow-md'
                  : 'bg-teal-600 hover:bg-teal-700 text-white border-teal-700 hover:shadow'
              }`}
            >
              <Zap size={14} />
              <span>{isSetStockOpen ? 'Hide Stock Form' : 'Adjust Stock'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isAddProductOpen) setIsAddProductOpen(false);
                else {
                  setIsAddProductOpen(true);
                  setIsSetStockOpen(false);
                }
              }}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border ${
                isAddProductOpen
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                  : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
              }`}
            >
              <Plus size={14} />
              <span>{isAddProductOpen ? 'Hide Product Form' : 'Add Product'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsModelPickerOpen(true)}
              className="px-3.5 py-2.5 rounded-xl text-xs font-extrabold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <PackagePlus size={14} />
              <span className="hidden sm:inline">Catalog Picker</span>
            </button>

            {role === 'superadmin' && (
              <button
                type="button"
                onClick={() => setTransferDrawerOpen(true)}
                className="px-3.5 py-2.5 rounded-xl text-xs font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Send size={14} />
                <span className="hidden sm:inline">Transfer</span>
              </button>
            )}

            {/* View Mode Toggle Segmented Control */}
            <div className="view-mode-toggle ml-1">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('table')}
                title="Dense Data Table View"
              >
                <Table size={15} />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'cards' ? 'active' : ''}`}
                onClick={() => handleViewModeChange('cards')}
                title="Compact Card View"
              >
                <LayoutGrid size={15} />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 2. INTERACTIVE BENTO KPI CARDS ==================== */}
      <div className="kpi-bento-grid mb-6">
        {/* Card 1: Total Units */}
        <div 
          className="kpi-bento-card"
          onClick={() => setStockFilters(prev => ({ ...prev, status: '' }))}
          title="Click to view all products"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total Units</span>
            <div className="kpi-icon-badge bg-teal-50 text-teal-600 border border-teal-100">
              <Boxes size={18} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight block">
              {totalStockItemsQty.toLocaleString('en-IN')}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 mt-0.5 block">
              Live pieces across all models
            </span>
          </div>
        </div>

        {/* Card 2: Catalog SKUs */}
        <div 
          className="kpi-bento-card"
          onClick={() => setStockFilters(prev => ({ ...prev, status: '' }))}
          title="Click to reset status filters"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Catalog SKUs</span>
            <div className="kpi-icon-badge bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Smartphone size={18} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight block">
              {Number(stockPager.total || stockWithOwnership.length).toLocaleString('en-IN')}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 mt-0.5 block">
              Total active catalog products
            </span>
          </div>
        </div>

        {/* Card 3: Healthy Stock */}
        <div 
          className={`kpi-bento-card ${stockFilters.status === 'in_stock' ? 'active' : ''}`}
          onClick={() => setStockFilters(prev => ({ ...prev, status: prev.status === 'in_stock' ? '' : 'in_stock' }))}
          title="Click to filter In-Stock products"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">In Stock</span>
            <div className="kpi-icon-badge bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-2xl font-black text-emerald-700 tracking-tight">
                {healthyStockCount}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 mt-0.5 block">
              Above warning threshold
            </span>
          </div>
        </div>

        {/* Card 4: Low Stock Alert (Interactive!) */}
        <div 
          className={`kpi-bento-card ${stockFilters.status === 'low_stock' ? 'active' : ''} ${lowStockCount > 0 ? 'border-amber-200/90' : ''}`}
          onClick={() => setStockFilters(prev => ({ ...prev, status: prev.status === 'low_stock' ? '' : 'low_stock' }))}
          title="Click to filter Low Stock products"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">Low Stock Alert</span>
            <div className="kpi-icon-badge bg-amber-50 text-amber-600 border border-amber-200">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-amber-700 tracking-tight">
                {lowStockCount}
              </span>
              {lowStockCount > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </span>
              )}
            </div>
            <span className="text-[11px] font-semibold text-slate-500 mt-0.5 block">
              Restock recommended
            </span>
          </div>
        </div>

        {/* Card 5: Out of Stock (Interactive!) */}
        <div 
          className={`kpi-bento-card ${stockFilters.status === 'out_of_stock' ? 'active' : ''} ${outOfStockCount > 0 ? 'border-rose-200/90' : ''}`}
          onClick={() => setStockFilters(prev => ({ ...prev, status: prev.status === 'out_of_stock' ? '' : 'out_of_stock' }))}
          title="Click to filter Out of Stock products"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-rose-700">Out of Stock</span>
            <div className="kpi-icon-badge bg-rose-50 text-rose-600 border border-rose-200">
              <XCircle size={18} />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-2xl font-black text-rose-700 tracking-tight block">
              {outOfStockCount}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 mt-0.5 block">
              0 quantity available
            </span>
          </div>
        </div>
      </div>

      {/* Shopkeeper Stock Summary */}
      {role === 'shopkeeper' && (
        <section className="inventory-ownership-summary compact-summary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <article className="ownership-summary-card owner" style={{ padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
            <span style={{ fontSize: '12px', opacity: 0.6 }}>Branch Shared Stock</span>
            <strong style={{ fontSize: '24px', display: 'block', margin: '4px 0' }}>{ownerInventoryQuantity} pcs</strong>
            <small style={{ fontSize: '11px', opacity: 0.5 }}>Unassigned stock in your shop</small>
          </article>
          <article className="ownership-summary-card mine" style={{ padding: '16px', borderRadius: '16px', border: '1px solid rgba(25,160,140,0.2)', background: 'rgba(25,160,140,0.05)' }}>
            <span style={{ fontSize: '12px', opacity: 0.6, color: '#14b8a6' }}>My Assigned Stock</span>
            <strong style={{ fontSize: '24px', display: 'block', margin: '4px 0', color: '#14b8a6' }}>{myInventoryQuantity} pcs</strong>
            <small style={{ fontSize: '11px', opacity: 0.5 }}>Stock assigned to your login</small>
          </article>
        </section>
      )}

      {/* Grid of Main Actions: Set Stock Form (Collapsible via isSetStockOpen) */}
      {isSetStockOpen && (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '24px' }}>
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-black uppercase tracking-wider text-teal-700 flex items-center gap-1.5">
              <Zap size={14} /> Quick Stock Level Adjustment
            </span>
            <button
              type="button"
              onClick={() => setIsSetStockOpen(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
            >
              <X size={14} /> Close
            </button>
          </div>
        
        {/* Set/Add Stock Level Card */}
        <FormPanel 
          title={stockFormTitle}
          action={
            adjustmentMode === 'add' 
              ? 'Add Stock (+)' 
              : adjustmentMode === 'deduct' 
                ? 'Deduct Stock (-)' 
                : 'Set Total Quantity (=)'
          } 
          onSubmit={(e) => {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            const payload = {
              ...forms.stock,
              shop_id: shopId,
              adjustment_mode: adjustmentMode,
              color_quantities: (isColorSplitMode && selectedProductColours.length > 0) ? colorSplitQuantities : undefined,
            };
            // Call updateStock with extended payload if needed
            if (setForms) {
              setForms((prev) => ({
                ...prev,
                stock: {
                  ...prev.stock,
                  adjustment_mode: adjustmentMode,
                  color_quantities: (isColorSplitMode && selectedProductColours.length > 0) ? colorSplitQuantities : undefined,
                }
              }));
            }
            updateStock(payload);
          }}
          disabled={saving || !forms.stock.product_id || (!isColorSplitMode && forms.stock.quantity === '')}
        >
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <Select 
                label="Select Product to Update" 
                value={forms.stock.product_id} 
                onChange={(v) => {
                  setForms((prev) => ({
                    ...prev,
                    stock: { 
                      ...prev.stock, 
                      product_id: v, 
                      colour: '', 
                      quantity: '' 
                    }
                  }));
                  setColorSplitQuantities({});
                }} 
                options={data.products.map((p) => [p.id, `${productName(p, { hideSupplier: role !== 'superadmin' })} · [${p.brand}] · ${priceLabel(p.sale_price)}`])} 
              />
            </div>
            <button
              type="button"
              onClick={() => setIsModelPickerOpen(true)}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0d9488 0%, #0284c7 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '12px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
              }}
            >
              <PackagePlus size={15} /> Pick from Models Catalog
            </button>
          </div>

            {/* Current Stock Preview & Mode Selector */}
            {forms.stock.product_id && (
              <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '700' }}>Current Warehouse Metrics</span>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                      <span style={{ fontSize: '13.5px', color: '#1e293b' }}>Total Available: <b style={{ color: '#0d9488', fontWeight: '800' }}>{stockPreview?.quantity || 0} pcs</b></span>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{ownerQuantityLabel}: <b style={{ color: '#0f172a' }}>{stockPreview?.owner_quantity || 0}</b></span>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{assignedQuantityLabel}: <b style={{ color: '#0f172a' }}>{role === 'shopkeeper' ? stockPreview?.my_quantity || 0 : stockPreview?.shopkeeper_quantity || 0}</b></span>
                    </div>
                  </div>

                  {/* Segmented Adjustment Mode Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#e2e8f0', padding: '4px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                    <button
                      type="button"
                      onClick={() => setAdjustmentMode('add')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        background: adjustmentMode === 'add' ? '#0d9488' : 'transparent',
                        color: adjustmentMode === 'add' ? '#ffffff' : '#475569',
                        boxShadow: adjustmentMode === 'add' ? '0 2px 8px rgba(13,148,136,0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      + Add Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustmentMode('deduct')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        background: adjustmentMode === 'deduct' ? '#e11d48' : 'transparent',
                        color: adjustmentMode === 'deduct' ? '#ffffff' : '#475569',
                        boxShadow: adjustmentMode === 'deduct' ? '0 2px 8px rgba(225,29,72,0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      - Deduct Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustmentMode('set')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '7px',
                        border: 'none',
                        fontSize: '11.5px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        background: adjustmentMode === 'set' ? '#0284c7' : 'transparent',
                        color: adjustmentMode === 'set' ? '#ffffff' : '#475569',
                        boxShadow: adjustmentMode === 'set' ? '0 2px 8px rgba(2,132,199,0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      = Direct Total
                    </button>
                  </div>
                </div>

                {/* Live Formula Preview Badge */}
                {!isColorSplitMode && forms.stock.quantity !== '' && !isNaN(Number(forms.stock.quantity)) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderRadius: '8px', background: adjustmentMode === 'add' ? 'rgba(13,148,136,0.08)' : adjustmentMode === 'deduct' ? 'rgba(225,29,72,0.08)' : 'rgba(2,132,199,0.08)', border: `1px solid ${adjustmentMode === 'add' ? 'rgba(13,148,136,0.2)' : adjustmentMode === 'deduct' ? 'rgba(225,29,72,0.2)' : 'rgba(2,132,199,0.2)'}` }}>
                    <span style={{ fontSize: '11.5px', fontWeight: '700', color: adjustmentMode === 'add' ? '#0f766e' : adjustmentMode === 'deduct' ? '#e11d48' : '#0284c7' }}>
                      {adjustmentMode === 'add' && `Additive Formula: Current (${stockPreview?.quantity || 0}) + Input (${Number(forms.stock.quantity)}) = New Total: ${(stockPreview?.quantity || 0) + Number(forms.stock.quantity)} pcs`}
                      {adjustmentMode === 'deduct' && `Deductive Formula: Current (${stockPreview?.quantity || 0}) - Input (${Number(forms.stock.quantity)}) = New Total: ${Math.max(0, (stockPreview?.quantity || 0) - Number(forms.stock.quantity))} pcs`}
                      {adjustmentMode === 'set' && `Direct Override Formula: Total will be directly set to ${Number(forms.stock.quantity)} pcs`}
                    </span>
                  </div>
                )}

                {/* Toggle Color Variant Split vs Lump-Sum Mode */}
                {selectedProductColours.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>
                      Tagged Colours: <b style={{ color: '#0f172a', fontWeight: '700' }}>{selectedProductColours.join(', ')}</b>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsColorSplitMode(!isColorSplitMode)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: '1.5px solid #0d9488',
                        background: isColorSplitMode ? '#f0fdfa' : '#ffffff',
                        color: '#0f766e',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                    >
                      {isColorSplitMode ? 'Switch to Single Input' : '⚡ Split Stock Across Colours'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Color-Variant Stock Split Grid */}
            {forms.stock.product_id && isColorSplitMode && selectedProductColours.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px', background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0d9488', display: 'inline-block' }}></span>
                    Color-Variant Stock Allocation ({adjustmentMode === 'add' ? '+ Add per Colour' : adjustmentMode === 'deduct' ? '- Deduct per Colour' : '= Set Total per Colour'})
                  </span>
                  <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155' }}>
                    Total Variant Stock: <b style={{ color: '#0f766e', fontWeight: '900', fontSize: '13.5px' }}>{Object.values(colorSplitQuantities).reduce((a, b) => a + Number(b || 0), 0)} pcs</b>
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
                  {selectedProductColours.map((colourName) => {
                    const currentColourQty = Number(selectedProductDetails?.colour_stock?.[colourName] || 0);
                    return (
                      <div
                        key={colourName}
                        style={{
                          padding: '12px 14px',
                          background: '#ffffff',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '10px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>{colourName}</span>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#475569', background: '#f1f5f9', padding: '2px 7px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            Curr: <b style={{ color: '#0f172a' }}>{currentColourQty}</b>
                          </span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          placeholder="Qty to allocate"
                          value={colorSplitQuantities[colourName] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setColorSplitQuantities(prev => ({ ...prev, [colourName]: val }));
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: '#f8fafc',
                            border: '1.5px solid #94a3b8',
                            borderRadius: '8px',
                            color: '#0f172a',
                            fontWeight: '800',
                            fontSize: '13px',
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: role === 'shopkeeper' ? '1fr' : '1fr 1fr', gap: '16px' }}>
                <Input 
                  label={
                    adjustmentMode === 'add' 
                      ? (role === 'shopkeeper' ? 'Quantity to Add (+)' : 'Stock to Add (+)') 
                      : adjustmentMode === 'deduct' 
                        ? (role === 'shopkeeper' ? 'Quantity to Deduct (-)' : 'Stock to Deduct (-)') 
                        : (role === 'shopkeeper' ? 'New Branch Quantity (=)' : 'New Stock Quantity (=)')
                  } 
                  type="number" 
                  placeholder={adjustmentMode === 'add' ? 'e.g. 10 (will add to current)' : adjustmentMode === 'deduct' ? 'e.g. 5 (will subtract)' : 'e.g. 25 (direct total)'}
                  value={forms.stock.quantity} 
                  onChange={(v) => setForms((prev) => ({ ...prev, stock: { ...prev.stock, quantity: v } }))} 
                />
                {role !== 'shopkeeper' && (
                  <Select 
                    label="Supplier (Optional)"
                    value={forms.stock.supplier_id || ''}
                    onChange={(v) => setForms((prev) => ({ ...prev, stock: { ...prev.stock, supplier_id: v } }))}
                    options={[
                      ['', 'Choose Supplier'],
                      ...(data.reference?.suppliers || [])
                        .filter(s => s.is_active)
                        .map(s => [s.id, s.name])
                    ]}
                  />
                )}
              </div>
            )}
          </div>
        </FormPanel>

        {/* Superadmin branch transfer shortcut */}
        {role === 'superadmin' && (
          <section className="panel transfer-launch" style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.05) 0%, rgba(99,102,241,0.05) 100%)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderRadius: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Branch Stock Transfer</h2>
              <p style={{ opacity: 0.7, fontSize: '13px', marginTop: '4px' }}>Move available stock between shops or from main warehouse instantly.</p>
            </div>
            <button className="primary" type="button" onClick={() => setTransferDrawerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Send size={16} /> Transfer Stock
            </button>
          </section>
        )}

      </section>
      )}

      {/* Collapsible Unified Workspace Panels */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        
        {/* PANEL 1: Add/Edit Product Panel */}
        <div className="panel stock-product-panel">
          <button 
            type="button" 
            onClick={() => setIsAddProductOpen(!isAddProductOpen)} 
            className="stock-product-toggle"
          >
            <div className="stock-product-toggle-main">
              <span className="stock-product-toggle-icon">
                <Smartphone size={18} />
              </span>
              <div>
                <strong>{editingProductId ? 'Edit Product & Pricing' : 'Add New Product'}</strong>
                <small>{editingProductId ? 'Modify pricing, models, and specifications' : 'Create a new catalog item with default pricing'}</small>
              </div>
            </div>
            {isAddProductOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {isAddProductOpen && (
            <div className="stock-product-body">
              <form className="stock-product-form space-y-5" onSubmit={(e) => { e.preventDefault(); onSubmitProduct(); }}>
                <div className="stock-product-flow space-y-5">
                  
                  {/* Row 1: Short Display Name & Compatible Phone Models */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input 
                      label="SHORT DISPLAY NAME (VISIBLE TO USERS)" 
                      placeholder="Example: iPhone 13 Pro Display"
                      value={forms.product.short_name} 
                      onChange={(v) => handleProductNameChange(v, 'short_name')} 
                    />
                    <Input 
                      label="COMPATIBLE PHONE MODELS (FULL LIST)" 
                      placeholder="Example: A2483, A2484, A2636"
                      value={forms.product.full_model_list} 
                      onChange={(v) => handleProductNameChange(v, 'full_model_list')} 
                    />
                  </div>                  {/* Row 2: Brand, Manufacturing Brand & Supplier */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* Brand Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">BRAND *</span>
                        <button
                          type="button"
                          onClick={(e) => handleOpenQuickAdd('brand', e)}
                          className="text-[11px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus size={12} /> Add Brand
                        </button>
                      </div>
                      <SearchableCombobox
                        placeholder="Select Brand"
                        searchPlaceholder="Search brand..."
                        value={forms.product.brand || ''}
                        onChange={(brandName) => {
                          setForms((prev) => {
                            const autoName = [brandName, prev.product.part_category].filter(Boolean).join(' ');
                            return {
                              ...prev,
                              product: {
                                ...prev.product,
                                brand: brandName,
                                short_name: isCustomNameEdited ? prev.product.short_name : autoName,
                              },
                            };
                          });
                        }}
                        options={(data.reference?.brands || []).map((b) => ({
                          id: typeof b === 'string' ? b : b.name || b.brand,
                          name: typeof b === 'string' ? b : b.name || b.brand,
                        }))}
                        onAddNew={() => handleOpenQuickAdd('brand')}
                        addNewLabel="+ Add New Brand..."
                        allowClear={true}
                      />
                    </div>

                    {/* Manufacturing Brand Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">MANUFACTURING BRAND (OPTIONAL)</span>
                        <button
                          type="button"
                          onClick={(e) => handleOpenQuickAdd('manufacturing-brand', e)}
                          className="text-[11px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus size={12} /> Add Mfg Brand
                        </button>
                      </div>
                      <SearchableCombobox
                        placeholder="Select Manufacturing Brand"
                        searchPlaceholder="Search mfg brand..."
                        value={forms.product.manufacturing_brand_id || ''}
                        onChange={(mfgId) => {
                          setForms((prev) => ({
                            ...prev,
                            product: { ...prev.product, manufacturing_brand_id: mfgId },
                          }));
                        }}
                        options={(data.reference?.manufacturingBrands || [])
                          .filter((mb) => mb.is_active || String(mb.id) === String(forms.product.manufacturing_brand_id))
                          .map((mb) => ({ id: mb.id, name: mb.name }))}
                        onAddNew={() => handleOpenQuickAdd('manufacturing-brand')}
                        addNewLabel="+ Add New Mfg Brand..."
                        allowClear={true}
                      />
                    </div>

                    {/* Supplier Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">SUPPLIER (OPTIONAL)</span>
                        <button
                          type="button"
                          onClick={(e) => handleOpenQuickAdd('supplier', e)}
                          className="text-[11px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus size={12} /> Add Supplier
                        </button>
                      </div>
                      <SearchableCombobox
                        placeholder="Select Supplier"
                        searchPlaceholder="Search supplier..."
                        value={forms.product.supplier_id || ''}
                        onChange={(supplierId) => {
                          setForms((prev) => ({
                            ...prev,
                            product: { ...prev.product, supplier_id: supplierId },
                          }));
                        }}
                        options={(data.reference?.suppliers || [])
                          .filter((s) => s.is_active || String(s.id) === String(forms.product.supplier_id))
                          .map((s) => ({ id: s.id, name: s.name }))}
                        onAddNew={() => handleOpenQuickAdd('supplier')}
                        addNewLabel="+ Add New Supplier..."
                        allowClear={true}
                      />
                    </div>
                  </div>

                  {/* Separate Part Category & Quality / Variant Container */}
                  <div className="border border-emerald-300 dark:border-teal-800/80 rounded-2xl p-4 bg-emerald-50/20 dark:bg-emerald-950/10 grid grid-cols-1 md:grid-cols-2 gap-5">
                    
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
                                setForms(prev => ({ ...prev, product: { ...prev.product, part_category: '' } }));
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
                            value={forms.product.part_category || ''} 
                            onChange={(v) => {
                              const partCat = v;
                              setForms(prev => {
                                const autoName = [prev.product.brand, partCat].filter(Boolean).join(' ');
                                return {
                                  ...prev,
                                  product: {
                                    ...prev.product,
                                    part_category: partCat,
                                    short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                  }
                                };
                              });
                            }} 
                          />
                        ) : (
                          <SearchableCombobox 
                            placeholder="Select Part Category" 
                            searchPlaceholder="Search part category..."
                            value={forms.product.part_category || ''} 
                            onChange={(partCat) => {
                              setForms(prev => {
                                const autoName = [prev.product.brand, partCat].filter(Boolean).join(' ');
                                return {
                                  ...prev,
                                  product: {
                                    ...prev.product,
                                    part_category: partCat,
                                    short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                  }
                                };
                              });
                            }} 
                            options={uniquePartCategories.map(pc => ({ id: pc, name: pc }))}
                            onAddNew={() => {
                              setIsCustomPartCategory(true);
                              setForms(prev => ({ ...prev, product: { ...prev.product, part_category: '' } }));
                            }}
                            addNewLabel="+ Add New Part Category..."
                            allowClear={true}
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
                                const partCat = chip;
                                setForms(prev => {
                                  const autoName = [prev.product.brand, partCat].filter(Boolean).join(' ');
                                  return {
                                    ...prev,
                                    product: {
                                      ...prev.product,
                                      part_category: partCat,
                                      short_name: isCustomNameEdited ? prev.product.short_name : autoName
                                    }
                                  };
                                });
                              }}
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                                forms.product.part_category === chip 
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
                                setForms(prev => ({ ...prev, product: { ...prev.product, quality_variant: '' } }));
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
                            value={forms.product.quality_variant || ''} 
                            onChange={(v) => {
                              const qualVar = v;
                              setForms(prev => ({
                                ...prev,
                                product: {
                                  ...prev.product,
                                  quality_variant: qualVar
                                }
                              }));
                            }} 
                          />
                        ) : (
                          <SearchableCombobox 
                            placeholder="Select Variant (Optional)" 
                            searchPlaceholder="Search variant..."
                            value={forms.product.quality_variant || ''} 
                            onChange={(qualVar) => {
                              setForms(prev => ({
                                ...prev,
                                product: {
                                  ...prev.product,
                                  quality_variant: qualVar
                                }
                              }));
                            }} 
                            options={uniqueQualityVariants.map(qv => ({ id: qv, name: qv }))}
                            onAddNew={() => {
                              setIsCustomQualityVariant(true);
                              setForms(prev => ({ ...prev, product: { ...prev.product, quality_variant: '' } }));
                            }}
                            addNewLabel="+ Add New Quality Variant..."
                            allowClear={true}
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
                                const qualVar = chip;
                                setForms(prev => ({
                                  ...prev,
                                  product: {
                                    ...prev.product,
                                    quality_variant: qualVar
                                  }
                                }));
                              }}
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                                forms.product.quality_variant === chip 
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

                  {/* Pricing Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input 
                      label="SELLING PRICE (RETAIL)" 
                      type="number" 
                      placeholder="₹ 0.00"
                      value={forms.product.sale_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, sale_price: v } }))} 
                    />
                    <Input 
                      label="WHOLESALE PRICE (OPTIONAL)" 
                      type="number" 
                      placeholder="₹ 0.00"
                      value={forms.product.wholesale_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, wholesale_price: v } }))} 
                    />
                    <Input 
                      label="PURCHASE PRICE (COST)" 
                      type="number" 
                      placeholder="₹ 0.00"
                      value={forms.product.purchase_price} 
                      onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, purchase_price: v } }))} 
                    />
                  </div>

                  {/* Cloudflare R2 Product Image Upload */}
                  <div className="pt-2">
                    <ProductImageUpload
                      imageUrl={forms.product?.image_url || ''}
                      imageUrls={forms.product?.image_urls || []}
                      onImageChange={({ imageUrl, imageUrls }) => {
                        setForms(prev => ({
                          ...prev,
                          product: {
                            ...prev.product,
                            image_url: imageUrl,
                            image_urls: imageUrls,
                          }
                        }));
                      }}
                      category={forms.product?.part_category || forms.product?.category || 'Display'}
                      disabled={saving}
                    />
                  </div>

                  {/* Description / Compatibility Notes */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">DESCRIPTION / COMPATIBILITY NOTES</label>
                    <textarea 
                      rows={3}
                      className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:border-teal-500 focus:bg-white transition-all resize-none"
                      placeholder="Add product description, compatibility info, quality notes etc..."
                      value={forms.product.description}
                      onChange={(e) => setForms(prev => ({ ...prev, product: { ...prev.product, description: e.target.value } }))}
                    />
                  </div>

                  {/* Initial Available Stock & Stock Status */}
                  <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-6">
                      {!editingProductId && (
                        <div style={{ width: '180px' }}>
                          <Input 
                            label="INITIAL AVAILABLE STOCK ⓘ" 
                            type="number" 
                            placeholder="0"
                            value={forms.product.opening_stock} 
                            onChange={(v) => setForms(prev => ({ ...prev, product: { ...prev.product, opening_stock: v } }))} 
                          />
                        </div>
                      )}

                      <div className="space-y-1">
                        <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">STOCK STATUS ⓘ</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                            Number(forms.product.opening_stock || 0) > 5 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}>
                            <CheckCircle2 size={14} className="text-emerald-600" /> In Stock
                          </span>
                          <span className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                            Number(forms.product.opening_stock || 0) > 0 && Number(forms.product.opening_stock || 0) <= 4
                              ? 'bg-amber-50 text-amber-700 border-amber-300' 
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}>
                            <AlertTriangle size={14} className="text-amber-600" /> Low Stock
                          </span>
                          <span className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                            Number(forms.product.opening_stock || 0) === 0
                              ? 'bg-rose-50 text-rose-700 border-rose-300' 
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}>
                            <XCircle size={14} className="text-rose-600" /> No Stock
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end">
                      <button
                        type="button"
                        onClick={() => setIsAddProductOpen(false)}
                        className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-teal-600/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <PackagePlus size={16} /> {saving ? 'Saving Product...' : editingProductId ? 'Update Product' : 'Save Product'}
                      </button>
                    </div>
                  </div>

                  {/* Product Colours Tagging */}
                  <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
                    <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">Product Colours Tagging</span>
                    <p className="text-[11px] text-slate-500 font-semibold">Select all colours that apply to this product. Typo-free tags keep inventory consistent.</p>
                    
                    <div className="flex flex-wrap gap-2">
                      {data.reference.colours.map((col) => {
                        const isSelected = forms.product.colours.split(',').map(c => c.trim()).includes(col.name);
                        return (
                          <button
                            type="button"
                            key={col.id}
                            onClick={() => handleToggleColour(col.name)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {isSelected && <Check size={12} />}
                            {col.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Inline Quick Add Colour */}
                    <div className="pt-2 flex items-center gap-2 max-w-xs">
                      <input 
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-teal-500"
                        type="text"
                        placeholder="Type new colour..."
                        value={inlineColorInput}
                        onChange={(e) => setInlineColorInput(e.target.value)}
                      />
                      <button 
                        className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                        type="button" 
                        onClick={handleAddInlineColour}
                        disabled={saving}
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>

                    {/* Color-Wise Opening Stock Quantity Input Cards */}
                    {(() => {
                      const taggedColours = (forms.product.colours || '').split(',').map(c => c.trim()).filter(Boolean);
                      if (!taggedColours.length || editingProductId) return null;
                      const totalColorSum = Object.entries(forms.product.color_opening_stock || {})
                        .filter(([c]) => taggedColours.includes(c))
                        .reduce((sum, [, val]) => sum + Number(val || 0), 0);

                      return (
                        <div className="mt-3 p-4 rounded-2xl bg-white border border-teal-300 dark:border-teal-700/80 shadow-xs space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-[11px] font-black text-teal-800 uppercase tracking-wider block">
                                ⚡ Color-Wise Opening Stock Quantities
                              </span>
                              <p className="text-[11px] text-slate-500 font-semibold">
                                Enter different initial quantities for each tagged colour variant.
                              </p>
                            </div>
                            <span className="px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-black">
                              Total Sum: {totalColorSum} pcs
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
                            {taggedColours.map((colName) => (
                              <div key={colName} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-extrabold text-slate-800 truncate block">{colName}</span>
                                </div>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0 pcs"
                                  value={forms.product.color_opening_stock?.[colName] ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const nextMap = {
                                      ...(forms.product.color_opening_stock || {}),
                                      [colName]: val === '' ? '' : Math.max(0, Number(val))
                                    };
                                    const newTotal = Object.entries(nextMap)
                                      .filter(([c]) => taggedColours.includes(c))
                                      .reduce((sum, [, n]) => sum + Number(n || 0), 0);
                                    setForms(prev => ({
                                      ...prev,
                                      product: {
                                        ...prev.product,
                                        color_opening_stock: nextMap,
                                        opening_stock: String(newTotal),
                                      }
                                    }));
                                  }}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 outline-none focus:border-teal-500"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                </div>
              </form>
            </div>
          )}
        </div>

        {/* PANEL 2: Collapsible Reference Manager */}
        <div className="panel" style={{ border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', padding: 0 }}>
          <button 
            type="button" 
            onClick={() => setIsReferenceOpen(!isReferenceOpen)} 
            style={{ width: '100%', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ padding: '8px', borderRadius: '8px', background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
                <Settings size={18} />
              </span>
              <div>
                <strong style={{ fontSize: '15px', display: 'block' }}>Reference Manager</strong>
                <small style={{ opacity: 0.6, fontSize: '12px' }}>Manage list items for phone brands, categories, and colors</small>
              </div>
            </div>
            {isReferenceOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {isReferenceOpen && (
            <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              
              {/* Tab Selector */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '16px', overflowX: 'auto' }}>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('partCategories'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'partCategories' ? 'rgba(13,148,136,0.15)' : 'transparent', color: refTab === 'partCategories' ? '#0d9488' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}
                >
                  Part Categories
                </button>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('productVariants'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'productVariants' ? 'rgba(13,148,136,0.15)' : 'transparent', color: refTab === 'productVariants' ? '#0d9488' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}
                >
                  Quality / Variants
                </button>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('brands'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'brands' ? 'rgba(13,148,136,0.15)' : 'transparent', color: refTab === 'brands' ? '#0d9488' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}
                >
                  Brands {role !== 'superadmin' && <small>(Read-Only)</small>}
                </button>
                <button 
                  type="button" 
                  onClick={() => { setRefTab('colours'); setEditingRef(null); }}
                  style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', border: 'none', cursor: 'pointer', background: refTab === 'colours' ? 'rgba(13,148,136,0.15)' : 'transparent', color: refTab === 'colours' ? '#0d9488' : 'rgba(255,255,255,0.6)', fontWeight: '700' }}
                >
                  Colours
                </button>
              </div>

              {/* Creator form for selected type */}
              {(refTab === 'colours' || refTab === 'partCategories' || refTab === 'productVariants' || role === 'superadmin') ? (
                <form 
                  style={{ display: 'flex', gap: '8px', marginBottom: '16px', maxWidth: '400px' }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (refTab === 'colours') {
                      await onAddReferenceOption('colours', newColorInput);
                      setNewColorInput('');
                    } else if (refTab === 'brands') {
                      await onAddReferenceOption('brands', newBrandInput);
                      setNewBrandInput('');
                    } else if (refTab === 'partCategories') {
                      await onAddReferenceOption('partCategories', newCategoryInput);
                      setNewCategoryInput('');
                    } else if (refTab === 'productVariants') {
                      await onAddReferenceOption('productVariants', newCategoryInput);
                      setNewCategoryInput('');
                    }
                  }}
                >
                  <input 
                    type="text" 
                    placeholder={`New ${refTab === 'partCategories' ? 'part category' : refTab === 'productVariants' ? 'variant' : refTab.slice(0, -1)} name...`}
                    value={refTab === 'colours' ? newColorInput : refTab === 'brands' ? newBrandInput : newCategoryInput}
                    onChange={(e) => {
                      if (refTab === 'colours') setNewColorInput(e.target.value);
                      else if (refTab === 'brands') setNewBrandInput(e.target.value);
                      else setNewCategoryInput(e.target.value);
                    }}
                    style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', fontSize: '13px', color: '#fff', outline: 'none' }}
                  />
                  <button className="primary" type="submit" disabled={saving}>
                    <Plus size={14} style={{ marginRight: '4px' }} /> Add
                  </button>
                </form>
              ) : (
                <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: '8px', fontSize: '12px', color: '#f87171', alignItems: 'center', marginBottom: '16px' }}>
                  <AlertCircle size={14} /> Only Super Admins can add or modify phone brands and categories.
                </div>
              )}

              {/* Items Grid list */}
              {(() => {
                const referenceList = refTab === 'partCategories' 
                  ? ((data.reference?.partCategories && data.reference.partCategories.length) ? data.reference.partCategories : uniquePartCategories.map((pc, i) => ({ id: `pc_${i}`, name: pc })))
                  : refTab === 'productVariants'
                  ? ((data.reference?.productVariants && data.reference.productVariants.length) ? data.reference.productVariants : uniqueQualityVariants.map((qv, i) => ({ id: `qv_${i}`, name: qv })))
                  : refTab === 'brands'
                  ? (data.reference?.brands || [])
                  : (data.reference?.colours || []);
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', maxHeight: '250px', overflowY: 'auto', paddingRight: '6px' }}>
                    {referenceList.map((item) => {
                      const isEditing = editingRef && editingRef.id === item.id && editingRef.type === refTab;
                      return (
                    <div 
                      key={item.id} 
                      style={{ padding: '8px 12px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                          <input 
                            type="text" 
                            value={editingRefName}
                            onChange={(e) => setEditingRefName(e.target.value)}
                            style={{ flex: 1, padding: '4px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid #a855f7', borderRadius: '4px', fontSize: '12px', color: '#fff', outline: 'none' }}
                          />
                          <button 
                            type="button"
                            onClick={async () => {
                              await onEditReferenceOption(refTab, item.id, editingRefName);
                              setEditingRef(null);
                            }}
                            style={{ padding: '4px 6px', background: '#14b8a6', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer' }}
                          >
                            <Check size={12} />
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setEditingRef(null)}
                            style={{ padding: '4px 6px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: '13px' }}>{item.name}</span>
                          {(refTab === 'colours' || role === 'superadmin') && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button 
                                type="button" 
                                title="Rename"
                                onClick={() => {
                                  setEditingRef({ type: refTab, id: item.id, name: item.name });
                                  setEditingRefName(item.name);
                                }}
                                style={{ padding: '4px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
                              >
                                <Edit3 size={12} />
                              </button>
                              <button 
                                type="button" 
                                title="Archive"
                                onClick={() => handleDeleteReference(refTab, item)}
                                style={{ padding: '4px', background: 'transparent', border: 'none', color: '#f87171', opacity: 0.8, cursor: 'pointer' }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

            </div>
          )}
        </div>

        {/* PANEL 3: Export & PDF Tools */}
        <div className="panel" style={{ border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', padding: 0 }}>
          <button 
            type="button" 
            onClick={() => setIsExportOpen(!isExportOpen)} 
            style={{ width: '100%', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ padding: '8px', borderRadius: '8px', background: 'rgba(20,184,166,0.1)', color: '#14b8a6' }}>
                <Download size={18} />
              </span>
              <div>
                <strong style={{ fontSize: '15px', display: 'block' }}>Export & PDF Tools</strong>
                <small style={{ opacity: 0.6, fontSize: '12px' }}>Download stock report sheets or generate printable PDF views</small>
              </div>
            </div>
            {isExportOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          {isExportOpen && (
            <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                
                {/* Export Stock Excel */}
                <button 
                  type="button" 
                  onClick={() => {
                    const exportHandler = exportExcel || exportCsv;
                    if (exportHandler) {
                      exportHandler('stock', {
                        brand: stockFilters.brand,
                        category: stockFilters.category,
                        colour: stockFilters.colour,
                        status: stockFilters.status
                      });
                    }
                  }}
                  style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: '#14b8a6' }}>Export Current Stock (Excel)</span>
                  <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>Download structured Excel spreadsheet (.xlsx) based on active filters and shop selection.</p>
                </button>

                {/* Export Active Products List Excel */}
                <button 
                  type="button" 
                  onClick={() => {
                    const exportHandler = exportExcel || exportCsv;
                    if (exportHandler) {
                      exportHandler('products');
                    }
                  }}
                  style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: '#14b8a6' }}>Export Product Catalog (Excel)</span>
                  <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>Download structured Excel catalog (.xlsx) of active items, brands, model codes, and prices.</p>
                </button>

                {/* PDF Print view */}
                <button 
                  type="button" 
                  onClick={onPrintStock}
                  style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s ease' }}
                >
                  <span style={{ display: 'flex', fontWeight: 600, fontSize: '14px', color: '#14b8a6', alignItems: 'center', gap: '6px' }}><Printer size={14} /> Print Stock Sheet</span>
                  <p style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}>Create a clean PDF-ready stock list with compatible device, stock price, sale price, and remaining quantity.</p>
                </button>

              </div>
            </div>
          )}
        </div>

      </section>

      {/* ==================== 3. LIVE SEARCH & QUICK CATEGORY CHIPS ==================== */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <SearchFilter
              placeholder="Search by model, brand, description, colour code, or supplier..."
              value={stockFilters.search}
              onChange={(val) => setStockFilters(prev => ({ ...prev, search: val }))}
            />
          </div>

          <div className="flex items-center gap-2">
            <button 
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                isFiltersOpen 
                  ? 'bg-teal-50 text-teal-700 border-teal-200 shadow-xs' 
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              type="button" 
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            >
              <SlidersHorizontal size={14} /> 
              <span>Filters</span>
              {(stockFilters.brand || stockFilters.category || stockFilters.colour || stockFilters.status || stockFilters.ownership) && (
                <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              )}
              {isFiltersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            <button
              type="button"
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* Quick Category Chips Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {quickCategories.map((cat) => {
            const Icon = cat.icon;
            const isActive = (!cat.id && !stockFilters.category) || (cat.id && stockFilters.category.toLowerCase() === cat.id.toLowerCase());
            return (
              <button
                key={cat.id || 'all'}
                type="button"
                onClick={() => setStockFilters(prev => ({ ...prev, category: isActive && cat.id ? '' : cat.id }))}
                className={`category-chip ${isActive ? 'active' : ''}`}
              >
                <Icon size={13} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters Accordion Panel */}
      {isFiltersOpen && (
        <section className="panel mb-6 p-4 border border-slate-200 rounded-2xl bg-white/80 backdrop-blur-md shadow-xs space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            
            {/* Category filter */}
            <Select 
              label="Category"
              value={stockFilters.category}
              onChange={(v) => setStockFilters(prev => ({ ...prev, category: v }))}
              options={[['', 'All Categories'], ...data.reference.categories.map(c => [c.name, c.name])]}
            />

            {/* Brand filter */}
            <Select 
              label="Brand"
              value={stockFilters.brand}
              onChange={(v) => setStockFilters(prev => ({ ...prev, brand: v }))}
              options={[['', 'All Brands'], ...data.reference.brands.map(b => [b.name, b.name])]}
            />

            {/* Colour filter */}
            <Select 
              label="Colour"
              value={stockFilters.colour}
              onChange={(v) => setStockFilters(prev => ({ ...prev, colour: v }))}
              options={[['', 'All Colours'], ...data.reference.colours.map(col => [col.name, col.name])]}
            />

            {/* Status filter */}
            <Select 
              label="Stock Status"
              value={stockFilters.status}
              onChange={(v) => setStockFilters(prev => ({ ...prev, status: v }))}
              options={[
                ['', 'All Stock status'],
                ['in_stock', 'In Stock (> Low Stock Threshold)'],
                ['low_stock', 'Low Stock (<= Threshold)'],
                ['out_of_stock', 'Out of Stock (Quantity = 0)'],
                ['recently_added', 'Recently Added (Newest first)']
              ]}
            />

          </div>
          
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button 
              type="button" 
              onClick={() => setStockFilters({ search: '', brand: '', category: '', colour: '', status: '', shopkeeperId: '', ownership: '' })}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        </section>
      )}

      {/* DUAL VIEW MODE: Dense Table vs Compact Cards */}
      {stockWithOwnership.length ? (
        viewMode === 'table' ? (
          /* ==================== 1. DENSE DATA TABLE MODE (DEFAULT) ==================== */
          <div className="stock-table-wrapper overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/95 border-b border-slate-200 backdrop-blur-sm sticky top-0 z-10">
                <tr>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-slate-500" style={{ width: '36%' }}>
                    Product & Compatibility
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-slate-500" style={{ width: '15%' }}>
                    Category & Brand
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-slate-500" style={{ width: '15%' }}>
                    Variants & Colours
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-slate-500" style={{ width: '14%' }}>
                    Price & Margin
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-slate-500" style={{ width: '12%' }}>
                    Stock Status
                  </th>
                  <th className="py-3.5 px-4 text-[11px] font-black uppercase tracking-wider text-slate-500 text-right" style={{ width: '8%' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockWithOwnership.map((item) => (
                  <StockTableRow
                    key={item.id}
                    item={item}
                    data={data}
                    role={role}
                    shopId={shopId}
                    productName={productName}
                    priceLabel={priceLabel}
                    onCloneProduct={onCloneProduct}
                    onEditProduct={onEditProduct}
                    handleDeleteProductConfirm={handleDeleteProductConfirm}
                    setForms={setForms}
                    setColorSplitQuantities={setColorSplitQuantities}
                    setIsSetStockOpen={setIsSetStockOpen}
                    setIsAddProductOpen={setIsAddProductOpen}
                    setEditingProductId={setEditingProductId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ==================== 2. COMPACT VISUAL CARD MODE ==================== */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4.5">
            {stockWithOwnership.map((item) => (
              <StockCardItem
                key={item.id}
                item={item}
                data={data}
                role={role}
                productName={productName}
                priceLabel={priceLabel}
                onCloneProduct={onCloneProduct}
                onEditProduct={onEditProduct}
                handleDeleteProductConfirm={handleDeleteProductConfirm}
                setForms={setForms}
                setColorSplitQuantities={setColorSplitQuantities}
                setIsSetStockOpen={setIsSetStockOpen}
                setIsAddProductOpen={setIsAddProductOpen}
                setEditingProductId={setEditingProductId}
              />
            ))}
          </div>
        )
      ) : (
        <Empty title="No stock matching your criteria found" />
      )}

      {/* Pagination Controls */}
      {stockPager && Number(stockPager.total || stockWithOwnership.length) > 0 && (
        <div className="mt-4 mb-6">
          <Pagination
            meta={stockPager}
            loading={pageLoading?.stock}
            onPageChange={(page) => setStockPager && setStockPager((prev) => ({ ...prev, page }))}
            onPageSizeChange={onStockPageSizeChange}
            pageSizeOptions={[50, 100, 200, 500, 1000, 5000]}
            totalLabel="products in stock"
          />
        </div>
      )}

      {/* Model Catalog Picker Modal for Stock Addition */}
      {isModelPickerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '640px', maxHeight: '85vh', background: '#ffffff', border: '1px solid rgba(226, 232, 240, 0.8)', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '10px', borderRadius: '14px', background: 'rgba(13, 148, 136, 0.1)', color: '#0d9488' }}>
                  <PackagePlus size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Pick Model from Catalog</h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>Select any existing catalog model to update or add new branch stock.</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsModelPickerOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: '6px', borderRadius: '8px' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <SearchFilter
                placeholder="Search catalog models by name, brand, category, or code..."
                value={modelPickerSearch}
                onChange={(val) => setModelPickerSearch(val)}
              />
            </div>

            <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {filteredModelPickerProducts.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => {
                    setForms((prev) => ({
                      ...prev,
                      stock: {
                        ...prev.stock,
                        product_id: String(prod.id),
                        colour: '',
                        quantity: ''
                      }
                    }));
                    setIsModelPickerOpen(false);
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  style={{
                    padding: '14px',
                    borderRadius: '16px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    gap: '10px'
                  }}
                  className="model-picker-item"
                >
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'block', lineHeight: 1.3 }}>{productName(prod)}</span>
                    <small style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'block' }}>{prod.brand || 'Generic'} · {prod.category || 'General'}</small>
                    {fullModelList(prod) && fullModelList(prod) !== productName(prod) && (
                      <span style={{ fontSize: '10px', color: '#0369a1', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', marginTop: '6px', display: 'inline-block', fontWeight: 600 }}>
                        {fullModelList(prod)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669' }}>{priceLabel(prod.sale_price)}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      Select <ArrowRight size={12} />
                    </span>
                  </div>
                </button>
              ))}
              {!filteredModelPickerProducts.length && (
                <div style={{ gridColumn: '1 / -1', padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                  No catalog models match "{modelPickerSearch}"
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setIsModelPickerOpen(false)} style={{ padding: '8px 18px', borderRadius: '10px', background: '#e2e8f0', border: 'none', color: '#334155', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Reference Modal for Brand, Manufacturing Brand & Supplier */}
      <QuickAddReferenceModal
        isOpen={quickAddModal.isOpen}
        onClose={handleCloseQuickAdd}
        type={quickAddModal.type}
        existingItems={
          quickAddModal.type === 'brand'
            ? (data.reference?.brands || []).map((b) => typeof b === 'string' ? b : b.name || b.brand)
            : quickAddModal.type === 'manufacturing-brand'
              ? (data.reference?.manufacturingBrands || []).map((mb) => mb.name)
              : (data.reference?.suppliers || []).map((s) => s.name)
        }
        onSave={handleSaveQuickAdd}
      />

    </section>
  );
}
