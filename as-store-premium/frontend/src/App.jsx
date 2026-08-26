import React, { useDeferredValue, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  Building2,
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
  X,
} from 'lucide-react';
import ModelsPage from './components/models/ModelsPage';
import ProductDetailModal from './components/models/ProductDetailModal';
import ProductDetailPage from './components/models/ProductDetailPage';
import PricesPage from './components/prices/PricesPage';
import StockPage from './components/stock/StockPage';
import LowStockPage from './components/stock/LowStockPage';
import BranchOrderStockPage from './components/stock/BranchOrderStockPage';
import SuperAdminStockRequestsPage from './components/stock/SuperAdminStockRequestsPage';
import BrandsPage from './components/brands/BrandsPage';
import ManufacturingBrandsPage from './components/manufacturing-brands/ManufacturingBrandsPage';
import SuppliersPage from './components/suppliers/SuppliersPage';
import Pagination from './components/ui/Pagination';
import SmartSkeletonWrapper, { CardSkeleton, TableRowSkeleton } from './components/ui/SkeletonLoader';
import SearchInput from './components/ui/SearchInput';
import SearchableCombobox from './components/ui/SearchableCombobox';
import { CategoriesPage } from './components/other-products/CategoriesPage';
import ShopkeeperLoginsPage from './components/operations/ShopkeeperLoginsPage';
import SupplierImportWorkspace from './components/operations/SupplierImportWorkspace';
import RedesignedDashboard from './components/dashboard/RedesignedDashboard';
import { consolidateProductList } from './utils/productConsolidation';
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
  const response = await fetch(`${API_BASE}${path}`, {
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
      : rawError?.message || (typeof rawError === 'object' && Object.keys(rawError).length ? JSON.stringify(rawError) : '') || 'Something went wrong.';
    throw new ApiError(errorMessage, response.status);
  }
  return data;
};

const isSessionError = (error) => (
  error?.status === 401
  || (error?.status === 403 && /session expired|invalid token|login again/i.test(error.message))
);
const inferToastTone = (message) => (
  /unable|failed|error|wrong|invalid|required|cannot|choose|select|enter|no matching|not found|already in use/i.test(String(message || ''))
    ? 'error'
    : 'success'
);

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

const currency = (value) => `\u20b9${Number(value || 0).toLocaleString('en-IN')}`;
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
  if (mfg && !baseName.toLowerCase().includes(mfg.toLowerCase())) parts.push(`Mfg: ${mfg}`);
  if (variant && !baseName.toLowerCase().includes(variant.toLowerCase())) parts.push(variant);
  if (supplier && !baseName.toLowerCase().includes(supplier.toLowerCase())) parts.push(supplier);

  if (parts.length > 0) {
    return `${baseName} (${parts.join(' - ')})`;
  }
  return baseName;
};
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
    ['stock', 'Stock', Package],
    ['low-stock', 'Low Stock', AlertTriangle],
    ['brands', 'Brands', Tags],
    ['manufacturing-brands', 'Manufacturing Brands', Tags],
    ['suppliers', 'Suppliers', Users],
    ['models', 'Models', Smartphone],
    ['prices', 'Prices', IndianRupee],
    ['categories', 'Product Categories', Store],
    ['shops', 'Shops', Building2],
    ['shopkeepers', 'Shopkeepers', UserCog],
    ['import', 'Supplier Import', UploadCloud],
    ['customers', 'Customers', Users],
    ['sales', 'Sales', ReceiptText],
    ['requests', 'Stock Requisitions', Boxes],
    ['payments', 'Pending', CreditCard],
    ['reports', 'Reports', FileText],
  ],
  shopkeeper: [
    ['dashboard', 'Dashboard', BarChart3],
    ['order-stock', 'Order Stock', ShoppingCart],
    ['requests', 'My Requisitions', History],
    ['stock', 'Stock', Package],
    ['low-stock', 'Low Stock', AlertTriangle],
    ['brands', 'Brands', Tags],
    ['manufacturing-brands', 'Manufacturing Brands', Tags],
    ['suppliers', 'Suppliers', Users],
    ['models', 'Models', Smartphone],
    ['prices', 'Prices', IndianRupee],
    ['categories', 'Product Categories', Store],
    ['customers', 'Customers', Users],
    ['sales', 'Create Sale', ReceiptText],
    ['payments', 'Pending', CreditCard],
    ['reports', 'Reports', FileText],
  ],
  supplier: [
    ['dashboard', 'Dashboard', BarChart3],
    ['models', 'Models', Smartphone],
    ['prices', 'Prices', IndianRupee],
  ],
  customer: [
    ['catalog', 'Catalog', ShoppingBag],
    ['models', 'Models', Smartphone],
  ],
};
navByRole.admin = navByRole.shopkeeper;
navByRole.user = navByRole.customer;

const sidebarSectionsByRole = {
  superadmin: [
    { title: 'Dashboard', ids: ['dashboard'] },
    { title: 'Inventory', ids: ['stock', 'low-stock', 'prices', 'models', 'brands', 'manufacturing-brands', 'suppliers', 'categories'] },
    { title: 'Operations', ids: ['shops', 'shopkeepers', 'import', 'customers', 'sales', 'requests', 'payments'] },
    { title: 'Reports', ids: ['reports'] },
  ],
  shopkeeper: [
    { title: 'Dashboard', ids: ['dashboard'] },
    { title: 'Stock Replenishment', ids: ['order-stock', 'requests'] },
    { title: 'Inventory', ids: ['stock', 'low-stock', 'prices', 'models', 'brands', 'manufacturing-brands', 'suppliers', 'categories'] },
    { title: 'Operations', ids: ['customers', 'sales', 'payments'] },
    { title: 'Reports', ids: ['reports'] },
  ],
  supplier: [
    { title: 'Catalog & Prices', ids: ['dashboard', 'models', 'prices'] },
  ],
  customer: [
    { title: 'Catalog', ids: ['catalog', 'models'] },
  ],
};
sidebarSectionsByRole.admin = sidebarSectionsByRole.shopkeeper;
sidebarSectionsByRole.user = sidebarSectionsByRole.customer;

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

const validPageIds = new Set([...Object.values(navByRole).flatMap((items) => items.map(([id]) => id)), 'low-stock', 'order-stock', 'stock-requests']);
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
  customer: { name: '', mobile: '', address: '', notes: '' },
  sale: {
    product_id: '',
    customer_id: '',
    quantity: 1,
    selling_price: '',
    original_total: '',
    final_total_amount: '',
    total_amount: '',
    discount_amount: '0',
    discount_percentage: '0',
    is_custom_total: false,
    paid_amount: '',
    payment_mode: 'cash',
    due_date: '2026-06-15',
    notes: '',
    items: [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '' }],
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
  const grandTotal = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  const paidAmount = Number(sale.paid_amount || 0);
  const pendingAmount = Math.max(grandTotal - paidAmount, 0);
  return (
    <section className="bill-summary md:col-span-4" aria-label="Bill summary">
      <span className="bill-summary-kicker">Bill summary</span>
      <div>
        <small>Items</small>
        <strong>{items.length || 1}</strong>
      </div>
      <div>
        <small>Grand total</small>
        <strong>{currency(grandTotal)}</strong>
      </div>
      <div>
        <small>Paid amount</small>
        <strong>{currency(paidAmount)}</strong>
      </div>
      <div>
        <small>Pending amount</small>
        <strong className={pendingAmount > 0 ? 'text-amber-700' : 'text-emerald-700'}>{currency(pendingAmount)}</strong>
      </div>
    </section>
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
  const [customerFilters, setCustomerFilters] = useState({ search: '', status: '' });
  const [showQuickAddCustomerModal, setShowQuickAddCustomerModal] = useState(false);
  const [quickCustomerForm, setQuickCustomerForm] = useState({ name: '', mobile: '', address: '', notes: '' });
  const [savingQuickCustomer, setSavingQuickCustomer] = useState(false);

  const handleQuickAddCustomerSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!quickCustomerForm.name.trim()) return showToast('Please enter customer name');
    try {
      setSavingQuickCustomer(true);
      const scoped = shopId ? `?shopId=${shopId}` : '';
      const created = await authedFetch(`/customers${scoped}`, {
        method: 'POST',
        body: JSON.stringify(quickCustomerForm),
      });
      const updatedCustomers = await authedFetch(`/customers${scoped}`);
      setData((prev) => ({ ...prev, customers: updatedCustomers }));
      const newId = created?.id || updatedCustomers.find(c => c.name.toLowerCase() === quickCustomerForm.name.trim().toLowerCase())?.id;
      if (newId) {
        setForms((prev) => ({ ...prev, sale: { ...prev.sale, customer_id: String(newId) } }));
      }
      setQuickCustomerForm({ name: '', mobile: '', address: '', notes: '' });
      setShowQuickAddCustomerModal(false);
      showToast('Customer created and selected for sale');
    } catch (err) {
      showToast(err.message || 'Failed to add customer');
    } finally {
      setSavingQuickCustomer(false);
    }
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
  const [customerPager, setCustomerPager] = useState(() => createPager(5000));
  const [salesPager, setSalesPager] = useState(() => createPager(5000));
  const [pendingPager, setPendingPager] = useState(() => createPager(5000));
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

  // Global search keyboard shortcut (Ctrl+K, Cmd+K, Ctrl+/, Alt+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey || e.altKey) && (e.key === 'k' || e.key === 'K' || e.key === '/')) {
        e.preventDefault();
        setGlobalSearchFocused(true);
        hydrateGlobalSearch();
        const searchInput = document.querySelector('.global-search input') || document.querySelector('input[placeholder*="Search"]') || document.querySelector('input[type="search"]');
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
      stockParams.set('limit', String(stockPager.limit));
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
        limit: String(productPager.limit),
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

      // Case 1: Stock Prices Export (/prices page)
      if (type === 'prices') {
        let items = preloadedItems;
        if (!items || !items.length) {
          if (data.products && data.products.length) {
            items = consolidateProductList(data.products);
          } else {
            try {
              const fetched = await authedFetch('/export-data?type=products');
              items = consolidateProductList(Array.isArray(fetched) ? fetched : []);
            } catch (fetchErr) {
              console.warn('Export fetch failed for prices, using local state', fetchErr);
              items = consolidateProductList(data.products || []);
            }
          }
        }
        if (!items || !items.length) return showToast('No price catalog items found to export');
        exportStockPricesExcel(items, `Stock_Prices_${dateStr}.xlsx`);
        showToast('Stock prices Excel (.xlsx) downloaded');
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
    const map = new Map();
    list.forEach((p) => {
      const id = p.product_id || p.id;
      if (!id) return;
      if (!map.has(String(id))) {
        const title = p.short_name || p.name || p.product_name || p.display_name || 'Product';
        const brand = p.brand || p.company_brand_name || '';
        const mfg = p.manufacturing_brand_name || p.manufacturing_brand || '';
        const cat = p.part_category || p.category || '';
        const variant = p.quality_variant || p.product_variant_name || p.quality || '';
        const models = p.full_model_list || p.compatible_models || p.model || (Array.isArray(p.compatible) ? p.compatible.join(' ') : p.compatible) || '';
        const retailPrice = Number(p.sale_price || p.retail_price || 0);
        const wholesalePrice = Number(p.wholesale_price || 0);

        const labelParts = [
          title,
          variant ? `(${variant})` : '',
          cat ? `[${cat}]` : '',
          brand ? `· ${brand}` : '',
        ].filter(Boolean);

        const priceDetails = [];
        if (retailPrice > 0) priceDetails.push(`Retail: ₹${retailPrice.toLocaleString('en-IN')}`);
        if (wholesalePrice > 0) priceDetails.push(`Wholesale: ₹${wholesalePrice.toLocaleString('en-IN')}`);
        const priceLabelStr = priceDetails.length > 0 ? ` · (${priceDetails.join(' | ')})` : '';

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

        map.set(String(id), {
          id: String(id),
          name: visibleName,
          keywords,
          brand,
          category: cat,
          quality: variant,
          model: models,
          retailPrice: retailPrice > 0 ? retailPrice : '',
          wholesalePrice: wholesalePrice > 0 ? wholesalePrice : '',
          defaultPrice: retailPrice > 0 ? retailPrice : (wholesalePrice > 0 ? wholesalePrice : ''),
        });
      }
    });

    return Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.products, data.catalog, data.stock]);

  const getProductDefaultPrice = useCallback((productId) => {
    if (!productId) return '';
    const allProducts = [...(data.products || []), ...(data.catalog || []), ...(data.stock || [])];
    const match = allProducts.find((p) => String(p.product_id || p.id) === String(productId));
    if (!match) return '';
    const price = Number(match.sale_price || match.retail_price || match.wholesale_price || 0);
    return price > 0 ? String(price) : '';
  }, [data.products, data.catalog, data.stock]);

  const calculateSaleTotals = (items) => {
    const calculatedTotal = (items || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    return {
      original_total: String(calculatedTotal),
      final_total_amount: String(calculatedTotal),
      total_amount: String(calculatedTotal),
      discount_amount: '0',
      discount_percentage: '0',
      is_custom_total: false,
    };
  };

  const getProductAvailableColors = (product) => {
    if (!product) return [];
    const colorSet = new Set();

    // 1. From product.colours (array, JSON, or comma-separated string)
    if (Array.isArray(product.colours)) {
      product.colours.forEach((c) => { if (c) colorSet.add(String(c).trim()); });
    } else if (typeof product.colours === 'string' && product.colours.trim()) {
      try {
        const parsed = JSON.parse(product.colours);
        if (Array.isArray(parsed)) parsed.forEach((c) => { if (c) colorSet.add(String(c).trim()); });
        else product.colours.split(',').forEach((c) => { if (c.trim()) colorSet.add(c.trim()); });
      } catch {
        product.colours.split(',').forEach((c) => { if (c.trim()) colorSet.add(c.trim()); });
      }
    }

    if (Array.isArray(product.available_colors)) {
      product.available_colors.forEach((c) => { if (c) colorSet.add(String(c).trim()); });
    } else if (typeof product.available_colors === 'string' && product.available_colors.trim()) {
      product.available_colors.split(',').forEach((c) => { if (c.trim()) colorSet.add(c.trim()); });
    }

    // 2. From colour_stock keys
    if (product.colour_stock && typeof product.colour_stock === 'object') {
      Object.keys(product.colour_stock).forEach((col) => {
        if (col && col !== 'Standard' && col !== 'undefined' && col !== 'null') {
          colorSet.add(col.trim());
        }
      });
    }

    // 3. From batches / supplier_batches
    const allBatches = [...(product.batches || []), ...(product.supplier_batches || [])];
    allBatches.forEach((b) => {
      if (b.colour && b.colour !== 'Standard' && b.colour !== 'undefined' && b.colour !== 'null') {
        colorSet.add(b.colour.trim());
      }
    });

    // 4. Also check matching products across data sources (by ID or model name)
    const currentId = String(product.id || product.product_id || '');
    const currentModel = String(product.short_name || product.name || '').trim().toLowerCase();
    const allProducts = [...(data.products || []), ...(data.productResults || []), ...(data.catalog || []), ...(data.stock || [])];
    
    allProducts.forEach((p) => {
      const pId = String(p.id || p.product_id || '');
      const pModel = String(p.short_name || p.name || '').trim().toLowerCase();
      if ((currentId && pId === currentId) || (currentModel && pModel === currentModel)) {
        if (Array.isArray(p.colours)) {
          p.colours.forEach((c) => { if (c) colorSet.add(String(c).trim()); });
        } else if (typeof p.colours === 'string' && p.colours.trim()) {
          p.colours.split(',').forEach((c) => { if (c.trim()) colorSet.add(c.trim()); });
        }
        if (p.colour_stock && typeof p.colour_stock === 'object') {
          Object.keys(p.colour_stock).forEach((col) => {
            if (col && col !== 'Standard' && col !== 'undefined' && col !== 'null') colorSet.add(col.trim());
          });
        }
      }
    });

    return Array.from(colorSet).filter(Boolean);
  };

  const updateSaleItemProduct = (index, productId) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '', color_breakdown: [] }])];
    const defaultPrice = getProductDefaultPrice(productId);
    const qty = Math.max(Number(currentItems[index]?.quantity || 1), 1);
    const total = defaultPrice !== '' ? String(Number(defaultPrice) * qty) : '';

    currentItems[index] = {
      product_id: productId,
      selling_price: defaultPrice,
      price_type: 'retail',
      quantity: qty,
      total_amount: total,
      color_breakdown: [],
    };

    const totals = calculateSaleTotals(currentItems);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        product_id: currentItems[0]?.product_id || '',
        quantity: currentItems[0]?.quantity || 1,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const updateSaleItemPriceType = (index, priceType) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '' }])];
    const item = currentItems[index] || {};
    const unitPrice = sellingPriceFor(item.product_id, priceType);
    const quantity = Math.max(Number(item.quantity || 1), 1);
    const priceVal = unitPrice > 0 ? String(unitPrice) : (item.selling_price || '');
    const total = priceVal !== '' ? String(Number(priceVal) * quantity) : '';

    currentItems[index] = {
      ...item,
      price_type: priceType,
      selling_price: priceVal,
      total_amount: total,
    };

    const totals = calculateSaleTotals(currentItems);
    setForms((prev) => ({ ...prev, sale: { ...prev.sale, ...totals, items: currentItems } }));
  };

  const updateSaleItemSellingPrice = (index, priceVal) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '' }])];
    const item = currentItems[index] || {};
    const qty = Number(item.quantity || 1);
    const numericPrice = priceVal === '' ? '' : Number(priceVal);
    const total = (priceVal !== '' && !isNaN(numericPrice)) ? String(numericPrice * qty) : '';

    currentItems[index] = {
      ...item,
      selling_price: priceVal,
      total_amount: total,
    };

    const totals = calculateSaleTotals(currentItems);

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
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '' }])];
    const item = currentItems[index] || {};
    const numericPrice = Number(item.selling_price || 0);
    const numericQty = quantityVal === '' ? '' : Number(quantityVal);
    const total = (quantityVal !== '' && !isNaN(numericQty) && numericPrice > 0) ? String(numericPrice * numericQty) : (item.total_amount || '');

    currentItems[index] = {
      ...item,
      quantity: quantityVal,
      total_amount: total,
    };

    const totals = calculateSaleTotals(currentItems);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        quantity: currentItems[0]?.quantity || 1,
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
    const newQty = breakdown.length > 0 ? (totalColorQty || 1) : item.quantity;
    item.quantity = newQty;

    const unitPrice = Number(item.selling_price || 0);
    item.total_amount = unitPrice > 0 ? String(unitPrice * newQty) : item.total_amount;

    currentItems[itemIndex] = item;
    const totals = calculateSaleTotals(currentItems);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        quantity: currentItems[0]?.quantity || 1,
        ...totals,
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
      item.quantity = Math.max(totalColorQty, 1);
    }

    const unitPrice = Number(item.selling_price || 0);
    item.total_amount = unitPrice > 0 ? String(unitPrice * item.quantity) : item.total_amount;

    currentItems[itemIndex] = item;
    const totals = calculateSaleTotals(currentItems);

    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        quantity: currentItems[0]?.quantity || 1,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const addSaleItem = () => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '', color_breakdown: [] }])];
    currentItems.push({ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '', color_breakdown: [] });
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        items: currentItems,
      },
    }));
  };

  const removeSaleItem = (index) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '', color_breakdown: [] }])];
    if (currentItems.length <= 1) return;
    currentItems.splice(index, 1);
    const totals = calculateSaleTotals(currentItems);
    setForms((prev) => ({
      ...prev,
      sale: {
        ...prev.sale,
        product_id: currentItems[0]?.product_id || '',
        quantity: currentItems[0]?.quantity || 1,
        ...totals,
        items: currentItems,
      },
    }));
  };

  const deleteSale = (sale) => {
    requestConfirmation({
      title: `Delete sale for ${productName(sale)}?`,
      message: `This will delete the sale, remove its payments, and restore ${sale.quantity || 1} item(s) to stock. You can then create the corrected sale.`,
      confirmLabel: 'Delete sale',
      onConfirm: async () => {
        try {
          setSaving(true);
          await authedFetch(`/sales/${sale.id}`, { method: 'DELETE' });
          showToast('Sale deleted and stock restored');
          await Promise.all([
            loadTab('sales', shopId),
            loadTab('payments', shopId),
            loadTab('dashboard', shopId),
            loadTab('stock', shopId),
            loadTab('prices', shopId),
            loadTab('models', shopId),
            loadTab('customers', shopId),
            loadCore(),
          ]);
        } catch (error) {
          showToast(error.message || 'Unable to delete this sale');
        } finally {
          setSaving(false);
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
    
    if (!customerId || !items.length || items.some(i => !i.product_id || !i.quantity || Number(i.quantity) <= 0 || !i.total_amount || Number(i.total_amount) <= 0)) {
      return showToast('Choose customer, items, and valid selling price/quantity for each row');
    }

    const calculatedTotal = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

    try {
      setSaving(true);
      await authedFetch('/sales', {
        method: 'POST',
        body: JSON.stringify({
          shop_id: shopId,
          customer_id: customerId,
          paid_amount: String(Number(forms.sale.paid_amount || 0)),
          due_date: dueDate,
          notes,
          payment_mode: forms.sale.payment_mode || 'cash',
          original_total: calculatedTotal,
          final_total_amount: calculatedTotal,
          discount_amount: 0,
          discount_percentage: 0,
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
            };
          }),
        }),
      });

      setForms((prev) => ({
        ...prev,
        sale: {
          ...initialForms.sale,
          items: [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '' }],
        },
      }));
      showToast('Sale created successfully');
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
      showToast(error.message || 'Unable to create sale right now');
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

  const whatsappLink = (item) => {
    const msg = `Hello ${item.customer_name}, your pending payment of ${currency(item.pending_amount)} is due on ${item.due_date}. Please complete the payment soon.`;
    return `https://wa.me/91${item.mobile}?text=${encodeURIComponent(msg)}`;
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
    const rows = stockData.map((item) => `
      <tr>
        <td>
          <strong>${escapeHtml(productName(item))}</strong>
          <small>${escapeHtml([item.brand || 'No brand', item.category || 'Mobile'].filter(Boolean).join(' / '))}</small>
        </td>
        <td>${escapeHtml(fullModelList(item) || productName(item))}</td>
        <td class="num">${escapeHtml(printPrice(item.purchase_price))}</td>
        <td class="num">${escapeHtml(printPrice(item.sale_price))}</td>
        <td class="qty ${Number(item.quantity || 0) <= 3 ? 'low' : ''}">${Number(item.quantity || 0).toLocaleString('en-IN')} pcs</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!doctype html>
      <html lang="en">
        <head>
          <title>Stock Sheet - ${escapeHtml(shopName)}</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              margin: 0;
              background: #ffffff;
              font-size: 12px;
            }
            header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 24px;
              padding-bottom: 12px;
              margin-bottom: 12px;
              border-bottom: 2px solid #0f766e;
            }
            h1 {
              margin: 0 0 4px;
              font-size: 20px;
              letter-spacing: 0;
            }
            p {
              margin: 0;
              color: #475569;
              line-height: 1.45;
            }
            .meta {
              text-align: right;
              font-size: 11px;
            }
            .summary {
              display: flex;
              gap: 16px;
              margin: 0 0 12px;
              padding: 9px 10px;
              border: 1px solid #cbd5e1;
              background: #f8fafc;
            }
            .summary span {
              color: #475569;
            }
            .summary b {
              color: #0f172a;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th {
              background: #e2f8f5;
              color: #0f172a;
              font-weight: 800;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 0;
              padding: 8px 9px;
              border: 1px solid #cbd5e1;
              text-align: left;
            }
            td {
              padding: 8px 9px;
              border: 1px solid #e2e8f0;
              vertical-align: top;
              line-height: 1.35;
              overflow-wrap: anywhere;
            }
            td strong,
            td small {
              display: block;
            }
            td small {
              margin-top: 3px;
              color: #64748b;
              font-size: 10px;
            }
            .num,
            .qty {
              text-align: right;
              font-weight: 700;
              white-space: nowrap;
            }
            .qty {
              color: #0f766e;
            }
            .qty.low {
              color: #b45309;
            }
            tbody tr:nth-child(even) {
              background: #f8fafc;
            }
            @media print {
              body {
                print-color-adjust: exact;
                -webkit-print-color-adjust: exact;
              }
            }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>Stock Sheet</h1>
              <p><strong>${escapeHtml(shopName)}</strong>${shopArea ? ` - ${escapeHtml(shopArea)}` : ''}</p>
            </div>
            <p class="meta">Generated<br>${escapeHtml(printedAt)}</p>
          </header>
          <div class="summary">
            <span>Total items: <b>${stockData.length.toLocaleString('en-IN')}</b></span>
            <span>Total stock: <b>${totalStock.toLocaleString('en-IN')} pcs</b></span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 25%;">Product</th>
                <th style="width: 31%;">Compatible Device</th>
                <th style="width: 14%;">Stock Price</th>
                <th style="width: 14%;">Sale Price</th>
                <th style="width: 16%;">Stock Remaining</th>
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

  const printInvoicePDF = (sale) => {
    const printWindow = window.open('', '_blank');
    const invoiceNo = `INV-${String(sale.id).padStart(6, '0')}`;
    const dateStr = sale.sale_date || new Date().toISOString().slice(0, 10);
    const shopName = sale.shop_name || 'Pinky Sales';
    
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
              grid-template-columns: 1fr 1fr;
              gap: 40px;
              margin-bottom: 40px;
            }
            .meta-section h3 {
              margin: 0 0 10px;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: #94a3b8;
              font-weight: 800;
            }
            .meta-section p {
              margin: 0 0 6px;
              font-size: 14px;
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
              padding: 16px;
              border-bottom: 1px solid #f1f5f9;
              font-size: 14px;
              color: #334155;
            }
            .text-right {
              text-align: right;
            }
            .summary-box {
              width: 280px;
              margin-left: auto;
              margin-top: 20px;
              padding-top: 20px;
            }
            .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              font-size: 14px;
              color: #64748b;
            }
            .summary-row.total {
              border-top: 2px solid #f1f5f9;
              margin-top: 8px;
              padding-top: 12px;
              font-size: 18px;
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
              margin-top: 60px;
              border-top: 1px solid #f1f5f9;
              padding-top: 24px;
              text-align: center;
              font-size: 13px;
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
                <p>Premium Mobile & Display Solutions</p>
              </div>
              <div class="inv-details">
                <h2>INVOICE</h2>
                <p><strong>Invoice No:</strong> ${invoiceNo}</p>
                <p><strong>Date:</strong> ${dateStr}</p>
              </div>
            </div>
            
            <div class="meta-grid">
              <div class="meta-section">
                <h3>Billed To</h3>
                <p><strong>${sale.customer_name || 'Walk-in Customer'}</strong></p>
                <p>${sale.mobile || ''}</p>
                <p>${sale.address || 'No Address Provided'}</p>
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
                  <th class="text-right" style="width: 100px;">Qty</th>
                  <th class="text-right" style="width: 150px;">Unit Price</th>
                  <th class="text-right" style="width: 150px;">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>${productName(sale)}</strong>
                    <br/>
                    <small style="color: #64748b; font-size: 12px;">${sale.price_type === 'wholesale' ? 'Wholesale' : 'Retail'} price</small>
                  </td>
                  <td class="text-right">${sale.quantity || 1} pcs</td>
                  <td class="text-right">₹${Number(Number(sale.total_amount) / Number(sale.quantity || 1)).toLocaleString('en-IN')}</td>
                  <td class="text-right">₹${Number(sale.total_amount).toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>

            <div class="summary-box">
              <div class="summary-row">
                <span>Subtotal</span>
                <span>₹${Number(sale.total_amount).toLocaleString('en-IN')}</span>
              </div>
              <div class="summary-row paid">
                <span>Amount Paid</span>
                <span>₹${Number(sale.paid_amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div class="summary-row due">
                <span>Outstanding Balance</span>
                <span>₹${Number(sale.pending_amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div class="summary-row total">
                <span>Total Bill</span>
                <span>₹${Number(sale.total_amount).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div class="footer">
              <p>Thank you for choosing ${shopName}!</p>
              <p style="font-size: 11px; margin-top: 8px; color: #cbd5e1;">This is a computer-generated document. No signature required.</p>
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
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : safe(value || new Date().toLocaleDateString('en-GB'));
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
    const purchaseDates = invoiceItems.map((item) => item.sale_date).filter(Boolean).sort();
    const firstPurchaseDate = purchaseDates[0] || sale.sale_date;
    const latestPurchaseDate = purchaseDates[purchaseDates.length - 1] || sale.sale_date;
    const hasOutstandingBalance = invoiceItems.some((item) => Number(item.pending_amount || 0) > 0);
    const outstandingDueDates = invoiceItems.filter((item) => Number(item.pending_amount || 0) > 0).map((item) => item.due_date).filter(Boolean).sort();
    const invoiceNo = isConsolidated
      ? `C-${String(sale.shop_id || 0).padStart(3, '0')}-${String(sale.customer_id || 0).padStart(5, '0')}`
      : `D-${String(sale.id).padStart(5, '0')}`;
    let rawShopName = sale.shop_name || 'PINKYSALES';
    if (!rawShopName || rawShopName.toLowerCase().includes('warehouse') || rawShopName.toLowerCase() === 'pinky sales') {
      rawShopName = 'PINKYSALES';
    }
    const shopName = safe(rawShopName);
    const shopLines = [sale.shop_address, sale.shop_area, sale.shop_phone ? `Phone: ${sale.shop_phone}` : '', 'India']
      .filter(Boolean)
      .map((line) => `<div>${safe(line)}</div>`)
      .join('');
    const customerDetails = [sale.mobile, sale.address].filter(Boolean).map(safe).join(' &middot; ');
    const quantity = invoiceItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const total = invoiceItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const paid = invoiceItems.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0);
    const pending = invoiceItems.reduce((sum, item) => sum + Number(item.pending_amount || 0), 0);
    const periodLabel = firstPurchaseDate === latestPurchaseDate
      ? formatDate(firstPurchaseDate)
      : `${formatDate(firstPurchaseDate)} to ${formatDate(latestPurchaseDate)}`;
    const itemRows = invoiceItems.map((item, index) => {
      const itemQuantity = Number(item.quantity || 1);
      const itemTotal = Number(item.total_amount || 0);
      const unitPrice = itemQuantity ? itemTotal / itemQuantity : itemTotal;
      const productDetails = [item.brand, item.description].filter(Boolean).map(safe).join(' - ');
      return `
        <tr>
          <td class="number">${index + 1}</td>
          <td class="date">${formatDate(item.sale_date)}</td>
          <td class="item">${safe(productName(item))}${productDetails ? `<small>${productDetails}</small>` : ''}</td>
          <td class="qty">${itemQuantity}<br/>PCS</td>
          <td class="money">${formatAmount(unitPrice)}</td>
          <td class="money">${formatAmount(itemTotal)}</td>
        </tr>
      `;
    }).join('');

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
            .date { width: 82px; white-space: nowrap; }
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
                <div class="meta-line"><span>Invoice Date</span><b>:</b><strong>${formatDate(isConsolidated ? new Date().toISOString().slice(0, 10) : sale.sale_date)}</strong></div>
                <div class="meta-line"><span>Purchase Period</span><b>:</b><strong>${periodLabel}</strong></div>
                <div class="meta-line"><span>Terms</span><b>:</b><strong>Due on Receipt</strong></div>
                <div class="meta-line"><span>Due Date</span><b>:</b><strong>${outstandingDueDates.length ? formatDate(outstandingDueDates[0]) : hasOutstandingBalance ? 'Not set' : 'Paid'}</strong></div>
              </div>
              <div></div>
            </div>
            <div class="bill-title">Bill To</div>
            <div class="bill-to">${safe(sale.customer_name || 'Walk-in Customer')}${customerDetails ? `<small>${customerDetails}</small>` : ''}</div>
            <table>
              <thead><tr><th class="number">#</th><th class="date">Date</th><th>Item &amp; Description</th><th class="qty">Qty</th><th class="money">Rate</th><th class="money">Amount</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table>
            <div class="summary">
              <div class="notes">
                <div>Items in Total ${quantity}</div>
                <div class="words">Total In Words<strong>Indian Rupee ${toWords(total)} Only</strong></div>
                <div class="notes-block">Notes<br/>${safe(isConsolidated ? 'This invoice includes all purchases made by this customer at this branch.' : sale.notes || 'Thanks for your business.')}</div>
                <div class="notes-block">Terms &amp; Conditions<br/>Goods once sold will not be returned or exchanged.</div>
              </div>
              <div class="totals">
                <div class="total-line"><span>Sub Total</span><span>${formatAmount(total)}</span></div>
                <div class="total-line"><span>Shipping charge</span><span>0.00</span></div>
                <div class="total-line grand"><span>Total</span><span>Rs.${formatAmount(total)}</span></div>
                <div class="total-line grand"><span>Amount Paid</span><span>Rs.${formatAmount(paid)}</span></div>
                <div class="total-line grand"><span>Balance Due</span><span>Rs.${formatAmount(pending)}</span></div>
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
      const firstSale = invoice.sales[0];
      printTaxInvoicePDF({
        ...firstSale,
        customer_id: invoice.customer.id,
        customer_name: invoice.customer.name,
        mobile: invoice.customer.mobile,
        address: invoice.customer.address,
        shop_id: invoice.shop.id,
        shop_name: invoice.shop.name,
        shop_area: invoice.shop.area,
        shop_address: invoice.shop.address,
        shop_phone: invoice.shop.phone,
        items: invoice.sales,
        consolidated: true,
      }, printWindow);
    } catch (error) {
      printWindow.close();
      showToast(error.message || 'Unable to prepare the customer invoice');
    }
  };

  const productPageItems = role === 'customer'
    ? data.catalog
    : productPager.loaded
      ? data.productResults
      : data.products;
  const modelItems = role === 'customer' ? data.catalog.filter((item) => {
    const query = modelSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.short_name, item.full_model_list, item.name, item.brand, item.category, item.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }) : productPageItems;
  const priceItems = productPageItems;
  const visibleSales = data.sales;
  const shopkeeperQuery = normalizedText(deferredShopkeeperSearch);
  const visibleShopkeepers = data.shopkeepers.filter((user) => {
    if (!shopkeeperQuery) return true;
    return [user.name, user.username, user.contact, user.shop_name]
      .filter(Boolean)
      .some((value) => normalizedText(value).includes(shopkeeperQuery));
  });
  const staffedBranchCount = new Set(data.shopkeepers.map((user) => String(user.shop_id || '')).filter(Boolean)).size;
  const incompleteShopkeeperContacts = data.shopkeepers.filter((user) => !String(user.contact || '').trim()).length;

  const visibleCatalog = data.catalog.filter((product) => {
    const query = deferredCatalogFilters.search.trim().toLowerCase();
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

  const combinedStock = combineStockRows(data.stock);
  const stockWithOwnership = combinedStock.map((item) => ({
    ...item,
    owner_quantity: Number(item.owner_quantity || 0),
    shopkeeper_quantity: Number(item.shopkeeper_quantity || 0),
    my_quantity: Number(item.my_quantity || 0),
    owner_batch_count: Number(item.owner_batch_count || 0),
    shopkeeper_batch_count: Number(item.shopkeeper_batch_count || 0),
    my_batch_count: Number(item.my_batch_count || 0),
  }));
  const shopkeeperStockItems = stockWithOwnership;
  const visibleStock = stockWithOwnership;
  const stockSummaryLoaded = Boolean(data.stockSummary?.loaded);
  const stockSummaryTotals = data.stockSummary?.totals || {};
  const stockCategorySummaryMap = new Map((data.stockSummary?.categories || []).map((category) => [
    normalizedText(category.category),
    category,
  ]));
  const categoryStats = [
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
  ];
  const visibleCategoryStats = categoryStats.filter((category) => (
    !categorySearch.trim() || category.label.toLowerCase().includes(categorySearch.trim().toLowerCase())
  ));
  const selectedCategoryStat = stockCategoryPage
    ? categoryStats.find((category) => stockCategoryPage === '__all__' ? !category.name : sameText(category.name, stockCategoryPage))
    : null;
  const activeCategoryFilterCount = ['search', 'brand', 'colour', 'status', 'ownership'].filter((key) => Boolean(stockFilters[key])).length;
  const ownerInventoryQuantity = stockSummaryLoaded ? Number(stockSummaryTotals.owner_quantity || 0) : stockWithOwnership.reduce((sum, item) => sum + Number(item.owner_quantity || 0), 0);
  const assignedInventoryQuantity = stockSummaryLoaded ? Number(stockSummaryTotals.shopkeeper_quantity || 0) : stockWithOwnership.reduce((sum, item) => sum + Number(item.shopkeeper_quantity || 0), 0);
  const myInventoryQuantity = stockSummaryLoaded ? Number(stockSummaryTotals.my_quantity || 0) : stockWithOwnership.reduce((sum, item) => sum + Number(item.my_quantity || 0), 0);
  const warehouseInventoryQuantity = stockWithOwnership
    .filter((item) => item.location_type === 'warehouse' || String(item.shop_id) === String(data.warehouse?.id))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const stableWarehouseInventoryQuantity = stockSummaryLoaded ? Number(stockSummaryTotals.warehouse_quantity || 0) : warehouseInventoryQuantity;
  const accessibleInventoryQuantity = stockSummaryLoaded ? Number(stockSummaryTotals.quantity || 0) : stockWithOwnership.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const lowStockAlerts = combineLowStockAlerts(data.dashboard?.lowStock);
  const dashboardAvailability = data.dashboard?.modelAvailability || [];
  const dashboardWarehouseStock = dashboardAvailability.reduce((sum, item) => sum + Number(item.warehouse_stock || 0), 0);
  const dashboardBranchPerformance = data.dashboard?.shopWise?.filter((shop) => shop.location_type !== 'warehouse') || [];
  const dashboardShopCount = dashboardBranchPerformance.length || data.dashboard?.totals?.total_shops || 0;
  const globalQuery = globalSearch.trim().toLowerCase();
  const globalSearchResults = (() => {
    if (!globalQuery) return [];
    const results = [];
    const matches = (values) => values
      .filter((value) => value !== null && value !== undefined)
      .some((value) => String(value).toLowerCase().includes(globalQuery));
    const addResult = (result, values) => {
      if (results.length >= 10 || !matches(values)) return;
      results.push(result);
    };
    const productsById = new Map();
    [...dashboardAvailability, ...(role === 'customer' ? data.catalog : data.products)].forEach((item) => {
      if (!item?.id) return;
      productsById.set(String(item.id), { ...productsById.get(String(item.id)), ...item });
    });
    [...productsById.values()].forEach((item) => addResult({
      kind: 'product',
      type: 'Product',
      title: productName(item),
      meta: joinUniqueText([item.brand, item.category, item.available_locations], 'Model details'),
      icon: Smartphone,
      item,
    }, [productName(item), fullModelList(item), item.brand, item.category, item.description, item.available_locations]));
    const brandNames = [
      ...data.reference.brands.map((brand) => brand.name),
      ...data.products.map((product) => product.brand),
      ...data.catalog.map((product) => product.brand),
    ].filter(Boolean);
    [...new Set(brandNames.map((name) => String(name).trim()).filter(Boolean))].forEach((brand) => addResult({
      kind: 'brand',
      type: 'Brand',
      title: brand,
      meta: 'Filter inventory and catalog',
      icon: Package,
      item: { brand },
    }, [brand]));
    data.customers.forEach((customer) => addResult({
      kind: 'customer',
      type: 'Customer',
      title: customer.name,
      meta: joinUniqueText([customer.mobile, customer.shop_name, currency(customer.pending)], 'Customer account'),
      icon: Users,
      item: customer,
    }, [customer.name, customer.mobile, customer.address, customer.shop_name, customer.pending]));
    data.sales.forEach((sale) => addResult({
      kind: 'sale',
      type: 'Sale',
      title: sale.customer_name || 'Walk-in customer',
      meta: joinUniqueText([productName(sale), sale.shop_name, sale.payment_mode, currency(sale.total_amount)], 'Sale record'),
      icon: ReceiptText,
      item: sale,
    }, [sale.customer_name, sale.mobile, productName(sale), sale.product_name, sale.brand, sale.category, sale.shop_name, sale.payment_mode]));
    data.shops.forEach((shop) => addResult({
      kind: 'shop',
      type: shop.location_type === 'warehouse' ? 'Warehouse' : 'Shop',
      title: shop.name,
      meta: joinUniqueText([shop.area, shop.phone], 'Location'),
      icon: Store,
      item: shop,
    }, [shop.name, shop.area, shop.address, shop.phone, shop.location_type]));
    return results;
  })();

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
          {showGlobalSearch && (
            <div className="global-search hidden md:block" onBlur={closeGlobalSearch}>
              <div className="searchbox topbar-search">
                <Search size={18} />
                <input
                  aria-label="Global search"
                  placeholder="Search products, customers, sales, shops"
                  value={globalSearch}
                  onFocus={() => {
                    setGlobalSearchFocused(true);
                    hydrateGlobalSearch();
                  }}
                  onChange={(event) => {
                    setGlobalSearch(event.target.value);
                    setGlobalSearchFocused(true);
                  }}
                />
                {globalSearch && (
                  <button
                    type="button"
                    className="search-clear cursor-pointer"
                    aria-label="Clear search"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setGlobalSearch('');
                      setGlobalSearchFocused(false);
                      const searchInput = document.querySelector('.global-search input');
                      if (searchInput) {
                        searchInput.focus({ preventScroll: true });
                      }
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <AnimatePresence>
                {globalSearchFocused && globalSearch && (
                  <motion.div
                    className="global-search-popover"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                  >
                    {globalSearchResults.map((result, index) => {
                       const ResultIcon = result.icon;
                       return (
                         <button
                           type="button"
                           className="global-search-result"
                           key={`${result.kind}-${result.item?.id || result.title}-${index}`}
                           onMouseDown={(event) => {
                             event.preventDefault();
                             handleGlobalSearchSelect(result);
                           }}
                         >
                           <span className={`global-result-icon ${result.kind}`}><ResultIcon size={16} /></span>
                           <span>
                             <b>{result.title}</b>
                             <small>{result.meta}</small>
                           </span>
                           <em>{result.type}</em>
                         </button>
                       );
                    })}
                    {!globalSearchResults.length && (
                      <div className="global-search-empty">
                        <Search size={16} />
                        <span>No matching product, customer, sale, or shop found.</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <div className={`topbar-actions ${active === 'dashboard' ? 'hidden md:flex' : ''}`}>
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
              initial={{ opacity: 0, y: -20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className={`toast ${toast.tone}`}
              role="status"
              aria-live="polite"
            >
              {toast.tone === 'error' ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
              <span>{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {(loading || tabLoading) && <SkeletonPage type={active === 'dashboard' ? 'dashboard' : 'list'} />}
        {loadError && !loading && <div className="error">{loadError}</div>}

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
              <SupplierImportWorkspace
                data={data}
                api={authedFetch}
                setGlobalToast={showToast}
                onImportComplete={loadCore}
              />
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
                  <Input label="Address" className="md:col-span-2" value={forms.customer.address} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, address: v } })} />
                  <Input label="Notes" className="md:col-span-4" value={forms.customer.notes} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, notes: v } })} />
                </FormPanel>
                <FormPanel title="Record customer purchase" action={saving ? 'Saving...' : 'Add transaction'} onSubmit={() => submitSale('customers')} disabled={saving || needsSpecificShop}>
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '16px' }}>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-700">Customer</span>
                        <button
                          type="button"
                          onClick={() => setShowQuickAddCustomerModal(true)}
                          className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={12} /> Add New Customer
                        </button>
                      </div>
                      <SearchableCombobox
                        value={forms.sale.customer_id}
                        onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, customer_id: v } })}
                        options={data.customers.map((c) => [c.id, `${c.name}${c.mobile ? ` (${c.mobile})` : ''}`])}
                        placeholder="Search or select customer..."
                        searchPlaceholder="Search customer by name or phone..."
                        className="w-full"
                      />
                    </div>
                    
                    <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/30 space-y-4 relative z-30">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Items Purchased</span>
                      {(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '', color_breakdown: [] }]).map((item, idx) => {
                        const selectedProd = data.products.find((p) => String(p.id) === String(item.product_id)) 
                          || data.productResults?.find((p) => String(p.id) === String(item.product_id))
                          || data.catalog?.find((p) => String(p.id) === String(item.product_id));
                        const availableColors = getProductAvailableColors(selectedProd);
                        const colorStockMap = selectedProd?.colour_stock || {};
                        const activeBreakdown = item.color_breakdown || [];

                        return (
                          <div key={idx} className="sale-line-item bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs relative z-30 focus-within:z-40 space-y-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="flex-1 min-w-[260px]">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Item bought</label>
                                <SearchableCombobox 
                                  value={item.product_id} 
                                  onChange={(v) => updateSaleItemProduct(idx, v)} 
                                  options={salesProductOptions}
                                  placeholder="Search catalog or select item..."
                                  searchPlaceholder="Type model, brand, variant (e.g. IP 13, OLED)..."
                                  className="w-full"
                                />
                              </div>
                              <div style={{ width: '175px' }}>
                                <Select
                                  label="Price tier"
                                  placeholder={item.product_id ? 'Select tier' : 'Choose item first'}
                                  value={item.price_type || ''}
                                  onChange={(v) => updateSaleItemPriceType(idx, v)}
                                  options={sellingPriceOptions(item.product_id)}
                                  disabled={!item.product_id}
                                />
                              </div>
                              <div style={{ width: '150px' }}>
                                <Input
                                  label="Selling price (₹)"
                                  type="number"
                                  placeholder="₹ 0"
                                  value={item.selling_price !== undefined ? item.selling_price : ''}
                                  onChange={(v) => updateSaleItemSellingPrice(idx, v)}
                                  disabled={!item.product_id}
                                />
                              </div>
                              <div style={{ width: '110px' }}>
                                <Input 
                                  label="Quantity" 
                                  type="number" 
                                  min="1" 
                                  value={item.quantity} 
                                  onChange={(v) => updateSaleItemQuantity(idx, v)} 
                                  disabled={!item.product_id || activeBreakdown.length > 0}
                                  title={activeBreakdown.length > 0 ? "Quantity is calculated automatically from color breakdown below" : "Enter quantity"}
                                />
                              </div>
                              <div style={{ width: '140px' }}>
                                <Input 
                                  label="Total price (₹)" 
                                  type="number" 
                                  value={item.total_amount || ''} 
                                  readOnly 
                                  disabled 
                                />
                              </div>
                              {(forms.sale.items || []).length > 1 && (
                                <button 
                                  type="button" 
                                  className="soft !min-h-[44px] !px-3 text-red-600 hover:text-red-800 border-red-200 hover:border-red-300 cursor-pointer rounded-xl"
                                  onClick={() => removeSaleItem(idx)}
                                  title="Remove item"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>

                            {/* Dynamic Color Variant Breakdown Container */}
                            {Boolean(item.product_id) && (
                              <div className="pt-3 border-t border-slate-100 mt-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                    <Tag className="w-3.5 h-3.5 text-teal-600" />
                                    Color Variant Breakdown
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    Click color chip to allocate units
                                  </span>
                                </div>

                                {/* Color Selection Chips */}
                                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                                  {(availableColors.length > 0 
                                    ? availableColors 
                                    : (data.reference?.colours?.map(c => c.name) || ['Black', 'Gold', 'Rose Gold', 'Silver', 'Green', 'Purple'])
                                  ).map((color) => {
                                    const isSelected = activeBreakdown.some((b) => b.color === color);
                                    const colorStockQty = colorStockMap[color] !== undefined ? colorStockMap[color] : null;
                                    return (
                                      <button
                                        key={color}
                                        type="button"
                                        onClick={() => toggleSaleItemColor(idx, color)}
                                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                          isSelected
                                            ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                        }`}
                                      >
                                        <span>{color}</span>
                                        {colorStockQty !== null && (
                                          <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold ${isSelected ? 'bg-teal-700 text-teal-100' : 'bg-slate-200/80 text-slate-600'}`}>
                                            {colorStockQty} in stock
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}

                                  {/* Any Other Reference Color Dropdown */}
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        toggleSaleItemColor(idx, e.target.value);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-teal-700 border border-teal-300 cursor-pointer shadow-2xs focus:outline-hidden"
                                  >
                                    <option value="" disabled>+ Add Any Color...</option>
                                    {(data.reference?.colours || []).map((c) => (
                                      <option key={c.id || c.name} value={c.name}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Active Color Quantity Inputs Sub-Grid */}
                                {activeBreakdown.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/70">
                                    {activeBreakdown.map((b) => (
                                      <div key={b.color} className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-2xs">
                                        <span className="text-xs font-black text-slate-800 truncate">{b.color}</span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => updateSaleItemColorQuantity(idx, b.color, Math.max(1, Number(b.qty || 1) - 1))}
                                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer select-none"
                                          >
                                            -
                                          </button>
                                          <input
                                            type="number"
                                            min="1"
                                            value={b.qty}
                                            onChange={(e) => updateSaleItemColorQuantity(idx, b.color, e.target.value)}
                                            className="w-12 text-center text-xs font-black border border-slate-200 rounded px-1 py-0.5 focus:border-teal-500 focus:outline-hidden"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => updateSaleItemColorQuantity(idx, b.color, Number(b.qty || 0) + 1)}
                                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer select-none"
                                          >
                                            +
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => toggleSaleItemColor(idx, b.color)}
                                            className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer p-0.5"
                                            title="Remove this color"
                                          >
                                            <X size={13} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button 
                        type="button" 
                        className="soft !px-4 !py-2 text-xs font-bold mt-2 cursor-pointer" 
                        onClick={addSaleItem}
                      >
                        + Add Another Display/Item
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <Input
                      label="Total bill amount (₹)"
                      type="number"
                      value={forms.sale.total_amount || '0'}
                      readOnly
                      disabled
                    />
                    <div className="text-[11px] text-slate-400 px-1">
                      Calculated automatically from item line totals.
                    </div>
                  </div>
                  <Input 
                    label="Paid amount (₹)" 
                    type="number" 
                    className="md:col-span-1" 
                    value={forms.sale.paid_amount || ''} 
                    placeholder="₹ 0"
                    onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, paid_amount: v } })} 
                  />
                  <Select 
                    label="Payment mode" 
                    className="md:col-span-1" 
                    value={forms.sale.payment_mode} 
                    onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, payment_mode: v } })} 
                    options={[['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank', 'Bank transfer'], ['credit', 'Credit / pending']]} 
                  />
                  <Input 
                    label="Due date" 
                    type="date" 
                    className="md:col-span-2" 
                    value={forms.sale.due_date} 
                    onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, due_date: v } })} 
                  />
                  <BillSummary sale={forms.sale} />
                </FormPanel>
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
                </div>
                <CardGrid items={data.customers} render={(customer) => {
                  const allCustomerSales = data.sales.filter((sale) => Number(sale.customer_id) === Number(customer.id));
                  const customerSales = allCustomerSales.slice(0, 3);
                  const lastPurchase = allCustomerSales[0]?.sale_date ? String(allCustomerSales[0].sale_date).slice(0, 10) : 'No purchases';
                  return (
                    <>
                      <div className="card-icon-wrapper">
                        <Contact size={18} />
                      </div>
                      <h3>{customer.name}</h3>
                      <p>{customer.mobile}</p>
                      <div className="customer-card-metrics">
                        <span><small>Pending</small><b>{currency(customer.pending)}</b></span>
                        <span><small>Last purchase</small><b>{lastPurchase}</b></span>
                        <span><small>Total purchases</small><b>{allCustomerSales.length}</b></span>
                      </div>
                      <div className="metrics"><span>{customer.address || 'No address'}</span><span className={`status-badge ${Number(customer.pending) > 0 ? 'pending' : 'paid'}`}>{currency(customer.pending)}</span></div>
                      <div className="mini-list">
                        {customerSales.map((sale) => (
                          <div key={sale.id}>
                            <span title={sale.product_name}>{productName(sale)} x {sale.quantity}</span>
                            <strong>{currency(sale.pending_amount)}</strong>
                          </div>
                        ))}
                        {!customerSales.length && <small>No purchases yet</small>}
                      </div>
                      {customerSales.length > 0 && (
                        <button className="soft" type="button" onClick={() => printCustomerInvoicePDF({ ...customer, customer_id: customer.id, shop_id: shopId })}>
                          <ReceiptText size={16} /> Complete invoice
                        </button>
                      )}
                    </>
                  );
                }} />
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
                <FormPanel title={data.shops.find((location) => String(location.id) === String(shopId))?.location_type === 'warehouse' ? 'Create Warehouse sale' : 'Create sale'} action="Create sale" onSubmit={() => submitSale('sales')} disabled={saving || needsSpecificShop}>
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '16px' }}>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-700">Customer</span>
                        <button
                          type="button"
                          onClick={() => setShowQuickAddCustomerModal(true)}
                          className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={12} /> Add New Customer
                        </button>
                      </div>
                      <SearchableCombobox
                        value={forms.sale.customer_id}
                        onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, customer_id: v } })}
                        options={data.customers.map((c) => [c.id, `${c.name}${c.mobile ? ` (${c.mobile})` : ''}`])}
                        placeholder="Search or select customer..."
                        searchPlaceholder="Search customer by name or phone..."
                        className="w-full"
                      />
                    </div>
                    
                    <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/30 space-y-4 relative z-30">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Items Purchased</span>
                      {(forms.sale.items || [{ product_id: '', selling_price: '', price_type: 'retail', quantity: 1, total_amount: '', color_breakdown: [] }]).map((item, idx) => {
                        const selectedProd = data.products.find((p) => String(p.id) === String(item.product_id)) 
                          || data.productResults?.find((p) => String(p.id) === String(item.product_id))
                          || data.catalog?.find((p) => String(p.id) === String(item.product_id));
                        const availableColors = getProductAvailableColors(selectedProd);
                        const colorStockMap = selectedProd?.colour_stock || {};
                        const activeBreakdown = item.color_breakdown || [];

                        return (
                          <div key={idx} className="sale-line-item bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs relative z-30 focus-within:z-40 space-y-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="flex-1 min-w-[260px]">
                                <label className="block text-xs font-bold text-slate-700 mb-1">Item bought</label>
                                <SearchableCombobox 
                                  value={item.product_id} 
                                  onChange={(v) => updateSaleItemProduct(idx, v)} 
                                  options={salesProductOptions}
                                  placeholder="Search catalog or select item..."
                                  searchPlaceholder="Type model, brand, variant (e.g. IP 13, OLED)..."
                                  className="w-full"
                                />
                              </div>
                              <div style={{ width: '175px' }}>
                                <Select
                                  label="Price tier"
                                  placeholder={item.product_id ? 'Select tier' : 'Choose item first'}
                                  value={item.price_type || ''}
                                  onChange={(v) => updateSaleItemPriceType(idx, v)}
                                  options={sellingPriceOptions(item.product_id)}
                                  disabled={!item.product_id}
                                />
                              </div>
                              <div style={{ width: '150px' }}>
                                <Input
                                  label="Selling price (₹)"
                                  type="number"
                                  placeholder="₹ 0"
                                  value={item.selling_price !== undefined ? item.selling_price : ''}
                                  onChange={(v) => updateSaleItemSellingPrice(idx, v)}
                                  disabled={!item.product_id}
                                />
                              </div>
                              <div style={{ width: '110px' }}>
                                <Input 
                                  label="Quantity" 
                                  type="number" 
                                  min="1" 
                                  value={item.quantity} 
                                  onChange={(v) => updateSaleItemQuantity(idx, v)} 
                                  disabled={!item.product_id || activeBreakdown.length > 0}
                                  title={activeBreakdown.length > 0 ? "Quantity is calculated automatically from color breakdown below" : "Enter quantity"}
                                />
                              </div>
                              <div style={{ width: '140px' }}>
                                <Input 
                                  label="Total price (₹)" 
                                  type="number" 
                                  value={item.total_amount || ''} 
                                  readOnly 
                                  disabled 
                                />
                              </div>
                              {(forms.sale.items || []).length > 1 && (
                                <button 
                                  type="button" 
                                  className="soft !min-h-[44px] !px-3 text-red-600 hover:text-red-800 border-red-200 hover:border-red-300 cursor-pointer rounded-xl"
                                  onClick={() => removeSaleItem(idx)}
                                  title="Remove item"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>

                            {/* Dynamic Color Variant Breakdown Container */}
                            {Boolean(item.product_id) && (
                              <div className="pt-3 border-t border-slate-100 mt-2">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                                    <Tag className="w-3.5 h-3.5 text-teal-600" />
                                    Color Variant Breakdown
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    Click color chip to allocate units
                                  </span>
                                </div>

                                {/* Color Selection Chips */}
                                <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                                  {(availableColors.length > 0 
                                    ? availableColors 
                                    : (data.reference?.colours?.map(c => c.name) || ['Black', 'Gold', 'Rose Gold', 'Silver', 'Green', 'Purple'])
                                  ).map((color) => {
                                    const isSelected = activeBreakdown.some((b) => b.color === color);
                                    const colorStockQty = colorStockMap[color] !== undefined ? colorStockMap[color] : null;
                                    return (
                                      <button
                                        key={color}
                                        type="button"
                                        onClick={() => toggleSaleItemColor(idx, color)}
                                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                                          isSelected
                                            ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                        }`}
                                      >
                                        <span>{color}</span>
                                        {colorStockQty !== null && (
                                          <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-extrabold ${isSelected ? 'bg-teal-700 text-teal-100' : 'bg-slate-200/80 text-slate-600'}`}>
                                            {colorStockQty} in stock
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}

                                  {/* Any Other Reference Color Dropdown */}
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        toggleSaleItemColor(idx, e.target.value);
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-teal-700 border border-teal-300 cursor-pointer shadow-2xs focus:outline-hidden"
                                  >
                                    <option value="" disabled>+ Add Any Color...</option>
                                    {(data.reference?.colours || []).map((c) => (
                                      <option key={c.id || c.name} value={c.name}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Active Color Quantity Inputs Sub-Grid */}
                                {activeBreakdown.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/70">
                                    {activeBreakdown.map((b) => (
                                      <div key={b.color} className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-2xs">
                                        <span className="text-xs font-black text-slate-800 truncate">{b.color}</span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => updateSaleItemColorQuantity(idx, b.color, Math.max(1, Number(b.qty || 1) - 1))}
                                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer select-none"
                                          >
                                            -
                                          </button>
                                          <input
                                            type="number"
                                            min="1"
                                            value={b.qty}
                                            onChange={(e) => updateSaleItemColorQuantity(idx, b.color, e.target.value)}
                                            className="w-12 text-center text-xs font-black border border-slate-200 rounded px-1 py-0.5 focus:border-teal-500 focus:outline-hidden"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => updateSaleItemColorQuantity(idx, b.color, Number(b.qty || 0) + 1)}
                                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer select-none"
                                          >
                                            +
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => toggleSaleItemColor(idx, b.color)}
                                            className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer p-0.5"
                                            title="Remove this color"
                                          >
                                            <X size={13} />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button 
                        type="button" 
                        className="soft !px-4 !py-2 text-xs font-bold mt-2 cursor-pointer" 
                        onClick={addSaleItem}
                      >
                        + Add Another Display/Item
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <Input
                      label="Total bill amount (₹)"
                      type="number"
                      value={forms.sale.total_amount || '0'}
                      readOnly
                      disabled
                    />
                    <div className="text-[11px] text-slate-400 px-1">
                      Calculated automatically from item line totals.
                    </div>
                  </div>
                  <Input 
                    label="Paid amount (₹)" 
                    type="number" 
                    className="md:col-span-1" 
                    value={forms.sale.paid_amount || ''} 
                    placeholder="₹ 0"
                    onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, paid_amount: v } })} 
                  />
                  <Select 
                    label="Payment mode" 
                    className="md:col-span-1" 
                    value={forms.sale.payment_mode} 
                    onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, payment_mode: v } })} 
                    options={[['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank', 'Bank transfer'], ['credit', 'Credit / pending']]} 
                  />
                  <Input 
                    label="Due date" 
                    type="date" 
                    className="md:col-span-2" 
                    value={forms.sale.due_date} 
                    onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, due_date: v } })} 
                  />
                  <BillSummary sale={forms.sale} />
                </FormPanel>
                <div className="catalog-toolbar panel sales-toolbar">
                  <div className="searchbox"><Search size={18} /><input placeholder="Filter by customer, model, category, shop, or payment mode" value={salesFilters.search} onChange={(event) => setSalesFilters({ ...salesFilters, search: event.target.value })} /></div>
                  <input type="date" value={salesFilters.date} onChange={(event) => setSalesFilters({ ...salesFilters, date: event.target.value })} />
                  {role === 'superadmin' && <span className="status-badge">All-location history</span>}
                  {pageLoading.sales && <span className="status-badge due">Loading</span>}
                  <span className="status-badge stock-ok">{salesPager.loaded ? salesPager.total.toLocaleString('en-IN') : visibleSales.length} sales</span>
                </div>
                {visibleSales.length ? (
                  <motion.div 
                    variants={listVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10px" }}
                    className="table panel"
                  >
                    {visibleSales.map((sale) => (
                      <motion.div variants={itemVariants} className="row" key={sale.id}>
                        <span><b>{sale.customer_name}</b><small title={sale.product_name}>{productName(sale)} · {sale.shop_name} · {sale.price_type || 'retail'} · {sale.payment_mode || 'cash'}</small></span>
                        <span>{currency(sale.total_amount)}</span>
                        <span>{currency(sale.paid_amount)}</span>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <strong className={`status-badge ${sale.pending_amount > 0 ? 'pending' : 'paid'}`}>{currency(sale.pending_amount)}</strong>
                          <span className="sale-row-actions">
                            <button className="soft" type="button" onClick={() => printTaxInvoicePDF(sale)}><ReceiptText size={16} /> Invoice</button>
                            {(role === 'superadmin' || Number(sale.created_by) === Number(session?.id)) && (
                              <button className="soft sale-delete-action" type="button" onClick={() => deleteSale(sale)}><Trash2 size={16} /> Delete</button>
                            )}
                          </span>
                        </span>
                      </motion.div>
                    ))}
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
                />
              ) : (
                <BranchOrderStockPage
                  authedFetch={authedFetch}
                  showToast={showToast}
                  currentShop={shopId}
                  shops={data.shops}
                  reference={data.reference}
                />
              )}
            </PageWrapper>
          )}

          {active === 'payments' && (
            <PageWrapper activeKey="payments" key="payments">
              <section className="space">
                <div className="catalog-toolbar panel sales-toolbar">
                  <div className="searchbox">
                    <Search size={18} />
                    <input
                      placeholder="Search customer, mobile, model, brand, or shop"
                      value={pendingFilters.search}
                      onChange={(event) => setPendingFilters({ ...pendingFilters, search: event.target.value })}
                    />
                  </div>
                  <input type="date" value={pendingFilters.date} onChange={(event) => setPendingFilters({ ...pendingFilters, date: event.target.value })} />
                  {pageLoading.pending && <span className="status-badge due">Loading</span>}
                  <span className="status-badge stock-ok">{pendingPager.loaded ? pendingPager.total.toLocaleString('en-IN') : data.pending.length} pending</span>
                </div>
                <motion.div 
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  className="payment-list"
                >
                  {data.pending.map((item) => (
                    <motion.article 
                      variants={itemVariants}
                      className={`panel payment-card ${expandedPaymentId === String(item.id) ? 'expanded' : ''}`} 
                      key={item.id}
                    >
                      <div>
                        <h3>{item.customer_name}</h3>
                        <p>{item.items?.length || 1} pending purchase{(item.items?.length || 1) === 1 ? '' : 's'} · {item.shop_name}</p>
                      </div>
                      <strong>{currency(item.pending_amount)}</strong>
                      <span className="status-badge due">Due {item.due_date || 'not set'}</span>
                      <input placeholder="Payment amount" type="number" value={forms.payment.sale_id === String(item.id) ? forms.payment.amount : ''} onChange={(e) => setForms({ ...forms, payment: { ...forms.payment, sale_id: String(item.id), amount: e.target.value } })} />
                      <div className="actions">
                        <button className="soft" type="button" onClick={() => printCustomerInvoicePDF(item)}><ReceiptText size={17} /> Invoice</button>
                        <button className="soft" type="button" onClick={() => setExpandedPaymentId(expandedPaymentId === String(item.id) ? '' : String(item.id))}><ReceiptText size={17} /> Ledger</button>
                        <a className="soft" href={whatsappLink(item)} target="_blank" rel="noreferrer"><Send size={17} /> WhatsApp</a>
                        <button className="primary" onClick={() => recordPayment(item)}><CreditCard size={17} /> Paid</button>
                      </div>
                      <div className="ledger-panel" aria-hidden={expandedPaymentId !== String(item.id)}>
                        <div className="ledger-summary">
                          <span><b>Sold</b><strong>{currency(item.total_amount)}</strong></span>
                          <span><b>Paid</b><strong>{currency(item.paid_amount)}</strong></span>
                          <span><b>Pending</b><strong>{currency(item.pending_amount)}</strong></span>
                        </div>
                        <div className="ledger-items">
                          {(item.items || [item]).map((sale) => (
                            <div className="ledger-item" key={sale.id}>
                              <span>
                                <b 
                                  title="Click to view details" 
                                  className="cursor-pointer hover:text-teal transition-colors"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => {
                                    const prod = data.products.find(p => Number(p.id) === Number(sale.product_id));
                                    setSelectedProductDetails(prod || { ...sale, id: sale.product_id, name: sale.product_name });
                                  }}
                                >
                                  {productName(sale)}
                                </b>
                                <small>{sale.quantity || 1} pcs · Purchased {sale.sale_date || 'date not set'} · Due {sale.due_date || 'not set'}</small>
                              </span>
                              <div className="flex items-center gap-2">
                                <strong>{currency(sale.pending_amount)}</strong>
                                <button
                                  type="button"
                                  className="soft !text-rose-600 hover:!bg-rose-50 p-1.5 rounded-lg transition-all"
                                  title="Delete this sale and restore stock"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteSale(sale);
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.article>
                  ))}
                  {!data.pending.length && <Empty title="No pending payments" />}
                </motion.div>
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
            </div>
          </div>
        )}
        <ConfirmationDialog
          dialog={confirmDialog}
          saving={saving}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={runConfirmedAction}
        />

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
                      <Users size={20} />
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900">Add New Customer</h3>
                  </div>
                  <button type="button" onClick={() => setShowQuickAddCustomerModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
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
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">Notes</label>
                    <input
                      type="text"
                      placeholder="Optional notes"
                      value={quickCustomerForm.notes}
                      onChange={(e) => setQuickCustomerForm({ ...quickCustomerForm, notes: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 outline-none focus:border-teal-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickAddCustomerModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingQuickCustomer}
                      className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
                    >
                      <Plus size={14} /> {savingQuickCustomer ? 'Creating...' : 'Create & Select Customer'}
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
