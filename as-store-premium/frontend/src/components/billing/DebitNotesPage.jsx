import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RotateCcw, Plus, Search, X, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, Check, Loader2, Trash2, Package, Minus, Pencil
} from 'lucide-react';
import SearchableCombobox from '../ui/SearchableCombobox';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const currency = (v) => `₹${money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const formatDMY = (d) => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : d; };

function getProductAvailableColors(product) {
  if (!product) return [];
  const colorSet = new Set();

  const addColor = (c) => {
    if (!c) return;
    const str = String(c).trim();
    if (!str || /^(undefined|null|standard|default|none|n\/a)$/i.test(str)) return;
    colorSet.add(str);
  };

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

  if (product.colour_stock && typeof product.colour_stock === 'object') {
    Object.keys(product.colour_stock).forEach(addColor);
  } else if (typeof product.colour_stock === 'string' && product.colour_stock.trim()) {
    try {
      const parsed = JSON.parse(product.colour_stock);
      if (typeof parsed === 'object' && parsed !== null) {
        Object.keys(parsed).forEach(addColor);
      }
    } catch { /* ignore */ }
  }

  if (product.color) addColor(product.color);
  if (product.colour) addColor(product.colour);

  return Array.from(colorSet);
}

const STATUS_STYLES = {
  active:    { label: 'Active',    bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  settled:   { label: 'Settled',   bg: '#dcfce7', color: '#14532d', border: '#86efac' },
  cancelled: { label: 'Cancelled', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.active;
  return <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.label}</span>;
}

function DebitNoteFormModal({ suppliers, products = [], onClose, onSaved, api, setGlobalToast, shopId, shops = [], warehouse, session, noteToEdit = null }) {
  const effectiveShopId = shopId || session?.shop_id || warehouse?.id || shops?.[0]?.id;
  const [supplierId, setSupplierId] = useState(noteToEdit?.supplier_id ? String(noteToEdit.supplier_id) : '');
  const [purchaseBillId, setPurchaseBillId] = useState(noteToEdit?.purchase_bill_id ? String(noteToEdit.purchase_bill_id) : '');
  const [reason, setReason] = useState(noteToEdit?.reason || '');
  const [returnDate, setReturnDate] = useState(noteToEdit?.return_date ? String(noteToEdit.return_date).slice(0, 10) : today());
  const [items, setItems] = useState(() => {
    if (noteToEdit?.items && noteToEdit.items.length > 0) {
      return noteToEdit.items.map(it => ({
        product_id: it.product_id ? String(it.product_id) : '',
        custom_product_name: it.custom_product_name || '',
        quantity: it.quantity || 1,
        unit_price: it.unit_price !== undefined ? String(it.unit_price) : '',
        colour: it.colour || '',
        restock_supplier: it.restock_supplier !== false,
      }));
    }
    return [{ product_id: '', custom_product_name: '', quantity: 1, unit_price: '', colour: '', restock_supplier: true }];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [modalProducts, setModalProducts] = useState(products || []);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Sync incoming products into modalProducts
  useEffect(() => {
    if (products && products.length > 0) {
      setModalProducts(prev => {
        const map = new Map();
        (prev || []).forEach(p => p && p.id && map.set(String(p.id), p));
        (products || []).forEach(p => p && p.id && map.set(String(p.id), p));
        return Array.from(map.values());
      });
    }
  }, [products]);

  // Pre-load full products catalog on modal mount
  useEffect(() => {
    if (!api) return;
    const shopParam = effectiveShopId ? `&shop_id=${encodeURIComponent(effectiveShopId)}` : '';
    api(`/products?limit=5000${shopParam}`)
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.data || res?.products || res?.rows || []);
        if (list && list.length > 0) {
          setModalProducts(prev => {
            const map = new Map();
            (prev || []).forEach(p => p && p.id && map.set(String(p.id), p));
            list.forEach(p => p && p.id && map.set(String(p.id), p));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
  }, [api, effectiveShopId]);

  // Handle active debounced live server search as the user types
  const handleLiveProductSearch = useCallback((query) => {
    const q = String(query || '').trim();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!q || !api) {
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const shopParam = effectiveShopId ? `&shop_id=${encodeURIComponent(effectiveShopId)}` : '';
        const res = await api(`/products?search=${encodeURIComponent(q)}${shopParam}&limit=100`);
        const list = Array.isArray(res) ? res : (res?.data || res?.products || res?.rows || []);
        if (list && list.length > 0) {
          setModalProducts(prev => {
            const map = new Map();
            (prev || []).forEach(p => p && p.id && map.set(String(p.id), p));
            list.forEach(p => p && p.id && map.set(String(p.id), p));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn('Debit note live product search failed:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 200);
  }, [api, effectiveShopId]);

  const productOptions = useMemo(() => {
    return (modalProducts || []).map((p) => {
      const colours = getProductAvailableColors(p);
      const label = p.short_name || p.name || p.product_name || `Product #${p.id}`;
      return {
        id: String(p.id),
        name: label,
        label,
        brand: p.brand || '',
        category: p.category || p.part_category || '',
        model: p.model || p.full_model_list || '',
        stock: p.stock ?? p.quantity,
        image_url: p.image_url || p.imageUrl || '',
        costPrice: p.cost_price ?? p.purchase_price ?? p.default_purchase_price ?? p.sale_price ?? '',
        colours,
        coloursCount: colours.length,
        keywords: [
          p.name,
          p.short_name,
          p.model,
          p.full_model_list,
          p.brand,
          p.category,
          p.part_category,
          p.quality_variant,
          p.description,
          colours.join(' '),
        ].filter(Boolean).join(' '),
      };
    });
  }, [modalProducts]);

  const addItem = () => setItems(prev => [...prev, { product_id: '', custom_product_name: '', quantity: 1, unit_price: '', colour: '', restock_supplier: true }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const handleSelectProduct = (index, productId) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      if (!productId) {
        return {
          ...item,
          product_id: '',
          colour: '',
        };
      }
      const prod = (modalProducts || []).find(p => String(p.id) === String(productId));
      const availColours = prod ? getProductAvailableColors(prod) : [];

      let unitPrice = item.unit_price;
      if ((!unitPrice || Number(unitPrice) === 0) && prod) {
        const defaultPrice = prod.cost_price ?? prod.purchase_price ?? prod.default_purchase_price ?? prod.wholesale_price ?? prod.sale_price ?? '';
        if (defaultPrice) unitPrice = String(defaultPrice);
      }

      let colour = '';
      if (availColours.length > 0) {
        colour = availColours.includes(item.colour) ? item.colour : availColours[0];
      }

      return {
        ...item,
        product_id: String(productId),
        custom_product_name: '',
        unit_price: unitPrice,
        colour,
      };
    }));
  };

  const anyHasColours = items.some(item => {
    if (!item.product_id) return false;
    const prod = (modalProducts || []).find(p => String(p.id) === String(item.product_id));
    return prod && getProductAvailableColors(prod).length > 0;
  });

  const totalAmount = items.reduce((s, item) => s + money(Number(item.quantity || 0) * money(item.unit_price || 0)), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const validItems = items.filter(item => (item.product_id || item.custom_product_name?.trim()) && Number(item.quantity) > 0 && Number(item.unit_price) >= 0);
    if (!validItems.length) { setError('Add at least one item with quantity and price.'); return; }
    if (money(totalAmount) <= 0) { setError('Total debit note amount must be greater than zero.'); return; }
    setSaving(true);
    try {
      const payload = {
        shop_id: effectiveShopId || undefined,
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
      };

      if (noteToEdit) {
        await api(`/debit-notes/${noteToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setGlobalToast && setGlobalToast({ type: 'success', message: `Debit note ${noteToEdit.debit_note_number} updated successfully.` });
      } else {
        await api('/debit-notes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setGlobalToast && setGlobalToast({ type: 'success', message: 'Debit note created. Stock deducted automatically.' });
      }
      onSaved();
    } catch (err) {
      setError(err.message || (noteToEdit ? 'Failed to update debit note.' : 'Failed to create debit note.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', zIndex: 1000, overflowY: 'auto', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 780, boxShadow: '0 25px 60px rgba(0,0,0,0.22)', marginTop: 8 }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#ea580c,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              {noteToEdit ? <Pencil size={17} /> : <RotateCcw size={17} />}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
                {noteToEdit ? `Edit Debit Note (${noteToEdit.debit_note_number})` : 'New Debit Note'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {noteToEdit ? 'Modify return items · stock and vendor balance will be adjusted' : 'Purchase return · stock auto-deducted on save'}
              </div>
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
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0', borderTopLeftRadius: 11, minWidth: 230 }}>
                      Product / Description
                    </th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0', width: 65 }}>
                      Qty
                    </th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0', width: 95 }}>
                      Unit Price
                    </th>
                    {anyHasColours && (
                      <th style={{ padding: '8px 8px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0', width: 120 }}>
                        Colour
                      </th>
                    )}
                    <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0', width: 80 }}>
                      Auto-Stock
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid #e2e8f0', width: 90 }}>
                      Total
                    </th>
                    <th style={{ padding: '8px 6px', width: 36, borderBottom: '1px solid #e2e8f0', borderTopRightRadius: 11 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const lineTotal = money(Number(item.quantity || 0) * money(item.unit_price || 0));
                    const selectedProd = item.product_id
                      ? (modalProducts || []).find(p => String(p.id) === String(item.product_id))
                      : null;
                    const itemColours = selectedProd ? getProductAvailableColors(selectedProd) : [];
                    const hasColourOptions = itemColours.length > 0;

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                          <SearchableCombobox
                            compact
                            value={item.product_id ? String(item.product_id) : ''}
                            onChange={(val) => handleSelectProduct(i, val)}
                            onSearch={handleLiveProductSearch}
                            loading={searchLoading}
                            options={productOptions}
                            placeholder="Search product from catalog…"
                            searchPlaceholder="Type model, OLED, battery, brand…"
                            allowClear={true}
                            dropdownWidth="w-[340px] sm:w-[480px] md:w-[560px]"
                            className="w-full"
                          />
                          {!item.product_id && (
                            <input
                              placeholder="Or enter custom item description…"
                              value={item.custom_product_name || ''}
                              onChange={e => updateItem(i, 'custom_product_name', e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, boxSizing: 'border-box', marginTop: 4 }}
                            />
                          )}
                        </td>
                        <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={e => updateItem(i, 'quantity', e.target.value)}
                            style={{ width: 58, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="0.00"
                            value={item.unit_price}
                            onChange={e => updateItem(i, 'unit_price', e.target.value)}
                            style={{ width: 88, padding: '6px 8px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, textAlign: 'right' }}
                          />
                        </td>
                        {anyHasColours && (
                          <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                            {hasColourOptions ? (
                              <select
                                value={item.colour || ''}
                                onChange={e => updateItem(i, 'colour', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  borderRadius: 7,
                                  border: '1.5px solid #e2e8f0',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: '#fff',
                                  color: '#0f172a',
                                  cursor: 'pointer',
                                }}
                              >
                                <option value="">Select colour</option>
                                {itemColours.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 13, paddingLeft: 8, display: 'inline-block', paddingTop: 6 }}>—</span>
                            )}
                          </td>
                        )}
                        <td style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                          <button
                            type="button"
                            onClick={() => updateItem(i, 'restock_supplier', !item.restock_supplier)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 7,
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 11,
                              fontWeight: 700,
                              background: item.restock_supplier ? '#dcfce7' : '#f1f5f9',
                              color: item.restock_supplier ? '#16a34a' : '#64748b',
                            }}
                          >
                            {item.restock_supplier ? 'Yes' : 'No'}
                          </button>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', paddingTop: 14 }}>
                          {currency(lineTotal)}
                        </td>
                        <td style={{ padding: '8px 8px', textAlign: 'center', verticalAlign: 'top', paddingTop: 12 }}>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(i)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626', padding: 4, borderRadius: 6 }}
                            >
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
              {saving ? 'Saving…' : (noteToEdit ? 'Update Debit Note' : 'Create Debit Note')}
            </button>
          </div>
        </form>
      </motion.div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

export default function DebitNotesPage({
  session,
  api,
  setGlobalToast,
  suppliers = [],
  products = [],
  shopId: propShopId,
  shops = [],
  warehouse,
  role,
}) {
  const [notes, setNotes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [deleteConfirmNote, setDeleteConfirmNote] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [loadingEditId, setLoadingEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadedProducts, setLoadedProducts] = useState(products);
  const perPage = 20;

  const effectiveShopId = propShopId || session?.shop_id || warehouse?.id || shops?.[0]?.id;

  useEffect(() => {
    if (products && products.length > 0) {
      setLoadedProducts(prev => {
        const map = new Map();
        (prev || []).forEach(p => p && p.id && map.set(String(p.id), p));
        (products || []).forEach(p => p && p.id && map.set(String(p.id), p));
        return Array.from(map.values());
      });
    }
    if (api) {
      const shopParam = effectiveShopId ? `&shop_id=${encodeURIComponent(effectiveShopId)}` : '';
      api(`/products?limit=5000${shopParam}`)
        .then(res => {
          const list = Array.isArray(res) ? res : (res?.data || res?.products || res?.rows || []);
          if (list && list.length > 0) {
            setLoadedProducts(prev => {
              const map = new Map();
              (prev || []).forEach(p => p && p.id && map.set(String(p.id), p));
              list.forEach(p => p && p.id && map.set(String(p.id), p));
              return Array.from(map.values());
            });
          }
        })
        .catch(() => {});
    }
  }, [products, api, effectiveShopId]);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: perPage });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (effectiveShopId) params.set('shopId', effectiveShopId);
      const data = await api(`/debit-notes?${params}`);
      const list = Array.isArray(data) ? data : (data?.data || data?.debitNotes || data?.rows || []);
      setNotes(list);
      setTotal(data?.totalDebitNotes ?? data?.total ?? list.length);
    } catch (e) {
      setGlobalToast && setGlobalToast({ type: 'error', message: e.message || 'Failed to load debit notes.' });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, effectiveShopId, api]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handleEditNote = async (dn) => {
    try {
      setLoadingEditId(dn.id);
      const full = await api(`/debit-notes/${dn.id}`);
      setEditingNote(full);
      setShowForm(true);
    } catch (err) {
      setGlobalToast && setGlobalToast({ type: 'error', message: err.message || 'Failed to fetch debit note details for editing.' });
    } finally {
      setLoadingEditId(null);
    }
  };

  const handleDeleteNote = async (dn) => {
    if (!dn) return;
    setDeletingId(dn.id);
    try {
      await api(`/debit-notes/${dn.id}`, { method: 'DELETE' });
      setGlobalToast && setGlobalToast({ type: 'success', message: `Debit note ${dn.debit_note_number} deleted and stock restored.` });
      setDeleteConfirmNote(null);
      if (expandedId === dn.id) {
        setExpandedId(null);
        setExpandedItems([]);
      }
      fetchNotes();
    } catch (err) {
      setGlobalToast && setGlobalToast({ type: 'error', message: err.message || 'Failed to delete debit note.' });
    } finally {
      setDeletingId(null);
    }
  };

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
        <button onClick={() => { setEditingNote(null); setShowForm(true); }}
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
                {['Debit Note No.', 'Vendor', 'Date', 'Amount', 'Items', 'Stock', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px',
                    textAlign: h === 'Amount' ? 'right' : (h === 'Actions' ? 'right' : 'left'),
                    fontWeight: 700,
                    color: '#475569',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                    borderBottom: '1px solid #e2e8f0',
                    whiteSpace: 'nowrap'
                  }}>
                    {h}
                  </th>
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
                    <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          onClick={() => handleEditNote(dn)}
                          disabled={loadingEditId === dn.id}
                          title="Edit Debit Note"
                          style={{
                            padding: '5px 9px',
                            borderRadius: 8,
                            border: '1px solid #fed7aa',
                            background: '#fff7ed',
                            cursor: loadingEditId === dn.id ? 'not-allowed' : 'pointer',
                            color: '#c2410c',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {loadingEditId === dn.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Pencil size={12} />}
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => setDeleteConfirmNote(dn)}
                          title="Delete Debit Note"
                          style={{
                            padding: '5px 8px',
                            borderRadius: 8,
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            cursor: 'pointer',
                            color: '#dc2626',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                        <button
                          onClick={() => toggleExpand(dn.id)}
                          title="View Details"
                          style={{
                            padding: '5px 8px',
                            borderRadius: 8,
                            border: '1.5px solid #e2e8f0',
                            background: '#fff',
                            cursor: 'pointer',
                            color: '#64748b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {expandedId === dn.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === dn.id && (
                    <tr>
                      <td colSpan={8} style={{ padding: '0 14px 14px', background: '#fafaf9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0 6px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                            Returned Items
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => handleEditNote(dn)}
                              disabled={loadingEditId === dn.id}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 7,
                                border: '1px solid #fed7aa',
                                background: '#fff7ed',
                                color: '#c2410c',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              {loadingEditId === dn.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Pencil size={11} />}
                              Edit Note
                            </button>
                            <button
                              onClick={() => setDeleteConfirmNote(dn)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 7,
                                border: '1px solid #fecaca',
                                background: '#fef2f2',
                                color: '#dc2626',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Trash2 size={11} /> Delete Note
                            </button>
                          </div>
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmNote && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1100, backdropFilter: 'blur(4px)' }}>
            <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fef2f2', border: '1px solid #fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', flexShrink: 0 }}>
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Delete Debit Note?</h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{deleteConfirmNote.debit_note_number} · {currency(deleteConfirmNote.amount)}</div>
                </div>
              </div>

              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: '12px 14px', fontSize: 12, color: '#9a3412', lineHeight: 1.5, marginBottom: 20 }}>
                <strong>⚠️ Stock Restoration:</strong> Deleting this debit note will restore the returned stock back to your active inventory, reverse any accounting journals, and restore any linked purchase bill balance.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  disabled={deletingId === deleteConfirmNote.id}
                  onClick={() => setDeleteConfirmNote(null)}
                  style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingId === deleteConfirmNote.id}
                  onClick={() => handleDeleteNote(deleteConfirmNote)}
                  style={{
                    padding: '9px 20px', borderRadius: 10, border: 'none',
                    background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: deletingId === deleteConfirmNote.id ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(220,38,38,0.35)'
                  }}
                >
                  {deletingId === deleteConfirmNote.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                  {deletingId === deleteConfirmNote.id ? 'Deleting & Restoring…' : 'Delete & Restore Stock'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <DebitNoteFormModal
            suppliers={suppliers}
            products={loadedProducts && loadedProducts.length > 0 ? loadedProducts : products}
            shopId={effectiveShopId}
            shops={shops}
            warehouse={warehouse}
            session={session}
            noteToEdit={editingNote}
            api={api}
            setGlobalToast={setGlobalToast}
            onClose={() => { setShowForm(false); setEditingNote(null); }}
            onSaved={() => { setShowForm(false); setEditingNote(null); fetchNotes(); }}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
