import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Send, 
  FileText, 
  ReceiptText, 
  Copy, 
  Check, 
  Share2, 
  Layers,
  MessageCircle,
  ChevronRight
} from 'lucide-react';
import { 
  shareToWhatsAppService, 
  formatWhatsAppMessage, 
  generateInvoicePDFDoc, 
  generateStatementPDFDoc,
  getBrandName
} from '../../utils/pdfAndShareService';

export default function ShareInvoiceModal({
  isOpen,
  onClose,
  target,
  shop = {},
  authedFetch,
  showToast,
  currency = (v) => {
    const num = Number(v || 0);
    if (Math.abs(num - Math.round(num)) < 0.005) {
      return `₹${Math.round(num).toLocaleString('en-IN')}`;
    }
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
  formatDateDMY = (d) => d ? new Date(d).toLocaleDateString('en-GB') : 'N/A',
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('all');
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Extract customer and invoices list
  const customer = target?.customer || {};
  const invoices = useMemo(() => {
    if (!target) return [];
    if (target.mode === 'single_invoice' && target.sale) {
      return [target.sale];
    }
    const rawList = Array.isArray(target.items) && target.items.length > 0
      ? target.items
      : (Array.isArray(target.customer?.items) && target.customer.items.length > 0 
          ? target.customer.items 
          : (Array.isArray(target.customer?.invoices) && target.customer.invoices.length > 0
              ? target.customer.invoices
              : (target.sale ? [target.sale] : [target.customer || {}])));
    return rawList.filter(Boolean);
  }, [target]);

  // Set initial selected invoice whenever target opens or changes
  useEffect(() => {
    if (target) {
      if (target.mode === 'single_invoice' && target.sale) {
        setSelectedInvoiceId(String(target.sale.id));
      } else if (invoices.length === 1) {
        setSelectedInvoiceId(String(invoices[0].id || 'all'));
      } else {
        setSelectedInvoiceId('all');
      }
      setCopied(false);
    }
  }, [target, invoices]);

  if (!isOpen || !target) return null;

  const isAllSelected = selectedInvoiceId === 'all';
  const activeInvoice = isAllSelected 
    ? null 
    : (invoices.find((inv) => String(inv.id) === String(selectedInvoiceId)) || invoices[0] || null);

  const customerDisplayName = customer.customer_name || customer.name || activeInvoice?.customer_name || 'Valued Customer';
  const customerMobile = customer.mobile || activeInvoice?.mobile || '';

  // Aggregate metrics for "all" mode
  const totalBilledAll = invoices.reduce((acc, inv) => acc + Number(inv.total_amount || 0), 0);
  const totalPaidAll = invoices.reduce((acc, inv) => acc + Number(inv.paid_amount || 0), 0);
  const totalPendingAll = Number(customer.pending_amount ?? invoices.reduce((acc, inv) => acc + Number(inv.pending_amount || 0), 0));

  // Determine message type
  const shareType = isAllSelected ? 'pending_summary' : 'single_invoice';

  // Live formatted WhatsApp message
  const previewMessage = formatWhatsAppMessage({
    customer: {
      ...customer,
      items: invoices,
      pending_amount: totalPendingAll,
      total_amount: totalBilledAll,
      paid_amount: totalPaidAll,
    },
    sale: activeInvoice,
    shop,
    type: shareType,
  });

  const handleCopyMessage = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(previewMessage);
      }
      setCopied(true);
      if (showToast) showToast('Message text copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      if (showToast) showToast('Failed to copy text.');
    }
  };

  const handleShareWhatsAppAndPdf = async () => {
    try {
      setSharing(true);
      await shareToWhatsAppService({
        customer: {
          ...customer,
          items: invoices,
          pending_amount: totalPendingAll,
          total_amount: totalBilledAll,
          paid_amount: totalPaidAll,
        },
        sale: activeInvoice,
        shop,
        type: isAllSelected ? 'pending_summary' : 'single_invoice',
        authedFetch,
        showToast,
      });
      onClose();
    } catch (err) {
      if (showToast) showToast(`Share failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSharing(false);
    }
  };

  const handleDownloadPdfOnly = () => {
    try {
      if (isAllSelected) {
        const doc = generateStatementPDFDoc(
          { ...customer, pending_amount: totalPendingAll, total_amount: totalBilledAll, paid_amount: totalPaidAll },
          invoices,
          shop
        );
        doc.save(`Statement_${customerDisplayName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
        if (showToast) showToast('Statement PDF downloaded!');
      } else if (activeInvoice) {
        const invNo = activeInvoice.invoice_number || `INV-${String(activeInvoice.id || '1').padStart(6, '0')}`;
        const doc = generateInvoicePDFDoc(activeInvoice, customer, shop);
        doc.save(`Invoice_${invNo}_${customerDisplayName.replace(/\s+/g, '_')}.pdf`);
        if (showToast) showToast(`Invoice ${invNo} PDF downloaded!`);
      }
    } catch (err) {
      if (showToast) showToast(`PDF download failed: ${err.message || 'Error'}`);
    }
  };

  const handleSendTextReminderOnly = async () => {
    try {
      setSharing(true);
      await shareToWhatsAppService({
        customer: {
          ...customer,
          items: invoices,
          pending_amount: totalPendingAll,
          total_amount: totalBilledAll,
          paid_amount: totalPaidAll,
        },
        sale: activeInvoice,
        shop,
        type: isAllSelected ? 'pending_reminder_only' : 'invoice_reminder_only',
        authedFetch,
        showToast,
      });
      onClose();
    } catch (err) {
      if (showToast) showToast(`Share failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[92vh] z-10 animate-in fade-in zoom-in-95 duration-150">
        
        {/* 1. Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-white to-white flex items-start justify-between gap-4">
          <div className="min-w-0 flex items-start gap-3">
            <div className="mt-0.5 hidden sm:grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
              <Share2 size={18} />
            </div>
            <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-700">Send payment details</span>
              {invoices.length > 1 && (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                  {invoices.length} invoices
                </span>
              )}
            </div>
            <h2 className="truncate text-base sm:text-lg font-black text-slate-900 leading-snug">
              {customerDisplayName}
            </h2>
            <p className="text-xs text-slate-500 font-medium truncate">
              {customerMobile ? `WhatsApp · ${customerMobile}` : 'No WhatsApp number provided'}
              {customer.shop_name ? `  ·  ${customer.shop_name}` : ''}
            </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          
          {/* Invoice Selector (Tabs/Dropdown if multiple invoices exist) */}
          {invoices.length > 1 && (
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers size={14} className="text-emerald-600" /> What would you like to share?
                </span>
                <span className="text-[11px] text-slate-500">
                  {isAllSelected ? 'Statement' : 'Individual invoice'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceId('all')}
                  aria-pressed={isAllSelected}
                  className={`min-h-10 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isAllSelected
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50 border border-slate-200'
                  }`}
                >
                  <ReceiptText size={13} />
                  <span>All pending ({invoices.length})</span>
                  <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md font-bold ${isAllSelected ? 'bg-emerald-700 text-emerald-50' : 'bg-slate-100 text-slate-600'}`}>
                    {currency(totalPendingAll)}
                  </span>
                </button>

                {invoices.map((inv) => {
                  const invNo = inv.invoice_number || `INV-${String(inv.id || '1').padStart(6, '0')}`;
                  const isInvSelected = !isAllSelected && String(activeInvoice?.id) === String(inv.id);
                  const invPending = Number(inv.pending_amount || 0);

                  return (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => setSelectedInvoiceId(String(inv.id))}
                      aria-pressed={isInvSelected}
                      className={`min-h-10 px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        isInvSelected
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50 border border-slate-200'
                      }`}
                    >
                      <span>{invNo}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${isInvSelected ? 'bg-emerald-700 text-emerald-50' : 'bg-slate-100 text-slate-600'}`}>
                        {currency(invPending > 0 ? invPending : inv.total_amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Details Card */}
          {isAllSelected ? (
            /* Multi-Invoice Summary View */
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg shadow-slate-900/10">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.14em]">
                  Outstanding statement
                </span>
                <span className="text-[11px] text-emerald-300 font-bold">
                  {invoices.length} Pending Invoices
                </span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-white/10 px-2 py-4 text-center">
                <div className="px-2">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">Total Invoiced</span>
                  <strong className="text-xs sm:text-sm font-bold text-slate-100">{currency(totalBilledAll)}</strong>
                </div>
                <div className="px-2">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">Total Paid</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-400">{currency(totalPaidAll)}</span>
                </div>
                <div className="px-2">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">Outstanding Balance</span>
                  <strong className="text-sm sm:text-base font-black text-rose-400">{currency(totalPendingAll)}</strong>
                </div>
              </div>
            </section>
          ) : activeInvoice ? (
            /* Single Invoice View */
            <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-black bg-teal-100 text-teal-800 border border-teal-200">
                    {activeInvoice.invoice_number || `INV-${String(activeInvoice.id).padStart(6, '0')}`}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">
                    Date: {formatDateDMY(activeInvoice.invoice_date || activeInvoice.sale_date)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {String(activeInvoice.payment_mode || '').trim().toLowerCase() === 'cash' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                      Terms: Cash Only
                    </span>
                  ) : (
                    <span className="text-slate-500 font-medium">
                      Due: <strong className="text-slate-700">{activeInvoice.due_date ? formatDateDMY(activeInvoice.due_date) : 'On Receipt'}</strong>
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                    Number(activeInvoice.pending_amount) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {Number(activeInvoice.pending_amount) > 0 ? `Pending: ${currency(activeInvoice.pending_amount)}` : 'Fully Paid'}
                  </span>
                </div>
              </div>

              {/* Items List in this invoice */}
              <div className="space-y-1 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Invoice Items
                </span>
                {(() => {
                  const itemsList = Array.isArray(activeInvoice.items) && activeInvoice.items.length > 0
                    ? activeInvoice.items
                    : [{
                        product_name: activeInvoice.product_name || 'Item',
                        quantity: activeInvoice.quantity || 1,
                        unit_price: Number(activeInvoice.total_amount || 0) / Math.max(1, Number(activeInvoice.quantity || 1)),
                        total_price: activeInvoice.total_amount,
                        colour: activeInvoice.colour
                      }];
                  return itemsList.map((it, idx) => {
                    const rawShort = it.custom_product_name || it.short_name || it.product_short_name || it.product_name || it.name || 'Product';
                    const shortName = String(rawShort).split('/')[0].split(',')[0].trim() || 'Product';
                    const brandName = getBrandName(it, activeInvoice);

                    return (
                      <div key={idx} className="flex items-center justify-between text-slate-700 py-0.5">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                          <span className="font-semibold">{shortName}</span>
                          {brandName && (
                            <span className="text-[10px] text-slate-500 font-bold">
                              ({brandName})
                            </span>
                          )}
                          {it.colour && (
                            <span className="text-[10px] text-teal-700 bg-teal-50 px-1 rounded border border-teal-200 font-bold">
                              {it.colour}
                            </span>
                          )}
                          <span className="text-slate-400 font-normal">x {it.quantity || 1}</span>
                        </span>
                        <strong className="text-slate-900 font-bold">
                          {currency(it.total_price || (Number(it.unit_price || 0) * Number(it.quantity || 1)))}
                        </strong>
                      </div>
                    );
                  });
                })()}

                {/* Extra expenses if any */}
                {Array.isArray(activeInvoice.expenses) && activeInvoice.expenses.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-200/60 text-[11px] text-teal-800 space-y-0.5">
                    {activeInvoice.expenses.map((e, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>+ {e.expense_name || e.expense_type}</span>
                        <span>{currency(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Financial line */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-900">
                <span>Total <strong>{currency(activeInvoice.total_amount)}</strong></span>
                <span className="text-emerald-700">Paid {currency(activeInvoice.paid_amount || 0)}</span>
                <span className="text-rose-600">Due {currency(activeInvoice.pending_amount || 0)}</span>
              </div>
            </section>
          ) : null}

          {/* 3. Live Message Preview Box */}
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <MessageCircle size={14} className="text-emerald-600" /> WhatsApp message
              </span>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check size={13} className="text-emerald-600" />
                    <span className="text-emerald-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-950 text-slate-100 p-3.5 rounded-2xl font-mono text-[11px] sm:text-xs leading-relaxed whitespace-pre-wrap max-h-44 overflow-y-auto border border-slate-800 shadow-inner selection:bg-emerald-500 selection:text-white">
              {previewMessage}
            </div>
          </section>
        </div>

        {/* 4. Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/90 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          <div className="flex items-center gap-2">
            {/* Download PDF Only */}
            <button
              type="button"
              onClick={handleDownloadPdfOnly}
              className="flex-1 sm:flex-none px-3 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              title="Download PDF document directly"
            >
              <FileText size={14} /> PDF Only
            </button>

            {/* Reminder Text Only */}
            <button
              type="button"
              onClick={handleSendTextReminderOnly}
              disabled={sharing}
              className="flex-1 sm:flex-none px-3 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-200 hover:border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              title="Open WhatsApp with message text without generating PDF"
            >
              <Send size={14} className="text-emerald-600" /> Text Only
            </button>
          </div>

          {/* Primary Action: Share WhatsApp & PDF */}
          <button
            type="button"
            onClick={handleShareWhatsAppAndPdf}
            disabled={sharing}
            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Send size={15} />
            <span>{sharing ? 'Preparing Document...' : 'Share via WhatsApp & PDF'}</span>
            {!sharing && <ChevronRight size={14} />}
          </button>
        </div>

      </div>
    </div>
  );
}
