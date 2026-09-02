import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag, Plus, Search, Eye, X, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, CreditCard, Loader2, Check, Trash2, Package
} from 'lucide-react';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const currency = (v) => `₹${money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const formatDMY = (d) => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : d; };

const STATUS_STYLES = {
  open:            { label: 'Open',           bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  partially_paid:  { label: 'Partial',        bg: '#fef9c3', color: '#92400e', border: '#fcd34d' },
  paid:            { label: 'Paid',           bg: '#dcfce7', color: '#14532d', border: '#86efac' },
  cancelled:       { label: 'Cancelled',      bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.open;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

function BillFormModal({ suppliers, products, onClose, onSaved, api, setGlobalToast, shopId }) {
  const [supplierId, setSupplierId] = useState('');
  const [billDate, setBillDate] = useState(today());
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [paymentMode, setPaymentMode] = useState('credit');
  const [notes, setNotes] = useState('');
  const [extraCharges, setExtraCharges] = useState('');
  const [items, setItems] = useState([{ product_id: '', custom_product_name: '', quantity: 1, unit_price: '', discount_amount: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const addItem = () => setItems(prev => [...prev, { product_id: '', custom_product_name: '', quantity: 1, unit_price: '', discount_amount: 0 }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const productsTotal = items.reduce((s, item) => s + money(Number(item.quantity || 0) * money(item.unit_price || 0) - money(item.discount_amount || 0)), 0);
  const totalAmount = money(productsTotal + money(extraCharges || 0));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const validItems = items.filter(item => (item.product_id || item.custom_product_name?.trim()) && Number(item.quantity) > 0 && Number(item.unit_price) > 0);
    if (!validItems.length) { setError('Add at least one item with quantity and price.'); return; }
    setSaving(true);
    try {
      await api('/purchase-bills', {
        method: 'POST',
        body: JSON.stringify({
          shop_id: shopId,
          supplier_id: supplierId || null,
          bill_date: billDate,
          payment_terms_days: Number(paymentTerms),
          payment_mode: paymentMode,
          notes,
          extra_charges: money(extraCharges || 0),
          items: validItems.map(item => ({
            product_id: item.product_id || null,
            custom_product_name: item.custom_product_name || null,
            quantity: Number(item.quantity),
            unit_price: money(item.unit_price),
            discount_amount: money(item.discount_amount || 0),
          })),
        }),
      });
      setGlobalToast && setGlobalToast({ type: 'success', message: 'Purchase bill created.' });
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to create purchase bill.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', zIndex: 1000, overflowY: 'auto', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 720, boxShadow: '0 25px 60px rgba(0,0,0,0.2)', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <ShoppingBag size={17} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>New Purchase Bill</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Record a vendor invoice</div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#64748b' }}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={14} />{error}
            </div>
          )}

          {/* Top fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Vendor (optional)</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }}>
                <option value="">— No vendor —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Bill Date</label>
              <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Payment Terms (days)</label>
              <input type="number" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} min={0} max={365}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }}>
                {['credit', 'cash', 'upi', 'bank', 'cheque'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Items</span>
              <button type="button" onClick={addItem}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={12} /> Add Item
              </button>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Product / Description', 'Qty', 'Unit Price', 'Discount', 'Total', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const lineTotal = money(Number(item.quantity || 0) * money(item.unit_price || 0) - money(item.discount_amount || 0));
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <select value={item.product_id} onChange={e => { updateItem(i, 'product_id', e.target.value); if (e.target.value) updateItem(i, 'custom_product_name', ''); }}
                            style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, background: '#f8fafc', marginBottom: 4 }}>
                            <option value="">— Custom / type below —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.short_name || p.name}</option>)}
                          </select>
                          {!item.product_id && (
                            <input placeholder="Item description" value={item.custom_product_name} onChange={e => updateItem(i, 'custom_product_name', e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, boxSizing: 'border-box' }} />
                          )}
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <input type="number" min={1} value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)}
                            style={{ width: 60, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <input type="number" min={0} step="0.01" placeholder="0.00" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)}
                            style={{ width: 90, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <input type="number" min={0} step="0.01" placeholder="0.00" value={item.discount_amount} onChange={e => updateItem(i, 'discount_amount', e.target.value)}
                            style={{ width: 80, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a', textAlign: 'right', whiteSpace: 'nowrap' }}>{currency(lineTotal)}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                          {items.length > 1 && (
                            <button type="button" onClick={() => removeItem(i)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626', padding: 4, borderRadius: 6 }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ flex: '1 1 220px' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Extra Charges</label>
              <input type="number" min={0} step="0.01" placeholder="0.00" value={extraCharges} onChange={e => setExtraCharges(e.target.value)}
                style={{ padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Notes</label>
              <input placeholder="Optional notes…" value={notes} onChange={e => setNotes(e.target.value)}
                style={{ padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, background: '#f8fafc', width: 220, boxSizing: 'border-box' }} />
            </div>
            <div style={{ textAlign: 'right', background: '#f8fafc', borderRadius: 12, padding: '12px 18px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Bill Total</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>{currency(totalAmount)}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '10px 22px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{
                padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: '#fff', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(99,102,241,0.4)'
              }}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              {saving ? 'Saving…' : 'Create Bill'}
            </button>
          </div>
        </form>
      </motion.div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

function PayModal({ bill, onClose, onSaved, api, setGlobalToast }) {
  const [amount, setAmount] = useState(String(money(bill.pending_amount)));
  const [mode, setMode] = useState('cash');
  const [payDate, setPayDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handlePay = async (e) => {
    e.preventDefault();
    const amt = money(amount);
    if (amt <= 0) { setError('Enter a valid payment amount.'); return; }
    setSaving(true);
    try {
      await api(`/purchase-bills/${bill.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount: amt, payment_mode: mode, payment_date: payDate }),
      });
      setGlobalToast && setGlobalToast({ type: 'success', message: `Payment of ${currency(amt)} recorded.` });
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16, backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 400, boxShadow: '0 25px 60px rgba(0,0,0,0.2)', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={16} color="#16a34a" /> Pay Against Bill
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: 7, cursor: 'pointer', color: '#64748b' }}><X size={15} /></button>
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{bill.bill_number}</div>
          <div style={{ color: '#64748b', marginTop: 3 }}>Pending: <strong style={{ color: '#dc2626' }}>{currency(bill.pending_amount)}</strong></div>
        </div>
        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={0.01} step="0.01"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 15, fontWeight: 700, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc' }}>
              {['cash', 'upi', 'bank', 'cheque'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Payment Date</label>
            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
              style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={saving}
            style={{
              padding: '11px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', fontSize: 13, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(22,163,74,0.35)'
            }}>
            {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
            {saving ? 'Processing…' : 'Record Payment'}
          </button>
        </form>
      </motion.div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

export default function PurchaseBillsPage({ session, api, setGlobalToast, suppliers = [], products = [] }) {
  const [bills, setBills] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [payingBill, setPayingBill] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const perPage = 20;

  const shopId = session?.shop_id;

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: perPage });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const data = await api(`/purchase-bills?${params}`);
      setBills(data.purchaseBills || data.bills || data.rows || []);
      setTotal(data.totalPurchaseBills || data.total || 0);
    } catch (e) {
      setGlobalToast && setGlobalToast({ type: 'error', message: e.message || 'Failed to load bills.' });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, api]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const toggleExpand = async (billId) => {
    if (expandedId === billId) { setExpandedId(null); setExpandedItems([]); return; }
    setExpandedId(billId);
    setLoadingItems(true);
    try {
      const data = await api(`/purchase-bills/${billId}`);
      setExpandedItems(data.items || []);
    } catch (e) {
      setExpandedItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '16px 12px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <ShoppingBag size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.4 }}>Purchase Bills</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{total} bill{total !== 1 ? 's' : ''} · vendor payables</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{
            padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#7c3aed,#6366f1)', color: '#fff', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(99,102,241,0.4)'
          }}>
          <Plus size={15} /> New Bill
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input placeholder="Search bills or vendor…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '9px 10px 9px 34px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, background: '#f8fafc', boxSizing: 'border-box' }} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="partially_paid">Partial</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={fetchBills} style={{ padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Bills list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#6366f1' }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
          <div style={{ fontWeight: 700, fontSize: 13 }}>Loading bills…</div>
        </div>
      ) : bills.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          <Package size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>No purchase bills yet.</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Click "New Bill" to record your first vendor invoice.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(15,23,42,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Bill No.', 'Vendor', 'Date', 'Due Date', 'Total', 'Paid', 'Pending', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: ['Total', 'Paid', 'Pending'].includes(h) ? 'right' : 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <React.Fragment key={bill.id}>
                  <tr style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s', cursor: 'pointer' }}
                    onMouseEnter={e => { if (e.currentTarget === e.target.closest('tr')) e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { if (e.currentTarget === e.target.closest('tr')) e.currentTarget.style.background = '#fff'; }}>
                    <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 800, color: '#6366f1', fontSize: 12 }}>{bill.bill_number}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: '#0f172a' }}>{bill.supplier_name || <span style={{ color: '#94a3b8', fontWeight: 400 }}>No vendor</span>}</td>
                    <td style={{ padding: '11px 14px', color: '#475569' }}>{formatDMY(bill.bill_date)}</td>
                    <td style={{ padding: '11px 14px', color: '#475569' }}>{formatDMY(bill.due_date)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{currency(bill.total_amount)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{currency(bill.paid_amount)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: money(bill.pending_amount) > 0 ? '#dc2626' : '#16a34a' }}>{currency(bill.pending_amount)}</td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge status={bill.status} /></td>
                    <td style={{ padding: '11px 10px' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {bill.status !== 'paid' && bill.status !== 'cancelled' && (
                          <button onClick={() => setPayingBill(bill)}
                            style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Pay
                          </button>
                        )}
                        <button onClick={() => toggleExpand(bill.id)}
                          style={{ padding: '5px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                          {expandedId === bill.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === bill.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: '0 14px 12px', background: '#f8fafc' }}>
                        {loadingItems ? (
                          <div style={{ padding: '12px 0', color: '#6366f1', fontSize: 12 }}>Loading items…</div>
                        ) : expandedItems.length === 0 ? (
                          <div style={{ padding: '12px 0', color: '#94a3b8', fontSize: 12 }}>No items.</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                {['Product', 'Qty', 'Unit Price', 'Discount', 'Total'].map(h => (
                                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {expandedItems.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '7px 10px', color: '#0f172a', fontWeight: 600 }}>{item.product_name || item.custom_product_name || '—'}</td>
                                  <td style={{ padding: '7px 10px', color: '#475569' }}>{item.quantity}</td>
                                  <td style={{ padding: '7px 10px', color: '#475569' }}>{currency(item.unit_price)}</td>
                                  <td style={{ padding: '7px 10px', color: '#475569' }}>{money(item.discount_amount) > 0 ? currency(item.discount_amount) : '—'}</td>
                                  <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0f172a' }}>{currency(item.total_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {total > perPage && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Page {page} of {Math.ceil(total / perPage)}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === 1 ? '#f1f5f9' : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  Prev
                </button>
                <button disabled={page >= Math.ceil(total / perPage)} onClick={() => setPage(p => p + 1)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page >= Math.ceil(total / perPage) ? '#f1f5f9' : '#fff', cursor: page >= Math.ceil(total / perPage) ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showForm && (
          <BillFormModal
            suppliers={suppliers} products={products}
            shopId={shopId} api={api} setGlobalToast={setGlobalToast}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); fetchBills(); }}
          />
        )}
        {payingBill && (
          <PayModal
            bill={payingBill} api={api} setGlobalToast={setGlobalToast}
            onClose={() => setPayingBill(null)}
            onSaved={() => { setPayingBill(null); fetchBills(); }}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
