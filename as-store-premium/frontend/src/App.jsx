import React, { useDeferredValue, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronRight,
  Contact,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  ListFilter,
  IndianRupee,
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
  Store,
  Sun,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const productionApiBase = configuredApiBase?.startsWith('http')
  ? configuredApiBase
  : 'https://pinkysales.onrender.com/api';
const API_BASE = (
  import.meta.env.PROD
    ? productionApiBase
    : configuredApiBase || 'http://localhost:5000/api'
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
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong.', response.status);
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
const productName = (item) => compactModelName(item?.short_name || item?.product_short_name || item?.display_name || item?.name || item?.product_name || item?.model_name);
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
});
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
  return [...combined.values()].filter((item) => Number(item.quantity) <= Number(item.low_stock_threshold || 0));
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
        batch_count: Number(item.batch_count || 0),
        product_ids: [String(item.product_id)],
      });
      return;
    }
    existing.quantity += Number(item.quantity || 0);
    existing.batch_count += Number(item.batch_count || 0);
    existing.product_ids.push(String(item.product_id));
  });
  return [...combined.values()];
};
const sumBatchQuantity = (batches = []) => batches.reduce((sum, batch) => sum + Number(batch.quantity_remaining || 0), 0);
const batchBelongsToStockItem = (batch, item) => (
  item.product_ids.includes(String(batch.product_id))
  && (!item.shop_id || String(batch.shop_id) === String(item.shop_id))
);
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
    ['shops', 'Shops', Building2],
    ['shopkeepers', 'Shopkeepers', UserCog],
    ['prices', 'Prices', IndianRupee],
    ['models', 'Models', Smartphone],
    ['stock', 'Stock', Package],
    ['stock-categories', 'Stock Categories', LayoutGrid],
    ['customers', 'Customers', Users],
    ['requests', 'Requests', Send],
    ['payments', 'Pending', CreditCard],
    ['reports', 'Reports', FileText],
  ],
  shopkeeper: [
    ['dashboard', 'Dashboard', BarChart3],
    ['stock', 'Stock', Package],
    ['stock-categories', 'Stock Categories', LayoutGrid],
    ['customers', 'Customers', Users],
    ['requests', 'Requests', Send],
    ['sales', 'Create Sale', ReceiptText],
    ['payments', 'Pending', CreditCard],
    ['prices', 'Price List', IndianRupee],
    ['models', 'Models', Smartphone],
    ['reports', 'Reports', FileText],
  ],
  customer: [
    ['catalog', 'Catalog', ShoppingBag],
    ['models', 'Models', Smartphone],
  ],
};
navByRole.admin = navByRole.shopkeeper;
navByRole.user = navByRole.customer;

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
    short_name: '', full_model_list: '', brand: '', category: 'Display',
    official_price: '', purchase_price: '', sale_price: '', wholesale_price: '', retail_price: '',
    opening_stock: '', description: '', colours: '',
  },
  stock: { product_id: '', quantity: '' },
  batch: {
    product_id: '', quantity: '', purchase_price: '', wholesale_price: '', official_price: '',
    retail_price: '', colour: '', received_date: new Date().toISOString().slice(0, 10),
    assigned_user_id: '', notes: '',
  },
  customer: { name: '', mobile: '', address: '', notes: '' },
  sale: { product_id: '', customer_id: '', quantity: 1, total_amount: '', paid_amount: '', due_date: '2026-06-15', notes: '', items: [{ product_id: '', batch_id: '', quantity: 1, total_amount: '' }] },
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
      <motion.path
        d={pathString}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
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
        r="2.6" 
        fill="currentColor"
        stroke="#ffffff"
        strokeWidth="2"
      />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, tone = 'blue', trend, sparklineTone }) {
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
      </div>
      {trend && <Sparkline data={trend} tone={sparklineTone || tone} />}
    </motion.div>
  );
}

function Empty({ title }) {
  return <div className="empty"><Package size={18} /> {title}</div>;
}

function SkeletonPage({ type = 'list' }) {
  const rows = type === 'dashboard' ? 4 : 6;
  return (
    <section className={`skeleton-page ${type === 'dashboard' ? 'dashboard-skeleton' : ''}`} aria-hidden="true">
      {type === 'dashboard' && (
        <div className="skeleton-stats">
          {[0, 1, 2, 3].map((item) => <div className="skeleton-card" key={item} />)}
        </div>
      )}
      <div className="skeleton-panel">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="skeleton-row" key={index}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </section>
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
            <h1>AS Store</h1>
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
  const [active, setActive] = useState(session?.role === 'customer' ? 'catalog' : 'dashboard');
  const [open, setOpen] = useState(false);
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
    stock: [],
    batches: [],
    customers: [],
    sales: [],
    requests: [],
    pending: [],
    reports: null,
    catalog: [],
    reference: { categories: [], colours: [], brands: [] },
    priceVisibility: {
      show_official_price_shopkeeper: true,
      show_wholesale_price_shopkeeper: false,
      show_purchase_price_shopkeeper: false,
    },
  });
  const [selectedShop, setSelectedShop] = useState('');
  const [forms, setForms] = useState(initialForms);
  const [catalogFilters, setCatalogFilters] = useState({ search: '', brand: '', category: '', colour: '', shopId: '', min: '', max: '' });
  const [stockFilters, setStockFilters] = useState({ search: '', brand: '', category: '', colour: '', status: '', batch: '', shopkeeperId: '', ownership: '' });
  const [shopkeeperStockSearch, setShopkeeperStockSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [stockCategoryPage, setStockCategoryPage] = useState(null);
  const [categoryFiltersOpen, setCategoryFiltersOpen] = useState(false);
  const [newReference, setNewReference] = useState({ type: '', name: '' });
  const [modelSearch, setModelSearch] = useState('');
  const [transferDrawerOpen, setTransferDrawerOpen] = useState(false);
  const [expandedPaymentId, setExpandedPaymentId] = useState('');
  const [editingProductId, setEditingProductId] = useState('');
  const deferredCatalogFilters = useDeferredValue(catalogFilters);

  // Reset to Light Mode on mount
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
  }, []);

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
          setActive('dashboard');
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
  const needsSpecificShop = role === 'superadmin' && !shopId;
  const shopCountDependency = ['stock', 'stock-categories'].includes(active) ? data.shops.length : 0;

  const authedFetch = (path, options = {}) => api(path, options, token);
  const showToast = (message, tone = inferToastTone(message)) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
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

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);
  const requireShopSelection = (message = 'Select a specific shop first') => {
    if (role === 'superadmin' && !shopId) {
      showToast(message);
      return false;
    }
    return true;
  };
  const openStockCategoriesHub = () => {
    setStockCategoryPage(null);
    setCategoryFiltersOpen(false);
    setStockFilters({ search: '', brand: '', category: '', colour: '', status: '', batch: '', shopkeeperId: '', ownership: '' });
    setActive('stock-categories');
  };
  const openStockCategoryPage = (categoryName = '') => {
    setCategoryFiltersOpen(false);
    setStockFilters({ search: '', brand: '', category: categoryName, colour: '', status: '', batch: '', shopkeeperId: '', ownership: '' });
    setStockCategoryPage(categoryName || '__all__');
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
      if (role === 'customer') {
        [shops, products, reference] = await Promise.all([
          authedFetch('/shops'),
          api('/catalog'),
          api('/reference-data'),
        ]);
        priceVisibility = data.priceVisibility;
      } else {
        ({ shops, products, reference, priceVisibility } = await authedFetch('/bootstrap'));
      }
      setData((prev) => ({
        ...prev,
        shops,
        products,
        reference: cleanReferenceData(reference),
        priceVisibility,
        catalog: role === 'customer' ? products : prev.catalog,
      }));
    } catch (error) {
      handleLoadError(error, 'Unable to load the workspace. Check whether the local servers are running.');
    } finally {
      setLoading(false);
    }
  };

  const loadTab = async (tab = active, currentShop = shopId) => {
    if (!session) return;
    if ((tab === 'shops' && data.shops.length) || (['prices', 'models'].includes(tab) && role !== 'customer' && data.products.length)) {
      tabLoadSequenceRef.current += 1;
      setTabLoading(false);
      return;
    }
    const requestId = ++tabLoadSequenceRef.current;
    setTabLoading(true);
    try {
      setLoadError('');
      const scoped = currentShop ? `?shopId=${currentShop}` : '';
      const set = (key, value) => setData((prev) => ({ ...prev, [key]: value }));
      if (tab === 'dashboard') set('dashboard', await authedFetch(`/dashboard${scoped}`));
      if (tab === 'shops') set('shops', await authedFetch('/shops'));
      if (tab === 'shopkeepers') set('shopkeepers', await authedFetch('/shopkeepers'));
      if (tab === 'prices') set('products', await authedFetch('/products'));
      if (tab === 'models') {
        if (role === 'customer') set('catalog', await api('/catalog'));
        else set('products', await authedFetch('/products'));
      }
      if (tab === 'stock' || tab === 'stock-categories') {
        const targetShopIds = currentShop
          ? [currentShop]
          : role === 'superadmin'
            ? data.shops.map((shop) => shop.id)
            : [];
        const [stockGroups, batchGroups, shopkeepers] = await Promise.all([
          Promise.all(targetShopIds.map((id) => authedFetch(`/stock?shopId=${id}`))),
          Promise.all(targetShopIds.map((id) => authedFetch(`/inventory-batches?shopId=${id}`))),
          role === 'superadmin' ? authedFetch('/shopkeepers') : Promise.resolve(data.shopkeepers),
        ]);
        setData((prev) => ({ ...prev, stock: stockGroups.flat(), batches: batchGroups.flat(), shopkeepers }));
      }
      if (tab === 'customers' && currentShop) {
        const [stock, batches, customers, sales] = await Promise.all([
          authedFetch(`/stock?shopId=${currentShop}`),
          authedFetch(`/inventory-batches?shopId=${currentShop}`),
          authedFetch(`/customers?shopId=${currentShop}`),
          authedFetch(`/sales?shopId=${currentShop}`),
        ]);
        setData((prev) => ({ ...prev, stock, batches, customers, sales }));
      }
      if (tab === 'sales' && currentShop) {
        const [stock, batches, customers, sales] = await Promise.all([
          authedFetch(`/stock?shopId=${currentShop}`),
          authedFetch(`/inventory-batches?shopId=${currentShop}`),
          authedFetch(`/customers?shopId=${currentShop}`),
          authedFetch(`/sales?shopId=${currentShop}`),
        ]);
        setData((prev) => ({ ...prev, stock, batches, customers, sales }));
      }
      if (tab === 'requests') set('requests', await authedFetch(`/stock-requests${scoped}`));
      if (tab === 'payments') set('pending', groupPendingPayments(await authedFetch(`/pending-payments${scoped}`)));
      if (tab === 'reports') set('reports', await authedFetch(`/reports${scoped}`));
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
      const [stock, customers, sales, pending, reports] = await Promise.all([
        authedFetch(`/stock?shopId=${shop.id}`),
        authedFetch(`/customers?shopId=${shop.id}`),
        authedFetch(`/sales?shopId=${shop.id}`),
        authedFetch(`/pending-payments?shopId=${shop.id}`),
        authedFetch(`/reports?shopId=${shop.id}`),
      ]);
      setDetailedShopData({
        loading: false,
        stock,
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
    const totalValue = detailedShopData.stock.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.official_price || 0)), 0);
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

  const login = (nextSession) => {
    const normalizedSession = normalizeSession(nextSession);
    localStorage.setItem('session', JSON.stringify(normalizedSession));
    setSession(normalizedSession);
    setAuthReady(true);
    setActive(normalizedSession.role === 'customer' ? 'catalog' : 'dashboard');
  };

  const logout = () => {
    localStorage.removeItem('session');
    setSession(null);
    setAuthReady(true);
    setSelectedShop('');
    setActive('dashboard');
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

  const updateStock = async () => {
    if (!requireShopSelection('Select a shop before updating stock')) return;
    try {
      setSaving(true);
      await authedFetch('/stock', { method: 'PUT', body: JSON.stringify({ ...forms.stock, shop_id: shopId }) });
      setForms((prev) => ({ ...prev, stock: initialForms.stock }));
      showToast(role === 'shopkeeper' ? 'Your stock quantity was updated' : 'Stock updated');
      await loadTab('stock', shopId);
    } catch (error) {
      showToast(error.message || 'Unable to update stock right now');
    } finally {
      setSaving(false);
    }
  };

  const addInventoryBatch = async () => {
    if (!requireShopSelection('Select a shop before adding an inventory batch')) return;
    try {
      setSaving(true);
      await authedFetch('/inventory-batches', {
        method: 'POST',
        body: JSON.stringify({ ...forms.batch, shop_id: shopId }),
      });
      setForms((prev) => ({ ...prev, batch: initialForms.batch }));
      showToast('Price batch added and stock updated');
      await loadTab('stock', shopId);
    } catch (error) {
      showToast(error.message || 'Unable to add inventory batch');
    } finally {
      setSaving(false);
    }
  };

  const addReferenceOption = async (type, name) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) return showToast(`Enter a new ${type.replace(/s$/, '')} name`);
    try {
      setSaving(true);
      await authedFetch(`/reference-data/${type}`, { method: 'POST', body: JSON.stringify({ name: cleanName }) });
      const reference = await api('/reference-data');
      setData((prev) => ({ ...prev, reference: cleanReferenceData(reference) }));
      setNewReference({ type: '', name: '' });
      showToast(`${cleanName} added`);
    } catch (error) {
      showToast(error.message || `Unable to add ${type.replace(/s$/, '')}`);
    } finally {
      setSaving(false);
    }
  };

  const downloadCsv = (fileName, rows) => {
    const escapeCsvValue = (value) => {
      const normalized = Array.isArray(value)
        ? value.join(', ')
        : value && typeof value === 'object'
          ? JSON.stringify(value)
          : value ?? '';
      const stringValue = String(normalized);
      return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
    };

    const csvContent = rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportCsv = async (type = 'stock', filters = {}) => {
    try {
      setSaving(true);
      const params = new URLSearchParams({ type, ...(shopId ? { shopId } : {}), ...filters });
      const rows = await authedFetch(`/export-data?${params.toString()}`);
      if (!rows.length) return showToast('No matching data to export');

      let columnsMapping = [];
      if (type === 'products') {
        columnsMapping = [
          { label: 'Product Name', key: 'short_name' },
          { label: 'Model Name', key: 'full_model_list' },
          { label: 'Brand', key: 'brand' },
          { label: 'Category', key: 'category' },
          { label: 'Colour', key: 'colours' },
          { label: 'Purchase Price', key: 'purchase_price' },
          { label: 'Wholesale Price', key: 'wholesale_price' },
          { label: 'Official Price', key: 'official_price' },
          { label: 'Retail Price', key: 'retail_price' }
        ];
      } else {
        columnsMapping = [
          { label: 'Product Name', key: 'product_name' },
          { label: 'Model Name', key: 'model_name' },
          { label: 'Brand', key: 'brand' },
          { label: 'Category', key: 'category' },
          { label: 'Colour', key: 'colour' },
          { label: 'Purchase Price', key: 'purchase_price' },
          { label: 'Wholesale Price', key: 'wholesale_price' },
          { label: 'Official/Retail Price', key: 'retail_price' },
          { label: 'Quantity', key: 'quantity' },
          { label: 'Shopkeeper Name', key: 'shopkeeper_name' },
          { label: 'Date Added', key: 'date_added' },
          { label: 'Stock Status', key: 'stock_status' }
        ];
      }

      const sampleRow = rows[0];
      const activeColumns = columnsMapping.filter((col) => {
        if (col.key === 'retail_price' && sampleRow.retail_price === undefined) {
          if (sampleRow.official_price !== undefined) {
            col.key = 'official_price';
            return true;
          }
          return false;
        }
        return sampleRow[col.key] !== undefined;
      });

      const csvRows = [
        activeColumns.map((col) => col.label),
        ...rows.map((row) => activeColumns.map((col) => row[col.key] ?? '')),
      ];

      downloadCsv(`as-store-${type}-${new Date().toISOString().slice(0, 10)}.csv`, csvRows);
      showToast('CSV export created');
    } catch (error) {
      showToast(error.message || 'Unable to export CSV file');
    } finally {
      setSaving(false);
    }
  };

  const salePriceFor = (productId) => {
    const stockItem = data.stock.find((item) => String(item.product_id) === String(productId));
    const product = data.products.find((item) => String(item.id) === String(productId));
    return Number(stockItem?.sale_price || product?.sale_price || stockItem?.retail_price || product?.retail_price || stockItem?.official_price || product?.official_price || 0);
  };

  const updateSaleItemProduct = (index, productId) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', batch_id: '', quantity: 1, total_amount: '' }])];
    const qty = Math.max(Number(currentItems[index]?.quantity || 1), 1);
    const price = salePriceFor(productId);
    
    currentItems[index] = {
      product_id: productId,
      batch_id: '',
      quantity: qty,
      total_amount: price ? String(price * qty) : (currentItems[index]?.total_amount || ''),
    };

    const totalSum = currentItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

    setForms({
      ...forms,
      sale: {
        ...forms.sale,
        product_id: currentItems[0]?.product_id || '',
        quantity: currentItems[0]?.quantity || 1,
        total_amount: String(totalSum),
        items: currentItems,
      },
    });
  };

  const updateSaleItemBatch = (index, batchId) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', batch_id: '', quantity: 1, total_amount: '' }])];
    currentItems[index] = { ...currentItems[index], batch_id: batchId };
    setForms({ ...forms, sale: { ...forms.sale, items: currentItems } });
  };

  const updateSaleItemQuantity = (index, quantity) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', batch_id: '', quantity: 1, total_amount: '' }])];
    const numericQuantity = Math.max(Number(quantity || 0), 0);
    const price = salePriceFor(currentItems[index]?.product_id);

    currentItems[index] = {
      ...currentItems[index],
      quantity,
      total_amount: price && numericQuantity ? String(price * numericQuantity) : (currentItems[index]?.total_amount || ''),
    };

    const totalSum = currentItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

    setForms({
      ...forms,
      sale: {
        ...forms.sale,
        quantity: currentItems[0]?.quantity || 1,
        total_amount: String(totalSum),
        items: currentItems,
      },
    });
  };

  const updateSaleItemPrice = (index, priceVal) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', batch_id: '', quantity: 1, total_amount: '' }])];
    currentItems[index] = {
      ...currentItems[index],
      total_amount: priceVal,
    };
    const totalSum = currentItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    setForms({
      ...forms,
      sale: {
        ...forms.sale,
        total_amount: String(totalSum),
        items: currentItems,
      },
    });
  };

  const addSaleItem = () => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', batch_id: '', quantity: 1, total_amount: '' }])];
    currentItems.push({ product_id: '', batch_id: '', quantity: 1, total_amount: '' });
    setForms({
      ...forms,
      sale: {
        ...forms.sale,
        items: currentItems,
      },
    });
  };

  const removeSaleItem = (index) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', quantity: 1, total_amount: '' }])];
    if (currentItems.length <= 1) return;
    currentItems.splice(index, 1);
    const totalSum = currentItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    setForms({
      ...forms,
      sale: {
        ...forms.sale,
        product_id: currentItems[0]?.product_id || '',
        quantity: currentItems[0]?.quantity || 1,
        total_amount: String(totalSum),
        items: currentItems,
      },
    });
  };

  const submitSale = async (reloadTab = active) => {
    if (!requireShopSelection('Select a shop before creating a sale')) return;
    
    const customerId = forms.sale.customer_id;
    const dueDate = forms.sale.due_date;
    const notes = forms.sale.notes;
    const items = forms.sale.items || [{ product_id: forms.sale.product_id, quantity: Number(forms.sale.quantity), total_amount: Number(forms.sale.total_amount) }];
    
    if (!customerId || !items.length || items.some(i => !i.product_id || !i.quantity || i.quantity <= 0 || !i.total_amount)) {
      return showToast('Choose customer, items, quantities, and prices');
    }

    try {
      setSaving(true);
      let remainingPaid = Number(forms.sale.paid_amount || 0);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemTotal = Number(item.total_amount);
        const itemPaid = Math.min(remainingPaid, itemTotal);
        remainingPaid -= itemPaid;

        await authedFetch('/sales', {
          method: 'POST',
          body: JSON.stringify({
            shop_id: shopId,
            product_id: item.product_id,
            batch_id: item.batch_id || null,
            customer_id: customerId,
            quantity: item.quantity,
            total_amount: String(itemTotal),
            paid_amount: String(itemPaid),
            due_date: dueDate,
            notes: notes,
          }),
        });
      }

      setForms((prev) => ({
        ...prev,
        sale: {
          ...initialForms.sale,
          items: [{ product_id: '', batch_id: '', quantity: 1, total_amount: '' }],
        },
      }));
      showToast('Sales created, stock reduced, pending updated');
      await loadTab(reloadTab, shopId);
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

  const submitProduct = async () => {
    const openingStock = forms.product.opening_stock === '' ? 0 : Number(forms.product.opening_stock);
    const numericPrice = (value) => value === '' ? null : Number(value);
    const payload = {
      short_name: forms.product.short_name.trim(),
      full_model_list: forms.product.full_model_list.trim(),
      name: forms.product.full_model_list.trim(),
      brand: forms.product.brand.trim(),
      category: forms.product.category.trim(),
      official_price: numericPrice(forms.product.official_price),
      purchase_price: numericPrice(forms.product.purchase_price),
      sale_price: numericPrice(forms.product.sale_price),
      wholesale_price: numericPrice(forms.product.wholesale_price),
      retail_price: numericPrice(forms.product.retail_price),
      description: forms.product.description.trim(),
      colours: forms.product.colours.split(',').map((colour) => colour.trim()).filter(Boolean),
    };

    if (!payload.short_name || !payload.full_model_list || !payload.brand || !payload.category || !Number.isFinite(payload.official_price) || payload.official_price <= 0) {
      return showToast('Enter short name, compatible models, brand, category, and a valid official price');
    }
    const optionalPrices = [payload.purchase_price, payload.sale_price, payload.wholesale_price, payload.retail_price].filter((price) => price !== null);
    if (optionalPrices.some((price) => !Number.isFinite(price) || price < 0)) return showToast('All entered prices must be 0 or more');
    if (!Number.isInteger(openingStock) || openingStock < 0) {
      return showToast('Opening stock must be 0 or more');
    }
    if (openingStock > 0 && !requireShopSelection('Select a shop before adding opening stock')) {
      return;
    }

    try {
      setSaving(true);
      const created = editingProductId
        ? await authedFetch(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await authedFetch('/products', { method: 'POST', body: JSON.stringify(payload) });
      if (!editingProductId && openingStock > 0) {
        await authedFetch('/stock', {
          method: 'PUT',
          body: JSON.stringify({ shop_id: shopId, product_id: created.id, quantity: openingStock }),
        });
      }
      setForms((prev) => ({ ...prev, product: initialForms.product }));
      setEditingProductId('');
      showToast(editingProductId ? 'Product prices and details updated' : openingStock > 0 ? 'Product added with opening stock' : 'Product price added');
      await loadCore();
    } catch (error) {
      showToast(error.message || 'Unable to add product right now');
    } finally {
      setSaving(false);
    }
  };

  const editProduct = (product) => {
    setEditingProductId(String(product.id));
    setForms((prev) => ({
      ...prev,
      product: {
        short_name: product.short_name || product.name || '',
        full_model_list: product.full_model_list || product.name || '',
        brand: product.brand || '',
        category: product.category || 'Display',
        official_price: product.official_price || '',
        purchase_price: product.purchase_price || '',
        sale_price: product.sale_price || '',
        wholesale_price: product.wholesale_price || '',
        retail_price: product.retail_price || '',
        opening_stock: '',
        description: product.description || '',
        colours: Array.isArray(product.colours) ? product.colours.join(', ') : '',
      },
    }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteProduct = (product) => {
    if (role !== 'superadmin') return;
    const name = productName(product);
    requestConfirmation({
      title: `Delete ${name}?`,
      message: 'This removes the product and all of its inventory. Products with sales, request, or transfer history are protected and cannot be deleted.',
      confirmLabel: 'Delete product',
      onConfirm: async () => {
        try {
          setSaving(true);
          await authedFetch(`/products/${product.id}`, { method: 'DELETE' });
          if (editingProductId === String(product.id)) {
            setEditingProductId('');
            setForms((prev) => ({ ...prev, product: initialForms.product }));
          }
          if (selectedProductDetails?.id === product.id) setSelectedProductDetails(null);
          showToast(`${name} was deleted`);
          await loadCore();
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
        <td style="text-align: right;">₹${Number(item.official_price).toLocaleString('en-IN')}</td>
        <td style="text-align: center; font-weight: bold; ${item.quantity <= 3 ? 'color: #dc2626;' : ''}">${item.quantity} pcs</td>
        <td style="text-align: right; font-weight: bold;">₹${(Number(item.quantity) * Number(item.official_price)).toLocaleString('en-IN')}</td>
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
                <th style="text-align: right; width: 140px;">Official Price</th>
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

  const printInvoicePDF = (sale) => {
    const printWindow = window.open('', '_blank');
    const invoiceNo = `INV-${String(sale.id).padStart(6, '0')}`;
    const dateStr = sale.sale_date || new Date().toISOString().slice(0, 10);
    const shopName = sale.shop_name || 'AS Store';
    
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
                    <small style="color: #64748b; font-size: 12px;">Official Display replacement panel</small>
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
    const shopName = safe(sale.shop_name || 'AS Store');
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

  const modelItems = (role === 'customer' ? data.catalog : data.products).filter((item) => {
    const query = modelSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.short_name, item.full_model_list, item.name, item.brand, item.category, item.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

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

  const visibleBatches = data.batches.filter((batch) => {
    const query = stockFilters.search.trim().toLowerCase();
    const matchesSearch = !query || [batch.short_name, batch.full_model_list, batch.name, batch.brand, batch.category, batch.colour, batch.assigned_user_name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
    const matchesBrand = !stockFilters.brand || sameText(batch.brand, stockFilters.brand);
    const matchesCategory = !stockFilters.category || sameText(batch.category, stockFilters.category);
    const matchesColour = !stockFilters.colour || sameText(batch.colour, stockFilters.colour);
    const matchesStatus = !stockFilters.status
      || (stockFilters.status === 'in_stock' ? Number(batch.quantity_remaining) > 0 : Number(batch.quantity_remaining) === 0);
    const matchesBatch = !stockFilters.batch || String(batch.id) === String(stockFilters.batch);
    const matchesShopkeeper = !stockFilters.shopkeeperId || String(batch.assigned_user_id) === String(stockFilters.shopkeeperId);
    const matchesOwnership = !stockFilters.ownership
      || (stockFilters.ownership === 'owner' && !batch.assigned_user_id)
      || (stockFilters.ownership === 'shopkeeper' && Boolean(batch.assigned_user_id))
      || (stockFilters.ownership === 'mine' && String(batch.assigned_user_id) === String(session.id));
    return matchesSearch && matchesBrand && matchesCategory && matchesColour && matchesStatus && matchesBatch && matchesShopkeeper && matchesOwnership;
  });

  const combinedStock = combineStockRows(data.stock);
  const stockWithOwnership = combinedStock.map((item) => {
    const productBatches = data.batches.filter((batch) => batchBelongsToStockItem(batch, item));
    const ownerBatches = productBatches.filter((batch) => !batch.assigned_user_id);
    const shopkeeperBatches = productBatches.filter((batch) => Boolean(batch.assigned_user_id));
    const myBatches = shopkeeperBatches.filter((batch) => String(batch.assigned_user_id) === String(session.id));
    return {
      ...item,
      owner_quantity: sumBatchQuantity(ownerBatches),
      shopkeeper_quantity: sumBatchQuantity(shopkeeperBatches),
      my_quantity: sumBatchQuantity(myBatches),
      owner_batch_count: ownerBatches.filter((batch) => Number(batch.quantity_remaining) > 0).length,
      shopkeeper_batch_count: shopkeeperBatches.filter((batch) => Number(batch.quantity_remaining) > 0).length,
      my_batch_count: myBatches.filter((batch) => Number(batch.quantity_remaining) > 0).length,
    };
  });
  const shopkeeperStockItems = stockWithOwnership.filter((item) => {
    const query = shopkeeperStockSearch.trim().toLowerCase();
    return !query || [productName(item), fullModelList(item), item.brand, item.category]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });
  const hasBatchScopedStockFilter = Boolean(stockFilters.colour || stockFilters.batch || stockFilters.shopkeeperId || stockFilters.ownership);
  const visibleStock = stockWithOwnership
    .filter((item) => {
      const query = stockFilters.search.trim().toLowerCase();
      const matchesSearch = !query || [item.short_name, item.full_model_list, item.name, item.brand, item.category, item.description, item.shop_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      return matchesSearch
      && (!stockFilters.brand || sameText(item.brand, stockFilters.brand))
      && (!stockFilters.category || sameText(item.category, stockFilters.category));
    })
    .map((item) => {
      if (!hasBatchScopedStockFilter) return item;
      const matchingBatches = visibleBatches.filter((batch) => batchBelongsToStockItem(batch, item));
      const ownerBatches = matchingBatches.filter((batch) => !batch.assigned_user_id);
      const shopkeeperBatches = matchingBatches.filter((batch) => Boolean(batch.assigned_user_id));
      const myBatches = shopkeeperBatches.filter((batch) => String(batch.assigned_user_id) === String(session.id));
      return {
        ...item,
        quantity: sumBatchQuantity(matchingBatches),
        batch_count: matchingBatches.filter((batch) => Number(batch.quantity_remaining) > 0).length,
        matching_batch_count: matchingBatches.length,
        owner_quantity: sumBatchQuantity(ownerBatches),
        shopkeeper_quantity: sumBatchQuantity(shopkeeperBatches),
        my_quantity: sumBatchQuantity(myBatches),
      };
    })
    .filter((item) => (!hasBatchScopedStockFilter || item.matching_batch_count > 0)
      && (!stockFilters.status || (stockFilters.status === 'in_stock' ? Number(item.quantity) > 0 : Number(item.quantity) === 0)));
  const categoryStats = [
    {
      name: '',
      label: 'All categories',
      products: combinedStock.length,
      quantity: combinedStock.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    },
    ...data.reference.categories.map((category) => {
      const categoryStock = combinedStock.filter((item) => sameText(item.category, category.name));
      return {
        name: category.name,
        label: category.name,
        products: categoryStock.length,
        quantity: categoryStock.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
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
  const ownerInventoryQuantity = sumBatchQuantity(data.batches.filter((batch) => !batch.assigned_user_id));
  const assignedInventoryQuantity = sumBatchQuantity(data.batches.filter((batch) => Boolean(batch.assigned_user_id)));
  const myInventoryQuantity = sumBatchQuantity(data.batches.filter((batch) => String(batch.assigned_user_id) === String(session.id)));
  const lowStockAlerts = combineLowStockAlerts(data.dashboard?.lowStock);

  if (!authReady) return <SkeletonPage type="dashboard" />;
  if (!session) return <Login onLogin={login} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'show' : ''}`}>
        <div className="sidebar-head">
          <div className="brand-mark"><Store size={23} /></div>
          <div>
            <strong>AS Store</strong>
            <span>{role === 'superadmin' ? 'Owner Control' : role === 'shopkeeper' ? session.shop_name : 'Catalog'}</span>
          </div>
          <button type="button" className="icon mobile-only" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => {
            const isActive = active === id;
            return (
              <motion.button 
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                type="button" 
                key={id} 
                className={`relative ${isActive ? 'active' : ''}`} 
                onClick={() => { if (id === 'stock-categories') openStockCategoriesHub(); else setActive(id); setOpen(false); }}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeSidebarIndicator"
                    className="absolute inset-0 bg-white/[0.08] border-l-[3px] border-teal rounded-lg pointer-events-none"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <Icon size={18} className="relative z-10" /> 
                <span className="relative z-10">{label}</span>
              </motion.button>
            );
          })}
        </nav>
        <Magnetic className="w-full mt-auto">
          <button type="button" className="logout" onClick={(event) => { event.preventDefault(); logout(); }}><LogOut size={18} /> Sign out</button>
        </Magnetic>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button type="button" className="icon mobile-only" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="page-title">
            <span className="eyebrow">{role === 'superadmin' ? 'Owner workspace' : role === 'shopkeeper' ? 'Branch workspace' : 'Customer catalog'}</span>
            <h1>{active.replace('-', ' ')}</h1>
            <p>{role === 'shopkeeper' ? `${session.name} - ${session.shop_name}` : role === 'superadmin' ? 'All branch controls in one place' : 'Browse prices and availability'}</p>
          </div>
          <div className="topbar-actions">
            <div className="user-pill">
              <ShieldCheck size={16} />
              <span>{session.name}</span>
            </div>
            <Magnetic>
              <button type="button" className="topbar-signout" onClick={(event) => { event.preventDefault(); logout(); }}>
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </Magnetic>
            {role === 'superadmin' && !['shops', 'shopkeepers', 'catalog'].includes(active) && (
              <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)}>
                <option value="">All shops</option>
                {data.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
              </select>
            )}
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
              <section className="space">
                <div className="stats-grid">
                  <StatCard icon={Building2} label="Total shops" value={data.dashboard.totals.total_shops} />
                  <StatCard icon={Package} label="Total stock" value={data.dashboard.totals.total_stock} tone="green" />
                  <StatCard
                    icon={ShoppingBag}
                    label="Today's sales"
                    value={currency(data.dashboard.totals.today_sales)}
                    tone="cyan"
                    sparklineTone="green"
                    trend={data.dashboard.trends?.sales || trendFromValue(data.dashboard.totals.today_sales)}
                  />
                  <StatCard
                    icon={CreditCard}
                    label="Pending payments"
                    value={currency(data.dashboard.totals.pending_payments)}
                    tone="amber"
                    sparklineTone="amber"
                    trend={data.dashboard.trends?.pending || trendFromValue(data.dashboard.totals.pending_payments, 'pending')}
                  />
                </div>
                <div className="two-col">
                  <section className="panel performance-panel">
                    <h2>Shop performance</h2>
                    <motion.div 
                      variants={listVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: "-10px" }}
                      className="performance-list"
                    >
                      {data.dashboard.shopWise.length ? data.dashboard.shopWise.map((shop) => (
                        <motion.div 
                          variants={itemVariants} 
                          className="performance-item" 
                          key={shop.id}
                          whileHover={{ y: -2 }}
                        >
                          <div className="performance-shop-info">
                            <div className="performance-shop-icon">
                              <Store size={18} />
                            </div>
                            <div className="performance-shop-name">
                              <b>{shop.name}</b>
                              <small>{shop.area}</small>
                            </div>
                          </div>
                          <div className="performance-metrics-grid">
                            <div className="performance-metric">
                              <span className="metric-label">Stock</span>
                              <span className="metric-value">{shop.stock} pcs</span>
                            </div>
                            <div className="performance-metric">
                              <span className="metric-label">Pending</span>
                              <span className={`metric-value ${Number(shop.pending) > 0 ? 'text-rose-600 font-bold' : ''}`}>
                                {currency(shop.pending)}
                              </span>
                            </div>
                            <div className="performance-metric highlight">
                              <span className="metric-label">Sales Today</span>
                              <strong className="metric-value text-teal">
                                {currency(shop.sales_today)}
                              </strong>
                            </div>
                          </div>
                        </motion.div>
                      )) : <Empty title="No shops registered yet" />}
                    </motion.div>
                  </section>
                  <section className="panel">
                    <h2>Low stock alerts</h2>
                    <motion.div 
                      variants={listVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: "-10px" }}
                      className="alert-list"
                    >
                      {lowStockAlerts.length ? lowStockAlerts.map((item) => (
                        <motion.div 
                          variants={itemVariants} 
                          className="alert-item" 
                          key={item.id}
                          whileHover={{ y: -2 }}
                        >
                          <div className="alert-item-info">
                            <div className={`alert-item-icon ${item.quantity <= 1 ? 'critical' : 'warning'}`}>
                              <AlertTriangle size={17} />
                            </div>
                            <div className="alert-item-details">
                              <b className="clamp-title" title={item.product_name}>{productName(item)}</b>
                              <small>{joinUniqueText([item.shop_name, item.brand], 'No brand')}</small>
                              <button className="soft text-[10px] !min-h-[22px] !py-0.5 !px-2 mt-1 self-start font-bold" type="button" onClick={() => {
                                const prod = data.products.find(p => Number(p.id) === Number(item.product_id));
                                setSelectedProductDetails(prod || { ...item, id: item.product_id, name: item.product_name });
                              }}>View Details</button>
                            </div>
                          </div>
                          <span className={`alert-badge ${item.quantity <= 1 ? 'critical' : 'warning'}`}>
                            {item.quantity} left
                          </span>
                        </motion.div>
                      )) : <Empty title="No low stock items" />}
                    </motion.div>
                  </section>
                </div>
              </section>
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
              <section className="space">
                <FormPanel title="Create shopkeeper login" action={saving ? 'Creating login...' : 'Create login'} onSubmit={submitShopkeeper} disabled={saving}>
                  <Input label="Name" autoComplete="name" maxLength={80} className="md:col-span-2" value={forms.shopkeeper.name} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, name: v } })} />
                  <Input label="Mobile" autoComplete="tel" inputMode="tel" maxLength={30} className="md:col-span-2" value={forms.shopkeeper.contact} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, contact: v } })} />
                  <Input label="Username" autoComplete="off" minLength={3} maxLength={40} className="md:col-span-2" value={forms.shopkeeper.username} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, username: v } })} />
                  <Input label="Password" type="password" autoComplete="new-password" minLength={8} maxLength={200} className="md:col-span-2" value={forms.shopkeeper.password} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, password: v } })} />
                  <Select label="Shop" className="md:col-span-4" value={forms.shopkeeper.shop_id} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, shop_id: v } })} options={[...data.shops.map((s) => [s.id, s.name]), ['new_shop', '+ Add New Shop']]} />
                  {forms.shopkeeper.shop_id === 'new_shop' && (
                    <div className="panel form-panel sub-form" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--teal-dark)' }}>New Shop Details</h3>
                      <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px', width: '100%' }}>
                        <Input label="Shop name" value={forms.shop.name} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, name: v } })} />
                        <Input label="Area" value={forms.shop.area} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, area: v } })} />
                        <Input label="Address" value={forms.shop.address} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, address: v } })} />
                        <Input label="Phone" value={forms.shop.phone} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, phone: v } })} />
                      </div>
                    </div>
                  )}
                </FormPanel>
                {data.shopkeepers.length ? (
                  <motion.div 
                    variants={listVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10px" }}
                    className="table panel"
                  >
                    {data.shopkeepers.map((user) => {
                      const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'SK';
                      return (
                        <motion.div variants={itemVariants} className="row shopkeeper-row" key={user.id}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center font-bold text-sm shrink-0">
                              {initials}
                            </div>
                            <span><b>{user.name}</b><small>@{user.username}</small></span>
                          </div>
                          <span>
                            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-0.5">Contact</span>
                            <span className="flex items-center gap-1.5 text-sm text-slate-600 font-medium"><Contact size={14} /> {user.contact || 'Not provided'}</span>
                          </span>
                          <span>
                            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-0.5">Assigned Shop</span>
                            <span className="flex items-center gap-1.5 text-sm text-slate-800 font-bold"><Store size={14} /> {user.shop_name}</span>
                          </span>
                          <div className="shopkeeper-actions">
                            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Access Role</span>
                            <span className="status-badge paid">Branch Staff</span>
                            <button
                              className="shopkeeper-delete-button"
                              type="button"
                              disabled={saving}
                              aria-label={`Delete ${user.name}'s shopkeeper login`}
                              onClick={() => deleteShopkeeper(user)}
                            >
                              <Trash2 size={14} /> Delete login
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <Empty title="No shopkeepers registered yet" />
                )}
              </section>
            </PageWrapper>
          )}

          {active === 'prices' && (
            <PageWrapper activeKey="prices" key="prices">
              <section className="space">
                {role === 'superadmin' && (
                  <FormPanel title={editingProductId ? 'Edit product and prices' : 'Add product and prices'} action={saving ? 'Saving...' : editingProductId ? 'Update product' : 'Add product'} onSubmit={submitProduct} disabled={saving}>
                    <Input label="Short display name" className="md:col-span-2" value={forms.product.short_name} onChange={(v) => setForms({ ...forms, product: { ...forms.product, short_name: v } })} />
                    <Input label="Full compatible models" className="md:col-span-2" value={forms.product.full_model_list} onChange={(v) => setForms({ ...forms, product: { ...forms.product, full_model_list: v } })} />
                    <Input label="Brand" className="md:col-span-1" value={forms.product.brand} onChange={(v) => setForms({ ...forms, product: { ...forms.product, brand: v } })} />
                    <Select
                      label="Product Category"
                      className="md:col-span-1"
                      value={forms.product.category}
                      onChange={(v) => v === '__new__' ? setNewReference({ type: 'categories', name: '' }) : setForms({ ...forms, product: { ...forms.product, category: v } })}
                      options={[...data.reference.categories.map((item) => [item.name, item.name]), ['__new__', '+ Add New Category']]}
                    />
                    {newReference.type === 'categories' && (
                      <div className="inline-reference-control md:col-span-2">
                        <Input label="New category" value={newReference.name} onChange={(name) => setNewReference({ type: 'categories', name })} />
                        <button className="soft" type="button" onClick={() => addReferenceOption('categories', newReference.name)}>Add category</button>
                      </div>
                    )}
                    <Input label="Official price" type="number" className="md:col-span-1" value={forms.product.official_price} onChange={(v) => setForms({ ...forms, product: { ...forms.product, official_price: v } })} />
                    <Input label="Purchase price" type="number" className="md:col-span-1" value={forms.product.purchase_price} onChange={(v) => setForms({ ...forms, product: { ...forms.product, purchase_price: v } })} />
                    <Input label="Sale price" type="number" className="md:col-span-1" value={forms.product.sale_price} onChange={(v) => setForms({ ...forms, product: { ...forms.product, sale_price: v } })} />
                    <Input label="Wholesale price" type="number" className="md:col-span-1" value={forms.product.wholesale_price} onChange={(v) => setForms({ ...forms, product: { ...forms.product, wholesale_price: v } })} />
                    <Input label="Retail price" type="number" className="md:col-span-1" value={forms.product.retail_price} onChange={(v) => setForms({ ...forms, product: { ...forms.product, retail_price: v } })} />
                    {!editingProductId && <Input label="Opening stock" type="number" className="md:col-span-1" value={forms.product.opening_stock} onChange={(v) => setForms({ ...forms, product: { ...forms.product, opening_stock: v } })} />}
                    <Input label="Description" className="md:col-span-4" value={forms.product.description} onChange={(v) => setForms({ ...forms, product: { ...forms.product, description: v } })} />
                    <Select
                      label="Add Colour"
                      className="md:col-span-1"
                      value=""
                      onChange={(v) => {
                        if (v === '__new__') return setNewReference({ type: 'colours', name: '' });
                        const selected = forms.product.colours.split(',').map((item) => item.trim()).filter(Boolean);
                        if (v && !selected.includes(v)) setForms({ ...forms, product: { ...forms.product, colours: [...selected, v].join(', ') } });
                      }}
                      options={[...data.reference.colours.map((item) => [item.name, item.name]), ['__new__', '+ Add New Colour']]}
                    />
                    <Input label="Selected colours" className="md:col-span-3" value={forms.product.colours} onChange={(v) => setForms({ ...forms, product: { ...forms.product, colours: v } })} />
                    {newReference.type === 'colours' && (
                      <div className="inline-reference-control md:col-span-2">
                        <Input label="New colour" value={newReference.name} onChange={(name) => setNewReference({ type: 'colours', name })} />
                        <button className="soft" type="button" onClick={() => addReferenceOption('colours', newReference.name)}>Add colour</button>
                      </div>
                    )}
                    {editingProductId && <button className="soft" type="button" onClick={() => { setEditingProductId(''); setForms((prev) => ({ ...prev, product: initialForms.product })); }}>Cancel edit</button>}
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
                  <button className="soft" type="button" onClick={() => exportCsv('products')}><Download size={17} /> Export products/models CSV</button>
                </section>
                <CardGrid className="product-grid" items={data.products} render={(product) => (
                  <>
                    <div className="flex items-start justify-between w-full mb-3">
                      <div className="card-icon-wrapper indigo !mb-0">
                        <IndianRupee size={18} />
                      </div>
                      <span className="status-badge stock-ok">{product.category}</span>
                    </div>
                    <h3 className="product-title" title={fullModelList(product)}>{productName(product)}</h3>
                    <p className="product-description" title={product.description || 'No description provided.'}>
                      {product.description || 'No description provided.'}
                    </p>
                    <p className="text-xs text-slate-500">{product.brand}{product.colours?.length ? ` · ${product.colours.join(', ')}` : ''}</p>
                    <div className="price-stack">
                      {(role === 'superadmin' || data.priceVisibility.show_official_price_shopkeeper) && <span><small>Official</small><strong>{priceLabel(product.official_price)}</strong></span>}
                      <span><small>Sale</small><strong>{priceLabel(product.sale_price)}</strong></span>
                      <span><small>Retail</small><strong>{priceLabel(product.retail_price)}</strong></span>
                      {(role === 'superadmin' || data.priceVisibility.show_purchase_price_shopkeeper) && <span><small>Purchase</small><strong>{priceLabel(product.purchase_price)}</strong></span>}
                      {(role === 'superadmin' || data.priceVisibility.show_wholesale_price_shopkeeper) && <span><small>Wholesale</small><strong>{priceLabel(product.wholesale_price)}</strong></span>}
                    </div>
                    <div className="flex gap-2 w-full mt-3">
                      <button className="soft flex-1 !min-h-[38px] text-xs font-bold" type="button" onClick={() => setSelectedProductDetails(product)}>View Details</button>
                      {role === 'superadmin' && <button className="soft flex-1 !min-h-[38px] text-xs font-bold" type="button" onClick={() => editProduct(product)}>Edit</button>}
                      {role === 'superadmin' && (
                        <button className="soft product-delete-button flex-1 !min-h-[38px] text-xs font-bold" type="button" disabled={saving} onClick={() => deleteProduct(product)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </>
                )} />
              </section>
            </PageWrapper>
          )}

          {active === 'models' && (
            <PageWrapper activeKey="models" key="models">
              <section className="space">
                <div className="catalog-toolbar panel models-toolbar">
                  <div className="searchbox">
                    <Search size={18} />
                    <input
                      placeholder="Search model, brand, or category"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                    />
                  </div>
                  <div className="models-summary">
                    <span className="status-badge stock-ok">{modelItems.length} models</span>
                    {role !== 'customer' && <span className="status-badge due">Official inventory view</span>}
                    {role === 'customer' && <span className="status-badge paid">Browse all added models</span>}
                  </div>
                </div>

                <div className="table compact-models-table">
                  {modelItems.map((product) => (
                    <div className="row compact-model-row" key={product.id}>
                      <div className="inventory-primary">
                        <div className="w-10 h-10 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                          <Smartphone size={18} />
                        </div>
                        <span>
                          <b>{productName(product)}</b>
                          <small>{product.brand || 'No brand'}</small>
                          <span className="model-compatible-preview" title={fullModelList(product)}>
                            <b>Compatible:</b> {fullModelList(product) || 'No compatible models listed'}
                          </span>
                        </span>
                      </div>
                      <span className="inventory-metric">
                        <small>Category</small>
                        <span className="status-badge stock-ok">{product.category || 'Uncategorized'}</span>
                      </span>
                      <span className="inventory-metric">
                        <small>{role === 'customer' ? 'Retail price' : 'Official price'}</small>
                        <strong>{(role === 'customer' || role === 'superadmin' || data.priceVisibility.show_official_price_shopkeeper)
                          ? priceLabel(role === 'customer' ? product.retail_price : product.official_price)
                          : 'Hidden'}</strong>
                      </span>
                      <div className="model-row-actions">
                        {role === 'customer' && <small>{product.available_shops || 'Currently unavailable'}</small>}
                        <button className="soft" type="button" onClick={() => setSelectedProductDetails(product)}>View details</button>
                      </div>
                    </div>
                  ))}
                  {!modelItems.length && <Empty title="No matching models found" />}
                </div>
              </section>
            </PageWrapper>
          )}

          {active === 'stock' && (
            <PageWrapper activeKey="stock" key="stock">
              <section className="space">
                <section className="stock-workspace-intro">
                  <div className="stock-workspace-copy">
                    <span className="stock-eyebrow">Inventory workspace</span>
                    <h2>{role === 'shopkeeper' ? 'Manage your stock without mixing it with main warehouse stock' : 'Keep daily stock work simple'}</h2>
                    <p>{role === 'shopkeeper'
                      ? 'Main warehouse stock remains available for sales. Quantity updates here are saved as your personal shopkeeper inventory.'
                      : 'Update quantities, receive purchase batches, and transfer stock here. Browse categories, filter inventory, and export reports on the dedicated categories page.'}</p>
                  </div>
                  <button className="stock-category-link" type="button" onClick={openStockCategoriesHub}>
                    <span className="stock-category-link-icon"><LayoutGrid size={22} /></span>
                    <span><b>Open Stock Categories</b><small>Browse, filter, and export inventory</small></span>
                  </button>
                </section>
                {role === 'shopkeeper' && (
                  <section className="inventory-ownership-summary compact-summary">
                    <article className="ownership-summary-card owner">
                      <span>Main warehouse stock available</span>
                      <strong>{ownerInventoryQuantity}</strong>
                      <small>Shared stock you can sell</small>
                    </article>
                    <article className="ownership-summary-card mine">
                      <span>My shopkeeper stock</span>
                      <strong>{myInventoryQuantity}</strong>
                      <small>Stock added and controlled by you</small>
                    </article>
                  </section>
                )}
                <FormPanel title={role === 'shopkeeper' ? 'Set my stock quantity' : 'Set available stock quantity'} action="Save quantity" onSubmit={updateStock}>
                  <Select label="Product" className="md:col-span-3" value={forms.stock.product_id} onChange={(v) => setForms({ ...forms, stock: { ...forms.stock, product_id: v } })} options={data.products.map((p) => [p.id, `${productName(p)} · ${priceLabel(p.official_price)}`])} />
                  <Input label={role === 'shopkeeper' ? 'My quantity' : 'Available quantity'} type="number" className="md:col-span-1" value={forms.stock.quantity} onChange={(v) => setForms({ ...forms, stock: { ...forms.stock, quantity: v } })} />
                </FormPanel>
                {role === 'superadmin' && (
                  <FormPanel title="Add purchase-price batch" action={saving ? 'Saving...' : 'Add batch'} onSubmit={addInventoryBatch} disabled={saving || needsSpecificShop}>
                    <Select label="Product" className="md:col-span-3" value={forms.batch.product_id} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, product_id: v } })} options={data.products.map((p) => [p.id, productName(p)])} />
                    <Input label="Quantity received" type="number" className="md:col-span-1" value={forms.batch.quantity} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, quantity: v } })} />
                    <Input label="Purchase price" type="number" className="md:col-span-1" value={forms.batch.purchase_price} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, purchase_price: v } })} />
                    <Input label="Wholesale price" type="number" className="md:col-span-1" value={forms.batch.wholesale_price} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, wholesale_price: v } })} />
                    <Input label="Official price" type="number" className="md:col-span-1" value={forms.batch.official_price} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, official_price: v } })} />
                    <Input label="Retail price" type="number" className="md:col-span-1" value={forms.batch.retail_price} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, retail_price: v } })} />
                    <Select label="Colour" className="md:col-span-1" value={forms.batch.colour} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, colour: v } })} options={data.reference.colours.map((item) => [item.name, item.name])} />
                    <Input label="Received date" type="date" className="md:col-span-1" value={forms.batch.received_date} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, received_date: v } })} />
                    <Select label="Assign to shopkeeper (optional)" className="md:col-span-2" value={forms.batch.assigned_user_id} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, assigned_user_id: v } })} options={data.shopkeepers.filter((user) => String(user.shop_id) === String(shopId)).map((user) => [user.id, user.name])} />
                    <Input label="Batch notes" className="md:col-span-4" value={forms.batch.notes} onChange={(v) => setForms({ ...forms, batch: { ...forms.batch, notes: v } })} />
                  </FormPanel>
                )}
                {role === 'superadmin' && (
                  <section className="panel transfer-launch">
                    <div>
                      <h2>Branch stock transfer</h2>
                      <p>Move available inventory between branches without leaving the stock workspace.</p>
                    </div>
                    <button className="primary" type="button" onClick={() => setTransferDrawerOpen(true)}><Send size={17} /> Transfer stock</button>
                  </section>
                )}
                <div className="stock-section-heading">
                  <div>
                    <span className="stock-eyebrow">Live inventory</span>
                    <h2>Current stock overview</h2>
                    {role === 'shopkeeper' && <p>{shopkeeperStockItems.length} matching models</p>}
                  </div>
                  <div className="stock-overview-actions">
                    {role === 'shopkeeper' && (
                      <div className="searchbox shopkeeper-stock-search">
                        <Search size={18} />
                        <input
                          aria-label="Search models in stock"
                          placeholder="Search product or compatible model"
                          value={shopkeeperStockSearch}
                          onChange={(event) => setShopkeeperStockSearch(event.target.value)}
                        />
                      </div>
                    )}
                    <button className="soft" type="button" onClick={openStockCategoriesHub}><LayoutGrid size={16} /> View categories</button>
                  </div>
                </div>
                {(role === 'shopkeeper' ? shopkeeperStockItems : stockWithOwnership).length ? (
                  <div className="table panel inventory-stock-table">
                    {(role === 'shopkeeper' ? shopkeeperStockItems : stockWithOwnership).map((item) => (
                      <div className="row" key={item.id}>
                        <div className="inventory-primary">
                          <div className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
                            <Smartphone size={18} />
                          </div>
                          <span>
                            <b>{productName(item)}</b>
                            <small>{joinUniqueText([item.brand, !shopId ? item.shop_name : ''], 'No brand')}</small>
                            {role === 'shopkeeper' && (
                              <span className="stock-compatible-models">
                                <small title={fullModelList(item)}><b>Compatible:</b> {fullModelList(item) || 'No compatible models listed'}</small>
                                {fullModelList(item) && <button type="button" onClick={() => setSelectedProductDetails(item)}>View all</button>}
                              </span>
                            )}
                          </span>
                        </div>
                        <span className="inventory-metric">
                          <small>Category</small>
                          <span className="status-badge stock-ok">{item.category || 'Mobile'}</span>
                        </span>
                        <span className="inventory-metric">
                          <small>Price</small>
                          <strong>{priceLabel(item.official_price || item.retail_price)}</strong>
                        </span>
                        <div className="inventory-balance">
                          <small>Total available: <b>{item.quantity} pcs</b></small>
                          <div className="inventory-owner-badges">
                            <span className="owner-stock-chip">Main warehouse <b>{item.owner_quantity}</b></span>
                            <span className="my-stock-chip">{role === 'shopkeeper' ? 'My stock' : 'Shopkeepers'} <b>{role === 'shopkeeper' ? item.my_quantity : item.shopkeeper_quantity}</b></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title={role === 'shopkeeper' && shopkeeperStockSearch.trim() ? 'No models match your search' : 'No stock records found'} />
                )}
              </section>
            </PageWrapper>
          )}

          {active === 'stock-categories' && (
            <PageWrapper activeKey="stock-categories" key="stock-categories">
              <section className="space stock-categories-page">
                {!stockCategoryPage ? (
                  <>
                <section className="stock-categories-hero">
                  <div>
                    <span className="stock-eyebrow">Inventory library</span>
                    <h2>Open a dedicated category page</h2>
                    <p>Each stock category has its own page for filters, exports, inventory results, and purchase history.</p>
                  </div>
                  <div className="stock-hero-actions">
                    <button className="soft" type="button" onClick={() => setActive('stock')}><Package size={16} /> Stock actions</button>
                  </div>
                </section>

                <section className="inventory-ownership-summary">
                  <article className="ownership-summary-card total">
                    <span>Total available stock</span>
                    <strong>{ownerInventoryQuantity + assignedInventoryQuantity}</strong>
                    <small>Main warehouse and shopkeeper inventory combined</small>
                  </article>
                  <article className="ownership-summary-card owner">
                    <span>Main warehouse stock</span>
                    <strong>{ownerInventoryQuantity}</strong>
                    <small>Shared inventory available in this shop</small>
                  </article>
                  <article className="ownership-summary-card mine">
                    <span>{role === 'shopkeeper' ? 'My stock' : 'Shopkeeper stock'}</span>
                    <strong>{role === 'shopkeeper' ? myInventoryQuantity : assignedInventoryQuantity}</strong>
                    <small>{role === 'shopkeeper' ? 'Inventory added by you' : 'Inventory assigned to shopkeepers'}</small>
                  </article>
                </section>

                <section className="stock-section-card category-browser">
                  <div className="stock-section-heading">
                    <div>
                      <span className="stock-eyebrow">Category pages</span>
                      <h2>Choose a stock category</h2>
                    </div>
                    <span className="category-result-count">{categoryStats.length} pages</span>
                  </div>
                  <div className="category-search-row">
                    <div className="searchbox">
                      <Search size={18} />
                      <input
                        placeholder="Search categories"
                        value={categorySearch}
                        onChange={(event) => setCategorySearch(event.target.value)}
                      />
                    </div>
                    <span>{visibleCategoryStats.length} categories shown</span>
                  </div>
                  <div className="category-card-grid">
                    {visibleCategoryStats.map((category) => (
                      <button
                        key={category.name || 'all-categories'}
                        type="button"
                        className="category-card"
                        onClick={() => openStockCategoryPage(category.name)}
                      >
                        <span className="category-icon"><Package size={20} /></span>
                        <span className="category-card-copy">
                          <b>{category.label}</b>
                          <small>{category.products} products</small>
                        </span>
                        <span className="category-quantity"><b>{category.quantity}</b><small>pieces</small></span>
                        <ChevronRight className="category-open-icon" size={18} />
                      </button>
                    ))}
                  </div>
                  {!visibleCategoryStats.length && <Empty title="No category matches your search" />}
                </section>
                  </>
                ) : (
                  <>
                    <section className="stock-categories-hero category-detail-hero">
                      <div className="category-detail-copy">
                        <button className="category-back-button" type="button" onClick={openStockCategoriesHub}><ArrowLeft size={16} /> Back to categories</button>
                        <span className="stock-eyebrow">Category models</span>
                        <h2>{selectedCategoryStat?.label || 'Stock category'}</h2>
                        <p>Showing only {selectedCategoryStat?.label || 'this category'} models and their available stock.</p>
                      </div>
                      <span className="category-result-count">{selectedCategoryStat?.products || 0} models</span>
                    </section>
                  </>
                )}

                {stockCategoryPage && (
                  <>
                <section className="stock-section-card stock-filter-panel category-detail-hidden">
                  <div className="stock-section-heading">
                    <div>
                      <span className="stock-eyebrow">{selectedCategoryStat?.label || 'Category'} inventory</span>
                      <h2>Filter this category page</h2>
                    </div>
                    <button
                      className="soft"
                      type="button"
                      onClick={() => setStockFilters({ search: '', brand: '', category: selectedCategoryStat?.name || '', colour: '', status: '', batch: '', shopkeeperId: '', ownership: '' })}
                    >
                      Clear filters
                    </button>
                  </div>
                  <div className="brand-pills-bar">
                    <button type="button" className={!stockFilters.brand ? 'active' : ''} onClick={() => setStockFilters({ ...stockFilters, brand: '' })}>All brands</button>
                    {data.reference.brands.map((brand) => (
                      <button key={brand.id} type="button" className={sameText(stockFilters.brand, brand.name) ? 'active' : ''} onClick={() => setStockFilters({ ...stockFilters, brand: brand.name })}>
                        {brand.name}
                      </button>
                    ))}
                  </div>
                  <div className="ownership-filter-bar">
                    <span>Inventory source</span>
                    <button type="button" className={!stockFilters.ownership ? 'active' : ''} onClick={() => setStockFilters({ ...stockFilters, ownership: '' })}>All available</button>
                    <button type="button" className={stockFilters.ownership === 'owner' ? 'active' : ''} onClick={() => setStockFilters({ ...stockFilters, ownership: 'owner' })}>Main warehouse stock</button>
                    <button type="button" className={['mine', 'shopkeeper'].includes(stockFilters.ownership) ? 'active' : ''} onClick={() => setStockFilters({ ...stockFilters, ownership: role === 'shopkeeper' ? 'mine' : 'shopkeeper' })}>
                      {role === 'shopkeeper' ? 'My stock' : 'Shopkeeper stock'}
                    </button>
                  </div>
                  <div className="filter-grid">
                    <Input label="Search this category" className="filter-search-wide" value={stockFilters.search} onChange={(v) => setStockFilters({ ...stockFilters, search: v })} />
                    <Select label="Brand" value={stockFilters.brand} onChange={(v) => setStockFilters({ ...stockFilters, brand: v })} options={data.reference.brands.map((item) => [item.name, item.name])} placeholder="All brands" />
                    <Select label="Category page" value={stockFilters.category} onChange={openStockCategoryPage} options={data.reference.categories.map((item) => [item.name, item.name])} placeholder="All inventory" />
                    <Select label="Colour" value={stockFilters.colour} onChange={(v) => setStockFilters({ ...stockFilters, colour: v })} options={data.reference.colours.map((item) => [item.name, item.name])} placeholder="All colours" />
                    <Select label="Stock status" value={stockFilters.status} onChange={(v) => setStockFilters({ ...stockFilters, status: v })} options={[['in_stock', 'In Stock'], ['out_of_stock', 'Out of Stock']]} placeholder="All status" />
                    <Select label="Purchase-price batch" value={stockFilters.batch} onChange={(v) => setStockFilters({ ...stockFilters, batch: v })} options={data.batches.filter((batch) => !selectedCategoryStat?.name || sameText(batch.category, selectedCategoryStat.name)).map((batch) => [batch.id, `${productName(batch)} · ${batch.received_date} · ${batch.quantity_remaining} left${role === 'superadmin' || data.priceVisibility.show_purchase_price_shopkeeper ? ` · ${priceLabel(batch.purchase_price)}` : ''}`])} placeholder="All batches" />
                    {role === 'superadmin' && <Select label="Shopkeeper inventory" value={stockFilters.shopkeeperId} onChange={(v) => setStockFilters({ ...stockFilters, shopkeeperId: v })} options={data.shopkeepers.filter((user) => !shopId || String(user.shop_id) === String(shopId)).map((user) => [user.id, user.name])} placeholder="All shopkeepers" />}
                  </div>
                </section>

                <section className="stock-section-card export-tools category-detail-hidden">
                  <div className="stock-section-heading">
                    <div>
                      <span className="stock-eyebrow">Category reports</span>
                      <h2>Export {selectedCategoryStat?.label || 'stock'}</h2>
                    </div>
                    <p>Exports follow this category page and your selected filters.</p>
                  </div>
                  <div className="export-action-grid">
                    <button type="button" className="export-action-card" onClick={() => exportCsv('products')}>
                      <span><Download size={18} /></span><b>All products</b><small>Complete products and models list</small>
                    </button>
                    <button type="button" className="export-action-card" onClick={() => {
                      if (!stockFilters.brand) return showToast('Select a brand in filters first to export brand-wise stock');
                      exportCsv('stock', { brand: stockFilters.brand, category: selectedCategoryStat?.name || '' });
                    }}>
                      <span><Download size={18} /></span><b>Brand-wise stock</b><small>Export the selected brand</small>
                    </button>
                    <button type="button" className="export-action-card" onClick={() => {
                      exportCsv('stock', { category: selectedCategoryStat?.name || '' });
                    }}>
                      <span><Download size={18} /></span><b>{selectedCategoryStat?.name ? 'This category' : 'All stock'}</b><small>Export this category page</small>
                    </button>
                    <button type="button" className="export-action-card" onClick={() => {
                      if (role === 'superadmin' && !stockFilters.shopkeeperId) return showToast('Select a shopkeeper first to export shopkeeper-wise stock');
                      exportCsv('stock', { shopkeeperId: stockFilters.shopkeeperId, category: selectedCategoryStat?.name || '' });
                    }}>
                      <span><Download size={18} /></span><b>Shopkeeper stock</b><small>Export assigned inventory</small>
                    </button>
                    <button type="button" className="export-action-card" onClick={() => exportCsv('stock', { batchId: stockFilters.batch, category: selectedCategoryStat?.name || '' })}>
                      <span><Download size={18} /></span><b>Price-batch stock</b><small>Export purchase-price batches</small>
                    </button>
                  </div>
                </section>

                <section className="category-model-section">
                  <div className="stock-section-heading">
                    <div>
                      <span className="stock-eyebrow">{selectedCategoryStat?.label || 'Category'} inventory</span>
                      <h2>Matching stock</h2>
                    </div>
                    <div className="category-model-toolbar">
                      <span className="category-result-count">{visibleStock.length} models</span>
                      <div className="category-filter-control">
                        <button
                          className={`category-filter-button ${activeCategoryFilterCount ? 'active' : ''}`}
                          type="button"
                          aria-expanded={categoryFiltersOpen}
                          onClick={() => setCategoryFiltersOpen((open) => !open)}
                        >
                          <ListFilter size={17} />
                          <span>Filter</span>
                          {activeCategoryFilterCount > 0 && <b>{activeCategoryFilterCount}</b>}
                        </button>
                        {categoryFiltersOpen && (
                          <div className="category-filter-popover">
                            <div className="category-filter-popover-head">
                              <div><b>Filter models</b><small>{selectedCategoryStat?.label || 'Category'} only</small></div>
                              <button className="icon" type="button" aria-label="Close filters" onClick={() => setCategoryFiltersOpen(false)}><X size={16} /></button>
                            </div>
                            <div className="category-filter-fields">
                              <Input label="Search model" value={stockFilters.search} onChange={(v) => setStockFilters({ ...stockFilters, search: v })} />
                              <Select label="Brand" value={stockFilters.brand} onChange={(v) => setStockFilters({ ...stockFilters, brand: v })} options={data.reference.brands.map((item) => [item.name, item.name])} placeholder="All brands" />
                              <Select label="Colour" value={stockFilters.colour} onChange={(v) => setStockFilters({ ...stockFilters, colour: v })} options={data.reference.colours.map((item) => [item.name, item.name])} placeholder="All colours" />
                              <Select label="Stock status" value={stockFilters.status} onChange={(v) => setStockFilters({ ...stockFilters, status: v })} options={[['in_stock', 'In Stock'], ['out_of_stock', 'Out of Stock']]} placeholder="All status" />
                              <Select
                                label="Inventory source"
                                value={stockFilters.ownership}
                                onChange={(v) => setStockFilters({ ...stockFilters, ownership: v })}
                                options={[['owner', 'Main warehouse stock'], [role === 'shopkeeper' ? 'mine' : 'shopkeeper', role === 'shopkeeper' ? 'My stock' : 'Shopkeeper stock']]}
                                placeholder="All available"
                              />
                            </div>
                            <div className="category-filter-actions">
                              <button className="soft" type="button" onClick={() => setStockFilters({ search: '', brand: '', category: selectedCategoryStat?.name || '', colour: '', status: '', batch: '', shopkeeperId: '', ownership: '' })}>Clear</button>
                              <button className="primary" type="button" onClick={() => setCategoryFiltersOpen(false)}>Show {visibleStock.length} models</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {visibleStock.length ? (
                    <div className="table panel stock-results-table inventory-stock-table category-model-table">
                      {visibleStock.map((item) => (
                        <div className="row" key={item.id}>
                          <div className="inventory-primary">
                            <div className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0"><Smartphone size={18} /></div>
                            <span>
                              <b>{productName(item)}</b>
                              <small>{joinUniqueText([item.brand, !shopId ? item.shop_name : ''], 'No brand')}</small>
                              <span className="model-compatible-preview" title={fullModelList(item)}><b>Compatible:</b> {fullModelList(item) || 'No compatible models listed'}</span>
                            </span>
                          </div>
                          <span className="inventory-metric category-column"><small>Category</small><strong>{item.category || 'Mobile'}</strong></span>
                          <span className="inventory-metric"><small>Price</small><strong>{priceLabel(item.official_price || item.retail_price)}</strong></span>
                          <div className="inventory-balance">
                            <small>Total available: <b>{item.quantity} pcs</b></small>
                            <div className="inventory-owner-badges">
                              <span className="owner-stock-chip">Main warehouse <b>{item.owner_quantity}</b></span>
                              <span className="my-stock-chip">{role === 'shopkeeper' ? 'My stock' : 'Shopkeepers'} <b>{role === 'shopkeeper' ? item.my_quantity : item.shopkeeper_quantity}</b></span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <Empty title="No stock matches these filters" />}
                </section>

                <section className="stock-section-card batch-browser category-detail-hidden">
                  <div className="stock-section-heading">
                    <div>
                      <span className="stock-eyebrow">{selectedCategoryStat?.label || 'Category'} purchase history</span>
                      <h2>Purchase-price batches</h2>
                    </div>
                    <span className="category-result-count">{visibleBatches.length} batches</span>
                  </div>
                  <div className={`table batch-table ${role === 'superadmin' || data.priceVisibility.show_purchase_price_shopkeeper ? 'with-price' : 'without-price'}`}>
                    {visibleBatches.length ? visibleBatches.map((batch) => (
                      <div className="row" key={batch.id}>
                        <span className="batch-product"><b title={fullModelList(batch)}>{productName(batch)}</b><small>{batch.brand} · {batch.colour || 'No colour'} · {batch.received_date}</small></span>
                        {(role === 'superadmin' || data.priceVisibility.show_purchase_price_shopkeeper) && <span className="inventory-metric"><small>Purchase price</small><strong>{priceLabel(batch.purchase_price)}</strong></span>}
                        <span className="inventory-metric"><small>Inventory source</small><strong>{batch.assigned_user_name || 'Main warehouse shared stock'}</strong></span>
                        <span className="inventory-metric"><small>Remaining</small><strong className={`status-badge ${batch.quantity_remaining <= 3 ? 'low-stock' : 'stock-ok'}`}>{batch.quantity_remaining} / {batch.quantity_received}</strong></span>
                      </div>
                    )) : <Empty title="No matching price batches" />}
                  </div>
                </section>
                  </>
                )}
              </section>
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
                    <Select label="Customer" value={forms.sale.customer_id} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, customer_id: v } })} options={data.customers.map((c) => [c.id, c.name])} />
                    
                    <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/30 space-y-4">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Items Purchased</span>
                      {(forms.sale.items || [{ product_id: '', quantity: 1, total_amount: '' }]).map((item, idx) => (
                        <div key={idx} className="flex items-end gap-3 bg-white border border-slate-150 p-4 rounded-xl shadow-sm relative">
                          <div className="flex-1">
                            <Select 
                              label="Item bought" 
                              value={item.product_id} 
                              onChange={(v) => updateSaleItemProduct(idx, v)} 
                              options={data.stock.filter((s) => s.quantity > 0 || String(s.product_id) === String(item.product_id)).map((p) => [p.product_id, `${productName(p)} · ${p.quantity} pcs left`])}
                            />
                          </div>
                          <div style={{ width: '220px' }}>
                            <Select
                              label="Price batch (FIFO if blank)"
                              value={item.batch_id || ''}
                              onChange={(v) => updateSaleItemBatch(idx, v)}
                              options={data.batches.filter((batch) => String(batch.product_id) === String(item.product_id) && Number(batch.quantity_remaining) > 0).map((batch) => [
                                batch.id,
                                `${batch.received_date} · ${batch.quantity_remaining} left${role === 'superadmin' || data.priceVisibility.show_purchase_price_shopkeeper ? ` · ${priceLabel(batch.purchase_price)}` : ''}`,
                              ])}
                            />
                          </div>
                          <div style={{ width: '120px' }}>
                            <Input label="Quantity" type="number" value={item.quantity} onChange={(v) => updateSaleItemQuantity(idx, v)} />
                          </div>
                          <div style={{ width: '160px' }}>
                            <Input label="Total price" type="number" value={item.total_amount} onChange={(v) => updateSaleItemPrice(idx, v)} />
                          </div>
                          {(forms.sale.items || []).length > 1 && (
                            <button 
                              type="button" 
                              className="soft !min-h-[48px] !px-3 text-red-600 hover:text-red-800 border-red-200 hover:border-red-300"
                              onClick={() => removeSaleItem(idx)}
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button 
                        type="button" 
                        className="soft !px-4 !py-2 text-xs font-bold mt-2" 
                        onClick={addSaleItem}
                      >
                        + Add Another Display/Item
                      </button>
                    </div>
                  </div>

                  <Input label="Total bill amount (Auto-calculated)" type="number" className="md:col-span-2" value={forms.sale.total_amount} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, total_amount: v } })} />
                  <Input label="Paid now" type="number" className="md:col-span-1" value={forms.sale.paid_amount} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, paid_amount: v } })} />
                  <Input label="Due date" type="date" className="md:col-span-1" value={forms.sale.due_date} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, due_date: v } })} />
                </FormPanel>
                <CardGrid items={data.customers} render={(customer) => {
                  const customerSales = data.sales.filter((sale) => Number(sale.customer_id) === Number(customer.id)).slice(0, 3);
                  return (
                    <>
                      <div className="card-icon-wrapper">
                        <Contact size={18} />
                      </div>
                      <h3>{customer.name}</h3>
                      <p>{customer.mobile}</p>
                      <div className="metrics"><span>{customer.address || 'No address'}</span><span>{currency(customer.pending)}</span></div>
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
              </section>
            </PageWrapper>
          )}

          {active === 'sales' && (
            <PageWrapper activeKey="sales" key="sales">
              <section className="space">
                <FormPanel title="Create sale" action="Create sale" onSubmit={() => submitSale('sales')}>
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '16px' }}>
                    <Select label="Customer" value={forms.sale.customer_id} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, customer_id: v } })} options={data.customers.map((c) => [c.id, c.name])} />
                    
                    <div className="border border-slate-100 rounded-2xl p-5 bg-slate-50/30 space-y-4">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Items Purchased</span>
                      {(forms.sale.items || [{ product_id: '', quantity: 1, total_amount: '' }]).map((item, idx) => (
                        <div key={idx} className="flex items-end gap-3 bg-white border border-slate-150 p-4 rounded-xl shadow-sm relative">
                          <div className="flex-1">
                            <Select 
                              label="Item bought" 
                              value={item.product_id} 
                              onChange={(v) => updateSaleItemProduct(idx, v)} 
                              options={data.stock.filter((s) => s.quantity > 0 || String(s.product_id) === String(item.product_id)).map((p) => [p.product_id, `${productName(p)} · ${p.quantity} pcs left`])}
                            />
                          </div>
                          <div style={{ width: '220px' }}>
                            <Select
                              label="Price batch (FIFO if blank)"
                              value={item.batch_id || ''}
                              onChange={(v) => updateSaleItemBatch(idx, v)}
                              options={data.batches.filter((batch) => String(batch.product_id) === String(item.product_id) && Number(batch.quantity_remaining) > 0).map((batch) => [
                                batch.id,
                                `${batch.received_date} · ${batch.quantity_remaining} left${role === 'superadmin' || data.priceVisibility.show_purchase_price_shopkeeper ? ` · ${priceLabel(batch.purchase_price)}` : ''}`,
                              ])}
                            />
                          </div>
                          <div style={{ width: '120px' }}>
                            <Input label="Quantity" type="number" value={item.quantity} onChange={(v) => updateSaleItemQuantity(idx, v)} />
                          </div>
                          <div style={{ width: '160px' }}>
                            <Input label="Total price" type="number" value={item.total_amount} onChange={(v) => updateSaleItemPrice(idx, v)} />
                          </div>
                          {(forms.sale.items || []).length > 1 && (
                            <button 
                              type="button" 
                              className="soft !min-h-[48px] !px-3 text-red-600 hover:text-red-800 border-red-200 hover:border-red-300"
                              onClick={() => removeSaleItem(idx)}
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button 
                        type="button" 
                        className="soft !px-4 !py-2 text-xs font-bold mt-2" 
                        onClick={addSaleItem}
                      >
                        + Add Another Display/Item
                      </button>
                    </div>
                  </div>

                  <Input label="Total bill amount (Auto-calculated)" type="number" className="md:col-span-2" value={forms.sale.total_amount} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, total_amount: v } })} />
                  <Input label="Paid amount" type="number" className="md:col-span-1" value={forms.sale.paid_amount} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, paid_amount: v } })} />
                  <Input label="Due date" type="date" className="md:col-span-1" value={forms.sale.due_date} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, due_date: v } })} />
                </FormPanel>
                {data.sales.length ? (
                  <motion.div 
                    variants={listVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-10px" }}
                    className="table panel"
                  >
                    {data.sales.map((sale) => (
                      <motion.div variants={itemVariants} className="row" key={sale.id}>
                        <span><b>{sale.customer_name}</b><small title={sale.product_name}>{productName(sale)}</small></span>
                        <span>{currency(sale.total_amount)}</span>
                        <span>{currency(sale.paid_amount)}</span>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <strong className={`status-badge ${sale.pending_amount > 0 ? 'pending' : 'paid'}`}>{currency(sale.pending_amount)}</strong>
                          <button className="soft" onClick={() => printTaxInvoicePDF(sale)}><ReceiptText size={16} /> Invoice</button>
                        </span>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <Empty title="No sales records found" />
                )}
              </section>
            </PageWrapper>
          )}

          {active === 'requests' && (
            <PageWrapper activeKey="requests" key="requests">
              <section className="space">
                {role === 'shopkeeper' && (
                  <FormPanel title="Request stock from owner" action={saving ? 'Sending...' : 'Send request'} onSubmit={submitRequest} disabled={saving}>
                    <Select label="Known product" className="md:col-span-2" value={forms.request.product_id} onChange={(v) => setForms({ ...forms, request: { ...forms.request, product_id: v } })} options={data.products.map((p) => [p.id, `${productName(p)} · ${priceLabel(p.official_price)}`])} />
                    <Input label="New model name" className="md:col-span-2" value={forms.request.model_name} onChange={(v) => setForms({ ...forms, request: { ...forms.request, model_name: v } })} />
                    <Input label="Quantity needed" type="number" className="md:col-span-1" value={forms.request.quantity} onChange={(v) => setForms({ ...forms, request: { ...forms.request, quantity: v } })} />
                    <Input label="Message" className="md:col-span-3" value={forms.request.message} onChange={(v) => setForms({ ...forms, request: { ...forms.request, message: v } })} />
                  </FormPanel>
                )}
                <motion.div 
                  variants={listVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-10px" }}
                  className="request-list"
                >
                  {data.requests.map((request) => (
                    <motion.article 
                      variants={itemVariants}
                      className="panel request-card" 
                      key={request.id}
                    >
                      <div className="request-main">
                        <div className="card-icon-wrapper cyan">
                          <Send size={18} />
                        </div>
                        <div>
                          <h3 title={request.product_name || request.model_name}>{productName(request)}</h3>
                          <p>{request.shop_name} · {request.shop_area}</p>
                          {request.message && <small>{request.message}</small>}
                        </div>
                      </div>
                      <div className="request-metrics">
                        <span><b>{request.quantity}</b><small>Needed</small></span>
                        <span><b>{request.shop_quantity}</b><small>In shop</small></span>
                        <span><b>{request.total_available}</b><small>All shops</small></span>
                      </div>
                      <div className="request-actions">
                        <span className={`status-badge ${request.status === 'open' ? 'pending' : request.status === 'sent' ? 'due' : 'paid'}`}>{request.status}</span>
                        {role === 'superadmin' && (
                          <div className="actions">
                            <button className="soft" type="button" onClick={() => updateRequestStatus(request.id, 'sent')}>Mark sent</button>
                            <button className="primary" type="button" onClick={() => updateRequestStatus(request.id, 'closed')}>Close</button>
                          </div>
                        )}
                      </div>
                    </motion.article>
                  ))}
                  {!data.requests.length && <Empty title="No stock requests yet" />}
                </motion.div>
              </section>
            </PageWrapper>
          )}

          {active === 'payments' && (
            <PageWrapper activeKey="payments" key="payments">
              <section className="space">
                <motion.div 
                  variants={listVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-10px" }}
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
                              <strong>{currency(sale.pending_amount)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.article>
                  ))}
                  {!data.pending.length && <Empty title="No pending payments" />}
                </motion.div>
              </section>
            </PageWrapper>
          )}

          {active === 'reports' && data.reports && (
            <PageWrapper activeKey="reports" key="reports">
              <section className="two-col">
                <section className="panel">
                  <h2>Pending by shop</h2>
                  <div className="table">
                    {data.reports.pendingByShop.length ? data.reports.pendingByShop.map((row) => (
                      <div className="row" key={row.shop_name}>
                        <span>{row.shop_name}</span>
                        <strong>{currency(row.pending)}</strong>
                      </div>
                    )) : <Empty title="No pending payments by shop" />}
                  </div>
                </section>
                <section className="panel audit-history-panel">
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
                  <div className="table audit-table">
                    {data.reports.auditRows.length ? data.reports.auditRows.map((row) => (
                      <div className="row audit-row" key={row.id}>
                        <span><b>{row.action}</b><small>{row.actor_name} · {row.created_at}</small></span>
                        <span className="audit-details">{row.details}</span>
                      </div>
                    )) : <Empty title="No audit logs available" />}
                  </div>
                </section>
              </section>
            </PageWrapper>
          )}

          {active === 'catalog' && (
            <PageWrapper activeKey="catalog" key="catalog">
              <section className="space">
                <div className="catalog-toolbar panel">
                  <div className="searchbox"><Search size={18} /><input placeholder="Search brand or model" value={catalogFilters.search} onChange={(e) => setCatalogFilters({ ...catalogFilters, search: e.target.value })} /></div>
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
                    <strong>{priceLabel(product.retail_price || product.sale_price || product.official_price)}</strong>
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
                              <div className="row text-sm hover:bg-slate-50/40" key={item.id} style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                                <span><b title={fullModelList(item)}>{productName(item)}</b><small>{item.brand}</small></span>
                                <span className="font-semibold text-slate-600">{priceLabel(item.official_price)}</span>
                                <strong className={`status-badge ${item.quantity <= 3 ? 'low-stock' : 'stock-ok'}`}>{item.quantity} pcs</strong>
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

        <AnimatePresence>
          {selectedProductDetails && (
            <div className="drawer-layer" role="presentation">
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="drawer-mask" 
                type="button" 
                aria-label="Close details drawer" 
                onClick={() => setSelectedProductDetails(null)} 
              />
              <motion.aside 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="transfer-drawer" 
                role="dialog" 
                aria-modal="true" 
                aria-labelledby="product-details-title"
                style={{ width: 'min(500px, 100%)', overflowY: 'auto' }}
              >
                <div className="drawer-head flex items-start gap-4 pb-5 border-b border-slate-100 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center shrink-0">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase font-black text-cyan-600 tracking-widest leading-none block mb-1">
                      {selectedProductDetails.brand || 'No Brand'} · {selectedProductDetails.category}
                    </span>
                    <h2 id="product-details-title" className="text-xl font-extrabold text-slate-800 truncate">
                      {productName(selectedProductDetails)}
                    </h2>
                  </div>
                  <button type="button" className="icon" onClick={() => setSelectedProductDetails(null)}>
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Compatible Models</span>
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-700 text-sm font-semibold whitespace-pre-wrap leading-relaxed">
                      {fullModelList(selectedProductDetails)}
                    </div>
                  </div>

                  {selectedProductDetails.description && (
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Description</span>
                      <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                        {selectedProductDetails.description}
                      </p>
                    </div>
                  )}

                  {selectedProductDetails.colours?.length > 0 && (
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Available Colours</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedProductDetails.colours.map((colour) => (
                          <span key={colour} className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-extrabold shadow-sm">
                            {colour}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-3">Pricing details</span>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 divide-y divide-slate-100">
                      {(role === 'superadmin' || (role === 'shopkeeper' && data.priceVisibility.show_official_price_shopkeeper)) && <div className="flex justify-between items-center py-2.5">
                        <span className="text-sm font-bold text-slate-500">Official Price</span>
                        <strong className="text-slate-800 font-extrabold text-base">{priceLabel(selectedProductDetails.official_price)}</strong>
                      </div>}
                      {role !== 'customer' && <div className="flex justify-between items-center py-2.5">
                        <span className="text-sm font-bold text-slate-500">Sale Price</span>
                        <strong className="text-slate-800 font-extrabold text-base">{priceLabel(selectedProductDetails.sale_price)}</strong>
                      </div>}
                      <div className="flex justify-between items-center py-2.5">
                        <span className="text-sm font-bold text-slate-500">Retail Price</span>
                        <strong className="text-slate-800 font-extrabold text-base">{priceLabel(selectedProductDetails.retail_price)}</strong>
                      </div>
                      {(role === 'superadmin' || data.priceVisibility.show_purchase_price_shopkeeper) && selectedProductDetails.purchase_price !== undefined && selectedProductDetails.purchase_price !== null && (
                        <div className="flex justify-between items-center py-2.5">
                          <span className="text-sm font-bold text-slate-500">Purchase Price</span>
                          <strong className="text-rose-600 font-extrabold text-base">{priceLabel(selectedProductDetails.purchase_price)}</strong>
                        </div>
                      )}
                      {(role === 'superadmin' || data.priceVisibility.show_wholesale_price_shopkeeper) && selectedProductDetails.wholesale_price !== undefined && selectedProductDetails.wholesale_price !== null && (
                        <div className="flex justify-between items-center py-2.5">
                          <span className="text-sm font-bold text-slate-500">Wholesale Price</span>
                          <strong className="text-indigo-600 font-extrabold text-base">{priceLabel(selectedProductDetails.wholesale_price)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>
        <ConfirmationDialog
          dialog={confirmDialog}
          saving={saving}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={runConfirmedAction}
        />
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
  return <label className={className}>{label}<input {...inputProps} type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Select({ label, value, onChange, options, placeholder = 'Select', className = '' }) {
  return (
    <label className={className}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function CardGrid({ items, render, className = '', onItemClick }) {
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
      {!items.length && <Empty title="No records yet" />}
    </div>
  );
}

export default App;
