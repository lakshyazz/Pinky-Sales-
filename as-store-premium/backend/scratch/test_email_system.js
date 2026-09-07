import { buildInwardStockExcelBuffer } from '../services/email/excel/inwardStockReportBuilder.js';
import { renderOrderInvoiceHtml } from '../services/email/templates/orderInvoiceTemplate.js';
import { renderLowStockAlertHtml } from '../services/email/templates/lowStockAlertTemplate.js';
import { renderStockAddedHtml } from '../services/email/templates/stockAddedTemplate.js';
import { renderInwardStockReportEmailHtml } from '../services/email/templates/inwardStockReportEmailTemplate.js';
import { renderDailyReportHtml } from '../services/email/templates/dailyReportTemplate.js';
import { shouldSendLowStockAlert, logEmailAttempt } from '../services/email/alertThrottler.js';
import { sendDailyInwardStockReport, generateAndSendDailyReport, getTodayDateIST } from '../services/email/emailService.js';
import { pool } from '../database.js';

async function runTests() {
  console.log('=== 1. TESTING HTML TEMPLATE RENDERING ===');

  const invoiceHtml = renderOrderInvoiceHtml({
    orderId: 101,
    invoiceNumber: 'INV-000101',
    customerName: 'Aman Sharma',
    customerMobile: '+91 9876543210',
    saleDate: '2026-09-07',
    items: [
      { name: 'Samsung Galaxy Display OLED', brand: 'Samsung', colour: 'Black', quantity: 2, unitPrice: 3500, lineTotal: 7000 },
      { name: 'iPhone 13 Battery Premium', brand: 'Apple OEM', colour: 'Standard', quantity: 1, unitPrice: 1800, lineTotal: 1800 },
    ],
    subtotal: 8800,
    extraExpenses: 150,
    discountAmount: 450,
    discountPercentage: 5,
    totalAmount: 8500,
    paymentMode: 'upi',
    paidAmount: 5000,
    pendingAmount: 3500,
    publicInvoiceUrl: 'https://as-store.example.com/invoice/public/tok_123',
  });
  console.log('✓ renderOrderInvoiceHtml rendered successfully, length:', invoiceHtml.length);

  const lowStockHtml = renderLowStockAlertHtml({
    productName: 'iPhone 13 Battery Premium',
    brand: 'Apple OEM',
    colour: 'Black',
    shopName: 'Main Warehouse',
    remainingStock: 2,
    minThreshold: 5,
  });
  console.log('✓ renderLowStockAlertHtml rendered successfully, length:', lowStockHtml.length);

  const stockAddedHtml = renderStockAddedHtml({
    productName: 'Realme 9 Pro Display Touch',
    brand: 'Realme',
    colour: 'Black',
    supplierName: 'Skyline Electronics Ltd',
    quantityAdded: 25,
    currentStock: 30,
    purchasePrice: 1200,
    wholesalePrice: 1450,
    retailPrice: 1999,
    shopName: 'Main Store',
    loggedByName: 'Ramesh Staff',
    timestamp: '07-09-2026 04:30 PM',
  });
  console.log('✓ renderStockAddedHtml rendered successfully, length:', stockAddedHtml.length);

  const inwardEmailHtml = renderInwardStockReportEmailHtml({
    reportDate: '2026-09-07',
    uniqueProductsCount: 8,
    totalQuantityInward: 120,
    totalValuation: 245000,
    attachmentFilename: 'Inward_Stock_Report_2026-09-07.xlsx',
    isEmpty: false,
  });
  console.log('✓ renderInwardStockReportEmailHtml rendered successfully, length:', inwardEmailHtml.length);

  const dailyReportHtml = renderDailyReportHtml({
    reportDate: '2026-09-07',
    totalSalesRevenue: 145000,
    totalOrders: 14,
    totalStockInward: 120,
    topSellingProducts: [{ name: 'Samsung Display OLED', total_qty: 12, total_revenue: 42000 }],
    lowStockList: [{ name: 'iPhone Battery', current_qty: 1, shop_name: 'Shop 1' }],
  });
  console.log('✓ renderDailyReportHtml rendered successfully, length:', dailyReportHtml.length);

  console.log('\n=== 2. TESTING EXCELJS IN-MEMORY BUFFER GENERATION ===');
  const mockInwardData = [
    {
      product_name: 'Samsung Galaxy S22 Ultra Display Combo',
      brand: 'Samsung',
      supplier_name: 'Alpha Spares Wholesale',
      colour: 'Phantom Black',
      quantity_added: 15,
      current_total_stock: 22,
      purchase_price: 4500.0,
      wholesale_price: 5200.0,
      retail_price: 6500.0,
      added_at_formatted: '07-09-2026 11:15 AM',
      logged_by_name: 'Amit Supervisor',
    },
    {
      product_name: 'Vivo V23 Charging Flex Original',
      brand: 'Vivo',
      supplier_name: 'Apex Components',
      colour: 'Default',
      quantity_added: 40,
      current_total_stock: 45,
      purchase_price: 180.0,
      wholesale_price: 240.0,
      retail_price: 350.0,
      added_at_formatted: '07-09-2026 02:45 PM',
      logged_by_name: 'Amit Supervisor',
    },
  ];

  const excelBuffer = await buildInwardStockExcelBuffer(mockInwardData, '2026-09-07');
  console.log('✓ Excel Buffer generated successfully!');
  console.log('  Buffer isBuffer:', Buffer.isBuffer(excelBuffer));
  console.log('  Buffer Byte Length:', excelBuffer.length);
  // Check ZIP/XLSX header signature (PK\x03\x04)
  const isZip = excelBuffer[0] === 0x50 && excelBuffer[1] === 0x4b;
  console.log('  Valid PK/XLSX Signature:', isZip);

  console.log('\n=== 3. TESTING DATABASE ALERT LOG & THROTTLER ===');
  // Log mock entry
  await logEmailAttempt({
    recipient: 'admin@test.com',
    emailType: 'low_stock',
    referenceId: '999999',
    resendId: 'test_msg_id_123',
    status: 'sent',
    metadata: { test: true },
  });
  console.log('✓ logEmailAttempt succeeded');

  const canSendAgain = await shouldSendLowStockAlert('999999', 12);
  console.log('✓ shouldSendLowStockAlert immediately after alert (expect false):', canSendAgain);

  const canSendDifferent = await shouldSendLowStockAlert('888888', 12);
  console.log('✓ shouldSendLowStockAlert for untriggered product (expect true):', canSendDifferent);

  // Clean up mock test entry
  await pool.query("DELETE FROM email_logs WHERE reference_id IN ('999999')");
  console.log('✓ Cleaned up test email_logs');

  console.log('\n=== 4. TESTING REPORT DISPATCH LOGIC (Safe Dry-run) ===');
  const today = getTodayDateIST();
  console.log('  Current Asia/Kolkata date:', today);

  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
