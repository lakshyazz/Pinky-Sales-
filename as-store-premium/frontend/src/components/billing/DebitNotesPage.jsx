import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw, Plus, Search, X, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, Check, Loader2, Trash2, Package, Minus
} from 'lucide-react';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const currency = (v) => `₹${money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const formatDMY = (d) => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : d; };

const STATUS_STYLES = {
  active:    { label: 'Active',    bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  settled:   { label: 'Settled',   bg: '#dcfce7', color: '#14532d', border: '#86efac' },
  cancelled: { label: 'Cancelled', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.active;
  return <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

function DebitNoteFormModal({ suppliers, products, onClose, onSaved, api, setGlobalToast, shopId }) {
  const [supplierId, setSupplierId] = useState('');
  const [purchaseBillId, setPurchaseBillId] = useState('');
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(today());
  const [items, setItems] = useState([{ product_id: '', custom_product_name: '', quantity: 1, unit_price: '', colour: '', restock_supplier: true }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const addItem = () => setItems(prev => [...prev, { product_id: '', custom_product_name: '', quantity: 1, unit_price: '', colour: '', restock_supplier: true }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const totalAmount = items.reduce((s, item) => s + money(Number(item.quantity || 0) * money(item.unit_price || 0)), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const validItems = items.filter(item => (item.product_id || item.custom_product_name?.trim()) && Number(item.quantity) > 0 && Number(item.unit_price) >= 0);
    if (!validItems.length) { setError('Add at least one item with quantity and price.'); return; }
    if (money(totalAmount) <= 0) { setError('Total debit note amount must be greater than zero.'); return; }
    setSaving(true);
    try {
      await api('/debit-notes', {
        method: 'POST',
        body: JSON.stringify({
          shop_id: shopId,
          supplier_id: supplierId || null,
          purchase_bill_id: purchaseBillId || null,
          reason: reason || 'Purchase return',
          return_date: returnDate,
          items: validItems.map(item => ({
            product_id: item.product_id || null,
            custom_product_name: item.custom_product_name || null,
            quantity: Number(item.quantity),
            unit_price: money(item.unit_price),
            colour: item.colour || null,
            restock_supplier: item.restock_supplier !== false,
          })),
        }),
      });
      setGlobalToast && setGlobalToast({ type: 'success', message: 'Debit note created. Stock deducted automatically.' });
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to create debit note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', zIndex: 1000, overflowY: 'auto', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 720, boxShadow: '0 25px 60px rgba(0,0,0,0.22)', marginTop: 8 }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#ea580c,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <RotateCcw size={17} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>New Debit Note</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Purchase return · stock auto-deducted on save</div>
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

          {/* Info banner about auto stock deduction */}
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#9a3412', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={14} /> Stock for identified products will be automatically deducted when you save.
          </div>

          {/* Top fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Vendor (optional)</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }}>
                <option value="">— No vendor —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Linked Bill ID (optional)</label>
              <input type="number" min={1} placeholder="Bill ID (e.g. 12)" value={purchaseBillId} onChange={e => setPurchaseBillId(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Return Date</label>
              <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>Reason</label>
              <input placeholder="e.g. Defective goods" value={reason} onChange={e => setReason(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, background: '#f8fafc', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Returned Items</span>
              <button type="button" onClick={addItem}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#ea580c', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={12} /> Add Item
              </button>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Product / Description', 'Qty', 'Unit Price', 'Colour', 'Auto-Stock', 'Total', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const lineTotal = money(Number(item.quantity || 0) * money(item.unit_price || 0));
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
                            style={{ width: 58, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <input type="number" min={0} step="0.01" placeholder="0.00" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)}
                            style={{ width: 88, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          <input placeholder="e.g. Black" value={item.colour} onChange={e => updateItem(i, 'colour', e.target.value)}
                            style={{ width: 80, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <button type="button" onClick={() => updateItem(i, 'restock_supplier', !item.restock_supplier)}
                            style={{ padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                              background: item.restock_supplier ? '#dcfce7' : '#f1f5f9',
                              color: item.restock_supplier ? '#16a34a' : '#64748b' }}>
                            {item.restock_supplier ? 'Yes' : 'No'}
                          </button>
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

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <div style={{ textAlign: 'right', background: '#fff7ed', borderRadius: 12, padding: '12px 20px', border: '1px solid #fed7aa' }}>
              <div style={{ fontSize: 11, color: '#9a3412', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Debit Note Total</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#ea580c', letterSpacing: -0.5 }}>{currency(totalAmount)}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>Vendor payable will be reduced by this amount</div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '10px 22px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{
                padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#ea580c,#f97316)', color: '#fff', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(234,88,12,0.4)'
              }}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              {saving ? 'Saving…' : 'Create Debit Note'}
            </button>
          </div>
        </form>
      </motion.div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

export default function DebitNotesPage({ session, api, setGlobalToast, suppliers = [], products = [] }) {
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const perPage = 20;

  const shopId = session?.shop_id;

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: perPage });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const data = await api(`/debit-notes?${params}`);
      setNotes(data.debitNotes || data.rows || []);
      setTotal(data.totalDebitNotes || data.total || 0);
    } catch (e) {
      setGlobalToast && setGlobalToast({ type: 'error', message: e.message || 'Failed to load debit notes.' });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, api]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const toggleExpand = async (dnId) => {
    if (expandedId === dnId) { setExpandedId(null); setExpandedItems([]); return; }
    setExpandedId(dnId);
    setLoadingItems(true);
    try {
      const data = await api(`/debit-notes/${dnId}`);
      setExpandedItems(data.items || []);
    } catch (e) {
      setExpandedItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 12px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#ea580c,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
            <RotateCcw size={18} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.4 }}>Debit Notes</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{total} note{total !== 1 ? 's' : ''} · purchase returns, stock auto-deducted</p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          style={{
            padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#ea580c,#f97316)', color: '#fff', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(234,88,12,0.35)'
          }}>
          <Plus size={15} /> New Return
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input placeholder="Search notes or vendor…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '9px 10px 9px 34px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, background: '#f8fafc', boxSizing: 'border-box' }} />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="settled">Settled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={fetchNotes} style={{ padding: '9px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#ea580c' }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
          <div style={{ fontWeight: 700, fontSize: 13 }}>Loading debit notes…</div>
        </div>
      ) : notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          <RotateCcw size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>No debit notes yet.</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Click "New Return" to record a purchase return.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(15,23,42,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Debit Note No.', 'Vendor', 'Date', 'Amount', 'Items', 'Stock', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Amount' ? 'right' : 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notes.map((dn) => (
                <React.Fragment key={dn.id}>
                  <tr style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 800, color: '#ea580c', fontSize: 12 }}>{dn.debit_note_number}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: '#0f172a' }}>{dn.supplier_name || <span style={{ color: '#94a3b8', fontWeight: 400 }}>No vendor</span>}</td>
                    <td style={{ padding: '11px 14px', color: '#475569' }}>{formatDMY(dn.return_date)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: '#ea580c', fontSize: 14 }}>{currency(dn.amount)}</td>
                    <td style={{ padding: '11px 14px', color: '#475569', textAlign: 'center' }}>{dn.item_count || '—'}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: dn.stock_deducted ? '#dcfce7' : '#fef9c3',
                        color: dn.stock_deducted ? '#14532d' : '#854d0e',
                        border: `1px solid ${dn.stock_deducted ? '#86efac' : '#fcd34d'}`
                      }}>
                        {dn.stock_deducted ? 'Deducted' : 'Pending'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge status={dn.status} /></td>
                    <td style={{ padding: '11px 10px' }}>
                      <button onClick={() => toggleExpand(dn.id)}
                        style={{ padding: '5px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                        {expandedId === dn.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </td>
                  </tr>
                  {expandedId === dn.id && (
                    <tr>
                      <td colSpan={8} style={{ padding: '0 14px 14px', background: '#fafaf9' }}>
                        <div style={{ padding: '10px 0 4px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          Returned Items
                        </div>
                        {loadingItems ? (
                          <div style={{ padding: '10px 0', color: '#ea580c', fontSize: 12 }}>Loading…</div>
                        ) : expandedItems.length === 0 ? (
                          <div style={{ padding: '10px 0', color: '#94a3b8', fontSize: 12 }}>No items.</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                {['Product', 'Qty', 'Unit Price', 'Colour', 'Auto-Restock', 'Total'].map(h => (
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
                                  <td style={{ padding: '7px 10px', color: '#475569' }}>{item.colour || '—'}</td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: item.restock_supplier ? '#dcfce7' : '#f1f5f9', color: item.restock_supplier ? '#14532d' : '#64748b' }}>
                                      {item.restock_supplier ? 'Yes' : 'No'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '7px 10px', fontWeight: 700, color: '#ea580c' }}>{currency(item.total_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {dn.reason && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                            <strong>Reason:</strong> {dn.reason}
                          </div>
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

      <AnimatePresence>
        {showForm && (
          <DebitNoteFormModal
            suppliers={suppliers} products={products}
            shopId={shopId} api={api} setGlobalToast={setGlobalToast}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); fetchNotes(); }}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
