import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Package, AlertCircle, CheckCircle2, Loader2, Sparkles, ReceiptText, ArrowRight, ShieldCheck } from 'lucide-react';

export default function SalesReturnModal({
  isOpen,
  onClose,
  customers = [],
  products = [],
  initialCustomer = null,
  initialSale = null,
  shopId,
  authedFetch,
  showToast,
  onSuccess,
  currency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`,
  formatDateDMY = (d) => d || '',
}) {
  const [returnMode, setReturnMode] = useState('invoice'); // 'invoice' | 'standalone'
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerInvoices, setCustomerInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [invoiceItems, setInvoiceItems] = useState([]); // [{ product_id, product_name, quantity, max_quantity, unit_price, total_amount, colour, selected }]
  const [standaloneItems, setStandaloneItems] = useState([
    { product_id: '', quantity: 1, unit_price: '', colour: '', restock_inventory: true, return_reason: '' }
  ]);
  const [restockAll, setRestockAll] = useState(true);
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [createdCreditNote, setCreatedCreditNote] = useState(null);

  // Initialize or reset when modal opens or initial props change
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setCreatedCreditNote(null);
      setSubmitting(false);
      setReason('');
      setRestockAll(true);
      setReturnDate(new Date().toISOString().slice(0, 10));

      const custId = initialCustomer?.id || initialSale?.customer_id || '';
      setSelectedCustomerId(custId ? String(custId) : '');

      if (initialSale) {
        setReturnMode('invoice');
        setSelectedSaleId(String(initialSale.id));
      } else {
        setReturnMode('invoice');
        setSelectedSaleId('');
      }

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, initialCustomer, initialSale]);

  // Load customer invoices when customer changes
  useEffect(() => {
    if (!isOpen || !selectedCustomerId || !authedFetch) {
      setCustomerInvoices([]);
      return;
    }

    let isMounted = true;
    const fetchInvoices = async () => {
      setLoadingInvoices(true);
      try {
        const res = await authedFetch(`/sales/customer/${selectedCustomerId}`);
        if (isMounted) {
          const invList = res?.invoices || [];
          setCustomerInvoices(invList);
          if (initialSale && String(initialSale.customer_id) === String(selectedCustomerId)) {
            setSelectedSaleId(String(initialSale.id));
          } else if (invList.length > 0 && !selectedSaleId) {
            setSelectedSaleId(String(invList[0].id));
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load customer invoices:', err);
          setCustomerInvoices([]);
        }
      } finally {
        if (isMounted) setLoadingInvoices(false);
      }
    };

    fetchInvoices();
    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedCustomerId]);

  // Populate items when selectedSaleId changes in invoice return mode
  useEffect(() => {
    if (returnMode !== 'invoice' || !selectedSaleId) {
      setInvoiceItems([]);
      return;
    }

    const sale = customerInvoices.find((s) => String(s.id) === String(selectedSaleId));
    if (sale) {
      const items = Array.isArray(sale.items) && sale.items.length > 0
        ? sale.items
        : [{
            product_id: sale.product_id,
            name: sale.product_name || sale.product_short_name || 'Item',
            quantity: sale.quantity || 1,
            unit_price: Number(sale.total_amount || 0) / Math.max(1, Number(sale.quantity || 1)),
            colour: sale.colour
          }];

      setInvoiceItems(
        items.map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name || it.name || it.short_name || 'Product',
          quantity: Number(it.quantity || 1),
          max_quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || (Number(it.total_price || 0) / Math.max(1, Number(it.quantity || 1)))),
          colour: it.colour || '',
          selected: true,
          restock_inventory: true,
        }))
      );
    }
  }, [returnMode, selectedSaleId, customerInvoices]);

  // Calculate return total
  const calculatedTotal = returnMode === 'invoice'
    ? invoiceItems.filter((it) => it.selected).reduce((sum, it) => sum + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0)
    : standaloneItems.reduce((sum, it) => sum + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);

  const handleInvoiceItemToggle = (index) => {
    setInvoiceItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, selected: !it.selected } : it))
    );
  };

  const handleInvoiceItemQtyChange = (index, val) => {
    const num = Math.max(1, Math.min(Number(val || 1), invoiceItems[index].max_quantity));
    setInvoiceItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, quantity: num } : it))
    );
  };

  const handleInvoiceItemPriceChange = (index, val) => {
    setInvoiceItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, unit_price: Math.max(0, Number(val || 0)) } : it))
    );
  };

  const handleAddStandaloneItem = () => {
    setStandaloneItems((prev) => [
      ...prev,
      { product_id: '', quantity: 1, unit_price: '', colour: '', restock_inventory: true, return_reason: '' }
    ]);
  };

  const handleRemoveStandaloneItem = (index) => {
    if (standaloneItems.length > 1) {
      setStandaloneItems((prev) => prev.filter((_, idx) => idx !== index));
    }
  };

  const handleStandaloneItemChange = (index, field, val) => {
    setStandaloneItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const updated = { ...it, [field]: val };
        if (field === 'product_id') {
          const prod = products.find((p) => String(p.id) === String(val));
          if (prod && !updated.unit_price) {
            updated.unit_price = prod.sale_price || prod.retail_price || prod.official_price || '';
          }
        }
        return updated;
      })
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }

    let itemsToSubmit = [];
    if (returnMode === 'invoice') {
      const selected = invoiceItems.filter((it) => it.selected && Number(it.quantity) > 0);
      if (selected.length === 0) {
        setError('Please select at least one item from the invoice to return.');
        return;
      }
      itemsToSubmit = selected.map((it) => ({
        product_id: it.product_id,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        colour: it.colour || null,
        restock_inventory: restockAll,
        return_reason: reason || 'Invoice return',
      }));
    } else {
      if (standaloneItems.some((it) => !it.product_id || Number(it.quantity) <= 0 || Number(it.unit_price) <= 0)) {
        setError('Please select a valid product, quantity, and price for all return items.');
        return;
      }
      itemsToSubmit = standaloneItems.map((it) => ({
        product_id: it.product_id,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        colour: it.colour || null,
        restock_inventory: restockAll,
        return_reason: it.return_reason || reason || 'Standalone return',
      }));
    }

    if (calculatedTotal <= 0) {
      setError('Total return amount must be greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authedFetch('/credit-notes', {
        method: 'POST',
        body: JSON.stringify({
          shop_id: shopId,
          customer_id: Number(selectedCustomerId),
          sale_id: returnMode === 'invoice' && selectedSaleId ? Number(selectedSaleId) : null,
          return_date: returnDate,
          reason: reason || (returnMode === 'invoice' ? 'Return against invoice' : 'Customer return'),
          items: itemsToSubmit,
        }),
      });

      if (res?.credit_note) {
        setCreatedCreditNote(res.credit_note);
        if (showToast) {
          showToast(`Credit Note ${res.credit_note.credit_note_number} generated for ${currency(res.credit_note.amount)}!`, 'success');
        }
        if (onSuccess) {
          onSuccess(res.credit_note);
        }
      } else {
        throw new Error(res?.error || 'Failed to issue credit note');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while creating the credit note.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !submitting && onClose()}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 my-8 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-teal-50/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Sales Return &amp; Credit Note</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-100 text-teal-800 border border-teal-200">
                    Accounting
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Issue customer credit notes and automatically adjust inventory stock
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1">
            {createdCreditNote ? (
              /* Success View */
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 block mb-1">
                    Credit Note Successfully Generated
                  </span>
                  <h4 className="text-xl font-black text-slate-900 font-mono">
                    {createdCreditNote.credit_note_number}
                  </h4>
                  <p className="text-sm font-bold text-teal-700 mt-1">
                    Credit Amount: {currency(createdCreditNote.amount)}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-left text-xs text-slate-600 max-w-md mx-auto space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <ShieldCheck size={15} />
                    <span>Double-Entry Safeguards Applied:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-500">
                    <li>Customer ledger now reflects available credit balance.</li>
                    <li>Items have been returned into warehouse/branch inventory batches.</li>
                    <li>This credit note can be redeemed on future sales in the Bill Summary sidebar.</li>
                  </ul>
                </div>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-sm transition-all cursor-pointer"
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            ) : (
              /* Return Form */
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Top Row: Customer & Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Customer *
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full h-10 px-3 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">Select customer...</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.mobile ? `(${c.mobile})` : ''} {Number(c.pending) > 0 ? `· Due: ₹${Number(c.pending).toLocaleString('en-IN')}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Return Date
                    </label>
                    <input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full h-10 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Mode Selector Tabs */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Return Workflow
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setReturnMode('invoice')}
                      className={`py-2 px-3 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        returnMode === 'invoice'
                          ? 'bg-white text-teal-800 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      <ReceiptText size={14} /> Return Against Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnMode('standalone')}
                      className={`py-2 px-3 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        returnMode === 'standalone'
                          ? 'bg-white text-teal-800 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      <Package size={14} /> Standalone Customer Return
                    </button>
                  </div>
                </div>

                {/* Return Against Invoice Section */}
                {returnMode === 'invoice' && (
                  <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                          Select Invoice
                        </label>
                        {loadingInvoices && <span className="text-[10px] text-teal-600 font-bold">Loading invoices...</span>}
                      </div>

                      {customerInvoices.length > 0 ? (
                        <select
                          value={selectedSaleId}
                          onChange={(e) => setSelectedSaleId(e.target.value)}
                          className="w-full h-10 px-3 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">Choose an invoice...</option>
                          {customerInvoices.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.invoice_number || `INV-${String(inv.id).padStart(6, '0')}`} · {formatDateDMY(inv.invoice_date || inv.sale_date)} · Total: ₹{Number(inv.total_amount).toLocaleString('en-IN')} (Pending: ₹{Number(inv.pending_amount).toLocaleString('en-IN')})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="p-3 bg-white rounded-xl border border-dashed border-slate-300 text-center text-slate-400 text-xs">
                          {selectedCustomerId ? 'No past invoices found for this customer. You can use Standalone Customer Return.' : 'Select a customer to view invoices.'}
                        </div>
                      )}
                    </div>

                    {/* Invoice Items List */}
                    {invoiceItems.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Select Items to Return &amp; Adjust Quantity:
                        </span>
                        <div className="space-y-2">
                          {invoiceItems.map((item, idx) => (
                            <div
                              key={idx}
                              className={`p-2.5 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-2.5 ${
                                item.selected
                                  ? 'bg-white border-teal-300 shadow-2xs'
                                  : 'bg-slate-100/70 border-slate-200 opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-[180px] flex-1">
                                <input
                                  type="checkbox"
                                  checked={item.selected}
                                  onChange={() => handleInvoiceItemToggle(idx)}
                                  className="w-4 h-4 text-teal-600 rounded cursor-pointer accent-teal-600"
                                />
                                <div>
                                  <strong className="text-slate-900 block text-xs">{item.product_name}</strong>
                                  <span className="text-[11px] text-slate-500">
                                    Sold: {item.max_quantity} pcs @ ₹{item.unit_price}
                                    {item.colour ? ` · ${item.colour}` : ''}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div>
                                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-0.5">
                                    Return Qty (Max {item.max_quantity})
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    max={item.max_quantity}
                                    disabled={!item.selected}
                                    value={item.quantity}
                                    onChange={(e) => handleInvoiceItemQtyChange(idx, e.target.value)}
                                    className="w-16 h-8 text-center text-xs font-bold border border-slate-200 rounded-lg bg-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[9px] uppercase font-bold text-slate-400 mb-0.5">
                                    Price (₹)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    disabled={!item.selected}
                                    value={item.unit_price}
                                    onChange={(e) => handleInvoiceItemPriceChange(idx, e.target.value)}
                                    className="w-20 h-8 text-right text-xs font-bold border border-slate-200 rounded-lg bg-white focus:border-teal-500 focus:outline-none disabled:opacity-50"
                                  />
                                </div>

                                <div className="text-right min-w-[70px]">
                                  <span className="block text-[9px] uppercase font-bold text-slate-400">Total</span>
                                  <strong className="text-xs font-black text-teal-700">
                                    ₹{(Number(item.quantity || 0) * Number(item.unit_price || 0)).toLocaleString('en-IN')}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Standalone Return Section */}
                {returnMode === 'standalone' && (
                  <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Returned Products
                      </span>
                      <button
                        type="button"
                        onClick={handleAddStandaloneItem}
                        className="px-2.5 py-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                      >
                        + Add Item
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {standaloneItems.map((item, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                          <div className="sm:col-span-6">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                              Product / Model *
                            </label>
                            <select
                              value={item.product_id}
                              onChange={(e) => handleStandaloneItemChange(idx, 'product_id', e.target.value)}
                              className="w-full h-9 px-2 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:border-teal-500 focus:outline-none cursor-pointer"
                            >
                              <option value="">Select product...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.short_name || p.name} (₹{p.sale_price || p.retail_price || 0})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Qty</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleStandaloneItemChange(idx, 'quantity', e.target.value)}
                              className="w-full h-9 px-2 text-center text-xs font-bold border border-slate-200 rounded-lg bg-white focus:border-teal-500 focus:outline-none"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Price (₹)</label>
                            <input
                              type="number"
                              min="0"
                              value={item.unit_price}
                              placeholder="0"
                              onChange={(e) => handleStandaloneItemChange(idx, 'unit_price', e.target.value)}
                              className="w-full h-9 px-2 text-right text-xs font-bold border border-slate-200 rounded-lg bg-white focus:border-teal-500 focus:outline-none"
                            />
                          </div>

                          <div className="sm:col-span-1 flex justify-end">
                            {standaloneItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveStandaloneItem(idx)}
                                className="h-9 w-9 flex items-center justify-center text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
                                title="Remove item"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Return Reason & Restock Toggle */}
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Return Reason / Notes
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Defective screen, Touch glitch, Customer return, Wrong variant..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full h-10 px-3 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:border-teal-500 focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {['Defective display', 'Customer exchange', 'Dead on arrival', 'Wrong item ordered'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setReason(preset)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 cursor-pointer"
                        >
                          + {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Restock Inventory Toggle */}
                  <label className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restockAll}
                      onChange={(e) => setRestockAll(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded cursor-pointer accent-emerald-600"
                    />
                    <div>
                      <strong className="text-emerald-950 block text-xs font-bold">
                        Restock returned items back into stock
                      </strong>
                      <span className="text-[11px] text-emerald-800">
                        Automatically increment inventory batch counts and sync current stock in this warehouse/branch.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Bottom Summary & Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Credit Note Amount To Issue
                    </span>
                    <strong className="text-xl font-black text-slate-900">
                      {currency(calculatedTotal)}
                    </strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={submitting || calculatedTotal <= 0 || !selectedCustomerId}
                      className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Generating Credit Note...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw size={15} />
                          <span>Issue Credit Note ({currency(calculatedTotal)})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
