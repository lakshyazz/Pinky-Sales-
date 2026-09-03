import React, { useDeferredValue, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Contact,
  CreditCard,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  History,
  ListFilter,
  Loader2,
  IndianRupee,
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  Package,
  Smartphone,
  Plus,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Sun,
  Tag,
  Tags,
  Trash2,
  Truck,
  UserCog,
  Users,
  UploadCloud,
  Check,
  CheckCircle2,
  Clock,
  Calendar,
  Filter,
  X,
  Wrench,
  Cpu,
  Layers,
  RotateCcw,
  Pencil,
  Copy,
  Share2,
  BookOpen,
} from 'lucide-react';
const SalesReturnModal = React.lazy(() => import('./components/modals/SalesReturnModal'));
const EditSaleModal = React.lazy(() => import('./components/modals/EditSaleModal'));
const ShareInvoiceModal = React.lazy(() => import('./components/modals/ShareInvoiceModal'));
const ProductDetailModal = React.lazy(() => import('./components/models/ProductDetailModal'));
const ProductDetailPage = React.lazy(() => import('./components/models/ProductDetailPage'));
// Route-level lazy imports — each page loads its own JS chunk on first visit
const ModelsPage = React.lazy(() => import('./components/models/ModelsPage'));
const PricesPage = React.lazy(() => import('./components/prices/PricesPage'));
const StockPage = React.lazy(() => import('./components/stock/StockPage'));
const LowStockPage = React.lazy(() => import('./components/stock/LowStockPage'));
const BranchOrderStockPage = React.lazy(() => import('./components/stock/BranchOrderStockPage'));
const SuperAdminStockRequestsPage = React.lazy(() => import('./components/stock/SuperAdminStockRequestsPage'));
const BrandsPage = React.lazy(() => import('./components/brands/BrandsPage'));
const ManufacturingBrandsPage = React.lazy(() => import('./components/manufacturing-brands/ManufacturingBrandsPage'));
const SuppliersPage = React.lazy(() => import('./components/suppliers/SuppliersPage'));
const PartyLedger = React.lazy(() => import('./components/ledger/PartyLedger'));
const AgingReport = React.lazy(() => import('./components/reports/AgingReport'));
const PurchaseBillsPage = React.lazy(() => import('./components/billing/PurchaseBillsPage'));
const DebitNotesPage = React.lazy(() => import('./components/billing/DebitNotesPage'));
// Named export wrapper for CategoriesPage
const CategoriesPage = React.lazy(() => import('./components/other-products/CategoriesPage').then(m => ({ default: m.CategoriesPage })));
const ShopkeeperLoginsPage = React.lazy(() => import('./components/operations/ShopkeeperLoginsPage'));
const SupplierImportWorkspace = React.lazy(() => import('./components/operations/SupplierImportWorkspace'));
// Shared UI primitives — tiny, used on every page, keep static
import Pagination from './components/ui/Pagination';
import SmartSkeletonWrapper, { CardSkeleton, TableRowSkeleton } from './components/ui/SkeletonLoader';
import SearchInput from './components/ui/SearchInput';
import SearchableCombobox from './components/ui/SearchableCombobox';
import RedesignedDashboard from './components/dashboard/RedesignedDashboard';
import { consolidateProductList } from './utils/productConsolidation';
import { 
  shareToWhatsAppService, 
  formatWhatsAppMessage,
  generateInvoicePDFDoc, 
  generateStatementPDFDoc, 
  generateLedgerPDFDoc,
  getBrandName
} from './utils/pdfAndShareService';
import { 
  exportToExcel, 
  exportStockPricesExcel, 
  exportCurrentStockExcel, 
  exportProductCatalogExcel, 
  getExportDateStr 
} from './utils/excelExport';

const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const API_BASE = (
  configuredApiBase || (isLocalhost ? 'http://localhost:5000/api' : '/api')
).replace(/\/$/, '');

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const api = async (path, options = {}, token = '') => {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rawError = data.error || data.message || data;
      const errorMessage = typeof rawError === 'string'
        ? rawError
        : rawError?.message || (typeof rawError === 'object' && Object.keys(rawError).length ? JSON.stringify(rawError) : '') || 'Invalid credentials or server error.';
      throw new ApiError(errorMessage, response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (url.includes(':5000')) {
      try {
        const fallbackUrl = `/api${path.startsWith('/') ? path : `/${path}`}`;
        const fallbackResp = await fetch(fallbackUrl, {
          ...options,
          headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {}),
          },
        });
        const fallbackData = await fallbackResp.json().catch(() => ({}));
        if (!fallbackResp.ok) {
          const rawError = fallbackData.error || fallbackData.message || fallbackData;
          const msg = typeof rawError === 'string' ? rawError : rawError?.message || 'Invalid credentials or server error.';
          throw new ApiError(msg, fallbackResp.status);
        }
        return fallbackData;
      } catch (fbErr) {
        if (fbErr instanceof ApiError) throw fbErr;
      }
    }
    throw new ApiError(err?.message || 'Cannot reach server. Please ensure backend server is running on port 5000.');
  }
};

const isSessionError = (error) => (
  error?.status === 401
  || (error?.status === 403 && /session expired|invalid token|login again/i.test(error.message))
);
const inferToastTone = (message) => {
  const str = String(message || '');
  if (/downloaded|saved|updated|created|added|transferred|cleared|shared|success|copied|received|generated|approved|completed|done|reset/i.test(str)) {
    return 'success';
  }
  if (/unable|failed|error|wrong|invalid|cannot reach|denied|unauthorized|forbidden|rejected|not found|not enough|out of stock|already in use|must be/i.test(str)) {
    return 'error';
  }
  return 'success';
};

const normalizeSession = (session) => {
  if (!session) return session;
  const role = session.role === 'admin' ? 'shopkeeper' : session.role === 'user' ? 'customer' : session.role;
  return { ...session, role };
};

const readStoredSession = () => {
  try {
    const raw = localStorage.getItem('session');
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const segment = parsed.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedSegment = segment.padEnd(segment.length + ((4 - (segment.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(paddedSegment));
    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem('session');
      return null;
    }
    if (parsed.name === 'Father - Super Admin') parsed.name = 'Super Admin';
    return normalizeSession(parsed);
  } catch {
    localStorage.removeItem('session');
    return null;
  }
};

const currency = (value) => {
  const num = Number(value || 0);
  if (Math.abs(num - Math.round(num)) < 0.005) {
    return `\u20b9${Math.round(num).toLocaleString('en-IN')}`;
  }
  return `\u20b9${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const today = () => new Date().toISOString().slice(0, 10);
const compactModelName = (value) => {
  const name = String(value || 'Unnamed product').trim();
  if (name.length <= 60) return name;
  const firstModel = name.split('/')[0].trim();
  return firstModel.length <= 60 ? firstModel : `${firstModel.slice(0, 57)}...`;
};
const productName = (item, options = {}) => {
  let rawBase = item?.short_name || item?.product_short_name || item?.display_name || item?.name || item?.product_name || item?.model_name || '';
  
  // Sanitize any internal supplier suffixes from rawBase (e.g. "- JENNY", " - JENNY", "(... - JENNY)")
  const supplierName = item?.supplier_name || (typeof item?.supplier === 'string' ? item?.supplier : '');
  if (supplierName) {
    const escaped = supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rawBase = rawBase.replace(new RegExp(`\\s*[-–—/]?\\s*${escaped}\\b`, 'gi'), '');
  }
  // Strip uppercase vendor tags like " - JENNY"
  rawBase = rawBase.replace(/\s*[-–—]\s*[A-Z0-9_]{3,20}\s*$/g, '').trim();

  const baseName = compactModelName(rawBase);
  const mfg = item?.manufacturing_brand_name || item?.mfg_brand_name || (typeof item?.manufacturing_brand === 'string' ? item?.manufacturing_brand : null);
  const variant = item?.quality_variant || item?.product_variant_name || (typeof item?.variant === 'string' ? item?.variant : null);
  const supplier = options.hideSupplier ? null : (item?.supplier_name || (typeof item?.supplier === 'string' ? item?.supplier : null));

  const parts = [];
  const cleanMfg = mfg ? String(mfg).replace(/^mfg:\s*/i, '').trim() : null;
  if (cleanMfg && !baseName.toLowerCase().includes(cleanMfg.toLowerCase())) parts.push(cleanMfg);
  if (variant && !baseName.toLowerCase().includes(variant.toLowerCase())) parts.push(variant);
  if (supplier && !baseName.toLowerCase().includes(supplier.toLowerCase())) parts.push(supplier);

  if (parts.length > 0) {
    return `${baseName} (${parts.join(' - ')})`;
  }
  return baseName;
};

function getProductAvailableColors(product) {
  if (!product) return [];
  const colorSet = new Set();

  const addColor = (c) => {
    if (!c) return;
    const str = String(c).trim();
    if (!str || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null' || str.toLowerCase() === 'standard' || str.toLowerCase() === 'default') return;
    colorSet.add(str);
  };

  // 1. From product.available_colours or product.available_colors
  const rawAvail = product.available_colours || product.available_colors;
  if (Array.isArray(rawAvail)) {
    rawAvail.forEach(addColor);
  } else if (typeof rawAvail === 'string' && rawAvail.trim()) {
    try {
      const parsed = JSON.parse(rawAvail);
      if (Array.isArray(parsed)) parsed.forEach(addColor);
      else rawAvail.split(',').forEach(addColor);
    } catch {
      rawAvail.split(',').forEach(addColor);
    }
  }

  // 2. From product.colours or product.colors
  const rawColours = product.colours || product.colors;
  if (Array.isArray(rawColours)) {
    rawColours.forEach(addColor);
  } else if (typeof rawColours === 'string' && rawColours.trim()) {
    try {
      const parsed = JSON.parse(rawColours);
      if (Array.isArray(parsed)) parsed.forEach(addColor);
      else rawColours.split(',').forEach(addColor);
    } catch {
      rawColours.split(',').forEach(addColor);
    }
  }

  return Array.from(colorSet);
}

const fullModelList = (item) => item?.full_model_list || item?.name || item?.product_name || item?.model_name || '';
const priceLabel = (value) => Number(value) > 0 ? currency(value) : 'Price not set';
const normalizedText = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const sameText = (left, right) => normalizedText(left) === normalizedText(right);
const joinUniqueText = (values = [], fallback = '') => {
  const seen = new Set();
  const unique = values.filter((value) => {
    const key = normalizedText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(' · ') || fallback;
};
const uniqueNamedItems = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizedText(item?.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const cleanReferenceData = (reference = {}) => ({
  categories: uniqueNamedItems(reference.categories),
  colours: uniqueNamedItems(reference.colours),
  brands: uniqueNamedItems(reference.brands),
  manufacturingBrands: uniqueNamedItems(reference.manufacturingBrands),
  suppliers: uniqueNamedItems(reference.suppliers),
  partCategories: uniqueNamedItems(reference.partCategories),
  productVariants: uniqueNamedItems(reference.productVariants),
});
const sanitizeFormText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const buildDeviceModelGroups = (models = []) => {
  const groups = new Map();
  models.forEach((model) => {
    const brand = model.brand || 'Unassigned';
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand).push(model);
  });
  return [...groups.values()];
};
const combineLowStockAlerts = (items = []) => {
  const combined = new Map();
  items.forEach((item) => {
    const key = `${normalizedText(item.shop_name)}::${normalizedText(productName(item))}`;
    const existing = combined.get(key);
    if (!existing) {
      combined.set(key, { ...item, quantity: Number(item.quantity || 0) });
      return;
    }
    existing.quantity += Number(item.quantity || 0);
    existing.low_stock_threshold = Math.max(Number(existing.low_stock_threshold || 0), Number(item.low_stock_threshold || 0));
  });
  return [...combined.values()].filter((item) => {
    const quantity = Number(item.quantity || 0);
    return quantity > 0 && quantity <= Number(item.low_stock_threshold || 0);
  });
};
const combineStockRows = (items = []) => {
  const combined = new Map();
  items.forEach((item) => {
    const key = `${item.shop_id || ''}::${normalizedText(productName(item))}`;
    const existing = combined.get(key);
    if (!existing) {
      combined.set(key, {
        ...item,
        quantity: Number(item.quantity || 0),
        owner_quantity: Number(item.owner_quantity || 0),
        shopkeeper_quantity: Number(item.shopkeeper_quantity || 0),
        my_quantity: Number(item.my_quantity || 0),
        owner_batch_count: Number(item.owner_batch_count || 0),
        shopkeeper_batch_count: Number(item.shopkeeper_batch_count || 0),
        my_batch_count: Number(item.my_batch_count || 0),
        batch_count: Number(item.batch_count || 0),
        product_ids: [String(item.product_id)],
      });
      return;
    }
    existing.quantity += Number(item.quantity || 0);
    existing.owner_quantity += Number(item.owner_quantity || 0);
    existing.shopkeeper_quantity += Number(item.shopkeeper_quantity || 0);
    existing.my_quantity += Number(item.my_quantity || 0);
    existing.owner_batch_count += Number(item.owner_batch_count || 0);
    existing.shopkeeper_batch_count += Number(item.shopkeeper_batch_count || 0);
    existing.my_batch_count += Number(item.my_batch_count || 0);
    existing.batch_count += Number(item.batch_count || 0);
    existing.product_ids.push(String(item.product_id));
  });
  return [...combined.values()];
};
const groupPendingPayments = (rows = []) => {
  if (rows.every((row) => Array.isArray(row.items))) return rows;
  const groups = new Map();
  rows.forEach((sale) => {
    const key = `${sale.shop_id}:${sale.mobile || sale.customer_id}`;
    const group = groups.get(key) || {
      id: `customer-${key}`,
      customer_id: sale.customer_id,
      shop_id: sale.shop_id,
      customer_name: sale.customer_name,
      mobile: sale.mobile,
      address: sale.address,
      shop_name: sale.shop_name,
      shop_area: sale.shop_area,
      shop_address: sale.shop_address,
      shop_phone: sale.shop_phone,
      total_amount: 0,
      paid_amount: 0,
      pending_amount: 0,
      due_date: sale.due_date,
      items: [],
    };
    group.total_amount += Number(sale.total_amount || 0);
    group.paid_amount += Number(sale.paid_amount || 0);
    group.pending_amount += Number(sale.pending_amount || 0);
    if (sale.due_date && (!group.due_date || sale.due_date < group.due_date)) group.due_date = sale.due_date;
    group.items.push(sale);
    groups.set(key, group);
  });
  return [...groups.values()];
};
const navByRole = {
  superadmin: [
    ['dashboard', 'Dashboard', BarChart3],
    ['prices', 'Prices', IndianRupee],
    ['stock', 'Stock', Package],
    ['customers', 'Customers', Users],
    ['sales', 'Sales', ReceiptText],
    ['payments', 'Pending', CreditCard],
    ['tools', 'Tools', Wrench],
    ['spares', 'Spares', Cpu],
    ['oca-glass', 'OCA glass', Layers],
    ['other-category', 'Other category', LayoutGrid],
    ['low-stock', 'Low Stock', AlertTriangle],
    ['requests', 'Stock Requisitions', Boxes],
    ['models', 'Models', Smartphone],
    ['brands', 'Brands', Tags],
    ['manufacturing-brands', 'Manufacturing Brands', Tags],
    ['suppliers', 'Suppliers', Users],
    ['categories', 'Product Categories', Store],
    ['purchase-bills', 'Purchase Bills', ShoppingCart],
    ['debit-notes', 'Debit Notes (Returns)', RotateCcw],
    ['ledger', 'Party Ledger', BookOpen],
    ['aging', 'AR/AP Aging', Clock],
    ['shops', 'Shops', Building2],
    ['shopkeepers', 'Shopkeepers', UserCog],
    ['import', 'Supplier Import', UploadCloud],
    ['reports', 'Reports', FileText],
  ],
  shopkeeper: [
    ['dashboard', 'Dashboard', BarChart3],
    ['prices', 'Prices', IndianRupee],
    ['stock', 'Stock', Package],
    ['customers', 'Customers', Users],
    ['sales', 'Create Sale', ReceiptText],
    ['payments', 'Pending', CreditCard],
    ['tools', 'Tools', Wrench],
    ['spares', 'Spares', Cpu],
    ['oca-glass', 'OCA glass', Layers],
    ['other-category', 'Other category', LayoutGrid],
    ['low-stock', 'Low Stock', AlertTriangle],
    ['order-stock', 'Order Stock', ShoppingCart],
    ['requests', 'My Requisitions', History],
    ['models', 'Models', Smartphone],
    ['brands', 'Brands', Tags],
    ['manufacturing-brands', 'Manufacturing Brands', Tags],
    ['suppliers', 'Suppliers', Users],
    ['categories', 'Product Categories', Store],
    ['purchase-bills', 'Purchase Bills', ShoppingCart],
    ['debit-notes', 'Debit Notes (Returns)', RotateCcw],
    ['ledger', 'Party Ledger', BookOpen],
    ['aging', 'AR/AP Aging', Clock],
    ['reports', 'Reports', FileText],
  ],
  supplier: [
    ['dashboard', 'Dashboard', BarChart3],
    ['prices', 'Prices', IndianRupee],
    ['tools', 'Tools', Wrench],
    ['spares', 'Spares', Cpu],
    ['oca-glass', 'OCA glass', Layers],
    ['other-category', 'Other category', LayoutGrid],
    ['models', 'Models', Smartphone],
  ],
  customer: [
    ['catalog', 'Catalog', ShoppingBag],
    ['tools', 'Tools', Wrench],
    ['spares', 'Spares', Cpu],
    ['oca-glass', 'OCA glass', Layers],
    ['other-category', 'Other category', LayoutGrid],
    ['models', 'Models', Smartphone],
  ],
};
navByRole.admin = navByRole.shopkeeper;
navByRole.user = navByRole.customer;

const sidebarSectionsByRole = {
  superadmin: [
    { title: 'Overview', ids: ['dashboard'] },
    { title: 'Operations', ids: ['prices', 'stock', 'customers', 'sales', 'payments', 'tools', 'spares', 'oca-glass', 'other-category'] },
    { title: 'Inventory & Catalog', ids: ['low-stock', 'requests', 'models', 'brands', 'manufacturing-brands', 'suppliers', 'categories'] },
    { title: 'Accounts Payable', ids: ['purchase-bills', 'debit-notes'] },
    { title: 'Ledger & Reports', ids: ['ledger', 'aging'] },
    { title: 'Management', ids: ['shops', 'shopkeepers', 'import'] },
    { title: 'Reports', ids: ['reports'] },
  ],
  shopkeeper: [
    { title: 'Overview', ids: ['dashboard'] },
    { title: 'Operations', ids: ['prices', 'stock', 'customers', 'sales', 'payments', 'tools', 'spares', 'oca-glass', 'other-category'] },
    { title: 'Stock Replenishment', ids: ['low-stock', 'order-stock', 'requests'] },
    { title: 'Catalog & Brands', ids: ['models', 'brands', 'manufacturing-brands', 'suppliers', 'categories'] },
    { title: 'Accounts Payable', ids: ['purchase-bills', 'debit-notes'] },
    { title: 'Ledger & Reports', ids: ['ledger', 'aging'] },
    { title: 'Reports', ids: ['reports'] },
  ],
  supplier: [
    { title: 'Overview', ids: ['dashboard'] },
    { title: 'Catalog & Prices', ids: ['prices', 'tools', 'spares', 'oca-glass', 'other-category', 'models'] },
  ],
  customer: [
    { title: 'Catalog', ids: ['catalog', 'tools', 'spares', 'oca-glass', 'other-category', 'models'] },
  ],
};
sidebarSectionsByRole.admin = sidebarSectionsByRole.shopkeeper;
sidebarSectionsByRole.user = sidebarSectionsByRole.customer;

const isToolsCategory = (p) => {
  const cat = String(p?.part_category || p?.part_category_name || p?.category || '').trim().toLowerCase();
  const name = String(p?.short_name || p?.name || '').toLowerCase();
  return cat.includes('tool') || 
         cat.includes('blade') || 
         cat.includes('cutter') || 
         cat.includes('tweezer') || 
         cat.includes('cleaning') || 
         cat.includes('solvent') || 
         cat.includes('machine') || 
         cat.includes('soldering') || 
         cat.includes('screw') || 
         cat.includes('opening') ||
         name.includes('screw') ||
         name.includes('tweezer') ||
         name.includes('opener');
};

const isSparesCategory = (p) => {
  const cat = String(p?.part_category || p?.part_category_name || p?.category || '').trim().toLowerCase();
  const name = String(p?.short_name || p?.name || '').toLowerCase();
  return cat.includes('spare') || 
         cat.includes('flex') || 
         cat.includes('ic') || 
         cat.includes('camera') || 
         cat.includes('battery') || 
         cat.includes('charging') || 
         cat.includes('speaker') || 
         cat.includes('sim') || 
         cat.includes('housing') || 
         cat.includes('button') || 
         cat.includes('pcb') || 
         cat.includes('mic') || 
         cat.includes('ringer') || 
         cat.includes('vibrat') ||
         cat.includes('sensor');
};

const isOcaGlassCategory = (p) => {
  const cat = String(p?.part_category || p?.part_category_name || p?.category || '').trim().toLowerCase();
  const name = String(p?.short_name || p?.name || '').toLowerCase();
  return cat.includes('oca') || 
         cat.includes('glass') || 
         cat.includes('touch') || 
         name.includes('oca') || 
         (name.includes('glass') && !name.includes('back glass') && !cat.includes('display'));
};

const isDisplayCategory = (p) => {
  const cat = String(p?.part_category || p?.part_category_name || p?.category || '').trim().toLowerCase();
  return cat.includes('display') || cat.includes('combo') || cat.includes('folder') || cat.includes('screen') || cat.includes('lcd') || cat.includes('oled') || cat.includes('tft') || cat.includes('in-cell');
};

const isOtherCategory = (p) => {
  return !isToolsCategory(p) && !isSparesCategory(p) && !isOcaGlassCategory(p) && !isDisplayCategory(p);
};

const pageMetaById = {
  dashboard: {
    group: 'Overview',
    title: 'Dashboard',
    description: 'Track sales, stock health, pending payments, and branch activity from one clean command center.',
  },
  'order-stock': {
    group: 'Stock Replenishment',
    title: 'Order Stock from Warehouse',
    description: 'Browse Central Warehouse live stock, choose color variants, and submit replenishment orders.',
  },
  shops: {
    group: 'Operations',
    title: 'Branches',
    description: 'Manage shop locations, branch details, and branch-level performance.',
  },
  shopkeepers: {
    group: 'Operations',
    title: 'Shopkeepers',
    description: 'Create and manage branch staff access without changing inventory history.',
  },
  import: {
    group: 'Operations',
    title: 'Supplier Excel Import',
    description: 'Ingest supplier inventory spreadsheets automatically into FIFO stock and product catalog.',
  },
  stock: {
    group: 'Inventory',
    title: 'Consolidated Stock',
    description: 'View complete stock availability across warehouse, branches, models, colours, and product groups.',
  },
  brands: {
    group: 'Inventory',
    title: 'Brands',
    description: 'Browse company cards and drill into every product grouped under that brand.',
  },
  'manufacturing-brands': {
    group: 'Inventory',
    title: 'Manufacturing Brands',
    description: 'Browse LCD/display manufacturers (e.g. AS CARE, Kaiku, GX) and view stock statistics.',
  },
  suppliers: {
    group: 'Inventory',
    title: 'Suppliers Registry',
    description: 'Browse supplier cards and trace stock batch sourcing.',
  },
  models: {
    group: 'Inventory',
    title: 'Models',
    description: 'Search product models and compatible devices with corrected pagination.',
  },
  prices: {
    group: 'Pricing',
    title: 'Stock Prices',
    description: 'Review and edit purchase, selling, and wholesale prices from the product catalog.',
  },
  tools: {
    group: 'Operations',
    title: 'Tools',
    description: 'Browse repair tools, opening kits, soldering items, screwdrivers, and workshop equipment.',
  },
  spares: {
    group: 'Operations',
    title: 'Spares',
    description: 'Browse replacement flex cables, ICs, charging ports, cameras, batteries, and hardware spare parts.',
  },
  'oca-glass': {
    group: 'Operations',
    title: 'OCA glass',
    description: 'Browse OCA sheets, outer glass, touch digitizers, and lamination consumables.',
  },
  'other-category': {
    group: 'Operations',
    title: 'Other category',
    description: 'Browse all other specialized product categories, accessories, and consumables.',
  },
  'categories': {
    group: 'Inventory',
    title: 'Product Categories',
    description: 'Manage global product categories.',
  },
  customers: {
    group: 'Operations',
    title: 'Customers',
    description: 'Manage customer accounts, purchases, invoices, and pending balances.',
  },
  sales: {
    group: 'Operations',
    title: 'Sales',
    description: 'Create sales, choose price type, and keep FIFO stock allocation intact.',
  },
  requests: {
    group: 'Stock Replenishment',
    title: 'Stock Requisitions',
    description: 'Review, approve, and dispatch branch stock requisitions with automatic inventory transfer.',
  },
  payments: {
    group: 'Operations',
    title: 'Pending Payments',
    description: 'Follow up customer dues and record payments safely.',
  },
  reports: {
    group: 'Reports',
    title: 'Reports',
    description: 'Shop pending balances and audit logs.',
  },
  'low-stock': {
    group: 'Inventory',
    title: 'Low & Out of Stock Alerts',
    description: 'Monitor critical deficit inventory requiring immediate restock across branches & warehouse.',
  },
  catalog: {
    group: 'Customer View',
    title: 'Catalog',
    description: 'Browse available products, models, prices, and shop availability.',
  },
};

const validPageIds = new Set([...Object.values(navByRole).flatMap((items) => items.map(([id]) => id)), 'low-stock', 'order-stock', 'stock-requests', 'tools', 'spares', 'oca-glass', 'other-category']);
const defaultPageForRole = (role) => (role === 'customer' || role === 'user' ? 'catalog' : 'dashboard');
const pageFromPath = () => {
  if (typeof window === 'undefined') return '';
  const page = decodeURIComponent(window.location.pathname).replace(/^\/+|\/+$/g, '');
  return validPageIds.has(page) ? page : '';
};
const initialPageForSession = (session) => pageFromPath() || defaultPageForRole(session?.role);

const handleFormKeyDown = (e) => {
  if (e.key === 'Enter') {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      const form = target.form;
      if (!form) return;
      const elements = Array.from(form.elements).filter(el => 
        (el.tagName === 'INPUT' || el.tagName === 'SELECT' || (el.tagName === 'BUTTON' && el.type === 'submit')) &&
        !el.disabled && el.type !== 'hidden'
      );
      const index = elements.indexOf(target);
      if (index > -1 && index < elements.length - 1) {
        const nextEl = elements[index + 1];
        if (nextEl.tagName === 'INPUT' || nextEl.tagName === 'SELECT') {
          e.preventDefault();
          nextEl.focus();
        }
      }
    }
  }
};

const PAYMENT_TERMS_PRESETS = [7, 15, 30, 45, 60];

const getTodayIso = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateDMY = (dateStr) => {
  if (!dateStr) return '';
  const clean = String(dateStr).trim().slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    // YYYY-MM-DD -> DD-MM-YYYY
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
};

const calculateDueDate = (invoiceDateStr, termsDays) => {
  if (!invoiceDateStr) return '';
  const days = parseInt(termsDays, 10);
  const validDays = isNaN(days) ? 0 : days;
  const parts = String(invoiceDateStr).slice(0, 10).split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    d.setDate(d.getDate() + validDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  }
  return invoiceDateStr;
};

const initialForms = {
  shop: { name: '', area: '', address: '', phone: '' },
  shopkeeper: { username: '', password: '', name: '', contact: '', shop_id: '' },
  product: {
    short_name: '', full_model_list: '', brand: '', part_category: 'Display', quality_variant: 'OLED', model: '',
    official_price: '', purchase_price: '', sale_price: '', wholesale_price: '', retail_price: '',
    opening_stock: '', description: '', colours: '', manufacturing_brand_id: '', supplier_id: '',
    image_url: '', image_urls: [],
  },
  stock: { product_id: '', quantity: '', colour: '', supplier_id: '' },
  customer: { name: '', mobile: '', address: '', gstin: '', customer_type: 'retailer' },
  sale: {
    product_id: '',
    customer_id: '',
    quantity: 0,
    selling_price: '',
    original_total: '',
    final_total_amount: '',
    products_total: '',
    extra_expenses_total: '0',
    total_amount: '',
    discount_amount: '0',
    discount_percentage: '0',
    is_custom_total: false,
    paid_amount: '',
    payment_mode: 'cash',
    invoice_date: getTodayIso(),
    payment_terms_days: 7,
    due_date: calculateDueDate(getTodayIso(), 7),
    notes: '',
    previous_balance: 0,
    applied_credit_amount: 0,
    items: [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '' }],
    expenses: [],
  },
  payment: { sale_id: '', amount: '', note: '' },
  request: { product_id: '', model_name: '', quantity: 1, message: '' },
  transfer: { from_shop_id: '', to_shop_id: '', product_id: '', quantity: '', note: '' },
};

const trendFromValue = (value, shape = 'up') => {
  const base = Math.max(Number(value || 0), 1);
  const multipliers = shape === 'pending'
    ? [0.72, 0.8, 0.76, 0.92, 0.88, 1, 0.96]
    : [0.45, 0.52, 0.5, 0.65, 0.74, 0.86, 1];
  return multipliers.map((item) => Math.round(base * item));
};

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 280, damping: 22 }
  }
};

function Magnetic({ children, className = 'inline-block' }) {
  const ref = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 15, stiffness: 150, mass: 0.6 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  useEffect(() => {
    const isMobile = !window.matchMedia('(hover: hover)').matches;
    if (isMobile) return;

    const handleMouseMove = (e) => {
      if (!ref.current) return;
      const { clientX, clientY } = e;
      const { left, top, width, height } = ref.current.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      const distanceX = clientX - centerX;
      const distanceY = clientY - centerY;

      const radius = 60;
      const distance = Math.hypot(distanceX, distanceY);

      if (distance < radius) {
        setIsHovered(true);
        const pull = 0.35;
        x.set(distanceX * pull);
        y.set(distanceY * pull);
      } else {
        setIsHovered(false);
        x.set(0);
        y.set(0);
      }
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      x.set(0);
      y.set(0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    ref.current?.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      ref.current?.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      style={{ x: springX, y: springY }}
      animate={{ scale: isHovered ? 1.04 : 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Sparkline({ data = [], tone = 'teal' }) {
  const values = data.length > 1 ? data.map((item) => Number(item || 0)) : [0, 0, 0, 0, 0, 0, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 84;
    const y = 34 - ((value - min) / range) * 28;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const [lastX, lastY] = points[points.length - 1].split(',');
  const pathString = `M ${points.map(p => p.replace(',', ' ')).join(' L ')}`;

  return (
    <svg className={`sparkline ${tone}`} viewBox="0 0 84 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`grad-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${pathString} L 84 40 L 0 40 Z`}
        fill={`url(#grad-${tone})`}
        className="sparkline-area"
      />
      <motion.path
        d={pathString}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <motion.circle 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 200 }}
        cx={lastX} 
        cy={lastY} 
        r="3" 
        fill="currentColor"
        stroke="#ffffff"
        strokeWidth="2"
      />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, helper, tone = 'blue', trend, sparklineTone }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={`panel stat ${tone} ${trend ? 'has-trend' : 'no-trend'}`}
    >
      <div className="stat-icon"><Icon size={22} /></div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {helper && <small>{helper}</small>}
      </div>
      {trend && <Sparkline data={trend} tone={sparklineTone || tone} />}
    </motion.div>
  );
}

function Empty({ title }) {
  return <div className="empty"><Package size={18} /> {title}</div>;
}

function BillSummary({ sale }) {
  const items = sale.items || [];
  const expenses = Array.isArray(sale.expenses) ? sale.expenses : [];
  const extraExpensesTotal = expenses.reduce((sum, exp) => sum + Math.max(Number(exp.amount || 0), 0), 0);
  const productsTotal = Number(sale.products_total || (Number(sale.total_amount || 0) - extraExpensesTotal));
  const currentInvoiceTotal = Number(sale.current_invoice_total || (productsTotal + extraExpensesTotal));
  const previousBalance = Number(sale.previous_balance || 0);
  const appliedCredit = Number(sale.applied_credit_amount || 0);
  const netPayable = Number(sale.net_payable_amount || (currentInvoiceTotal + previousBalance - appliedCredit));
  const paidAmount = Number(sale.paid_amount || 0);
  const closingBalance = Number(sale.closing_balance !== undefined && sale.closing_balance !== null ? sale.closing_balance : (sale.pending_amount || Math.max(0, netPayable - paidAmount)));

  const getStatusBadge = () => {
    if (netPayable === 0 && currentInvoiceTotal === 0) return { label: 'Empty Bill', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    if (paidAmount >= netPayable && netPayable > 0) return { label: 'Fully Settled', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    if (paidAmount > 0) return { label: `Partial (₹${closingBalance.toLocaleString('en-IN')} Due)`, color: 'bg-amber-100 text-amber-800 border-amber-300' };
    return { label: 'Pending / Unpaid', color: 'bg-rose-100 text-rose-800 border-rose-300' };
  };

  const status = getStatusBadge();

  return (
    <section className="bill-summary md:col-span-4" aria-label="Bill summary">
      <div className="flex items-center justify-between col-span-full mb-1">
        <span className="bill-summary-kicker">Bill summary & Accounting</span>
        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${status.color}`}>
          {status.label}
        </span>
      </div>
      <div>
        <small>Items</small>
        <strong>{items.length || 1}</strong>
      </div>
      <div>
        <small>Products subtotal</small>
        <strong>{currency(productsTotal)}</strong>
      </div>
      <div>
        <small>Extra expenses</small>
        <strong className={extraExpensesTotal > 0 ? 'text-teal-700' : 'text-slate-500'}>
          {currency(extraExpensesTotal)}
        </strong>
      </div>
      <div>
        <small>Current sale total</small>
        <strong>{currency(currentInvoiceTotal)}</strong>
      </div>
      {previousBalance > 0 && (
        <div>
          <small>Previous balance</small>
          <strong className="text-amber-700">+{currency(previousBalance)}</strong>
        </div>
      )}
      {appliedCredit > 0 && (
        <div>
          <small>Credit note applied</small>
          <strong className="text-teal-700">-{currency(appliedCredit)}</strong>
        </div>
      )}
      <div>
        <small>Net payable</small>
        <strong className="text-slate-900 font-black">{currency(netPayable)}</strong>
      </div>
      <div>
        <small>Paid amount</small>
        <strong className="text-emerald-700">{currency(paidAmount)}</strong>
      </div>
      <div>
        <small>Closing balance</small>
        <strong className={closingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}>{currency(closingBalance)}</strong>
      </div>
    </section>
  );
}

const SaleItemRow = React.memo(function SaleItemRow({
  item,
  idx,
  itemsLength,
  salesProductOptions,
  data,
  getProductAvailableColors,
  updateSaleItemProduct,
  updateSaleItemCustomName,
  updateSaleItemCustomBrand,
  updateSaleItemPriceType,
  updateSaleItemSellingPrice,
  updateSaleItemQuantity,
  toggleSaleItemColor,
  updateSaleItemSingleColor,
  updateSaleItemColorQuantity,
  removeSaleItem,
}) {
  const selectedProd = (data.products || []).find((p) => String(p.id || p.product_id) === String(item.product_id)) 
    || (data.productResults || []).find((p) => String(p.id || p.product_id) === String(item.product_id))
    || (data.catalog || []).find((p) => String(p.id || p.product_id) === String(item.product_id));
  const availableColors = getProductAvailableColors ? getProductAvailableColors(selectedProd) : [];
  const hasMultipleColours = availableColors.length > 1;
  const colorStockMap = selectedProd?.colour_stock || {};
  const activeBreakdown = item.color_breakdown || [];
  const currentVariantValue = item.selected_colour || (activeBreakdown.length === 1 ? activeBreakdown[0].color : (activeBreakdown.length > 1 ? '__split__' : (availableColors[0] || '')));

  return (
    <div className="bg-slate-50/60 border border-slate-200/70 rounded-xl p-3 space-y-2.5 transition-all hover:border-slate-300">
      <div className="flex flex-wrap items-end gap-2.5">
        {/* Product Selector with compact 40px combobox */}
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Product / Model</label>
          <SearchableCombobox
            value={item.product_id}
            onChange={(v) => updateSaleItemProduct(idx, v)}
            options={salesProductOptions}
            placeholder="Search product, brand, model..."
            searchPlaceholder="Type model, OLED, battery..."
            className="w-full"
          />
        </div>

        {/* Color / Variant Selector Dropdown */}
        {Boolean(item.product_id) && availableColors.length > 0 && (
          <div className="w-[140px]">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Color / Variant</label>
            <select
              value={currentVariantValue}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__split__') {
                  if (!activeBreakdown.length) {
                    toggleSaleItemColor(idx, availableColors[0]);
                  }
                } else if (updateSaleItemSingleColor) {
                  updateSaleItemSingleColor(idx, val);
                } else {
                  toggleSaleItemColor(idx, val);
                }
              }}
              className="w-full h-10 px-2.5 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer"
            >
              {availableColors.map((c) => (
                <option key={c} value={c}>
                  {c} {colorStockMap[c] !== undefined ? `(${colorStockMap[c]} in stock)` : ''}
                </option>
              ))}
              {availableColors.length > 1 && (
                <option value="__split__">⚡ Multi-Color Split</option>
              )}
            </select>
          </div>
        )}

        {/* Price Tier */}
        <div className="w-[115px]">
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Price Tier</label>
          <select
            value={item.price_type || 'retail'}
            onChange={(e) => updateSaleItemPriceType(idx, e.target.value)}
            disabled={!item.product_id}
            className="w-full h-10 px-2.5 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer disabled:opacity-50"
          >
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </div>

        {/* Selling Price */}
        <div className="w-[105px]">
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Price (₹)</label>
          <input
            type="number"
            placeholder="₹ 0"
            value={item.selling_price !== undefined ? item.selling_price : ''}
            onChange={(e) => updateSaleItemSellingPrice(idx, e.target.value)}
            disabled={!item.product_id}
            className="w-full h-10 px-2.5 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none disabled:opacity-50 text-right"
          />
        </div>

        {/* Quantity */}
        <div className="w-[80px]">
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Qty</label>
          <input
            type="number"
            min="0"
            placeholder="0"
            value={item.quantity !== undefined && item.quantity !== '' ? item.quantity : 0}
            onChange={(e) => updateSaleItemQuantity(idx, e.target.value)}
            disabled={!item.product_id || activeBreakdown.length > 1}
            title={activeBreakdown.length > 1 ? "Quantity is calculated automatically from color breakdown below" : "Enter quantity"}
            className="w-full h-10 px-2 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none disabled:opacity-70 text-center"
          />
        </div>

        {/* Total Amount */}
        <div className="w-[110px]">
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Total (₹)</label>
          <div className="w-full h-10 px-2.5 flex items-center justify-end bg-slate-100/90 border border-slate-200 rounded-xl text-xs font-black text-slate-900">
            ₹{Number(item.total_amount || 0).toLocaleString('en-IN')}
          </div>
        </div>

        {/* Trash / Remove Row Button */}
        <button
          type="button"
          onClick={() => removeSaleItem(idx)}
          className="h-10 px-2.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200 transition-all cursor-pointer flex items-center justify-center shrink-0"
          title={itemsLength > 1 ? "Remove item" : "Clear item"}
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Invoice Model Name & Manufacturing Brand Customization */}
      {Boolean(item.product_id) && (
        <div className="pt-2.5 border-t border-slate-200/70 space-y-1.5 bg-slate-100/50 p-2.5 rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1">
              <Edit3 size={12} className="text-sky-600" />
              Invoice Display Model &amp; Brand
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Stock deducts from selected model ({selectedProd?.short_name || selectedProd?.name || 'Selected Item'})
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                Model Name on Invoice (Editable)
              </label>
              <input
                type="text"
                value={item.custom_product_name !== undefined ? item.custom_product_name : (selectedProd?.short_name || selectedProd?.name || '')}
                onChange={(e) => updateSaleItemCustomName && updateSaleItemCustomName(idx, e.target.value)}
                placeholder="e.g. V40E (without WF)"
                className="w-full h-8 px-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                Manufacturing Brand on Invoice (Editable)
              </label>
              <input
                type="text"
                value={item.custom_brand_name !== undefined ? item.custom_brand_name : (selectedProd?.manufacturing_brand_name || selectedProd?.brand || '')}
                onChange={(e) => updateSaleItemCustomBrand && updateSaleItemCustomBrand(idx, e.target.value)}
                placeholder="e.g. AS CARE / FRESH NEW CARE"
                className="w-full h-8 px-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Smart Colour Selection System: CONDITIONAL VISIBILITY */}
      {Boolean(item.product_id) && hasMultipleColours && (
        <div className="pt-2.5 border-t border-slate-200/70">
          <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
              <Tag size={11} className="text-teal-600" />
              Select Colour Breakdown:
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Allocate quantities per colour
            </span>
          </div>

          {/* Colour chips */}
          <div className="flex flex-wrap items-center gap-1 mb-2">
            {availableColors.map((color) => {
              const isSelected = activeBreakdown.some((b) => b.color === color);
              const colorStockQty = colorStockMap[color] !== undefined ? colorStockMap[color] : null;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => toggleSaleItemColor(idx, color)}
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer border ${
                    isSelected
                      ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>{color}</span>
                  {colorStockQty !== null && (
                    <span className={`text-[9px] px-1 py-0.2 rounded font-extrabold ${isSelected ? 'bg-teal-700 text-teal-100' : 'bg-slate-100 text-slate-600'}`}>
                      {colorStockQty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Split colour quantity allocation row */}
          {activeBreakdown.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
              {activeBreakdown.map((b) => (
                <div key={b.color} className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-800">{b.color}:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateSaleItemColorQuantity(idx, b.color, Math.max(1, Number(b.qty || 1) - 1))}
                      className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-slate-200 text-slate-700 font-black text-xs border border-slate-200 cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={b.qty}
                      onChange={(e) => updateSaleItemColorQuantity(idx, b.color, e.target.value)}
                      className="w-10 text-center text-xs font-black border border-slate-200 rounded px-1 py-0.5 focus:border-teal-500 focus:outline-none bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => updateSaleItemColorQuantity(idx, b.color, Number(b.qty || 0) + 1)}
                      className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-slate-200 text-slate-700 font-black text-xs border border-slate-200 cursor-pointer"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSaleItemColor(idx, b.color)}
                      className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer ml-0.5"
                      title="Remove this colour"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Single-colour auto-assigned indicator (Selector completely hidden) */}
      {Boolean(item.product_id) && availableColors.length === 1 && (
        <div className="pt-2 border-t border-slate-200/60 flex items-center gap-2 text-[11px] text-slate-500 font-medium">
          <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
          <span>Colour: <strong className="text-slate-800 font-bold">{availableColors[0]}</strong></span>
          <span className="text-[10px] text-slate-400 font-normal bg-slate-100 px-1.5 py-0.2 rounded">Single variant</span>
        </div>
      )}
    </div>
  );
});

function SalesCreationWorkspace({
  forms,
  setForms,
  data,
  saving,
  needsSpecificShop,
  salesProductOptions,
  sellingPriceOptions,
  updateSaleItemProduct,
  updateSaleItemCustomName,
  updateSaleItemCustomBrand,
  updateSaleItemPriceType,
  updateSaleItemSellingPrice,
  updateSaleItemQuantity,
  toggleSaleItemColor,
  updateSaleItemSingleColor,
  updateSaleItemColorQuantity,
  addSaleItem,
  removeSaleItem,
  updateSaleInvoiceDate,
  updateSalePaymentTerms,
  addSaleExpense,
  updateSaleExpense,
  removeSaleExpense,
  submitSale,
  cancelEditSale,
  activeTab,
  setShowQuickAddCustomerModal,
  getProductAvailableColors,
  title = 'Create sale',
  authedFetch,
  onOpenReturnModal,
}) {
  const [expensesExpanded, setExpensesExpanded] = useState((forms.sale?.expenses || []).length > 0);
  const [customerBalanceInfo, setCustomerBalanceInfo] = useState({
    outstanding_balance: 0,
    advance_balance: 0,
    available_credits: 0,
    credit_notes: [],
  });
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [applyCreditNote, setApplyCreditNote] = useState(false);
  const [appliedCreditInput, setAppliedCreditInput] = useState('');
  const [applyAdvanceCredit, setApplyAdvanceCredit] = useState(true);

  // Automatically fetch customer outstanding balance and available credit notes
  useEffect(() => {
    const customerId = forms.sale?.customer_id;
    if (!customerId) {
      setCustomerBalanceInfo({ outstanding_balance: 0, advance_balance: 0, available_credits: 0, credit_notes: [] });
      setApplyCreditNote(false);
      setAppliedCreditInput('');
      setForms((prev) => ({
        ...prev,
        sale: {
          ...prev.sale,
          previous_balance: '',
          applied_credit_amount: 0,
          apply_advance: true,
        },
      }));
      return;
    }

    let isMounted = true;
    const fetchBalance = async () => {
      setLoadingBalance(true);
      try {
        if (authedFetch) {
          const res = await authedFetch(`/customers/${customerId}/balance`);
          if (isMounted && res) {
            const outBal = Number(res.outstanding_balance || 0);
            const advBal = Number(res.advance_balance || 0);
            const availCredits = Number(res.available_credits || 0);
            setCustomerBalanceInfo({
              outstanding_balance: outBal,
              advance_balance: advBal,
              available_credits: availCredits,
              credit_notes: res.credit_notes || [],
            });
            // Only overwrite previous_balance if not currently in editing mode with a prefilled balance
            setForms((prev) => ({
              ...prev,
              sale: {
                ...prev.sale,
                previous_balance: (prev.sale?.editing_sale_id && prev.sale?.previous_balance !== '') ? prev.sale.previous_balance : outBal,
                apply_advance: true,
              },
            }));
          }
        } else {
          const cust = (data.customers || []).find((c) => String(c.id) === String(customerId));
          const outBal = Number(cust?.pending || 0);
          const advBal = Number(cust?.advance_balance || 0);
          setCustomerBalanceInfo({ outstanding_balance: outBal, advance_balance: advBal, available_credits: 0, credit_notes: [] });
          setForms((prev) => ({
            ...prev,
            sale: {
              ...prev.sale,
              previous_balance: (prev.sale?.editing_sale_id && prev.sale?.previous_balance !== '') ? prev.sale.previous_balance : outBal,
              apply_advance: true,
            },
          }));
        }
      } catch (err) {
        console.error('Error fetching customer balance:', err);
      } finally {
        if (isMounted) setLoadingBalance(false);
      }
    };

    fetchBalance();
    return () => {
      isMounted = false;
    };
  }, [forms.sale?.customer_id]);

  const items = forms.sale?.items || [];
  const productsTotal = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const expenses = Array.isArray(forms.sale?.expenses) ? forms.sale.expenses : [];
  const extraExpensesTotal = expenses.reduce((sum, exp) => sum + Math.max(Number(exp.amount || 0), 0), 0);

  // Accounting calculations with manual or auto-fetched previous balance
  const currentInvoiceTotal = productsTotal + extraExpensesTotal;
  const autoFetchedBalance = Number(customerBalanceInfo?.outstanding_balance || 0);
  const availableCredits = Number(customerBalanceInfo?.available_credits || 0);
  const availableAdvance = Number(customerBalanceInfo?.advance_balance || 0);

  const previousBalance = forms.sale?.previous_balance !== undefined && forms.sale?.previous_balance !== ''
    ? (isNaN(Number(forms.sale.previous_balance)) ? 0 : Number(forms.sale.previous_balance))
    : (autoFetchedBalance > 0 ? autoFetchedBalance : (availableAdvance > 0 ? -availableAdvance : 0));

  const maxApplicableCredit = Math.min(availableCredits, Math.max(0, currentInvoiceTotal + Math.max(0, previousBalance)));

  const effectiveCreditDeduction = applyCreditNote
    ? Math.min(Math.max(0, Number(appliedCreditInput || 0)), maxApplicableCredit)
    : 0;

  const netAfterCredits = Math.max(0, currentInvoiceTotal - effectiveCreditDeduction);
  
  // If previousBalance is negative (e.g. advance entered as previous balance), we don't double-deduct advance
  const effectiveAdvanceDeduction = (applyAdvanceCredit && availableAdvance > 0 && previousBalance >= 0)
    ? Math.min(netAfterCredits, availableAdvance)
    : 0;

  // Net Balance: Current sale total minus credits + previous balance (supports negative advance)
  const netBalance = (netAfterCredits - effectiveAdvanceDeduction) + previousBalance;

  // Cash/Payment Needed from Customer (cannot be negative)
  const netPayable = Math.max(0, netBalance);
  const paidAmount = Number(forms.sale?.paid_amount || 0);
  
  // Closing Balance: Net Balance minus any direct cash payment
  const closingBalance = netBalance - paidAmount;

  // Synchronize applied credit & advance selection to form state
  useEffect(() => {
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        applied_credit_amount: effectiveCreditDeduction,
        apply_advance: applyAdvanceCredit,
      },
    }));
  }, [effectiveCreditDeduction, applyAdvanceCredit]);

  const getStatusBadge = () => {
    if (netPayable === 0 && currentInvoiceTotal === 0 && previousBalance === 0) return { label: 'Empty Bill', color: 'bg-slate-100 text-slate-600 border-slate-200' };
    if (netBalance <= 0) return { label: 'PAID (Covered by Advance Credit)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    if (effectiveAdvanceDeduction > 0 && paidAmount === 0 && closingBalance === 0) return { label: 'Paid (Store Credit)', color: 'bg-teal-100 text-teal-800 border-teal-300' };
    if (paidAmount >= netPayable && netPayable > 0) return { label: 'Fully Settled', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    if (paidAmount > 0) return { label: `Partial (₹${Math.max(0, closingBalance).toLocaleString('en-IN')} Due)`, color: 'bg-amber-100 text-amber-800 border-amber-300' };
    return { label: 'Pending / Unpaid', color: 'bg-rose-100 text-rose-800 border-rose-300' };
  };

  const status = getStatusBadge();

  return (
    <div className="w-full">
      {/* Edit Mode Notification Banner */}
      {forms.sale?.editing_sale_id && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 px-4 flex flex-wrap items-center justify-between gap-3 text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-500 text-white font-black text-xs flex items-center justify-center">
              <Edit3 size={15} />
            </span>
            <div>
              <span className="text-xs font-black uppercase tracking-wider block text-amber-800">
                Editing Invoice #{forms.sale.editing_invoice_number || `INV-${String(forms.sale.editing_sale_id).padStart(6, '0')}`}
              </span>
              <span className="text-[11px] text-amber-700">
                Modify quantities, prices, variants, or customer balance. Stock will be reconciled automatically.
              </span>
            </div>
          </div>
          {cancelEditSale && (
            <button
              type="button"
              onClick={cancelEditSale}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 shadow-2xs cursor-pointer transition-all flex items-center gap-1"
            >
              <X size={14} /> Cancel Editing
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Main Workspace Column */}
        <div className="lg:col-span-8 space-y-3.5">
          {/* Card 1: Customer Selection */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Users size={14} className="text-teal-600" />
                Customer &amp; Account
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    let cashCust = (data.customers || []).find((c) => 
                      c.name?.toLowerCase().includes('cash customer') || c.mobile === '9999999999' || c.mobile === '0000000000'
                    );
                    if (!cashCust && authedFetch) {
                      try {
                        const res = await authedFetch('/cash-customer');
                        if (res?.customer) cashCust = res.customer;
                      } catch (err) {}
                    }
                    if (cashCust) {
                      setForms((prev) => ({
                        ...prev,
                        sale: {
                          ...prev.sale,
                          customer_id: String(cashCust.id),
                          payment_mode: 'cash'
                        }
                      }));
                    }
                  }}
                  className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title="Select default Walk-in Cash Customer"
                >
                  ⚡ Walk-in Cash Customer
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickAddCustomerModal(true)}
                  className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer hover:underline"
                >
                  <Plus size={13} /> Add New Customer
                </button>
              </div>
            </div>
            <SearchableCombobox
              value={forms.sale.customer_id}
              onChange={(v) => setForms((prev) => ({ ...prev, sale: { ...prev.sale, customer_id: v } }))}
              options={(data.customers || []).map((c) => [c.id, `${c.name}${c.mobile ? ` (${c.mobile})` : ''}${c.address ? ` - ${c.address}` : ''}`])}
              placeholder="Search or select customer..."
              searchPlaceholder="Search by name, phone, or address..."
              className="w-full"
            />

            {/* Customer Live Balance & Credit Note Indicator Bar */}
            {forms.sale.customer_id && (
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-500 font-medium">Outstanding Balance:</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] border ${
                    previousBalance > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    {currency(previousBalance)}
                  </span>

                  {availableAdvance > 0 && (
                    <span className="px-2 py-0.5 rounded-full font-bold text-[11px] bg-cyan-50 text-cyan-800 border border-cyan-200 flex items-center gap-1 shadow-2xs">
                      <span>Available Store Credit: {currency(availableAdvance)}</span>
                    </span>
                  )}

                  {availableCredits > 0 && (
                    <span className="px-2 py-0.5 rounded-full font-bold text-[11px] bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                      <RotateCcw size={10} />
                      <span>Available Credit: {currency(availableCredits)}</span>
                    </span>
                  )}
                </div>

                {onOpenReturnModal && (
                  <button
                    type="button"
                    onClick={() => onOpenReturnModal(data.customers.find((c) => String(c.id) === String(forms.sale.customer_id)))}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                    title="Initiate a Sales Return or Issue Credit Note for this customer"
                  >
                    <RotateCcw size={11} /> Issue Credit Note / Return
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Items Purchased Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Package size={14} className="text-teal-600" />
                Items Purchased
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="space-y-2.5">
              {items.map((item, idx) => (
                <SaleItemRow
                  key={item.id || item._key || idx}
                  item={item}
                  idx={idx}
                  itemsLength={items.length}
                  salesProductOptions={salesProductOptions}
                  data={data}
                  getProductAvailableColors={getProductAvailableColors}
                  updateSaleItemProduct={updateSaleItemProduct}
                  updateSaleItemCustomName={updateSaleItemCustomName}
                  updateSaleItemCustomBrand={updateSaleItemCustomBrand}
                  updateSaleItemPriceType={updateSaleItemPriceType}
                  updateSaleItemSellingPrice={updateSaleItemSellingPrice}
                  updateSaleItemQuantity={updateSaleItemQuantity}
                  toggleSaleItemColor={toggleSaleItemColor}
                  updateSaleItemSingleColor={updateSaleItemSingleColor}
                  updateSaleItemColorQuantity={updateSaleItemColorQuantity}
                  removeSaleItem={removeSaleItem}
                />
              ))}
            </div>

            <div>
              <button
                type="button"
                onClick={addSaleItem}
                className="px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} /> Add Another Item
              </button>
            </div>
          </div>

          {/* Card 3: Single-Row Invoice & Terms */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
              Invoice Date &amp; Payment Terms
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={forms.sale.invoice_date || getTodayIso()}
                  onChange={(e) => updateSaleInvoiceDate(e.target.value)}
                  className="w-full h-10 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600">Payment Terms</label>
                  <span className="text-[10px] text-slate-400 font-medium">Days</span>
                </div>
                <div className="space-y-1">
                  {netBalance <= 0 || (netPayable > 0 && paidAmount >= netPayable) ? (
                    <div className="w-full h-10 px-3 flex items-center bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800">
                      0 Days (Fully Paid / Advance)
                    </div>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="0"
                        value={forms.sale.payment_terms_days !== undefined ? forms.sale.payment_terms_days : 7}
                        onChange={(e) => updateSalePaymentTerms(e.target.value)}
                        placeholder="7"
                        className="w-full h-10 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none"
                      />
                      <div className="flex items-center gap-1">
                        {PAYMENT_TERMS_PRESETS.map((preset) => {
                          const isSelected = Number(forms.sale.payment_terms_days !== undefined ? forms.sale.payment_terms_days : 7) === preset;
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => updateSalePaymentTerms(preset)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold cursor-pointer border transition-all ${
                                isSelected
                                  ? 'bg-teal-600 text-white border-teal-600 shadow-2xs'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {preset}d
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Due Date (Auto Calculated)</label>
                <div className={`w-full h-10 px-3 flex items-center border rounded-xl text-xs font-bold ${
                  netBalance <= 0 || (netPayable > 0 && paidAmount >= netPayable)
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  {netBalance <= 0 || (netPayable > 0 && paidAmount >= netPayable)
                    ? 'N/A (Fully Paid / Settled)'
                    : (forms.sale.due_date ? formatDateDMY(forms.sale.due_date) : 'Auto calculated')}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Dynamic Extra Expenses */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Extra Expenses</span>
                {extraExpensesTotal > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-teal-100 text-teal-800 border border-teal-200">
                    ₹{extraExpensesTotal.toLocaleString('en-IN')}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400 font-normal">Optional</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => addSaleExpense()}
                className="px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Plus size={14} />
                <span>Add Expense</span>
              </button>
            </div>

            {/* Dynamic Expense Rows */}
            {(forms.sale.expenses || []).length > 0 ? (
              <div className="space-y-2.5 pt-1">
                {(forms.sale.expenses || []).map((exp, expIdx) => (
                  <div key={exp.id || expIdx} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end bg-slate-50/90 p-3 rounded-xl border border-slate-200/80">
                    <div className="sm:col-span-7">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Expense Name / Description
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Courier, Delivery, Labour, Packing, Transport..."
                        value={exp.expense_name || ''}
                        onChange={(e) => updateSaleExpense(expIdx, 'expense_name', e.target.value)}
                        className="w-full h-10 px-3 text-xs font-bold border border-slate-200 rounded-xl bg-white focus:border-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Amount (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="₹ 0"
                        value={exp.amount !== undefined ? exp.amount : ''}
                        onChange={(e) => updateSaleExpense(expIdx, 'amount', e.target.value)}
                        className="w-full h-10 px-3 text-xs font-black border border-slate-200 rounded-xl bg-white focus:border-teal-500 focus:outline-none text-right"
                      />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeSaleExpense(expIdx)}
                        className="h-10 w-10 flex items-center justify-center text-rose-500 hover:text-rose-700 bg-white hover:bg-rose-50 rounded-xl border border-slate-200 hover:border-rose-200 cursor-pointer transition-colors"
                        title="Remove this expense"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 font-normal">
                No extra expenses added. Click &ldquo;Add Expense&rdquo; if courier, freight, or other charges apply.
              </p>
            )}
          </div>
        </div>

        {/* Right Sticky Sidebar: Bill Summary & Accounting */}
        <div className="lg:col-span-4 sticky top-4 space-y-3.5">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Bill Summary</span>
                {loadingBalance && <Loader2 size={12} className="animate-spin text-teal-600" />}
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${status.color}`}>
                {status.label}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Items</span>
                <strong className="text-slate-800 font-bold">{items.length || 1}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Products Subtotal</span>
                <strong className="text-slate-800 font-bold">{currency(productsTotal)}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Extra Expenses</span>
                <strong className={extraExpensesTotal > 0 ? 'text-teal-700 font-bold' : 'text-slate-500'}>
                  {currency(extraExpensesTotal)}
                </strong>
              </div>

              {/* Current Sale Total */}
              <div className="flex items-center justify-between text-slate-800 font-semibold pt-1 border-t border-slate-100">
                <span>Current Sale Total</span>
                <strong className="font-bold">{currency(currentInvoiceTotal)}</strong>
              </div>

              {/* Previous Outstanding Balance */}
              <div className="flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-1">
                  <span>Previous Balance</span>
                  {previousBalance < 0 && (
                    <span className="px-1.5 py-0.2 rounded bg-cyan-50 text-cyan-800 border border-cyan-200 text-[10px] font-bold">
                      Advance
                    </span>
                  )}
                  {previousBalance > 0 && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                      {forms.sale.previous_balance !== '' && Number(forms.sale.previous_balance) !== autoFetchedBalance ? 'Manual' : 'Due'}
                    </span>
                  )}
                </span>
                <strong className={previousBalance < 0 ? 'text-cyan-700 font-bold' : previousBalance > 0 ? 'text-amber-700 font-bold' : 'text-slate-500'}>
                  {previousBalance < 0 ? `${currency(previousBalance)} (Advance)` : previousBalance > 0 ? `+${currency(previousBalance)}` : '+₹0'}
                </strong>
              </div>

              {/* Credit Note Deduction (if applied) */}
              {effectiveCreditDeduction > 0 && (
                <div className="flex items-center justify-between text-teal-700 font-bold bg-teal-50/60 px-2 py-1 rounded-lg border border-teal-200/60">
                  <span>Credit Note Deduction</span>
                  <span>-{currency(effectiveCreditDeduction)}</span>
                </div>
              )}

              {/* Store Credit / Advance Deduction (if applied) */}
              {effectiveAdvanceDeduction > 0 && (
                <div className="flex items-center justify-between text-cyan-700 font-bold bg-cyan-50/70 px-2 py-1 rounded-lg border border-cyan-200/70">
                  <span>Store Credit / Advance</span>
                  <span>-{currency(effectiveAdvanceDeduction)}</span>
                </div>
              )}

              {/* Final Grand Total / Net Payable Amount */}
              <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                <div>
                  <span className="text-sm font-black text-slate-900 block">Final Grand Total</span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {netBalance < 0 ? 'Net Store Credit Remaining' : 'Net Payable Amount'}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-xl font-black ${netBalance < 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {currency(netBalance)}
                  </span>
                  {netBalance < 0 && (
                    <span className="text-[10px] text-emerald-600 font-extrabold block">Covered by Advance Credit</span>
                  )}
                </div>
              </div>
            </div>

            {/* Apply Credit Note Widget */}
            {availableCredits > 0 && (
              <div className="p-3 bg-teal-50/70 border border-teal-200/90 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyCreditNote}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setApplyCreditNote(checked);
                        if (checked && !appliedCreditInput) {
                          setAppliedCreditInput(String(maxApplicableCredit));
                        }
                      }}
                      className="w-4 h-4 text-teal-600 rounded cursor-pointer accent-teal-600"
                    />
                    <span className="text-xs font-bold text-teal-950">Apply Credit Note</span>
                  </label>
                  <span className="text-[10.5px] font-extrabold text-teal-800 bg-white px-2 py-0.5 rounded-md border border-teal-200">
                    Avail: {currency(availableCredits)}
                  </span>
                </div>

                {applyCreditNote && (
                  <div className="space-y-1.5 pt-1 border-t border-teal-200/60">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max={maxApplicableCredit}
                        value={appliedCreditInput}
                        onChange={(e) => setAppliedCreditInput(e.target.value)}
                        placeholder="₹ 0"
                        className="w-full h-8 px-2.5 text-xs font-black text-teal-800 bg-white border border-teal-300 rounded-lg focus:border-teal-500 focus:outline-none text-right"
                      />
                      <button
                        type="button"
                        onClick={() => setAppliedCreditInput(String(maxApplicableCredit))}
                        className="px-2 h-8 text-[10px] font-extrabold text-teal-700 bg-white hover:bg-teal-100 border border-teal-300 rounded-lg cursor-pointer shrink-0"
                        title="Apply maximum possible credit"
                      >
                        Use Max
                      </button>
                    </div>
                    <p className="text-[10px] text-teal-700 leading-tight">
                      Deducted from Grand Total before calculating final closing balance.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Auto-apply Customer Store Credit / Advance Widget */}
            {availableAdvance > 0 && (
              <div className="p-3 bg-cyan-50/70 border border-cyan-200/90 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyAdvanceCredit}
                      onChange={(e) => setApplyAdvanceCredit(e.target.checked)}
                      className="w-4 h-4 text-cyan-600 rounded cursor-pointer accent-cyan-600"
                    />
                    <span className="text-xs font-bold text-cyan-950">Auto-apply customer store credit</span>
                  </label>
                  <span className="text-[10.5px] font-extrabold text-cyan-800 bg-white px-2 py-0.5 rounded-md border border-cyan-200">
                    Avail: {currency(availableAdvance)}
                  </span>
                </div>
                {applyAdvanceCredit && (
                  <p className="text-[10.5px] text-cyan-700 leading-tight">
                    {effectiveAdvanceDeduction >= currentInvoiceTotal
                      ? 'Entire sale total covered by customer\'s available store credit.'
                      : `₹${effectiveAdvanceDeduction.toLocaleString('en-IN')} will be deducted from customer's available advance pool.`}
                  </p>
                )}
              </div>
            )}

            {/* Payment & Balance Inputs inside Sidebar */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              {/* Previous Balance Manual / Auto Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                    <span>Previous Balance (₹)</span>
                    {Number(forms.sale.previous_balance || 0) < 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                        Advance / Credit
                      </span>
                    )}
                    {autoFetchedBalance > 0 && forms.sale.previous_balance !== '' && Number(forms.sale.previous_balance) !== autoFetchedBalance && Number(forms.sale.previous_balance || 0) >= 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        Manual
                      </span>
                    )}
                  </label>
                  {autoFetchedBalance > 0 && forms.sale.previous_balance !== '' && Number(forms.sale.previous_balance) !== autoFetchedBalance && (
                    <button
                      type="button"
                      onClick={() => setForms((prev) => ({ ...prev, sale: { ...prev.sale, previous_balance: String(autoFetchedBalance) } }))}
                      className="text-[10px] font-bold text-teal-600 hover:text-teal-800 hover:underline cursor-pointer"
                      title="Reset to customer's live outstanding balance"
                    >
                      Auto: {currency(autoFetchedBalance)}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  placeholder="₹ 0 (e.g. -100000 for advance)"
                  value={forms.sale.previous_balance !== undefined ? forms.sale.previous_balance : ''}
                  onChange={(e) => setForms((prev) => ({ ...prev, sale: { ...prev.sale, previous_balance: e.target.value } }))}
                  className={`w-full h-10 px-3 text-xs font-bold bg-white border rounded-xl focus:outline-none ${
                    Number(forms.sale.previous_balance || 0) < 0
                      ? 'text-cyan-800 border-cyan-300 focus:border-cyan-500'
                      : 'text-amber-800 border-slate-200 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600">Paid Amount (₹)</label>
                  <button
                    type="button"
                    onClick={() => setForms((prev) => ({ ...prev, sale: { ...prev.sale, paid_amount: String(netPayable) } }))}
                    className="text-[10px] font-bold text-teal-600 hover:text-teal-800 hover:underline cursor-pointer"
                  >
                    {netPayable > 0 ? `Pay Full (${currency(netPayable)})` : 'Covered by Advance (₹0)'}
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  max={netPayable}
                  placeholder="₹ 0"
                  value={forms.sale.paid_amount || ''}
                  onChange={(e) => setForms((prev) => ({ ...prev, sale: { ...prev.sale, paid_amount: e.target.value } }))}
                  className="w-full h-10 px-3 text-xs font-bold text-emerald-700 bg-white border border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payment Mode</label>
                <select
                  value={forms.sale.payment_mode || 'cash'}
                  onChange={(e) => setForms((prev) => ({ ...prev, sale: { ...prev.sale, payment_mode: e.target.value } }))}
                  className="w-full h-10 px-3 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="credit">Credit / Pending</option>
                </select>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <span className="text-slate-500 font-medium">Updated Closing Balance:</span>
                <strong className={`font-black ${closingBalance < 0 ? 'text-cyan-700' : closingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {closingBalance < 0 ? `${currency(closingBalance)} (Advance with Store)` : closingBalance === 0 ? '₹0 (Settled)' : `${currency(closingBalance)} (Due)`}
                </strong>
              </div>
            </div>

            {/* Create / Update Sale Action Button */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                disabled={saving || needsSpecificShop}
                onClick={() => submitSale(activeTab)}
                className={`w-full h-11 rounded-xl text-white font-bold text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] ${
                  forms.sale?.editing_sale_id
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {forms.sale?.editing_sale_id ? <Check size={18} /> : <Plus size={18} />}
                <span>
                  {saving
                    ? (forms.sale?.editing_sale_id ? 'Updating Sale...' : 'Creating Sale...')
                    : (forms.sale?.editing_sale_id ? 'Update Sale / Invoice' : 'Create Sale')}
                </span>
              </button>
              {forms.sale?.editing_sale_id && cancelEditSale && (
                <button
                  type="button"
                  onClick={cancelEditSale}
                  className="w-full h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <X size={14} />
                  <span>Cancel Editing</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonPage({ type = 'list', timeoutMs = 3000 }) {
  const layout = (
    <section className={`skeleton-page ${type === 'dashboard' ? 'dashboard-skeleton' : ''}`} aria-hidden="true">
      {type === 'dashboard' ? (
        <>
          <CardSkeleton count={4} />
          <div style={{ marginTop: '20px' }}>
            <TableRowSkeleton columns={4} rows={4} />
          </div>
        </>
      ) : (
        <TableRowSkeleton columns={5} rows={6} />
      )}
    </section>
  );

  return (
    <SmartSkeletonWrapper
      isLoading={true}
      timeoutMs={timeoutMs}
      skeletonLayout={layout}
      fallbackMessage="Just a moment..."
      fallbackSubtext="Fetching high-speed data. If your connection is slow, we'll get everything ready shortly."
    />
  );
}

function ConfirmationDialog({ dialog, saving, onCancel, onConfirm }) {
  return (
    <AnimatePresence>
      {dialog && (
        <motion.div
          className="confirmation-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) onCancel();
          }}
        >
          <motion.section
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmation-title"
            aria-describedby="confirmation-message"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div className="confirmation-icon"><AlertTriangle size={22} /></div>
            <div className="confirmation-copy">
              <span>Owner confirmation</span>
              <h2 id="confirmation-title">{dialog.title}</h2>
              <p id="confirmation-message">{dialog.message}</p>
            </div>
            <div className="confirmation-actions">
              <button className="soft" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
              <button className="danger-action" type="button" disabled={saving} onClick={onConfirm}>
                <Trash2 size={16} /> {saving ? 'Working...' : dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const createPager = (limit = 50) => ({ page: 1, limit, total: 0, totalPages: 1, loaded: false });

const getPaginatedRows = (response) => (Array.isArray(response) ? response : (response?.data || []));

const getPaginatedTotal = (response, rows, keys = []) => {
  for (const key of keys) {
    if (response?.[key] !== undefined) return Number(response[key] || 0);
  }
  return Number(response?.total || rows.length || 0);
};

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      onLogin(await api('/auth/login', { method: 'POST', body: JSON.stringify(form) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.main 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="login-page"
    >
      <div className="blob blob-teal" />
      <div className="blob blob-cyan" />
      <motion.section 
        initial={{ y: 24, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 20 }}
        className="login-panel"
      >
        <div className="brand-lockup">
          <div className="brand-mark"><Store size={28} /></div>
          <div>
            <h1>Pinky Sales</h1>
            <p>Multi-shop business manager</p>
          </div>
        </div>

        <form onSubmit={submit} className="form-grid" onKeyDown={handleFormKeyDown}>
          <label>
            Username
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label>
            Password
            <div className="password-input-container">
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={form.password} 
                onChange={(e) => setForm({ ...form, password: e.target.value })} 
              />
              <button 
                type="button" 
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="error"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
          <button className="primary" type="submit" disabled={submitting}>
            <ShieldCheck size={18} /> {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </motion.section>
    </motion.main>
  );
}

function PageWrapper({ children, activeKey }) {
  return (
    <motion.div
      key={activeKey}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function App() {
  const [session, setSession] = useState(readStoredSession);
  const [authReady, setAuthReady] = useState(() => !session);
  const [active, setActive] = useState(() => initialPageForSession(session));
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedProductDetails, setSelectedProductDetails] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const toastTimerRef = useRef(null);
  const tabLoadSequenceRef = useRef(0);
  const [data, setData] = useState({
    dashboard: null,
    shops: [],
    shopkeepers: [],
    products: [],
    brandSummary: [],
    manufacturingBrandSummary: [],
    stock: [],
    customers: [],
    sales: [],
    requests: [],
    pending: [],
    reports: null,
    catalog: [],
    productResults: [],
    stockSummary: {
      loaded: false,
      categories: [],
      totals: {
        products: 0,
        quantity: 0,
        owner_quantity: 0,
        shopkeeper_quantity: 0,
        my_quantity: 0,
        warehouse_quantity: 0,
      },
    },
    reference: { categories: [], colours: [], brands: [], manufacturingBrands: [] },
    priceVisibility: {
      show_official_price_shopkeeper: true,
      show_wholesale_price_shopkeeper: false,
      show_purchase_price_shopkeeper: false,
    },
    warehouse: null,
  });
  const [selectedShop, setSelectedShop] = useState('');
  const [forms, setForms] = useState(initialForms);
  const [catalogFilters, setCatalogFilters] = useState({ search: '', brand: '', category: '', colour: '', shopId: '' });
  const [stockFilters, setStockFilters] = useState({ search: '', brand: '', category: '', colour: '', status: '', shopkeeperId: '', ownership: '' });
  const [brandSearch, setBrandSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [brandProducts, setBrandProducts] = useState([]);
  const [brandProductsLoading, setBrandProductsLoading] = useState(false);
  const [shopkeeperStockSearch, setShopkeeperStockSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [stockCategoryPage, setStockCategoryPage] = useState(null);
  const [categoryFiltersOpen, setCategoryFiltersOpen] = useState(false);
  const [newReference, setNewReference] = useState({ type: '', name: '' });
  const [modelSearch, setModelSearch] = useState('');
  const [priceSearch, setPriceSearch] = useState('');
  const [toolsSearch, setToolsSearch] = useState('');
  const [sparesSearch, setSparesSearch] = useState('');
  const [ocaSearch, setOcaSearch] = useState('');
  const [otherCategorySearch, setOtherCategorySearch] = useState('');
  const [customerFilters, setCustomerFilters] = useState({ search: '', status: '' });
  const [showQuickAddCustomerModal, setShowQuickAddCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [quickCustomerForm, setQuickCustomerForm] = useState({ name: '', mobile: '', address: '', gstin: '', customer_type: 'retailer' });
  const [savingQuickCustomer, setSavingQuickCustomer] = useState(false);
  const [salesReturnModalOpen, setSalesReturnModalOpen] = useState(false);
  const [salesReturnTargetCustomer, setSalesReturnTargetCustomer] = useState(null);
  const [salesReturnTargetSale, setSalesReturnTargetSale] = useState(null);

  const [editSaleModalOpen, setEditSaleModalOpen] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState(null);

  const openEditSaleModal = (sale) => {
    setSaleToEdit(sale);
    setEditSaleModalOpen(true);
  };

  const openSalesReturnModal = (saleOrCustomer = null) => {
    if (saleOrCustomer && (saleOrCustomer.sale_id || saleOrCustomer.invoice_number || saleOrCustomer.customer_id)) {
      setSalesReturnTargetSale(saleOrCustomer);
      const cust = (data.customers || []).find((c) => String(c.id) === String(saleOrCustomer.customer_id));
      setSalesReturnTargetCustomer(cust || null);
    } else if (saleOrCustomer && (saleOrCustomer.name || saleOrCustomer.customer_name)) {
      const cust = (data.customers || []).find((c) => String(c.id) === String(saleOrCustomer.id || saleOrCustomer.customer_id)) || saleOrCustomer;
      setSalesReturnTargetCustomer(cust);
      setSalesReturnTargetSale(null);
    } else {
      setSalesReturnTargetCustomer(null);
      setSalesReturnTargetSale(null);
    }
    setSalesReturnModalOpen(true);
  };

  const handleQuickAddCustomerSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!quickCustomerForm.name.trim()) return showToast('Please enter customer name');
    try {
      setSavingQuickCustomer(true);
      const scoped = shopId ? `?shopId=${shopId}` : '';
      if (editingCustomer) {
        const updated = await authedFetch(`/customers/${editingCustomer.id}`, {
          method: 'PUT',
          body: JSON.stringify(quickCustomerForm),
        });
        setData((prev) => ({
          ...prev,
          customers: prev.customers.map((c) =>
            Number(c.id) === Number(editingCustomer.id) ? { ...c, ...updated, ...quickCustomerForm } : c
          ),
        }));
        setQuickCustomerForm({ name: '', mobile: '', address: '', gstin: '', customer_type: 'retailer' });
        setEditingCustomer(null);
        setShowQuickAddCustomerModal(false);
        showToast('Customer updated successfully');
      } else {
        const created = await authedFetch(`/customers${scoped}`, {
          method: 'POST',
          body: JSON.stringify(quickCustomerForm),
        });
        const updatedCustomers = await authedFetch(`/customers${scoped}`);
        const rows = getPaginatedRows(updatedCustomers);
        setData((prev) => ({ ...prev, customers: rows }));
        const newId = created?.id || rows.find(c => c.name.toLowerCase() === quickCustomerForm.name.trim().toLowerCase())?.id;
        if (newId) {
          setForms((prev) => ({ ...prev, sale: { ...prev.sale, customer_id: String(newId) } }));
        }
        setCustomerPager((prev) => ({ ...prev, total: (prev.total || 0) + 1 }));
        setQuickCustomerForm({ name: '', mobile: '', address: '', gstin: '', customer_type: 'retailer' });
        setEditingCustomer(null);
        setShowQuickAddCustomerModal(false);
        showToast('Customer created successfully');
      }
    } catch (err) {
      showToast(err.message || 'Failed to save customer');
    } finally {
      setSavingQuickCustomer(false);
    }
  };

  const handleDeleteCustomer = (customer) => {
    if (!customer) return;
    requestConfirmation({
      title: `Delete ${customer.name}?`,
      message: `Are you sure you want to delete customer "${customer.name}"? Previous invoices and sales transactions will be preserved in the system with the customer unlinked. This action cannot be undone.`,
      confirmLabel: 'Delete Customer',
      onConfirm: async () => {
        try {
          setSaving(true);
          await authedFetch(`/customers/${customer.id}`, {
            method: 'DELETE',
          });
          setData((prev) => ({
            ...prev,
            customers: prev.customers.filter((c) => Number(c.id) !== Number(customer.id)),
          }));
          setCustomerPager((prev) => ({
            ...prev,
            total: Math.max(0, (prev.total || 1) - 1),
          }));
          showToast(`Customer "${customer.name}" deleted successfully`);
        } catch (err) {
          showToast(err.message || 'Failed to delete customer');
        } finally {
          setSaving(false);
        }
      },
    });
  };
  const [pendingFilters, setPendingFilters] = useState({ search: '', date: '' });
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalSearchFocused, setGlobalSearchFocused] = useState(false);
  const [searchHydrated, setSearchHydrated] = useState(false);
  const [salesFilters, setSalesFilters] = useState({ search: '', date: '' });
  const [shopkeeperSearch, setShopkeeperSearch] = useState('');
  const [transferDrawerOpen, setTransferDrawerOpen] = useState(false);
  const [expandedPaymentId, setExpandedPaymentId] = useState('');
  const [editingProductId, setEditingProductId] = useState('');
  const [editingShopkeeper, setEditingShopkeeper] = useState(null);
  const [shopkeeperEditForm, setShopkeeperEditForm] = useState(initialForms.shopkeeper);
  const deferredCatalogFilters = useDeferredValue(catalogFilters);
  const deferredStockFilters = useDeferredValue(stockFilters);
  const deferredShopkeeperStockSearch = useDeferredValue(shopkeeperStockSearch);
  const deferredShopkeeperSearch = useDeferredValue(shopkeeperSearch);
  const deferredCustomerFilters = useDeferredValue(customerFilters);
  const deferredSalesFilters = useDeferredValue(salesFilters);
  const deferredPendingFilters = useDeferredValue(pendingFilters);
  const deferredPriceSearch = useDeferredValue(priceSearch);
  const deferredModelSearch = useDeferredValue(modelSearch);
  const [productPager, setProductPager] = useState(() => createPager(5000));
  const [stockPager, setStockPager] = useState(() => createPager(5000));
  const [customerPager, setCustomerPager] = useState(() => createPager(50));
  const [salesPager, setSalesPager] = useState(() => createPager(50));
  const [pendingPager, setPendingPager] = useState(() => createPager(50));
  const [productPageLoading, setProductPageLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState({
    brands: false,
    'manufacturing-brands': false,
    suppliers: false,
    stock: false,
    customers: false,
    sales: false,
    pending: false,
    reports: false,
  });
  const globalSearchBlurRef = useRef(null);
  const stockLoadSequenceRef = useRef(0);
  const productLoadSequenceRef = useRef(0);

  // Reset to Light Mode on mount
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
  }, []);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!session || authReady) return undefined;

    let cancelled = false;
    api('/me', {}, session.token)
      .then((user) => {
        if (cancelled) return;
        const verifiedSession = normalizeSession({ ...session, ...user });
        localStorage.setItem('session', JSON.stringify(verifiedSession));
        setSession(verifiedSession);
        setAuthReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 401 || error?.status === 403) {
          localStorage.removeItem('session');
          setSession(null);
          setActivePage('dashboard', { replace: true });
        } else {
          setLoadError(error?.message || 'Unable to verify the saved session.');
        }
        setAuthReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.token, authReady]);

  // Super Admin Shop Details Drawer States
  const [detailedShopId, setDetailedShopId] = useState(null);
  const [detailsTab, setDetailsTab] = useState('stock');
  const [detailedShopData, setDetailedShopData] = useState({
    loading: false,
    stock: [],
    customers: [],
    sales: [],
    pending: [],
    reports: null,
  });
  const [isEditingShop, setIsEditingShop] = useState(false);
  const [editShopForm, setEditShopForm] = useState({ name: '', area: '', address: '', phone: '' });
  const [expandedSaleId, setExpandedSaleId] = useState(null);
  const [selectedPaymentCustomer, setSelectedPaymentCustomer] = useState(null);
  const [paymentModalTarget, setPaymentModalTarget] = useState(null);
  const [paymentModalForm, setPaymentModalForm] = useState({ amount: '', mode: 'cash', reference_no: '', note: '', date: today() });
  const [pendingStatusFilter, setPendingStatusFilter] = useState('all');
  const [openShareDropdownId, setOpenShareDropdownId] = useState(null);
  const [shareModalTarget, setShareModalTarget] = useState(null);
  const [shareModalLoading, setShareModalLoading] = useState(false);
  const [shareModalSelectedInvoiceId, setShareModalSelectedInvoiceId] = useState('all');
  const [editingOpeningBalance, setEditingOpeningBalance] = useState(false);
  const [openingBalanceInput, setOpeningBalanceInput] = useState('');
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
  const [customerDrawerTab, setCustomerDrawerTab] = useState('all');

  const handleSaveOpeningBalance = async () => {
    if (!selectedPaymentCustomer) return;
    const custId = selectedPaymentCustomer.customer_id || selectedPaymentCustomer.id;
    if (!custId) return;
    const newBal = Number(openingBalanceInput || 0);
    if (isNaN(newBal) || newBal < 0) {
      showToast('Opening balance cannot be negative', 'error');
      return;
    }
    setSavingOpeningBalance(true);
    try {
      await authedFetch(`/customers/${custId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: selectedPaymentCustomer.customer_name || selectedPaymentCustomer.name,
          mobile: selectedPaymentCustomer.mobile,
          address: selectedPaymentCustomer.address,
          opening_balance: newBal,
        }),
      });
      setSelectedPaymentCustomer((prev) => {
        if (!prev) return prev;
        const prevBal = Number(prev.opening_balance || 0);
        const diff = newBal - prevBal;
        return {
          ...prev,
          opening_balance: newBal,
          pending_amount: Math.max(0, Number(prev.pending_amount || 0) + diff),
        };
      });
      setEditingOpeningBalance(false);
      showToast('Opening balance updated successfully');
      loadPendingPage();
      loadCustomersPage();
    } catch (err) {
      showToast(err.message || 'Failed to update opening balance', 'error');
    } finally {
      setSavingOpeningBalance(false);
    }
  };

  const openCustomerLedgerDrawer = async (customer) => {
    if (!customer) return;
    const custId = customer.id || customer.customer_id;
    const localSales = (data.sales || []).filter((s) => Number(s.customer_id) === Number(custId));
    const pendingVal = Number(customer.pending_amount ?? localSales.reduce((s, a) => s + Number(a.pending_amount || 0), 0));
    const custRecord = {
      ...customer,
      customer_id: custId,
      customer_name: customer.name || customer.customer_name,
      items: customer.items || localSales,
      pending_amount: pendingVal,
      total_amount: customer.total_amount ?? localSales.reduce((s, a) => s + Number(a.total_amount || 0), 0),
      paid_amount: customer.paid_amount ?? localSales.reduce((s, a) => s + Number(a.paid_amount || 0), 0),
    };
    setSelectedPaymentCustomer(custRecord);

    try {
      const res = await authedFetch(`/sales/customer/${custId}`);
      if (res && res.sales) {
        setSelectedPaymentCustomer((prev) => {
          if (!prev || (Number(prev.customer_id || prev.id) !== Number(custId))) return prev;
          return {
            ...prev,
            items: res.sales,
            total_amount: res.summary?.total_amount ?? prev.total_amount,
            paid_amount: res.summary?.paid_amount ?? prev.paid_amount,
            pending_amount: res.summary?.pending_amount ?? prev.pending_amount,
          };
        });
      }
    } catch {
      // Keep localSales as fallback
    }
  };

  const openInvoiceShareModal = (sale, customer = null) => {
    const custObj = customer || {
      id: sale.customer_id,
      customer_id: sale.customer_id,
      customer_name: sale.customer_name,
      name: sale.customer_name,
      mobile: sale.mobile,
      address: sale.address,
      shop_id: sale.shop_id,
      shop_name: sale.shop_name,
    };
    setShareModalTarget({
      mode: 'single_invoice',
      sale,
      customer: custObj,
      items: [sale],
    });
    setShareModalSelectedInvoiceId(String(sale.id));
  };

  const openPendingShareModal = (customer) => {
    const rawInvoices = Array.isArray(customer?.items) && customer.items.length > 0
      ? customer.items
      : (Array.isArray(customer?.invoices) && customer.invoices.length > 0
          ? customer.invoices
          : [customer]);
    setShareModalTarget({
      mode: 'pending_customer',
      customer,
      sale: null,
      items: rawInvoices,
    });
    setShareModalSelectedInvoiceId('all');
  };

  const token = session?.token || '';
  const role = session?.role || 'customer';
  const shopId = role === 'shopkeeper' ? session.shop_id : selectedShop;
  const nav = navByRole[role] || navByRole.customer;
  const navItems = new Map(nav.map(([id, label, Icon]) => [id, { id, label, Icon }]));
  const sidebarSections = (sidebarSectionsByRole[role] || sidebarSectionsByRole.customer)
    .map((section) => ({
      ...section,
      items: section.ids.map((id) => navItems.get(id)).filter(Boolean),
    }))
    .filter((section) => section.items.length);
  const currentPageMeta = pageMetaById[active] || {
    group: 'Workspace',
    title: active.replace('-', ' '),
    description: role === 'shopkeeper' ? `${session.name} - ${session.shop_name}` : 'Manage your workspace.',
  };
  const selectedShopRecord = selectedShop
    ? data.shops.find((shop) => String(shop.id) === String(selectedShop))
    : null;
  const selectedShopName = selectedShop
    ? selectedShopRecord?.name || 'Selected branch'
    : 'All branches';
  const workspaceScope = role === 'shopkeeper' ? session.shop_name : selectedShopName;
  const pageWorkspaceScope = role === 'superadmin' && active === 'dashboard' ? 'All branches' : workspaceScope;
  const showGlobalSearch = active === 'dashboard';
  const needsSpecificShop = role === 'superadmin' && !shopId;
  const shopCountDependency = active === 'stock' ? data.shops.length : 0;
  const activeProductSearch = active === 'prices' ? deferredPriceSearch : active === 'models' ? deferredModelSearch : '';

  const syncActivePath = (page, mode = 'push', queryString = '') => {
    if (typeof window === 'undefined') return;
    const cleanPage = String(page || '').split('?')[0];
    if (!validPageIds.has(cleanPage)) return;
    const searchPart = queryString || (String(page).includes('?') ? `?${String(page).split('?')[1]}` : '');
    const nextPath = `/${cleanPage}${searchPart}`;
    if (window.location.pathname + window.location.search === nextPath) return;
    window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', nextPath);
  };
  const setActivePage = (page, options = {}) => {
    const rawTarget = String(page || '');
    const cleanPage = rawTarget.split('?')[0];
    const target = validPageIds.has(cleanPage) ? cleanPage : defaultPageForRole(role);
    const queryString = options.queryString || (rawTarget.includes('?') ? `?${rawTarget.split('?')[1]}` : '');
    setActive(target);
    syncActivePath(target, options.replace ? 'replace' : 'push', queryString);
  };

  const authedFetch = (path, options = {}) => api(path, options, token);
  const showToast = (message, tone = inferToastTone(message)) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const cleanMessage = typeof message === 'object' && message !== null
      ? message.message || message.error || String(message)
      : String(message || '');
    const cleanTone = typeof message === 'object' && message !== null
      ? message.tone || message.type || tone
      : tone;
    setToast({ message: cleanMessage, tone: cleanTone });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };
  const requestConfirmation = (dialog) => setConfirmDialog(dialog);
  const runConfirmedAction = async () => {
    const action = confirmDialog?.onConfirm;
    if (!action) return;
    try {
      await action();
    } finally {
      setConfirmDialog(null);
    }
  };
  const updateProductField = (field, value) => {
    setForms((prev) => ({
      ...prev,
      product: { ...prev.product, [field]: value },
    }));
  };

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (globalSearchBlurRef.current) clearTimeout(globalSearchBlurRef.current);
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setGlobalSearchFocused(false);
      setOpen(false);
      setTransferDrawerOpen(false);
      setDetailedShopId(null);
      setSelectedProductDetails(null);
      if (!saving) setConfirmDialog(null);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [saving]);

  useEffect(() => {
    const handlePopState = () => {
      const routedPage = pageFromPath();
      if (routedPage) setActive(routedPage);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!session) return;
    const allowed = nav.some(([id]) => id === active);
    const target = allowed ? active : defaultPageForRole(role);
    if (!allowed) setActive(target);
    syncActivePath(target, 'replace');
  }, [active, role, session?.token]);

  useEffect(() => {
    setSearchHydrated(false);
  }, [shopId, role]);

  const prevActiveRef = useRef(active);
  useEffect(() => {
    const prev = prevActiveRef.current;
    if (prev !== active) {
      if (prev === 'models') setModelSearch('');
      if (prev === 'prices') setPriceSearch('');
      if (prev === 'catalog') setCatalogFilters((f) => ({ ...f, search: '' }));
      if (prev === 'stock') setStockFilters((f) => ({ ...f, search: '' }));
      if (prev === 'brands') {
        setBrandSearch('');
        setSelectedBrand('');
        setBrandProducts([]);
      }
      if (prev === 'shopkeepers') setShopkeeperSearch('');
      if (prev === 'customers') setCustomerFilters((f) => ({ ...f, search: '' }));
      if (prev === 'sales') setSalesFilters((f) => ({ ...f, search: '' }));
      if (prev === 'payments') setPendingFilters((f) => ({ ...f, search: '' }));
    }
    prevActiveRef.current = active;
  }, [active]);

  // Disable mouse wheel scrolling on number inputs across the entire application
  useEffect(() => {
    const handleWheel = () => {
      if (document.activeElement && document.activeElement.type === 'number') {
        document.activeElement.blur();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Global search keyboard shortcut (Ctrl+K, Cmd+K, Ctrl+/, Alt+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'k' || e.key === 'K' || e.key === '/')) {
        e.preventDefault();
        setGlobalSearchFocused(true);
        hydrateGlobalSearch();
        const searchInput = document.getElementById('dashboard-global-search') || document.querySelector('.global-search input') || document.querySelector('input[placeholder*="Search"]') || document.querySelector('input[type="search"]');
        if (searchInput) {
          searchInput.focus();
          if (typeof searchInput.select === 'function') searchInput.select();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const requireShopSelection = (message = 'Select a specific shop first') => {
    if (role === 'superadmin' && !shopId) {
      showToast(message);
      return false;
    }
    return true;
  };
  const hydrateGlobalSearch = async () => {
    if (role === 'customer' || searchHydrated || !token) return;
    setSearchHydrated(true);
    try {
      const scoped = shopId ? `?shopId=${shopId}` : '';
      const [customers, sales] = await Promise.all([
        authedFetch(`/customers${scoped}`),
        authedFetch(`/sales${scoped}`),
      ]);
      setData((prev) => ({ ...prev, customers, sales }));
    } catch {
      setSearchHydrated(false);
    }
  };
  const closeGlobalSearch = () => {
    if (globalSearchBlurRef.current) clearTimeout(globalSearchBlurRef.current);
    globalSearchBlurRef.current = setTimeout(() => setGlobalSearchFocused(false), 120);
  };
  const handleGlobalSearchSelect = (result) => {
    if (globalSearchBlurRef.current) clearTimeout(globalSearchBlurRef.current);
    setGlobalSearch('');
    setGlobalSearchFocused(false);
    setOpen(false);

    if (result.kind === 'product') {
      const nextQuery = productName(result.item);
      setModelSearch('');
      setPriceSearch(nextQuery);
      if (role === 'customer') {
        setCatalogFilters((prev) => ({ ...prev, search: '' }));
        setActivePage('catalog');
      } else {
        setActivePage('models');
      }
      setSelectedProductDetails(result.item);
      return;
    }

    if (result.kind === 'brand') {
      setStockFilters((prev) => ({ ...prev, brand: result.title, search: '' }));
      setCatalogFilters((prev) => ({ ...prev, brand: result.title, search: '' }));
      setActivePage(role === 'customer' ? 'catalog' : 'stock');
      return;
    }

    if (result.kind === 'customer') {
      if (role === 'superadmin' && result.item?.shop_id) setSelectedShop(String(result.item.shop_id));
      setActivePage('customers');
      return;
    }

    if (result.kind === 'sale') {
      if (role === 'superadmin' && result.item?.shop_id) setSelectedShop(String(result.item.shop_id));
      setSalesFilters({ search: result.title, date: '' });
      setActivePage('sales');
      return;
    }

    if (result.kind === 'shop') {
      if (role === 'superadmin') setSelectedShop(String(result.item.id));
      setActivePage('dashboard');
    }
  };
  const handleLoadError = (error, fallback = 'Unable to load data right now') => {
    if (isSessionError(error)) {
      logout();
      return;
    }
    const message = error?.message || fallback;
    setLoadError(message);
    showToast(message);
  };

  const productSearchForTab = (tab = active) => {
    if (tab === 'prices') return priceSearch;
    if (tab === 'models') return modelSearch;
    return '';
  };

  const updateProductPage = (response, fallbackPage = 1) => {
    const rows = Array.isArray(response) ? response : (response?.data || []);
    setData((prev) => ({ ...prev, productResults: rows }));
    setProductPager((prev) => ({
      ...prev,
      page: Number(response?.page || fallbackPage),
      limit: Number(response?.limit || prev.limit),
      total: Number(response?.totalProducts ?? response?.total ?? rows.length),
      totalPages: Math.max(Number(response?.totalPages || 1), 1),
      loaded: true,
    }));
  };

  const updatePagerFromResponse = (setPager, response, fallbackPage, rows, totalKeys = []) => {
    setPager((prev) => ({
      ...prev,
      page: Number(response?.page || fallbackPage || 1),
      limit: Number(response?.limit || prev.limit),
      total: getPaginatedTotal(response, rows, totalKeys),
      totalPages: Math.max(Number(response?.totalPages || 1), 1),
      loaded: true,
    }));
  };

  const scopedParams = (currentShop = shopId) => {
    const params = new URLSearchParams();
    const effectiveShopId = currentShop || (role === 'shopkeeper' ? session?.shop_id : '');
    if (effectiveShopId) params.set('shopId', String(effectiveShopId));
    return params;
  };

  const applyStockQueryParams = (params, filters = stockFilters, searchOverride = '') => {
    const cleanSearch = String(searchOverride || filters.search || '').trim();
    if (cleanSearch) params.set('search', cleanSearch);
    ['brand', 'category', 'colour', 'status', 'shopkeeperId', 'ownership'].forEach((key) => {
      if (filters[key]) params.set(key, String(filters[key]));
    });
    return params;
  };

  const loadStockPage = async ({
    stockPage = stockPager.page,
    currentShop = shopId,
    filters = stockFilters,
    search = '',
  } = {}) => {
    if (!token || role === 'customer') return;
    const requestId = ++stockLoadSequenceRef.current;
    setPageLoading((prev) => ({ ...prev, stock: true }));
    try {
      const stockParams = applyStockQueryParams(scopedParams(currentShop), filters, search);
      stockParams.set('page', String(stockPage));
      stockParams.set('limit', String(stockPager.limit || 5000));
      stockParams.set('includeSummary', 'true');
      const [stockResponse, shopkeepers] = await Promise.all([
        authedFetch(`/stock?${stockParams.toString()}`),
        role === 'superadmin' && !data.shopkeepers.length ? authedFetch('/shopkeepers') : Promise.resolve(data.shopkeepers),
      ]);
      if (requestId !== stockLoadSequenceRef.current) return;
      const stockRows = getPaginatedRows(stockResponse);
      setData((prev) => ({
        ...prev,
        stock: stockRows,
        shopkeepers,
        stockSummary: stockResponse?.summary
          ? { ...stockResponse.summary, loaded: true }
          : prev.stockSummary,
      }));
      updatePagerFromResponse(setStockPager, stockResponse, stockPage, stockRows, ['totalStockItems']);
    } catch (error) {
      if (requestId !== stockLoadSequenceRef.current) return;
      handleLoadError(error, 'Unable to load stock right now.');
    } finally {
      if (requestId === stockLoadSequenceRef.current) {
        setPageLoading((prev) => ({ ...prev, stock: false }));
      }
    }
  };

  const loadBrandProducts = async (brand, currentShop = shopId) => {
    const cleanBrand = String(brand || '').trim();
    if (!token || role === 'customer' || !cleanBrand) return;
    setBrandProductsLoading(true);
    try {
      const params = scopedParams(currentShop);
      params.set('brand', cleanBrand);
      const response = await authedFetch(`/brand-products?${params.toString()}`);
      setBrandProducts(response);
    } catch (error) {
      handleLoadError(error, 'Unable to load brand products right now.');
    } finally {
      setBrandProductsLoading(false);
    }
  };

  const loadBrandsPage = async (currentShop = shopId) => {
    setPageLoading((prev) => ({ ...prev, brands: true }));
    try {
      const params = scopedParams(currentShop);
      const query = params.toString();
      const response = await authedFetch(`/brands${query ? `?${query}` : ''}`).catch(() => ({ success: true, data: [] }));
      const brandList = Array.isArray(response) ? response : (response?.data || []);
      setData((prev) => ({ ...prev, brandSummary: brandList }));
    } catch (error) {
      console.warn('Unable to load brands summary', error);
    } finally {
      setPageLoading((prev) => ({ ...prev, brands: false }));
    }
  };

  const loadManufacturingBrandsPage = async (currentShop = shopId) => {
    setPageLoading((prev) => ({ ...prev, 'manufacturing-brands': true }));
    try {
      const params = scopedParams(currentShop);
      const query = params.toString();
      const response = await authedFetch(`/manufacturing-brands${query ? `?${query}` : ''}`).catch(() => []);
      setData((prev) => ({ ...prev, manufacturingBrandSummary: response || [] }));
    } catch (error) {
      console.warn('Unable to load manufacturing brands summary', error);
    } finally {
      setPageLoading((prev) => ({ ...prev, 'manufacturing-brands': false }));
    }
  };

  const selectBrand = async (brand) => {
    const cleanBrand = String(brand || '').trim();
    setSelectedBrand(cleanBrand);
    setBrandProducts([]);
    if (cleanBrand) await loadBrandProducts(cleanBrand);
  };

  const openBrandStock = (brand) => {
    const cleanBrand = String(brand || '').trim();
    if (!cleanBrand) return;
    setStockFilters((prev) => ({ ...prev, brand: cleanBrand, search: '' }));
    setStockPager((prev) => ({ ...prev, page: 1 }));
    setActivePage('stock');
  };

  const loadCustomersPage = async ({ page = customerPager.page, currentShop = shopId, filters = customerFilters } = {}) => {
    if (!token || role === 'customer') return;
    setPageLoading((prev) => ({ ...prev, customers: true }));
    try {
      const params = scopedParams(currentShop);
      params.set('page', String(page));
      params.set('limit', String(customerPager.limit));
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.status) params.set('status', filters.status);
      const response = await authedFetch(`/customers?${params.toString()}`);
      const rows = getPaginatedRows(response);
      setData((prev) => ({ ...prev, customers: rows }));
      updatePagerFromResponse(setCustomerPager, response, page, rows, ['totalCustomers']);
    } catch (error) {
      handleLoadError(error, 'Unable to load customers right now.');
    } finally {
      setPageLoading((prev) => ({ ...prev, customers: false }));
    }
  };

  const loadSalesPage = async ({ page = salesPager.page, currentShop = shopId, filters = salesFilters } = {}) => {
    if (!token || role === 'customer') return;
    setPageLoading((prev) => ({ ...prev, sales: true }));
    try {
      const saleLocation = currentShop || (role === 'shopkeeper' ? session?.shop_id : '');
      const params = scopedParams(saleLocation);
      params.set('page', String(page));
      params.set('limit', String(salesPager.limit));
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.date) params.set('date', filters.date);
      const dependencyParams = scopedParams(saleLocation);
      dependencyParams.set('page', '1');
      dependencyParams.set('limit', '1000');
      const [stockResponse, customerResponse, salesResponse, productsResponse] = await Promise.all([
        authedFetch(`/stock?${dependencyParams.toString()}`),
        authedFetch(`/customers?${dependencyParams.toString()}`),
        authedFetch(`/sales?${params.toString()}`),
        authedFetch(`/products?limit=1000`),
      ]);
      const salesRows = getPaginatedRows(salesResponse);
      const prodRows = getPaginatedRows(productsResponse);
      setData((prev) => ({
        ...prev,
        stock: getPaginatedRows(stockResponse),
        customers: getPaginatedRows(customerResponse),
        sales: salesRows,
        products: prodRows.length > 0 ? prodRows : prev.products,
      }));
      updatePagerFromResponse(setSalesPager, salesResponse, page, salesRows, ['totalSales']);
    } catch (error) {
      handleLoadError(error, 'Unable to load sales right now.');
    } finally {
      setPageLoading((prev) => ({ ...prev, sales: false }));
    }
  };

  const loadPendingPage = async ({ page = pendingPager.page, currentShop = shopId, filters = pendingFilters } = {}) => {
    if (!token || role === 'customer') return;
    setPageLoading((prev) => ({ ...prev, pending: true }));
    try {
      const params = scopedParams(currentShop);
      params.set('page', String(page));
      params.set('limit', String(pendingPager.limit));
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.date) params.set('date', filters.date);
      const response = await authedFetch(`/pending-payments?${params.toString()}`);
      const rows = getPaginatedRows(response);
      setData((prev) => ({ ...prev, pending: rows }));
      updatePagerFromResponse(setPendingPager, response, page, rows, ['totalPendingCustomers']);
    } catch (error) {
      handleLoadError(error, 'Unable to load pending payments right now.');
    } finally {
      setPageLoading((prev) => ({ ...prev, pending: false }));
    }
  };

  const loadReportsPage = async ({ currentShop = shopId } = {}) => {
    if (!token || role === 'customer') return;
    setPageLoading((prev) => ({ ...prev, reports: true }));
    try {
      const params = scopedParams(currentShop);
      const response = await authedFetch(`/reports?${params.toString()}`);
      setData((prev) => ({
        ...prev,
        reports: {
          ...response,
          pendingByShop: response?.pendingByShop || [],
          auditRows: response?.auditRows || [],
        },
      }));
    } catch (error) {
      handleLoadError(error, 'Unable to load reports right now.');
    } finally {
      setPageLoading((prev) => ({ ...prev, reports: false }));
    }
  };

  const loadProductPage = async ({ tab = active, page = productPager.page, search = productSearchForTab(tab), currentShop = shopId } = {}) => {
    if (!token || role === 'customer') return;
    const requestId = ++productLoadSequenceRef.current;
    setProductPageLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(Math.max(productPager.limit || 5000, 5000)),
      });
      if (currentShop) {
        params.set('shop_id', String(currentShop));
      }
      const cleanSearch = search.trim();
      if (cleanSearch) params.set('search', cleanSearch);
      const response = await authedFetch(`/products?${params.toString()}`);
      if (requestId !== productLoadSequenceRef.current) return;
      updateProductPage(response, page);
    } catch (error) {
      if (requestId !== productLoadSequenceRef.current) return;
      handleLoadError(error, 'Unable to load products right now.');
    } finally {
      if (requestId === productLoadSequenceRef.current) {
        setProductPageLoading(false);
      }
    }
  };

  const clearAuditLogs = () => {
    requestConfirmation({
      title: 'Clear all audit history?',
      message: 'This permanently removes the owner audit log. Business records remain unchanged, but this action cannot be undone.',
      confirmLabel: 'Clear history',
      onConfirm: async () => {
        try {
          setSaving(true);
          await authedFetch('/reports/audit', { method: 'DELETE' });
          showToast('Audit history cleared');
          await loadTab(active, shopId);
        } catch (error) {
          showToast(error.message || 'Failed to clear audit history');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const loadCore = async () => {
    if (!session) return;
    setLoading(true);
    setLoadError('');
    try {
      let shops;
      let products;
      let reference;
      let priceVisibility;
      let warehouse = data.warehouse;
      if (role === 'customer') {
        [shops, products, reference] = await Promise.all([
          authedFetch('/shops'),
          api('/catalog'),
          api('/reference-data'),
        ]);
        priceVisibility = data.priceVisibility;
      } else {
        const bootstrapQuery = shopId ? `?shopId=${encodeURIComponent(shopId)}` : '';
        ({ shops, products, reference, priceVisibility, warehouse } = await authedFetch(`/bootstrap${bootstrapQuery}`));
      }
      const isVercelHost = typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app');
      const loadedProducts = getPaginatedRows(products);
      setData((prev) => ({
        ...prev,
        shops,
        products: loadedProducts,
        reference: cleanReferenceData(reference),
        priceVisibility: priceVisibility || prev.priceVisibility,
        warehouse: warehouse || prev.warehouse,
        catalog: role === 'customer' ? loadedProducts : prev.catalog,
      }));
      if (role === 'superadmin' && warehouse?.id && !selectedShop) {
        setSelectedShop(String(warehouse.id));
      }
    } catch (error) {
      handleLoadError(error, 'Unable to load the workspace. Check whether the local servers are running.');
    } finally {
      setLoading(false);
    }
  };

  const loadTab = async (tab = active, currentShop = shopId) => {
    if (!session) return;
    if (tab === 'shops' && data.shops.length) {
      tabLoadSequenceRef.current += 1;
      setTabLoading(false);
      return;
    }
    const requestId = ++tabLoadSequenceRef.current;
    setTabLoading(true);
    try {
      setLoadError('');
      const dashboardShopId = role === 'superadmin' ? '' : currentShop;
      const scoped = currentShop ? `?shopId=${currentShop}` : '';
      const dashboardScoped = dashboardShopId ? `?shopId=${dashboardShopId}` : '';
      const set = (key, value) => setData((prev) => ({ ...prev, [key]: value }));
      if (tab === 'dashboard') set('dashboard', await authedFetch(`/dashboard${dashboardScoped}`));
      if (tab === 'shops') set('shops', await authedFetch('/shops'));
      if (tab === 'shopkeepers') set('shopkeepers', await authedFetch('/shopkeepers'));
      if (tab === 'models') {
        if (role === 'customer') set('catalog', await api('/catalog'));
        else await loadProductPage({ tab, page: 1, currentShop });
      }
      if (tab === 'prices') {
        const stockParams = scopedParams(currentShop);
        stockParams.set('page', '1');
        stockParams.set('limit', '5000');
        stockParams.set('includeSummary', 'true');
        const [stockRes] = await Promise.all([
          authedFetch(`/stock?${stockParams.toString()}`),
          loadProductPage({ tab, page: 1, currentShop }),
        ]);
        const stockRows = getPaginatedRows(stockRes);
        if (stockRows.length) {
          setData((prev) => ({ ...prev, stock: stockRows }));
        }
      }
      if (tab === 'stock') {
        await loadStockPage({
          stockPage: stockPager.page,
          currentShop,
          filters: stockFilters,
          search: stockFilters.search,
        });
      }
      if (tab === 'brands') await loadBrandsPage(currentShop);
      if (tab === 'manufacturing-brands') await loadManufacturingBrandsPage(currentShop);
      if (tab === 'low-stock') {
        const stockParams = scopedParams(currentShop);
        stockParams.set('page', '1');
        stockParams.set('limit', '5000');
        stockParams.set('includeSummary', 'true');

        const prodParams = new URLSearchParams({ limit: '5000' });
        if (currentShop) prodParams.set('shop_id', String(currentShop));

        const [stockResponse, productsResponse] = await Promise.all([
          authedFetch(`/stock?${stockParams.toString()}`),
          authedFetch(`/products?${prodParams.toString()}`),
        ]);
        const stockRows = getPaginatedRows(stockResponse);
        const prodRows = Array.isArray(productsResponse) ? productsResponse : (productsResponse?.data || []);
        setData((prev) => ({
          ...prev,
          stock: stockRows.length ? stockRows : prev.stock,
          products: prodRows.length ? prodRows : prev.products,
          productResults: prodRows.length ? prodRows : prev.productResults,
        }));
      }
      if (tab === 'customers') {
        const dependencyParams = scopedParams(currentShop);
        dependencyParams.set('page', '1');
        dependencyParams.set('limit', '1000');
        const [stockResponse, salesResponse] = await Promise.all([
          authedFetch(`/stock?${dependencyParams.toString()}`),
          authedFetch(`/sales?${dependencyParams.toString()}`),
        ]);
        setData((prev) => ({
          ...prev,
          stock: getPaginatedRows(stockResponse),
          sales: getPaginatedRows(salesResponse),
        }));
        await loadCustomersPage({ page: customerPager.page, currentShop, filters: customerFilters });
      }
      if (tab === 'sales') {
        await loadSalesPage({ page: salesPager.page, currentShop, filters: salesFilters });
      }
      if (tab === 'requests') set('requests', await authedFetch(`/stock-requests${scoped}`));
      if (tab === 'payments') await loadPendingPage({ page: pendingPager.page, currentShop, filters: pendingFilters });
      if (tab === 'reports') await loadReportsPage({ currentShop });
      if (tab === 'catalog') set('catalog', await api(`/catalog?${new URLSearchParams(catalogFilters).toString()}`));
      if (tab === 'ledger') {
        // Load all customers (unpaginated) so the Party Ledger dropdown is populated
        const ledgerParams = scopedParams(currentShop);
        ledgerParams.set('page', '1');
        ledgerParams.set('limit', '5000');
        const [customerResponse] = await Promise.all([
          authedFetch(`/customers?${ledgerParams.toString()}`),
        ]);
        setData((prev) => ({ ...prev, customers: getPaginatedRows(customerResponse) }));
      }
    } catch (error) {
      handleLoadError(error, 'Unable to refresh this page right now.');
    } finally {
      if (requestId === tabLoadSequenceRef.current) setTabLoading(false);
    }
  };

  // Click handler to open detailed shop view (Super Admin only)
  const viewShopDetails = async (shop) => {
    if (role !== 'superadmin') return;
    setDetailedShopId(shop.id);
    setDetailsTab('stock');
    setIsEditingShop(false);
    setEditShopForm({ name: shop.name || '', area: shop.area || '', address: shop.address || '', phone: shop.phone || '' });
    setDetailedShopData({ loading: true, stock: [], customers: [], sales: [], pending: [], reports: null });
    try {
      const stockParams = new URLSearchParams({
        shopId: String(shop.id),
        page: '1',
        limit: '500',
      });
      const [stock, customers, sales, pending, reports] = await Promise.all([
        authedFetch(`/stock?${stockParams.toString()}`),
        authedFetch(`/customers?shopId=${shop.id}`),
        authedFetch(`/sales?shopId=${shop.id}`),
        authedFetch(`/pending-payments?shopId=${shop.id}`),
        authedFetch(`/reports?shopId=${shop.id}`),
      ]);
      setDetailedShopData({
        loading: false,
        stock: getPaginatedRows(stock),
        customers,
        sales,
        pending: groupPendingPayments(pending),
        reports
      });
    } catch (err) {
      showToast(err.message || 'Failed to load shop details.');
      setDetailedShopData((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSaveShopEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editShopForm.name || !editShopForm.area) {
      showToast('Name and area are required');
      return;
    }
    try {
      setSaving(true);
      await authedFetch(`/shops/${detailedShopId}`, {
        method: 'PUT',
        body: JSON.stringify(editShopForm),
      });
      showToast('Shop details updated');
      setIsEditingShop(false);
      await loadCore();
    } catch (err) {
      showToast(err.message || 'Failed to update shop details');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShop = () => {
    requestConfirmation({
      title: 'Delete this shop?',
      message: 'This removes the shop and all associated stock, transactions, customers, and shopkeeper logins. This action cannot be undone.',
      confirmLabel: 'Delete shop',
      onConfirm: async () => {
        try {
          setSaving(true);
          await authedFetch(`/shops/${detailedShopId}`, {
            method: 'DELETE',
          });
          showToast('Shop deleted successfully');
          setDetailedShopId(null);
          await loadCore();
        } catch (err) {
          showToast(err.message || 'Failed to delete shop');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const getStockMetrics = () => {
    const totalQty = detailedShopData.stock.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const totalValue = detailedShopData.stock.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.sale_price || 0)), 0);
    const lowStockCount = detailedShopData.stock.filter(item => Number(item.quantity || 0) <= 3).length;
    return { totalQty, totalValue, lowStockCount };
  };

  const getCustomerMetrics = () => {
    const totalCust = detailedShopData.customers.length;
    const pendingCust = detailedShopData.customers.filter(c => Number(c.pending || 0) > 0).length;
    const totalPending = detailedShopData.customers.reduce((sum, c) => sum + Number(c.pending || 0), 0);
    return { totalCust, pendingCust, totalPending };
  };

  const getSalesMetrics = () => {
    const totalOrders = detailedShopData.sales.length;
    const totalRev = detailedShopData.sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalPaid = detailedShopData.sales.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0);
    const totalPending = detailedShopData.sales.reduce((sum, s) => sum + Number(s.pending_amount || 0), 0);
    return { totalOrders, totalRev, totalPaid, totalPending };
  };

  const getAuditMetrics = () => {
    const filteredLogs = detailedShopData.reports?.auditRows?.filter(r => Number(r.entity_id) === Number(detailedShopId) || String(r.details).includes(`Shop ${detailedShopId}`)) || [];
    const totalLogs = filteredLogs.length;
    const uniqueActors = new Set(filteredLogs.map(l => l.actor_name)).size;
    return { totalLogs, uniqueActors };
  };

  useEffect(() => {
    if (session && authReady) loadCore();
  }, [session?.token, authReady]);

  useEffect(() => {
    if (session && authReady) loadTab(active, shopId);
  }, [active, selectedShop, session?.token, authReady, shopCountDependency]);

  useEffect(() => {
    if (!session || !authReady || role === 'customer' || !['models', 'prices'].includes(active)) return;
    loadProductPage({ tab: active, page: productPager.page, search: activeProductSearch, currentShop: shopId });
  }, [active, activeProductSearch, selectedShop, productPager.page, productPager.limit, session?.token, authReady]);

  // Synchronize stock status filter from URL query params (e.g. /stock?filter=low_stock or ?status=out_of_stock)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const filter = urlParams.get('filter') || urlParams.get('status');
    if (filter) {
      const normalized = filter.toLowerCase().trim();
      if (normalized === 'low_stock' || normalized === 'low' || normalized === 'warning') {
        setStockFilters((prev) => (prev.status === 'low_stock' ? prev : { ...prev, status: 'low_stock' }));
      } else if (normalized === 'out_of_stock' || normalized === 'no_stock' || normalized === 'out') {
        setStockFilters((prev) => (prev.status === 'out_of_stock' ? prev : { ...prev, status: 'out_of_stock' }));
      } else if (normalized === 'in_stock') {
        setStockFilters((prev) => (prev.status === 'in_stock' ? prev : { ...prev, status: 'in_stock' }));
      }
    }
  }, [active]);

  useEffect(() => {
    if (active !== 'stock') return;
    setStockPager((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [deferredStockFilters]);

  useEffect(() => {
    if (active !== 'customers') return;
    setCustomerPager((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [deferredCustomerFilters]);

  useEffect(() => {
    if (active !== 'sales') return;
    setSalesPager((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [deferredSalesFilters]);

  useEffect(() => {
    if (active !== 'payments') return;
    setPendingPager((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [deferredPendingFilters]);

  useEffect(() => {
    if (!session || !authReady || role === 'customer' || active !== 'stock') return;
    loadStockPage({
      stockPage: stockPager.page,
      filters: deferredStockFilters,
      search: deferredStockFilters.search,
    });
  }, [
    active,
    selectedShop,
    deferredStockFilters,
    stockPager.page,
    stockPager.limit,
    session?.token,
    authReady,
  ]);

  useEffect(() => {
    if (!session || !authReady || role === 'customer' || active !== 'customers') return;
    loadCustomersPage({ page: customerPager.page, filters: deferredCustomerFilters });
  }, [active, selectedShop, deferredCustomerFilters, customerPager.page, customerPager.limit, session?.token, authReady]);

  useEffect(() => {
    if (!session || !authReady || role === 'customer' || active !== 'sales') return;
    loadSalesPage({ page: salesPager.page, filters: deferredSalesFilters });
  }, [active, selectedShop, deferredSalesFilters, salesPager.page, salesPager.limit, session?.token, authReady]);

  useEffect(() => {
    if (!session || !authReady || role === 'customer' || active !== 'payments') return;
    loadPendingPage({ page: pendingPager.page, filters: deferredPendingFilters });
  }, [active, selectedShop, deferredPendingFilters, pendingPager.page, pendingPager.limit, session?.token, authReady]);

  useEffect(() => {
    if (!session || !authReady || role === 'customer' || active !== 'reports') return;
    loadReportsPage();
  }, [active, selectedShop, session?.token, authReady]);

  // Ctrl+K / Cmd+K Global Search shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const login = (nextSession) => {
    const normalizedSession = normalizeSession(nextSession);
    localStorage.setItem('session', JSON.stringify(normalizedSession));
    setSession(normalizedSession);
    setAuthReady(true);
    setActivePage(defaultPageForRole(normalizedSession.role), { replace: true });
  };

  const logout = () => {
    localStorage.removeItem('session');
    setSession(null);
    setAuthReady(true);
    setSelectedShop('');
    setActivePage('dashboard', { replace: true });
  };

  const submitShopkeeper = async () => {
    const username = forms.shopkeeper.username.trim();
    const name = forms.shopkeeper.name.trim();
    if (!name || !username || !forms.shopkeeper.password) {
      showToast('Enter the shopkeeper name, username, and password');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      showToast('Username must be 3-40 characters using letters, numbers, dots, dashes, or underscores');
      return;
    }
    if (forms.shopkeeper.password.length < 8) {
      showToast('Password must contain at least 8 characters');
      return;
    }
    let currentShopId = forms.shopkeeper.shop_id;
    if (!currentShopId) {
      showToast('Please select a shop');
      return;
    }
    setSaving(true);
    try {
      if (currentShopId === 'new_shop') {
        if (!forms.shop.name || !forms.shop.area) {
          showToast('Enter new shop name and area.');
          setSaving(false);
          return;
        }
        const createdShop = await authedFetch('/shops', { method: 'POST', body: JSON.stringify(forms.shop) });
        currentShopId = createdShop.id;
        setForms((prev) => ({ ...prev, shop: initialForms.shop }));
      }
      await authedFetch('/shopkeepers', { 
        method: 'POST', 
        body: JSON.stringify({ ...forms.shopkeeper, username, name, shop_id: currentShopId })
      });
      setForms((prev) => ({ ...prev, shopkeeper: initialForms.shopkeeper }));
      showToast('Shopkeeper login created successfully');
      await loadCore();
    } catch (error) {
      showToast(error.message || 'Unable to save right now');
    } finally {
      setSaving(false);
    }
  };

  const openShopkeeperEditor = (shopkeeper) => {
    setEditingShopkeeper(shopkeeper);
    setShopkeeperEditForm({
      username: shopkeeper.username || '',
      password: '',
      name: shopkeeper.name || '',
      contact: shopkeeper.contact || '',
      shop_id: shopkeeper.shop_id ? String(shopkeeper.shop_id) : '',
    });
  };

  const closeShopkeeperEditor = () => {
    if (saving) return;
    setEditingShopkeeper(null);
    setShopkeeperEditForm(initialForms.shopkeeper);
  };

  const updateShopkeeperLogin = async () => {
    if (!editingShopkeeper) return;
    const username = shopkeeperEditForm.username.trim();
    const name = shopkeeperEditForm.name.trim();
    if (!name || !username) {
      showToast('Enter the shopkeeper name and username');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      showToast('Username must be 3-40 characters using letters, numbers, dots, dashes, or underscores');
      return;
    }
    if (shopkeeperEditForm.password && shopkeeperEditForm.password.length < 8) {
      showToast('New password must contain at least 8 characters');
      return;
    }
    if (!shopkeeperEditForm.shop_id) {
      showToast('Please select a shop');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...shopkeeperEditForm,
        username,
        name,
        contact: shopkeeperEditForm.contact.trim(),
        shop_id: shopkeeperEditForm.shop_id,
      };
      await authedFetch(`/shopkeepers/${editingShopkeeper.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      showToast(shopkeeperEditForm.password ? 'Login details and password updated' : 'Login details updated');
      setEditingShopkeeper(null);
      setShopkeeperEditForm(initialForms.shopkeeper);
      await loadCore();
      await loadTab('shopkeepers');
    } catch (error) {
      showToast(error.message || 'Unable to update this shopkeeper');
    } finally {
      setSaving(false);
    }
  };

  const deleteShopkeeper = (shopkeeper) => {
    if (role !== 'superadmin') return;
    requestConfirmation({
      title: `Remove ${shopkeeper.name}'s login?`,
      message: `This immediately blocks @${shopkeeper.username} from signing in. Their historical sales, customers, requests, and audit records will stay safe, and assigned inventory will return to main warehouse ownership.`,
      confirmLabel: 'Delete login',
      onConfirm: async () => {
        try {
          setSaving(true);
          await authedFetch(`/shopkeepers/${shopkeeper.id}`, { method: 'DELETE' });
          showToast(`${shopkeeper.name}'s login was deleted`);
          await loadCore();
          await loadTab('shopkeepers');
        } catch (error) {
          showToast(error.message || 'Unable to delete this shopkeeper');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const post = async (path, formKey, success) => {
    if (['customer', 'stock', 'sale'].includes(formKey) && !requireShopSelection('Select a shop before saving this record')) {
      return;
    }
    try {
      setSaving(true);
      await authedFetch(path, { method: 'POST', body: JSON.stringify({ ...forms[formKey], shop_id: shopId }) });
      setForms((prev) => ({ ...prev, [formKey]: initialForms[formKey] }));
      showToast(success);
      await loadCore();
    } catch (error) {
      showToast(error.message || 'Unable to save right now');
    } finally {
      setSaving(false);
    }
  };

  const updateStock = async (customPayload) => {
    if (!requireShopSelection('Select a shop before updating stock')) return;
    try {
      setSaving(true);
      const payload = customPayload && typeof customPayload === 'object' && customPayload.product_id
        ? { ...customPayload, shop_id: customPayload.shop_id || shopId }
        : { ...forms.stock, shop_id: shopId };
      await authedFetch('/stock', { method: 'PUT', body: JSON.stringify(payload) });
      setForms((prev) => ({ ...prev, stock: initialForms.stock }));
      showToast(role === 'shopkeeper' ? 'Your stock quantity was updated' : 'Stock updated');
      await Promise.all([
        loadCore(),
        loadProductPage({ tab: active === 'models' || active === 'prices' ? active : 'models', page: 1 }),
        active === 'stock' ? loadTab('stock', shopId) : Promise.resolve(),
      ]);
    } catch (error) {
      showToast(error.message || 'Unable to update stock right now');
    } finally {
      setSaving(false);
    }
  };

  const addReferenceOption = async (type, name) => {
    const referenceLabel = {
      categories: 'category',
      colours: 'colour',
      brands: 'brand',
      'manufacturing-brands': 'manufacturing brand',
      suppliers: 'supplier',
      partCategories: 'part category',
      productVariants: 'quality variant',
    }[type] || type;
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      showToast(`Enter a new ${referenceLabel} name`);
      throw new Error(`Enter a new ${referenceLabel} name`);
    }
    try {
      setSaving(true);
      const createdReference = await authedFetch(`/reference-data/${type}`, { method: 'POST', body: JSON.stringify({ name: cleanName }) });
      const reference = await api('/reference-data');
      setData((prev) => ({ ...prev, reference: cleanReferenceData(reference) }));
      const resolvedName = createdReference?.name || cleanName;
      if (active === 'stock' && type === 'partCategories') {
        setForms((prev) => ({ ...prev, product: { ...prev.product, part_category: resolvedName } }));
      }
      if (active === 'stock' && type === 'productVariants') {
        setForms((prev) => ({ ...prev, product: { ...prev.product, quality_variant: resolvedName } }));
      }
      if (active === 'stock' && type === 'colours') {
        setForms((prev) => {
          const selected = prev.product.colours.split(',').map((item) => item.trim()).filter(Boolean);
          return selected.some((item) => sameText(item, resolvedName))
            ? prev
            : { ...prev, product: { ...prev.product, colours: [...selected, resolvedName].join(', ') } };
        });
      }
      setNewReference({ type: '', name: '' });
      showToast(`${resolvedName} added`);
      return createdReference;
    } catch (error) {
      showToast(error.message || `Unable to add ${referenceLabel}`);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const editReferenceOption = async (type, id, name) => {
    const referenceLabel = { categories: 'category', colours: 'colour', brands: 'brand' }[type] || type;
    const cleanName = String(name || '').trim();
    if (!cleanName) return showToast(`Enter a new name for ${referenceLabel}`);
    try {
      setSaving(true);
      await authedFetch(`/reference-data/${type}/${id}`, { method: 'PUT', body: JSON.stringify({ name: cleanName }) });
      await loadCore();
      if (type === 'brands') await loadBrandsPage(shopId);
      showToast(`${referenceLabel} renamed to ${cleanName}`);
    } catch (error) {
      showToast(error.message || `Unable to rename ${referenceLabel}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteReferenceOption = (type, id) => {
    const referenceLabel = { categories: 'category', colours: 'colour', brands: 'brand' }[type] || type;
    const item = data.reference?.[type]?.find((entry) => String(entry.id) === String(id));
    requestConfirmation({
      title: `Archive ${item?.name || referenceLabel}?`,
      message: `This hides the ${referenceLabel} from future dropdowns while keeping existing products, stock, and reports safe.`,
      confirmLabel: 'Archive',
      onConfirm: async () => {
        try {
          setSaving(true);
          await authedFetch(`/reference-data/${type}/${id}`, { method: 'DELETE' });
          await loadCore();
          showToast(`${referenceLabel} archived successfully`);
        } catch (error) {
          showToast(error.message || `Unable to archive ${referenceLabel}`);
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const exportExcel = async (type = 'stock', filters = {}, preloadedItems = null) => {
    try {
      setSaving(true);
      const dateStr = getExportDateStr();

      // Case 1: Stock Prices / Category Export
      if (type === 'prices' || type === 'tools' || type === 'spares' || type === 'oca-glass' || type === 'other-category') {
        let items = preloadedItems;
        if (!items || !items.length) {
          if (data.products && data.products.length) {
            items = consolidateProductList(data.products);
          } else {
            try {
              const fetched = await authedFetch('/export-data?type=products');
              items = consolidateProductList(Array.isArray(fetched) ? fetched : []);
            } catch (fetchErr) {
              console.warn('Export fetch failed for prices/category, using local state', fetchErr);
              items = consolidateProductList(data.products || []);
            }
          }
        }
        if (!items || !items.length) return showToast('No items found to export');
        const prefix = type === 'tools' ? 'Tools' : type === 'spares' ? 'Spares' : type === 'oca-glass' ? 'OCA_Glass' : type === 'other-category' ? 'Other_Category' : 'Stock_Prices';
        exportStockPricesExcel(items, `${prefix}_${dateStr}.xlsx`);
        showToast(`${prefix.replace('_', ' ')} Excel (.xlsx) downloaded`);
        return;
      }

      // Case 2: Product Catalog Export (/stock page)
      if (type === 'products') {
        let items = preloadedItems;
        if (!items || !items.length) {
          try {
            const fetched = await authedFetch('/export-data?type=products');
            items = Array.isArray(fetched) && fetched.length ? fetched : (data.products || []);
          } catch (err) {
            console.warn('Backend product export fetch failed, falling back to local memory state', err);
            items = data.products || [];
          }
        }
        if (!items || !items.length) return showToast('No products found to export');
        exportProductCatalogExcel(items, `Product_Catalog_${dateStr}.xlsx`);
        showToast('Product catalog Excel (.xlsx) downloaded');
        return;
      }

      // Case 3: Current Stock or Other Data Exports
      const params = new URLSearchParams({ type, ...(shopId ? { shopId } : {}), ...filters });
      let rows = [];
      try {
        const fetched = await authedFetch(`/export-data?${params.toString()}`);
        rows = Array.isArray(fetched) ? fetched : [];
      } catch (err) {
        console.warn('Backend export fetch failed, falling back to local memory state', err);
        if (type === 'stock') {
          rows = (data.stock || []).map((item) => ({
            product_name: productName(item),
            model_name: fullModelList(item) || item.model || '',
            brand: item.brand || '',
            category: item.category || '',
            colour: Array.isArray(item.colours) ? item.colours.join(', ') : item.colours || '',
            purchase_price: item.purchase_price || 0,
            wholesale_price: item.wholesale_price || 0,
            sale_price: item.sale_price || 0,
            quantity: item.quantity || 0,
            shop_name: item.shop_name || 'Main Warehouse',
            date_added: item.updated_at ? String(item.updated_at).slice(0, 10) : dateStr,
            stock_status: Number(item.quantity) === 0 ? 'Out of Stock' : Number(item.quantity) <= 3 ? 'Low Stock' : 'In Stock'
          }));
        }
      }

      if (!rows || !rows.length) return showToast('No matching data to export');

      if (type === 'stock') {
        exportCurrentStockExcel(rows, `Current_Stock_${dateStr}.xlsx`);
        showToast('Current stock Excel (.xlsx) downloaded');
      } else if (type === 'sales') {
        exportToExcel({
          filename: `Sales_${dateStr}.xlsx`,
          sheetName: 'Sales',
          columns: [
            { header: 'Sale ID', key: 'sale_id' },
            { header: 'Date', key: 'sale_date' },
            { header: 'Customer', key: 'customer_name' },
            { header: 'Mobile', key: 'customer_mobile' },
            { header: 'Product', key: 'product_name' },
            { header: 'Brand', key: 'brand' },
            { header: 'Category', key: 'category' },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Price Type', key: 'price_type' },
            { header: 'Total Amount', key: 'total_amount' },
            { header: 'Paid Amount', key: 'paid_amount' },
            { header: 'Pending Amount', key: 'pending_amount' },
            { header: 'Payment Mode', key: 'payment_mode' },
            { header: 'Shop', key: 'shop_name' },
            { header: 'Due Date', key: 'due_date' }
          ],
          data: rows
        });
        showToast('Sales report Excel (.xlsx) downloaded');
      } else if (type === 'customers') {
        exportToExcel({
          filename: `Customers_${dateStr}.xlsx`,
          sheetName: 'Customers',
          columns: [
            { header: 'Customer ID', key: 'id' },
            { header: 'Name', key: 'name' },
            { header: 'Mobile', key: 'mobile' },
            { header: 'Address', key: 'address' },
            { header: 'Shop', key: 'shop_name' },
            { header: 'Total Purchases', key: 'total_purchases' },
            { header: 'Pending Balance', key: 'pending_balance' },
            { header: 'Registered Date', key: 'registered_date' }
          ],
          data: rows
        });
        showToast('Customer directory Excel (.xlsx) downloaded');
      } else {
        exportCurrentStockExcel(rows, `as-store-${type}-${dateStr}.xlsx`);
        showToast('Excel file downloaded (.xlsx)');
      }
    } catch (error) {
      showToast(error.message || 'Unable to export Excel file');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = exportExcel;

  const sellingPriceFor = (productId, priceType) => {
    const stockItem = data.stock?.find((item) => String(item.product_id || item.id) === String(productId));
    const product = data.products?.find((item) => String(item.id || item.product_id) === String(productId));
    const catalogItem = data.catalog?.find((item) => String(item.id || item.product_id) === String(productId));
    if (priceType === 'wholesale') return Number(stockItem?.wholesale_price || product?.wholesale_price || catalogItem?.wholesale_price || 0);
    if (priceType === 'retail') return Number(stockItem?.sale_price || product?.sale_price || catalogItem?.sale_price || product?.retail_price || 0);
    return 0;
  };

  const sellingPriceOptions = (productId) => {
    const retail = sellingPriceFor(productId, 'retail');
    const wholesale = sellingPriceFor(productId, 'wholesale');
    return [
      ['retail', `Retail - ${retail > 0 ? priceLabel(retail) : 'Price not set'}`],
      ['wholesale', `Wholesale - ${wholesale > 0 ? priceLabel(wholesale) : 'Price not set'}`],
    ];
  };

  const salesProductOptions = useMemo(() => {
    const list = [...(data.products || []), ...(data.catalog || []), ...(data.stock || [])];
    if (!list.length) return [];

    // O(1) indexed stock map to eliminate O(N*M) quadratic loop
    const stockMap = new Map();
    (data.stock || []).forEach((s) => {
      const sId = String(s.product_id || s.id || '');
      if (sId && !stockMap.has(sId)) {
        stockMap.set(sId, s);
      }
    });

    const map = new Map();
    list.forEach((p) => {
      const id = p.product_id || p.id;
      if (!id) return;
      const strId = String(id);
      if (!map.has(strId)) {
        const title = p.short_name || p.name || p.product_name || p.display_name || 'Product';
        const brand = p.brand || p.company_brand_name || '';
        const mfg = p.manufacturing_brand_name || p.manufacturing_brand || '';
        const cat = p.part_category || p.category || '';
        const variant = p.quality_variant || p.product_variant_name || p.quality || '';
        const models = p.full_model_list || p.compatible_models || p.model || (Array.isArray(p.compatible) ? p.compatible.join(' ') : p.compatible) || '';
        const retailPrice = Number(p.sale_price || p.retail_price || 0);
        const wholesalePrice = Number(p.wholesale_price || 0);
        const imageUrl = p.image_url || p.imageUrl || (Array.isArray(p.image_urls) ? p.image_urls[0] : '');

        // Fast O(1) stock lookup
        const stockItem = stockMap.get(strId);
        const stockQty = stockItem ? Number(stockItem.quantity || stockItem.stock_quantity || 0) : Number(p.quantity || p.stock || 0);

        // Available colors count
        const colors = getProductAvailableColors(p);

        const labelParts = [
          title,
          variant ? `(${variant})` : '',
          cat ? `[${cat}]` : '',
          brand ? `· ${brand}` : '',
        ].filter(Boolean);

        const priceDetails = [];
        if (retailPrice > 0) priceDetails.push(`₹${retailPrice.toLocaleString('en-IN')}`);
        if (wholesalePrice > 0) priceDetails.push(`WS: ₹${wholesalePrice.toLocaleString('en-IN')}`);
        const priceLabelStr = priceDetails.length > 0 ? ` (${priceDetails.join(' | ')})` : '';

        const visibleName = `${labelParts.join(' ').replace(/\s+/g, ' ').trim()}${priceLabelStr}`;

        // Searchable text containing all relevant product attributes and aliases (lowercase):
        const keywords = [
          p.name,
          p.short_name,
          p.display_name,
          p.product_name,
          brand,
          p.company_brand_name,
          mfg,
          cat,
          variant,
          models,
          p.model,
          p.compatible_models,
          p.full_model_list,
          Array.isArray(p.colours) ? p.colours.join(' ') : p.colours,
          'retail',
          'wholesale',
          retailPrice > 0 ? retailPrice : '',
          wholesalePrice > 0 ? wholesalePrice : '',
          p.description,
        ].filter(Boolean).join(' ').toLowerCase();

        map.set(strId, {
          id: strId,
          name: visibleName,
          keywords,
          brand,
          category: cat,
          quality: variant,
          model: models,
          image_url: imageUrl,
          stock: stockQty,
          coloursCount: colors.length,
          retailPrice: retailPrice > 0 ? retailPrice : '',
          wholesalePrice: wholesalePrice > 0 ? wholesalePrice : '',
          defaultPrice: retailPrice > 0 ? retailPrice : (wholesalePrice > 0 ? wholesalePrice : ''),
        });
      }
    });

    return Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.products, data.catalog, data.stock, data.reference]);

  const getProductDefaultPrice = useCallback((productId) => {
    if (!productId) return '';
    const allProducts = [...(data.products || []), ...(data.catalog || []), ...(data.stock || [])];
    const match = allProducts.find((p) => String(p.product_id || p.id) === String(productId));
    if (!match) return '';
    const price = Number(match.sale_price || match.retail_price || match.wholesale_price || 0);
    return price > 0 ? String(price) : '';
  }, [data.products, data.catalog, data.stock]);

  const calculateSaleTotals = (items, expenses = forms?.sale?.expenses || []) => {
    const productsTotal = (items || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const extraExpensesTotal = (expenses || []).reduce((sum, exp) => sum + Math.max(Number(exp.amount || 0), 0), 0);
    const grandTotal = productsTotal + extraExpensesTotal;
    return {
      products_total: String(productsTotal),
      extra_expenses_total: String(extraExpensesTotal),
      original_total: String(grandTotal),
      final_total_amount: String(grandTotal),
      total_amount: String(grandTotal),
      discount_amount: '0',
      discount_percentage: '0',
      is_custom_total: false,
    };
  };

  const updateSaleItemProduct = (index, productId) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '', color_breakdown: [] }])];
    const defaultPrice = getProductDefaultPrice(productId);
    const qty = Number(currentItems[index]?.quantity ?? 0);
    const total = (defaultPrice !== '' && qty > 0) ? String(Number(defaultPrice) * qty) : '0';

    const selectedProd = (data.products || []).find((p) => String(p.id || p.product_id) === String(productId)) 
      || (data.productResults || []).find((p) => String(p.id || p.product_id) === String(productId))
      || (data.catalog || []).find((p) => String(p.id || p.product_id) === String(productId));
    const availableColors = getProductAvailableColors(selectedProd);

    // If only 1 colour exists, auto-select it under the hood with quantity = qty
    const initialBreakdown = availableColors.length === 1 
      ? [{ color: availableColors[0], qty: qty }] 
      : [];

    const cleanShortName = selectedProd
      ? (selectedProd.short_name || selectedProd.product_short_name || selectedProd.name || '')
      : '';
    const rawMfg = selectedProd
      ? (selectedProd.manufacturing_brand_name || selectedProd.mfg_brand_name || selectedProd.manufacturing_brand || selectedProd.brand || '')
      : '';
    const cleanBrandName = String(rawMfg).replace(/^mfg:\s*/i, '').trim();

    currentItems[index] = {
      product_id: productId,
      selling_price: defaultPrice,
      price_type: 'retail',
      quantity: qty,
      total_amount: total,
      color_breakdown: initialBreakdown,
      custom_product_name: cleanShortName,
      custom_brand_name: cleanBrandName,
    };

    const totals = calculateSaleTotals(currentItems, forms.sale.expenses);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        product_id: currentItems[0]?.product_id || '',
        quantity: currentItems[0]?.quantity || 0,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const updateSaleItemPriceType = (index, priceType) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '' }])];
    const item = currentItems[index] || {};
    const unitPrice = sellingPriceFor(item.product_id, priceType);
    const quantity = Number(item.quantity ?? 0);
    const priceVal = unitPrice > 0 ? String(unitPrice) : (item.selling_price || '');
    const total = (priceVal !== '' && quantity > 0) ? String(Number(priceVal) * quantity) : '0';

    currentItems[index] = {
      ...item,
      price_type: priceType,
      selling_price: priceVal,
      total_amount: total,
    };

    const totals = calculateSaleTotals(currentItems, forms.sale.expenses);
    setForms((prev) => ({ ...prev, sale: { ...prev.sale, ...totals, items: currentItems } }));
  };

  const updateSaleItemSellingPrice = (index, priceVal) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '' }])];
    const item = currentItems[index] || {};
    const qty = Number(item.quantity ?? 0);
    const numericPrice = priceVal === '' ? '' : Number(priceVal);
    const total = (priceVal !== '' && !isNaN(numericPrice) && qty > 0) ? String(numericPrice * qty) : '0';

    currentItems[index] = {
      ...item,
      selling_price: priceVal,
      total_amount: total,
    };

    const totals = calculateSaleTotals(currentItems, forms.sale.expenses);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const updateSaleItemQuantity = (index, quantityVal) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '' }])];
    const item = currentItems[index] || {};
    const numericPrice = Number(item.selling_price || 0);
    const numericQty = quantityVal === '' ? '' : Number(quantityVal);
    const total = (quantityVal !== '' && !isNaN(numericQty) && numericPrice > 0) ? String(numericPrice * numericQty) : (item.total_amount || '0');

    const selectedProd = (data.products || []).find((p) => String(p.id || p.product_id) === String(item.product_id)) 
      || (data.productResults || []).find((p) => String(p.id || p.product_id) === String(item.product_id))
      || (data.catalog || []).find((p) => String(p.id || p.product_id) === String(item.product_id));
    const availableColors = getProductAvailableColors(selectedProd);

    // If only 1 colour, update its color breakdown quantity automatically
    let breakdown = item.color_breakdown || [];
    if (availableColors.length === 1 && numericQty > 0) {
      breakdown = [{ color: availableColors[0], qty: numericQty }];
    }

    currentItems[index] = {
      ...item,
      quantity: quantityVal === '' ? '' : numericQty,
      total_amount: total,
      color_breakdown: breakdown,
    };

    const totals = calculateSaleTotals(currentItems, forms.sale.expenses);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        quantity: currentItems[0]?.quantity || 0,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const updateSaleItemColorQuantity = (itemIndex, colorName, colorQtyVal) => {
    const currentItems = [...(forms.sale.items || [])];
    const item = { ...currentItems[itemIndex] };
    const breakdown = Array.isArray(item.color_breakdown) ? [...item.color_breakdown] : [];
    
    const existingIndex = breakdown.findIndex((b) => b.color === colorName);
    const parsedQty = colorQtyVal === '' ? '' : Math.max(0, parseInt(colorQtyVal, 10) || 0);

    if (existingIndex >= 0) {
      if (parsedQty === 0 && colorQtyVal !== '') {
        breakdown.splice(existingIndex, 1);
      } else {
        breakdown[existingIndex] = { ...breakdown[existingIndex], qty: parsedQty };
      }
    } else if (parsedQty > 0 || colorQtyVal === '') {
      breakdown.push({ color: colorName, qty: parsedQty });
    }

    item.color_breakdown = breakdown;

    const totalColorQty = breakdown.reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
    const newQty = breakdown.length > 0 ? (totalColorQty || 0) : item.quantity;
    item.quantity = newQty;

    const unitPrice = Number(item.selling_price || 0);
    item.total_amount = unitPrice > 0 ? String(unitPrice * newQty) : item.total_amount;

    currentItems[itemIndex] = item;
    const totals = calculateSaleTotals(currentItems);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        quantity: currentItems[0]?.quantity || 0,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const updateSaleItemSingleColor = (itemIndex, colorName) => {
    const currentItems = [...(forms.sale.items || [])];
    const item = { ...currentItems[itemIndex] };
    item.selected_colour = colorName;
    item.color_breakdown = [{ color: colorName, qty: Number(item.quantity || 0) }];
    currentItems[itemIndex] = item;
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        items: currentItems,
      },
    }));
  };

  const toggleSaleItemColor = (itemIndex, colorName) => {
    const currentItems = [...(forms.sale.items || [])];
    const item = { ...currentItems[itemIndex] };
    const breakdown = Array.isArray(item.color_breakdown) ? [...item.color_breakdown] : [];
    const existingIndex = breakdown.findIndex((b) => b.color === colorName);

    if (existingIndex >= 0) {
      breakdown.splice(existingIndex, 1);
    } else {
      breakdown.push({ color: colorName, qty: 1 });
    }

    item.color_breakdown = breakdown;
    const totalColorQty = breakdown.reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
    if (breakdown.length > 0) {
      item.quantity = totalColorQty;
      item.selected_colour = breakdown.length === 1 ? breakdown[0].color : '__split__';
    }

    const unitPrice = Number(item.selling_price || 0);
    item.total_amount = unitPrice > 0 ? String(unitPrice * item.quantity) : item.total_amount;

    currentItems[itemIndex] = item;
    const totals = calculateSaleTotals(currentItems);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        quantity: currentItems[0]?.quantity || 0,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const addSaleItem = () => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '', color_breakdown: [], custom_product_name: '', custom_brand_name: '' }])];
    currentItems.push({ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '', color_breakdown: [], custom_product_name: '', custom_brand_name: '' });
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        items: currentItems,
      },
    }));
  };

  const updateSaleItemCustomName = (index, nameVal) => {
    const currentItems = [...(forms.sale.items || [])];
    if (!currentItems[index]) return;
    currentItems[index] = {
      ...currentItems[index],
      custom_product_name: nameVal,
    };
    setForms((prev) => ({ ...prev, sale: { ...prev.sale, items: currentItems } }));
  };

  const updateSaleItemCustomBrand = (index, brandVal) => {
    const currentItems = [...(forms.sale.items || [])];
    if (!currentItems[index]) return;
    currentItems[index] = {
      ...currentItems[index],
      custom_brand_name: brandVal,
    };
    setForms((prev) => ({ ...prev, sale: { ...prev.sale, items: currentItems } }));
  };

  const removeSaleItem = (index) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '', color_breakdown: [] }])];
    if (currentItems.length <= 1) {
      currentItems[0] = { product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '', color_breakdown: [], custom_product_name: '', custom_brand_name: '' };
    } else {
      currentItems.splice(index, 1);
    }
    const totals = calculateSaleTotals(currentItems, forms.sale.expenses);
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        product_id: currentItems[0]?.product_id || '',
        quantity: currentItems[0]?.quantity || 0,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const startEditSale = (sale) => {
    if (!sale) return;
    const saleItems = Array.isArray(sale.items) && sale.items.length > 0
      ? sale.items.map((it) => ({
          product_id: String(it.product_id),
          quantity: Number(it.quantity || 1),
          selling_price: it.selling_price || it.unit_price || it.price || '',
          price_type: it.price_type || 'retail',
          total_amount: Number(it.total_price || it.total_amount || 0),
          color_breakdown: Array.isArray(it.color_breakdown) ? it.color_breakdown : (it.colour ? [{ color: it.colour, qty: Number(it.quantity || 1) }] : []),
          selected_colour: it.colour || '',
          custom_product_name: it.custom_product_name || '',
          custom_brand_name: it.custom_brand_name || '',
        }))
      : [{
          product_id: String(sale.product_id || ''),
          quantity: Number(sale.quantity || 1),
          selling_price: sale.unit_price || sale.selling_price || '',
          price_type: sale.price_type || 'retail',
          total_amount: Number(sale.products_total || sale.total_amount || 0),
          color_breakdown: sale.colour ? [{ color: sale.colour, qty: Number(sale.quantity || 1) }] : [],
          selected_colour: sale.colour || '',
          custom_product_name: sale.custom_product_name || '',
          custom_brand_name: sale.custom_brand_name || '',
        }];

    const saleExpenses = Array.isArray(sale.expenses) && sale.expenses.length > 0
      ? sale.expenses.map((e) => ({
          id: e.id || Date.now() + Math.random(),
          expense_type: e.expense_type || 'custom',
          expense_name: e.expense_name || e.description || 'Courier',
          amount: Number(e.amount || 0),
        }))
      : (Number(sale.extra_expenses_total || 0) > 0 ? [{
          id: Date.now(),
          expense_type: 'courier',
          expense_name: 'Courier',
          amount: Number(sale.extra_expenses_total),
        }] : []);

    const rawDate = sale.invoice_date || sale.sale_date || '';
    const initialDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
      ? rawDate.slice(0, 10)
      : getTodayIso();

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        editing_sale_id: sale.id,
        editing_invoice_number: sale.invoice_number || `INV-${String(sale.id).padStart(6, '0')}`,
        customer_id: String(sale.customer_id || ''),
        invoice_date: initialDate,
        payment_terms_days: Number(sale.payment_terms_days !== undefined && sale.payment_terms_days !== null ? sale.payment_terms_days : 7),
        due_date: sale.due_date ? String(sale.due_date).slice(0, 10) : calculateDueDate(initialDate, Number(sale.payment_terms_days || 7)),
        previous_balance: sale.previous_balance !== undefined && sale.previous_balance !== null ? sale.previous_balance : '',
        paid_amount: sale.paid_amount !== undefined && sale.paid_amount !== null ? String(sale.paid_amount) : '0',
        payment_mode: sale.payment_mode || 'cash',
        notes: sale.notes || '',
        items: saleItems,
        expenses: saleExpenses,
      },
    }));

    setActivePage('customers');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Loaded invoice ${sale.invoice_number || `INV-${String(sale.id).padStart(6, '0')}`} into editor`);
  };

  const cancelEditSale = () => {
    setForms((prev) => ({
      ...prev,
      sale: {
        ...initialForms.sale,
        invoice_date: getTodayIso(),
        payment_terms_days: 7,
        due_date: calculateDueDate(getTodayIso(), 7),
        previous_balance: '',
        applied_credit_amount: 0,
        items: [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '' }],
        expenses: [],
        editing_sale_id: null,
        editing_invoice_number: null,
      },
    }));
    showToast('Cancelled invoice editing');
  };

  const addSaleExpense = () => {
    const currentExpenses = [...(forms.sale.expenses || [])];
    currentExpenses.push({
      id: Date.now() + Math.random(),
      expense_type: 'custom',
      expense_name: '',
      amount: '',
    });
    const totals = calculateSaleTotals(forms.sale.items, currentExpenses);
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        ...totals,
        expenses: currentExpenses,
      },
    }));
  };

  const updateSaleExpense = (index, field, value) => {
    const currentExpenses = [...(forms.sale.expenses || [])];
    currentExpenses[index] = { ...currentExpenses[index], [field]: value };
    const totals = calculateSaleTotals(forms.sale.items, currentExpenses);
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        ...totals,
        expenses: currentExpenses,
      },
    }));
  };

  const removeSaleExpense = (index) => {
    const currentExpenses = [...(forms.sale.expenses || [])];
    currentExpenses.splice(index, 1);
    const totals = calculateSaleTotals(forms.sale.items, currentExpenses);
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        ...totals,
        expenses: currentExpenses,
      },
    }));
  };

  const updateSaleInvoiceDate = (invoiceDate) => {
    const terms = forms.sale.payment_terms_days !== undefined ? forms.sale.payment_terms_days : 7;
    const newDueDate = calculateDueDate(invoiceDate, terms);
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        invoice_date: invoiceDate,
        due_date: newDueDate,
      },
    }));
  };

  const updateSalePaymentTerms = (termsDays) => {
    const parsedDays = parseInt(termsDays, 10);
    const validDays = isNaN(parsedDays) ? 0 : Math.max(0, parsedDays);
    const invDate = forms.sale.invoice_date || getTodayIso();
    const newDueDate = calculateDueDate(invDate, validDays);
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        payment_terms_days: termsDays === '' ? '' : validDays,
        due_date: newDueDate,
      },
    }));
  };

  const deleteSale = (sale) => {
    requestConfirmation({
      title: `Delete sale for ${productName(sale)}?`,
      message: `This will delete the sale, remove its payments, and restore ${sale.quantity || 1} item(s) to stock. You can then create the corrected sale.`,
      confirmLabel: 'Delete sale',
      intent: 'danger',
      onConfirm: async () => {
        try {
          await authedFetch(`/sales/${sale.id}`, { method: 'DELETE' });
          showToast('Sale deleted and stock restored');
          await loadTab(active, shopId);
        } catch (error) {
          showToast(error.message || 'Unable to delete sale', 'error');
        }
      },
    });
  };

  const submitSale = async (reloadTab = active) => {
    if (!requireShopSelection('Select a shop before creating a sale')) return;
    
    const customerId = forms.sale.customer_id;
    const dueDate = forms.sale.due_date;
    const notes = forms.sale.notes;
    const items = forms.sale.items || [{ product_id: forms.sale.product_id, selling_price: forms.sale.selling_price, quantity: Number(forms.sale.quantity), total_amount: Number(forms.sale.total_amount) }];
    const expenses = forms.sale.expenses || [];
    
    if (!customerId) {
      return showToast('Please select a customer first', 'error');
    }

    if (!items.length || items.some(i => !i.product_id)) {
      return showToast('Please select a product for each line item', 'error');
    }

    if (items.some(i => !i.quantity || Number(i.quantity) <= 0)) {
      return showToast('Each item quantity must be at least 1', 'error');
    }

    if (items.some(i => !i.selling_price || Number(i.selling_price) <= 0 || !i.total_amount || Number(i.total_amount) <= 0)) {
      return showToast('Please enter a valid selling price greater than 0 for all items', 'error');
    }

    if (expenses.some(e => Number(e.amount || 0) < 0)) {
      return showToast('Expense amounts cannot be negative', 'error');
    }

    const productsTotal = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const extraExpensesTotal = expenses.reduce((sum, exp) => sum + Math.max(Number(exp.amount || 0), 0), 0);
    const calculatedTotal = productsTotal + extraExpensesTotal;

    const validExpenses = expenses
      .filter((e) => e && Number(e.amount) > 0 && String(e.expense_name || e.description || '').trim())
      .map((e) => ({
        expense_type: e.expense_type || 'custom',
        expense_name: String(e.expense_name || e.description).trim(),
        amount: Number(e.amount),
      }));

    try {
      setSaving(true);
      const isEditing = Boolean(forms.sale.editing_sale_id);
      const endpoint = isEditing ? `/sales/${forms.sale.editing_sale_id}` : '/sales';
      const method = isEditing ? 'PUT' : 'POST';

      await authedFetch(endpoint, {
        method,
        body: JSON.stringify({
          shop_id: shopId,
          customer_id: customerId,
          paid_amount: String(Number(forms.sale.paid_amount || 0)),
          applied_credit_amount: Number(forms.sale.applied_credit_amount || 0),
          apply_advance: forms.sale.apply_advance !== false,
          previous_balance: Number(forms.sale.previous_balance || 0),
          invoice_date: forms.sale.invoice_date || getTodayIso(),
          payment_terms_days: Number(forms.sale.payment_terms_days !== undefined ? forms.sale.payment_terms_days : 7),
          due_date: dueDate,
          notes,
          payment_mode: forms.sale.payment_mode || 'cash',
          products_total: productsTotal,
          extra_expenses_total: extraExpensesTotal,
          original_total: calculatedTotal,
          final_total_amount: calculatedTotal,
          discount_amount: 0,
          discount_percentage: 0,
          expenses: validExpenses,
          items: items.map((item) => {
            const unitPrice = Number(item.selling_price || (Number(item.total_amount) / Number(item.quantity || 1)));
            return {
              product_id: item.product_id,
              quantity: Number(item.quantity),
              selling_price: unitPrice,
              unit_price: unitPrice,
              price_type: item.price_type || 'retail',
              color_breakdown: Array.isArray(item.color_breakdown) 
                ? item.color_breakdown.filter(c => c && c.color && Number(c.qty) > 0) 
                : [],
              custom_product_name: item.custom_product_name !== undefined && item.custom_product_name !== null
                ? String(item.custom_product_name).trim()
                : undefined,
              custom_brand_name: item.custom_brand_name !== undefined && item.custom_brand_name !== null
                ? String(item.custom_brand_name).trim()
                : undefined,
            };
          }),
        }),
      });

      setForms((prev) => ({
        ...prev,
        sale: {
          ...initialForms.sale,
          invoice_date: getTodayIso(),
          payment_terms_days: 7,
          due_date: calculateDueDate(getTodayIso(), 7),
          previous_balance: 0,
          applied_credit_amount: 0,
          items: [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 0, total_amount: '' }],
          expenses: [],
          editing_sale_id: null,
          editing_invoice_number: null,
        },
      }));
      showToast(isEditing ? 'Invoice updated successfully' : 'Sale created successfully');
      await loadTab(reloadTab, shopId);
      if (!['sales', 'customers', 'stock'].includes(reloadTab)) {
        await loadStockPage({
          stockPage: stockPager.page,
          currentShop: shopId,
          filters: stockFilters,
          search: stockFilters.search,
        });
      }
      await loadTab('dashboard', shopId);
    } catch (error) {
      showToast(error.message || 'Unable to create sale right now', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitRequest = async () => {
    if (!requireShopSelection('Select a shop before sending a stock request')) return;
    if (!forms.request.product_id && !forms.request.model_name.trim()) {
      return showToast('Choose a product or enter the model needed');
    }
    try {
      setSaving(true);
      await authedFetch('/stock-requests', { method: 'POST', body: JSON.stringify({ ...forms.request, shop_id: shopId }) });
      setForms((prev) => ({ ...prev, request: initialForms.request }));
      showToast('Stock request sent');
      await loadTab('requests', shopId);
    } catch (error) {
      showToast(error.message || 'Unable to send request right now');
    } finally {
      setSaving(false);
    }
  };

  const submitTransfer = async () => {
    try {
      setSaving(true);
      await authedFetch('/stock-transfer', { method: 'POST', body: JSON.stringify(forms.transfer) });
      setForms((prev) => ({ ...prev, transfer: initialForms.transfer }));
      setTransferDrawerOpen(false);
      showToast('Stock transferred');
      await loadTab('stock', shopId);
      await loadTab('dashboard', shopId);
    } catch (error) {
      showToast(error.message || 'Unable to transfer stock right now');
    } finally {
      setSaving(false);
    }
  };

  const updateRequestStatus = async (requestId, status) => {
    try {
      setSaving(true);
      await authedFetch(`/stock-requests/${requestId}`, { method: 'PUT', body: JSON.stringify({ status }) });
      showToast('Request updated');
      await loadTab('requests', shopId);
    } catch (error) {
      showToast(error.message || 'Unable to update request right now');
    } finally {
      setSaving(false);
    }
  };

  const recordPayment = async (paymentEntry) => {
    const amount = forms.payment.sale_id === String(paymentEntry.id) ? forms.payment.amount : '';
    if (!amount) return showToast('Enter payment amount first');
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return showToast('Enter a valid payment amount');
    if (numericAmount > Number(paymentEntry.pending_amount || 0)) return showToast('Payment cannot exceed the pending balance');
    try {
      setSaving(true);
      try {
        await authedFetch('/payments', {
          method: 'POST',
          body: JSON.stringify(paymentEntry.items
            ? { customer_id: paymentEntry.customer_id, shop_id: paymentEntry.shop_id, amount: numericAmount, note: forms.payment.note }
            : { sale_id: paymentEntry.id, amount: numericAmount, note: forms.payment.note }),
        });
      } catch (error) {
        if (!paymentEntry.items || error?.status !== 400 || !/sale and amount|required/i.test(error.message)) throw error;
        let remaining = numericAmount;
        const sales = [...paymentEntry.items].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || Number(a.id) - Number(b.id));
        for (const sale of sales) {
          if (remaining <= 0) break;
          const allocated = Math.min(remaining, Number(sale.pending_amount || 0));
          if (allocated > 0) {
            await authedFetch('/payments', {
              method: 'POST',
              body: JSON.stringify({ sale_id: sale.id, amount: allocated, note: forms.payment.note }),
            });
            remaining -= allocated;
          }
        }
      }
      setForms((prev) => ({ ...prev, payment: initialForms.payment }));
      showToast('Payment recorded');
      await loadTab('payments', shopId);
    } catch (error) {
      showToast(error.message || 'Unable to record payment right now');
    } finally {
      setSaving(false);
    }
  };

  const submitProduct = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (saving) return;

    const openingStock = forms.product.opening_stock === '' ? 0 : Number(forms.product.opening_stock);
    const openingStockLocationId = shopId || data.warehouse?.id;
    const numericPrice = (value) => value === '' || value === null || value === undefined ? null : Number(value);
    const targetPartCat = (forms.product.part_category || forms.product.category || 'Display').trim();
    const payload = {
      short_name: (forms.product.short_name || '').trim(),
      full_model_list: (forms.product.full_model_list || '').trim(),
      name: (forms.product.full_model_list || '').trim(),
      brand: (forms.product.brand || '').trim(),
      category: targetPartCat,
      part_category: targetPartCat,
      quality_variant: (forms.product.quality_variant || '').trim(),
      model: (forms.product.model || '').trim(),
      official_price: numericPrice(forms.product.sale_price),
      purchase_price: numericPrice(forms.product.purchase_price),
      sale_price: numericPrice(forms.product.sale_price),
      wholesale_price: numericPrice(forms.product.wholesale_price),
      retail_price: numericPrice(forms.product.sale_price),
      description: (forms.product.description || '').trim(),
      colours: (forms.product.colours || '').split(',').map((colour) => colour.trim()).filter(Boolean),
      manufacturing_brand_id: forms.product.manufacturing_brand_id ? Number(forms.product.manufacturing_brand_id) : null,
      supplier_id: forms.product.supplier_id ? Number(forms.product.supplier_id) : null,
      shop_id: shopId || null,
      image_url: forms.product.image_url || null,
      image_urls: forms.product.image_urls || [],
    };

    if (!payload.short_name) {
      payload.short_name = [payload.brand, payload.model, payload.part_category].filter(Boolean).join(' ') || payload.full_model_list || 'Unnamed Product';
    }

    if (!payload.full_model_list) {
      payload.full_model_list = payload.model || payload.short_name;
      payload.name = payload.full_model_list;
    }

    if (!payload.model) {
      payload.model = payload.full_model_list || payload.short_name || '';
    }

    const optionalPrices = [payload.purchase_price, payload.wholesale_price, payload.sale_price].filter((price) => price !== null);
    if (optionalPrices.some((price) => !Number.isFinite(price) || price < 0)) return showToast('All entered prices must be 0 or more');
    if (!Number.isInteger(openingStock) || openingStock < 0) {
      return showToast('Opening stock must be 0 or more');
    }
    if (openingStock > 0 && !openingStockLocationId) return showToast('Warehouse is not configured yet');

    // Client-side Deduplication / Existing Product Check
    if (!editingProductId && data.products && Array.isArray(data.products)) {
      const targetPayloadModel = (payload.model || payload.short_name || payload.full_model_list || '').toLowerCase().trim();

      const existingProduct = data.products.find((existing) => {
        const isInactiveOrDeleted = existing.is_active === 0 || existing.is_active === false || existing.is_deleted === true || (existing.deleted_at !== null && existing.deleted_at !== undefined);
        if (isInactiveOrDeleted) return false;

        const existingModel = (existing.model || existing.short_name || existing.full_model_list || '').toLowerCase().trim();
        if (!targetPayloadModel || !existingModel) return false;

        const brandMatch = (existing.brand || '').toLowerCase().trim() === (payload.brand || '').toLowerCase().trim();
        const modelMatch = existingModel === targetPayloadModel;
        const catMatch = (existing.part_category || existing.category || '').toLowerCase().trim() === (payload.part_category || '').toLowerCase().trim();
        const variantMatch = (existing.quality_variant || '').toLowerCase().trim() === (payload.quality_variant || '').toLowerCase().trim();

        const targetMfg = (payload.manufacturing_brand_id ? String(payload.manufacturing_brand_id) : '').toLowerCase().trim();
        const existingMfg = (existing.manufacturing_brand_id ? String(existing.manufacturing_brand_id) : (existing.manufacturing_brand_name || existing.manufacturing_brand || '')).toLowerCase().trim();
        const mfgMatch = !targetMfg || !existingMfg ? true : (existingMfg === targetMfg);

        const targetSupplier = (payload.supplier_id ? String(payload.supplier_id) : '').toLowerCase().trim();
        const existingSupplier = (existing.supplier_id ? String(existing.supplier_id) : (existing.supplier_name || existing.supplier || '')).toLowerCase().trim();
        const supplierMatch = !targetSupplier || !existingSupplier ? true : (existingSupplier === targetSupplier);

        return brandMatch && modelMatch && catMatch && variantMatch && mfgMatch && supplierMatch;
      });

      if (existingProduct) {
        if (openingStock > 0 && openingStockLocationId) {
          try {
            setSaving(true);
            await authedFetch('/stock', {
              method: 'PUT',
              body: JSON.stringify({ shop_id: openingStockLocationId, product_id: existingProduct.id, quantity: openingStock }),
            });
            setForms((prev) => ({ ...prev, product: initialForms.product }));
            setEditingProductId('');
            showToast(`Product exists in catalog. Added ${openingStock} pcs to your branch stock.`);
            await loadCore();
            if (active === 'stock') await loadTab('stock', shopId);
            return;
          } catch (err) {
            showToast(err.message || 'Unable to update branch stock');
            return;
          } finally {
            setSaving(false);
          }
        } else {
          setForms((prev) => ({
            ...prev,
            stock: { ...prev.stock, product_id: existingProduct.id }
          }));
          return showToast('Product already exists in catalog. Selected in "Set My Stock Quantity" above to update your branch.');
        }
      }
    }

    try {
      setSaving(true);
      if (payload.category && !(data.reference?.categories || []).some(c => c.name.toLowerCase() === payload.category.toLowerCase())) {
        try {
          await authedFetch('/reference-data/categories', { method: 'POST', body: JSON.stringify({ name: payload.category }) });
        } catch (e) {
          console.warn('Auto category creation notice:', e);
        }
      }
      const created = editingProductId
        ? await authedFetch(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await authedFetch('/products', { method: 'POST', body: JSON.stringify(payload) });

      const newProductId = created?.id || created?.data?.id || editingProductId;
      if (!editingProductId && openingStock > 0 && newProductId) {
        await authedFetch('/stock', {
          method: 'PUT',
          body: JSON.stringify({
            shop_id: openingStockLocationId,
            product_id: newProductId,
            quantity: openingStock,
            color_quantities: forms.product.color_opening_stock || undefined,
          }),
        });
      }

      const returnedRecord = created?.data || (created?.name ? created : null);
      if (returnedRecord) {
        setData((prev) => {
          const nextProducts = editingProductId
            ? prev.products.map(p => String(p.id) === String(editingProductId) ? { ...p, ...returnedRecord } : p)
            : [returnedRecord, ...prev.products.filter(p => String(p.id) !== String(returnedRecord.id))];
          const nextResults = editingProductId
            ? (prev.productResults || []).map(p => String(p.id) === String(editingProductId) ? { ...p, ...returnedRecord } : p)
            : [returnedRecord, ...(prev.productResults || []).filter(p => String(p.id) !== String(returnedRecord.id))];
          return {
            ...prev,
            products: nextProducts,
            productResults: nextResults,
            catalog: [returnedRecord, ...(prev.catalog || []).filter(p => String(p.id) !== String(returnedRecord.id))],
          };
        });
      }

      setForms((prev) => ({ ...prev, product: initialForms.product }));
      setEditingProductId('');
      showToast(editingProductId ? 'Product prices and details updated' : openingStock > 0 ? 'Product added with opening stock' : 'Product added successfully');
      
      const refData = await api('/reference-data');
      setData((prev) => ({ ...prev, reference: cleanReferenceData(refData) }));
      await Promise.all([
        loadCore(),
        loadProductPage({ tab: active === 'models' || active === 'prices' ? active : 'models', page: 1 }),
        active === 'stock' ? loadTab('stock', shopId) : Promise.resolve(),
      ]);
    } catch (error) {
      showToast(error.message || 'Unable to add product right now');
    } finally {
      setSaving(false);
    }
  };

  const editProduct = (product) => {
    const prodId = product.product_id || product.id;
    setEditingProductId(String(prodId));
    const targetCat = product.part_category || product.part_category_name || product.category || 'Display';
    const targetVariant = product.quality_variant || product.product_variant_name || '';
    setForms((prev) => ({
      ...prev,
      product: {
        short_name: product.short_name || product.name || '',
        full_model_list: product.full_model_list || product.name || '',
        brand: product.brand || '',
        category: targetCat,
        part_category: targetCat,
        quality_variant: targetVariant,
        model: product.model || '',
        official_price: product.official_price !== undefined && product.official_price !== null ? String(product.official_price) : '',
        purchase_price: product.purchase_price !== undefined && product.purchase_price !== null ? String(product.purchase_price) : '',
        sale_price: product.sale_price !== undefined && product.sale_price !== null ? String(product.sale_price) : (product.retail_price !== undefined && product.retail_price !== null ? String(product.retail_price) : ''),
        wholesale_price: product.wholesale_price !== undefined && product.wholesale_price !== null ? String(product.wholesale_price) : '',
        retail_price: product.retail_price !== undefined && product.retail_price !== null ? String(product.retail_price) : (product.sale_price !== undefined && product.sale_price !== null ? String(product.sale_price) : ''),
        opening_stock: '',
        description: product.description || '',
        colours: Array.isArray(product.colours) ? product.colours.join(', ') : (product.colours || ''),
        manufacturing_brand_id: product.manufacturing_brand_id !== undefined && product.manufacturing_brand_id !== null ? String(product.manufacturing_brand_id) : '',
        supplier_id: product.supplier_id !== undefined && product.supplier_id !== null ? String(product.supplier_id) : '',
        image_url: product.image_url || '',
        image_urls: product.image_urls || [],
      },
    }));
    setActive('stock');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cloneProduct = (product) => {
    setEditingProductId(''); // Ensure it creates a new record
    const targetCat = product.part_category || product.part_category_name || product.category || 'Display';
    const targetVariant = product.quality_variant || product.product_variant_name || '';
    setForms((prev) => ({
      ...prev,
      product: {
        short_name: product.short_name || product.name || '',
        full_model_list: product.full_model_list || product.name || '',
        brand: product.brand || '',
        category: targetCat,
        part_category: targetCat,
        quality_variant: targetVariant,
        model: product.model || '',
        official_price: product.official_price !== undefined && product.official_price !== null ? String(product.official_price) : '',
        purchase_price: product.purchase_price !== undefined && product.purchase_price !== null ? String(product.purchase_price) : '',
        sale_price: product.sale_price !== undefined && product.sale_price !== null ? String(product.sale_price) : (product.retail_price !== undefined && product.retail_price !== null ? String(product.retail_price) : ''),
        wholesale_price: product.wholesale_price !== undefined && product.wholesale_price !== null ? String(product.wholesale_price) : '',
        retail_price: product.retail_price !== undefined && product.retail_price !== null ? String(product.retail_price) : (product.sale_price !== undefined && product.sale_price !== null ? String(product.sale_price) : ''),
        opening_stock: '',
        description: product.description || '',
        colours: Array.isArray(product.colours) ? product.colours.join(', ') : (product.colours || ''),
        manufacturing_brand_id: product.manufacturing_brand_id !== undefined && product.manufacturing_brand_id !== null ? String(product.manufacturing_brand_id) : '',
        supplier_id: product.supplier_id !== undefined && product.supplier_id !== null ? String(product.supplier_id) : '',
        image_url: product.image_url || '',
        image_urls: product.image_urls || [],
      },
    }));
    setActive('stock');
    showToast(`Cloned listing from ${productName(product)}. Edit variant or model and click "Add product" to save as new record.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteProduct = (product) => {
    if (role !== 'superadmin') return;
    const name = productName(product);
    const productId = product.product_id || product.id;
    requestConfirmation({
      title: `Delete ${name}?`,
      message: 'If this product has sales, requests, or transfer history, it will be deactivated instead of hard-deleted so reports remain safe.',
      confirmLabel: 'Delete / Deactivate',
      onConfirm: async () => {
        try {
          setSaving(true);
          await authedFetch(`/products/${productId}`, { method: 'DELETE' });
          if (editingProductId === String(productId)) {
            setEditingProductId('');
            setForms((prev) => ({ ...prev, product: initialForms.product }));
          }
          const selectedId = selectedProductDetails?.product_id || selectedProductDetails?.id;
          if (selectedId === productId) setSelectedProductDetails(null);
          
          setData((prev) => ({
            ...prev,
            products: (prev.products || []).filter((p) => String(p.id || p.product_id) !== String(productId)),
            stock: (prev.stock || []).filter((s) => String(s.product_id || s.id) !== String(productId)),
          }));

          showToast(`${name} was deleted`);
          await loadCore();
          if (active === 'stock') await loadTab('stock', shopId);
          if (active === 'models' || active === 'prices') await loadProductPage({ tab: active, page: productPager.page });
        } catch (error) {
          showToast(error.message || 'Unable to delete this product');
        } finally {
          setSaving(false);
        }
      },
    });
  };

  const getDueDateInfo = (dueDateStr) => {
    if (!dueDateStr) return { label: 'Not Set', shortLabel: 'No Date', type: 'none', daysDiff: null, color: 'slate', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
    const raw = String(dueDateStr).split('T')[0];
    const parts = raw.split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      return { label: dueDateStr, shortLabel: 'Date', type: 'none', daysDiff: null, color: 'slate', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
    }
    const [y, m, d] = parts;
    const targetDate = new Date(y, m - 1, d);
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate.getTime() - todayDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      const overdueDays = Math.abs(diffDays);
      return {
        label: `${overdueDays} Day${overdueDays === 1 ? '' : 's'} Overdue`,
        shortLabel: 'Overdue',
        type: 'overdue',
        daysDiff: diffDays,
        color: 'rose',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold'
      };
    } else if (diffDays === 0) {
      return {
        label: 'Due Today',
        shortLabel: 'Due Today',
        type: 'today',
        daysDiff: 0,
        color: 'amber',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-bold'
      };
    } else {
      return {
        label: `Due in ${diffDays} Day${diffDays === 1 ? '' : 's'}`,
        shortLabel: 'Upcoming',
        type: 'upcoming',
        daysDiff: diffDays,
        color: 'emerald',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
      };
    }
  };

  const whatsappLink = (item) => {
    const mobile = String(item.mobile || '').replace(/\D/g, '');
    const cleanMobile = mobile.startsWith('91') && mobile.length > 10 ? mobile : (mobile.length === 10 ? `91${mobile}` : mobile);
    const dueDateStr = item.due_date ? formatDateDMY(item.due_date) : 'earliest';
    const invoiceCount = item.items?.length || 1;
    const msg = `Dear ${item.customer_name},\nThis is a friendly reminder from ${item.shop_name || 'Pinky Sales'}.\nYou have an outstanding pending balance of ${currency(item.pending_amount)} across ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'} (Due: ${dueDateStr}).\nKindly arrange for the payment at your earliest convenience.\nThank you!`;
    return cleanMobile ? `https://wa.me/${cleanMobile}?text=${encodeURIComponent(msg)}` : '#';
  };

  const submitRecordPaymentModal = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!paymentModalTarget) return;
    const numericAmount = Number(paymentModalForm.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return showToast('Enter a valid payment amount greater than zero');
    }
    const maxPending = Number(paymentModalTarget.pending_amount || 0);
    if (numericAmount > maxPending) {
      return showToast(`Payment cannot exceed the pending balance of ${currency(maxPending)}`);
    }

    try {
      setSaving(true);
      const payload = {
        amount: numericAmount,
        payment_mode: paymentModalForm.mode || 'cash',
        payment_date: paymentModalForm.date || today(),
        note: [
          paymentModalForm.note?.trim(),
          paymentModalForm.reference_no ? `Ref: ${paymentModalForm.reference_no.trim()}` : ''
        ].filter(Boolean).join(' · '),
      };

      if (paymentModalTarget.items || paymentModalTarget.customer_id) {
        payload.customer_id = paymentModalTarget.customer_id;
        payload.shop_id = paymentModalTarget.shop_id || shopId;
      } else {
        payload.sale_id = paymentModalTarget.id;
      }

      await authedFetch('/payments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      showToast(`Payment of ${currency(numericAmount)} recorded successfully!`);
      setPaymentModalTarget(null);
      setPaymentModalForm({ amount: '', mode: 'cash', reference_no: '', note: '', date: today() });
      await Promise.all([
        loadTab('payments', shopId),
        loadTab('sales', shopId),
        loadTab('customers', shopId),
        loadTab('dashboard', shopId),
        loadCore(),
      ]);
    } catch (error) {
      showToast(error.message || 'Unable to record payment right now');
    } finally {
      setSaving(false);
    }
  };

  const printStockPDF = (shopName, shopArea, stockData) => {
    if (!stockData || !stockData.length) return;
    const printWindow = window.open('', '_blank');
    const rows = stockData.map(item => `
      <tr>
        <td><strong>${productName(item)}</strong><br><small style="color: #64748b;">${item.brand} · ${item.category || 'Mobile'}</small></td>
        <td style="text-align: right;">₹${Number(item.sale_price).toLocaleString('en-IN')}</td>
        <td style="text-align: center; font-weight: bold; ${item.quantity <= 3 ? 'color: #dc2626;' : ''}">${item.quantity} pcs</td>
        <td style="text-align: right; font-weight: bold;">₹${(Number(item.quantity) * Number(item.sale_price)).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Stock Sheet - ${shopName}</title>
          <style>
            body {
              font-family: 'Inter', system-ui, sans-serif;
              color: #0f172a;
              padding: 20px;
              margin: 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th {
              background: #f1f5f9;
              color: #0f172a;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 11px;
              letter-spacing: 0.5px;
              padding: 10px;
              border: 1px solid #cbd5e1;
            }
            td {
              padding: 10px;
              border: 1px solid #e2e8f0;
              font-size: 13px;
            }
            tr:nth-child(even) {
              background: #f8fafc;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Product Model</th>
                <th style="text-align: right; width: 140px;">Sale Price</th>
                <th style="text-align: center; width: 120px;">Available Qty</th>
                <th style="text-align: right; width: 160px;">Total Value</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printCurrentStockSheet = (shopName, shopArea, stockData) => {
    if (!stockData || !stockData.length) {
      showToast('No stock rows to print');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Allow popups to print the stock sheet');
      return;
    }
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
    const printPrice = (value) => Number(value) > 0 ? currency(value) : '-';
    const printedAt = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const totalStock = stockData.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const rows = stockData.map(item => `
      <tr>
        <td>
          <strong>${escapeHtml(productName(item))}</strong>
          <small>${escapeHtml([item.brand || 'No brand', item.category || 'Mobile'].filter(Boolean).join(' / '))}</small>
        </td>
        <td>${escapeHtml(fullModelList(item) || productName(item))}</td>
        <td class="num">${currency(item.purchase_price)}</td>
        <td class="num">${currency(item.sale_price)}</td>
        <td class="qty ${Number(item.quantity || 0) <= 3 ? 'low' : ''}">${Number(item.quantity || 0).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Stock Sheet - ${shopName}</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: 'Inter', system-ui, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
            header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 2px solid #0f766e; }
            h1 { margin: 0 0 4px; font-size: 20px; }
            p { margin: 0; color: #475569; }
            .meta { text-align: right; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; vertical-align: top; }
            th { background: #f1f5f9; text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #334155; }
            th.num, td.num { text-align: right; width: 90px; }
            th.qty, td.qty { text-align: right; width: 75px; font-weight: 700; }
            td.qty.low { color: #dc2626; }
            td small { display: block; color: #64748b; font-size: 10.5px; margin-top: 1px; }
            footer { margin-top: 16px; font-size: 10.5px; color: #64748b; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 8px; }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>${escapeHtml(shopName)}</h1>
              <p>${escapeHtml(shopArea || '')} · Complete Stock Sheet</p>
            </div>
            <div class="meta">
              <p>Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              <p>Total Items: ${stockData.length} | Units: ${totalStock.toLocaleString('en-IN')}</p>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th style="width: 35%;">Product</th>
                <th style="width: 30%;">Full Model List</th>
                <th class="num">Buy Price</th>
                <th class="num">Sale Price</th>
                <th class="qty">Stock</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <footer>
            <span>${escapeHtml(shopName)} - Internal Stock Report</span>
            <span>Page 1</span>
          </footer>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printInvoicePDF = (sale) => {
    const printWindow = window.open('', '_blank');
    const invoiceNo = `INV-${String(sale.id).padStart(6, '0')}`;
    const invDateStr = formatDateDMY(sale.invoice_date || sale.sale_date || new Date().toISOString().slice(0, 10));
    const dueDateStr = sale.due_date ? formatDateDMY(sale.due_date) : 'Not set';
    const termsStr = sale.payment_terms_days ? `${sale.payment_terms_days} Days` : '15 Days';
    const shopName = sale.shop_name || 'Pinky Sales';
    const rawExpenses = Array.isArray(sale.expenses) ? sale.expenses : [];
    const expensesTotal = Number(sale.extra_expenses_total || rawExpenses.reduce((s, e) => s + Number(e.amount || 0), 0) || 0);
    const prodTotal = Number(sale.products_total || Math.max(Number(sale.total_amount || 0) - expensesTotal, 0));
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice - ${invoiceNo}</title>
          <style>
            body {
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 40px;
              line-height: 1.5;
            }
            .invoice-box {
              max-width: 800px;
              margin: auto;
              background: #fff;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #f1f5f9;
              padding-bottom: 24px;
              margin-bottom: 30px;
            }
            .brand h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 800;
              letter-spacing: -0.5px;
              color: #0d9488;
            }
            .brand p {
              margin: 4px 0 0;
              font-size: 13px;
              color: #64748b;
            }
            .inv-details {
              text-align: right;
            }
            .inv-details h2 {
              margin: 0;
              font-size: 20px;
              font-weight: 800;
              color: #0f172a;
            }
            .inv-details p {
              margin: 4px 0 0;
              font-size: 13px;
              color: #64748b;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr 1fr;
              gap: 20px;
              margin-bottom: 30px;
              padding: 16px;
              background: #f8fafc;
              border-radius: 12px;
            }
            .meta-section h3 {
              margin: 0 0 8px;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #94a3b8;
              font-weight: 800;
            }
            .meta-section p {
              margin: 0 0 4px;
              font-size: 13px;
              color: #334155;
            }
            .meta-section strong {
              color: #0f172a;
              font-weight: 700;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th {
              background: #f8fafc;
              color: #475569;
              font-weight: 700;
              text-transform: uppercase;
              font-size: 11px;
              letter-spacing: 0.5px;
              padding: 12px 16px;
              border-bottom: 2px solid #e2e8f0;
              text-align: left;
            }
            td {
              padding: 14px 16px;
              border-bottom: 1px solid #f1f5f9;
              font-size: 13px;
              color: #334155;
            }
            .text-right {
              text-align: right;
            }
            .summary-box {
              width: 320px;
              margin-left: auto;
              margin-top: 20px;
              padding-top: 16px;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 6px 0;
              font-size: 13px;
              color: #64748b;
            }
            .summary-row.total {
              border-top: 2px solid #e2e8f0;
              margin-top: 8px;
              padding-top: 12px;
              font-size: 17px;
              font-weight: 800;
              color: #0f172a;
            }
            .summary-row.paid {
              color: #16a34a;
              font-weight: 700;
            }
            .summary-row.due {
              color: #dc2626;
              font-weight: 700;
            }
            .footer {
              margin-top: 50px;
              border-top: 1px solid #f1f5f9;
              padding-top: 20px;
              text-align: center;
              font-size: 12px;
              color: #94a3b8;
            }
            @media print {
              body {
                padding: 0;
              }
              .invoice-box {
                max-width: 100%;
              }
            }
          </style>
        </head>
        <body>
          <div class="invoice-box">
            <div class="header">
              <div class="brand">
                <h1>${shopName}</h1>
                <p>Premium Mobile &amp; Display Solutions</p>
              </div>
              <div class="inv-details">
                <h2>INVOICE</h2>
                <p><strong>Invoice No:</strong> ${invoiceNo}</p>
                <p><strong>Invoice Date:</strong> ${invDateStr}</p>
              </div>
            </div>
            
            <div class="meta-grid">
              <div class="meta-section">
                <h3>Billed To</h3>
                <p><strong>${sale.customer_name || 'Walk-in Customer'}</strong></p>
                <p>${sale.mobile || ''}</p>
                <p>${sale.address || 'No Address Provided'}</p>
              </div>
              <div class="meta-section">
                <h3>Payment Terms</h3>
                <p><strong>Terms:</strong> ${termsStr}</p>
                <p><strong>Due Date:</strong> ${dueDateStr}</p>
                <p><strong>Payment Mode:</strong> ${(sale.payment_mode || 'cash').toUpperCase()}</p>
              </div>
              <div class="meta-section" style="text-align: right;">
                <h3>Store Details</h3>
                <p><strong>${shopName}</strong></p>
                <p>${sale.shop_area || ''}</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Item / Description</th>
                  <th class="text-right" style="width: 90px;">Qty</th>
                  <th class="text-right" style="width: 130px;">Unit Price</th>
                  <th class="text-right" style="width: 130px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${(Array.isArray(sale.items) && sale.items.length > 0 ? sale.items : [{
                  short_name: sale.short_name || sale.product_short_name,
                  product_name: sale.product_name || sale.name,
                  manufacturing_brand_name: sale.manufacturing_brand_name,
                  colour: sale.colour,
                  price_type: sale.price_type || 'retail',
                  quantity: sale.quantity || 1,
                  unit_price: Number(prodTotal) / Number(sale.quantity || 1),
                  total_price: prodTotal,
                }]).map((it) => {
                  const rate = Number(it.rate ?? it.unit_price ?? it.selling_price ?? it.price ?? (it.total_amount && it.quantity ? Number(it.total_amount) / Number(it.quantity) : (it.amount && it.quantity ? Number(it.amount) / Number(it.quantity) : 0)));
                  const qty = Number(it.quantity ?? it.qty ?? 1);
                  const itemTotal = Number(it.total_amount ?? it.total_price ?? it.total ?? it.amount ?? (rate * qty));
                  const unitPrice = qty > 0 ? (rate || (itemTotal / qty)) : itemTotal;

                  const rawShort = it.custom_product_name || it.short_name || it.product_short_name || it.product_name || it.name || '';
                  const shortName = String(rawShort).split('/')[0].split(',')[0].trim() || 'Item';
                  const rawMfg = it.custom_brand_name || it.manufacturing_brand_name || it.mfg_brand_name || it.manufacturing_brand || sale.manufacturing_brand_name || '';
                  const mfgBrand = String(rawMfg).replace(/^mfg:\s*/i, '').trim();
                  return `
                  <tr>
                    <td>
                      <strong style="font-size: 12.5px;">${escapeHtml(shortName)}</strong>
                      ${mfgBrand ? `<br/><small style="color: #0f766e; font-weight: 700; font-size: 11px;">${escapeHtml(mfgBrand)}</small>` : ''}
                      ${it.colour ? `<br/><span style="display:inline-block; margin-top:3px; padding:1px 6px; background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; border-radius:4px; font-size:11px; font-weight:700;">Colour: ${escapeHtml(it.colour)}</span>` : ''}
                      <br/>
                      <small style="color: #64748b; font-size: 11px;">${it.price_type === 'wholesale' ? 'Wholesale' : 'Retail'} price</small>
                    </td>
                    <td class="text-right">${qty} pcs</td>
                    <td class="text-right">₹${Number(unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-right">₹${Number(itemTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                `;}).join('')}
                ${rawExpenses.map((exp) => `
                  <tr style="background: #fafafa;">
                    <td>
                      <span style="font-weight: 600; color: #0f766e;">+ ${escapeHtml(exp.expense_name || 'Extra Expense')}</span>
                      <small style="color: #94a3b8; font-size: 11px; display: block;">Additional Service / Charge</small>
                    </td>
                    <td class="text-right">1</td>
                    <td class="text-right">₹${Number(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td class="text-right">₹${Number(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="summary-box">
              <div class="summary-row">
                <span>Products Subtotal</span>
                <span>₹${Number(prodTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              ${expensesTotal > 0 ? `
                <div class="summary-row" style="color: #0f766e; font-weight: 600;">
                  <span>+ COURIER / EXPENSES</span>
                  <span>+₹${Number(expensesTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ` : ''}
              ${Number(sale.previous_balance || 0) > 0 ? `
                <div class="summary-row" style="color: #b45309; font-weight: 600;">
                  <span>+ PREVIOUS BALANCE</span>
                  <span>+₹${Number(sale.previous_balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ` : ''}
              ${Number(sale.applied_credit_amount || 0) > 0 ? `
                <div class="summary-row" style="color: #0f766e; font-weight: 600;">
                  <span>- CREDIT NOTE</span>
                  <span>-₹${Number(sale.applied_credit_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ` : ''}
              <div class="summary-row total">
                <span>Grand Total</span>
                <span>₹${Number(sale.net_payable_amount ?? sale.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div class="summary-row paid">
                <span>Amount Paid</span>
                <span>₹${Number(sale.paid_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div class="summary-row due">
                <span>Balance Due</span>
                <span>₹${Number(sale.closing_balance !== undefined && sale.closing_balance !== null ? sale.closing_balance : sale.pending_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              ${(() => {
                const customerObj = (data.customers || []).find(c => String(c.id) === String(sale.customer_id))
                  || (data.pending || []).find(c => String(c.customer_id || c.id) === String(sale.customer_id))
                  || sale.customer
                  || {};
                const customerAdvanceBal = Number(customerObj.advance_balance ?? sale.customer_advance_balance ?? sale.advance_balance ?? 0);
                const remainingCredit = (sale.closing_balance !== undefined && Number(sale.closing_balance) < 0)
                  ? Math.abs(Number(sale.closing_balance))
                  : (Number(sale.previous_balance || 0) < 0 && (prodTotal + expensesTotal + Number(sale.previous_balance || 0)) < 0
                    ? Math.abs(prodTotal + expensesTotal + Number(sale.previous_balance || 0))
                    : customerAdvanceBal);
                return remainingCredit > 0 ? `
                  <div class="summary-row" style="color: #0f766e; font-weight: 700; border-top: 1px dashed #0f766e; margin-top: 4px; padding-top: 4px;">
                    <span>Available Credit</span>
                    <span>₹${Number(remainingCredit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr</span>
                  </div>
                ` : '';
              })()}
            </div>

            <div class="footer">
              <p>Thank you for choosing ${shopName}!</p>
              <p style="font-size: 11px; margin-top: 6px; color: #cbd5e1;">This is a computer-generated document. No signature required.</p>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printTaxInvoicePDF = (sale, existingWindow = null) => {
    const printWindow = existingWindow || window.open('', '_blank');
    if (!printWindow) {
      showToast('Allow pop-ups to open the invoice');
      return;
    }

    const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[character]));
    const formatDate = (value) => {
      if (!value) return '';
      const str = String(value).trim();
      const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return `${match[3]}/${match[2]}/${match[1]}`;
      }
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
      return safe(value);
    };
    const formatAmount = (value) => Number(value || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const toWords = (value) => {
      const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
      const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
      const words = (number) => {
        if (number < 20) return ones[number];
        if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ''}`;
        if (number < 1000) return `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${words(number % 100)}` : ''}`;
        if (number < 100000) return `${words(Math.floor(number / 1000))} Thousand${number % 1000 ? ` ${words(number % 1000)}` : ''}`;
        if (number < 10000000) return `${words(Math.floor(number / 100000))} Lakh${number % 100000 ? ` ${words(number % 100000)}` : ''}`;
        return `${words(Math.floor(number / 10000000))} Crore${number % 10000000 ? ` ${words(number % 10000000)}` : ''}`;
      };
      const wholeAmount = Math.max(0, Math.floor(Number(value || 0)));
      return wholeAmount ? words(wholeAmount) : 'Zero';
    };

    const invoiceItems = Array.isArray(sale.items) && sale.items.length ? sale.items : [sale];
    const isConsolidated = Boolean(sale.consolidated);
    const invoiceDateVal = sale.invoice_date || sale.sale_date || (isConsolidated ? new Date().toISOString().slice(0, 10) : sale.sale_date);

    const expandedItems = invoiceItems.flatMap((item) => {
      const parentDate = item.invoice_date || item.sale_date || sale.invoice_date || sale.sale_date || invoiceDateVal;
      if (Array.isArray(item.items) && item.items.length > 0) {
        return item.items.map((sub) => ({
          ...sub,
          sale_date: sub.invoice_date || sub.sale_date || parentDate,
          invoice_date: sub.invoice_date || sub.sale_date || parentDate,
        }));
      }
      return [{
        ...item,
        sale_date: item.invoice_date || item.sale_date || parentDate,
        invoice_date: item.invoice_date || item.sale_date || parentDate,
      }];
    });

    const purchaseDates = expandedItems.map((item) => item.invoice_date || item.sale_date).filter(Boolean).sort();
    const firstPurchaseDate = purchaseDates[0] || invoiceDateVal;
    const latestPurchaseDate = purchaseDates[purchaseDates.length - 1] || invoiceDateVal;
    const hasOutstandingBalance = invoiceItems.some((item) => Number(item.pending_amount || 0) > 0);
    const outstandingDueDates = invoiceItems.filter((item) => Number(item.pending_amount || 0) > 0).map((item) => item.due_date).filter(Boolean).sort();
    
    // Single source of truth: INV-XXXXXX format across entire application
    const invoiceNo = sale.invoice_number || `INV-${String(sale.id || 1).padStart(6, '0')}`;
    
    const shopName = 'PINKYSALES';
    const shopAddress = 'C-314, Pratik Arcade, Surat';
    const shopPhone = '+91 90995 69700';
    const shopLines = `
      <div>${safe(shopAddress)}</div>
      <div>Gujarat, India &middot; Phone: ${safe(shopPhone)}</div>
    `;
    const custGstin = sale.gstin || sale.customer_gstin || '';
    const customerDetails = [
      sale.mobile ? `Phone: ${safe(sale.mobile)}` : '',
      sale.address ? safe(sale.address) : '',
      custGstin ? `<strong>GSTIN:</strong> ${safe(custGstin)}` : ''
    ].filter(Boolean).join(' &middot; ');
    const allExpenses = (sale.expenses && Array.isArray(sale.expenses) ? sale.expenses : []).concat(
      invoiceItems.flatMap(it => (Array.isArray(it.expenses) ? it.expenses : []))
    ).filter((exp, idx, self) => exp && exp.amount > 0 && self.findIndex(o => o.id === exp.id && o.expense_name === exp.expense_name) === idx);

    const courier = Number(sale.extra_expenses_total ?? sale.extra_expenses ?? sale.courier_charge ?? sale.courier ?? (
      allExpenses.reduce((s, e) => s + Number(e.amount || 0), 0)
    ) ?? 0);

    const isCash = String(sale.payment_mode || '').trim().toLowerCase() === 'cash';
    const termsLabel = isCash ? 'Terms: Cash Only' : (sale.payment_terms_days ? `${sale.payment_terms_days} Days` : '15 Days');
    const dueDateVal = isCash ? 'Immediate / On Receipt' : (sale.due_date || (outstandingDueDates.length ? outstandingDueDates[0] : (hasOutstandingBalance ? 'Not set' : 'Paid')));

    const periodLabel = firstPurchaseDate === latestPurchaseDate
      ? formatDate(firstPurchaseDate)
      : `${formatDate(firstPurchaseDate)} to ${formatDate(latestPurchaseDate)}`;

    const itemRows = expandedItems.map((item, index) => {
      // 1. Correct key lookups for item rates and row totals
      const rate = Number(item.rate ?? item.unit_price ?? item.selling_price ?? item.price ?? (item.total_amount && item.quantity ? Number(item.total_amount) / Number(item.quantity) : (item.amount && item.quantity ? Number(item.amount) / Number(item.quantity) : 0)));
      const qty = Number(item.quantity ?? item.qty ?? 1);
      const itemTotal = Number(item.total_amount ?? item.total_price ?? item.total ?? item.amount ?? (rate * qty));
      const unitPrice = qty > 0 ? (rate || (itemTotal / qty)) : lineTotal;

      // Only show Short Name - never show concatenated compatible models
      const rawShort = item.short_name || item.product_short_name || item.product_name || item.name || '';
      const shortName = String(rawShort).split('/')[0].split(',')[0].trim() || 'Item';

      // Item Description Formatting:
      // Line 1: Product Name (e.g. MOTO EDGE 50)
      // Line 2 (if present): Color Variants / Attributes (e.g. [ Black: 2, Green: 2 ])
      // Line 3 (if present): Brand Name Only (e.g. AS CARE — strictly without Mfg. prefix)
      const brandName = getBrandName(item, sale);
      const colourStr = item.colour && String(item.colour).trim()
        ? (String(item.colour).trim().startsWith('[') ? String(item.colour).trim() : `[ ${String(item.colour).trim()} ]`)
        : '';
      const productDetails = brandName ? `<small style="display:block; margin-top:2px; color:#475569; font-size:11px; font-weight:700;">${safe(brandName)}</small>` : '';

      return `
        <tr>
          <td class="number">${index + 1}</td>
          <td class="item">
            <strong style="font-size: 12.5px; color: #0f172a; display: block;">${safe(shortName)}</strong>
            ${colourStr ? `<span style="display:inline-block; margin-top:2px; margin-right:4px; padding:1px 5px; background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; border-radius:3px; font-size:10px; font-weight:700;">${safe(colourStr)}</span>` : ''}
            ${productDetails}
          </td>
          <td class="qty">${qty}<br/>PCS</td>
          <td class="money">${formatAmount(unitPrice)}</td>
          <td class="money">${formatAmount(itemTotal)}</td>
        </tr>
      `;
    }).join('');

    // Summary calculation breakdown
    const productsSubtotal = Number(sale.products_total || expandedItems.reduce((sum, it) => {
      const r = Number(it.rate ?? it.unit_price ?? it.selling_price ?? it.price ?? 0);
      const q = Number(it.quantity ?? it.qty ?? 1);
      const lineTot = Number(it.total_amount ?? it.total_price ?? it.total ?? it.amount ?? (r * q));
      return sum + lineTot;
    }, 0));

    const prevBalance = Number(sale.previous_balance ?? sale.old_balance ?? 0);
    const appliedCredit = Number(sale.applied_credit_amount ?? sale.credit_applied ?? 0);

    // Current invoice value + carry forward balance - credits
    const grandTotal = Math.max(0, (productsSubtotal + courier + prevBalance) - appliedCredit);
    const paidAmount = Number(sale.paid_amount ?? sale.amount_paid ?? (
      invoiceItems.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0)
    ) ?? 0);
    const balanceDue = Math.max(0, grandTotal - paidAmount);
    const quantity = expandedItems.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 1), 0);

    // Look up customer advance balance / store credit
    const customerObj = (data.customers || []).find(c => String(c.id) === String(sale.customer_id))
      || (data.pending || []).find(c => String(c.customer_id || c.id) === String(sale.customer_id))
      || sale.customer
      || {};
    const customerAdvanceBal = Number(customerObj.advance_balance ?? sale.customer_advance_balance ?? sale.advance_balance ?? 0);

    // Calculate customer's remaining available advance / store credit balance
    const remainingCredit = (sale.closing_balance !== undefined && Number(sale.closing_balance) < 0)
      ? Math.abs(Number(sale.closing_balance))
      : (prevBalance < 0 && (productsSubtotal + courier + prevBalance) < 0
        ? Math.abs(productsSubtotal + courier + prevBalance)
        : customerAdvanceBal);

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html lang="en">
        <head>
          <title>Invoice - ${invoiceNo}</title>
          <style>
            @page { size: A4; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; padding: 12mm; background: #fff; color: #111; font: 12px Arial, Helvetica, sans-serif; }
            .invoice { max-width: 190mm; min-height: 260mm; margin: auto; border: 1px solid #777; }
            .header { display: grid; grid-template-columns: 1fr 1fr; align-items: start; padding: 7px 9px 5px; border-bottom: 1px solid #999; }
            h1 { margin: 0; font-size: 19px; line-height: 1.1; font-weight: 800; text-transform: uppercase; }
            .shop-details { margin-top: 4px; line-height: 1.35; }
            h2 { margin: 0; text-align: right; font-size: ${isConsolidated ? '24px' : '33px'}; line-height: 1.05; font-weight: 400; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; min-height: 78px; border-bottom: 1px solid #999; }
            .meta > div { padding: 4px 8px; }
            .meta > div:first-child { border-right: 1px solid #999; }
            .meta-line { display: grid; grid-template-columns: 115px 8px 1fr; gap: 2px; line-height: 1.5; }
            .bill-title { padding: 3px 7px; font-weight: 700; background: #f2f2f2; border-bottom: 1px solid #999; }
            .bill-to { min-height: 36px; padding: 6px 7px; font-weight: 700; border-bottom: 1px solid #999; }
            .bill-to small, .item small { display: block; margin-top: 2px; font-weight: 400; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 5px 7px; border-right: 1px solid #999; border-bottom: 1px solid #999; vertical-align: top; }
            th:last-child, td:last-child { border-right: 0; }
            th { background: #f2f2f2; text-align: left; font-weight: 700; }
            .number { width: 38px; text-align: center; }
            .qty { width: 82px; text-align: right; }
            .money { width: 100px; text-align: right; }
            .item { min-height: 42px; }
            .summary { display: grid; grid-template-columns: 56% 44%; }
            .notes { min-height: 175px; padding: 7px; border-right: 1px solid #999; border-bottom: 1px solid #999; }
            .words { margin: 13px 0 18px; }
            .words strong { display: block; margin-top: 2px; font-style: italic; }
            .notes-block { margin-top: 14px; }
            .totals { border-bottom: 1px solid #999; }
            .total-line { display: grid; grid-template-columns: 1fr 105px; gap: 12px; padding: 3px 7px; text-align: right; }
            .grand { font-weight: 800; font-size: 13px; }
            .signature { height: 110px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; border-top: 1px solid #999; }
            @media print {
              body { padding: 0; }
              .invoice { max-width: 100%; }
              thead { display: table-header-group; }
              tr, .summary { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="invoice">
            <div class="header">
              <div><h1>${shopName}</h1><div class="shop-details">${shopLines}</div></div>
              <h2>${isConsolidated ? 'CONSOLIDATED INVOICE' : 'TAX INVOICE'}</h2>
            </div>
            <div class="meta">
              <div>
                <div class="meta-line"><span>Invoice No</span><b>:</b><strong>${invoiceNo}</strong></div>
                <div class="meta-line"><span>Invoice Date</span><b>:</b><strong>${formatDate(invoiceDateVal)}</strong></div>
                <div class="meta-line"><span>Purchase Period</span><b>:</b><strong>${periodLabel}</strong></div>
                <div class="meta-line"><span>Payment Terms</span><b>:</b><strong>${termsLabel}</strong></div>
                <div class="meta-line"><span>Due Date</span><b>:</b><strong>${dueDateVal !== 'Not set' && dueDateVal !== 'Paid' ? formatDate(dueDateVal) : dueDateVal}</strong></div>
              </div>
              <div>
                <div class="meta-line"><span>Payment Mode</span><b>:</b><strong>${(sale.payment_mode || 'cash').toUpperCase()}</strong></div>
              </div>
            </div>
            <div class="bill-title">Bill To</div>
            <div class="bill-to">${safe(sale.customer_name || 'Walk-in Customer')}${customerDetails ? `<small>${customerDetails}</small>` : ''}</div>
            <table>
              <thead><tr><th class="number">#</th><th>Item &amp; Description</th><th class="qty">Qty</th><th class="money">Rate</th><th class="money">Amount</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table>
            <div class="summary">
              <div class="notes">
                <div>Items in Total ${quantity}</div>
                <div class="words">Total In Words<strong>Indian Rupee ${toWords(grandTotal)} Only</strong></div>
                <div class="notes-block">Notes<br/>${safe(isConsolidated ? 'This invoice includes all purchases made by this customer at this branch.' : sale.notes || 'Thanks for your business.')}</div>
                <div class="notes-block">Terms &amp; Conditions<br/>Goods once sold will not be returned or exchanged.</div>
                ${remainingCredit > 0 ? `
                  <div class="notes-block" style="color: #0f766e; font-weight: 700; background: #f0fdfa; padding: 6px 8px; border-radius: 4px; border: 1px solid #99f6e4;">
                    Available Store Credit / Advance: Rs. ${formatAmount(remainingCredit)} Cr
                  </div>
                ` : ''}
              </div>
              <div class="totals">
                <div class="total-line"><span>Products Subtotal</span><span>${formatAmount(productsSubtotal)}</span></div>
                ${allExpenses.length > 0 ? allExpenses.map(exp => `
                  <div class="total-line" style="color: #0f766e;">
                    <span>+ ${safe(String(exp.expense_name || 'COURIER').toUpperCase())}</span>
                    <span>${formatAmount(exp.amount)}</span>
                  </div>
                `).join('') : (courier > 0 ? `
                  <div class="total-line" style="color: #0f766e;">
                    <span>+ COURIER</span>
                    <span>${formatAmount(courier)}</span>
                  </div>
                ` : '')}
                ${prevBalance > 0 ? `
                  <div class="total-line" style="color: #b45309; font-weight: 600;">
                    <span>+ PREVIOUS BALANCE</span>
                    <span>Rs.${formatAmount(prevBalance)}</span>
                  </div>
                ` : (prevBalance < 0 ? `
                  <div class="total-line" style="color: #0f766e; font-weight: 600;">
                    <span>- PREVIOUS ADVANCE</span>
                    <span>-Rs.${formatAmount(Math.abs(prevBalance))}</span>
                  </div>
                ` : '')}
                ${appliedCredit > 0 ? `
                  <div class="total-line" style="color: #0f766e; font-weight: 600;">
                    <span>- CREDIT NOTE</span>
                    <span>-Rs.${formatAmount(appliedCredit)}</span>
                  </div>
                ` : ''}
                ${Number(sale.advance_applied || 0) > 0 ? `
                  <div class="total-line" style="color: #0f766e; font-weight: 600;">
                    <span>- STORE CREDIT / ADVANCE</span>
                    <span>-Rs.${formatAmount(sale.advance_applied)}</span>
                  </div>
                ` : ''}
                <div class="total-line grand"><span>Grand Total</span><span>Rs.${formatAmount(grandTotal)}</span></div>
                <div class="total-line grand"><span>Amount Paid</span><span>Rs.${formatAmount(paidAmount)}</span></div>
                ${balanceDue <= 0 ? `
                  <div class="total-line grand" style="color: #047857;"><span>Payment Status</span><span>✓ PAID IN FULL</span></div>
                  ${Array.isArray(sale.payments) && sale.payments.length > 0 ? `
                    <div class="total-line" style="color: #047857; font-size: 11px;">
                      <span>Paid on ${formatDate(sale.payments[sale.payments.length - 1].payment_date)}</span>
                      <span>via ${(sale.payments[sale.payments.length - 1].payment_mode || 'Cash').toUpperCase()}</span>
                    </div>
                  ` : ''}
                ` : `
                  <div class="total-line grand" style="color: #b91c1c;"><span>Balance Due</span><span>Rs.${formatAmount(balanceDue)}</span></div>
                `}
                ${remainingCredit > 0 ? `
                  <div class="total-line grand" style="color: #0f766e; border-top: 1px dashed #0f766e; margin-top: 3px; padding-top: 3px;">
                    <span>Available Credit</span>
                    <span>Rs.${formatAmount(remainingCredit)} Cr</span>
                  </div>
                ` : ''}
                <div class="signature">Authorized Signature</div>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const printCustomerInvoicePDF = async (customer) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Allow pop-ups to open the invoice');
      return;
    }

    printWindow.document.write('<!doctype html><title>Preparing invoice</title><body style="font:16px Arial;padding:40px">Preparing complete customer invoice...</body>');
    printWindow.document.close();

    try {
      const params = new URLSearchParams({
        customerId: String(customer.customer_id || customer.id),
        shopId: String(customer.shop_id || shopId),
      });
      const invoice = await authedFetch(`/customer-invoice?${params.toString()}`);
      if (!invoice.sales || !invoice.sales.length) {
        throw new Error('No purchases found for this customer');
      }
      const firstSale = invoice.sales[0];
      const lastSale = invoice.sales[invoice.sales.length - 1];
      const allCustomerItems = invoice.sales.flatMap(s => (Array.isArray(s.items) && s.items.length ? s.items.map(sub => ({ ...sub, sale_date: s.sale_date })) : [s]));
      const allCustomerExpenses = invoice.sales.flatMap(s => (Array.isArray(s.expenses) ? s.expenses : []));
      const totalPaid = invoice.sales.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0);
      const totalPending = invoice.sales.reduce((sum, s) => sum + Number(s.pending_amount || 0), 0);
      const totalCredit = invoice.sales.reduce((sum, s) => sum + Number(s.applied_credit_amount || 0), 0);

      printTaxInvoicePDF({
        ...lastSale,
        customer_id: invoice.customer.id,
        customer_name: invoice.customer.name,
        mobile: invoice.customer.mobile,
        address: invoice.customer.address,
        shop_id: invoice.shop.id,
        shop_name: invoice.shop.name,
        shop_area: invoice.shop.area,
        shop_address: invoice.shop.address,
        shop_phone: invoice.shop.phone,
        items: allCustomerItems,
        expenses: allCustomerExpenses,
        previous_balance: Number(firstSale.previous_balance || 0),
        applied_credit_amount: totalCredit,
        paid_amount: totalPaid,
        pending_amount: totalPending,
        consolidated: true,
      }, printWindow);
    } catch (error) {
      printWindow.close();
      showToast(error.message || 'Unable to prepare the customer invoice');
    }
  };

  /**
   * Generates and opens the Complete Account Statement PDF detailing:
   * 1. All purchases & exact bought items with quantities and line totals
   * 2. All payment receipts with exact payment dates, modes, and reference notes
   * 3. Date-by-date running balance progression
   */
  const printCustomerStatementPDF = async (customer) => {
    if (!customer) return;
    try {
      showToast('Generating complete account statement...');
      const custId = customer.customer_id || customer.id;
      const targetShop = data.shops?.find(s => String(s.id) === String(customer.shop_id || shopId)) || { 
        name: 'PINKY SALES', 
        address: 'C-314, Pratik Arcade, Surat', 
        phone: '+91 90995 69700' 
      };
      
      let salesData = [];
      let customerData = customer;
      let shopData = targetShop;

      try {
        const params = new URLSearchParams({
          customerId: String(custId),
          shopId: String(customer.shop_id || shopId || targetShop.id || 1),
        });
        const resp = await authedFetch(`/customer-invoice?${params.toString()}`);
        if (resp && Array.isArray(resp.sales) && resp.sales.length > 0) {
          salesData = resp.sales;
          if (resp.customer) customerData = { ...customer, ...resp.customer };
          if (resp.shop) shopData = { ...targetShop, ...resp.shop };
        }
      } catch (err) {
        console.warn('Backend customer invoice fetch error, falling back to local records:', err);
      }

      if (!salesData.length) {
        salesData = Array.isArray(customer.items) && customer.items.length > 0 
          ? customer.items 
          : (Array.isArray(customer.invoices) && customer.invoices.length > 0 ? customer.invoices : (customer.sale ? [customer.sale] : [customer]));
      }

      if (!salesData.length || (salesData.length === 1 && !salesData[0]?.id && !salesData[0]?.total_amount)) {
        showToast('No purchase or payment history found for this customer');
        return;
      }

      // [FIX B1] generateStatementPDFDoc is async (lazy-loads jsPDF). Must await before calling .output().
      const doc = await generateStatementPDFDoc(customerData, salesData, shopData);
      const pdfBlob = doc.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.open(blobUrl, '_blank');
      showToast('Complete Statement opened in new tab!');
    } catch (error) {
      console.error('Failed to generate statement:', error);
      showToast(error.message || 'Unable to prepare complete statement');
    }
  };

  const productPageItems = role === 'customer'
    ? data.catalog
    : productPager.loaded
      ? data.productResults
      : data.products;

  const normalizeSearchString = (str) => {
    if (!str) return '';
    return String(str).toLowerCase().replace(/[\s\-_/\\+]/g, '');
  };

  const matchesProductSearch = (product, searchQuery) => {
    if (!searchQuery || !searchQuery.trim()) return true;

    // Split query into lowercase individual search terms
    const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

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
  };

  const modelItems = useMemo(() => {
    return role === 'customer' 
      ? data.catalog.filter((item) => matchesProductSearch(item, deferredModelSearch)) 
      : (deferredModelSearch 
          ? productPageItems.filter((item) => matchesProductSearch(item, deferredModelSearch))
          : (data.products?.length > (productPageItems?.length || 0) ? data.products : productPageItems));
  }, [role, data.catalog, data.products, productPageItems, deferredModelSearch]);

  const priceItems = useMemo(() => {
    return role === 'customer' 
      ? data.catalog.filter((item) => matchesProductSearch(item, deferredPriceSearch)) 
      : (deferredPriceSearch 
          ? productPageItems.filter((item) => matchesProductSearch(item, deferredPriceSearch))
          : (data.products?.length > (productPageItems?.length || 0) ? data.products : productPageItems));
  }, [role, data.catalog, data.products, productPageItems, deferredPriceSearch]);

  const allCategoryPool = role === 'customer' ? data.catalog : (data.products || []);

  const toolsItems = useMemo(() => {
    return allCategoryPool.filter((item) => {
      if (!isToolsCategory(item)) return false;
      return matchesProductSearch(item, toolsSearch);
    });
  }, [allCategoryPool, toolsSearch]);

  const sparesItems = useMemo(() => {
    return allCategoryPool.filter((item) => {
      if (!isSparesCategory(item)) return false;
      return matchesProductSearch(item, sparesSearch);
    });
  }, [allCategoryPool, sparesSearch]);

  const ocaGlassItems = useMemo(() => {
    return allCategoryPool.filter((item) => {
      if (!isOcaGlassCategory(item)) return false;
      return matchesProductSearch(item, ocaSearch);
    });
  }, [allCategoryPool, ocaSearch]);

  const otherCategoryItems = useMemo(() => {
    return allCategoryPool.filter((item) => {
      if (!isOtherCategory(item)) return false;
      return matchesProductSearch(item, otherCategorySearch);
    });
  }, [allCategoryPool, otherCategorySearch]);
  const visibleSales = data.sales;
  const customerSalesGroups = useMemo(() => {
    const map = new Map();
    for (const sale of visibleSales) {
      const key = String(sale.customer_id || sale.customer_name || 'unknown');
      if (!map.has(key)) {
        const custObj = (data.customers || []).find(c => String(c.id) === String(sale.customer_id));
        const openingBalance = Number(custObj?.opening_balance || 0);
        const advanceBalance = Number(custObj?.advance_balance || 0);
        const custPending = custObj?.pending !== undefined && custObj?.pending !== null ? Number(custObj.pending) : null;

        map.set(key, {
          customer_id: sale.customer_id,
          customer_name: sale.customer_name || 'Walk-in Customer',
          mobile: sale.mobile,
          address: sale.address,
          shop_name: sale.shop_name,
          total_invoices: 0,
          total_purchase_amount: 0,
          total_paid: 0,
          total_pending: 0,
          opening_balance: openingBalance,
          advance_balance: advanceBalance,
          customer_pending: custPending,
          last_purchase_date: null,
          invoices: [],
        });
      }
      const g = map.get(key);
      g.total_invoices += 1;
      g.total_purchase_amount += Number(sale.total_amount || 0);
      g.total_paid += Number(sale.paid_amount || 0);
      const invPending = Math.max(0, Number(sale.pending_amount || 0));
      g.total_pending += invPending;
      const invDate = sale.invoice_date || sale.sale_date;
      if (!g.last_purchase_date || String(invDate) > String(g.last_purchase_date)) {
        g.last_purchase_date = invDate;
      }
      g.invoices.push(sale);
    }
    // Set customer total pending accurately & sync advance_balance
    for (const g of map.values()) {
      const custObj = (data.customers || []).find(c => String(c.id) === String(g.customer_id));
      if (custObj) {
        g.advance_balance = Number(custObj.advance_balance || 0);
      }
      if (g.customer_pending !== null && !isNaN(g.customer_pending)) {
        g.total_pending = Math.max(0, g.customer_pending);
      } else {
        g.total_pending = Math.max(0, g.total_pending + Number(g.opening_balance || 0));
      }
    }
    return Array.from(map.values());
  }, [visibleSales, data.customers]);

  const pendingMetrics = useMemo(() => {
    const list = data.pending || [];
    const totalPendingAmount = list.reduce((sum, item) => sum + Math.max(0, Number(item.pending_amount || 0)), 0);
    const totalCustomers = list.length;
    let overdueCustomers = 0;
    let dueTodayCustomers = 0;
    let totalPendingInvoices = 0;

    list.forEach((item) => {
      const info = getDueDateInfo(item.due_date);
      if (info.type === 'overdue') overdueCustomers += 1;
      if (info.type === 'today') dueTodayCustomers += 1;
      // Invoices with Pending Amount <= 0 must not be counted in the pending invoice count
      const activeInvs = (item.items || []).filter(inv => Number(inv.pending_amount || 0) > 0);
      totalPendingInvoices += (activeInvs.length > 0 ? activeInvs.length : (Number(item.pending_amount || 0) > 0 ? 1 : 0));
    });

    return {
      totalPendingAmount,
      totalCustomers,
      overdueCustomers,
      dueTodayCustomers,
      totalPendingInvoices,
    };
  }, [data.pending]);

  const filteredPendingCustomers = useMemo(() => {
    let list = data.pending || [];
    if (pendingStatusFilter === 'overdue') {
      list = list.filter((item) => getDueDateInfo(item.due_date).type === 'overdue');
    } else if (pendingStatusFilter === 'due_today') {
      list = list.filter((item) => getDueDateInfo(item.due_date).type === 'today');
    } else if (pendingStatusFilter === 'upcoming') {
      list = list.filter((item) => getDueDateInfo(item.due_date).type === 'upcoming');
    }
    return list;
  }, [data.pending, pendingStatusFilter]);

  const shopkeeperQuery = normalizedText(deferredShopkeeperSearch);
  const visibleShopkeepers = useMemo(() => {
    return data.shopkeepers.filter((user) => {
      if (!shopkeeperQuery) return true;
      return [user.name, user.username, user.contact, user.shop_name]
        .filter(Boolean)
        .some((value) => normalizedText(value).includes(shopkeeperQuery));
    });
  }, [data.shopkeepers, shopkeeperQuery]);

  const staffedBranchCount = useMemo(() => {
    return new Set(data.shopkeepers.map((user) => String(user.shop_id || '')).filter(Boolean)).size;
  }, [data.shopkeepers]);

  const incompleteShopkeeperContacts = useMemo(() => {
    return data.shopkeepers.filter((user) => !String(user.contact || '').trim()).length;
  }, [data.shopkeepers]);

  const visibleCatalog = useMemo(() => {
    const query = deferredCatalogFilters.search.trim().toLowerCase();
    return data.catalog.filter((product) => {
      const matchesSearch = !query || [product.short_name, product.full_model_list, product.name, product.brand, product.category, product.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesShop = !deferredCatalogFilters.shopId || String(product.available_shops || '').toLowerCase().includes(
        data.shops.find((shop) => String(shop.id) === String(deferredCatalogFilters.shopId))?.name.toLowerCase() || ''
      );
      const matchesBrand = !deferredCatalogFilters.brand || product.brand === deferredCatalogFilters.brand;
      const matchesCategory = !deferredCatalogFilters.category || product.category === deferredCatalogFilters.category;
      const matchesColour = !deferredCatalogFilters.colour || (product.colours || []).includes(deferredCatalogFilters.colour);
      return matchesSearch && matchesShop && matchesBrand && matchesCategory && matchesColour;
    });
  }, [data.catalog, data.shops, deferredCatalogFilters]);

  const combinedStock = useMemo(() => combineStockRows(data.stock), [data.stock]);
  const stockWithOwnership = useMemo(() => combinedStock.map((item) => ({
    ...item,
    owner_quantity: Number(item.owner_quantity || 0),
    shopkeeper_quantity: Number(item.shopkeeper_quantity || 0),
    my_quantity: Number(item.my_quantity || 0),
    owner_batch_count: Number(item.owner_batch_count || 0),
    shopkeeper_batch_count: Number(item.shopkeeper_batch_count || 0),
    my_batch_count: Number(item.my_batch_count || 0),
  })), [combinedStock]);

  const shopkeeperStockItems = stockWithOwnership;
  const visibleStock = stockWithOwnership;
  const stockSummaryLoaded = Boolean(data.stockSummary?.loaded);
  const stockSummaryTotals = data.stockSummary?.totals || {};
  const stockCategorySummaryMap = useMemo(() => new Map((data.stockSummary?.categories || []).map((category) => [
    normalizedText(category.category),
    category,
  ])), [data.stockSummary?.categories]);

  const categoryStats = useMemo(() => [
    {
      name: '',
      label: 'All categories',
      products: stockSummaryLoaded ? Number(stockSummaryTotals.products || 0) : combinedStock.length,
      quantity: stockSummaryLoaded ? Number(stockSummaryTotals.quantity || 0) : combinedStock.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    },
    ...data.reference.categories.map((category) => {
      const categoryStock = combinedStock.filter((item) => sameText(item.category, category.name));
      const summary = stockCategorySummaryMap.get(normalizedText(category.name));
      return {
        name: category.name,
        label: category.name,
        products: stockSummaryLoaded ? Number(summary?.products || 0) : categoryStock.length,
        quantity: stockSummaryLoaded ? Number(summary?.quantity || 0) : categoryStock.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      };
    }),
  ], [stockSummaryLoaded, stockSummaryTotals, combinedStock, data.reference.categories, stockCategorySummaryMap]);

  const visibleCategoryStats = useMemo(() => categoryStats.filter((category) => (
    !categorySearch.trim() || category.label.toLowerCase().includes(categorySearch.trim().toLowerCase())
  )), [categoryStats, categorySearch]);

  const selectedCategoryStat = stockCategoryPage
    ? categoryStats.find((category) => stockCategoryPage === '__all__' ? !category.name : sameText(category.name, stockCategoryPage))
    : null;
  const activeCategoryFilterCount = ['search', 'brand', 'colour', 'status', 'ownership'].filter((key) => Boolean(stockFilters[key])).length;
  
  const ownerInventoryQuantity = useMemo(() => (
    stockSummaryLoaded ? Number(stockSummaryTotals.owner_quantity || 0) : stockWithOwnership.reduce((sum, item) => sum + Number(item.owner_quantity || 0), 0)
  ), [stockSummaryLoaded, stockSummaryTotals.owner_quantity, stockWithOwnership]);

  const assignedInventoryQuantity = useMemo(() => (
    stockSummaryLoaded ? Number(stockSummaryTotals.shopkeeper_quantity || 0) : stockWithOwnership.reduce((sum, item) => sum + Number(item.shopkeeper_quantity || 0), 0)
  ), [stockSummaryLoaded, stockSummaryTotals.shopkeeper_quantity, stockWithOwnership]);

  const myInventoryQuantity = useMemo(() => (
    stockSummaryLoaded ? Number(stockSummaryTotals.my_quantity || 0) : stockWithOwnership.reduce((sum, item) => sum + Number(item.my_quantity || 0), 0)
  ), [stockSummaryLoaded, stockSummaryTotals.my_quantity, stockWithOwnership]);

  const warehouseInventoryQuantity = useMemo(() => stockWithOwnership
    .filter((item) => item.location_type === 'warehouse' || String(item.shop_id) === String(data.warehouse?.id))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [stockWithOwnership, data.warehouse?.id]
  );

  const stableWarehouseInventoryQuantity = stockSummaryLoaded ? Number(stockSummaryTotals.warehouse_quantity || 0) : warehouseInventoryQuantity;
  const accessibleInventoryQuantity = stockSummaryLoaded ? Number(stockSummaryTotals.quantity || 0) : stockWithOwnership.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const lowStockAlerts = useMemo(() => combineLowStockAlerts(data.dashboard?.lowStock), [data.dashboard?.lowStock]);
  const dashboardAvailability = data.dashboard?.modelAvailability || [];
  const dashboardWarehouseStock = useMemo(() => {
    // Prefer totals.warehouse_stock (always fetched directly from warehouse shop, unscoped).
    // Fall back to summing from modelAvailability for backwards compatibility.
    const fromTotals = Number(data.dashboard?.totals?.warehouse_stock || 0);
    if (fromTotals > 0) return fromTotals;
    return dashboardAvailability.reduce((sum, item) => sum + Number(item.warehouse_stock || 0), 0);
  }, [data.dashboard?.totals?.warehouse_stock, dashboardAvailability]);
  const dashboardBranchPerformance = data.dashboard?.shopWise?.filter((shop) => shop.location_type !== 'warehouse') || [];
  const dashboardShopCount = dashboardBranchPerformance.length || data.dashboard?.totals?.total_shops || 0;
  const globalQueryTokens = useMemo(() => {
    return globalSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
  }, [globalSearch]);

  const globalSearchResults = useMemo(() => {
    if (!globalQueryTokens.length) return [];
    const results = [];
    const maxResults = 30;

    // Multi-token fuzzy matcher: every token must be present in the target searchable string
    const matchesAllTokens = (searchableText) => {
      const lower = String(searchableText || '').toLowerCase();
      return globalQueryTokens.every((token) => lower.includes(token));
    };

    const addResult = (result, searchableFields) => {
      if (results.length >= maxResults) return;
      const combined = searchableFields
        .filter((v) => v !== null && v !== undefined && v !== '')
        .map((v) => (Array.isArray(v) ? v.join(' ') : String(v)))
        .join(' ')
        .toLowerCase();
      if (matchesAllTokens(combined)) {
        results.push(result);
      }
    };

    // 1. Products (model, short_name, manufacturing brand, general brand, category, sub_category, price, wholesale_price, colours)
    const productsById = new Map();
    [...dashboardAvailability, ...(role === 'customer' ? data.catalog : data.products)].forEach((item) => {
      if (!item?.id) return;
      productsById.set(String(item.id), { ...productsById.get(String(item.id)), ...item });
    });

    [...productsById.values()].forEach((item) => {
      const pName = productName(item);
      const mfgBrand = item.manufacturing_brand_name || item.mfg_brand || item.brand_name || item.brand || '';
      const cleanBrand = String(mfgBrand).replace(/^(mfg|brand)[\s.:-]*/i, '').trim();
      const prices = [
        item.sale_price, item.selling_price, item.price, item.retail_price,
        item.wholesale_price, item.official_price, item.purchase_price
      ].filter(Boolean);
      const priceStrings = prices.map((p) => String(p));
      const colours = Array.isArray(item.colours) ? item.colours.join(' ') : (item.colour || '');
      const models = fullModelList(item);

      addResult({
        kind: 'product',
        type: 'Product',
        title: pName,
        meta: joinUniqueText([
          cleanBrand ? `Brand: ${cleanBrand}` : '',
          item.sale_price || item.selling_price ? currency(item.sale_price || item.selling_price) : '',
          item.category,
          item.available_locations || (item.quantity !== undefined ? `${item.quantity} in stock` : '')
        ], 'Model details'),
        icon: Smartphone,
        item,
      }, [
        pName,
        item.model,
        models,
        item.short_name,
        cleanBrand,
        item.brand,
        item.category,
        item.sub_category,
        item.description,
        ...priceStrings,
        colours,
        item.available_locations,
        item.compatibility
      ]);
    });

    // 2. Manufacturing Brands & Categories
    const brandNames = [
      ...(Array.isArray(data.reference?.brands) ? data.reference.brands.map((b) => b.name) : []),
      ...(Array.isArray(data.reference?.manufacturing_brands) ? data.reference.manufacturing_brands.map((b) => b.name) : []),
      ...data.products.map((p) => p.manufacturing_brand_name || p.brand),
      ...data.catalog.map((p) => p.manufacturing_brand_name || p.brand),
    ].filter(Boolean);

    [...new Set(brandNames.map((name) => String(name).replace(/^(mfg|brand)[\s.:-]*/i, '').trim()).filter(Boolean))].forEach((brand) => {
      addResult({
        kind: 'brand',
        type: 'Brand',
        title: brand,
        meta: 'Filter inventory and catalog by brand',
        icon: Package,
        item: { brand },
      }, [brand]);
    });

    // 3. Customers
    (data.customers || []).forEach((customer) => {
      addResult({
        kind: 'customer',
        type: 'Customer',
        title: customer.name,
        meta: joinUniqueText([customer.mobile, customer.customer_type ? String(customer.customer_type).toUpperCase() : '', customer.shop_name, customer.pending ? `Due: ${currency(customer.pending)}` : ''], 'Customer account'),
        icon: Users,
        item: customer,
      }, [customer.name, customer.mobile, customer.address, customer.shop_name, customer.gstin, customer.customer_type, customer.pending]);
    });

    // 4. Sales / Invoices
    (data.sales || []).forEach((sale) => {
      const invNo = sale.invoice_number || (sale.id ? `INV-${String(sale.id).padStart(6, '0')}` : '');
      const sBrand = sale.manufacturing_brand_name || sale.brand || '';
      addResult({
        kind: 'sale',
        type: 'Invoice / Sale',
        title: `${invNo ? `${invNo} · ` : ''}${sale.customer_name || 'Walk-in customer'}`,
        meta: joinUniqueText([productName(sale), sBrand, sale.shop_name, sale.payment_mode, currency(sale.total_amount)], 'Sale record'),
        icon: ReceiptText,
        item: sale,
      }, [
        invNo,
        sale.customer_name,
        sale.mobile,
        productName(sale),
        sale.product_name,
        sBrand,
        sale.category,
        sale.shop_name,
        sale.payment_mode,
        sale.total_amount,
        sale.paid_amount,
        sale.due_date,
        sale.invoice_date
      ]);
    });

    // 5. Shops & Branches
    (data.shops || []).forEach((shop) => {
      addResult({
        kind: 'shop',
        type: shop.location_type === 'warehouse' ? 'Warehouse' : 'Shop Branch',
        title: shop.name,
        meta: joinUniqueText([shop.area, shop.address, shop.phone], 'Location'),
        icon: Store,
        item: shop,
      }, [shop.name, shop.area, shop.address, shop.phone, shop.location_type]);
    });

    return results;
  }, [globalQueryTokens, dashboardAvailability, role, data.catalog, data.products, data.reference?.brands, data.reference?.manufacturing_brands, data.customers, data.sales, data.shops]);

  if (!authReady) return <SkeletonPage type="dashboard" />;
  if (!session) return <Login onLogin={login} />;

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="sidebar-backdrop"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
      <aside className={`sidebar ${open ? 'show' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-mark"><Store size={23} /></div>
          <div className="sidebar-brand-copy">
            <strong>Shop Management</strong>
            <span>{role === 'superadmin' ? 'Owner Control' : role === 'shopkeeper' ? session.shop_name : 'Catalog'}</span>
          </div>
          <button
            type="button"
            className="icon sidebar-collapse desktop-only"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <ChevronLeft size={17} />
          </button>
          <button type="button" className="icon mobile-only" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <div className="sidebar-workspace-card">
          <span>Workspace</span>
          {role === 'superadmin' ? (
            <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)}>
              <option value="">All branches</option>
              {data.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>
          ) : (
            <strong>{workspaceScope || 'Current workspace'}</strong>
          )}
          <small>{role === 'superadmin' ? 'Branch-aware reporting and stock filters' : 'Your assigned branch scope'}</small>
        </div>
        <nav className="sidebar-nav">
          {sidebarSections.map((section) => (
            <div className="nav-section" key={section.title}>
              <span className="nav-section-title">{section.title}</span>
              {section.items.map(({ id, label, Icon }) => {
                const isActive = active === id;
                return (
                  <motion.button
                    whileHover={{ x: sidebarCollapsed ? 0 : 4 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    key={id}
                    className={`relative ${isActive ? 'active' : ''}`}
                    title={label}
                    onClick={() => { setActivePage(id); setOpen(false); }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeSidebarIndicator"
                        className="sidebar-active-glow"
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <Icon size={18} className="relative z-10" />
                    <span className="relative z-10">{label}</span>
                  </motion.button>
                );
              })}
            </div>
          ))}
        </nav>
        <Magnetic className="w-full mt-auto">
          <button type="button" className="logout" title="Sign out" onClick={(event) => { event.preventDefault(); logout(); }}><LogOut size={18} /> <span>Sign out</span></button>
        </Magnetic>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button type="button" className="icon mobile-only" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="page-title">
            <span className="eyebrow">{currentPageMeta.group} / {pageWorkspaceScope}</span>
            <h1>{currentPageMeta.title}</h1>
            <p>{currentPageMeta.description}</p>
          </div>
          <div className="topbar-actions">
            {role !== 'customer' && lowStockAlerts.length > 0 && (
              <button
                type="button"
                className="notification-button"
                onClick={() => setActivePage('low-stock')}
                title="View Low & Out of Stock Alerts"
              >
                <AlertTriangle size={16} />
                <span>{lowStockAlerts.length}</span>
              </button>
            )}
            <div className="user-pill">
              <ShieldCheck size={16} />
              <span><b>{session.name}</b><small>{role === 'superadmin' ? 'Owner' : role === 'shopkeeper' ? 'Shopkeeper' : 'Customer'}</small></span>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: -24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              className={`toast ${toast.tone}`}
              role="status"
              aria-live="polite"
              onClick={() => setToast(null)}
              style={{ cursor: 'pointer' }}
              title="Click to dismiss"
            >
              {toast.tone === 'error' ? (
                <AlertTriangle size={18} className="shrink-0 text-rose-600" />
              ) : (
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              )}
              <span className="truncate max-w-xs sm:max-w-md md:max-w-xl">{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {(loading || tabLoading) && <SkeletonPage type={active === 'dashboard' ? 'dashboard' : 'list'} />}
        {loadError && !loading && <div className="error">{loadError}</div>}

        <React.Suspense fallback={<div className="p-8"><SmartSkeletonWrapper type="card" count={4} /></div>}>
        <AnimatePresence mode="wait">
          {active === 'dashboard' && data.dashboard && (
            <PageWrapper activeKey="dashboard" key="dashboard">
              <RedesignedDashboard
                session={session}
                role={role}
                data={data}
                dashboardWarehouseStock={dashboardWarehouseStock}
                dashboardShopCount={dashboardShopCount}
                lowStockAlerts={lowStockAlerts}
                dashboardBranchPerformance={dashboardBranchPerformance}
                currency={currency}
                productName={productName}
                joinUniqueText={joinUniqueText}
                setSelectedProductDetails={setSelectedProductDetails}
                setActivePage={setActivePage}
                trendFromValue={trendFromValue}
                onAddProduct={() => setActivePage('stock')}
                onCreateSale={() => setActivePage('sales')}
                onImportStock={() => setActivePage('supplier-import')}
                globalSearch={globalSearch}
                setGlobalSearch={setGlobalSearch}
                globalSearchFocused={globalSearchFocused}
                setGlobalSearchFocused={setGlobalSearchFocused}
                globalSearchResults={globalSearchResults}
                handleGlobalSearchSelect={handleGlobalSearchSelect}
                hydrateGlobalSearch={hydrateGlobalSearch}
                closeGlobalSearch={closeGlobalSearch}
              />
            </PageWrapper>
          )}

          {active === 'dashboard' && !data.dashboard && !loading && loadError && (
            <PageWrapper activeKey="dashboard-error" key="dashboard-error">
              <section className="space">
                <div className="panel table">
                  <h2>Dashboard unavailable</h2>
                  <div className="empty"><Package size={18} /> Start the local backend and reload to see shop metrics.</div>
                </div>
              </section>
            </PageWrapper>
          )}

          {active === 'shops' && (
            <PageWrapper activeKey="shops" key="shops">
              <section className="space">
                <FormPanel title="Add branch" action="Add shop" onSubmit={() => post('/shops', 'shop', 'Shop created')}>
                  <Input label="Shop name" className="md:col-span-2" value={forms.shop.name} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, name: v } })} />
                  <Input label="Area" className="md:col-span-2" value={forms.shop.area} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, area: v } })} />
                  <Input label="Address" className="md:col-span-2" value={forms.shop.address} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, address: v } })} />
                  <Input label="Phone" className="md:col-span-2" value={forms.shop.phone} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, phone: v } })} />
                </FormPanel>
                <CardGrid 
                  items={data.shops} 
                  onItemClick={role === 'superadmin' ? viewShopDetails : null}
                  render={(shop) => (
                    <>
                      <div className="flex items-start justify-between w-full mb-3">
                        <div className="card-icon-wrapper !mb-0">
                          <Store size={18} />
                        </div>
                        <span className="status-badge stock-ok">Active Branch</span>
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 mb-1">{shop.name}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mb-4">📍 {shop.area}</p>
                      <div className="metrics w-full pt-3 border-t border-slate-100 flex justify-between text-xs font-semibold">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase font-black">Stock Qty</span>
                          <span className="text-slate-700 font-bold mt-0.5">{shop.stock} pcs</span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-slate-400 uppercase font-black">Pending Payments</span>
                          <span className={`font-bold mt-0.5 ${Number(shop.pending) > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{currency(shop.pending)}</span>
                        </div>
                      </div>
                    </>
                  )} 
                />
              </section>
            </PageWrapper>
          )}

          {active === 'shopkeepers' && (
            <PageWrapper activeKey="shopkeepers" key="shopkeepers">
              <ShopkeeperLoginsPage
                data={data}
                forms={forms}
                setForms={setForms}
                staffedBranchCount={staffedBranchCount}
                incompleteShopkeeperContacts={incompleteShopkeeperContacts}
                saving={saving}
                submitShopkeeper={submitShopkeeper}
                deleteShopkeeper={deleteShopkeeper}
                openShopkeeperEditor={openShopkeeperEditor}
                shopkeeperSearch={shopkeeperSearch}
                setShopkeeperSearch={setShopkeeperSearch}
                visibleShopkeepers={visibleShopkeepers}
                Empty={Empty}
              />
            </PageWrapper>
          )}

          {active === 'import' && (
            <PageWrapper activeKey="import" key="import">
              <React.Suspense fallback={<div className="p-8"><SmartSkeletonWrapper type="card" count={3} /></div>}>
                <SupplierImportWorkspace
                  data={data}
                  api={authedFetch}
                  setGlobalToast={showToast}
                  onImportComplete={loadCore}
                />
              </React.Suspense>
            </PageWrapper>
          )}

          {active === 'brands' && role !== 'customer' && (
            <PageWrapper activeKey="brands" key="brands">
              <BrandsPage
                session={session}
                setGlobalToast={showToast}
                api={authedFetch}
                data={data}
                brands={data.brandSummary}
                loading={pageLoading.brands}
                products={brandProducts}
                productLoading={brandProductsLoading}
                onBrandChange={async () => { await loadCore(); await loadBrandsPage(shopId); }}
                currency={currency}
                productName={productName}
                onAddReferenceOption={addReferenceOption}
                onEditReferenceOption={editReferenceOption}
                onDeleteReferenceOption={deleteReferenceOption}
              />
            </PageWrapper>
          )}

          {active === 'manufacturing-brands' && role !== 'customer' && (
            <PageWrapper activeKey="manufacturing-brands" key="manufacturing-brands">
              <ManufacturingBrandsPage
                session={session}
                setGlobalToast={showToast}
                api={authedFetch}
                data={data}
                brands={data.manufacturingBrandSummary}
                loading={pageLoading['manufacturing-brands']}
                onBrandChange={loadCore}
                currency={currency}
                productName={productName}
              />
            </PageWrapper>
          )}

          {active === 'suppliers' && role !== 'customer' && (
            <PageWrapper activeKey="suppliers" key="suppliers">
              <SuppliersPage
                session={session}
                setGlobalToast={showToast}
                api={authedFetch}
                data={data}
                onBrandChange={loadCore}
              />
            </PageWrapper>
          )}

          {active === 'purchase-bills' && role !== 'customer' && (
            <PageWrapper activeKey="purchase-bills" key="purchase-bills">
              <PurchaseBillsPage
                session={session}
                api={authedFetch}
                setGlobalToast={showToast}
                suppliers={data.reference?.suppliers || []}
                products={data.products || []}
              />
            </PageWrapper>
          )}

          {active === 'debit-notes' && role !== 'customer' && (
            <PageWrapper activeKey="debit-notes" key="debit-notes">
              <DebitNotesPage
                session={session}
                api={authedFetch}
                setGlobalToast={showToast}
                suppliers={data.reference?.suppliers || []}
                products={data.products || []}
              />
            </PageWrapper>
          )}

          {active === 'ledger' && role !== 'customer' && (
            <PageWrapper activeKey="ledger" key="ledger">
              <PartyLedger
                session={session}
                api={authedFetch}
                setGlobalToast={showToast}
                customers={data.customers || []}
                suppliers={data.reference?.suppliers || []}
              />
            </PageWrapper>
          )}

          {active === 'aging' && role !== 'customer' && (
            <PageWrapper activeKey="aging" key="aging">
              <AgingReport
                session={session}
                api={authedFetch}
                setGlobalToast={showToast}
              />
            </PageWrapper>
          )}

          {active === 'categories' && (
            <PageWrapper activeKey="categories" key="categories">
              <CategoriesPage
                session={session}
                setGlobalToast={showToast}
                api={api}
                data={data}
                onCategoryChange={loadCore}
                currency={currency}
                productName={productName}
              />
            </PageWrapper>
          )}

          {active === 'models' && (
            <PageWrapper activeKey="models" key="models">
              <ModelsPage
                items={modelItems}
                search={modelSearch}
                onSearchChange={(value) => { setProductPager((prev) => ({ ...prev, page: 1 })); setModelSearch(value); }}
                role={role}
                session={session}
                api={api}
                setGlobalToast={showToast}
                onProductUpdated={async () => {
                  try {
                    await loadCore();
                    await loadProductPage({ tab: 'models', page: productPager.page });
                  } catch (e) {
                    console.warn('Refresh error:', e);
                  }
                }}
                onEditProduct={editProduct}
                onCloneProduct={cloneProduct}
                onDeleteProduct={deleteProduct}
                pager={productPager}
                loading={productPageLoading}
                onPageChange={(page) => setProductPager((prev) => ({ ...prev, page }))}
                onPageSizeChange={(limit) => setProductPager((prev) => ({ ...prev, page: 1, limit: Number(limit) }))}
                onViewDetails={setSelectedProductDetails}
                productName={productName}
                fullModelList={fullModelList}
                priceLabel={priceLabel}
                Empty={Empty}
                reference={data.reference}
              />
            </PageWrapper>
          )}

          {active === 'prices' && role !== 'customer' && (
            <PageWrapper activeKey="prices" key="prices">
              <PricesPage
                role={role}
                shopId={shopId}
                shops={data.shops || []}
                suppliers={data.reference?.suppliers || []}
                stock={data.stock || []}
                updateStock={updateStock}
                showToast={showToast}
                saving={saving}
                items={priceItems}
                search={priceSearch}
                pager={productPager}
                loading={productPageLoading}
                onExportProducts={(exportItems) => exportExcel('prices', {}, exportItems || priceItems)}
                onSearchChange={(value) => { setProductPager((prev) => ({ ...prev, page: 1 })); setPriceSearch(value); }}
                onPageChange={(page) => setProductPager((prev) => ({ ...prev, page }))}
                onPageSizeChange={(limit) => setProductPager((prev) => ({ ...prev, page: 1, limit: Number(limit) }))}
                onViewDetails={setSelectedProductDetails}
                onEditProduct={editProduct}
                onCloneProduct={cloneProduct}
                onDeleteProduct={deleteProduct}
                productName={productName}
                fullModelList={fullModelList}
                priceLabel={priceLabel}
              />
            </PageWrapper>
          )}

          {active === 'tools' && (
            <PageWrapper activeKey="tools" key="tools">
              <PricesPage
                role={role}
                shopId={shopId}
                shops={data.shops || []}
                suppliers={data.reference?.suppliers || []}
                stock={data.stock || []}
                updateStock={updateStock}
                showToast={showToast}
                saving={saving}
                items={toolsItems}
                search={toolsSearch}
                pager={productPager}
                loading={productPageLoading}
                onExportProducts={(exportItems) => exportExcel('tools', {}, exportItems || toolsItems)}
                onSearchChange={(value) => setToolsSearch(value)}
                onViewDetails={setSelectedProductDetails}
                onEditProduct={editProduct}
                onCloneProduct={cloneProduct}
                onDeleteProduct={deleteProduct}
                productName={productName}
                fullModelList={fullModelList}
                priceLabel={priceLabel}
              />
            </PageWrapper>
          )}

          {active === 'spares' && (
            <PageWrapper activeKey="spares" key="spares">
              <PricesPage
                role={role}
                shopId={shopId}
                shops={data.shops || []}
                suppliers={data.reference?.suppliers || []}
                stock={data.stock || []}
                updateStock={updateStock}
                showToast={showToast}
                saving={saving}
                items={sparesItems}
                search={sparesSearch}
                pager={productPager}
                loading={productPageLoading}
                onExportProducts={(exportItems) => exportExcel('spares', {}, exportItems || sparesItems)}
                onSearchChange={(value) => setSparesSearch(value)}
                onViewDetails={setSelectedProductDetails}
                onEditProduct={editProduct}
                onCloneProduct={cloneProduct}
                onDeleteProduct={deleteProduct}
                productName={productName}
                fullModelList={fullModelList}
                priceLabel={priceLabel}
              />
            </PageWrapper>
          )}

          {active === 'oca-glass' && (
            <PageWrapper activeKey="oca-glass" key="oca-glass">
              <PricesPage
                role={role}
                shopId={shopId}
                shops={data.shops || []}
                suppliers={data.reference?.suppliers || []}
                stock={data.stock || []}
                updateStock={updateStock}
                showToast={showToast}
                saving={saving}
                items={ocaGlassItems}
                search={ocaSearch}
                pager={productPager}
                loading={productPageLoading}
                onExportProducts={(exportItems) => exportExcel('oca-glass', {}, exportItems || ocaGlassItems)}
                onSearchChange={(value) => setOcaSearch(value)}
                onViewDetails={setSelectedProductDetails}
                onEditProduct={editProduct}
                onCloneProduct={cloneProduct}
                onDeleteProduct={deleteProduct}
                productName={productName}
                fullModelList={fullModelList}
                priceLabel={priceLabel}
              />
            </PageWrapper>
          )}

          {active === 'other-category' && (
            <PageWrapper activeKey="other-category" key="other-category">
              <PricesPage
                role={role}
                shopId={shopId}
                shops={data.shops || []}
                suppliers={data.reference?.suppliers || []}
                stock={data.stock || []}
                updateStock={updateStock}
                showToast={showToast}
                saving={saving}
                items={otherCategoryItems}
                search={otherCategorySearch}
                pager={productPager}
                loading={productPageLoading}
                onExportProducts={(exportItems) => exportExcel('other-category', {}, exportItems || otherCategoryItems)}
                onSearchChange={(value) => setOtherCategorySearch(value)}
                onViewDetails={setSelectedProductDetails}
                onEditProduct={editProduct}
                onCloneProduct={cloneProduct}
                onDeleteProduct={deleteProduct}
                productName={productName}
                fullModelList={fullModelList}
                priceLabel={priceLabel}
              />
            </PageWrapper>
          )}

          {active === 'stock' && (
            <PageWrapper activeKey="stock" key="stock">
              <StockPage
                role={role}
                shopId={shopId}
                forms={forms}
                setForms={setForms}
                data={data}
                ownerInventoryQuantity={ownerInventoryQuantity}
                myInventoryQuantity={myInventoryQuantity}
                updateStock={updateStock}
                setTransferDrawerOpen={setTransferDrawerOpen}
                stockFilters={stockFilters}
                setStockFilters={setStockFilters}
                stockPager={stockPager}
                pageLoading={pageLoading}
                setStockPager={setStockPager}
                onStockPageSizeChange={(limit) => setStockPager((prev) => ({ ...prev, page: 1, limit: Number(limit) }))}
                setSelectedProductDetails={setSelectedProductDetails}
                productName={productName}
                fullModelList={fullModelList}
                priceLabel={priceLabel}
                onSubmitProduct={submitProduct}
                onEditProduct={editProduct}
                onCloneProduct={cloneProduct}
                onDeleteProduct={deleteProduct}
                onAddReferenceOption={addReferenceOption}
                onEditReferenceOption={editReferenceOption}
                onDeleteReferenceOption={deleteReferenceOption}
                editingProductId={editingProductId}
                setEditingProductId={setEditingProductId}
                saving={saving}
                setSaving={setSaving}
                initialForms={initialForms}
                exportExcel={exportExcel}
                exportCsv={exportExcel}
                onPrintStock={() => printCurrentStockSheet(
                  workspaceScope || 'Current workspace',
                  role === 'shopkeeper' ? session.shop_area : selectedShopRecord?.area || '',
                  stockWithOwnership,
                )}
                stockWithOwnership={stockWithOwnership}
                FormPanel={FormPanel}
                Input={Input}
                Select={Select}
                Empty={Empty}
                api={authedFetch}
                setGlobalToast={showToast}
                loadCore={loadCore}
              />
            </PageWrapper>
          )}

          {active === 'low-stock' && role !== 'customer' && (
            <PageWrapper activeKey="low-stock" key="low-stock">
              <LowStockPage
                role={role}
                session={session}
                data={data}
                api={authedFetch}
                setGlobalToast={showToast}
                onUpdateStock={updateStock}
                loadCore={loadCore}
                setActivePage={setActivePage}
                priceLabel={priceLabel}
                productName={productName}
                fullModelList={fullModelList}
                Empty={Empty}
              />
            </PageWrapper>
          )}

          {active === 'customers' && (
            <PageWrapper activeKey="customers" key="customers">
              <section className="space">
                {needsSpecificShop && (
                  <div className="loading">Choose one shop from the top-right filter before adding customers or purchases.</div>
                )}
                <FormPanel title="Add customer" action="Add customer" onSubmit={() => post('/customers', 'customer', 'Customer added')} disabled={saving || needsSpecificShop}>
                  <Input label="Name" className="md:col-span-1" value={forms.customer.name} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, name: v } })} />
                  <Input label="Mobile" className="md:col-span-1" value={forms.customer.mobile} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, mobile: v } })} />
                  <Input label="Address" className="md:col-span-1" value={forms.customer.address} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, address: v } })} />
                  <Input label="GSTIN (Optional)" className="md:col-span-1" placeholder="e.g. 24AAAAA0000A1Z5" value={forms.customer.gstin || ''} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, gstin: v.toUpperCase() } })} />
                  <div className="md:col-span-4 flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Customer Type</label>
                    <div className="flex items-center gap-3">
                      <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        forms.customer.customer_type === 'retailer' || !forms.customer.customer_type
                          ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}>
                        <input
                          type="radio"
                          name="customer_type_main"
                          value="retailer"
                          checked={forms.customer.customer_type === 'retailer' || !forms.customer.customer_type}
                          onChange={(e) => setForms({ ...forms, customer: { ...forms.customer, customer_type: e.target.value } })}
                          className="accent-teal-600"
                        />
                        <span>Retailer</span>
                      </label>
                      <label className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        forms.customer.customer_type === 'wholesaler'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}>
                        <input
                          type="radio"
                          name="customer_type_main"
                          value="wholesaler"
                          checked={forms.customer.customer_type === 'wholesaler'}
                          onChange={(e) => setForms({ ...forms, customer: { ...forms.customer, customer_type: e.target.value } })}
                          className="accent-indigo-600"
                        />
                        <span>Wholesaler</span>
                      </label>
                    </div>
                  </div>
                </FormPanel>
                <div className="panel p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs mb-4">
                  <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Record customer purchase</h2>
                  <SalesCreationWorkspace
                    forms={forms}
                    setForms={setForms}
                    data={data}
                    saving={saving}
                    needsSpecificShop={needsSpecificShop}
                    salesProductOptions={salesProductOptions}
                    sellingPriceOptions={sellingPriceOptions}
                    updateSaleItemProduct={updateSaleItemProduct}
                    updateSaleItemCustomName={updateSaleItemCustomName}
                    updateSaleItemCustomBrand={updateSaleItemCustomBrand}
                    updateSaleItemPriceType={updateSaleItemPriceType}
                    updateSaleItemSellingPrice={updateSaleItemSellingPrice}
                    updateSaleItemQuantity={updateSaleItemQuantity}
                    toggleSaleItemColor={toggleSaleItemColor}
                    updateSaleItemSingleColor={updateSaleItemSingleColor}
                    updateSaleItemColorQuantity={updateSaleItemColorQuantity}
                    addSaleItem={addSaleItem}
                    removeSaleItem={removeSaleItem}
                    updateSaleInvoiceDate={updateSaleInvoiceDate}
                    updateSalePaymentTerms={updateSalePaymentTerms}
                    addSaleExpense={addSaleExpense}
                    updateSaleExpense={updateSaleExpense}
                    removeSaleExpense={removeSaleExpense}
                    submitSale={submitSale}
                    cancelEditSale={cancelEditSale}
                    activeTab="customers"
                    setShowQuickAddCustomerModal={setShowQuickAddCustomerModal}
                    getProductAvailableColors={getProductAvailableColors}
                    title="Record customer purchase"
                    authedFetch={authedFetch}
                    onOpenReturnModal={openSalesReturnModal}
                  />
                </div>
                <div className="catalog-toolbar panel sales-toolbar">
                  <div className="searchbox">
                    <Search size={18} />
                    <input
                      placeholder="Search customer name, mobile, address, or shop"
                      value={customerFilters.search}
                      onChange={(event) => setCustomerFilters({ ...customerFilters, search: event.target.value })}
                    />
                  </div>
                  <select value={customerFilters.status} onChange={(event) => setCustomerFilters({ ...customerFilters, status: event.target.value })}>
                    <option value="">All balances</option>
                    <option value="pending">Pending balance</option>
                    <option value="paid">Paid customers</option>
                  </select>
                  {pageLoading.customers && <span className="status-badge due">Loading</span>}
                  <span className="status-badge stock-ok">{customerPager.loaded ? customerPager.total.toLocaleString('en-IN') : data.customers.length} customers</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCustomer(null);
                      setQuickCustomerForm({ name: '', mobile: '', address: '', gstin: '', customer_type: 'retailer' });
                      setShowQuickAddCustomerModal(true);
                    }}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border shadow-2xs bg-teal-600 hover:bg-teal-700 text-white border-teal-600"
                  >
                    <Plus size={15} /> Add Customer
                  </button>
                </div>
                {/* Customer List as Rows / Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="py-3.5 px-4 w-12 text-center">#</th>
                          <th className="py-3.5 px-4">Customer Name</th>
                          <th className="py-3.5 px-4">Mobile</th>
                          <th className="py-3.5 px-4">Address / Area</th>
                          <th className="py-3.5 px-4">GSTIN</th>
                          <th className="py-3.5 px-4 text-center">Purchases</th>
                          <th className="py-3.5 px-4 text-right">Pending Due</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {data.customers.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="py-8 text-center text-slate-400 font-medium">
                              No customers found.
                            </td>
                          </tr>
                        ) : (
                          data.customers.map((customer, idx) => {
                            const allCustomerSales = data.sales.filter((sale) => Number(sale.customer_id) === Number(customer.id));
                            const isCash = customer.name?.toLowerCase().includes('cash customer') || customer.mobile === '9999999999' || customer.mobile === '0000000000';
                            const pendingVal = Number(customer.pending || 0);
                            const isWholesaler = String(customer.customer_type || '').toLowerCase() === 'wholesaler';

                            return (
                              <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="py-3.5 px-4 text-center font-bold text-slate-400">
                                  {idx + 1}
                                </td>
                                <td className="py-3.5 px-4 font-bold text-slate-900">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center border shrink-0 ${
                                      isWholesaler 
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                        : 'bg-teal-50 text-teal-700 border-teal-100'
                                    }`}>
                                      {customer.name?.charAt(0)?.toUpperCase() || 'C'}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-bold text-slate-900 text-[13px]">{customer.name}</span>
                                        {isCash ? (
                                          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            Default Cash
                                          </span>
                                        ) : (
                                          <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9.5px] font-bold uppercase tracking-wider ${
                                            isWholesaler
                                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                              : 'bg-teal-50 text-teal-700 border border-teal-200'
                                          }`}>
                                            {isWholesaler ? 'Wholesaler' : 'Retailer'}
                                          </span>
                                        )}
                                      </div>
                                      {customer.shop_name && (
                                        <span className="text-[10.5px] text-slate-400 block font-normal">{customer.shop_name}</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-medium text-slate-700">
                                  {customer.mobile || <span className="text-slate-400">-</span>}
                                </td>
                                <td className="py-3.5 px-4 text-slate-600 max-w-[180px] truncate" title={customer.address || ''}>
                                  {customer.address || <span className="text-slate-400">-</span>}
                                </td>
                                <td className="py-3.5 px-4">
                                  {customer.gstin ? (
                                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 tracking-wider">
                                      {customer.gstin}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-[11px]">-</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {allCustomerSales.length} {allCustomerSales.length === 1 ? 'purchase' : 'purchases'}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  {pendingVal > 0 ? (
                                    <strong className="text-sm font-black text-rose-600">
                                      {currency(pendingVal)}
                                    </strong>
                                  ) : Number(customer.advance_balance || 0) > 0 ? (
                                    <div className="flex flex-col items-end">
                                      <strong className="text-sm font-black text-cyan-600">
                                        +{currency(customer.advance_balance)} Cr
                                      </strong>
                                      <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1.5 py-0.2 rounded border border-cyan-200">
                                        Advance Credit
                                      </span>
                                    </div>
                                  ) : (
                                    <strong className="text-sm font-black text-emerald-600">
                                      ₹0
                                    </strong>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Get Statement Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const custRecord = {
                                          ...customer,
                                          customer_id: customer.id,
                                          customer_name: customer.name,
                                          items: allCustomerSales,
                                          pending_amount: pendingVal,
                                          total_amount: allCustomerSales.reduce((s, a) => s + Number(a.total_amount || 0), 0),
                                          paid_amount: allCustomerSales.reduce((s, a) => s + Number(a.paid_amount || 0), 0),
                                        };
                                        printCustomerStatementPDF(custRecord);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer shadow-2xs"
                                      title="Download / View Complete Customer Statement (All Purchases & Payments with Dates)"
                                    >
                                      <ReceiptText size={13} /> Get Statement
                                    </button>

                                    {/* View Detail Button */}
                                    <button
                                      type="button"
                                      onClick={() => openCustomerLedgerDrawer(customer)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition-colors cursor-pointer shadow-2xs"
                                      title="View Complete Customer Details & Purchases"
                                    >
                                      <Eye size={13} /> View Detail
                                    </button>

                                    {/* Edit Customer */}
                                    <button
                                      type="button"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer border border-transparent hover:border-teal-200"
                                      title="Edit Customer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCustomer(customer);
                                        setQuickCustomerForm({
                                          name: customer.name || '',
                                          mobile: customer.mobile || '',
                                          address: customer.address || '',
                                          gstin: customer.gstin || '',
                                          customer_type: customer.customer_type || 'retailer',
                                        });
                                        setShowQuickAddCustomerModal(true);
                                      }}
                                    >
                                      <Edit3 size={14} />
                                    </button>

                                    {/* Delete Customer */}
                                    <button
                                      type="button"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                                      title="Delete Customer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCustomer(customer);
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <Pagination
                  meta={customerPager}
                  loading={pageLoading.customers}
                  onPageChange={(page) => setCustomerPager((prev) => ({ ...prev, page }))}
                  onPageSizeChange={(limit) => setCustomerPager((prev) => ({ ...prev, page: 1, limit: Number(limit) }))}
                />
              </section>
            </PageWrapper>
          )}

          {active === 'sales' && (
            <PageWrapper activeKey="sales" key="sales">
              <section className="space">
                {role === 'superadmin' && !shopId && <div className="loading">Select Warehouse or a branch from the location filter to create a sale. All-location sales remain visible below.</div>}
                <div className="panel p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {data.shops.find((location) => String(location.id) === String(shopId))?.location_type === 'warehouse' ? 'Create Warehouse sale' : 'Create sale'}
                    </h2>
                  </div>
                  <SalesCreationWorkspace
                    forms={forms}
                    setForms={setForms}
                    data={data}
                    saving={saving}
                    needsSpecificShop={needsSpecificShop}
                    salesProductOptions={salesProductOptions}
                    sellingPriceOptions={sellingPriceOptions}
                    updateSaleItemProduct={updateSaleItemProduct}
                    updateSaleItemCustomName={updateSaleItemCustomName}
                    updateSaleItemCustomBrand={updateSaleItemCustomBrand}
                    updateSaleItemPriceType={updateSaleItemPriceType}
                    updateSaleItemSellingPrice={updateSaleItemSellingPrice}
                    updateSaleItemQuantity={updateSaleItemQuantity}
                    toggleSaleItemColor={toggleSaleItemColor}
                    updateSaleItemSingleColor={updateSaleItemSingleColor}
                    updateSaleItemColorQuantity={updateSaleItemColorQuantity}
                    addSaleItem={addSaleItem}
                    removeSaleItem={removeSaleItem}
                    updateSaleInvoiceDate={updateSaleInvoiceDate}
                    updateSalePaymentTerms={updateSalePaymentTerms}
                    addSaleExpense={addSaleExpense}
                    updateSaleExpense={updateSaleExpense}
                    removeSaleExpense={removeSaleExpense}
                    submitSale={submitSale}
                    cancelEditSale={cancelEditSale}
                    activeTab="sales"
                    setShowQuickAddCustomerModal={setShowQuickAddCustomerModal}
                    getProductAvailableColors={getProductAvailableColors}
                    title={data.shops.find((location) => String(location.id) === String(shopId))?.location_type === 'warehouse' ? 'Create Warehouse sale' : 'Create sale'}
                    authedFetch={authedFetch}
                    onOpenReturnModal={openSalesReturnModal}
                  />
                </div>
                <div className="catalog-toolbar panel sales-toolbar">
                  <div className="searchbox"><Search size={18} /><input placeholder="Filter by customer, model, category, shop, or payment mode" value={salesFilters.search} onChange={(event) => setSalesFilters({ ...salesFilters, search: event.target.value })} /></div>
                  <input type="date" value={salesFilters.date} onChange={(event) => setSalesFilters({ ...salesFilters, date: event.target.value })} />
                  <button
                    type="button"
                    onClick={() => openSalesReturnModal()}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border shadow-2xs bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shrink-0"
                    title="Initiate a Sales Return and issue a Credit Note"
                  >
                    <RotateCcw size={14} className="text-amber-700" />
                    <span>Sales Return / Credit Note</span>
                  </button>
                  {role === 'superadmin' && <span className="status-badge">All-location history</span>}
                  {pageLoading.sales && <span className="status-badge due">Loading</span>}
                  <span className="status-badge stock-ok">{salesPager.loaded ? salesPager.total.toLocaleString('en-IN') : visibleSales.length} sales</span>
                </div>
                {customerSalesGroups.length ? (
                  <motion.div 
                    variants={listVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10px" }}
                    className="space-y-3.5"
                  >
                    {customerSalesGroups.map((group) => {
                      const groupKey = String(group.customer_id || group.customer_name);
                      const isExpanded = expandedSaleId === groupKey;

                      return (
                        <motion.div 
                          variants={itemVariants} 
                          key={groupKey}
                          className={`bg-white border transition-all rounded-2xl p-4 shadow-2xs ${
                            isExpanded ? 'border-teal-500/80 ring-2 ring-teal-500/10' : 'border-slate-200/80 hover:border-slate-300'
                          }`}
                        >
                          {/* Main Customer Group Card */}
                          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-center">
                            {/* Left: Customer Info & Invoices Count */}
                            <div className="lg:col-span-4 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-black text-slate-800 tracking-tight">{group.customer_name}</h3>
                                <span className="px-2 py-0.5 rounded-lg text-[10.5px] font-black bg-teal-50 text-teal-800 border border-teal-200">
                                  {group.total_invoices} {group.total_invoices === 1 ? 'Invoice' : 'Invoices'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 font-medium">
                                {group.mobile ? `Mobile: ${group.mobile}` : 'No mobile number'}
                                {group.shop_name ? ` · ${group.shop_name}` : ''}
                              </p>
                              <p className="text-[11px] text-slate-400 font-medium">
                                Last Purchase: <strong className="text-slate-700 font-bold">{formatDateDMY(group.last_purchase_date)}</strong>
                              </p>
                            </div>

                            {/* Middle: Financials (Total Purchases, Paid, Pending / Advance) */}
                            <div className="lg:col-span-5 grid grid-cols-3 gap-2 text-center sm:text-left bg-slate-50/90 p-3 rounded-xl border border-slate-100">
                              <div>
                                <span className="block text-[10px] uppercase font-bold text-slate-400">Total Purchases</span>
                                <strong className="text-xs font-black text-slate-900">{currency(group.total_purchase_amount)}</strong>
                              </div>
                              <div>
                                <span className="block text-[10px] uppercase font-bold text-slate-400">Paid</span>
                                <span className="text-xs font-bold text-emerald-700">{currency(group.total_paid)}</span>
                              </div>
                              <div>
                                {Number(group.total_pending) > 0 ? (
                                  <>
                                    <span className="block text-[10px] uppercase font-bold text-slate-400">Pending</span>
                                    <span className="text-xs font-black text-amber-700">
                                      {currency(group.total_pending)}
                                    </span>
                                  </>
                                ) : Number(group.advance_balance || 0) > 0 ? (
                                  <>
                                    <span className="block text-[10px] uppercase font-bold text-cyan-600">Credit / Advance</span>
                                    <span className="text-xs font-black text-cyan-700" title="Available Store Credit / Advance Balance">
                                      +{currency(group.advance_balance)} Cr
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="block text-[10px] uppercase font-bold text-slate-400">Pending</span>
                                    <span className="text-xs font-bold text-emerald-700">
                                      ₹0
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="lg:col-span-3 flex items-center justify-end gap-2 flex-wrap">
                              <button 
                                className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border shadow-2xs ${
                                  isExpanded 
                                    ? 'bg-teal-600 text-white border-teal-600' 
                                    : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                                }`}
                                type="button" 
                                onClick={() => setExpandedSaleId(isExpanded ? null : groupKey)}
                              >
                                <Eye size={15} /> {isExpanded ? 'Hide Details' : `View Details (${group.total_invoices})`}
                              </button>

                              {group.invoices.length > 0 && (
                                <>
                                  <button 
                                    className="px-2.5 py-2 text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                    type="button"
                                    title="Print Consolidated Customer Invoice"
                                    onClick={() => printCustomerInvoicePDF(group.invoices[0])}
                                  >
                                    <ReceiptText size={15} /> All Invoices
                                  </button>
                                  <button 
                                    className="px-2.5 py-2 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                    type="button"
                                    title="Share Customer Statement & Invoices"
                                    onClick={() => openPendingShareModal({
                                      ...group,
                                      id: group.customer_id,
                                      customer_id: group.customer_id,
                                      customer_name: group.customer_name,
                                      items: group.invoices,
                                      pending_amount: group.total_pending,
                                      total_amount: group.total_purchase_amount,
                                      paid_amount: group.total_paid,
                                    })}
                                  >
                                    <Send size={14} /> Share
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Expandable Details: List of all Invoices for this customer */}
                          {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                                  Customer Purchase Invoices ({group.invoices.length})
                                </span>
                              </div>

                              <div className="space-y-3">
                                {group.invoices.map((sale) => {
                                  const saleItems = (Array.isArray(sale.items) && sale.items.length > 0)
                                    ? sale.items
                                    : [{
                                        id: sale.product_id || sale.id,
                                        product_name: productName(sale),
                                        quantity: sale.quantity || 1,
                                        unit_price: Number(sale.products_total || sale.total_amount || 0) / Number(sale.quantity || 1),
                                        total_price: sale.products_total || sale.total_amount,
                                        price_type: sale.price_type || 'retail',
                                        colour: sale.colour,
                                      }];
                                  const invNumber = sale.invoice_number || `INV-${String(sale.id).padStart(6, '0')}`;
                                  const expensesList = Array.isArray(sale.expenses) ? sale.expenses : [];

                                  return (
                                    <div key={sale.id} className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
                                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                                        <div className="flex items-center gap-2">
                                          <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-teal-100/70 text-teal-800 border border-teal-200">
                                            {invNumber}
                                          </span>
                                          <span className="text-xs font-bold text-slate-700">
                                            Date: {formatDateDMY(sale.invoice_date || sale.sale_date)}
                                          </span>
                                          {String(sale.payment_mode || '').trim().toLowerCase() === 'cash' ? (
                                            <span className="text-[11px] font-bold text-sky-700">
                                              · Terms: Cash Only
                                            </span>
                                          ) : (
                                            <span className="text-[11px] text-slate-400 font-medium">
                                              · Due: {sale.due_date ? formatDateDMY(sale.due_date) : 'Not set'}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <strong className="text-xs font-black text-slate-900">{currency(sale.total_amount)}</strong>
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            Number(sale.pending_amount) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                          }`}>
                                            {Number(sale.pending_amount) > 0 ? `Pending: ${currency(sale.pending_amount)}` : 'Fully Paid'}
                                          </span>

                                          <button 
                                            className="px-2 py-1 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                            type="button"
                                            onClick={() => printTaxInvoicePDF(sale)}
                                          >
                                            <ReceiptText size={13} /> Invoice
                                          </button>

                                          <button 
                                            className="px-2 py-1 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                                            type="button"
                                            title="Share this invoice via WhatsApp & PDF"
                                            onClick={() => openInvoiceShareModal(sale, group)}
                                          >
                                            <Send size={12} /> Share
                                          </button>

                                          <button 
                                            className="px-2 py-1 text-xs font-bold bg-white hover:bg-amber-50 text-amber-800 border border-slate-200 hover:border-amber-300 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                            type="button"
                                            title="Initiate Return / Credit Note against this invoice"
                                            onClick={() => openSalesReturnModal(sale)}
                                          >
                                            <RotateCcw size={12} /> Return
                                          </button>

                                          <button 
                                            className="px-2 py-1 text-xs font-bold bg-white hover:bg-sky-50 text-sky-800 border border-slate-200 hover:border-sky-300 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                            type="button"
                                            title="Edit invoice dates, payment terms, expenses & remarks"
                                            onClick={() => openEditSaleModal(sale)}
                                          >
                                            <Pencil size={12} /> Edit
                                          </button>

                                          {(role === 'superadmin' || Number(sale.created_by) === Number(session?.id)) && (
                                            <button 
                                              className="p-1 text-rose-500 hover:text-rose-700 bg-white hover:bg-rose-50 rounded-lg border border-slate-200 cursor-pointer transition-colors"
                                              type="button"
                                              title="Delete this invoice"
                                              onClick={() => deleteSale(sale)}
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Products List in this Invoice */}
                                      <div className="space-y-1 pl-1">
                                        <span className="text-[10.5px] font-bold uppercase text-slate-400 block">Products</span>
                                        {saleItems.map((it, itIdx) => (
                                          <div key={it.id || itIdx} className="flex items-center justify-between text-xs text-slate-700 py-0.5">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                                              <span className="font-bold">{it.product_name || it.name || productName(it)}</span>
                                              {getBrandName(it, sale) && (
                                                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                                                  {getBrandName(it, sale)}
                                                </span>
                                              )}
                                              {it.colour && (
                                                <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold">
                                                  ● {it.colour}
                                                </span>
                                              )}
                                              <span className="text-slate-400 text-[11px]">· Qty: {it.quantity || 1} pcs</span>
                                            </div>
                                            <span className="font-bold text-slate-900">
                                              {currency(it.total_price || (Number(it.unit_price || 0) * Number(it.quantity || 1)))}
                                            </span>
                                          </div>
                                        ))}

                                        {expensesList.length > 0 && (
                                          <div className="pt-1 text-[11px] text-teal-800 font-semibold flex items-center gap-2">
                                            <span>Extra Expenses:</span>
                                            {expensesList.map((e, eIdx) => (
                                              <span key={e.id || eIdx} className="bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 text-[10px]">
                                                {e.expense_name}: {currency(e.amount)}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <Empty title="No sales records found" />
                )}
                <Pagination
                  meta={salesPager}
                  loading={pageLoading.sales}
                  onPageChange={(page) => setSalesPager((prev) => ({ ...prev, page }))}
                  onPageSizeChange={(limit) => setSalesPager((prev) => ({ ...prev, page: 1, limit: Number(limit) }))}
                />
              </section>
            </PageWrapper>
          )}

          {active === 'order-stock' && (
            <PageWrapper activeKey="order-stock" key="order-stock">
              <BranchOrderStockPage
                authedFetch={authedFetch}
                showToast={showToast}
                currentShop={shopId}
                shops={data.shops}
                reference={data.reference}
                onRequisitionSubmitted={() => {
                  loadTab('requests', shopId);
                  loadTab('dashboard', shopId);
                }}
              />
            </PageWrapper>
          )}

          {active === 'requests' && (
            <PageWrapper activeKey="requests" key="requests">
              {role === 'superadmin' ? (
                <SuperAdminStockRequestsPage
                  authedFetch={authedFetch}
                  showToast={showToast}
                  shops={data.shops}
                  data={data}
                  onRefresh={() => {
                    loadTab('requests', shopId);
                    loadTab('stock', shopId);
                    loadTab('dashboard', shopId);
                  }}
                />
              ) : (
                <BranchOrderStockPage
                  authedFetch={authedFetch}
                  showToast={showToast}
                  currentShop={shopId}
                  shops={data.shops}
                  reference={data.reference}
                  onRequisitionSubmitted={() => {
                    loadTab('requests', shopId);
                    loadTab('dashboard', shopId);
                  }}
                />
              )}
            </PageWrapper>
          )}

          {active === 'payments' && (
            <PageWrapper activeKey="payments" key="payments">
              <section className="space">
                {/* 1. COLLECTIONS KPI HEADER */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {/* Card 1: Total Pending Receivables */}
                  <div className="bg-gradient-to-br from-white via-teal-50/20 to-teal-50/50 p-4 rounded-2xl border border-teal-200/80 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-teal-800">Pending Collections</span>
                      <div className="w-8 h-8 rounded-xl bg-teal-100/80 text-teal-700 flex items-center justify-center font-bold">
                        <IndianRupee size={16} />
                      </div>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {currency(pendingMetrics.totalPendingAmount)}
                    </div>
                    <p className="text-[11.5px] text-slate-500 font-medium mt-1">
                      Across {pendingMetrics.totalPendingInvoices} unpaid {pendingMetrics.totalPendingInvoices === 1 ? 'invoice' : 'invoices'}
                    </p>
                  </div>

                  {/* Card 2: Total Debtors / Customers */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Debtor Accounts</span>
                      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                        <Users size={16} />
                      </div>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {pendingMetrics.totalCustomers}
                    </div>
                    <p className="text-[11.5px] text-slate-500 font-medium mt-1">
                      Customers with pending dues
                    </p>
                  </div>

                  {/* Card 3: Overdue Customers */}
                  <div className="bg-gradient-to-br from-white via-rose-50/20 to-rose-50/50 p-4 rounded-2xl border border-rose-200/80 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800">Overdue Customers</span>
                      <div className="w-8 h-8 rounded-xl bg-rose-100/80 text-rose-700 flex items-center justify-center font-bold">
                        <AlertTriangle size={16} />
                      </div>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-rose-700 tracking-tight">
                      {pendingMetrics.overdueCustomers}
                    </div>
                    <p className="text-[11.5px] text-rose-600 font-medium mt-1">
                      {pendingMetrics.overdueCustomers > 0 ? 'Requires immediate reminder' : 'Zero overdue dues'}
                    </p>
                  </div>

                  {/* Card 4: Due Today & Invoices */}
                  <div className="bg-gradient-to-br from-white via-amber-50/20 to-amber-50/50 p-4 rounded-2xl border border-amber-200/80 shadow-2xs">
                    <div className="flex items-center justify-between text-slate-500 mb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">Due Today</span>
                      <div className="w-8 h-8 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center font-bold">
                        <Clock size={16} />
                      </div>
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-amber-800 tracking-tight">
                      {pendingMetrics.dueTodayCustomers}
                    </div>
                    <p className="text-[11.5px] text-amber-700 font-medium mt-1">
                      Scheduled for follow-up today
                    </p>
                  </div>
                </div>

                {/* 2. SEARCH & FILTER TOOLBAR */}
                <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Search box */}
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 flex-1 max-w-md">
                    <Search size={16} className="text-slate-400 shrink-0" />
                    <input 
                      className="bg-transparent text-xs w-full focus:outline-none text-slate-800 font-medium placeholder:text-slate-400"
                      placeholder="Search customer, mobile, shop, or product..."
                      value={pendingFilters.search}
                      onChange={(e) => setPendingFilters({ ...pendingFilters, search: e.target.value })}
                    />
                  </div>

                  {/* Date Filter & Status Filter Chips */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <input 
                      type="date" 
                      className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-medium focus:outline-none"
                      value={pendingFilters.date} 
                      onChange={(event) => setPendingFilters({ ...pendingFilters, date: event.target.value })} 
                    />

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPendingStatusFilter('all')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                          pendingStatusFilter === 'all'
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        All ({data.pending.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => setPendingStatusFilter('overdue')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                          pendingStatusFilter === 'overdue'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        }`}
                      >
                        🔴 Overdue ({pendingMetrics.overdueCustomers})
                      </button>

                      <button
                        type="button"
                        onClick={() => setPendingStatusFilter('due_today')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                          pendingStatusFilter === 'due_today'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                        }`}
                      >
                        🟠 Due Today ({pendingMetrics.dueTodayCustomers})
                      </button>

                      <button
                        type="button"
                        onClick={() => setPendingStatusFilter('upcoming')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                          pendingStatusFilter === 'upcoming'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        🟢 Upcoming ({Math.max(0, pendingMetrics.totalCustomers - pendingMetrics.overdueCustomers - pendingMetrics.dueTodayCustomers)})
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. CUSTOMER COLLECTIONS LEDGER TABLE */}
                {filteredPendingCustomers.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            <th className="py-3.5 px-4">Customer &amp; Account</th>
                            <th className="py-3.5 px-4 text-right">Pending Balance</th>
                            <th className="py-3.5 px-4 text-center">Invoices</th>
                            <th className="py-3.5 px-4">Last Invoice</th>
                            <th className="py-3.5 px-4">Due Date &amp; Status</th>
                            <th className="py-3.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPendingCustomers.map((item) => {
                            const dueInfo = getDueDateInfo(item.due_date);
                            const allInvoices = item.items || [];
                            const totalInvoices = allInvoices.length;
                            const openInvoices = allInvoices.filter(inv => Number(inv.pending_amount || 0) > 0).length;
                            const lastPurchase = item.items?.[0]?.sale_date || item.items?.[0]?.invoice_date || item.sale_date;

                            return (
                              <tr key={item.id} className="hover:bg-slate-50/70 transition-colors group">
                                {/* Customer info */}
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-800 font-black text-xs flex items-center justify-center border border-teal-200 shrink-0">
                                      {(item.customer_name || 'C').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 
                                          className="font-bold text-slate-900 text-sm hover:text-teal-700 transition-colors cursor-pointer"
                                          onClick={() => setSelectedPaymentCustomer(item)}
                                        >
                                          {item.customer_name}
                                        </h4>
                                        {(item.address || (data.customers || []).find(c => String(c.id) === String(item.customer_id || item.id))?.address) && (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 inline-flex items-center gap-0.5" title="Customer Address">
                                            📍 {item.address || (data.customers || []).find(c => String(c.id) === String(item.customer_id || item.id))?.address}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11.5px] text-slate-500 mt-0.5">
                                        {item.mobile || 'No phone'} {item.shop_name ? `· ${item.shop_name}` : ''}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                {/* Pending / Advance Balance */}
                                <td className="py-3.5 px-4 text-right">
                                  {Number(item.pending_amount) > 0 ? (
                                    <>
                                      <strong className="text-sm font-black text-slate-900 block">
                                        {currency(item.pending_amount)}
                                      </strong>
                                      <span className="text-[10.5px] text-slate-400">
                                        Total: {currency(item.total_amount)}
                                      </span>
                                    </>
                                  ) : Number(item.advance_balance || 0) > 0 ? (
                                    <div className="flex flex-col items-end">
                                      <strong className="text-sm font-black text-cyan-700 block">
                                        +{currency(item.advance_balance)} Cr
                                      </strong>
                                      <span className="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1.5 py-0.2 rounded border border-cyan-200">
                                        Advance Credit
                                      </span>
                                    </div>
                                  ) : (
                                    <>
                                      <strong className="text-sm font-black text-emerald-700 block">
                                        ₹0
                                      </strong>
                                      <span className="text-[10.5px] text-slate-400">
                                        Settled
                                      </span>
                                    </>
                                  )}
                                </td>

                                {/* Invoices Count */}
                                <td className="py-3.5 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPaymentCustomer(item)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                                  >
                                    <ReceiptText size={12} />
                                    {totalInvoices === 0 ? (
                                      <span>Opening Bal</span>
                                    ) : (
                                      <>
                                        <span>{totalInvoices} {totalInvoices === 1 ? 'Invoice' : 'Invoices'}</span>
                                        {openInvoices === 0 && (
                                          <span className="text-[9.5px] font-extrabold px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded border border-emerald-200">
                                            Paid
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </button>
                                </td>

                                {/* Last Invoice */}
                                <td className="py-3.5 px-4 font-medium text-slate-600">
                                  {lastPurchase ? formatDateDMY(lastPurchase) : 'Not set'}
                                </td>

                                {/* Due Date & Status */}
                                <td className="py-3.5 px-4">
                                  <div className="flex flex-col gap-0.5">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] border w-fit ${dueInfo.badgeClass}`}>
                                      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                      {dueInfo.label}
                                    </span>
                                    <span className="text-[10.5px] text-slate-400 pl-1">
                                      Due: {item.due_date ? formatDateDMY(item.due_date) : 'Not set'}
                                    </span>
                                  </div>
                                </td>

                                {/* Actions */}
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Record Payment Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPaymentModalTarget(item);
                                        setPaymentModalForm({
                                          amount: String(item.pending_amount || ''),
                                          mode: 'cash',
                                          reference_no: '',
                                          note: '',
                                        });
                                      }}
                                      className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <CreditCard size={13} /> Record Payment
                                    </button>

                                    {/* View Customer Drawer */}
                                    <button
                                      type="button"
                                      onClick={() => setSelectedPaymentCustomer(item)}
                                      className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer"
                                      title="View Customer Ledger Drawer"
                                    >
                                      <Eye size={14} />
                                    </button>

                                    {/* WhatsApp & PDF Share Button */}
                                    <button
                                       type="button"
                                       onClick={() => openPendingShareModal(item)}
                                       className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                                       title="Share WhatsApp Reminder & Invoice Documents"
                                     >
                                       <Send size={12} /> Share
                                     </button>

                                    {/* Customer Invoice Statement Print */}
                                    <button
                                      type="button"
                                      onClick={() => printCustomerStatementPDF(item)}
                                      className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer"
                                      title="Print Complete Statement"
                                    >
                                      <ReceiptText size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* 10. MODERN EMPTY STATE */
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-2xs">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-200 text-2xl">
                      🎉
                    </div>
                    <h3 className="text-lg font-black text-slate-900 mb-1">
                      No Pending Payments
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      All customer receivables and invoice balances are currently cleared.
                    </p>
                  </div>
                )}

                <Pagination
                  meta={pendingPager}
                  loading={pageLoading.pending}
                  onPageChange={(page) => setPendingPager((prev) => ({ ...prev, page }))}
                  onPageSizeChange={(limit) => setPendingPager((prev) => ({ ...prev, page: 1, limit: Number(limit) }))}
                />
              </section>
            </PageWrapper>
          )}

          {active === 'reports' && data.reports && (
            <PageWrapper activeKey="reports" key="reports">
              <section className="space">
                <section className="two-col">
                  <section className="panel reports-panel">
                    <h2>Pending by shop</h2>
                    <div className="report-table pending-report-table">
                      {data.reports.pendingByShop?.length ? data.reports.pendingByShop.map((row) => (
                        <div className="report-row" key={row.shop_name}>
                          <span>{row.shop_name}</span>
                          <strong>{currency(row.pending)}</strong>
                        </div>
                      )) : <Empty title="No pending payments by shop" />}
                    </div>
                  </section>
                  <section className="panel audit-history-panel reports-panel">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                      <h2 className="!border-0 !pb-0 !m-0">Audit history</h2>
                      {role === 'superadmin' && (
                        <button 
                          className="soft text-xs font-bold text-rose-600 hover:text-rose-800 border-rose-200 hover:border-rose-300 !px-3 !py-1.5 !min-h-[30px]" 
                          type="button" 
                          onClick={clearAuditLogs}
                        >
                          Clear Logs
                        </button>
                      )}
                    </div>
                    <div className="report-table audit-report-table">
                      {data.reports.auditRows?.length ? data.reports.auditRows.map((row) => (
                        <div className="report-row audit-row" key={row.id}>
                          <span><b>{row.action}</b><small>{row.actor_name} · {row.created_at}</small></span>
                          <span className="audit-details">{row.details}</span>
                        </div>
                      )) : <Empty title="No audit logs available" />}
                    </div>
                  </section>
                </section>
              </section>
            </PageWrapper>
          )}

          {active === 'catalog' && (
            <PageWrapper activeKey="catalog" key="catalog">
              <section className="space">
                <div className="catalog-toolbar panel">
                  <div className="searchbox"><Search size={18} /><input placeholder="Search brand, model, category, or description..." value={catalogFilters.search} onChange={(e) => setCatalogFilters({ ...catalogFilters, search: e.target.value })} /></div>
                  <select value={catalogFilters.brand} onChange={(e) => setCatalogFilters({ ...catalogFilters, brand: e.target.value })}><option value="">All brands</option>{data.reference.brands.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
                  <select value={catalogFilters.category} onChange={(e) => setCatalogFilters({ ...catalogFilters, category: e.target.value })}><option value="">All categories</option>{data.reference.categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
                  <select value={catalogFilters.colour} onChange={(e) => setCatalogFilters({ ...catalogFilters, colour: e.target.value })}><option value="">All colours</option>{data.reference.colours.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>
                  <select value={catalogFilters.shopId} onChange={(e) => setCatalogFilters({ ...catalogFilters, shopId: e.target.value })}><option value="">All shops</option>{data.shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <button className="primary" onClick={() => loadTab('catalog')}><Search size={17} /> Search</button>
                </div>
                <CardGrid className="catalog-grid" items={visibleCatalog} render={(product) => (
                  <>
                    <div className="card-icon-wrapper cyan">
                      <ShoppingBag size={18} />
                    </div>
                    <h3 className="product-title" title={fullModelList(product)}>{productName(product)}</h3>
                    <p>{product.brand} · {product.category}</p>
                    <p className="product-description" title={product.description || 'No description provided.'}>
                      {product.description || 'No description provided.'}
                    </p>
                    <strong>{priceLabel(product.retail_price)}</strong>
                    <small className="mb-2">{product.available_shops || 'Currently unavailable'}</small>
                    <button className="soft w-full !min-h-[38px] text-xs font-bold mt-2" type="button" onClick={() => setSelectedProductDetails(product)}>View details</button>
                  </>
                )} />
              </section>
            </PageWrapper>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {transferDrawerOpen && (
            <div className="drawer-layer" role="presentation">
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="drawer-mask" 
                type="button" 
                aria-label="Close transfer drawer" 
                onClick={() => setTransferDrawerOpen(false)} 
              />
              <motion.aside 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="transfer-drawer" 
                role="dialog" 
                aria-modal="true" 
                aria-labelledby="transfer-title"
              >
                <div className="drawer-head">
                  <div>
                    <span className="eyebrow">Inventory movement</span>
                    <h2 id="transfer-title">Transfer stock</h2>
                  </div>
                  <button type="button" className="icon" onClick={() => setTransferDrawerOpen(false)}><X size={18} /></button>
                </div>
                <div className="branch-connector">
                  <span>{data.shops.find((shop) => String(shop.id) === String(forms.transfer.from_shop_id))?.name || 'Source branch'}</span>
                  <i />
                  <span>{data.shops.find((shop) => String(shop.id) === String(forms.transfer.to_shop_id))?.name || 'Destination branch'}</span>
                </div>
                <form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitTransfer(); }} onKeyDown={handleFormKeyDown}>
                  <Select label="From shop" value={forms.transfer.from_shop_id} onChange={(v) => setForms({ ...forms, transfer: { ...forms.transfer, from_shop_id: v } })} options={data.shops.map((s) => [s.id, s.name])} />
                  <Select label="To shop" value={forms.transfer.to_shop_id} onChange={(v) => setForms({ ...forms, transfer: { ...forms.transfer, to_shop_id: v } })} options={data.shops.map((s) => [s.id, s.name])} />
                  <Select label="Product" value={forms.transfer.product_id} onChange={(v) => setForms({ ...forms, transfer: { ...forms.transfer, product_id: v } })} options={data.products.map((p) => [p.id, productName(p)])} />
                  <Input label="Quantity" type="number" value={forms.transfer.quantity} onChange={(v) => setForms({ ...forms, transfer: { ...forms.transfer, quantity: v } })} />
                  <button className="primary" type="submit" disabled={saving}><Send size={17} /> {saving ? 'Transferring...' : 'Confirm transfer'}</button>
                </form>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {editingShopkeeper && (
            <div className="drawer-layer" role="presentation">
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="drawer-mask"
                type="button"
                aria-label="Close login editor"
                onClick={closeShopkeeperEditor}
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="transfer-drawer shopkeeper-edit-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="shopkeeper-edit-title"
              >
                <div className="drawer-head">
                  <div className="shopkeeper-edit-title">
                    <span className="shopkeeper-edit-icon"><UserCog size={20} /></span>
                    <div>
                      <span className="eyebrow">Staff login</span>
                      <h2 id="shopkeeper-edit-title">Edit login info</h2>
                      <p>@{editingShopkeeper.username}</p>
                    </div>
                  </div>
                  <button type="button" className="icon" aria-label="Close login editor" onClick={closeShopkeeperEditor}><X size={18} /></button>
                </div>

                <div className="shopkeeper-security-note">
                  <KeyRound size={18} />
                  <span>
                    Leave the password field blank to keep the current password. Enter a new one only when you want to reset access.
                  </span>
                </div>

                <form className="drawer-form shopkeeper-edit-form" onSubmit={(event) => { event.preventDefault(); updateShopkeeperLogin(); }} onKeyDown={handleFormKeyDown}>
                  <Input label="Name" autoComplete="name" maxLength={80} value={shopkeeperEditForm.name} onChange={(v) => setShopkeeperEditForm((prev) => ({ ...prev, name: v }))} />
                  <Input label="Mobile" autoComplete="tel" inputMode="tel" maxLength={30} value={shopkeeperEditForm.contact} onChange={(v) => setShopkeeperEditForm((prev) => ({ ...prev, contact: v }))} />
                  <Input label="Username" autoComplete="off" minLength={3} maxLength={40} value={shopkeeperEditForm.username} onChange={(v) => setShopkeeperEditForm((prev) => ({ ...prev, username: v }))} />
                  <Input label="New password (optional)" type="password" autoComplete="new-password" minLength={8} maxLength={200} value={shopkeeperEditForm.password} onChange={(v) => setShopkeeperEditForm((prev) => ({ ...prev, password: v }))} />
                  <Select label="Assigned shop" value={shopkeeperEditForm.shop_id} onChange={(v) => setShopkeeperEditForm((prev) => ({ ...prev, shop_id: v }))} options={data.shops.map((s) => [s.id, s.name])} />
                  <div className="shopkeeper-edit-actions">
                    <button className="primary" type="submit" disabled={saving}><ShieldCheck size={17} /> {saving ? 'Saving...' : 'Save login'}</button>
                    <button className="soft" type="button" disabled={saving} onClick={closeShopkeeperEditor}>Cancel</button>
                  </div>
                </form>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Detailed Shop Progress Analytics Drawer Modal (Super Admin only) */}
        <AnimatePresence>
          {detailedShopId && (
            <div className="drawer-layer" role="presentation">
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="drawer-mask" 
                type="button" 
                aria-label="Close details drawer" 
                onClick={() => setDetailedShopId(null)} 
              />
              <motion.aside 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="transfer-drawer" 
                role="dialog" 
                aria-modal="true" 
                aria-labelledby="details-title"
                style={{ width: 'min(820px, 100%)', overflowY: 'auto' }}
              >
                <div className="drawer-head flex items-start gap-4 pb-5 border-b border-slate-100 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/10 shrink-0 mt-1">
                    <Store className="w-6 h-6 text-teal" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase font-black text-brand-accent tracking-widest leading-none block mb-1">Shop Performance Analytics</span>
                    {isEditingShop ? (
                      <form onSubmit={handleSaveShopEdit} className="space-y-3 mt-3" onKeyDown={handleFormKeyDown}>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="text-xs font-bold text-slate-500">
                            Shop Name
                            <input 
                              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              value={editShopForm.name} 
                              onChange={(e) => setEditShopForm({ ...editShopForm, name: e.target.value })} 
                            />
                          </label>
                          <label className="text-xs font-bold text-slate-500">
                            Area
                            <input 
                              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              value={editShopForm.area} 
                              onChange={(e) => setEditShopForm({ ...editShopForm, area: e.target.value })} 
                            />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="text-xs font-bold text-slate-500">
                            Address
                            <input 
                              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              value={editShopForm.address} 
                              onChange={(e) => setEditShopForm({ ...editShopForm, address: e.target.value })} 
                            />
                          </label>
                          <label className="text-xs font-bold text-slate-500">
                            Phone
                            <input 
                              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                              value={editShopForm.phone} 
                              onChange={(e) => setEditShopForm({ ...editShopForm, phone: e.target.value })} 
                            />
                          </label>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button type="submit" className="primary !px-4 !py-1.5 !min-h-[32px] text-xs font-bold">Save</button>
                          <button type="button" className="soft !px-4 !py-1.5 !min-h-[32px] text-xs font-bold" onClick={() => setIsEditingShop(false)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <h2 id="details-title" className="text-2xl font-black tracking-tight text-slate-800 mt-2 mb-1.5">
                          {data.shops.find(s => String(s.id) === String(detailedShopId))?.name || 'Branch Progress'}
                        </h2>
                        <p className="text-slate-500 text-xs mt-1.5 mb-4 truncate">
                          📍 {data.shops.find(s => String(s.id) === String(detailedShopId))?.area} · {data.shops.find(s => String(s.id) === String(detailedShopId))?.address || 'No Address Listed'}
                          {data.shops.find(s => String(s.id) === String(detailedShopId))?.phone && ` · 📞 ${data.shops.find(s => String(s.id) === String(detailedShopId))?.phone}`}
                        </p>
                        <div className="flex gap-2.5 mt-4">
                          <button type="button" className="soft !px-3 !py-1.5 !min-h-[30px] text-xs font-bold" onClick={() => setIsEditingShop(true)}>Edit Shop</button>
                          <button type="button" className="soft !px-3 !py-1.5 !min-h-[30px] text-xs font-bold !text-rose-600 hover:!bg-rose-50 hover:!border-rose-200" onClick={handleDeleteShop}>Delete Shop</button>
                        </div>
                      </>
                    )}
                  </div>
                  <button type="button" className="icon shrink-0 hover:bg-slate-50 mt-1" onClick={() => setDetailedShopId(null)}><X size={18} /></button>
                </div>

                <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-4 mb-6">
                  {[
                    { id: 'stock', label: 'Stock Available', icon: Package },
                    { id: 'customers', label: 'Customers List', icon: Users },
                    { id: 'sales', label: 'Sales History', icon: ReceiptText },
                    { id: 'reports', label: 'Audit Logs', icon: FileText }
                  ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = detailsTab === tab.id;
                    return (
                      <button 
                        key={tab.id}
                        type="button"
                        className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                          isActive 
                            ? 'text-white' 
                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50 border border-transparent'
                        }`}
                        onClick={() => setDetailsTab(tab.id)}
                      >
                        {isActive && (
                          <motion.div 
                            layoutId="activeDrawerTabIndicator"
                            className="absolute inset-0 bg-slate-900 rounded-xl -z-10 shadow-sm"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}
                        <Icon size={14} className={isActive ? 'text-teal' : 'text-slate-400'} />
                        <span className="relative z-10">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {detailedShopData.loading ? (
                  <div className="h-[40vh] flex items-center justify-center">
                    <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-brand-accent !border-l-transparent"></span>
                  </div>
                ) : (
                  <motion.div
                    key={detailsTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {detailsTab === 'stock' && (
                      <div className="space-y-6">
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Total Units</span>
                            <strong className="text-lg sm:text-2xl font-black text-slate-800 mt-1 block truncate">{getStockMetrics().totalQty} pcs</strong>
                          </div>
                          <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Inventory Value</span>
                            <strong className="text-lg sm:text-2xl font-black text-slate-800 mt-1 block truncate">{currency(getStockMetrics().totalValue)}</strong>
                          </div>
                          <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Low Stock Alert</span>
                            <strong className={`text-lg sm:text-2xl font-black mt-1 block truncate ${getStockMetrics().lowStockCount > 0 ? 'text-brand-rose' : 'text-slate-800'}`}>
                              {getStockMetrics().lowStockCount} models
                            </strong>
                          </div>
                        </div>

                        {/* Table wrapped in card */}
                        <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/60 shadow-sm">
                          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-950/20">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Inventory Records</span>
                            <button
                              type="button"
                              className="soft flex items-center gap-1.5 !px-3 !py-1.5 !min-h-[32px] text-xs font-bold"
                              onClick={() => {
                                const shop = data.shops.find(s => String(s.id) === String(detailedShopId));
                                printStockPDF(shop?.name || 'Branch', shop?.area || '', detailedShopData.stock);
                              }}
                            >
                              <FileText size={13} /> Print PDF
                            </button>
                          </div>
                          <div className="table w-full">
                            <div className="row font-bold text-slate-400 bg-slate-50/50" style={{ gridTemplateColumns: '2fr 1fr 1fr', borderTop: 0 }}>
                              <span>Model</span>
                              <span>Price</span>
                              <span>Available</span>
                            </div>
                            {detailedShopData.stock.map(item => (
                              <div className="row drawer-stock-row text-sm hover:bg-slate-50/40" key={item.id} style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                                <span>
                                  <b title={fullModelList(item)}>{productName(item)}</b>
                                  <small>{[item.brand, item.shop_name].filter(Boolean).join(' - ')}</small>
                                </span>
                                <span className="font-semibold text-slate-600">{priceLabel(item.sale_price)}</span>
                                <strong className={`status-badge ${Number(item.quantity || 0) === 0 ? 'no-stock' : Number(item.quantity || 0) <= 4 ? 'low-stock' : 'stock-ok'}`}>{item.quantity} pcs</strong>
                              </div>
                            ))}
                            {!detailedShopData.stock.length && <Empty title="No stock items found" />}
                          </div>
                        </div>
                      </div>
                    )}

                    {detailsTab === 'customers' && (
                      <div className="space-y-6">
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Total Customers</span>
                            <strong className="text-lg sm:text-2xl font-black text-slate-800 mt-1 block truncate">{getCustomerMetrics().totalCust} active</strong>
                          </div>
                          <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Unpaid Accounts</span>
                            <strong className={`text-lg sm:text-2xl font-black mt-1 block truncate ${getCustomerMetrics().pendingCust > 0 ? 'text-brand-rose' : 'text-slate-800'}`}>
                              {getCustomerMetrics().pendingCust} branches
                            </strong>
                          </div>
                          <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Outstanding Balance</span>
                            <strong className="text-lg sm:text-2xl font-black text-brand-rose mt-1 block truncate">{currency(getCustomerMetrics().totalPending)}</strong>
                          </div>
                        </div>

                        {/* Table wrapped in card */}
                        <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/60 shadow-sm">
                          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-950/20">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Customer Accounts</span>
                          </div>
                          <div className="table w-full">
                            <div className="row font-bold text-slate-400 bg-slate-50/50" style={{ gridTemplateColumns: '1.5fr 1fr 1.2fr', borderTop: 0 }}>
                              <span>Name</span>
                              <span>Mobile</span>
                              <span>Pending Amount</span>
                            </div>
                            {detailedShopData.customers.map(c => (
                              <div className="row text-sm hover:bg-slate-50/40" key={c.id} style={{ gridTemplateColumns: '1.5fr 1fr 1.2fr' }}>
                                <span><b>{c.name}</b><small>{c.address || 'No Address'}</small></span>
                                <span className="text-slate-600">{c.mobile}</span>
                                <strong className={c.pending > 0 ? 'text-brand-rose font-black' : 'text-slate-500'}>{currency(c.pending)}</strong>
                              </div>
                            ))}
                            {!detailedShopData.customers.length && <Empty title="No customers found" />}
                          </div>
                        </div>
                      </div>
                    )}

                    {detailsTab === 'sales' && (
                      <div className="space-y-6">
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block">Total Invoices</span>
                            <strong className="text-sm sm:text-xl font-black text-slate-800 mt-1 block truncate">{getSalesMetrics().totalOrders} sales</strong>
                          </div>
                          <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block">Total Revenue</span>
                            <strong className="text-sm sm:text-xl font-black text-slate-800 mt-1 block truncate">{currency(getSalesMetrics().totalRev)}</strong>
                          </div>
                          <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block">Total Collected</span>
                            <strong className="text-sm sm:text-xl font-black text-brand-emerald mt-1 block truncate">{currency(getSalesMetrics().totalPaid)}</strong>
                          </div>
                          <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 block">To Collect</span>
                            <strong className="text-sm sm:text-xl font-black text-brand-rose mt-1 block truncate">{currency(getSalesMetrics().totalPending)}</strong>
                          </div>
                        </div>

                        {/* Table wrapped in card */}
                        <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/60 shadow-sm">
                          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-950/20">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Transaction History</span>
                          </div>
                          <div className="table w-full">
                            <div className="row font-bold text-slate-400 bg-slate-50/50" style={{ gridTemplateColumns: '1.5fr 1.2fr 1.2fr', borderTop: 0 }}>
                              <span>Customer / Model</span>
                              <span>Total / Paid</span>
                              <span>Pending</span>
                            </div>
                            {detailedShopData.sales.map(s => (
                              <div className="row text-sm hover:bg-slate-50/40" key={s.id} style={{ gridTemplateColumns: '1.5fr 1.2fr 1.2fr' }}>
                                <span><b>{s.customer_name || 'Walk-in'}</b><small title={s.product_name}>{productName(s)} x {s.quantity}</small></span>
                                <span>{currency(s.total_amount)} <small>Paid: {currency(s.paid_amount)}</small></span>
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                  <strong className={`status-badge ${s.pending_amount > 0 ? 'pending' : 'paid'}`}>{currency(s.pending_amount)}</strong>
                                  <button className="soft" onClick={() => printTaxInvoicePDF(s)}><ReceiptText size={16} /> Invoice</button>
                                </span>
                              </div>
                            ))}
                            {!detailedShopData.sales.length && <Empty title="No sales found" />}
                          </div>
                        </div>
                      </div>
                    )}

                    {detailsTab === 'reports' && (
                      <div className="space-y-6">
                        {/* Metrics Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Audit Entries</span>
                            <strong className="text-lg sm:text-2xl font-black text-slate-800 mt-1 block truncate">{getAuditMetrics().totalLogs} events</strong>
                          </div>
                          <div className="p-4 bg-slate-50 border border-slate-200/50 rounded-2xl">
                            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Operator Count</span>
                            <strong className="text-lg sm:text-2xl font-black text-slate-800 mt-1 block truncate">{getAuditMetrics().uniqueActors} active</strong>
                          </div>
                        </div>

                        {/* Table wrapped in card */}
                        <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                          <div className="table w-full">
                            <div className="row font-bold text-slate-400 bg-slate-50/50" style={{ gridTemplateColumns: '2fr 1fr', borderTop: 0 }}>
                              <span>Action / User</span>
                              <span>Details</span>
                            </div>
                            {(detailedShopData.reports?.auditRows?.filter(r => Number(r.entity_id) === Number(detailedShopId) || String(r.details).includes(`Shop ${detailedShopId}`)) || []).map(row => (
                              <div className="row audit-row text-sm hover:bg-slate-50/40" key={row.id}>
                                <span><b>{row.action}</b><small>{row.actor_name} · {row.created_at}</small></span>
                                <span className="audit-details text-slate-600 font-medium">{row.details}</span>
                              </div>
                            ))}
                            {!((detailedShopData.reports?.auditRows?.filter(r => Number(r.entity_id) === Number(detailedShopId) || String(r.details).includes(`Shop ${detailedShopId}`)) || []).length) && <Empty title="No audit logs found" />}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {selectedProductDetails && (
          <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 sm:p-6 lg:p-8 animate-fadeIn">
            <div className="max-w-6xl mx-auto">
              <React.Suspense fallback={<div className="p-8"><SmartSkeletonWrapper type="card" count={2} /></div>}>
                <ProductDetailPage
                  product={selectedProductDetails}
                  onBack={() => {
                    setSelectedProductDetails(null);
                    setModelSearch('');
                  }}
                  onEdit={(prod) => {
                    setSelectedProductDetails(null);
                    if (editProduct) editProduct(prod);
                  }}
                  role={role}
                  priceVisibility={data.priceVisibility}
                  productName={productName}
                  fullModelList={fullModelList}
                  priceLabel={priceLabel}
                />
              </React.Suspense>
            </div>
          </div>
        )}
        <React.Suspense fallback={null}>
          <SalesReturnModal
            isOpen={salesReturnModalOpen}
            onClose={() => setSalesReturnModalOpen(false)}
            customers={data.customers || []}
            products={data.products || data.productResults || []}
            initialCustomer={salesReturnTargetCustomer}
            initialSale={salesReturnTargetSale}
            shopId={shopId}
            authedFetch={authedFetch}
            showToast={showToast}
            currency={currency}
            formatDateDMY={formatDateDMY}
            onSuccess={async () => {
              await Promise.all([
                loadTab('sales', shopId),
                loadTab('customers', shopId),
                loadTab('payments', shopId),
                loadTab('dashboard', shopId),
                loadTab('stock', shopId),
                loadCore(),
              ]);
              if (selectedPaymentCustomer) {
                const updatedCust = (data.customers || []).find((c) => String(c.id) === String(selectedPaymentCustomer.customer_id || selectedPaymentCustomer.id));
                if (updatedCust) {
                  openCustomerLedgerDrawer(updatedCust);
                }
              }
            }}
          />
        </React.Suspense>
        <React.Suspense fallback={null}>
          <EditSaleModal
            isOpen={editSaleModalOpen}
            onClose={() => {
              setEditSaleModalOpen(false);
              setSaleToEdit(null);
            }}
            sale={saleToEdit}
            shopId={shopId}
            authedFetch={authedFetch}
            showToast={showToast}
            currency={currency}
            formatDateDMY={formatDateDMY}
            onStartFullEdit={startEditSale}
            onSuccess={async (updatedSale) => {
              await loadTab(active, shopId);
              if (selectedPaymentCustomer) {
                const updatedCust = (data.customers || []).find((c) => String(c.id) === String(selectedPaymentCustomer.customer_id || selectedPaymentCustomer.id));
                if (updatedCust) {
                  openCustomerLedgerDrawer(updatedCust);
                }
              }
              if (updatedSale && detailedShopData?.sales) {
                setDetailedShopData((prev) => ({
                  ...prev,
                  sales: (prev.sales || []).map((s) => Number(s.id) === Number(updatedSale.id) ? { ...s, ...updatedSale } : s),
                }));
              }
            }}
          />
        </React.Suspense>
        <React.Suspense fallback={null}>
          <ShareInvoiceModal
            isOpen={Boolean(shareModalTarget)}
            onClose={() => setShareModalTarget(null)}
            target={shareModalTarget}
            shop={data.shops.find((s) => String(s.id) === String(shareModalTarget?.customer?.shop_id || shareModalTarget?.sale?.shop_id || shopId)) || {}}
            authedFetch={authedFetch}
            showToast={showToast}
            currency={currency}
            formatDateDMY={formatDateDMY}
          />
        </React.Suspense>
        <ConfirmationDialog
          dialog={confirmDialog}
          saving={saving}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={runConfirmedAction}
        />

        {/* ========================================================= */}
        {/* GLOBAL: CUSTOMER DETAIL RIGHT-SIDE DRAWER (500px) */}
        {/* ========================================================= */}
        <AnimatePresence>
          {selectedPaymentCustomer && (
            <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
              {/* Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedPaymentCustomer(null)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              />

              {/* Sliding Drawer */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="relative w-full max-w-md md:max-w-lg bg-white h-full shadow-2xl z-10 flex flex-col"
              >
                {/* Drawer Header */}
                <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">
                        {selectedPaymentCustomer.customer_name || selectedPaymentCustomer.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => printCustomerStatementPDF(selectedPaymentCustomer)}
                        className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition-all flex items-center gap-1 cursor-pointer"
                        title="Download / View Complete Customer Ledger Statement"
                      >
                        Customer Ledger
                      </button>
                      <button
                        type="button"
                        onClick={() => openSalesReturnModal(selectedPaymentCustomer)}
                        className="px-2 py-0.5 text-[10.5px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full transition-all flex items-center gap-1 cursor-pointer"
                        title="Issue Credit Note / Sales Return for this customer"
                      >
                        <RotateCcw size={10} /> Return / Credit Note
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedPaymentCustomer.mobile || 'No phone'} {selectedPaymentCustomer.shop_name ? `· ${selectedPaymentCustomer.shop_name}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentCustomer(null)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Drawer Body */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                  {/* Financial Balance Summary Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {Number(selectedPaymentCustomer.pending_amount || selectedPaymentCustomer.pending || 0) > 0
                          ? 'Total Outstanding Due'
                          : (Number(selectedPaymentCustomer.advance_balance || 0) > 0 ? 'Store Credit / Advance Balance' : 'Account Balance')}
                      </span>
                      {Number(selectedPaymentCustomer.advance_balance || 0) > 0 && Number(selectedPaymentCustomer.pending_amount || selectedPaymentCustomer.pending || 0) <= 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          Available Credit
                        </span>
                      )}
                    </div>
                    <div className={`text-2xl font-black ${
                      Number(selectedPaymentCustomer.pending_amount || selectedPaymentCustomer.pending || 0) > 0
                        ? 'text-amber-400'
                        : (Number(selectedPaymentCustomer.advance_balance || 0) > 0 ? 'text-cyan-400' : 'text-emerald-400')
                    }`}>
                      {Number(selectedPaymentCustomer.pending_amount || selectedPaymentCustomer.pending || 0) > 0
                        ? currency(selectedPaymentCustomer.pending_amount || selectedPaymentCustomer.pending)
                        : (Number(selectedPaymentCustomer.advance_balance || 0) > 0
                            ? `+${currency(selectedPaymentCustomer.advance_balance)} Cr`
                            : '₹0 (Settled)')}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10.5px]">Total Invoiced</span>
                        <strong className="text-slate-200 font-bold">{currency(selectedPaymentCustomer.total_amount)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10.5px]">Total Paid</span>
                        <strong className="text-emerald-400 font-bold">{currency(selectedPaymentCustomer.paid_amount)}</strong>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10.5px]">Carry Forward (Opening) Balance</span>
                        <strong className="text-amber-300 font-bold">
                          {currency(selectedPaymentCustomer.opening_balance || 0)}
                        </strong>
                      </div>
                      {!editingOpeningBalance ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOpeningBalanceInput(String(selectedPaymentCustomer.opening_balance || 0));
                            setEditingOpeningBalance(true);
                          }}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil size={11} /> Edit Balance
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={openingBalanceInput}
                            onChange={(e) => setOpeningBalanceInput(e.target.value)}
                            className="w-24 px-2 py-0.5 text-xs bg-slate-800 border border-slate-600 rounded text-white outline-none font-bold"
                            placeholder="0.00"
                          />
                          <button
                            type="button"
                            disabled={savingOpeningBalance}
                            onClick={handleSaveOpeningBalance}
                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold disabled:opacity-50 cursor-pointer"
                          >
                            {savingOpeningBalance ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingOpeningBalance(false)}
                            className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-[11px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Invoices List with Complete Purchase & Payment Retention */}
                  {(() => {
                    const allCustomerInvoices = selectedPaymentCustomer.items || [selectedPaymentCustomer];
                    const unpaidInvoices = allCustomerInvoices.filter(sale => Number(sale.pending_amount || 0) > 0);
                    const paidInvoices = allCustomerInvoices.filter(sale => Number(sale.pending_amount || 0) <= 0);

                    const displayedInvoices = customerDrawerTab === 'pending'
                      ? unpaidInvoices
                      : (customerDrawerTab === 'paid' ? paidInvoices : allCustomerInvoices);

                    return (
                      <div>
                        <div className="flex items-center justify-between mb-2.5">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                            Purchase & Payment History ({allCustomerInvoices.length})
                          </h4>
                          <button
                            type="button"
                            onClick={() => printCustomerStatementPDF(selectedPaymentCustomer)}
                            className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
                          >
                            <ReceiptText size={13} /> Complete Statement
                          </button>
                        </div>

                        {/* Tab Filter: All / Pending / Paid */}
                        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl mb-3">
                          <button
                            type="button"
                            onClick={() => setCustomerDrawerTab('all')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              customerDrawerTab === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            All ({allCustomerInvoices.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerDrawerTab('pending')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              customerDrawerTab === 'pending' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Pending ({unpaidInvoices.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerDrawerTab('paid')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              customerDrawerTab === 'paid' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Paid in Full ({paidInvoices.length})
                          </button>
                        </div>

                        {displayedInvoices.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                            {customerDrawerTab === 'pending' ? 'No pending invoices for this customer.' : 'No invoices in this category.'}
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {displayedInvoices.map((sale) => {
                              const isPaid = Number(sale.pending_amount || 0) <= 0;
                              const saleDueInfo = getDueDateInfo(sale.due_date);
                              const invNumber = sale.invoice_number || `INV-${String(sale.id).padStart(6, '0')}`;
                              
                              return (
                                <div key={sale.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5 hover:border-slate-300 transition-all">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="font-mono font-black text-slate-900 text-xs">
                                        {invNumber}
                                      </span>
                                      <span className="text-[11px] text-slate-500 ml-2">
                                        Bought on {formatDateDMY(sale.sale_date || sale.invoice_date)}
                                      </span>
                                    </div>
                                    {isPaid ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10.5px] border bg-emerald-50 text-emerald-800 border-emerald-200 font-bold">
                                        ✓ Paid in Full
                                      </span>
                                    ) : (
                                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] border ${saleDueInfo.badgeClass}`}>
                                        {saleDueInfo.label}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                                    <div>
                                      {isPaid ? (
                                        <span className="text-emerald-700 font-bold text-[11.5px]">
                                          Paid in Full
                                        </span>
                                      ) : (
                                        <>
                                          <span className="text-slate-500 text-[11px]">Pending: </span>
                                          <strong className="font-bold text-rose-600">{currency(sale.pending_amount)}</strong>
                                        </>
                                      )}
                                      <span className="text-slate-400 text-[10.5px] ml-1.5">(Total: {currency(sale.total_amount)})</span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => printTaxInvoicePDF(sale)}
                                        className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                                      >
                                        <ReceiptText size={12} /> Invoice
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openInvoiceShareModal(sale, selectedPaymentCustomer)}
                                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                                        title="Share this invoice via WhatsApp & PDF"
                                      >
                                        <Send size={12} /> Share
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openSalesReturnModal(sale)}
                                        className="px-2 py-1 bg-white hover:bg-amber-50 text-amber-800 border border-slate-200 hover:border-amber-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                        title="Return items from this invoice"
                                      >
                                        <RotateCcw size={12} /> Return
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openEditSaleModal(sale)}
                                        className="px-2 py-1 bg-white hover:bg-sky-50 text-sky-800 border border-slate-200 hover:border-sky-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                        title="Edit invoice dates, payment terms, expenses & remarks"
                                      >
                                        <Pencil size={12} /> Edit
                                      </button>
                                      {(role === 'superadmin' || Number(sale.created_by) === Number(session?.id)) && (
                                        <button
                                          type="button"
                                          onClick={() => deleteSale(sale)}
                                          className="p-1 text-rose-500 hover:text-rose-700 bg-white hover:bg-rose-50 rounded-lg border border-slate-200 transition-colors"
                                          title="Delete invoice and restore stock"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Payments / Repayments history on this invoice */}
                                  {Array.isArray(sale.payments) && sale.payments.length > 0 && (
                                    <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100 text-[11px] text-emerald-900 space-y-1">
                                      <span className="font-bold block text-[10px] uppercase tracking-wider text-emerald-700">
                                        Repayment Details:
                                      </span>
                                      {sale.payments.map((pm, pidx) => (
                                        <div key={pm.id || pidx} className="flex items-center justify-between">
                                          <span>
                                            Repaid on <strong>{formatDateDMY(pm.payment_date)}</strong> via <strong className="capitalize">{pm.payment_mode || 'Cash'}</strong>{pm.note ? ` (${pm.note})` : ''}
                                          </span>
                                          <strong className="font-bold text-emerald-800">{currency(pm.amount)}</strong>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Multi-product line items in this invoice */}
                                  {(() => {
                                    const invoiceProducts = Array.isArray(sale.items) && sale.items.length > 0
                                      ? sale.items
                                      : [{
                                          id: 0,
                                          product_name: sale.product_name || productName(sale),
                                          quantity: sale.quantity || 1,
                                          unit_price: Number(sale.total_amount || 0) / Math.max(1, Number(sale.quantity || 1)),
                                          total_price: sale.total_amount,
                                          colour: sale.colour
                                        }];
                                    const expensesList = Array.isArray(sale.expenses) ? sale.expenses : [];

                                    return (
                                      <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 space-y-1.5">
                                        <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                          <span>Invoice Items ({invoiceProducts.length})</span>
                                          <span>Line Total</span>
                                        </div>
                                        {invoiceProducts.map((it, itIdx) => {
                                          const itemQty = Number(it.quantity || 1);
                                          const itemUnit = Number(it.unit_price || 0) || (Number(it.total_price || 0) / Math.max(1, itemQty));
                                          const itemLineTotal = Number(it.total_price || (itemUnit * itemQty));

                                          return (
                                            <div key={it.id || itIdx} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                                              <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                                                  <span className="font-bold">{it.product_name || it.name || productName(it)}</span>

                                                  {getBrandName(it, sale) && (
                                                    <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">
                                                      {getBrandName(it, sale)}
                                                    </span>
                                                  )}
                                                  {it.colour && (
                                                    <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold">
                                                      ● {it.colour}
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="text-[11px] text-slate-400 pl-3">
                                                  Qty: {itemQty} pcs · Rate: {currency(itemUnit)}
                                                </div>
                                              </div>
                                              <strong className="text-slate-900 font-bold text-xs shrink-0 ml-2">
                                                {currency(itemLineTotal)}
                                              </strong>
                                            </div>
                                          );
                                        })}

                                        {expensesList.length > 0 && (
                                          <div className="pt-1.5 border-t border-slate-100 space-y-1 text-[11px]">
                                            <span className="text-[10px] font-bold text-teal-700 uppercase">Extra Expenses:</span>
                                            {expensesList.map((exp, expIdx) => (
                                              <div key={exp.id || expIdx} className="flex justify-between text-teal-800 font-medium">
                                                <span>+ {exp.expense_name || exp.expense_type}</span>
                                                <span>{currency(exp.amount)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Drawer Sticky Footer Actions */}
                <div className="p-4 border-t border-slate-200 bg-slate-50/90 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentModalTarget(selectedPaymentCustomer);
                      setPaymentModalForm({
                        amount: String(selectedPaymentCustomer.pending_amount || ''),
                        mode: 'cash',
                        reference_no: '',
                        note: '',
                      });
                    }}
                    className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CreditCard size={15} /> Record Payment
                  </button>
                  {/* Drawer Share Button */}
                  <button
                    type="button"
                    onClick={() => openPendingShareModal(selectedPaymentCustomer)}
                    className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Send size={15} /> Share
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        </React.Suspense>

        {/* ========================================================= */}
        {/* GLOBAL: RECORD PAYMENT MODAL */}
        {/* ========================================================= */}
        <AnimatePresence>
          {paymentModalTarget && (
            <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
              {/* Modal Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPaymentModalTarget(null)}
                className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
              />

              {/* Modal Content */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 z-10 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                      <CreditCard size={16} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">Record Payment</h3>
                      <p className="text-xs text-slate-500">Collect customer dues safely</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentModalTarget(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Customer & Due Details */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Customer</span>
                    <strong className="text-sm font-bold text-slate-800">{paymentModalTarget.customer_name || paymentModalTarget.name}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Pending Balance</span>
                    <strong className="text-sm font-black text-rose-600">{currency(paymentModalTarget.pending_amount)}</strong>
                  </div>
                </div>

                <form onSubmit={submitRecordPaymentModal} className="space-y-3.5">
                  {/* Payment Amount Input & Quick Fill */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Payment Amount (₹) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      max={paymentModalTarget.pending_amount}
                      required
                      autoFocus
                      placeholder="Enter amount"
                      className="w-full text-base font-bold px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none bg-white text-slate-900"
                      value={paymentModalForm.amount}
                      onChange={(e) => setPaymentModalForm({ ...paymentModalForm, amount: e.target.value })}
                    />

                    {/* Quick Chips */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPaymentModalForm({ ...paymentModalForm, amount: String(paymentModalTarget.pending_amount) })}
                        className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition-colors"
                      >
                        Full ({currency(paymentModalTarget.pending_amount)})
                      </button>
                      {Number(paymentModalTarget.pending_amount) > 1000 && (
                        <button
                          type="button"
                          onClick={() => setPaymentModalForm({ ...paymentModalForm, amount: String(Math.round(Number(paymentModalTarget.pending_amount) / 2)) })}
                          className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                        >
                          50% ({currency(Math.round(Number(paymentModalTarget.pending_amount) / 2))})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payment Date, Mode & Reference No */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Payment Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none bg-white text-slate-800"
                        value={paymentModalForm.date || today()}
                        onChange={(e) => setPaymentModalForm({ ...paymentModalForm, date: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Payment Mode</label>
                      <select
                        className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none bg-white text-slate-800"
                        value={paymentModalForm.mode}
                        onChange={(e) => setPaymentModalForm({ ...paymentModalForm, mode: e.target.value })}
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI / GPay</option>
                        <option value="bank">Bank Transfer</option>
                        <option value="cheque">Cheque</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Reference No (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. UPI Ref / Txn ID"
                      className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none bg-white text-slate-800"
                      value={paymentModalForm.reference_no}
                      onChange={(e) => setPaymentModalForm({ ...paymentModalForm, reference_no: e.target.value })}
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Payment Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Received by store manager"
                      className="w-full text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none bg-white text-slate-800"
                      value={paymentModalForm.note}
                      onChange={(e) => setPaymentModalForm({ ...paymentModalForm, note: e.target.value })}
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentModalTarget(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check size={14} /> {saving ? 'Recording...' : 'Save Payment'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showQuickAddCustomerModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden p-6"
              >
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-2xl bg-teal-100 text-teal-700">
                      {editingCustomer ? <Edit3 size={20} /> : <Users size={20} />}
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900">{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h3>
                  </div>
                  <button type="button" onClick={() => { setShowQuickAddCustomerModal(false); setEditingCustomer(null); }} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleQuickAddCustomerSubmit} className="py-4 space-y-3.5 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={quickCustomerForm.name}
                      onChange={(e) => setQuickCustomerForm({ ...quickCustomerForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white transition-all"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">Mobile Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={quickCustomerForm.mobile}
                      onChange={(e) => setQuickCustomerForm({ ...quickCustomerForm, mobile: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">Address</label>
                    <input
                      type="text"
                      placeholder="City or location"
                      value={quickCustomerForm.address}
                      onChange={(e) => setQuickCustomerForm({ ...quickCustomerForm, address: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">GSTIN (GST Number - Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 24AAAAA0000A1Z5"
                      value={quickCustomerForm.gstin || ''}
                      onChange={(e) => setQuickCustomerForm({ ...quickCustomerForm, gstin: e.target.value.toUpperCase() })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white transition-all uppercase tracking-wider font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">Customer Type</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <label className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        quickCustomerForm.customer_type === 'retailer' || !quickCustomerForm.customer_type
                          ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}>
                        <input
                          type="radio"
                          name="customer_type_modal"
                          value="retailer"
                          checked={quickCustomerForm.customer_type === 'retailer' || !quickCustomerForm.customer_type}
                          onChange={(e) => setQuickCustomerForm({ ...quickCustomerForm, customer_type: e.target.value })}
                          className="accent-teal-600"
                        />
                        <span>Retailer</span>
                      </label>
                      <label className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        quickCustomerForm.customer_type === 'wholesaler'
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-800 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}>
                        <input
                          type="radio"
                          name="customer_type_modal"
                          value="wholesaler"
                          checked={quickCustomerForm.customer_type === 'wholesaler'}
                          onChange={(e) => setQuickCustomerForm({ ...quickCustomerForm, customer_type: e.target.value })}
                          className="accent-indigo-600"
                        />
                        <span>Wholesaler</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowQuickAddCustomerModal(false); setEditingCustomer(null); }}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingQuickCustomer}
                      className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
                    >
                      {editingCustomer ? (
                        <>
                          <Check size={14} /> {savingQuickCustomer ? 'Saving...' : 'Save Changes'}
                        </>
                      ) : (
                        <>
                          <Plus size={14} /> {savingQuickCustomer ? 'Creating...' : 'Create & Select Customer'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function FormPanel({ title, action, onSubmit, children, disabled = false }) {
  return (
    <form className="panel form-panel" onSubmit={(event) => { event.preventDefault(); onSubmit(); }} onKeyDown={handleFormKeyDown}>
      <h2>{title}</h2>
      <div className="form-grid compact">{children}</div>
      <button className="primary" type="submit" disabled={disabled}><Plus size={17} /> {action}</button>
    </form>
  );
}

function Input({ label, value, onChange, type = 'text', className = '', ...inputProps }) {
  const hasValue = value !== null && value !== undefined && String(value).length > 0;
  return (
    <label className={`field-label ${hasValue ? 'has-value' : ''} ${className}`}>
      <span className="field-label-text">{label}</span>
      <input
        {...inputProps}
        placeholder={inputProps.placeholder || ' '}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onWheel={type === 'number' ? (e) => e.target.blur() : inputProps.onWheel}
      />
    </label>
  );
}

function Select({ label, value, onChange, options = [], placeholder = 'Select', className = '', ...selectProps }) {
  const hasEmptyOption = options.some(([id]) => id === '' || id === null || id === undefined);
  return (
    <label className={`field-label select-field ${value ? 'has-value' : ''} ${className}`}>
      <span className="field-label-text">{label}</span>
      <select {...selectProps} value={value} onChange={(e) => onChange(e.target.value)}>
        {!hasEmptyOption && placeholder && <option value="">{placeholder}</option>}
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function CardGrid({ items, render, className = '', onItemClick, emptyTitle = 'No records yet' }) {
  return (
    <div className={`card-grid ${className}`}>
      {items.map((item, index) => (
        <motion.article 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-30px" }}
          whileHover={{ y: -4, scale: 1.012 }}
          whileTap={{ scale: 0.995 }}
          transition={{ 
            type: 'spring', 
            stiffness: 260, 
            damping: 24, 
            delay: Math.min(index * 0.02, 0.2) 
          }}
          className={`panel card ${onItemClick ? 'cursor-pointer hover:border-brand-accent/40' : ''}`}
          key={item.id}
          onClick={() => onItemClick && onItemClick(item)}
        >
          {render(item)}
        </motion.article>
      ))}
      {!items.length && <Empty title={emptyTitle} />}
    </div>
  );
}

export default App;
