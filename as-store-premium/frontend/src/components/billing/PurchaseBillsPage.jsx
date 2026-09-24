import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag, Plus, Search, Eye, X, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, CreditCard, Loader2, Check, Trash2, Package, Pencil
} from 'lucide-react';
import NewPurchaseBillModal from './NewPurchaseBillModal';

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

// BillFormModal has been upgraded into NewPurchaseBillModal.jsx for ERP-level high efficiency entry.


function PayModal({ bill, onClose, onSaved, api, setGlobalToast }) {
  const [amount, setAmount] = useState(String(money(bill.pending_amount)));
  const [mode, setMode] = useState('cash');
  const [payDate, setPayDate] = useState(today());
  const [submitting, setSubmitting] = useState(false);

  const handlePay = async (e) => {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) return setGlobalToast && setGlobalToast({ type: 'error', message: 'Enter a valid payment amount.' });
    setSubmitting(true);
    try {
      await api(`/purchase-bills/${bill.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount: num, payment_mode: mode, payment_date: payDate }),
      });
      setGlobalToast && setGlobalToast({ type: 'success', message: 'Payment recorded!' });
      onSaved && onSaved();
    } catch (err) {
      setGlobalToast && setGlobalToast({ type: 'error', message: err.message || 'Payment failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Record Vendor Payment</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
          Bill <strong>{bill.bill_number}</strong> · Pending: <strong style={{ color: '#dc2626' }}>{currency(bill.pending_amount)}</strong>
        </p>
        <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Amount (₹)</label>
            <input type="number" step="0.01" max={bill.pending_amount} min="0.01" value={amount} onChange={e => setAmount(e.target.value)} required
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, fontWeight: 700, color: '#0f172a', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Payment Date</label>
            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Payment Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a', boxSizing: 'border-box' }}>
              <option value="cash">Cash In Hand</option>
              <option value="bank">Bank Transfer (NEFT/RTGS)</option>
              <option value="upi">UPI / Online</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#64748b' }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {submitting ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PurchaseBillsPage({
  session,
  api,
  setGlobalToast,
  suppliers = [],
  products = [],
  reference = null,
  shopId: propShopId,
  shops = [],
  warehouse = null,
  role = '',
}) {
  const [bills, setBills] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [payingBill, setPayingBill] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const perPage = 20;

  const effectiveShopId =
    propShopId ||
    session?.shop_id ||
    (role === 'shopkeeper' ? session?.shop_id : (warehouse?.id || shops?.[0]?.id)) ||
    '';
  const shopId = effectiveShopId;

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Are you sure you want to delete purchase bill ${bill.bill_number}?\nThis will remove the bill and all associated line items.`)) {
      return;
    }
    setLoading(true);
    try {
      await api(`/purchase-bills/${bill.id}`, { method: 'DELETE' });
      setGlobalToast && setGlobalToast({ type: 'success', message: `Purchase bill ${bill.bill_number} deleted successfully.` });
      fetchBills();
    } catch (e) {
      setGlobalToast && setGlobalToast({ type: 'error', message: e.message || 'Failed to delete purchase bill.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchBills = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: perPage });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (effectiveShopId) params.set('shopId', String(effectiveShopId));
      const data = await api(`/purchase-bills?${params}`);
      const list = Array.isArray(data) ? data : (data?.data || data?.purchaseBills || data?.bills || data?.rows || []);
      setBills(list);
      setTotal(data?.totalPurchaseBills || data?.total || list.length || 0);
    } catch (e) {
      setGlobalToast && setGlobalToast({ type: 'error', message: e.message || 'Failed to load bills.' });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, effectiveShopId, api, setGlobalToast]);

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
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingBill(bill); }}
                          title="Edit Purchase Bill"
                          style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#475569', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Pencil size={12} /> Edit
                        </button>
                        {Number(bill.paid_amount || 0) === 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDeleteBill(bill); }}
                            title="Delete Purchase Bill"
                            style={{ padding: '5px 7px', borderRadius: 7, border: '1.5px solid #fecaca', background: '#fef2f2', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center' }}>
                            <Trash2 size={13} />
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
        {(showForm || Boolean(editingBill)) && (
          <NewPurchaseBillModal
            isOpen={showForm || Boolean(editingBill)}
            billToEdit={editingBill}
            suppliers={suppliers}
            products={products}
            reference={reference}
            brands={reference?.brands || []}
            categories={reference?.categories || []}
            shopId={editingBill?.shop_id || effectiveShopId}
            shops={shops}
            warehouse={warehouse}
            session={session}
            role={role}
            api={api}
            setGlobalToast={setGlobalToast}
            onClose={() => {
              setShowForm(false);
              setEditingBill(null);
            }}
            onSaved={() => {
              setShowForm(false);
              setEditingBill(null);
              fetchBills();
            }}
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
