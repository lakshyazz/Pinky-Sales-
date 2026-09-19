// jsPDF loaded on-demand when a PDF is actually generated (~200KB saved from initial bundle)
let _jspdfModule = null;
async function getJsPDF() {
  if (!_jspdfModule) {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    _jspdfModule = { jsPDF, autoTable };
  }
  return _jspdfModule;
}

export const formatMoney = (amount) => {
  const num = Number(amount || 0);
  if (Math.abs(num - Math.round(num)) < 0.005) {
    return Math.round(num).toLocaleString('en-IN');
  }
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatDMY = (dateStr) => {
  if (!dateStr) return '';
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return dateStr;
};

export const toWords = (value) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const words = (number) => {
    if (number < 20) return ones[number];
    if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ''}`;
    if (number < 1000) return `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${words(number % 100)}` : ''}`;
    if (number < 100000) return `${words(Math.floor(number / 1000))} Thousand${number % 1000 ? ` ${words(number % 1000)}` : ''}`;
    if (number < 10000000) return `${words(Math.floor(number / 100000))} Lakh${number % 100000 ? ` ${words(number % 100000)}` : ''}`;
    return `${words(Math.floor(number / 10000000))} Crore${number % 10000000 ? ` ${words(number % 10000000)}` : ''}`;
  };
  const wholeAmount = Math.max(0, Math.floor(Number(value || 0)));
  return wholeAmount ? words(wholeAmount) : 'Zero';
};

/**
 * Cleanly extracts raw brand name without 'Mfg.' / 'Mfg: ' / 'Brand:' prefixes.
 * Checks all possible item and sale level brand attributes for complete consistency.
 */
export const getBrandName = (item = {}, sale = null) => {
  const raw = item?.custom_brand_name ||
              item?.manufacturing_brand_name ||
              item?.mfg_brand_name ||
              item?.manufacturing_brand ||
              item?.mfg_brand ||
              item?.brand_name ||
              item?.brand ||
              item?.maker ||
              sale?.custom_brand_name ||
              sale?.manufacturing_brand_name ||
              sale?.mfg_brand_name ||
              sale?.manufacturing_brand ||
              sale?.mfg_brand ||
              sale?.brand_name ||
              sale?.brand ||
              '';
  if (!raw) return '';
  return String(raw).replace(/^(mfg|brand)[:.\s-]*/i, '').trim();
};

/**
 * Unified Balance Utility Function (Frontend Single Source of Truth)
 * Total Outstanding = Opening/Carry Forward Balance + SUM(Invoices) - SUM(Payments/Credits)
 * Or remaining_opening_balance + invoices_pending - advance_balance
 */
export const getCustomerTotalOutstanding = (customer = {}, invoices = [], payments = []) => {
  const openingBal = Number(customer?.opening_balance ?? customer?.customer_opening_balance ?? 0);
  const advanceBal = Number(customer?.advance_balance ?? customer?.customer_advance_balance ?? 0);

  const hasPayments = Array.isArray(payments) && payments.length > 0;
  const hasInvoices = Array.isArray(invoices) && invoices.length > 0;

  if (hasPayments || (hasInvoices && invoices.some(i => i?.pending_amount !== undefined || i?.paid_amount !== undefined))) {
    const validInvoices = hasInvoices ? invoices : [];
    const validPayments = hasPayments ? payments.filter(p => !p.reversed_at && String(p.payment_mode || '').toLowerCase() !== 'credit_note') : [];

    // Calculate settled opening balance from allocations if present
    const settledOBFromAllocs = validPayments
      .flatMap(p => Array.isArray(p.allocations) ? p.allocations : [])
      .filter(a => a.allocation_type === 'opening_balance' && !a.reversed_at)
      .reduce((s, a) => s + Number(a.amount_applied || 0), 0);

    const remainingOB = Math.max(0, openingBal - settledOBFromAllocs);

    // Sum of invoice pending
    const invoicesPending = validInvoices.reduce((s, inv) => {
      const p = inv.pending_amount !== undefined 
        ? Number(inv.pending_amount) 
        : Math.max(0, Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
      return s + p;
    }, 0);

    // Dynamic Outstanding
    return Math.max(0, remainingOB + invoicesPending - advanceBal);
  }

  // Fallback to customer's pre-computed pending_amount or customer_pending_amount
  const precomputed = Number(
    customer?.pending_amount ?? 
    customer?.customer_pending_amount ?? 
    customer?.total_outstanding ?? 
    customer?.pending ?? 
    0
  );
  if (precomputed > 0) return precomputed;

  // If opening balance exists and no payments known
  if (openingBal > 0) {
    const invPending = (invoices || []).reduce((s, i) => s + Number(i.pending_amount || 0), 0);
    return Math.max(0, openingBal + invPending - advanceBal);
  }

  return 0;
};

/**
 * 1. GENERATE PROFESSIONAL TAX INVOICE PDF (Unified Single Engine)
 * Replaces old green/colored layout with 100% identical monochrome boxed tabular layout.
 */
export const generateInvoicePDFDoc = async (sale, customer = {}, shop = {}) => {
  const { jsPDF, autoTable } = await getJsPDF();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const shopName = 'PINKYSALES';
  const shopAddress = 'C-314, Pratik Arcade, Surat';
  const shopPhone = '+91 90995 69700';
  
  const custName = customer?.customer_name || customer?.name || sale?.customer_name || 'Walk-in Customer';
  const custMobile = customer?.mobile || sale?.mobile || '';
  const custAddress = customer?.address || sale?.address || '';
  const custGstin = customer?.gstin || sale?.gstin || sale?.customer_gstin || '';
  const customerDetails = [
    custMobile ? `Phone: ${custMobile}` : '',
    custAddress,
    custGstin ? `GSTIN: ${custGstin}` : ''
  ].filter(Boolean).join(' · ');

  const isConsolidated = Boolean(sale?.consolidated);
  const invoiceNo = isConsolidated
    ? (sale?.invoice_number && sale.invoice_number !== 'CONSOLIDATED' ? sale.invoice_number : 'CONSOLIDATED BILL')
    : (sale?.invoice_number || `INV-${String(sale?.id || 1).padStart(6, '0')}`);
  const invoiceDate = formatDMY(sale?.invoice_date || sale?.sale_date || new Date().toISOString());
  
  const isCash = String(sale?.payment_mode || '').trim().toLowerCase() === 'cash';
  const paymentMode = String(sale?.payment_mode || 'Cash').toUpperCase();
  const termsLabel = isCash ? 'Terms: Cash Only' : (sale?.payment_terms_days ? `${sale.payment_terms_days} Days` : '15 Days');
  const dueDate = isCash ? 'Immediate / On Receipt' : (sale?.due_date ? formatDMY(sale.due_date) : 'On Receipt');
  const periodLabel = invoiceDate;

  // 1. Outer Border Box (10, 10, 190, 277)
  doc.setDrawColor(119, 119, 119);
  doc.setLineWidth(0.3);
  doc.rect(10, 10, 190, 277);

  // 2. Header Section (10 to 32mm)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(17, 17, 17);
  doc.text(shopName, 13, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(shopAddress, 13, 21.5);
  doc.text(`Phone: ${shopPhone}`, 13, 25.5);
  doc.text('Gujarat, India', 13, 29.5);

  doc.setFont('helvetica', isConsolidated ? 'bold' : 'normal');
  doc.setFontSize(isConsolidated ? 12 : 22);
  doc.setTextColor(17, 17, 17);
  doc.text(isConsolidated ? 'ACCOUNT STATEMENT & CONSOLIDATED SUMMARY' : 'TAX INVOICE', 197, 19, { align: 'right' });

  // Divider after Header
  doc.setDrawColor(153, 153, 153);
  doc.setLineWidth(0.25);
  doc.line(10, 32, 200, 32);

  // 3. Meta Section (32 to 58mm)
  doc.line(105, 32, 105, 58);

  doc.setFontSize(8);
  const drawMetaRow = (label, val, y) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(label, 13, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text(':', 44, y);
    doc.text(String(val || ''), 47, y);
  };

  drawMetaRow('Invoice No', invoiceNo, 37);
  drawMetaRow('Invoice Date', invoiceDate, 42);
  drawMetaRow('Purchase Period', periodLabel, 47);
  drawMetaRow('Payment Terms', termsLabel, 52);
  drawMetaRow('Due Date', dueDate, 57);

  // Right Column
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Payment Mode', 108, 37);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text(':', 139, 37);
  doc.text(paymentMode, 142, 37);

  // Divider after Meta
  doc.line(10, 58, 200, 58);

  // 4. Bill To Bar (58 to 64mm)
  doc.setFillColor(242, 242, 242);
  doc.rect(10, 58, 190, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 17, 17);
  doc.text('Bill To', 13, 62.3);
  doc.line(10, 64, 200, 64);

  // Bill To Content (64 to 75mm)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(custName, 13, 68.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(customerDetails || 'Walk-in Customer Account', 13, 72.5);
  doc.line(10, 75, 200, 75);

  // 5. Products Table (startY = 75mm)
  // Strictly scope line items if Single Tax Invoice
  const targetSaleId = sale?.id;
  let invoiceItems = Array.isArray(sale?.items) && sale.items.length ? sale.items : [sale];

  if (!isConsolidated && targetSaleId) {
    const strictlyScoped = invoiceItems.filter((it) => {
      const itSaleId = it?.sale_id ?? it?.invoice_id;
      if (itSaleId !== undefined && itSaleId !== null) {
        return String(itSaleId) === String(targetSaleId);
      }
      return true;
    });
    if (strictlyScoped.length > 0) {
      invoiceItems = strictlyScoped;
    }
  }

  const rawItems = invoiceItems.flatMap((item) => {
    const parentBrand = item?.manufacturing_brand_name || item?.mfg_brand || item?.brand_name || item?.brand || sale?.manufacturing_brand_name || sale?.mfg_brand || sale?.brand_name || sale?.brand || '';
    const parentInvNo = item?.invoice_number || sale?.invoice_number || '';
    const parentDate = item?.invoice_date || item?.sale_date || sale?.invoice_date || sale?.sale_date || '';
    const parentSaleId = item?.sale_id || item?.id || sale?.id;

    if (Array.isArray(item?.items) && item.items.length > 0) {
      return item.items.map((sub) => ({
        ...sub,
        sale_id: sub?.sale_id || parentSaleId,
        invoice_number: sub?.invoice_number || parentInvNo,
        sale_date: sub?.invoice_date || sub?.sale_date || parentDate,
        manufacturing_brand_name: sub?.manufacturing_brand_name || sub?.mfg_brand || sub?.brand_name || sub?.brand || sub?.custom_brand_name || parentBrand,
      }));
    }
    return [{
      ...item,
      sale_id: item?.sale_id || parentSaleId,
      invoice_number: item?.invoice_number || parentInvNo,
      sale_date: item?.invoice_date || item?.sale_date || parentDate,
      manufacturing_brand_name: item?.manufacturing_brand_name || item?.mfg_brand || item?.brand_name || item?.brand || item?.custom_brand_name || parentBrand,
    }];
  }).filter(Boolean);

  // 3. Mathematical Sanity Check (Assertion Guard)
  const computedItemsSum = rawItems.reduce((acc, it) => {
    const rate = Number(it.rate ?? it.unit_price ?? it.selling_price ?? it.price ?? (it.total_amount && it.quantity ? Number(it.total_amount) / Number(it.quantity) : (it.amount && it.quantity ? Number(it.amount) / Number(it.quantity) : 0)));
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const lineTotal = Number(it.total_amount ?? it.total_price ?? it.total ?? it.amount ?? (rate * qty));
    return acc + lineTotal;
  }, 0);

  const expectedSubtotal = Number(sale?.subtotal ?? sale?.products_total ?? 0);
  if (!isConsolidated && expectedSubtotal > 0 && Math.abs(computedItemsSum - expectedSubtotal) > 1) {
    throw new Error(
      `CRITICAL PDF MISMATCH: Sum of items (₹${computedItemsSum.toFixed(2)}) does not match invoice subtotal (₹${expectedSubtotal.toFixed(2)}). Aborting render.`
    );
  }

  // The Products Subtotal dynamically equals the sum of those exact line items
  const productsSubtotal = computedItemsSum;

  let tableRows = [];
  if (isConsolidated) {
    // Group line items under explicit section headers by invoice number/date so items are never mixed together ambiguously
    const groups = new Map();
    rawItems.forEach((it) => {
      const key = String(it.invoice_number || (it.sale_id ? `INV-${String(it.sale_id).padStart(6, '0')}` : 'General'));
      if (!groups.has(key)) {
        groups.set(key, { invoiceNumber: key, date: it.sale_date || it.invoice_date || '', items: [] });
      }
      groups.get(key).items.push(it);
    });

    let rowNum = 1;
    groups.forEach((group) => {
      const headerText = `Invoice #${group.invoiceNumber}${group.date ? ` • ${formatDMY(group.date)}` : ''}`;
      tableRows.push([
        {
          content: headerText,
          colSpan: 5,
          styles: {
            fontStyle: 'bold',
            fillColor: [240, 244, 248],
            textColor: [15, 23, 42],
            fontSize: 8,
            cellPadding: 2,
          },
        },
      ]);

      group.items.forEach((it) => {
        const rate = Number(it.rate ?? it.unit_price ?? it.selling_price ?? it.price ?? (it.total_amount && it.quantity ? Number(it.total_amount) / Number(it.quantity) : (it.amount && it.quantity ? Number(it.amount) / Number(it.quantity) : 0)));
        const qty = Number(it.quantity ?? it.qty ?? 1);
        const lineTotal = Number(it.total_amount ?? it.total_price ?? it.total ?? it.amount ?? (rate * qty));
        const unitPrice = qty > 0 ? (rate || (lineTotal / qty)) : lineTotal;

        const rawShort = it.custom_product_name || it.short_name || it.product_short_name || it.product_name || it.name || 'Product';
        const shortName = String(rawShort).split('/')[0].split(',')[0].trim() || 'Product';

        const descLines = [shortName];
        if (it.colour && String(it.colour).trim()) {
          const c = String(it.colour).trim();
          descLines.push(c.startsWith('[') ? c : `[ ${c} ]`);
        }
        const brandName = getBrandName(it, sale);
        if (brandName) {
          descLines.push(brandName);
        }

        tableRows.push([
          rowNum++,
          descLines.join('\n'),
          `${qty}\nPCS`,
          formatMoney(unitPrice),
          formatMoney(lineTotal),
        ]);
      });
    });
  } else {
    // Single Tax Invoice: strictly scoped items without cross-invoice grouping
    tableRows = rawItems.map((it, idx) => {
      const rate = Number(it.rate ?? it.unit_price ?? it.selling_price ?? it.price ?? (it.total_amount && it.quantity ? Number(it.total_amount) / Number(it.quantity) : (it.amount && it.quantity ? Number(it.amount) / Number(it.quantity) : 0)));
      const qty = Number(it.quantity ?? it.qty ?? 1);
      const lineTotal = Number(it.total_amount ?? it.total_price ?? it.total ?? it.amount ?? (rate * qty));
      const unitPrice = qty > 0 ? (rate || (lineTotal / qty)) : lineTotal;

      const rawShort = it.custom_product_name || it.short_name || it.product_short_name || it.product_name || it.name || 'Product';
      const shortName = String(rawShort).split('/')[0].split(',')[0].trim() || 'Product';

      const descLines = [shortName];
      if (it.colour && String(it.colour).trim()) {
        const c = String(it.colour).trim();
        descLines.push(c.startsWith('[') ? c : `[ ${c} ]`);
      }
      const brandName = getBrandName(it, sale);
      if (brandName) {
        descLines.push(brandName);
      }

      return [
        idx + 1,
        descLines.join('\n'),
        `${qty}\nPCS`,
        formatMoney(unitPrice),
        formatMoney(lineTotal),
      ];
    });
  }

  autoTable(doc, {
    startY: 75,
    margin: { left: 10, right: 10 },
    head: [['#', 'Item & Description', 'Qty', 'Rate', 'Amount']],
    body: tableRows,
    theme: 'plain',
    headStyles: {
      fillColor: [242, 242, 242],
      textColor: [17, 17, 17],
      fontStyle: 'bold',
      fontSize: 8.5,
      lineWidth: 0.25,
      lineColor: [153, 153, 153],
      cellPadding: 2.2,
    },
    bodyStyles: {
      textColor: [17, 17, 17],
      fontSize: 8,
      lineWidth: 0.25,
      lineColor: [153, 153, 153],
      cellPadding: 2.2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
    },
  });

  // 6. Summary Grid (56% / 44%)
  const startY = doc.lastAutoTable.finalY;
  const splitX = 116.4; // 10 + 190 * 0.56

  // Financial Calculations
  const allExpenses = (Array.isArray(sale?.expenses) ? sale.expenses : []).filter(e => e && Number(e.amount || 0) > 0);
  const courier = Number(sale?.extra_expenses_total ?? sale?.extra_expenses ?? sale?.courier_charge ?? (
    allExpenses.reduce((s, e) => s + Number(e.amount || 0), 0)
  ) ?? 0);
  const appliedCredit = Number(sale?.applied_credit_amount ?? sale?.credit_applied ?? 0);
  const advanceApplied = Number(sale?.advance_applied ?? sale?.advance_credit ?? 0);
  const paidAmount = Number(sale?.paid_amount ?? sale?.amount_paid ?? 0);
  const totalQuantity = rawItems.reduce((s, it) => s + Number(it.quantity ?? it.qty ?? 1), 0);

  let rightRows = [
    { label: 'Products Subtotal', amount: formatMoney(productsSubtotal), bold: false },
  ];

  if (courier > 0) {
    rightRows.push({ label: '+ COURIER / EXPENSES', amount: formatMoney(courier), bold: false, color: [15, 118, 110] });
  }

  let finalBillAmount = 0;
  let balanceDue = 0;

  if (!isConsolidated) {
    // Option A: Standard B2B Single Tax Invoice (Self-contained single invoice)
    if (appliedCredit > 0) {
      rightRows.push({ label: '- CREDIT NOTE', amount: `-${formatMoney(appliedCredit)}`, bold: false, color: [15, 118, 110] });
    }
    if (advanceApplied > 0) {
      rightRows.push({ label: '- STORE CREDIT / ADVANCE', amount: `-${formatMoney(advanceApplied)}`, bold: false, color: [15, 118, 110] });
    }

    finalBillAmount = Math.max(0, (productsSubtotal + courier) - appliedCredit - advanceApplied);
    balanceDue = Math.max(0, finalBillAmount - paidAmount);

    rightRows.push({ label: 'Invoice Total', amount: formatMoney(finalBillAmount), bold: true });
    rightRows.push({ label: 'Amount Paid', amount: formatMoney(paidAmount), bold: false });

    if (balanceDue <= 0) {
      rightRows.push({ label: 'Payment Status', amount: 'PAID IN FULL', bold: true, color: [22, 101, 52] });
      const latestPayment = Array.isArray(sale?.payments) && sale.payments.length > 0
        ? sale.payments[sale.payments.length - 1]
        : null;
      if (latestPayment && latestPayment.payment_date) {
        rightRows.push({
          label: 'Paid On',
          amount: `${formatDMY(latestPayment.payment_date)} (${String(latestPayment.payment_mode || 'Cash').toUpperCase()})`,
          bold: false,
          color: [22, 101, 52]
        });
      }
    } else {
      rightRows.push({ label: 'Balance Due for this Invoice', amount: formatMoney(balanceDue), bold: true, color: [225, 29, 72] });
    }
  } else {
    // Consolidated Statement / Bill with Prior Ledger Balance
    // Ensure the Grand Total and Balance Due reconcile with the customer's true total outstanding balance
    const customerTotalPending = customer?.pending_amount !== undefined && customer?.pending_amount !== null
      ? Number(customer.pending_amount)
      : (sale?.pending_amount !== undefined && sale?.pending_amount !== null ? Number(sale.pending_amount) : null);

    const currentBillNet = (productsSubtotal + courier) - appliedCredit - advanceApplied;

    let prevBalance = Number(sale?.previous_balance ?? sale?.old_balance ?? 0);
    if (customerTotalPending !== null && !isNaN(customerTotalPending) && customerTotalPending > 0) {
      prevBalance = Math.max(0, customerTotalPending - currentBillNet + paidAmount);
      finalBillAmount = customerTotalPending;
      balanceDue = Math.max(0, customerTotalPending - paidAmount);
    } else {
      finalBillAmount = Math.max(0, (productsSubtotal + courier + prevBalance) - appliedCredit - advanceApplied);
      balanceDue = Math.max(0, finalBillAmount - paidAmount);
    }

    if (prevBalance > 0) {
      rightRows.push({ label: '+ PREVIOUS BALANCE', amount: formatMoney(prevBalance), bold: false, color: [180, 83, 9] });
    } else if (prevBalance < 0) {
      rightRows.push({ label: '- PREVIOUS ADVANCE', amount: `-${formatMoney(Math.abs(prevBalance))}`, bold: false, color: [15, 118, 110] });
    }
    if (appliedCredit > 0) {
      rightRows.push({ label: '- CREDIT NOTE', amount: `-${formatMoney(appliedCredit)}`, bold: false, color: [15, 118, 110] });
    }
    if (advanceApplied > 0) {
      rightRows.push({ label: '- STORE CREDIT / ADVANCE', amount: `-${formatMoney(advanceApplied)}`, bold: false, color: [15, 118, 110] });
    }

    rightRows.push({ label: 'Grand Total', amount: formatMoney(finalBillAmount), bold: true });
    rightRows.push({ label: 'Amount Paid', amount: formatMoney(paidAmount), bold: false });

    if (balanceDue <= 0) {
      rightRows.push({ label: 'Payment Status', amount: 'PAID IN FULL', bold: true, color: [22, 101, 52] });
    } else {
      rightRows.push({ label: 'Balance Due', amount: formatMoney(balanceDue), bold: true, color: [225, 29, 72] });
    }
  }

  // Calculate customer's remaining available advance / credit balance
  const remainingCredit = (sale?.closing_balance !== undefined && Number(sale.closing_balance) < 0)
    ? Math.abs(Number(sale.closing_balance))
    : Number(customer?.advance_balance ?? sale?.customer_advance_balance ?? sale?.advance_balance ?? 0);

  if (remainingCredit > 0) {
    rightRows.push({
      label: 'Available Credit',
      amount: `${formatMoney(remainingCredit)} Cr`,
      bold: true,
      color: [15, 118, 110]
    });
  }

  const rightRowsHeight = rightRows.length * 6;
  const signatureHeight = 22;
  const minSummaryHeight = Math.max(rightRowsHeight + signatureHeight + 10, 55);
  const summaryEndY = Math.min(startY + minSummaryHeight, 287);

  // Vertical divider between Left (56%) and Right (44%)
  doc.setDrawColor(153, 153, 153);
  doc.setLineWidth(0.25);
  doc.line(splitX, startY, splitX, summaryEndY);

  // Left Content: Notes & Terms
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(17, 17, 17);
  doc.text(`Items in Total ${totalQuantity}`, 13, startY + 6);
  
  doc.text('Total In Words', 13, startY + 12);
  doc.setFont('helvetica', 'bolditalic');
  doc.text(`Indian Rupee ${toWords(finalBillAmount)} Only`, 13, startY + 16);

  doc.setFont('helvetica', 'normal');
  doc.text('Notes', 13, startY + 23);
  doc.setTextColor(71, 85, 105);
  doc.text(String(sale?.notes || 'Thanks for your business.'), 13, startY + 27);

  doc.setTextColor(17, 17, 17);
  doc.text('Terms & Conditions', 13, startY + 34);
  doc.setTextColor(71, 85, 105);
  doc.text('ORIGINAL LCD GOODS THREE MONTHS WARRANTY ONLY', 13, startY + 38);

  // Optional Footer Note for Single Tax Invoice: Total Account Outstanding
  const customerAccountOutstanding = Number(
    customer?.pending_amount ??
    customer?.total_outstanding ??
    sale?.customer_pending_amount ??
    getCustomerTotalOutstanding(customer, Array.isArray(customer?.items) ? customer.items : [], customer?.payments || []) ??
    0
  );
  let noteOffset = 44;
  if (!isConsolidated && customerAccountOutstanding > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    doc.text(`Total Account Outstanding: Rs. ${formatMoney(customerAccountOutstanding)}`, 13, startY + noteOffset);
    noteOffset += 5.5;
  }

  if (remainingCredit > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 118, 110);
    doc.text(`Available Store Credit / Advance: Rs. ${formatMoney(remainingCredit)} Cr`, 13, startY + noteOffset);
  }

  // Right Content: Totals Table
  let curY = startY + 5;
  rightRows.forEach(row => {
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.bold ? 8.5 : 8);
    if (row.color) {
      doc.setTextColor(row.color[0], row.color[1], row.color[2]);
    } else {
      doc.setTextColor(17, 17, 17);
    }
    doc.text(row.label, splitX + 4, curY);
    doc.text(`Rs. ${row.amount}`, 196, curY, { align: 'right' });
    curY += 5.5;
  });

  // Signature Block
  const sigY = summaryEndY - 14;
  doc.setDrawColor(153, 153, 153);
  doc.setLineWidth(0.25);
  doc.line(splitX, sigY, 200, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Authorized Signatory', (splitX + 200) / 2, summaryEndY - 4, { align: 'center' });

  // Bottom Border of summary
  doc.line(10, summaryEndY, 200, summaryEndY);

  return doc;
};

/**
 * 2. GENERATE CUSTOMER ACCOUNT STATEMENT PDF
 */
export const generateStatementPDFDoc = async (customer = {}, invoices = [], shop = {}, paymentsArg = []) => {
  const { jsPDF, autoTable } = await getJsPDF();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const shopName = 'PINKYSALES';
  const shopAddress = 'C-314, Pratik Arcade, Surat';
  const shopPhone = '+91 90995 69700';

  const custName = customer?.customer_name || customer?.name || 'Customer';
  const custMobile = customer?.mobile || '';
  const custAddress = customer?.address || '';
  const custGstin = customer?.gstin || '';
  const openingBal = Number(customer?.opening_balance || 0);

  // Keep ALL invoices in statement so complete history of customer purchases remains!
  const validInvoices = Array.isArray(invoices) && invoices.length > 0 ? invoices : [];
  const firstInvoice = validInvoices[0];
  const lastInvoice = validInvoices[validInvoices.length - 1];

  const allPayments = Array.isArray(paymentsArg) && paymentsArg.length > 0
    ? paymentsArg
    : (Array.isArray(customer?.payments) && customer.payments.length > 0 ? customer.payments : []);

  const validPaymentsList = allPayments.filter(pm => !pm.reversed_at && String(pm.payment_mode || '').toLowerCase() !== 'credit_note');

  const purchasesTotal = validInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
  const totalPaid = validPaymentsList.length > 0
    ? validPaymentsList.reduce((s, pm) => s + Number(pm.amount || 0), 0)
    : validInvoices.reduce((s, inv) => s + Number(inv.paid_amount || 0), 0);
  const totalDebits = purchasesTotal + (openingBal > 0 ? openingBal : 0);
  let totalDue = Math.max(0, totalDebits - totalPaid);

  // Calculate customer's remaining available advance / store credit balance
  const prevBal = Number(firstInvoice?.previous_balance ?? firstInvoice?.old_balance ?? 0);
  const rawCustomerAdvance = Number(customer?.advance_balance ?? customer?.advance ?? lastInvoice?.customer_advance_balance ?? lastInvoice?.advance_balance ?? 0);

  let availableCreditBalance = rawCustomerAdvance;
  if (lastInvoice?.closing_balance !== undefined && Number(lastInvoice.closing_balance) < 0) {
    availableCreditBalance = Math.max(availableCreditBalance, Math.abs(Number(lastInvoice.closing_balance)));
  } else if (prevBal < 0 && (purchasesTotal + prevBal) < 0) {
    availableCreditBalance = Math.max(availableCreditBalance, Math.abs(purchasesTotal + prevBal));
  } else if (prevBal < 0) {
    availableCreditBalance = Math.max(availableCreditBalance, Math.abs(prevBal));
  } else if ((totalDebits - totalPaid) < 0) {
    availableCreditBalance = Math.max(availableCreditBalance, Math.abs(totalDebits - totalPaid));
  } else if (openingBal < 0) {
    availableCreditBalance = Math.max(availableCreditBalance, Math.abs(openingBal));
  }

  let hasCreditBalance = availableCreditBalance > 0;

  // 1. Outer Border Box
  doc.setDrawColor(119, 119, 119);
  doc.setLineWidth(0.3);
  doc.rect(10, 10, 190, 277);

  // 2. Header Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(17, 17, 17);
  doc.text(shopName, 13, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(shopAddress, 13, 21.5);
  doc.text(`Phone: ${shopPhone}`, 13, 25.5);
  doc.text('Gujarat, India', 13, 29.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text('COMPLETE ACCOUNT STATEMENT', 197, 19, { align: 'right' });

  // Divider after Header
  doc.setDrawColor(153, 153, 153);
  doc.setLineWidth(0.25);
  doc.line(10, 32, 200, 32);

  // 3. Meta Section (32 to 52mm)
  doc.line(105, 32, 105, 52);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Customer Name', 13, 37);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text(':', 44, 37);
  doc.text(custName, 47, 37);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Mobile / Phone', 13, 42);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text(':', 44, 42);
  doc.text(custMobile || 'N/A', 47, 42);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(custGstin ? 'GSTIN' : 'Customer Address', 13, 47);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text(':', 44, 47);
  doc.text(custGstin || custAddress || 'Local Customer', 47, 47);

  // Right Side Meta
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Statement Date', 108, 37);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text(':', 142, 37);
  doc.text(new Date().toLocaleDateString('en-GB'), 145, 37);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Total Purchases', 108, 42);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text(':', 142, 42);
  doc.text(`${validInvoices.length} Invoices`, 145, 42);

  if (hasCreditBalance) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 118, 110);
    doc.text('Available Credit', 108, 47);
    doc.text(':', 142, 47);
    doc.text(`Rs. ${formatMoney(availableCreditBalance)} Cr`, 145, 47);
  }

  // Divider after Meta
  doc.line(10, 52, 200, 52);

  // 4. Summary Bar
  doc.setFillColor(242, 242, 242);
  doc.rect(10, 52, 190, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 17, 17);
  doc.text('Customer Purchase & Balance Summary', 13, 56.3);
  doc.line(10, 58, 200, 58);

  // Summary Metrics Blocks (58 to 72mm)
  if (openingBal > 0) {
    // Opening balance clearly separated from period purchases
    if (hasCreditBalance) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('OPENING BALANCE', 12, 63);
      doc.text('TOTAL INVOICED', 48, 63);
      doc.text('TOTAL PAID', 85, 63);
      doc.text('OUTSTANDING DUE', 122, 63);
      doc.text('REMAINING CREDIT', 160, 63);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 17, 17);
      doc.text(`Rs. ${formatMoney(openingBal)}`, 12, 69);
      doc.text(`Rs. ${formatMoney(purchasesTotal)}`, 48, 69);
      doc.setTextColor(15, 118, 110);
      doc.text(`Rs. ${formatMoney(totalPaid)}`, 85, 69);
      doc.setTextColor(totalDue > 0 ? 225 : 15, totalDue > 0 ? 29 : 118, totalDue > 0 ? 72 : 110);
      doc.text(totalDue > 0 ? `Rs. ${formatMoney(totalDue)}` : 'Rs. 0', 122, 69);
      doc.setTextColor(15, 118, 110);
      doc.text(`Rs. ${formatMoney(availableCreditBalance)} Cr`, 160, 69);
    } else {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('OPENING BALANCE', 14, 63);
      doc.text('TOTAL INVOICED', 62, 63);
      doc.text('TOTAL PAID / REPAID', 110, 63);
      doc.text('TOTAL OUTSTANDING DUE', 155, 63);

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 17, 17);
      doc.text(`Rs. ${formatMoney(openingBal)}`, 14, 69);
      doc.text(`Rs. ${formatMoney(purchasesTotal)}`, 62, 69);
      doc.setTextColor(15, 118, 110);
      doc.text(`Rs. ${formatMoney(totalPaid)}`, 110, 69);
      doc.setTextColor(totalDue > 0 ? 225 : 15, totalDue > 0 ? 29 : 118, totalDue > 0 ? 72 : 110);
      doc.text(`Rs. ${formatMoney(totalDue)}`, 155, 69);
    }
  } else if (hasCreditBalance) {
    // 4 Column Layout: Invoiced, Paid, Outstanding Due, Remaining Credit
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL INVOICED', 14, 63);
    doc.text('TOTAL PAID / REPAID', 62, 63);
    doc.text('OUTSTANDING DUE', 112, 63);
    doc.text('REMAINING CREDIT / ADVANCE', 155, 63);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text(`Rs. ${formatMoney(purchasesTotal)}`, 14, 69);
    doc.setTextColor(15, 118, 110);
    doc.text(`Rs. ${formatMoney(totalPaid)}`, 62, 69);
    doc.setTextColor(totalDue > 0 ? 225 : 15, totalDue > 0 ? 29 : 118, totalDue > 0 ? 72 : 110);
    doc.text(totalDue > 0 ? `Rs. ${formatMoney(totalDue)}` : 'Rs. 0', 112, 69);
    doc.setTextColor(15, 118, 110);
    doc.text(`Rs. ${formatMoney(availableCreditBalance)} Cr`, 155, 69);
  } else {
    // 3 Column Layout
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL INVOICED', 20, 63);
    doc.text('TOTAL PAID / REPAID', 85, 63);
    doc.text('TOTAL OUTSTANDING DUE', 145, 63);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 17, 17);
    doc.text(`Rs. ${formatMoney(purchasesTotal)}`, 20, 69);
    doc.setTextColor(15, 118, 110);
    doc.text(`Rs. ${formatMoney(totalPaid)}`, 85, 69);
    doc.setTextColor(totalDue > 0 ? 225 : 15, totalDue > 0 ? 29 : 118, totalDue > 0 ? 72 : 110);
    doc.text(`Rs. ${formatMoney(totalDue)}`, 145, 69);
  }

  doc.line(10, 72, 200, 72);

  // Build Chronological Statement containing all purchases (with item breakdown) AND all payments (with dates)
  const chronologicalEvents = [];

  // Opening Balance event (Debit if pending, Credit if advance)
  if (openingBal > 0) {
    const obDateStr = customer?.opening_balance_date ? String(customer.opening_balance_date).slice(0, 10) : '2026-01-01';
    chronologicalEvents.push({
      date: obDateStr,
      dateFormatted: 'Opening',
      ref: 'OPENING BAL',
      type: 'Opening Balance',
      particulars: 'Carry Forward (Opening) Debit Balance',
      debit: openingBal,
      credit: 0,
      isOpening: true,
    });
  } else if (prevBal < 0 || openingBal < 0) {
    const openingCredit = Math.abs(prevBal < 0 ? prevBal : openingBal);
    chronologicalEvents.push({
      date: '2026-01-01',
      dateFormatted: 'Opening',
      ref: 'ADVANCE BAL',
      type: 'Advance Deposit',
      particulars: 'Previous Advance / Store Credit Balance Remaining with Shop',
      debit: 0,
      credit: openingCredit,
      isOpening: true,
    });
  }

  // Purchases events
  validInvoices.forEach((inv, idx) => {
    const invNo = inv.invoice_number || `INV-${String(inv.id || idx + 1).padStart(6, '0')}`;
    const invDate = inv.invoice_date || inv.sale_date || '';
    
    // Format list of items bought
    let itemsText = '';
    if (Array.isArray(inv.items) && inv.items.length > 0) {
      itemsText = inv.items.map((it) => {
        const q = it.quantity || 1;
        const r = Number(it.rate || it.unit_price || (it.total_price ? it.total_price / q : 0));
        const name = it.custom_product_name || it.short_name || it.product_name || it.name || 'Item';
        const brand = it.custom_brand_name || it.brand_name || it.brand || '';
        const brandStr = brand ? ` [${brand}]` : '';
        const colStr = it.colour ? ` (${it.colour})` : '';
        return `• ${name}${brandStr}${colStr} - ${q} pcs @ Rs. ${formatMoney(r)}`;
      }).join('\n');
    } else {
      const prodName = inv.product_name || inv.short_name || 'Purchase Items';
      itemsText = `• ${prodName} (${inv.quantity || 1} pcs)`;
    }

    if (Array.isArray(inv.expenses) && inv.expenses.length > 0) {
      const expText = inv.expenses.map(e => `• Extra: ${e.expense_name || e.expense_type} (+Rs. ${formatMoney(e.amount)})`).join('\n');
      itemsText += `\n${expText}`;
    }

    chronologicalEvents.push({
      date: invDate,
      dateFormatted: formatDMY(invDate),
      ref: invNo,
      type: 'Purchase',
      particulars: `Purchase: ${invNo}\n${itemsText}`,
      debit: Number(inv.total_amount || 0),
      credit: 0,
      isOpening: false,
    });

    // Credit Note / Applied Credit
    if (Number(inv.applied_credit_amount || 0) > 0) {
      chronologicalEvents.push({
        date: invDate,
        dateFormatted: formatDMY(invDate),
        ref: invNo,
        type: 'Credit Note',
        particulars: `Credit Note / Advance Adjusted on ${invNo}`,
        debit: 0,
        credit: Number(inv.applied_credit_amount || 0),
        isOpening: false,
      });
    }
  });

  // Payment Events (Unified from validPaymentsList or fallback to validInvoices)
  if (validPaymentsList.length > 0) {
    validPaymentsList.forEach((pm) => {
      const pmDate = pm.payment_date || pm.created_at || '';
      const pmDateStr = String(pmDate).slice(0, 10);
      const pmNum = pm.payment_number || `PAY-${String(pm.id).padStart(6, '0')}`;
      const modeStr = String(pm.payment_mode || 'Cash').toUpperCase();

      // Build breakdown of allocations
      let descLines = [`Payment received via ${modeStr}${pm.reference_number ? ` [Ref: ${pm.reference_number}]` : ''}`];
      if (Array.isArray(pm.allocations) && pm.allocations.length > 0) {
        pm.allocations.forEach((alloc) => {
          if (alloc.allocation_type === 'opening_balance') {
            descLines.push(`• Deducted from Opening Balance: Rs. ${formatMoney(alloc.amount_applied)}`);
          } else if (alloc.allocation_type === 'invoice' && alloc.sale_id) {
            const matchedInv = validInvoices.find(v => Number(v.id) === Number(alloc.sale_id));
            const invNum = matchedInv?.invoice_number || `INV-${String(alloc.sale_id).padStart(6, '0')}`;
            descLines.push(`• Settled on ${invNum}: Rs. ${formatMoney(alloc.amount_applied)}`);
          } else if (alloc.allocation_type === 'advance') {
            descLines.push(`• Available Advance / Store Credit: Rs. ${formatMoney(alloc.amount_applied)}`);
          }
        });
      } else if (pm.notes) {
        descLines.push(`• ${pm.notes}`);
      }

      chronologicalEvents.push({
        date: pmDateStr,
        dateFormatted: formatDMY(pmDateStr),
        ref: pmNum,
        type: 'Payment',
        particulars: descLines.join('\n'),
        debit: 0,
        credit: Number(pm.amount || 0),
        isOpening: false,
      });
    });
  } else {
    // Legacy fallback: Extract from validInvoices
    validInvoices.forEach((inv) => {
      const invNo = inv.invoice_number || `INV-${String(inv.id).padStart(6, '0')}`;
      const invDate = inv.invoice_date || inv.sale_date || '';
      if (Array.isArray(inv.payments) && inv.payments.length > 0) {
        inv.payments.forEach((pm) => {
          const pmDate = pm.payment_date || invDate;
          chronologicalEvents.push({
            date: pmDate,
            dateFormatted: formatDMY(pmDate),
            ref: invNo,
            type: 'Payment',
            particulars: `Payment received via ${String(pm.payment_mode || 'Cash').toUpperCase()}${pm.note ? ` (${pm.note})` : ''} on ${invNo}`,
            debit: 0,
            credit: Number(pm.amount || 0),
            isOpening: false,
          });
        });
      } else if (Number(inv.paid_amount || 0) > 0) {
        const isCash = String(inv.payment_mode || '').trim().toLowerCase() === 'cash';
        chronologicalEvents.push({
          date: invDate,
          dateFormatted: formatDMY(invDate),
          ref: invNo,
          type: 'Payment',
          particulars: `Payment received via ${isCash ? 'CASH' : (inv.payment_mode || 'DIRECT')} on ${invNo}`,
          debit: 0,
          credit: Number(inv.paid_amount || 0),
          isOpening: false,
        });
      }
    });
  }

  // Sort chronological events deterministically:
  // 1. Opening balance row always comes first
  // 2. Date ASC
  // 3. Purchases before payments on the same date
  chronologicalEvents.sort((a, b) => {
    if (a.isOpening && !b.isOpening) return -1;
    if (!a.isOpening && b.isOpening) return 1;
    const da = String(a.date || '');
    const db = String(b.date || '');
    if (da < db) return -1;
    if (da > db) return 1;
    if (a.type === 'Purchase' && b.type === 'Payment') return -1;
    if (a.type === 'Payment' && b.type === 'Purchase') return 1;
    return 0;
  });

  let runningBalance = 0;
  const statementRows = chronologicalEvents.map((evt, idx) => {
    runningBalance = runningBalance + evt.debit - evt.credit;
    const balanceDisplay = runningBalance < 0 
      ? `Rs. ${formatMoney(Math.abs(runningBalance))} Cr`
      : (runningBalance > 0 ? `Rs. ${formatMoney(runningBalance)}` : 'Rs. 0');

    return [
      idx + 1,
      evt.dateFormatted,
      evt.ref,
      evt.particulars,
      evt.debit > 0 ? `Rs. ${formatMoney(evt.debit)}` : '-',
      evt.credit > 0 ? `Rs. ${formatMoney(evt.credit)}` : '-',
      balanceDisplay,
    ];
  });

  autoTable(doc, {
    startY: 74,
    margin: { left: 10, right: 10 },
    head: [['#', 'Date', 'Ref / Inv', 'Bought Items & Payment Details', 'Debit (Billed)', 'Credit (Paid)', 'Running Balance']],
    body: statementRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: 2,
    },
    bodyStyles: {
      textColor: [17, 17, 17],
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: [226, 232, 240],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 22, fontStyle: 'bold' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: [15, 118, 110] },
      6: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [15, 118, 110] },
    },
    didDrawPage: (data) => {
      // Re-draw outer border on subsequent pages
      if (data.pageNumber > 1) {
        doc.setDrawColor(119, 119, 119);
        doc.setLineWidth(0.3);
        doc.rect(10, 10, 190, 277);
      }
    }
  });

  const finalY = (doc.lastAutoTable?.finalY || 150) + 6;
  const currentY = Math.min(finalY, 260);

  let summaryLine = `Total Invoiced: Rs. ${formatMoney(purchasesTotal)}`;
  if (openingBal > 0) {
    summaryLine += `   |   Opening Balance: Rs. ${formatMoney(openingBal)}`;
  }
  summaryLine += `   |   Total Paid: Rs. ${formatMoney(totalPaid)}`;
  if (totalDue > 0) {
    summaryLine += `   |   Net Outstanding Due: Rs. ${formatMoney(totalDue)}`;
  } else {
    summaryLine += `   |   Net Balance Due: Rs. 0`;
  }
  if (hasCreditBalance) {
    summaryLine += `   |   Available Credit Balance: Rs. ${formatMoney(availableCreditBalance)} Cr`;
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(summaryLine, 13, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7.5);
  doc.text('This is an official computer-generated statement of customer purchases, bought items, repayments, and remaining credit.', 13, currentY + 4);
  doc.text('Please verify all entries. Thank you for your business.', 13, currentY + 8);

  const sigY = Math.min(currentY + 18, 276);
  doc.setDrawColor(153, 153, 153);
  doc.setLineWidth(0.25);
  doc.line(135, sigY, 195, sigY);
  doc.setFontSize(8);
  doc.text('Authorized Signatory', 165, sigY + 4, { align: 'center' });

  return doc;
};

/**
 * 3. GENERATE CUSTOMER RUNNING LEDGER PDF
 */
export const generateLedgerPDFDoc = async (customer = {}, invoices = [], payments = [], shop = {}) => {
  const { jsPDF, autoTable } = await getJsPDF();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const shopName = String(shop?.name || 'PINKY SALES').toUpperCase();
  const custName = customer?.customer_name || customer?.name || 'Customer';
  const custMobile = customer?.mobile || 'N/A';
  const custGstin = customer?.gstin || '';

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
  doc.setFontSize(8.5);
  doc.text(`Store: C-314, Pratik Arcade, Surat, Gujarat | Phone: +91 90995 69700`, 14, 25);
  doc.setFontSize(9.5);
  doc.text(`Customer Account: ${custName} | Phone: ${custMobile}${custGstin ? ` | GSTIN: ${custGstin}` : ''}`, 14, 30);
  doc.text(`Ledger Period: All active purchases and repayments as of ${new Date().toLocaleDateString('en-GB')}`, 14, 35);

  // Build Chronological Transactions list
  let ledgerRows = [];
  let runningBalance = 0;

  // Support direct structured ledger object or rows array
  const rawRows = customer?.rows || (Array.isArray(invoices) && invoices[0]?.entry_date !== undefined ? invoices : null);

  if (rawRows) {
    ledgerRows = rawRows.map((r, idx) => [
      idx + 1,
      formatDMY(r.entry_date),
      r.ref_no || `TX-${idx + 1}`,
      r.description || 'Transaction',
      Number(r.debit || 0) > 0 ? `Rs. ${formatMoney(r.debit)}` : '-',
      Number(r.credit || 0) > 0 ? `Rs. ${formatMoney(r.credit)}` : '-',
      `Rs. ${formatMoney(Math.abs(Number(r.running_balance || 0)))}${Number(r.running_balance || 0) > 0 ? ' Dr' : Number(r.running_balance || 0) < 0 ? ' Cr' : ''}`
    ]);
    runningBalance = rawRows.length ? Number(rawRows[rawRows.length - 1].running_balance || 0) : 0;
  } else {
    const transactions = [];
    if (Number(customer?.opening_balance || 0) > 0) {
      transactions.push({
        date: customer.opening_balance_date || '2026-01-01',
        ref: `OB-${String(customer.id || '').padStart(6, '0')}`,
        particulars: 'Opening Balance',
        debit: Number(customer.opening_balance),
        credit: 0,
      });
    }
    invoices.forEach(inv => {
      const invNo = inv.invoice_number || `INV-${String(inv.id).padStart(6, '0')}`;
      const invDate = inv.invoice_date || inv.sale_date || '2026-08-27';
      transactions.push({
        date: invDate,
        ref: invNo,
        particulars: `Purchase: ${invNo} (${inv.items?.length || 1} items)`,
        debit: Number(inv.total_amount || 0),
        credit: 0,
      });
      if (Number(inv.applied_credit_amount || 0) > 0) {
        transactions.push({
          date: invDate,
          ref: invNo,
          particulars: `Credit Note applied on ${invNo}`,
          debit: 0,
          credit: Number(inv.applied_credit_amount || 0),
        });
      }
      if (Array.isArray(inv.payments) && inv.payments.length > 0) {
        inv.payments.forEach(p => {
          transactions.push({
            date: p.payment_date || invDate,
            ref: p.payment_number || `PAY-${p.id}`,
            particulars: `Repayment via ${p.payment_mode || 'Cash'}${p.note ? ` (${p.note})` : ''} on ${invNo}`,
            debit: 0,
            credit: Number(p.amount || 0),
          });
        });
      } else if (Number(inv.paid_amount || 0) > 0) {
        transactions.push({
          date: invDate,
          ref: invNo,
          particulars: `Repayment on ${invNo}`,
          debit: 0,
          credit: Number(inv.paid_amount || 0),
        });
      }
    });

    transactions.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    ledgerRows = transactions.map((t, idx) => {
      runningBalance = runningBalance + t.debit - t.credit;
      return [
        idx + 1,
        formatDMY(t.date),
        t.ref || `TX-${idx + 1}`,
        t.particulars,
        t.debit > 0 ? `Rs. ${formatMoney(t.debit)}` : '-',
        t.credit > 0 ? `Rs. ${formatMoney(t.credit)}` : '-',
        `Rs. ${formatMoney(runningBalance)}`
      ];
    });
  }

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
 * 4. BUILD CLEAN & INFORMATIVE WHATSAPP MESSAGE
 */
export const formatWhatsAppMessage = ({
  customer = {},
  sale = null,
  shop = {},
  type = 'invoice_and_reminder', // 'single_invoice' | 'invoice_and_reminder' | 'invoice_pdf' | 'invoice_reminder_only' | 'pending_summary' | 'statement' | 'ledger' | 'reminder_only' | 'pending_reminder_only'
}) => {
  const custName = customer?.customer_name || customer?.name || sale?.customer_name || 'Valued Customer';
  const shopName = 'PINKYSALES';
  const shopContact = `📍 *C-314, Pratik Arcade, Surat*\n📞 *+91 90995 69700*`;

  // Determine if this is a single-invoice target
  const isSingleInvoice = Boolean(
    sale || 
    type === 'single_invoice' || 
    type === 'invoice_and_reminder' || 
    type === 'invoice_pdf' || 
    type === 'invoice_reminder_only'
  ) && type !== 'pending_summary' && type !== 'statement' && type !== 'ledger' && type !== 'pending_reminder_only';

  if (isSingleInvoice && (sale || customer)) {
    const inv = sale || customer;
    const invNo = inv.invoice_number || `INV-${String(inv.id || '1').padStart(6, '0')}`;
    const invDate = formatDMY(inv.invoice_date || inv.sale_date);
    
    const isCash = String(inv.payment_mode || sale?.payment_mode || '').trim().toLowerCase() === 'cash';
    const termsStr = isCash ? '💳 *Payment Terms:* Cash Only\n' : (inv.payment_terms_days ? `💳 *Payment Terms:* ${inv.payment_terms_days} Days\n` : '');
    const dueDate = isCash ? 'Immediate / On Receipt' : (inv.due_date ? formatDMY(inv.due_date) : 'On Receipt');
    
    const totalAmount = Number(inv.total_amount || 0);
    const paidAmount = Number(inv.paid_amount || 0);
    const pendingAmount = Number(inv.pending_amount ?? (totalAmount - paidAmount));
    
    let msg = `Dear ${custName},\n\nGreetings from *${shopName}*!\n\n📄 *TAX INVOICE: ${invNo}*\n📅 *Invoice Date:* ${invDate}\n${termsStr}⏰ *Due Date:* ${dueDate}\n\n`;

    if (pendingAmount > 0) {
      msg += `⚠️ *Balance Due:* Rs. ${formatMoney(pendingAmount)}\n`;
    } else {
      msg += `✨ *Payment Status:* Fully Paid\n`;
    }

    const customerAccountOutstanding = Number(
      customer?.pending_amount ??
      customer?.total_outstanding ??
      sale?.customer_pending_amount ??
      getCustomerTotalOutstanding(customer, Array.isArray(customer?.items) ? customer.items : [], customer?.payments || []) ??
      0
    );
    if (customerAccountOutstanding > 0 && Math.abs(customerAccountOutstanding - pendingAmount) > 0.01) {
      msg += `📊 *Total Account Outstanding:* Rs. ${formatMoney(customerAccountOutstanding)}\n`;
    }

    const prevBal = Number(inv?.previous_balance ?? inv?.old_balance ?? 0);
    const remainingCredit = (inv.closing_balance !== undefined && Number(inv.closing_balance) < 0)
      ? Math.abs(Number(inv.closing_balance))
      : (prevBal < 0 && (Number(inv.products_total || 0) + prevBal) < 0
        ? Math.abs(Number(inv.products_total || 0) + prevBal)
        : Number(customer?.advance_balance ?? inv?.customer_advance_balance ?? inv?.advance_balance ?? 0));

    if (remainingCredit > 0) {
      msg += `💼 *Available Store Credit / Advance:* Rs. ${formatMoney(remainingCredit)}\n`;
    }

    if (type === 'invoice_reminder_only' || type === 'reminder_only') {
      msg += `\nKindly arrange payment for any pending dues at your earliest convenience.\n\nThank you for your business!\n*${shopName}*\n${shopContact}`;
    } else {
      msg += `\nPlease find your official Tax Invoice PDF attached.\n\nThank you for your business!\n*${shopName}*\n${shopContact}`;
    }

    return msg;
  }

  // Case B: Multi-Invoice Pending Summary / Customer Account Statement
  const rawPendingInvoices = Array.isArray(customer?.items) && customer.items.length > 0
    ? customer.items
    : (sale ? [sale] : [customer]);
  
  // Filter only invoices that have outstanding pending balance > 0
  const pendingInvoices = rawPendingInvoices.filter(inv => Number(inv.pending_amount || 0) > 0);
  const openingBalance = Number(customer?.opening_balance || 0);

  const totalBilled = Number(rawPendingInvoices.reduce((s, i) => s + Number(i.total_amount || 0), 0));
  const validCustPayments = Array.isArray(customer?.payments)
    ? customer.payments.filter(p => !p.reversed_at && String(p.payment_mode || '').toLowerCase() !== 'credit_note')
    : [];
  const totalPaid = validCustPayments.length > 0
    ? validCustPayments.reduce((s, p) => s + Number(p.amount || 0), 0)
    : Number(customer?.paid_amount ?? rawPendingInvoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0));

  const totalPending = getCustomerTotalOutstanding(customer, rawPendingInvoices, customer?.payments || []);

  if (type === 'ledger') {
    return `Dear ${custName},\n\nGreetings from *${shopName}*.\n\nPlease find your official *Customer Transaction Ledger* attached.\n\n📊 *Total Outstanding Balance:* Rs. ${formatMoney(totalPending)}\n\nPlease review the attached running statement for full debit and credit history.\n\nThank you!\n*${shopName}*\n${shopContact}`;
  }

  // Default: Pending Summary / Account Statement
  const invoiceLines = pendingInvoices.map((inv, idx) => {
    const invNo = inv.invoice_number || `INV-${String(inv.id || idx + 1).padStart(6, '0')}`;
    const invDate = formatDMY(inv.invoice_date || inv.sale_date);
    const dueDate = inv.due_date ? formatDMY(inv.due_date) : 'Earliest';
    const dueAmt = Number(inv.pending_amount || 0);
    return `${idx + 1}. *${invNo}* (${invDate}) · Due: ${dueDate} · Due: *Rs. ${formatMoney(dueAmt)}*`;
  }).join('\n');

  let msg = `Dear ${custName},\n\nGreetings from *${shopName}*!\n\nThis is a friendly reminder regarding your outstanding balance across *${pendingInvoices.length} pending invoice(s)*:\n\n`;
  if (invoiceLines) {
    msg += `*Pending Invoices Breakdown:*\n${invoiceLines}\n\n`;
  }
  if (openingBalance > 0) {
    msg += `📂 *Carry Forward (Opening) Balance:* Rs. ${formatMoney(openingBalance)}\n`;
  }
  msg += `📊 *Total Invoiced (Purchases):* Rs. ${formatMoney(totalBilled)}\n`;
  msg += `✅ *Total Paid:* Rs. ${formatMoney(totalPaid)}\n`;
  msg += `⚠️ *Total Outstanding Due:* *Rs. ${formatMoney(totalPending)}*\n\n`;

  if (type === 'pending_reminder_only' || type === 'reminder_only') {
    msg += `Kindly arrange for the settlement of dues at your earliest convenience.\n\nThank you for your cooperation!\n*${shopName}*\n${shopContact}`;
  } else {
    msg += `Please find your consolidated Statement attached. Kindly arrange for the settlement of dues.\n\nThank you for your cooperation!\n*${shopName}*\n${shopContact}`;
  }

  return msg;
};



/**
 * Clean and parse customer phone number to contain only digits.
 * If 10 digits without country code, prepends standard Indian country code 91.
 */
export const parseCleanPhoneNumber = (rawPhone) => {
  if (!rawPhone) return '';
  // Strip all non-numeric characters (spaces, dashes, plus signs, brackets, parentheses)
  const digitsOnly = String(rawPhone).replace(/\D/g, '');
  if (!digitsOnly) return '';
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  return digitsOnly;
};

/**
 * 5. WHATSAPP + INVOICE ATTACHMENT SHARING SERVICE
 */
export const shareToWhatsAppService = async ({
  customer = {},
  type = 'invoice_and_reminder', // 'single_invoice' | 'invoice_and_reminder' | 'invoice_pdf' | 'invoice_reminder_only' | 'pending_summary' | 'statement' | 'ledger' | 'reminder_only' | 'pending_reminder_only'
  sale = null,
  shop = {},
  customMessage = '',
  customPhone = '',
  preOpenedWindow = null,
  authedFetch,
  showToast,
}) => {
  const custName = customer?.customer_name || customer?.name || sale?.customer_name || 'Customer';
  const rawMobile = customPhone || customer?.mobile || sale?.mobile || '';
  const cleanMobile = parseCleanPhoneNumber(rawMobile);

  const isSingle = Boolean(
    sale || 
    type === 'single_invoice' || 
    type === 'invoice_and_reminder' || 
    type === 'invoice_pdf' || 
    type === 'invoice_reminder_only'
  ) && type !== 'pending_summary' && type !== 'statement' && type !== 'ledger' && type !== 'pending_reminder_only';

  const primaryInvoice = sale || customer?.items?.[0] || customer;
  const invNo = primaryInvoice?.invoice_number || `INV-${String(primaryInvoice?.id || '000001').padStart(6, '0')}`;
  const totalPending = Number(customer?.pending_amount ?? sale?.pending_amount ?? 0);

  // 1. Build or Use Formatted WhatsApp Message
  const message = (customMessage && customMessage.trim()) 
    ? customMessage.trim() 
    : formatWhatsAppMessage({ customer, sale, shop, type });

  // 2. Validate phone number and message
  if (!cleanMobile) {
    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
    if (showToast) showToast('Missing phone number: Please provide a valid customer phone number.');
    return;
  }

  if (!message) {
    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
    if (showToast) showToast('Missing message: Message content cannot be empty.');
    return;
  }

  // 3. Generate Corresponding PDF Document
  let doc = null;
  let filename = '';

  if (type === 'statement' || type === 'pending_summary') {
    const invoices = Array.isArray(customer?.items) && customer.items.length > 0 ? customer.items : (sale ? [sale] : [primaryInvoice]);
    // [FIX B1] All generate*PDFDoc functions are async (they lazy-load jsPDF). Must await them.
    doc = await generateStatementPDFDoc(customer, invoices, shop);
    filename = `Statement_${custName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  } else if (type === 'ledger') {
    const invoices = Array.isArray(customer?.items) && customer.items.length > 0 ? customer.items : (sale ? [sale] : [primaryInvoice]);
    // [FIX B1] Must await — generateLedgerPDFDoc is also async.
    doc = await generateLedgerPDFDoc(customer, invoices, [], shop);
    filename = `Ledger_${custName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
  } else if (type !== 'reminder_only' && type !== 'invoice_reminder_only' && type !== 'pending_reminder_only') {
    // [FIX B1] Must await — generateInvoicePDFDoc is also async.
    doc = await generateInvoicePDFDoc(primaryInvoice, customer, shop);
    filename = `Invoice_${invNo}_${custName.replace(/\s+/g, '_')}.pdf`;
  }

  // 4. Encode message payload and construct Native WhatsApp URL
  const encodedMessage = encodeURIComponent(message);
  const nativeWaUrl = `whatsapp://send?phone=${cleanMobile}&text=${encodedMessage}`;

  // 5. Handle File Generation and Native Sharing or WhatsApp Web/Desktop Trigger
  try {
    if (doc) {
      const pdfBlob = doc.output('blob');
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        try {
          if (showToast) showToast('📎 Attaching invoice... Click WhatsApp in the share window');
          await navigator.share({
            files: [pdfFile],
            title: isSingle ? `Invoice ${invNo}` : `Statement - ${custName}`,
            text: message,
          });
          if (authedFetch) {
            authedFetch('/audit', {
              method: 'POST',
              body: JSON.stringify({
                action: `Shared ${type} via Native Share`,
                entity_type: 'customer',
                entity_id: customer?.customer_id || customer?.id || sale?.customer_id || 0,
                details: `${invNo} to ${cleanMobile}`,
              }),
            }).catch(() => {});
          }
          return;
        } catch (err) {
          if (err.name === 'AbortError') {
            return;
          }
          console.warn('Native mobile share failed, proceeding with fallback download:', err);
        }
      }

      // Desktop PC / Direct WhatsApp Web Route (Zero Storage & Zero Local Downloads):
      if (showToast) {
        showToast(`Opening WhatsApp for ${cleanMobile}...`);
      }
    }

    // Auto copy text to clipboard for convenience
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(message);
      }
    } catch {}

    // 6. Direct routing to native WhatsApp application without spawning blank tabs
    window.location.href = nativeWaUrl;

    if (authedFetch) {
      authedFetch('/audit', {
        method: 'POST',
        body: JSON.stringify({
          action: `Shared ${type}`,
          entity_type: 'customer',
          entity_id: customer?.customer_id || customer?.id || sale?.customer_id || 0,
          details: `${invNo} (Rs. ${totalPending}) to ${cleanMobile}`,
        }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Share execution failed:', err);
    if (showToast) showToast('Share failed: ' + (err.message || 'Unknown error'));
  }
};
