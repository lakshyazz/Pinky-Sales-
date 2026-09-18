import React, { useEffect, useState } from 'react';
import { 
  FileText, 
  Printer, 
  Download, 
  ArrowLeft, 
  Phone, 
  MapPin, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Store,
  Share2,
  Send
} from 'lucide-react';
import { generateInvoicePDFDoc } from '../../utils/pdfAndShareService';

export default function PublicInvoiceViewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Extract reference from path or query params
  const getRefFromUrl = () => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref') || params.get('id') || params.get('invoiceId');
    if (refParam) return refParam.trim();

    const pathname = decodeURIComponent(window.location.pathname);
    const matchView = pathname.match(/\/view\/invoice\/([^/?#]+)/i);
    if (matchView && matchView[1]) return matchView[1].trim();

    const matchShort = pathname.match(/\/i\/([^/?#]+)/i);
    if (matchShort && matchShort[1]) return matchShort[1].trim();

    return '';
  };

  const invoiceRef = getRefFromUrl();

  useEffect(() => {
    if (!invoiceRef) {
      setError('No invoice reference specified in link.');
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/public/invoice/${encodeURIComponent(invoiceRef)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Invoice not found (Status: ${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          if (data && data.invoice) {
            setInvoice(data.invoice);
          } else {
            setError('Invoice details could not be parsed.');
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[PublicInvoiceViewPage] Failed to load invoice:', err);
          setError(err.message || 'Unable to load invoice details.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [invoiceRef]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    try {
      setGeneratingPdf(true);
      const doc = await generateInvoicePDFDoc(invoice, invoice.customer, invoice.shop);
      const filename = `Invoice_${invoice.invoice_number || 'INV'}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Could not download PDF. Please use the Print button instead.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatCurrency = (val) => {
    const num = Number(val || 0);
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-sm">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-4" />
          <h2 className="text-base font-bold text-slate-800 dark:text-zinc-100 mb-1">Loading Invoice...</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">Fetching dynamic invoice details from Pinky Sales</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100 mb-2">Invoice Not Available</h2>
          <p className="text-sm text-slate-600 dark:text-zinc-400 mb-6">{error || 'This invoice could not be found or may have been updated.'}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-bold rounded-xl hover:opacity-90 transition-all inline-flex items-center gap-1.5"
          >
            <ArrowLeft size={14} /> Return to Store
          </button>
        </div>
      </div>
    );
  }

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const expenses = Array.isArray(invoice.expenses) ? invoice.expenses : [];
  const balanceDue = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0));
  const isPaid = balanceDue <= 0;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 py-6 px-3 sm:px-6 flex flex-col items-center font-sans">
      {/* Top Action Bar (Hidden when printing) */}
      <header className="print:hidden w-full max-w-3xl mb-4 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-3 rounded-2xl shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.location.href = '/'}
            className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 rounded-xl transition-all"
            title="Go to Home"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xs font-bold text-slate-900 dark:text-zinc-100">Tax Invoice #{invoice.invoice_number}</h1>
            <p className="text-[10px] text-slate-500 dark:text-zinc-400">Pinky Sales Dynamic Online Receipt</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Printer size={14} /> Print
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
          >
            {generatingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download PDF
          </button>
        </div>
      </header>

      {/* Printable Invoice Card */}
      <main className="w-full max-w-3xl bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-sm overflow-hidden print:border-none print:shadow-none print:m-0 print:p-0">
        {/* Invoice Header */}
        <div className="p-6 sm:p-8 border-b border-slate-200 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm">
                  PS
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                  {invoice.shop?.name || 'PINKY SALES'}
                </h2>
              </div>
              <p className="text-xs font-semibold text-emerald-700 mb-1">Premium Mobile & Display Solutions</p>
              {invoice.shop?.address && (
                <p className="text-xs text-slate-500 max-w-sm flex items-start gap-1">
                  <MapPin size={13} className="shrink-0 mt-0.5 text-slate-400" />
                  <span>{invoice.shop.address} {invoice.shop.area ? `(${invoice.shop.area})` : ''}</span>
                </p>
              )}
              {invoice.shop?.phone && (
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Phone size={13} className="shrink-0 text-slate-400" />
                  <span>{invoice.shop.phone}</span>
                </p>
              )}
              {invoice.shop?.gstin && (
                <p className="text-[11px] font-mono text-slate-600 font-medium mt-1">
                  GSTIN: {invoice.shop.gstin}
                </p>
              )}
            </div>

            <div className="sm:text-right">
              <span className="inline-block text-xs font-black uppercase px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 tracking-wider mb-2">
                Tax Invoice
              </span>
              <p className="text-sm font-bold font-mono text-slate-900">
                #{invoice.invoice_number}
              </p>
              <div className="text-xs text-slate-500 space-y-0.5 mt-2">
                <p>
                  <span className="font-semibold text-slate-600">Date:</span> {formatDate(invoice.invoice_date || invoice.sale_date)}
                </p>
                {invoice.due_date && (
                  <p>
                    <span className="font-semibold text-slate-600">Due Date:</span> {formatDate(invoice.due_date)}
                  </p>
                )}
                {invoice.payment_mode && (
                  <p className="capitalize">
                    <span className="font-semibold text-slate-600">Payment:</span> {invoice.payment_mode}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Billed To Section */}
          <div className="mt-6 pt-5 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Billed To
              </span>
              <p className="text-sm font-bold text-slate-900">{invoice.customer?.name || 'Walk-in Customer'}</p>
              {invoice.customer?.mobile && (
                <p className="text-xs text-slate-600 font-mono mt-0.5">{invoice.customer.mobile}</p>
              )}
              {invoice.customer?.address && (
                <p className="text-xs text-slate-500 mt-0.5">{invoice.customer.address}</p>
              )}
            </div>
            <div className="sm:text-right flex sm:flex-col justify-between sm:justify-center items-start sm:items-end">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Payment Status
                </span>
                {isPaid ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <CheckCircle2 size={13} /> Paid in Full
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    <Clock size={13} /> Balance Due: {formatCurrency(balanceDue)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="p-6 sm:p-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 pr-2 w-8 text-center">#</th>
                  <th className="py-2.5 px-3">Product / Item</th>
                  <th className="py-2.5 px-3 text-right w-20">Qty</th>
                  <th className="py-2.5 px-3 text-right w-28">Rate</th>
                  <th className="py-2.5 pl-3 text-right w-32">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                      No line items recorded on this invoice
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/50">
                      <td className="py-3 pr-2 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-bold text-slate-900">
                          {item.name || item.product_name || item.short_name || 'Item'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          {item.brand_name && <span>Brand: {item.brand_name}</span>}
                          {item.quality_variant && <span>Variant: {item.quality_variant}</span>}
                          {item.colour && <span>Color: {item.colour}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-700">
                        {item.quantity || 1}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(item.total_price || (Number(item.unit_price || 0) * Number(item.quantity || 1)))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Expenses breakdown if present */}
          {expenses.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Additional Charges
              </span>
              <div className="space-y-1 text-xs">
                {expenses.map((exp, idx) => (
                  <div key={exp.id || idx} className="flex items-center justify-between text-slate-600">
                    <span>{exp.expense_name || exp.expense_type || 'Courier / Transport'}</span>
                    <span className="font-mono">{formatCurrency(exp.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals Section */}
          <div className="mt-6 pt-5 border-t-2 border-slate-200 flex flex-col sm:flex-row justify-between items-start gap-6">
            <div className="max-w-xs text-xs text-slate-500">
              {invoice.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 mb-2">
                  <span className="font-bold text-slate-700 block mb-0.5">Notes:</span>
                  <p className="italic text-slate-600">{invoice.notes}</p>
                </div>
              )}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 mb-2">
                <span className="font-bold text-slate-700 block mb-0.5">Terms &amp; Conditions:</span>
                <p className="text-[11px] font-bold text-slate-700 tracking-wide uppercase">ORIGINAL LCD GOODS THREE MONTHS WARRANTY ONLY</p>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                This is a computer-generated tax invoice verified by Pinky Sales ERP.
              </p>
            </div>

            <div className="w-full sm:w-64 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Products Subtotal</span>
                <span className="font-mono font-medium">{formatCurrency(invoice.products_total)}</span>
              </div>
              {Number(invoice.extra_expenses_total || 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Additional Expenses</span>
                  <span className="font-mono font-medium">{formatCurrency(invoice.extra_expenses_total)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Amount</span>
                <span className="font-mono">{formatCurrency(invoice.total_amount)}</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1">
                <span>Amount Paid</span>
                <span className="font-mono font-medium text-emerald-700">{formatCurrency(invoice.paid_amount)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-rose-700 pt-1 border-t border-slate-200">
                <span>Balance Due</span>
                <span className="font-mono">{formatCurrency(balanceDue)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="p-6 bg-slate-50/70 border-t border-slate-200 text-center text-[11px] text-slate-400">
          <p>Thank you for choosing {invoice.shop?.name || 'Pinky Sales'}!</p>
          <p className="mt-1">For questions regarding this invoice, contact {invoice.shop?.phone || 'support'}.</p>
        </footer>
      </main>
    </div>
  );
}
