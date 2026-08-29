import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Truck, FileText, AlertCircle, Loader2, Sparkles, ReceiptText, ShieldCheck, Check } from 'lucide-react';

export default function EditSaleModal({
  isOpen,
  onClose,
  sale = null,
  shopId,
  authedFetch,
  showToast,
  onSuccess,
  currency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`,
  formatDateDMY = (d) => d || '',
}) {
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentTerms, setPaymentTerms] = useState(15);
  const [extraExpenses, setExtraExpenses] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Initialize or reset when modal opens or sale prop changes
  useEffect(() => {
    if (isOpen && sale) {
      setError(null);
      setSubmitting(false);

      const rawDate = sale.invoice_date || sale.sale_date || '';
      const initialDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
        ? rawDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      setInvoiceDate(initialDate);

      const initialTerms = sale.payment_terms_days !== undefined && sale.payment_terms_days !== null
        ? Number(sale.payment_terms_days)
        : 15;
      setPaymentTerms(initialTerms);

      const expensesSum = Array.isArray(sale.expenses)
        ? sale.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
        : 0;
      const initialExpenses = Number(sale.extra_expenses_total !== undefined && sale.extra_expenses_total !== null
        ? sale.extra_expenses_total
        : expensesSum);
      setExtraExpenses(initialExpenses);

      setNotes(sale.notes || '');

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, sale]);

  if (!isOpen || !sale) return null;

  // Auto-recalculate due date from invoiceDate + paymentTerms
  const calculateDueDate = (dateStr, termsDays) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + Number(termsDays || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const calculatedDueDate = calculateDueDate(invoiceDate, paymentTerms);

  // Financial preview based on current form inputs
  const productsTotal = Number(sale.products_total || (Array.isArray(sale.items)
    ? sale.items.reduce((s, it) => s + Number(it.total_price || it.total_amount || 0), 0)
    : Number(sale.total_amount || 0)));
  const discountAmount = Number(sale.discount_amount || 0);
  const currentExpenses = Math.max(0, Number(extraExpenses || 0));
  const newCurrentTotal = Math.max(0, productsTotal + currentExpenses - discountAmount);
  const prevBalance = Number(sale.previous_balance || 0);
  const appliedCredit = Number(sale.applied_credit_amount || 0);
  const newNetPayable = Math.max(0, (newCurrentTotal + prevBalance) - appliedCredit);
  const paidAmount = Number(sale.paid_amount || 0);
  const newPending = Math.max(0, newNetPayable - paidAmount);

  const invNumber = sale.invoice_number || `INV-${String(sale.id).padStart(6, '0')}`;
  const presetTerms = [7, 15, 30, 45, 60];

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!invoiceDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      setError('Please provide a valid Invoice Date in YYYY-MM-DD format.');
      return;
    }
    if (paymentTerms < 0 || !Number.isInteger(Number(paymentTerms))) {
      setError('Payment terms must be a non-negative number of days.');
      return;
    }
    if (isNaN(Number(extraExpenses)) || Number(extraExpenses) < 0) {
      setError('Extra expenses cannot be negative.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        invoice_date: invoiceDate,
        payment_terms_days: Number(paymentTerms),
        extra_expenses: Number(extraExpenses || 0),
        notes: notes.trim(),
      };

      const res = await authedFetch(`/sales/${sale.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (showToast) {
        showToast(res.message || `Sale ${invNumber} updated successfully.`);
      }

      if (onSuccess) {
        await onSuccess(res.sale);
      }

      onClose();
    } catch (err) {
      console.error('Error updating sale:', err);
      setError(err.message || 'Unable to update sale details.');
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !submitting && onClose()}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-auto max-h-[92vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
                <ReceiptText size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Edit Sale Invoice
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                    {invNumber}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Update invoice dates, payment terms, courier expenses and remarks
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Read-only Context Banner */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Customer</span>
                <strong className="text-slate-800 dark:text-slate-200 text-sm">
                  {sale.customer_name || 'Walk-in Customer'}
                </strong>
                {sale.mobile && (
                  <span className="text-slate-500 dark:text-slate-400 text-xs ml-2">({sale.mobile})</span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Products Subtotal</span>
                <strong className="text-slate-900 dark:text-slate-100 font-black text-sm">
                  {currency(productsTotal)}
                </strong>
              </div>
            </div>

            {/* Date & Terms Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Invoice Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar size={14} className="text-sky-600" />
                  Invoice Date (YYYY-MM-DD)
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none font-medium text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setInvoiceDate(new Date().toISOString().slice(0, 10))}
                    className="text-[10.5px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 hover:underline"
                  >
                    Set to Today
                  </button>
                </div>
              </div>

              {/* Due Date (Auto-calculated Preview) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock size={14} className="text-amber-600" />
                  Calculated Due Date
                </label>
                <div className="px-3 py-2 text-sm bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-xl font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>{calculatedDueDate ? formatDateDMY(calculatedDueDate) : 'Invalid date'}</span>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    +{paymentTerms} Days
                  </span>
                </div>
                <span className="text-[10.5px] text-slate-400 block pt-1">
                  Auto-synced with Invoice Date + Payment Terms
                </span>
              </div>
            </div>

            {/* Payment Terms (Days) & Preset Chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Payment Terms (Days)
                </label>
                <div className="flex items-center gap-1.5">
                  {presetTerms.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setPaymentTerms(days)}
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all ${
                        Number(paymentTerms) === days
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min="0"
                max="365"
                required
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none font-medium text-slate-800 dark:text-slate-200"
                placeholder="Number of days (e.g. 15)"
              />
            </div>

            {/* Courier / Extra Expenses */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Truck size={14} className="text-teal-600" />
                  Courier / Extra Expenses (₹)
                </span>
                <span className="text-[11px] text-slate-400 font-normal">Optional</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={extraExpenses}
                  onChange={(e) => setExtraExpenses(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none font-medium text-slate-800 dark:text-slate-200"
                  placeholder="0.00"
                />
              </div>
              <span className="text-[10.5px] text-slate-400 block">
                Modifying courier/extra charge recalculates the sale grand total and pending balance.
              </span>
            </div>

            {/* Notes / Remarks */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText size={14} className="text-slate-500" />
                Notes / Remarks
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none font-medium text-slate-800 dark:text-slate-200 resize-none"
                placeholder="Add special instructions, tracking info, or billing remarks..."
              />
            </div>

            {/* Live Financial Breakdown Card */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Products Subtotal:</span>
                <span>{currency(productsTotal)}</span>
              </div>
              {currentExpenses > 0 && (
                <div className="flex justify-between text-teal-600 dark:text-teal-400 font-medium">
                  <span>+ Courier / Extra Expenses:</span>
                  <span>+{currency(currentExpenses)}</span>
                </div>
              )}
              {prevBalance > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium">
                  <span>+ Previous Balance:</span>
                  <span>+{currency(prevBalance)}</span>
                </div>
              )}
              {appliedCredit > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>- Applied Credit Note:</span>
                  <span>-{currency(appliedCredit)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-slate-200/70 dark:border-slate-800 font-bold text-slate-900 dark:text-slate-100 text-sm">
                <span>Current Sale Total:</span>
                <span>{currency(newCurrentTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400 text-xs">
                <span>Amount Paid:</span>
                <span>{currency(paidAmount)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200/70 dark:border-slate-800 font-black text-sm">
                <span className={newPending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                  Updated Pending Balance:
                </span>
                <span className={newPending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                  {currency(newPending)}
                </span>
              </div>
            </div>
          </form>

          {/* Footer Actions */}
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="px-5 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-md shadow-sky-600/20 hover:shadow-sky-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Check size={14} />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
