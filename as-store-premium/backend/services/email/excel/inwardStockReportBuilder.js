import ExcelJS from 'exceljs';

/**
 * Builds a styled, professional Excel workbook in memory for all Products & Stock Inventory.
 *
 * @param {Array<Object>} rows - Array of all product inventory records
 * @param {string} reportDate - Date string (YYYY-MM-DD)
 * @returns {Promise<Buffer>} - Resolves with binary Buffer of the generated .xlsx file
 */
export async function buildInwardStockExcelBuffer(rows, reportDate) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AS Store Premium Automation';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Master Product & Stock Report', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  // 1. Title Banner Row
  worksheet.mergeCells('A1:K1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `AS STORE PREMIUM - COMPLETE PRODUCT & INVENTORY REPORT (${reportDate})`;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' }, // Slate 900
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 36;

  // 2. Define Columns
  worksheet.columns = [
    { header: 'Product Name / Title', key: 'product_name', width: 34 },
    { header: 'Manufacturing Brand', key: 'brand', width: 22 },
    { header: 'Supplier / Vendor', key: 'supplier_name', width: 24 },
    { header: 'Color / Variant', key: 'colour', width: 18 },
    { header: 'Current Total Stock', key: 'current_stock', width: 18 },
    { header: 'Added Today', key: 'qty_added', width: 14 },
    { header: 'Purchase Cost (₹)', key: 'purchase_price', width: 18 },
    { header: 'Wholesale Price (₹)', key: 'wholesale_price', width: 18 },
    { header: 'Retail / MRP (₹)', key: 'retail_price', width: 18 },
    { header: 'Status', key: 'stock_status', width: 16 },
    { header: 'Stock Valuation (₹)', key: 'valuation', width: 20 },
  ];

  // 3. Style Table Headers (Row 2)
  const headerRow = worksheet.getRow(2);
  headerRow.values = [
    'Product Name / Title',
    'Manufacturing Brand',
    'Supplier / Vendor',
    'Color / Variant',
    'Current Total Stock',
    'Added Today',
    'Purchase Cost (₹)',
    'Wholesale Price (₹)',
    'Retail / MRP (₹)',
    'Status',
    'Stock Valuation (₹)',
  ];
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }, // Deep Navy Blue
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // 4. Populate Data Rows
  let totalStockUnits = 0;
  let totalAddedToday = 0;
  let totalInventoryValuation = 0;

  rows.forEach((row, idx) => {
    const currentStock = Number(row.current_total_stock ?? row.quantity_remaining ?? 0);
    const qtyAddedToday = Number(row.qty_added_today ?? row.quantity_added ?? row.quantity_received ?? 0);
    const purchase = Number(row.purchase_price || 0);
    const wholesale = Number(row.wholesale_price || 0);
    const retail = Number(row.retail_price || row.sale_price || 0);
    const valuation = currentStock * purchase;

    totalStockUnits += currentStock;
    totalAddedToday += qtyAddedToday;
    totalInventoryValuation += valuation;

    const status = row.stock_status || (currentStock <= 0 ? 'Out of Stock' : currentStock <= 5 ? 'Low Stock' : 'In Stock');

    const dataRow = worksheet.addRow({
      product_name: row.product_name || row.name || 'N/A',
      brand: row.brand || row.manufacturing_brand_name || '-',
      supplier_name: row.supplier_name || 'Direct / General',
      colour: row.colour || 'Default',
      current_stock: currentStock,
      qty_added: qtyAddedToday,
      purchase_price: purchase,
      wholesale_price: wholesale,
      retail_price: retail,
      stock_status: status,
      valuation: valuation,
    });

    dataRow.height = 22;

    // Alternating zebra row background
    const bgFill = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

    dataRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 9.5 };
      cell.border = thinBorder;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgFill },
      };

      // Column-specific formatting
      if (colNumber === 5 || colNumber === 6) {
        // Stock quantities
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
        if (colNumber === 5 && currentStock <= 0) {
          cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFDC2626' } }; // Red
        } else if (colNumber === 5 && currentStock <= 5) {
          cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFD97706' } }; // Amber
        }
      } else if (colNumber >= 7 && colNumber <= 9) {
        // Price columns
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '₹#,##0.00';
      } else if (colNumber === 10) {
        // Status column
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (status === 'Out of Stock') {
          cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
        } else if (status === 'Low Stock') {
          cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFD97706' } };
        } else {
          cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF16A34A' } };
        }
      } else if (colNumber === 11) {
        // Valuation
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '₹#,##0.00';
        cell.font = { name: 'Arial', size: 9.5, bold: true };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  // 5. Total Summary Row
  if (rows.length > 0) {
    const summaryRow = worksheet.addRow({
      product_name: `TOTAL: ${rows.length} PRODUCTS`,
      brand: '',
      supplier_name: '',
      colour: '',
      current_stock: totalStockUnits,
      qty_added: totalAddedToday,
      purchase_price: '',
      wholesale_price: '',
      retail_price: '',
      stock_status: '',
      valuation: totalInventoryValuation,
    });

    summaryRow.height = 28;
    summaryRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }, // Slate 200
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };

      if (colNumber === 5 || colNumber === 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
      } else if (colNumber === 11) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '₹#,##0.00';
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  }

  // 6. Dynamic Column Widths
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const length = cell.value ? String(cell.value).length : 0;
      if (length > maxLength) {
        maxLength = length;
      }
    });
    column.width = Math.max(maxLength + 4, 14);
  });

  worksheet.getColumn(1).width = Math.max(worksheet.getColumn(1).width || 0, 32);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
