import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to format currency
const formatMoney = (val) => Number(val || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Helper for date formatting
const formatDMY = (dateStr) => {
  if (!dateStr) return 'Not set';
  const raw = String(dateStr).split('T')[0];
  const parts = raw.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

/**
 * 1. GENERATE PROFESSIONAL TAX INVOICE PDF
 */
export const generateInvoicePDFDoc = (sale, customer = {}, shop = {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const shopName = String(shop?.name || sale?.shop_name || 'PINKY SALES').toUpperCase();
  const shopAddress = shop?.address || sale?.shop_address || 'Main Market, Wholesale Complex';
  const shopArea = shop?.area || sale?.shop_area || 'Ahmedabad, Gujarat';
  const shopPhone = shop?.phone || sale?.shop_phone || '9826060394';
  const custName = customer?.name || sale?.customer_name || 'Valued Customer';
  const custMobile = customer?.mobile || sale?.mobile || 'N/A';
  const custAddress = customer?.address || sale?.address || 'N/A';
  const invoiceNo = sale?.invoice_number || `INV-${String(sale?.id || 1).padStart(6, '0')}`;
  const invoiceDate = formatDMY(sale?.invoice_date || sale?.sale_date || new Date().toISOString());
  const dueDate = sale?.due_date ? formatDMY(sale.due_date) : 'On Receipt';
  const paymentMode = String(sale?.payment_mode || 'Cash').toUpperCase();

  // Primary Header Bar
  doc.setFillColor(13, 148, 136); // Teal primary
  doc.rect(0, 0, 210, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(shopName, 14, 14);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('TAX INVOICE', 196, 14, { align: 'right' });

  // Company and Invoice Meta Grid
  doc.setTextColor(51, 65, 85); // Slate 700
  doc.setFontSize(9);
  doc.text(`${shopAddress}, ${shopArea}`, 14, 30);
  doc.text(`Phone: ${shopPhone} | GSTIN: UNREGISTERED / REGULAR`, 14, 35);

  // Invoice Details (Right Aligned)
  doc.setFont('helvetica', 'bold');
  doc.text(`Invoice No: ${invoiceNo}`, 196, 30, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${invoiceDate}`, 196, 35, { align: 'right' });
  doc.text(`Due Date: ${dueDate}`, 196, 40, { align: 'right' });
  doc.text(`Payment Mode: ${paymentMode}`, 196, 45, { align: 'right' });

  // Bill To Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 48, 182, 22, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 48, 182, 22, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('BILL TO:', 18, 54);
  doc.setFontSize(10);
  doc.text(custName, 18, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Mobile: ${custMobile}  |  Address: ${custAddress}`, 18, 66);

  // Products Table
  const items = Array.isArray(sale?.items) && sale.items.length > 0
    ? sale.items
    : [{
        product_name: sale?.product_name || sale?.name || 'Product Item',
        colour: sale?.colour,
        quantity: sale?.quantity || 1,
        unit_price: Number(sale?.total_amount || 0) / Math.max(1, Number(sale?.quantity || 1)),
        total_price: sale?.total_amount || 0,
      }];

  const tableRows = items.map((it, idx) => {
    const qty = Number(it.quantity || 1);
    const unitPrice = Number(it.unit_price || 0) || (Number(it.total_price || 0) / Math.max(1, qty));
    const lineTotal = Number(it.total_price || (unitPrice * qty));
    const itemName = it.product_name || it.name || it.short_name || 'Product';
    const colourStr = it.colour ? ` [${it.colour}]` : '';

    return [
      idx + 1,
      `${itemName}${colourStr}`,
      `${qty} pcs`,
      `Rs. ${formatMoney(unitPrice)}`,
      `Rs. ${formatMoney(lineTotal)}`
    ];
  });

  // Render Table using autoTable
  autoTable(doc, {
    startY: 74,
    head: [['#', 'Item & Description', 'Qty', 'Unit Rate', 'Amount']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [51, 65, 85],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc.lastAutoTable?.finalY || 140) + 6;

  // Summary Totals
  const totalAmount = Number(sale?.total_amount || 0);
  const paidAmount = Number(sale?.paid_amount || 0);
  const pendingAmount = Number(sale?.pending_amount || (totalAmount - paidAmount));
  const expensesList = Array.isArray(sale?.expenses) ? sale.expenses : [];
  const extraExpensesTotal = expensesList.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const summaryStartX = 114;
  const summaryWidth = 82;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(summaryStartX, finalY, summaryWidth, 38, 2, 2, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(summaryStartX, finalY, summaryWidth, 38, 2, 2, 'D');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);

  doc.text('Subtotal:', summaryStartX + 4, finalY + 6);
  doc.text(`Rs. ${formatMoney(totalAmount - extraExpensesTotal)}`, 192, finalY + 6, { align: 'right' });

  if (extraExpensesTotal > 0) {
    doc.text('+ Extra Expenses:', summaryStartX + 4, finalY + 12);
    doc.text(`Rs. ${formatMoney(extraExpensesTotal)}`, 192, finalY + 12, { align: 'right' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Grand Total:', summaryStartX + 4, finalY + 18);
  doc.text(`Rs. ${formatMoney(totalAmount)}`, 192, finalY + 18, { align: 'right' });

  doc.setTextColor(13, 148, 136); // Teal
  doc.text('Amount Paid:', summaryStartX + 4, finalY + 24);
  doc.text(`Rs. ${formatMoney(paidAmount)}`, 192, finalY + 24, { align: 'right' });

  doc.setTextColor(225, 29, 72); // Rose
  doc.setFontSize(10);
  doc.text('Balance Due:', summaryStartX + 4, finalY + 32);
  doc.text(`Rs. ${formatMoney(pendingAmount)}`, 192, finalY + 32, { align: 'right' });

  // Notes & Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Terms & Conditions: Goods once sold will not be returned or exchanged.', 14, finalY + 10);
  doc.text('Thank you for your business! Please arrange for prompt settlement of dues.', 14, finalY + 16);

  // Authorized Signatory
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 275, 70, 275);
  doc.text('Authorized Signatory', 14, 280);

  return doc;
};

/**
 * 2. GENERATE CUSTOMER ACCOUNT STATEMENT PDF
 */
export const generateStatementPDFDoc = (customer = {}, invoices = [], shop = {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const shopName = String(shop?.name || 'PINKY SALES').toUpperCase();
  const custName = customer?.customer_name || customer?.name || 'Customer';
  const custMobile = customer?.mobile || 'N/A';
  const totalBilled = invoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
  const totalPaid = invoices.reduce((s, inv) => s + Number(inv.paid_amount || 0), 0);
  const totalDue = invoices.reduce((s, inv) => s + Number(inv.pending_amount || 0), 0);

  // Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(shopName, 14, 14);
  doc.setFontSize(10);
  doc.text('ACCOUNT STATEMENT & RECEIVABLES', 196, 14, { align: 'right' });

  // Customer Summary Card
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(10);
  doc.text(`Customer: ${custName} (Mobile: ${custMobile})`, 14, 30);
  doc.setFontSize(9);
  doc.text(`Statement Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 35);

  // 3 Metric Boxes
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 40, 56, 16, 2, 2, 'F');
  doc.roundedRect(77, 40, 56, 16, 2, 2, 'F');
  doc.roundedRect(140, 40, 56, 16, 2, 2, 'F');

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL BILLED', 18, 45);
  doc.text('TOTAL PAID', 81, 45);
  doc.text('TOTAL OUTSTANDING', 144, 45);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Rs. ${formatMoney(totalBilled)}`, 18, 52);
  doc.setTextColor(13, 148, 136);
  doc.text(`Rs. ${formatMoney(totalPaid)}`, 81, 52);
  doc.setTextColor(225, 29, 72);
  doc.text(`Rs. ${formatMoney(totalDue)}`, 144, 52);

  // Invoices Table
  const tableRows = invoices.map((inv, idx) => {
    const invNo = inv.invoice_number || `INV-${String(inv.id || idx + 1).padStart(6, '0')}`;
    const invDate = formatDMY(inv.invoice_date || inv.sale_date);
    const dueDate = inv.due_date ? formatDMY(inv.due_date) : 'On Receipt';
    const itemsCount = inv.items?.length || inv.quantity || 1;
    const invTotal = Number(inv.total_amount || 0);
    const invPaid = Number(inv.paid_amount || 0);
    const invPending = Number(inv.pending_amount || 0);

    return [
      idx + 1,
      invNo,
      invDate,
      dueDate,
      `${itemsCount} items`,
      `Rs. ${formatMoney(invTotal)}`,
      `Rs. ${formatMoney(invPaid)}`,
      `Rs. ${formatMoney(invPending)}`
    ];
  });

  autoTable(doc, {
    startY: 62,
    head: [['#', 'Invoice No', 'Date', 'Due Date', 'Products', 'Grand Total', 'Paid', 'Pending Balance']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 26, fontStyle: 'bold' },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' },
      7: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] },
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc.lastAutoTable?.finalY || 150) + 8;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('This is a computer-generated consolidated statement of open customer invoices.', 14, finalY);

  return doc;
};

/**
 * 3. GENERATE CUSTOMER RUNNING LEDGER PDF
 */
export const generateLedgerPDFDoc = (customer = {}, invoices = [], payments = [], shop = {}) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const shopName = String(shop?.name || 'PINKY SALES').toUpperCase();
  const custName = customer?.customer_name || customer?.name || 'Customer';
  const custMobile = customer?.mobile || 'N/A';

  // Ledger Title
  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(shopName, 14, 13);
  doc.setFontSize(10);
  doc.text('CUSTOMER TRANSACTION LEDGER', 196, 13, { align: 'right' });

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9.5);
  doc.text(`Customer Account: ${custName} | Phone: ${custMobile}`, 14, 28);
  doc.text(`Ledger Period: All active open balances as of ${new Date().toLocaleDateString('en-GB')}`, 14, 33);

  // Build Chronological Transactions list
  const transactions = [];
  invoices.forEach(inv => {
    transactions.push({
      date: inv.invoice_date || inv.sale_date || '2026-08-27',
      particulars: `Invoice ${inv.invoice_number || `INV-${String(inv.id).padStart(6, '0')}`} (${inv.items?.length || 1} items)`,
      debit: Number(inv.total_amount || 0),
      credit: 0,
    });
    if (Number(inv.paid_amount || 0) > 0) {
      transactions.push({
        date: inv.invoice_date || inv.sale_date || '2026-08-27',
        particulars: `Initial payment on ${inv.invoice_number || `INV-${String(inv.id).padStart(6, '0')}`}`,
        debit: 0,
        credit: Number(inv.paid_amount || 0),
      });
    }
  });

  transactions.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let runningBalance = 0;
  const ledgerRows = transactions.map((t, idx) => {
    runningBalance = runningBalance + t.debit - t.credit;
    return [
      idx + 1,
      formatDMY(t.date),
      t.particulars,
      t.debit > 0 ? `Rs. ${formatMoney(t.debit)}` : '-',
      t.credit > 0 ? `Rs. ${formatMoney(t.credit)}` : '-',
      `Rs. ${formatMoney(runningBalance)}`
    ];
  });

  autoTable(doc, {
    startY: 38,
    head: [['#', 'Date', 'Transaction Particulars', 'Debit (Billed)', 'Credit (Paid)', 'Running Balance']],
    body: ledgerRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 24 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right', textColor: [13, 148, 136] },
      5: { cellWidth: 34, halign: 'right', fontStyle: 'bold', textColor: [225, 29, 72] },
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc.lastAutoTable?.finalY || 150) + 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Closing Outstanding Balance: Rs. ${formatMoney(runningBalance)}`, 196, finalY, { align: 'right' });

  return doc;
};

/**
 * 4. WHATSAPP + INVOICE ATTACHMENT SHARING SERVICE
 */
export const shareToWhatsAppService = async ({
  customer = {},
  type = 'invoice_and_reminder', // 'reminder_only' | 'invoice_pdf' | 'invoice_and_reminder' | 'statement' | 'ledger'
  sale = null,
  shop = {},
  authedFetch,
  showToast,
}) => {
  const custName = customer?.customer_name || customer?.name || 'Customer';
  const rawMobile = String(customer?.mobile || '').replace(/\D/g, '');
  const cleanMobile = rawMobile.startsWith('91') && rawMobile.length > 10
    ? rawMobile
    : (rawMobile.length === 10 ? `91${rawMobile}` : rawMobile);

  const shopName = shop?.name || 'Warehouse (Pinky Sales)';
  const totalPending = Number(customer?.pending_amount || sale?.pending_amount || 0);
  const invoiceCount = customer?.items?.length || (sale ? 1 : 1);
  const primaryInvoice = sale || customer?.items?.[0] || customer;
  const invNo = primaryInvoice?.invoice_number || `INV-${String(primaryInvoice?.id || '000001').padStart(6, '0')}`;
  const invDate = formatDMY(primaryInvoice?.invoice_date || primaryInvoice?.sale_date);
  const dueDate = primaryInvoice?.due_date ? formatDMY(primaryInvoice.due_date) : 'Earliest';

  // 1. Build Formatted WhatsApp Message
  let message = '';
  if (type === 'reminder_only') {
    message = `Dear ${custName},\n\nThis is a friendly reminder from ${shopName}.\n\nOutstanding Balance: Rs. ${formatMoney(totalPending)}\nInvoice No: ${invNo}\nInvoice Date: ${invDate}\nDue Date: ${dueDate}\n\nKindly arrange payment at your earliest convenience.\n\nThank you for your business!`;
  } else if (type === 'statement') {
    message = `Dear ${custName},\n\nPlease find your complete Account Statement & Receivables Summary attached from ${shopName}.\n\nTotal Outstanding: Rs. ${formatMoney(totalPending)}\nTotal Invoices: ${invoiceCount}\n\nPlease review the attached statement and arrange payment.\n\nThank you!`;
  } else if (type === 'ledger') {
    message = `Dear ${custName},\n\nPlease find your Customer Transaction Ledger attached from ${shopName}.\n\nCurrent Balance Due: Rs. ${formatMoney(totalPending)}\n\nPlease review the running ledger statement attached.\n\nThank you!`;
  } else {
    // Default: 'invoice_and_reminder' or 'invoice_pdf'
    message = `Dear ${custName},\n\nThis is a friendly reminder from ${shopName}.\n\nOutstanding Balance: Rs. ${formatMoney(totalPending)}\nInvoice No: ${invNo}\nInvoice Date: ${invDate}\nDue Date: ${dueDate}\n\nPlease find your official Tax Invoice attached.\n\nKindly arrange payment at your earliest convenience.\n\nThank you!`;
  }

  // 2. Generate Corresponding PDF Document
  let doc = null;
  let filename = '';

  if (type === 'statement') {
    const invoices = Array.isArray(customer?.items) && customer.items.length > 0 ? customer.items : [primaryInvoice];
    doc = generateStatementPDFDoc(customer, invoices, shop);
    filename = `Statement_${custName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  } else if (type === 'ledger') {
    const invoices = Array.isArray(customer?.items) && customer.items.length > 0 ? customer.items : [primaryInvoice];
    doc = generateLedgerPDFDoc(customer, invoices, [], shop);
    filename = `Ledger_${custName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  } else if (type !== 'reminder_only') {
    doc = generateInvoicePDFDoc(primaryInvoice, customer, shop);
    filename = `Invoice_${invNo}_${custName.replace(/\s+/g, '_')}.pdf`;
  }

  // 3. Native File Sharing (Web Share API) or WhatsApp Web Fallback
  try {
    if (doc) {
      const pdfBlob = doc.output('blob');
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: `Invoice ${invNo}`,
            text: message,
          });
          if (showToast) showToast('Invoice PDF shared to WhatsApp!');
          if (authedFetch) {
            authedFetch('/audit', {
              method: 'POST',
              body: JSON.stringify({
                action: `Shared ${type} via Native Share`,
                entity_type: 'customer',
                entity_id: customer?.customer_id || customer?.id || 0,
                details: `${invNo} to ${cleanMobile}`,
              }),
            }).catch(() => {});
          }
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('Native share failed, proceeding with fallback download:', err);
        }
      }

      // Fallback: Automatic Download + WhatsApp Web Trigger
      doc.save(filename);
      if (showToast) {
        showToast(`📄 ${filename} downloaded! Attach in WhatsApp.`);
      }
    }

    // Auto copy text to clipboard for convenience
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(message);
      }
    } catch {}

    // 4. Open WhatsApp with pre-filled message
    const waUrl = cleanMobile
      ? `https://wa.me/${cleanMobile}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;

    const newWindow = window.open(waUrl, '_blank');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      // If popup was blocked by browser
      const link = document.createElement('a');
      link.href = waUrl;
      link.target = '_blank';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    if (authedFetch) {
      authedFetch('/audit', {
        method: 'POST',
        body: JSON.stringify({
          action: `Shared ${type}`,
          entity_type: 'customer',
          entity_id: customer?.customer_id || customer?.id || 0,
          details: `${invNo} (Rs. ${totalPending}) to ${cleanMobile}`,
        }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Share execution failed:', err);
    if (showToast) showToast('Share failed: ' + (err.message || 'Unknown error'));
  }
};
