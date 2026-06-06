import React, { useDeferredValue, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Contact,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  FileText,
  IndianRupee,
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
  UserCog,
  Users,
  X,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = async (path, options = {}, token = '') => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

const currency = (value) => `\u20b9${Number(value || 0).toLocaleString('en-IN')}`;
const navByRole = {
  superadmin: [
    ['dashboard', 'Dashboard', BarChart3],
    ['shops', 'Shops', Building2],
    ['shopkeepers', 'Shopkeepers', UserCog],
    ['prices', 'Prices', IndianRupee],
    ['models', 'Models', Smartphone],
    ['stock', 'Stock', Package],
    ['customers', 'Customers', Users],
    ['requests', 'Requests', Send],
    ['payments', 'Pending', CreditCard],
    ['reports', 'Reports', FileText],
  ],
  shopkeeper: [
    ['dashboard', 'Dashboard', BarChart3],
    ['stock', 'Stock', Package],
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
  product: { name: '', brand: '', category: 'Display', official_price: '', opening_stock: '', description: '' },
  stock: { product_id: '', quantity: '' },
  customer: { name: '', mobile: '', address: '', notes: '' },
  sale: { product_id: '', customer_id: '', quantity: 1, total_amount: '', paid_amount: '', due_date: '2026-06-15', notes: '', items: [{ product_id: '', quantity: 1, total_amount: '' }] },
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

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      onLogin(await api('/auth/login', { method: 'POST', body: JSON.stringify(form) }));
    } catch (err) {
      setError(err.message);
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
          <button className="primary" type="submit"><ShieldCheck size={18} /> Login</button>
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
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem('session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.name === 'Father - Super Admin') {
      parsed.name = 'Super Admin';
    }
    return parsed;
  });
  const [active, setActive] = useState(session?.role === 'customer' ? 'catalog' : 'dashboard');
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState({
    dashboard: null,
    shops: [],
    shopkeepers: [],
    products: [],
    stock: [],
    customers: [],
    sales: [],
    requests: [],
    pending: [],
    reports: null,
    catalog: [],
  });
  const [selectedShop, setSelectedShop] = useState('');
  const [forms, setForms] = useState(initialForms);
  const [catalogFilters, setCatalogFilters] = useState({ search: '', brand: '', shopId: '', min: '', max: '' });
  const [modelSearch, setModelSearch] = useState('');
  const [transferDrawerOpen, setTransferDrawerOpen] = useState(false);
  const [expandedPaymentId, setExpandedPaymentId] = useState('');
  const deferredCatalogFilters = useDeferredValue(catalogFilters);

  // Reset to Light Mode on mount
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('theme');
  }, []);

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

  const authedFetch = (path, options = {}) => api(path, options, token);
  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2600);
  };
  const requireShopSelection = (message = 'Select a specific shop first') => {
    if (role === 'superadmin' && !shopId) {
      showToast(message);
      return false;
    }
    return true;
  };
  const handleLoadError = (error, fallback = 'Unable to load data right now') => {
    const message = error?.message || fallback;
    setLoadError(message);
    showToast(message);
  };

  const clearAuditLogs = async () => {
    if (!window.confirm('Are you sure you want to permanently clear all audit history?')) return;
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
  };

  const loadCore = async () => {
    if (!session) return;
    setLoading(true);
    setLoadError('');
    try {
      const [shops, products] = await Promise.all([
        authedFetch('/shops'),
        role === 'customer' ? api('/catalog') : authedFetch('/products'),
      ]);
      setData((prev) => ({ ...prev, shops, products, catalog: role === 'customer' ? products : prev.catalog }));
      if (!selectedShop && role === 'superadmin' && shops[0]) setSelectedShop(String(shops[0].id));
      await loadTab(active, selectedShop || shops[0]?.id || '');
    } catch (error) {
      handleLoadError(error, 'Unable to load the workspace. Check whether the local servers are running.');
    } finally {
      setLoading(false);
    }
  };

  const loadTab = async (tab = active, currentShop = shopId) => {
    if (!session) return;
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
      if (tab === 'stock' && currentShop) set('stock', await authedFetch(`/stock?shopId=${currentShop}`));
      if (tab === 'customers' && currentShop) {
        const [stock, customers, sales] = await Promise.all([
          authedFetch(`/stock?shopId=${currentShop}`),
          authedFetch(`/customers?shopId=${currentShop}`),
          authedFetch(`/sales?shopId=${currentShop}`),
        ]);
        setData((prev) => ({ ...prev, stock, customers, sales }));
      }
      if (tab === 'sales' && currentShop) {
        const [stock, customers, sales] = await Promise.all([
          authedFetch(`/stock?shopId=${currentShop}`),
          authedFetch(`/customers?shopId=${currentShop}`),
          authedFetch(`/sales?shopId=${currentShop}`),
        ]);
        setData((prev) => ({ ...prev, stock, customers, sales }));
      }
      if (tab === 'requests') set('requests', await authedFetch(`/stock-requests${scoped}`));
      if (tab === 'payments') set('pending', await authedFetch(`/pending-payments${scoped}`));
      if (tab === 'reports') set('reports', await authedFetch(`/reports${scoped}`));
      if (tab === 'catalog') set('catalog', await api(`/catalog?${new URLSearchParams(catalogFilters).toString()}`));
    } catch (error) {
      handleLoadError(error, 'Unable to refresh this page right now.');
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
        pending,
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

  const handleDeleteShop = async () => {
    if (!window.confirm('Are you sure you want to delete this shop? This will delete all associated stock, transactions, and customers.')) {
      return;
    }
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
    if (session) loadCore();
  }, [session]);

  useEffect(() => {
    if (session) loadTab(active, shopId);
  }, [active, selectedShop]);

  const login = (nextSession) => {
    localStorage.setItem('session', JSON.stringify(nextSession));
    setSession(nextSession);
    setActive(nextSession.role === 'customer' ? 'catalog' : 'dashboard');
  };

  const logout = () => {
    localStorage.removeItem('session');
    setSession(null);
    setActive('dashboard');
  };

  const submitShopkeeper = async () => {
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
        body: JSON.stringify({ ...forms.shopkeeper, shop_id: currentShopId }) 
      });
      setForms((prev) => ({ ...prev, shopkeeper: initialForms.shopkeeper }));
      showToast('Shopkeeper created successfully!');
      await loadCore();
    } catch (error) {
      showToast(error.message || 'Unable to save right now');
    } finally {
      setSaving(false);
    }
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
      showToast('Stock updated');
      await loadTab('stock', shopId);
    } catch (error) {
      showToast(error.message || 'Unable to update stock right now');
    } finally {
      setSaving(false);
    }
  };

  const salePriceFor = (productId) => {
    const stockItem = data.stock.find((item) => String(item.product_id) === String(productId));
    const product = data.products.find((item) => String(item.id) === String(productId));
    return Number(stockItem?.official_price || product?.official_price || 0);
  };

  const updateSaleItemProduct = (index, productId) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', quantity: 1, total_amount: '' }])];
    const qty = Math.max(Number(currentItems[index]?.quantity || 1), 1);
    const price = salePriceFor(productId);
    
    currentItems[index] = {
      product_id: productId,
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

  const updateSaleItemQuantity = (index, quantity) => {
    const currentItems = [...(forms.sale.items || [{ product_id: '', quantity: 1, total_amount: '' }])];
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
    const currentItems = [...(forms.sale.items || [{ product_id: '', quantity: 1, total_amount: '' }])];
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
    const currentItems = [...(forms.sale.items || [{ product_id: '', quantity: 1, total_amount: '' }])];
    currentItems.push({ product_id: '', quantity: 1, total_amount: '' });
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
          items: [{ product_id: '', quantity: 1, total_amount: '' }],
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

  const recordPayment = async (sale) => {
    const amount = forms.payment.sale_id === String(sale.id) ? forms.payment.amount : '';
    if (!amount) return showToast('Enter payment amount first');
    try {
      setSaving(true);
      await authedFetch('/payments', { method: 'POST', body: JSON.stringify({ sale_id: sale.id, amount, note: forms.payment.note }) });
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
    const payload = {
      name: forms.product.name.trim(),
      brand: forms.product.brand.trim(),
      category: forms.product.category.trim(),
      official_price: Number(forms.product.official_price),
      description: forms.product.description.trim(),
    };

    if (!payload.name || !payload.brand || !payload.category || !Number.isFinite(payload.official_price) || payload.official_price <= 0) {
      return showToast('Enter model, brand, category, and a valid official price');
    }
    if (!Number.isInteger(openingStock) || openingStock < 0) {
      return showToast('Opening stock must be 0 or more');
    }
    if (openingStock > 0 && !requireShopSelection('Select a shop before adding opening stock')) {
      return;
    }

    try {
      setSaving(true);
      const created = await authedFetch('/products', { method: 'POST', body: JSON.stringify(payload) });
      if (openingStock > 0) {
        await authedFetch('/stock', {
          method: 'PUT',
          body: JSON.stringify({ shop_id: shopId, product_id: created.id, quantity: openingStock }),
        });
      }
      setForms((prev) => ({ ...prev, product: initialForms.product }));
      showToast(openingStock > 0 ? 'Product added with opening stock' : 'Product price added');
      await loadCore();
    } catch (error) {
      showToast(error.message || 'Unable to add product right now');
    } finally {
      setSaving(false);
    }
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
        <td><strong>${item.name}</strong><br><small style="color: #64748b;">${item.brand} · ${item.category || 'Mobile'}</small></td>
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
                    <strong>${sale.product_name || 'Display Replacement'}</strong>
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

  const modelItems = (role === 'customer' ? data.catalog : data.products).filter((item) => {
    const query = modelSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.name, item.brand, item.category, item.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const visibleCatalog = data.catalog.filter((product) => {
    const query = deferredCatalogFilters.search.trim().toLowerCase();
    const matchesSearch = !query || [product.name, product.brand, product.category, product.description]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
    const matchesShop = !deferredCatalogFilters.shopId || String(product.available_shops || '').toLowerCase().includes(
      data.shops.find((shop) => String(shop.id) === String(deferredCatalogFilters.shopId))?.name.toLowerCase() || ''
    );
    return matchesSearch && matchesShop;
  });

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
                onClick={() => { setActive(id); setOpen(false); }}
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
              className="toast"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {loading && <SkeletonPage type={active === 'dashboard' ? 'dashboard' : 'list'} />}
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
                      className="table"
                    >
                      {data.dashboard.shopWise.map((shop) => (
                        <motion.div variants={itemVariants} className="row" key={shop.id}>
                          <span><b>{shop.name}</b><small>{shop.area}</small></span>
                          <span>{shop.stock} pcs</span>
                          <span>{currency(shop.pending)}</span>
                          <strong>{currency(shop.sales_today)}</strong>
                        </motion.div>
                      ))}
                    </motion.div>
                  </section>
                  <section className="panel">
                    <h2>Low stock alerts</h2>
                    <motion.div 
                      variants={listVariants}
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: "-10px" }}
                      className="table"
                    >
                      {data.dashboard.lowStock.length ? data.dashboard.lowStock.map((item) => (
                        <motion.div variants={itemVariants} className="alert-row" key={item.id}>
                          <AlertTriangle size={17} />
                          <span><b>{item.product_name}</b><small>{item.shop_name}</small></span>
                          <strong className="status-badge low-stock">{item.quantity} left</strong>
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
                  <Input label="Shop name" value={forms.shop.name} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, name: v } })} />
                  <Input label="Area" value={forms.shop.area} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, area: v } })} />
                  <Input label="Address" value={forms.shop.address} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, address: v } })} />
                  <Input label="Phone" value={forms.shop.phone} onChange={(v) => setForms({ ...forms, shop: { ...forms.shop, phone: v } })} />
                </FormPanel>
                <CardGrid 
                  items={data.shops} 
                  onItemClick={role === 'superadmin' ? viewShopDetails : null}
                  render={(shop) => (
                    <>
                      <div className="card-icon-wrapper">
                        <Store size={18} />
                      </div>
                      <h3>{shop.name}</h3>
                      <p>{shop.area}</p>
                      <div className="metrics"><span>{shop.stock} pcs</span><span>{currency(shop.pending)}</span></div>
                    </>
                  )} 
                />
              </section>
            </PageWrapper>
          )}

          {active === 'shopkeepers' && (
            <PageWrapper activeKey="shopkeepers" key="shopkeepers">
              <section className="space">
                <FormPanel title="Create shopkeeper login" action="Create login" onSubmit={submitShopkeeper}>
                  <Input label="Name" value={forms.shopkeeper.name} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, name: v } })} />
                  <Input label="Mobile" value={forms.shopkeeper.contact} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, contact: v } })} />
                  <Input label="Username" value={forms.shopkeeper.username} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, username: v } })} />
                  <Input label="Password" value={forms.shopkeeper.password} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, password: v } })} />
                  <Select label="Shop" value={forms.shopkeeper.shop_id} onChange={(v) => setForms({ ...forms, shopkeeper: { ...forms.shopkeeper, shop_id: v } })} options={[...data.shops.map((s) => [s.id, s.name]), ['new_shop', '+ Add New Shop']]} />
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
                <motion.div 
                  variants={listVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-10px" }}
                  className="table panel"
                >
                  {data.shopkeepers.map((user) => (
                    <motion.div variants={itemVariants} className="row" key={user.id}>
                      <span><b>{user.name}</b><small>@{user.username}</small></span>
                      <span>{user.contact}</span>
                      <strong>{user.shop_name}</strong>
                    </motion.div>
                  ))}
                </motion.div>
              </section>
            </PageWrapper>
          )}

          {active === 'prices' && (
            <PageWrapper activeKey="prices" key="prices">
              <section className="space">
                {role === 'superadmin' && (
                  <FormPanel title="Add product and official price" action={saving ? 'Saving...' : 'Add product'} onSubmit={submitProduct} disabled={saving}>
                    <Input label="Model" value={forms.product.name} onChange={(v) => setForms({ ...forms, product: { ...forms.product, name: v } })} />
                    <Input label="Brand" value={forms.product.brand} onChange={(v) => setForms({ ...forms, product: { ...forms.product, brand: v } })} />
                    <Input label="Category" value={forms.product.category} onChange={(v) => setForms({ ...forms, product: { ...forms.product, category: v } })} />
                    <Input label="Official price" type="number" value={forms.product.official_price} onChange={(v) => setForms({ ...forms, product: { ...forms.product, official_price: v } })} />
                    <Input label="Opening stock" type="number" value={forms.product.opening_stock} onChange={(v) => setForms({ ...forms, product: { ...forms.product, opening_stock: v } })} />
                    <Input label="Description" value={forms.product.description} onChange={(v) => setForms({ ...forms, product: { ...forms.product, description: v } })} />
                  </FormPanel>
                )}
                <CardGrid items={data.products} render={(product) => (
                  <>
                    <div className="card-icon-wrapper indigo">
                      <IndianRupee size={18} />
                    </div>
                    <h3>{product.name}</h3>
                    <p>{product.brand} · {product.category}</p>
                    <strong>{currency(product.official_price)}</strong>
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

                <div className="card-grid models-grid">
                  {modelItems.map((product, index) => (
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
                      className="panel card model-card" 
                      key={product.id}
                    >
                      <div className="model-head">
                        <div className="model-mark">
                          <Smartphone size={20} />
                        </div>
                        <span className="status-badge stock-ok">{product.category}</span>
                      </div>
                      <h3>{product.name}</h3>
                      <p>{product.brand}</p>
                      <strong>{currency(product.official_price)}</strong>
                      <div className="model-meta">
                        <span>{product.description || 'Official model entry in the catalog.'}</span>
                        {role === 'customer' && (
                          <small>{product.available_shops || 'Availability updates per shop'}</small>
                        )}
                      </div>
                    </motion.article>
                  ))}
                  {!modelItems.length && <Empty title="No matching models found" />}
                </div>
              </section>
            </PageWrapper>
          )}

          {active === 'stock' && (
            <PageWrapper activeKey="stock" key="stock">
              <section className="space">
                <FormPanel title="Set available stock quantity" action="Save quantity" onSubmit={updateStock}>
                  <Select label="Product" value={forms.stock.product_id} onChange={(v) => setForms({ ...forms, stock: { ...forms.stock, product_id: v } })} options={data.products.map((p) => [p.id, `${p.name} · ${currency(p.official_price)}`])} />
                  <Input label="Available quantity" type="number" value={forms.stock.quantity} onChange={(v) => setForms({ ...forms, stock: { ...forms.stock, quantity: v } })} />
                </FormPanel>
                {role === 'superadmin' && (
                  <section className="panel transfer-launch">
                    <div>
                      <h2>Branch stock transfer</h2>
                      <p>Move available inventory between branches without leaving the stock workspace.</p>
                    </div>
                    <button className="primary" type="button" onClick={() => setTransferDrawerOpen(true)}><Send size={17} /> Transfer stock</button>
                  </section>
                )}
                <motion.div 
                  variants={listVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-10px" }}
                  className="table panel"
                >
                  {data.stock.map((item) => (
                    <motion.div variants={itemVariants} className="row" key={item.id}>
                      <span><b>{item.name}</b><small>{item.brand}</small></span>
                      <span>{currency(item.official_price)}</span>
                      <strong className={`status-badge ${item.quantity <= 3 ? 'low-stock' : 'stock-ok'}`}>{item.quantity} pcs</strong>
                    </motion.div>
                  ))}
                </motion.div>
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
                  <Input label="Name" value={forms.customer.name} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, name: v } })} />
                  <Input label="Mobile" value={forms.customer.mobile} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, mobile: v } })} />
                  <Input label="Address" value={forms.customer.address} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, address: v } })} />
                  <Input label="Notes" value={forms.customer.notes} onChange={(v) => setForms({ ...forms, customer: { ...forms.customer, notes: v } })} />
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
                              options={data.stock.filter((s) => s.quantity > 0 || String(s.product_id) === String(item.product_id)).map((p) => [p.product_id, `${p.name} · ${p.quantity} pcs left`])} 
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

                  <Input label="Total bill amount (Auto-calculated)" type="number" value={forms.sale.total_amount} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, total_amount: v } })} />
                  <Input label="Paid now" type="number" value={forms.sale.paid_amount} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, paid_amount: v } })} />
                  <Input label="Due date" type="date" value={forms.sale.due_date} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, due_date: v } })} />
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
                            <span>{sale.product_name} x {sale.quantity}</span>
                            <strong>{currency(sale.pending_amount)}</strong>
                          </div>
                        ))}
                        {!customerSales.length && <small>No purchases yet</small>}
                      </div>
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
                              options={data.stock.filter((s) => s.quantity > 0 || String(s.product_id) === String(item.product_id)).map((p) => [p.product_id, `${p.name} · ${p.quantity} pcs left`])} 
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

                  <Input label="Total bill amount (Auto-calculated)" type="number" value={forms.sale.total_amount} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, total_amount: v } })} />
                  <Input label="Paid amount" type="number" value={forms.sale.paid_amount} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, paid_amount: v } })} />
                  <Input label="Due date" type="date" value={forms.sale.due_date} onChange={(v) => setForms({ ...forms, sale: { ...forms.sale, due_date: v } })} />
                </FormPanel>
                <motion.div 
                  variants={listVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-10px" }}
                  className="table panel"
                >
                  {data.sales.map((sale) => (
                    <motion.div variants={itemVariants} className="row" key={sale.id}>
                      <span><b>{sale.customer_name}</b><small>{sale.product_name}</small></span>
                      <span>{currency(sale.total_amount)}</span>
                      <span>{currency(sale.paid_amount)}</span>
                      <strong className={`status-badge ${sale.pending_amount > 0 ? 'pending' : 'paid'}`}>{currency(sale.pending_amount)}</strong>
                    </motion.div>
                  ))}
                </motion.div>
              </section>
            </PageWrapper>
          )}

          {active === 'requests' && (
            <PageWrapper activeKey="requests" key="requests">
              <section className="space">
                {role === 'shopkeeper' && (
                  <FormPanel title="Request stock from owner" action={saving ? 'Sending...' : 'Send request'} onSubmit={submitRequest} disabled={saving}>
                    <Select label="Known product" value={forms.request.product_id} onChange={(v) => setForms({ ...forms, request: { ...forms.request, product_id: v } })} options={data.products.map((p) => [p.id, `${p.name} · ${currency(p.official_price)}`])} />
                    <Input label="New model name" value={forms.request.model_name} onChange={(v) => setForms({ ...forms, request: { ...forms.request, model_name: v } })} />
                    <Input label="Quantity needed" type="number" value={forms.request.quantity} onChange={(v) => setForms({ ...forms, request: { ...forms.request, quantity: v } })} />
                    <Input label="Message" value={forms.request.message} onChange={(v) => setForms({ ...forms, request: { ...forms.request, message: v } })} />
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
                          <h3>{request.product_name || request.model_name}</h3>
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
                        <p>{item.product_name} · {item.shop_name}</p>
                      </div>
                      <strong>{currency(item.pending_amount)}</strong>
                      <span className="status-badge due">Due {item.due_date || 'not set'}</span>
                      <input placeholder="Payment amount" type="number" value={forms.payment.sale_id === String(item.id) ? forms.payment.amount : ''} onChange={(e) => setForms({ ...forms, payment: { ...forms.payment, sale_id: String(item.id), amount: e.target.value } })} />
                      <div className="actions">
                        <button className="soft" type="button" onClick={() => setExpandedPaymentId(expandedPaymentId === String(item.id) ? '' : String(item.id))}><ReceiptText size={17} /> Ledger</button>
                        <a className="soft" href={whatsappLink(item)} target="_blank" rel="noreferrer"><Send size={17} /> WhatsApp</a>
                        <button className="soft" onClick={() => printInvoicePDF(item)}><ReceiptText size={17} /> Invoice</button>
                        <button className="primary" onClick={() => recordPayment(item)}><CreditCard size={17} /> Paid</button>
                      </div>
                      <div className="ledger-panel" aria-hidden={expandedPaymentId !== String(item.id)}>
                        <span><b>Sold</b><strong>{currency(item.total_amount)}</strong></span>
                        <span><b>Paid</b><strong>{currency(item.paid_amount)}</strong></span>
                        <span><b>Pending</b><strong>{currency(item.pending_amount)}</strong></span>
                        <span><b>Quantity</b><strong>{item.quantity || 1} pcs</strong></span>
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
                    {data.reports.pendingByShop.map((row) => <div className="row" key={row.shop_name}><span>{row.shop_name}</span><strong>{currency(row.pending)}</strong></div>)}
                  </div>
                </section>
                <section className="panel">
                  <h2>Audit history</h2>
                  <div className="table">
                    {data.reports.auditRows.map((row) => <div className="row" key={row.id}><span><b>{row.action}</b><small>{row.actor_name} · {row.created_at}</small></span><span>{row.details}</span></div>)}
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
                  <select value={catalogFilters.shopId} onChange={(e) => setCatalogFilters({ ...catalogFilters, shopId: e.target.value })}><option value="">All shops</option>{data.shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <button className="primary" onClick={() => loadTab('catalog')}><Search size={17} /> Search</button>
                </div>
                <CardGrid className="catalog-grid" items={visibleCatalog} render={(product) => (
                  <>
                    <div className="card-icon-wrapper cyan">
                      <ShoppingBag size={18} />
                    </div>
                    <h3>{product.name}</h3>
                    <p>{product.brand} · {product.category}</p>
                    <strong>{currency(product.official_price)}</strong>
                    <small>{product.available_shops || 'Currently unavailable'}</small>
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
                  <Select label="Product" value={forms.transfer.product_id} onChange={(v) => setForms({ ...forms, transfer: { ...forms.transfer, product_id: v } })} options={data.products.map((p) => [p.id, p.name])} />
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
                                <span><b>{item.name}</b><small>{item.brand}</small></span>
                                <span className="font-semibold text-slate-600">{currency(item.official_price)}</span>
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
                                <span><b>{s.customer_name || 'Walk-in'}</b><small>{s.product_name} x {s.quantity}</small></span>
                                <span>{currency(s.total_amount)} <small>Paid: {currency(s.paid_amount)}</small></span>
                                <strong className={`status-badge ${s.pending_amount > 0 ? 'pending' : 'paid'}`}>{currency(s.pending_amount)}</strong>
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
                              <div className="row text-sm hover:bg-slate-50/40" key={row.id} style={{ gridTemplateColumns: '2fr 1fr' }}>
                                <span><b>{row.action}</b><small>{row.actor_name} · {row.created_at}</small></span>
                                <span className="text-slate-600 font-medium">{row.details}</span>
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

function Input({ label, value, onChange, type = 'text' }) {
  return <label>{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function Select({ label, value, onChange, options }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
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
