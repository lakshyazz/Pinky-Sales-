import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  Printer,
  Share2,
  Copy,
  Check,
  Calendar,
  Phone,
  MapPin,
  Building,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShoppingBag,
  CreditCard,
  RefreshCw,
  Tag,
  Receipt,
  Layers,
  ArrowDownLeft,
  TrendingUp,
} from 'lucide-react';
import {
  generateInvoicePDFDoc,
  shareToWhatsAppService,
  formatMoney,
  formatDMY,
} from '../../utils/pdfAndShareService';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const currency = (v) => `₹${money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function InvoiceDetailDrawer({
  isOpen,
  invoiceRef,
  onClose,
  api,
  customer: propCustomer = null,
  shopId = null,
  setGlobalToast,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);

  const fetchInvoice = useCallback(async () => {
    if (!invoiceRef) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = `/sales/by-ref/${encodeURIComponent(invoiceRef)}${shopId ? `?shopId=${shopId}` : ''}`;
      const data = await api(endpoint);
      setInvoiceData(data);
    } catch (err) {
      console.error('Failed to load invoice:', err);
      setError(err.message || 'Unable to load invoice details.');
      setGlobalToast && setGlobalToast({ type: 'error', message: err.message || 'Failed to load invoice' });
    } finally {
      setLoading(false);
    }
  }, [invoiceRef, shopId, api, setGlobalToast]);

  useEffect(() => {
    if (isOpen && invoiceRef) {
      fetchInvoice();
    } else if (!isOpen) {
      setInvoiceData(null);
      setError(null);
    }
  }, [isOpen, invoiceRef, fetchInvoice]);

  // Handle escape key to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const sale = invoiceData?.sale;
  const customer = invoiceData?.customer || propCustomer || {};
  const shop = invoiceData?.shop || {};

  const handleCopyRef = async () => {
    const ref = sale?.invoice_number || invoiceRef;
    if (!ref) return;
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setGlobalToast && setGlobalToast({ type: 'success', message: `Copied ${ref} to clipboard` });
    } catch {
      // Fallback
    }
  };

  const handleDownloadPDF = async () => {
    if (!sale) return;
    try {
      setDownloadingPdf(true);
      const doc = await generateInvoicePDFDoc(sale, customer, shop);
      const filename = `${sale.invoice_number || `INV-${sale.id}`}.pdf`;
      doc.save(filename);
      setGlobalToast && setGlobalToast({ type: 'success', message: 'Invoice PDF downloaded' });
    } catch (err) {
      console.error('PDF generation error:', err);
      setGlobalToast && setGlobalToast({ type: 'error', message: 'Failed to generate PDF: ' + (err.message || 'Unknown error') });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!sale) return;
    try {
      setSharingWhatsApp(true);
      await shareToWhatsAppService({
        customer,
        type: 'single_invoice',
        sale,
        shop,
        authedFetch: api,
        showToast: setGlobalToast,
      });
    } catch (err) {
      console.error('WhatsApp share error:', err);
      setGlobalToast && setGlobalToast({ type: 'error', message: 'WhatsApp share failed: ' + (err.message || 'Unknown error') });
    } finally {
      setSharingWhatsApp(false);
    }
  };

  const items = sale?.items || [];
  const payments = sale?.payments || [];
  const creditRedemptions = sale?.credit_redemptions || [];
  const expenses = sale?.expenses || [];

  // Financial & Profit Calculations
  const invoiceTotal = Number(sale?.invoice_total ?? sale?.current_invoice_total ?? sale?.total_amount ?? 0);
  const totalCost = Number(sale?.total_cost ?? items.reduce((s, it) => s + (Number(it.line_cost) || (Number(it.unit_cost || it.purchase_price || 0) * Number(it.quantity || 1))), 0));
  const grossProfit = Number(sale?.gross_profit ?? (invoiceTotal - totalCost));
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const netProfit = Number(sale?.net_profit ?? (grossProfit - expensesTotal));
  const profitMarginPct = invoiceTotal > 0 ? Number(((netProfit / invoiceTotal) * 100).toFixed(1)) : 0;

  const appliedCredit = Number(sale?.applied_credit_amount || 0);
  const paidAmount = Number(sale?.paid_amount ?? 0);
  const pendingAmount = Number(sale?.pending_amount ?? Math.max(0, invoiceTotal - appliedCredit - paidAmount));
  const isPaid = pendingAmount <= 0.01;
  const isPartiallyPaid = paidAmount > 0.01 && !isPaid;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
            aria-hidden="true"
          />

          {/* Slide-over Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full z-10 border-l border-slate-200"
            style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
          >
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-sm">
                  <Receipt size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight font-mono">
                      {sale?.invoice_number || invoiceRef}
                    </h2>
                    <button
                      type="button"
                      onClick={handleCopyRef}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors cursor-pointer"
                      title="Copy invoice number"
                    >
                      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                    {sale && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                          isPaid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isPartiallyPaid
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {isPaid ? (
                          <>
                            <CheckCircle2 size={12} /> Paid
                          </>
                        ) : isPartiallyPaid ? (
                          <>
                            <Clock size={12} /> Partial
                          </>
                        ) : (
                          <>
                            <AlertCircle size={12} /> Due
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Zoho Books style tax invoice overview
                  </p>
                </div>
              </div>

              {/* Action Buttons & Close */}
              <div className="flex items-center gap-2">
                {sale && (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadPDF}
                      disabled={downloadingPdf}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                      title="Download Invoice PDF"
                    >
                      {downloadingPdf ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <Download size={13} className="text-sky-600" />
                      )}
                      <span>PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      disabled={sharingWhatsApp}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                      title="Share via WhatsApp"
                    >
                      {sharingWhatsApp ? (
                        <RefreshCw size={13} className="animate-spin" />
                      ) : (
                        <Share2 size={13} />
                      )}
                      <span>WhatsApp</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loading ? (
                <div className="space-y-4 py-8">
                  <div className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-4 py-1">
                      <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                      <div className="space-y-2">
                        <div className="h-4 bg-slate-200 rounded"></div>
                        <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                      </div>
                    </div>
                  </div>
                  <div className="h-32 bg-slate-100 rounded-xl animate-pulse"></div>
                  <div className="h-48 bg-slate-100 rounded-xl animate-pulse"></div>
                </div>
              ) : error ? (
                <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex flex-col items-center text-center gap-3">
                  <AlertCircle size={32} className="text-rose-500" />
                  <div>
                    <h3 className="font-bold text-sm">Error Loading Invoice</h3>
                    <p className="text-xs text-rose-600 mt-1">{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchInvoice}
                    className="mt-2 px-4 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              ) : sale ? (
                <>
                  {/* Meta Details Card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/80 border border-slate-200 rounded-xl p-4 text-xs">
                    {/* Customer Info */}
                    <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-200 pb-3 md:pb-0 md:pr-4">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={13} className="text-sky-600" />
                        Customer Details
                      </div>
                      <div className="font-bold text-slate-800 text-sm">
                        {customer.name || customer.customer_name || sale.customer_name || 'Walk-in Customer'}
                      </div>
                      {(customer.mobile || sale.mobile) && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Phone size={12} className="text-slate-400" />
                          <a
                            href={`tel:${customer.mobile || sale.mobile}`}
                            className="hover:text-sky-600 font-medium"
                          >
                            {customer.mobile || sale.mobile}
                          </a>
                        </div>
                      )}
                      {(customer.address || sale.address) && (
                        <div className="flex items-start gap-2 text-slate-600">
                          <MapPin size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                          <span>{customer.address || sale.address}</span>
                        </div>
                      )}
                      {(customer.gstin || sale.customer_gstin) && (
                        <div className="text-[11px] text-slate-500 font-mono">
                          GSTIN: {customer.gstin || sale.customer_gstin}
                        </div>
                      )}
                    </div>

                    {/* Invoice Meta */}
                    <div className="space-y-2 pl-0 md:pl-2">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Building size={13} className="text-sky-600" />
                        Invoice Info
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Invoice Date:</span>
                        <span className="font-semibold text-slate-800">
                          {formatDMY(sale.invoice_date || sale.sale_date)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Payment Mode:</span>
                        <span className="font-semibold text-slate-800 uppercase">
                          {sale.payment_mode || 'Cash'}
                        </span>
                      </div>
                      {sale.price_type && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Price Tier:</span>
                          <span className="font-semibold text-slate-800 capitalize">
                            {sale.price_type}
                          </span>
                        </div>
                      )}
                      {(shop.name || sale.shop_name) && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Branch:</span>
                          <span className="font-semibold text-slate-800">
                            {shop.name || sale.shop_name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Profit & Margin Highlights Banner */}
                  <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200/80 rounded-xl p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600">
                          <TrendingUp size={20} />
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                            Net Profit Earned
                          </div>
                          <div className="text-lg font-extrabold text-emerald-700 font-mono tracking-tight flex items-baseline gap-2">
                            <span>{currency(netProfit)}</span>
                            <span className="text-xs font-bold text-emerald-700 px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">
                              {profitMarginPct}% margin
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right border-l border-emerald-200/60 pl-4 space-y-0.5">
                        <div className="text-[10.5px] text-slate-500 font-medium">Cost of Goods (COGS)</div>
                        <div className="text-xs font-bold text-slate-700 font-mono">{currency(totalCost)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                        <ShoppingBag size={14} className="text-sky-600" />
                        Items Summary ({items.length})
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="py-2 px-3">#</th>
                            <th className="py-2 px-3">Item Description</th>
                            <th className="py-2 px-3 text-center">Qty</th>
                            <th className="py-2 px-3 text-right">Rate</th>
                            <th className="py-2 px-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {items.map((item, idx) => {
                            const itemName = item.custom_product_name || item.product_name || item.name || item.short_name || 'Product';
                            const brandName = item.custom_brand_name || item.manufacturing_brand_name || item.brand_name || item.brand;
                            const qty = Number(item.quantity) || 1;
                            const rate = Number(item.unit_price) || (qty ? Number(item.total_price) / qty : Number(item.total_price));
                            const amt = Number(item.total_price) || (qty * rate);
                            const unitCost = Number(item.unit_cost || item.purchase_price || 0);
                            const lineCost = Number(item.line_cost ?? (unitCost * qty));
                            const lineProfit = Number(item.line_profit ?? (amt - lineCost));
                            const marginPct = Number(item.margin_pct ?? (amt > 0 ? (lineProfit / amt) * 100 : 0)).toFixed(1);

                            return (
                              <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-slate-800">{itemName}</div>
                                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                                    {brandName && (
                                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium text-[10px]">
                                        {brandName}
                                      </span>
                                    )}
                                    {item.quality_variant && (
                                      <span className="bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-medium text-[10px]">
                                        {item.quality_variant}
                                      </span>
                                    )}
                                    {item.colour && (
                                      <span className="text-slate-400">· {item.colour}</span>
                                    )}
                                  </div>
                                  {unitCost > 0 && (
                                    <div className="flex items-center gap-2 mt-1 text-[10.5px]">
                                      <span className="text-slate-500 font-mono">
                                        Cost: {currency(unitCost)}
                                      </span>
                                      <span className="text-slate-300">|</span>
                                      <span className={`font-mono font-semibold ${lineProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        Profit: {lineProfit >= 0 ? '+' : ''}{currency(lineProfit)} ({marginPct}%)
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-semibold text-slate-700">{qty}</td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600">{currency(rate)}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-slate-900 font-mono">{currency(amt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Financial Summary Calculation Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Products Subtotal:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {currency(sale.products_total || invoiceTotal)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-500 text-[11px]">
                      <span>Less Total Cost of Goods (COGS):</span>
                      <span className="font-mono text-slate-600">
                        -{currency(totalCost)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-t border-dashed border-slate-200 text-emerald-700 font-semibold bg-emerald-50/50 px-2 rounded-lg">
                      <span className="flex items-center gap-1">
                        <TrendingUp size={12} /> Gross Profit:
                      </span>
                      <span className="font-mono font-bold">
                        +{currency(grossProfit)}
                      </span>
                    </div>

                    {appliedCredit > 0 && (
                      <div className="flex justify-between items-center text-rose-600">
                        <span className="flex items-center gap-1">
                          <Tag size={12} /> Less: Credit Note Applied:
                        </span>
                        <span className="font-mono font-bold">
                          -{currency(appliedCredit)}
                        </span>
                      </div>
                    )}

                    {expenses.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-slate-200">
                        {expenses.map((exp, i) => (
                          <div key={i} className="flex justify-between items-center text-slate-500 text-[11px]">
                            <span>+ {exp.expense_name || exp.expense_type || 'Expense'}:</span>
                            <span className="font-mono">{currency(exp.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                      <span>Invoice Total:</span>
                      <span className="font-mono text-base text-slate-900">
                        {currency(invoiceTotal)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-emerald-100/70 border border-emerald-200 text-emerald-900 font-bold">
                      <span className="flex items-center gap-1.5 text-xs">
                        <TrendingUp size={14} className="text-emerald-700" /> Net Profit Earned:
                      </span>
                      <span className="font-mono text-sm font-extrabold text-emerald-700">
                        {currency(netProfit)} <span className="text-[11px] font-normal text-emerald-600">({profitMarginPct}% margin)</span>
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-emerald-600 font-semibold pt-1">
                      <span>Amount Paid:</span>
                      <span className="font-mono">
                        {currency(paidAmount)}
                      </span>
                    </div>

                    <div className={`pt-2 border-t border-slate-200 flex justify-between items-center font-bold ${
                      isPaid ? 'text-emerald-700' : 'text-rose-600'
                    }`}>
                      <span>Balance Due:</span>
                      <span className="font-mono text-base">
                        {currency(pendingAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Credit Note Redemptions Breakdown (if any) */}
                  {creditRedemptions.length > 0 && (
                    <div className="border border-rose-100 bg-rose-50/50 rounded-xl p-3 text-xs space-y-2">
                      <div className="font-bold text-rose-800 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                        <Tag size={13} className="text-rose-600" />
                        Credit Note Redemptions
                      </div>
                      <div className="space-y-1.5">
                        {creditRedemptions.map((cnr, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-lg border border-rose-100 font-mono text-[11px]">
                            <span className="text-rose-700 font-bold">{cnr.credit_note_number}</span>
                            <span className="text-rose-600 font-semibold">{currency(cnr.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment Timeline / Allocations */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                        <CreditCard size={14} className="text-emerald-600" />
                        Payments & Allocations ({payments.length})
                      </div>
                    </div>

                    {payments.length > 0 ? (
                      <div className="divide-y divide-slate-100 text-xs">
                        {payments.map((pm, idx) => (
                          <div key={pm.id || idx} className="p-3 hover:bg-slate-50/60 transition-colors flex items-center justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-800 text-xs">
                                  {pm.payment_number || `PAY-#${pm.payment_id || idx + 1}`}
                                </span>
                                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-semibold uppercase">
                                  {pm.payment_mode || 'Payment'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                <span>{formatDMY(pm.payment_date)}</span>
                                {pm.reference_number && <span>· Ref: {pm.reference_number}</span>}
                              </div>
                              {pm.notes && (
                                <div className="text-[10px] text-slate-500 italic mt-0.5">
                                  {pm.notes}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-emerald-600 text-sm">
                                {currency(pm.amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No direct payments recorded for this invoice yet.
                      </div>
                    )}
                  </div>

                  {/* Notes / Remarks */}
                  {sale.notes && (
                    <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-3 text-xs space-y-1">
                      <div className="font-bold text-amber-800 text-[11px] uppercase tracking-wider">
                        Invoice Remarks / Notes
                      </div>
                      <p className="text-slate-700 text-xs leading-relaxed whitespace-pre-line">
                        {sale.notes}
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
              <span className="text-[11px]">Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-slate-600 shadow-xs">Esc</kbd> to dismiss</span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold transition-colors shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
