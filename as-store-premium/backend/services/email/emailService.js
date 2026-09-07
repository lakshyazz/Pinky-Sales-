import { sendWithRetry } from './resendClient.js';
import { shouldSendLowStockAlert, logEmailAttempt } from './alertThrottler.js';
import { buildInwardStockExcelBuffer } from './excel/inwardStockReportBuilder.js';
import { renderOrderInvoiceHtml } from './templates/orderInvoiceTemplate.js';
import { renderLowStockAlertHtml } from './templates/lowStockAlertTemplate.js';
import { renderStockAddedHtml } from './templates/stockAddedTemplate.js';
import { renderInwardStockReportEmailHtml } from './templates/inwardStockReportEmailTemplate.js';
import { renderDailyReportHtml } from './templates/dailyReportTemplate.js';
import { allRecords, getRecord } from '../../database.js';

const ADMIN_EMAIL = process.env.EMAIL_ADMIN || 'admin@yourdomain.com';

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Kolkata timezone.
 */
export function getTodayDateIST() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
  return formatter.format(now);
}

/**
 * 1. Send Order Confirmation & Invoice Email to Customer.
 *
 * @param {Object} orderData - Invoice and sale line-item details
 * @param {string} recipientEmail - Customer email address
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
export async function sendOrderInvoiceEmail(orderData, recipientEmail) {
  if (!recipientEmail || !recipientEmail.includes('@')) {
    console.log(`[EmailService] Order invoice skipped: Invalid/missing email for Order #${orderData.orderId}`);
    return { success: false, error: 'No recipient email provided.' };
  }

  const invoiceNumber = orderData.invoiceNumber || `INV-${String(orderData.orderId).padStart(6, '0')}`;
  const html = renderOrderInvoiceHtml(orderData);

  const result = await sendWithRetry({
    to: recipientEmail,
    subject: `Your Invoice from AS Store - ${invoiceNumber}`,
    html,
  });

  await logEmailAttempt({
    recipient: recipientEmail,
    emailType: 'order_invoice',
    referenceId: orderData.orderId,
    resendId: result.id,
    status: result.success ? 'sent' : 'failed',
    errorMessage: result.error,
    metadata: { invoiceNumber, totalAmount: orderData.totalAmount },
  });

  return result;
}

/**
 * 2. Evaluate Stock Level and Send Low-Stock Admin Alert with Cooldown Protection.
 *
 * @param {Object} params
 * @param {number|string} params.productId
 * @param {number|string} [params.shopId]
 * @returns {Promise<{ success: boolean, skipped?: boolean, error?: string }>}
 */
export async function sendLowStockAlertEmail({ productId, shopId = null }) {
  try {
    const query = `
      SELECT 
        p.id, 
        p.name, 
        p.brand, 
        COALESCE(s.quantity, 0) AS current_stock,
        COALESCE(sh.low_stock_threshold, 5) AS min_threshold,
        sh.name AS shop_name
      FROM products p
      LEFT JOIN stock s ON s.product_id = p.id AND (s.shop_id = $2 OR $2 IS NULL)
      LEFT JOIN shops sh ON sh.id = s.shop_id
      WHERE p.id = $1
      LIMIT 1
    `;
    const record = await getRecord(query, [productId, shopId]);
    if (!record) return { success: false, error: 'Product not found.' };

    const remainingStock = Number(record.current_stock);
    const minThreshold = Number(record.min_threshold);

    // Only alert if inventory has dropped to or below safe threshold
    if (remainingStock <= minThreshold) {
      // Check 12-hour cooldown flag to prevent repeated alerts on back-to-back sales
      const canSend = await shouldSendLowStockAlert(productId, 12);
      if (!canSend) {
        console.log(`[EmailService] Low stock alert suppressed (cooldown active) for product #${productId} (${record.name})`);
        return { success: true, skipped: true, reason: 'Cooldown active' };
      }

      const html = renderLowStockAlertHtml({
        productName: record.name,
        brand: record.brand,
        shopName: record.shop_name,
        remainingStock,
        minThreshold,
      });

      const result = await sendWithRetry({
        to: ADMIN_EMAIL,
        subject: `⚠️ URGENT: Low Stock Alert - ${record.name} (${remainingStock} units remaining)`,
        html,
      });

      await logEmailAttempt({
        recipient: ADMIN_EMAIL,
        emailType: 'low_stock',
        referenceId: productId,
        resendId: result.id,
        status: result.success ? 'sent' : 'failed',
        errorMessage: result.error,
        metadata: { productName: record.name, remainingStock, minThreshold },
      });

      return result;
    }

    return { success: true, skipped: true, reason: 'Stock is above threshold' };
  } catch (err) {
    console.error(`[EmailService] Failed to check low stock for product #${productId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * 3. Real-Time Inward Stock / Restock Notification.
 *
 * @param {Object} inwardData
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
export async function sendStockAddedAlert(inwardData) {
  try {
    const html = renderStockAddedHtml(inwardData);
    const result = await sendWithRetry({
      to: ADMIN_EMAIL,
      subject: `📦 Inward Stock Added: +${inwardData.quantityAdded} ${inwardData.productName}`,
      html,
    });

    await logEmailAttempt({
      recipient: ADMIN_EMAIL,
      emailType: 'stock_added',
      referenceId: inwardData.batchId || inwardData.productName,
      resendId: result.id,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
      metadata: inwardData,
    });

    return result;
  } catch (err) {
    console.error('[EmailService] Failed to dispatch inward stock alert:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 4. Scheduled Daily Stocks & Products Report (10:00 PM IST Cron).
 * Fetches all inventory stock batches & products added or updated during the day (00:00:00 to 22:00:00 IST),
 * builds an Excel file in-memory with ExcelJS, and sends it as an attachment.
 *
 * @param {Object} [options]
 * @param {string} [options.targetDate] - Target date YYYY-MM-DD (defaults to today in IST)
 * @param {boolean} [options.sendIfEmpty=true] - Whether to send a notification when 0 items were inwarded
 * @returns {Promise<{ success: boolean, rowsCount: number, error?: string }>}
 */
export async function sendDailyInwardStockReport({
  targetDate = getTodayDateIST(),
  sendIfEmpty = process.env.EMAIL_SEND_EMPTY_REPORTS !== 'false',
} = {}) {
  try {
    console.log(`[EmailService] Generating 10:00 PM IST Master Product & Stock Report for date: ${targetDate}...`);

    // Fetch ALL active products in the database with their current stock levels, brands, suppliers, prices, and stock added today
    const sql = `
      SELECT 
        p.id, 
        p.name AS product_name, 
        COALESCE(mb.name, p.brand, '') AS brand, 
        COALESCE(sup.name, 'Direct / General') AS supplier_name, 
        COALESCE(array_to_string(p.colours, ', '), 'Default') AS colour, 
        COALESCE(SUM(s.quantity), 0) AS current_total_stock, 
        COALESCE(p.purchase_price, 0) AS purchase_price, 
        COALESCE(p.wholesale_price, 0) AS wholesale_price, 
        COALESCE(p.retail_price, p.sale_price, 0) AS retail_price,
        COALESCE(today_inward.qty_today, 0) AS qty_added_today,
        CASE 
          WHEN COALESCE(SUM(s.quantity), 0) <= 0 THEN 'Out of Stock' 
          WHEN COALESCE(SUM(s.quantity), 0) <= 5 THEN 'Low Stock' 
          ELSE 'In Stock' 
        END AS stock_status
      FROM products p 
      LEFT JOIN manufacturing_brands mb ON mb.id = p.manufacturing_brand_id 
      LEFT JOIN suppliers sup ON sup.id = p.supplier_id 
      LEFT JOIN stock s ON s.product_id = p.id 
      LEFT JOIN (
        SELECT product_id, SUM(quantity_received) AS qty_today
        FROM inventory_batches
        WHERE received_date = $1::date 
           OR (created_at >= ($1::date AT TIME ZONE 'Asia/Kolkata') AND created_at <= (($1::date + time '22:00:00') AT TIME ZONE 'Asia/Kolkata'))
        GROUP BY product_id
      ) today_inward ON today_inward.product_id = p.id
      WHERE p.is_active = 1 
      GROUP BY p.id, mb.name, sup.name, today_inward.qty_today
      ORDER BY p.name ASC
    `;

    const rows = await allRecords(sql, [targetDate]);
    const isEmpty = rows.length === 0;

    if (isEmpty && !sendIfEmpty) {
      console.log(`[EmailService] Master Product Report: 0 products found. Skipping email.`);
      await logEmailAttempt({
        recipient: ADMIN_EMAIL,
        emailType: 'inward_stock_report',
        referenceId: targetDate,
        status: 'skipped',
        metadata: { reason: 'No products in database', targetDate },
      });
      return { success: true, rowsCount: 0, skipped: true };
    }

    // Calculate executive summary metrics across all products
    const totalProducts = rows.length;
    const totalInStockUnits = rows.reduce((acc, r) => acc + Number(r.current_total_stock || 0), 0);
    const totalAddedToday = rows.reduce((acc, r) => acc + Number(r.qty_added_today || 0), 0);
    const totalValuation = rows.reduce((acc, r) => acc + Number(r.current_total_stock || 0) * Number(r.purchase_price || 0), 0);

    const attachmentFilename = `Master_Product_Stock_Report_${targetDate}.xlsx`;
    let attachments = [];

    if (!isEmpty) {
      const excelBuffer = await buildInwardStockExcelBuffer(rows, targetDate);
      attachments = [
        {
          filename: attachmentFilename,
          content: excelBuffer,
        },
      ];
    }

    const html = renderInwardStockReportEmailHtml({
      reportDate: targetDate,
      totalProductsCount: totalProducts,
      totalInStockUnits,
      totalQuantityInward: totalAddedToday,
      totalValuation,
      attachmentFilename,
      isEmpty,
    });

    const subject = `📋 Master Product & Stock Report - ${targetDate} (${totalProducts} Products, ${totalInStockUnits} Units)`;

    const result = await sendWithRetry({
      to: ADMIN_EMAIL,
      subject,
      html,
      attachments,
    });

    await logEmailAttempt({
      recipient: ADMIN_EMAIL,
      emailType: 'inward_stock_report',
      referenceId: targetDate,
      resendId: result.id,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
      metadata: { targetDate, totalProducts, totalInStockUnits, totalAddedToday, totalValuation },
    });

    return { success: result.success, rowsCount: rows.length, error: result.error };
  } catch (err) {
    console.error('[EmailService] Failed to execute 10:00 PM Master Product Report:', err);
    return { success: false, rowsCount: 0, error: err.message };
  }
}

/**
 * 5. End-of-Day Performance Digest (23:59 IST Cron).
 * Summarizes sales, order counts, inward volume, top sellers, and critical stock.
 *
 * @param {Object} [options]
 * @param {string} [options.targetDate]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function generateAndSendDailyReport({ targetDate = getTodayDateIST() } = {}) {
  try {
    console.log(`[EmailService] Generating End-of-Day Performance Summary for: ${targetDate}...`);

    // 1. Sales & Revenue in current day
    const salesSummary = await getRecord(
      `SELECT 
         COUNT(id) AS total_orders,
         COALESCE(SUM(total_amount), 0) AS total_revenue
       FROM sales 
       WHERE sale_date = $1 OR created_at::date = $1::date`,
      [targetDate]
    );

    // 2. Top 5 selling products today
    const topSellers = await allRecords(
      `SELECT 
         COALESCE(p.name, si.custom_product_name, 'Product') AS name, 
         SUM(si.quantity) AS total_qty, 
         SUM(si.total_price) AS total_revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE (s.sale_date = $1 OR s.created_at::date = $1::date)
       GROUP BY COALESCE(p.name, si.custom_product_name, 'Product')
       ORDER BY total_qty DESC
       LIMIT 5`,
      [targetDate]
    );

    // 3. Inward Stock Received Today
    const stockInward = await getRecord(
      `SELECT COALESCE(SUM(quantity_received), 0) AS total_inward
       FROM inventory_batches
       WHERE received_date = $1::date OR created_at::date = $1::date`,
      [targetDate]
    );

    // 4. Critical Stock items currently below threshold
    const lowStockItems = await allRecords(
      `SELECT 
         p.name, 
         s.quantity AS current_qty,
         sh.name AS shop_name
       FROM products p
       JOIN stock s ON s.product_id = p.id
       JOIN shops sh ON sh.id = s.shop_id
       WHERE s.quantity <= COALESCE(sh.low_stock_threshold, 5)
       ORDER BY s.quantity ASC
       LIMIT 10`
    );

    const html = renderDailyReportHtml({
      reportDate: targetDate,
      totalSalesRevenue: Number(salesSummary?.total_revenue || 0),
      totalOrders: Number(salesSummary?.total_orders || 0),
      totalStockInward: Number(stockInward?.total_inward || 0),
      topSellingProducts: topSellers || [],
      lowStockList: lowStockItems || [],
    });

    const result = await sendWithRetry({
      to: ADMIN_EMAIL,
      subject: `📈 End-of-Day Store Summary: ${targetDate} (₹${Number(salesSummary?.total_revenue || 0).toFixed(2)})`,
      html,
    });

    await logEmailAttempt({
      recipient: ADMIN_EMAIL,
      emailType: 'daily_report',
      referenceId: targetDate,
      resendId: result.id,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
      metadata: { targetDate, revenue: salesSummary?.total_revenue, orders: salesSummary?.total_orders },
    });

    return result;
  } catch (err) {
    console.error('[EmailService] Failed to generate End-of-Day summary:', err);
    return { success: false, error: err.message };
  }
}
