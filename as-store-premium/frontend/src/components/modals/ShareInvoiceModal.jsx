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
  ChevronRight,
  Phone,
  RotateCcw,
  Sparkles,
  Download
} from 'lucide-react';
import { 
  shareToWhatsAppService, 
  formatWhatsAppMessage, 
  parseCleanPhoneNumber,
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
  const [docType, setDocType] = useState('invoice'); // 'invoice' | 'statement'
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [editableMessage, setEditableMessage] = useState('');
  const [editablePhone, setEditablePhone] = useState('');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [statementSales, setStatementSales] = useState(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

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

  // Set initial selected invoice and default document type whenever modal opens
  useEffect(() => {
    if (target) {
      setDocType('invoice');
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

  // Pre-fetch complete customer history for statement generation (aligned with direct Statement Print icon)
  useEffect(() => {
    if (!isOpen || !target) {
      setStatementSales(null);
      return;
    }

    let isCancelled = false;
    const custId = customer.customer_id || customer.id || target?.sale?.customer_id;
    if (!authedFetch || !custId) return;

    const loadStatement = async () => {
      try {
        setLoadingStatement(true);
        const params = new URLSearchParams({
          customerId: String(custId),
          shopId: String(customer.shop_id || shop?.id || target?.sale?.shop_id || 1),
        });
        const resp = await authedFetch(`/customer-invoice?${params.toString()}`);
        if (!isCancelled && resp && Array.isArray(resp.sales) && resp.sales.length > 0) {
          setStatementSales(resp.sales);
        }
      } catch (err) {
        console.warn('ShareInvoiceModal background /customer-invoice fetch failed:', err);
      } finally {
        if (!isCancelled) setLoadingStatement(false);
      }
    };

    loadStatement();
    return () => { isCancelled = true; };
  }, [isOpen, target, customer.id, customer.customer_id, target?.sale?.customer_id, authedFetch, shop?.id]);

  const handleDocTypeChange = (newType) => {
    setDocType(newType);
    if (newType === 'statement') {
      setSelectedInvoiceId('all');
    }
  };

  const isAllSelected = selectedInvoiceId === 'all';
  const isStatement = docType === 'statement';
  const activeInvoice = isAllSelected 
    ? null 
    : (invoices.find((inv) => String(inv.id) === String(selectedInvoiceId)) || invoices[0] || null);

  const customerDisplayName = customer.customer_name || customer.name || activeInvoice?.customer_name || 'Valued Customer';
  const customerMobile = customer.mobile || activeInvoice?.mobile || '';

  // Aggregate metrics for modal invoices
  const totalBilledAll = invoices.reduce((acc, inv) => acc + Number(inv.total_amount || 0), 0);
  const totalPaidAll = invoices.reduce((acc, inv) => acc + Number(inv.paid_amount || 0), 0);
  const totalPendingAll = Number(customer.pending_amount ?? invoices.reduce((acc, inv) => acc + Number(inv.pending_amount || 0), 0));

  // Statement aggregated metrics from complete transaction history
  const statementInvoices = useMemo(() => {
    if (isStatement && statementSales && statementSales.length > 0) {
      return statementSales;
    }
    return invoices;
  }, [isStatement, statementSales, invoices]);

  const stmtTotalBilled = statementInvoices.reduce((acc, inv) => acc + Number(inv.total_amount || 0), 0);
  const stmtTotalPaid = statementInvoices.reduce((acc, inv) => acc + Number(inv.paid_amount || 0), 0);
  const stmtOpeningBal = Number(customer.opening_balance || 0);
  const stmtTotalPending = Number(customer.pending_amount ?? (statementInvoices.reduce((acc, inv) => acc + Number(inv.pending_amount || 0), 0) + (stmtOpeningBal > 0 ? stmtOpeningBal : 0)));

  // Helper to fetch complete statement data matching the row-level Statement/Print icon
  const fetchCompleteStatementData = async () => {
    const custId = customer.customer_id || customer.id || activeInvoice?.customer_id;
    const targetShop = (shop && shop.id) ? shop : { 
      name: 'PINKY SALES', 
      address: 'C-314, Pratik Arcade, Surat', 
      phone: '+91 90995 69700' 
    };

    let salesData = statementSales || [];
    let customerData = customer;
    let shopData = targetShop;

    if ((!salesData || salesData.length === 0) && authedFetch && (custId || customer.mobile || activeInvoice?.mobile)) {
      try {
        const params = new URLSearchParams({
          customerId: String(custId || ''),
          shopId: String(customer.shop_id || shop?.id || activeInvoice?.shop_id || targetShop.id || 1),
        });
        const resp = await authedFetch(`/customer-invoice?${params.toString()}`);
        if (resp && Array.isArray(resp.sales) && resp.sales.length > 0) {
          salesData = resp.sales;
          if (resp.customer) customerData = { ...customer, ...resp.customer };
          if (resp.shop) shopData = { ...targetShop, ...resp.shop };
          setStatementSales(resp.sales);
        }
      } catch (err) {
        console.warn('ShareInvoiceModal: /customer-invoice fetch error, falling back to modal records:', err);
      }
    }

    if (!salesData.length) {
      salesData = Array.isArray(target?.items) && target.items.length > 0 
        ? target.items 
        : (invoices.length > 0 ? invoices : (target?.sale ? [target.sale] : [customer]));
    }

    return {
      customerData: {
        ...customerData,
        pending_amount: customerData.pending_amount ?? (isStatement ? stmtTotalPending : totalPendingAll),
        total_amount: customerData.total_amount ?? (isStatement ? stmtTotalBilled : totalBilledAll),
        paid_amount: customerData.paid_amount ?? (isStatement ? stmtTotalPaid : totalPaidAll),
      },
      salesData,
      shopData,
    };
  };

  // Build Consolidated Sale object for multi-invoice tax invoice generation
  const consolidatedSale = useMemo(() => {
    if (!isAllSelected) return activeInvoice;
    const allCustomerItems = [];
    const allCustomerExpenses = [];
    let totalCredit = 0;
    let totalPaid = 0;
    let totalPending = 0;

    invoices.forEach((sale) => {
      if (Array.isArray(sale.items)) {
        allCustomerItems.push(...sale.items);
      }
      if (Array.isArray(sale.expenses)) {
        allCustomerExpenses.push(...sale.expenses);
      }
      totalCredit += Number(sale.applied_credit_amount || 0);
      totalPaid += Number(sale.paid_amount || 0);
      totalPending += Number(sale.pending_amount || 0);
    });

    const firstSale = invoices[0] || {};
    const lastSale = invoices[invoices.length - 1] || {};

    return {
      ...lastSale,
      id: lastSale.id,
      invoice_number: lastSale.invoice_number,
      customer_id: customer.customer_id || customer.id || lastSale.customer_id,
      customer_name: customerDisplayName,
      mobile: customerMobile,
      address: customer.address || lastSale.address,
      gstin: customer.gstin || lastSale.gstin,
      shop_id: shop?.id || lastSale.shop_id,
      shop_name: shop?.name || lastSale.shop_name,
      items: allCustomerItems,
      expenses: allCustomerExpenses,
      previous_balance: Number(firstSale.previous_balance || 0),
      applied_credit_amount: totalCredit,
      paid_amount: totalPaid,
      pending_amount: totalPending,
      consolidated: true,
    };
  }, [isAllSelected, activeInvoice, invoices, customer, customerDisplayName, customerMobile, shop]);

  // Determine WhatsApp template message type
  const shareType = isStatement ? 'pending_summary' : (isAllSelected ? 'pending_summary' : 'single_invoice');

  // Live formatted WhatsApp default message
  const defaultFormattedMessage = useMemo(() => {
    return formatWhatsAppMessage({
      customer: {
        ...customer,
        items: isStatement ? statementInvoices : invoices,
        pending_amount: isStatement ? stmtTotalPending : totalPendingAll,
        total_amount: isStatement ? (stmtTotalBilled + (stmtOpeningBal > 0 ? stmtOpeningBal : 0)) : totalBilledAll,
        paid_amount: isStatement ? stmtTotalPaid : totalPaidAll,
      },
      sale: isStatement ? null : (isAllSelected ? consolidatedSale : activeInvoice),
      shop,
      type: shareType,
    });
  }, [customer, invoices, isStatement, statementInvoices, stmtTotalPending, stmtTotalBilled, stmtTotalPaid, stmtOpeningBal, totalPendingAll, totalBilledAll, totalPaidAll, isAllSelected, consolidatedSale, activeInvoice, shop, shareType]);

  // Synchronize default message & phone into editable state when switching selection or docType
  useEffect(() => {
    setEditableMessage(defaultFormattedMessage);
  }, [defaultFormattedMessage]);

  useEffect(() => {
    if (customerMobile) {
      setEditablePhone(customerMobile);
    }
  }, [customerMobile]);

  if (!isOpen || !target) return null;

  const cleanPhoneNumber = parseCleanPhoneNumber(editablePhone || customerMobile);

  const handleResetMessage = () => {
    setEditableMessage(defaultFormattedMessage);
    if (showToast) showToast('Reset to default message template');
  };

  const handleCopyMessage = async () => {
    try {
      const messageToCopy = editableMessage || defaultFormattedMessage;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(messageToCopy);
      }
      setCopied(true);
      if (showToast) showToast('Message text copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      if (showToast) showToast('Failed to copy text.');
    }
  };

  /**
   * Primary Action: Share via WhatsApp & PDF
   * Adheres to:
   * 1. Native URI Scheme: whatsapp://send?phone=${cleanPhoneNumber}&text=${encodedMessage}
   * 2. Prevent Blank Tabs: Direct routing via window.location.href
   * 3. Data Formatting: Stripped clean digits + encodeURIComponent()
   * 4. Downloads selected Document Type (Tax Invoice by default or Account Statement)
   */
  const handleShareWhatsAppAndPdf = async () => {
    const rawPhone = editablePhone || customerMobile || '';
    const cleanPhone = parseCleanPhoneNumber(rawPhone);
    const messagePayload = (editableMessage || defaultFormattedMessage || '').trim();

    if (!cleanPhone) {
      if (showToast) {
        showToast('⚠️ Missing phone number: Please provide a valid customer mobile number.');
      }
      return;
    }

    if (!messagePayload) {
      if (showToast) {
        showToast('⚠️ Missing message: The WhatsApp message content cannot be empty.');
      }
      return;
    }

    const encodedMessage = encodeURIComponent(messagePayload);
    const nativeWaUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedMessage}`;

    try {
      setSharing(true);

      // Generate & Download PDF Document based on user's docType selection
      let doc = null;
      let filename = '';

      if (docType === 'statement') {
        const { customerData, salesData, shopData } = await fetchCompleteStatementData();
        doc = await generateStatementPDFDoc(customerData, salesData, shopData);
        filename = `Statement_${customerDisplayName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      } else {
        // Default: Generate Tax Invoice PDF (Consolidated or Single)
        const saleToUse = isAllSelected ? consolidatedSale : (activeInvoice || invoices[0]);
        const invNo = saleToUse?.invoice_number || (isAllSelected ? 'Consolidated' : `INV-${String(saleToUse?.id || '1').padStart(6, '0')}`);
        doc = await generateInvoicePDFDoc(saleToUse, customer, shop);
        filename = `${isAllSelected ? 'Consolidated_' : ''}Invoice_${invNo}_${customerDisplayName.replace(/\s+/g, '_')}.pdf`;
      }

      if (doc) {
        doc.save(filename);
        if (showToast) {
          showToast(`📄 ${filename} downloaded! Attach in WhatsApp.`);
        }
      }

      // Copy text to clipboard for extra convenience
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(messagePayload);
        }
      } catch {}

      // Trigger native WhatsApp directly without blank tab
      window.location.href = nativeWaUrl;

      // Record audit log
      if (authedFetch) {
        authedFetch('/audit', {
          method: 'POST',
          body: JSON.stringify({
            action: 'Shared invoice on WhatsApp',
            entity_type: 'invoice',
            entity_id: customer?.customer_id || customer?.id || activeInvoice?.customer_id || 0,
            details: `Sent to ${cleanPhone}`,
          }),
        }).catch(() => {});
      }

      onClose();
    } catch (err) {
      console.error('Share via WhatsApp & PDF failed:', err);
      if (showToast) showToast(`Share failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSharing(false);
    }
  };

  /**
   * Direct Download Tax Invoice PDF
   */
  const handleDownloadInvoicePdf = async () => {
    try {
      const saleToUse = isAllSelected ? consolidatedSale : (activeInvoice || invoices[0]);
      if (!saleToUse) return;
      const invNo = saleToUse.invoice_number || (isAllSelected ? 'Consolidated' : `INV-${String(saleToUse.id || '1').padStart(6, '0')}`);
      const doc = await generateInvoicePDFDoc(saleToUse, customer, shop);
      const filename = `${isAllSelected ? 'Consolidated_' : ''}Invoice_${invNo}_${customerDisplayName.replace(/\s+/g, '_')}.pdf`;
      doc.save(filename);
      if (showToast) showToast(`📄 ${filename} downloaded!`);
    } catch (err) {
      if (showToast) showToast(`Invoice download failed: ${err.message || 'Error'}`);
    }
  };

  /**
   * Direct Download Account Statement PDF
   * Uses exact same /customer-invoice backend endpoint and generateStatementPDFDoc
   * logic as the working row-level Statement/Print icon.
   */
  const handleDownloadStatementPdf = async () => {
    try {
      if (showToast) showToast('Preparing complete account statement...');
      const { customerData, salesData, shopData } = await fetchCompleteStatementData();
      if (!salesData.length || (salesData.length === 1 && !salesData[0]?.id && !salesData[0]?.total_amount)) {
        if (showToast) showToast('No purchase or payment history found for this customer');
        return;
      }
      const doc = await generateStatementPDFDoc(customerData, salesData, shopData);
      const filename = `Statement_${customerDisplayName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      doc.save(filename);
      if (showToast) showToast(`📑 Complete Statement downloaded!`);
    } catch (err) {
      console.error('Statement download failed:', err);
      if (showToast) showToast(`Statement download failed: ${err.message || 'Error'}`);
    }
  };

  const handleSendTextReminderOnly = async () => {
    const rawPhone = editablePhone || customerMobile || '';
    const cleanPhone = parseCleanPhoneNumber(rawPhone);
    const messagePayload = (editableMessage || defaultFormattedMessage || '').trim();

    if (!cleanPhone) {
      if (showToast) showToast('⚠️ Missing phone number: Please provide a valid customer mobile number.');
      return;
    }
    if (!messagePayload) {
      if (showToast) showToast('⚠️ Missing message: The WhatsApp message content cannot be empty.');
      return;
    }

    const encodedMessage = encodeURIComponent(messagePayload);
    const nativeWaUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedMessage}`;

    try {
      setSharing(true);
      window.location.href = nativeWaUrl;
      onClose();
    } catch (err) {
      if (showToast) showToast(`Failed to open WhatsApp: ${err.message || 'Error'}`);
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
                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-700">
                  Send Invoice & Payment Details
                </span>
                {invoices.length > 1 && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                    {invoices.length} invoices
                  </span>
                )}
              </div>
              <h2 className="truncate text-base sm:text-lg font-black text-slate-900 leading-snug">
                {customerDisplayName}
              </h2>
              
              {/* Phone number display & edit */}
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium flex-wrap">
                <div className="flex items-center gap-1.5 bg-slate-100/80 px-2 py-0.5 rounded-lg border border-slate-200/60">
                  <Phone size={11} className="text-emerald-600" />
                  {isEditingPhone ? (
                    <input
                      type="text"
                      value={editablePhone}
                      onChange={(e) => setEditablePhone(e.target.value)}
                      placeholder="e.g. 9826060394"
                      className="bg-white px-1.5 py-0.5 rounded text-xs font-semibold text-slate-800 border border-slate-300 focus:outline-emerald-500 w-32"
                    />
                  ) : (
                    <span className="font-semibold text-slate-800">
                      {cleanPhoneNumber ? `+${cleanPhoneNumber}` : 'No phone number'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsEditingPhone(!isEditingPhone)}
                    className="text-[10px] text-emerald-700 font-bold hover:underline cursor-pointer ml-1"
                  >
                    {isEditingPhone ? 'Done' : 'Edit'}
                  </button>
                </div>
                {customer.shop_name && (
                  <span className="text-slate-400">· {customer.shop_name}</span>
                )}
              </div>
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
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* Document Type Selector: Invoice vs Statement */}
          <section className="flex items-center justify-between gap-3 p-2 bg-slate-50 border border-slate-200/80 rounded-2xl flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700 ml-1">Document Format:</span>
            </div>
            <div className="flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <button
                type="button"
                onClick={() => handleDocTypeChange('invoice')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  docType === 'invoice'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <FileText size={13} />
                <span>📄 Tax Invoice</span>
              </button>
              <button
                type="button"
                onClick={() => handleDocTypeChange('statement')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  docType === 'statement'
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <ReceiptText size={13} />
                <span>📑 Account Statement</span>
              </button>
            </div>
          </section>

          {/* Invoice Selector (Tabs/Dropdown if multiple invoices exist) */}
          {invoices.length > 1 && (
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers size={14} className="text-emerald-600" /> Choose Invoices:
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {isStatement ? 'Complete Account Statement (All Invoices & Payments)' : (isAllSelected ? 'All Invoices (Consolidated)' : 'Single Invoice')}
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
                  <span>{isStatement ? `Complete Statement (${statementInvoices.length})` : `All pending (${invoices.length})`}</span>
                  <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md font-bold ${isAllSelected ? 'bg-emerald-700 text-emerald-50' : 'bg-slate-100 text-slate-600'}`}>
                    {currency(isStatement ? stmtTotalPending : totalPendingAll)}
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
                      onClick={() => {
                        setSelectedInvoiceId(String(inv.id));
                        if (isStatement) setDocType('invoice');
                      }}
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
          {(isStatement || isAllSelected) ? (
            /* Multi-Invoice / Complete Statement Summary View */
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg shadow-slate-900/10">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.14em] flex items-center gap-1.5">
                  <ReceiptText size={13} className="text-teal-400" />
                  {isStatement ? 'Complete Account Statement' : 'Consolidated Tax Invoice'}
                </span>
                <span className="text-[11px] text-emerald-300 font-bold flex items-center gap-1.5">
                  {loadingStatement && <span className="animate-spin text-teal-400 text-xs">⟳</span>}
                  {isStatement ? `${statementInvoices.length} Invoices & Transactions` : `${invoices.length} Invoices Selected`}
                </span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-white/10 px-2 py-4 text-center">
                <div className="px-2">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">
                    {isStatement ? 'Total Debits' : 'Total Invoiced'}
                  </span>
                  <strong className="text-xs sm:text-sm font-bold text-slate-100">
                    {currency(isStatement ? (stmtTotalBilled + (stmtOpeningBal > 0 ? stmtOpeningBal : 0)) : totalBilledAll)}
                  </strong>
                </div>
                <div className="px-2">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">Total Paid</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-400">
                    {currency(isStatement ? stmtTotalPaid : totalPaidAll)}
                  </span>
                </div>
                <div className="px-2">
                  <span className="block text-[10px] text-slate-400 uppercase font-medium">Outstanding Balance</span>
                  <strong className="text-sm sm:text-base font-black text-rose-400">
                    {currency(isStatement ? stmtTotalPending : totalPendingAll)}
                  </strong>
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

              {/* Items & Expenses breakdown */}
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {Array.isArray(activeInvoice.items) && activeInvoice.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-slate-700 py-0.5">
                    <span className="truncate pr-2">{item.product_name || `Item #${idx + 1}`} ({item.quantity} {item.unit || 'pcs'})</span>
                    <span className="font-semibold shrink-0">{currency(item.total_price || item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Financial line */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-900">
                <span>Total <strong>{currency(activeInvoice.total_amount)}</strong></span>
                <span className="text-emerald-700">Paid {currency(activeInvoice.paid_amount || 0)}</span>
                <span className="text-rose-600">Due {currency(activeInvoice.pending_amount || 0)}</span>
              </div>
            </section>
          ) : null}

          {/* 3. Editable Message Area */}
          <section className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <MessageCircle size={14} className="text-emerald-600" /> Editable WhatsApp Message
              </span>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetMessage}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Reset to original template"
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>

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
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Message Textarea with full editing capabilities */}
            <div className="relative">
              <textarea
                value={editableMessage}
                onChange={(e) => setEditableMessage(e.target.value)}
                rows={5}
                placeholder="Type your WhatsApp message here..."
                className="w-full bg-slate-950 text-emerald-300 p-3.5 rounded-2xl font-mono text-[11px] sm:text-xs leading-relaxed border border-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500 selection:bg-emerald-500 selection:text-white resize-y"
              />
              <div className="text-[10px] text-slate-400 text-right pr-2">
                {editableMessage.length} characters
              </div>
            </div>
          </section>
        </div>

        {/* 4. Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50/90 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Download Tax Invoice PDF */}
            <button
              type="button"
              onClick={handleDownloadInvoicePdf}
              className="px-3 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              title="Download official Tax Invoice PDF directly"
            >
              <FileText size={14} className="text-emerald-600" /> Invoice PDF
            </button>

            {/* Download Statement PDF */}
            <button
              type="button"
              onClick={handleDownloadStatementPdf}
              className="px-3 py-2.5 bg-white hover:bg-teal-50 text-teal-800 border border-slate-200 hover:border-teal-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              title="Download complete chronological statement PDF directly"
            >
              <ReceiptText size={14} className="text-teal-600" /> Statement PDF
            </button>

            {/* Reminder Text Only */}
            <button
              type="button"
              onClick={handleSendTextReminderOnly}
              disabled={sharing}
              className="px-3 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              title="Open WhatsApp with message text without generating PDF"
            >
              <Send size={14} className="text-slate-500" /> Text Only
            </button>
          </div>

          {/* Primary Action: Share via WhatsApp & PDF */}
          <button
            type="button"
            onClick={handleShareWhatsAppAndPdf}
            disabled={sharing}
            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Send size={15} />
            <span>{sharing ? 'Preparing Document...' : `Share via WhatsApp & ${docType === 'invoice' ? 'Invoice' : 'Statement'}`}</span>
            {!sharing && <ChevronRight size={14} />}
          </button>
        </div>

      </div>
    </div>
  );
}
