/**
 * Central Stock Thresholds & Stock Level Evaluation Utilities
 *
 * Rules:
 * - Out of Stock: totalStock === 0 (Flagged as Out of Stock)
 * - Low Stock: totalStock > 0 && totalStock <= 4 (Flagged as Low Stock)
 * - Healthy / In Stock: totalStock >= 5 (Excluded from /low-stock, normal stock badge)
 */

export const LOW_STOCK_THRESHOLD = 4;

/**
 * Check if a given stock quantity is 0 (Out of Stock).
 * @param {number|string} quantity
 * @returns {boolean}
 */
export function isOutOfStock(quantity) {
  const num = Number(quantity);
  return isNaN(num) || num <= 0;
}

/**
 * Check if a given stock quantity is Low Stock (1 to 4 pcs).
 * @param {number|string} quantity
 * @param {number} [threshold=LOW_STOCK_THRESHOLD]
 * @returns {boolean}
 */
export function isLowStock(quantity, threshold = LOW_STOCK_THRESHOLD) {
  const num = Number(quantity);
  return !isNaN(num) && num > 0 && num <= threshold;
}

/**
 * Check if a given stock quantity is In Stock / Healthy (>= 5 pcs).
 * @param {number|string} quantity
 * @param {number} [threshold=LOW_STOCK_THRESHOLD]
 * @returns {boolean}
 */
export function isInStock(quantity, threshold = LOW_STOCK_THRESHOLD) {
  const num = Number(quantity);
  return !isNaN(num) && num > threshold;
}

/**
 * Check if a given stock quantity should trigger an alert (<= 4 pcs, both 0 and 1-4 pcs).
 * @param {number|string} quantity
 * @param {number} [threshold=LOW_STOCK_THRESHOLD]
 * @returns {boolean}
 */
export function isAlertStock(quantity, threshold = LOW_STOCK_THRESHOLD) {
  const num = Number(quantity);
  return isNaN(num) || num <= threshold;
}

/**
 * Returns standardized stock status string.
 * @param {number|string} quantity
 * @param {number} [threshold=LOW_STOCK_THRESHOLD]
 * @returns {'out_of_stock' | 'low_stock' | 'in_stock'}
 */
export function getStockStatus(quantity, threshold = LOW_STOCK_THRESHOLD) {
  const num = Number(quantity);
  if (isNaN(num) || num <= 0) return 'out_of_stock';
  if (num <= threshold) return 'low_stock';
  return 'in_stock';
}

/**
 * Multi-source stock aggregator that safely computes stock from direct fields,
 * batches, or colour_stock without dropping 0-stock items.
 *
 * @param {Object} item
 * @returns {number}
 */
export function computeProductStock(item) {
  if (item == null) return 0;
  
  // 1. Direct explicit zero or positive numbers
  if (typeof item.warehouse_stock === 'number') return Math.max(0, item.warehouse_stock);
  if (typeof item.available_stock === 'number') return Math.max(0, item.available_stock);
  if (typeof item.quantity === 'number') return Math.max(0, item.quantity);
  if (typeof item.stock_quantity === 'number') return Math.max(0, item.stock_quantity);
  if (typeof item.total_stock === 'number') return Math.max(0, item.total_stock);
  if (typeof item.stock === 'number') return Math.max(0, item.stock);

  // 2. If explicit batches array exists and has entries, sum their stock quantities
  if (Array.isArray(item.batches) && item.batches.length > 0) {
    return item.batches.reduce(
      (sum, b) => sum + (Number(b.stock_qty ?? b.quantity_remaining ?? b.quantity ?? b.stock) || 0),
      0
    );
  }
  if (Array.isArray(item.supplier_batches) && item.supplier_batches.length > 0) {
    return item.supplier_batches.reduce(
      (sum, b) => sum + (Number(b.stock_qty ?? b.quantity_remaining ?? b.quantity ?? b.stock) || 0),
      0
    );
  }

  // 3. If colour_stock breakdown exists, sum its values
  if (item.colour_stock && typeof item.colour_stock === 'object' && Object.keys(item.colour_stock).length > 0) {
    return Object.values(item.colour_stock).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }

  // 4. Fallback to direct stock / quantity properties (strings, null, undefined)
  const directQty =
    item.warehouse_stock ??
    item.available_stock ??
    item.quantity ??
    item.available_quantity ??
    item.stock_quantity ??
    item.total_stock ??
    item.total_available ??
    item.stock;

  if (directQty !== undefined && directQty !== null && directQty !== '') {
    const parsed = Number(directQty);
    return !isNaN(parsed) ? Math.max(0, parsed) : 0;
  }

  return 0;
}

/**
 * Get visual badge, styling, and label metadata for a given stock quantity.
 * @param {number|string} quantity
 * @param {number} [threshold=LOW_STOCK_THRESHOLD]
 */
export function getStockStatusDetails(quantity, threshold = LOW_STOCK_THRESHOLD) {
  const qty = Number(quantity) || 0;
  const status = getStockStatus(qty, threshold);

  if (status === 'out_of_stock') {
    return {
      status,
      label: 'Out of Stock (0 pcs)',
      shortLabel: 'Out of Stock',
      healthLabel: 'Out of Stock',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
      pillClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60',
      dotClass: 'bg-rose-600 animate-pulse',
      textColor: 'text-rose-600 dark:text-rose-400',
      progressBarColor: 'bg-rose-500',
      runoutDays: 0,
    };
  }

  if (status === 'low_stock') {
    return {
      status,
      label: `Low Stock (${qty} pcs)`,
      shortLabel: 'Low Stock',
      healthLabel: 'Low Stock Alert',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
      pillClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60',
      dotClass: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400',
      progressBarColor: 'bg-amber-500',
      runoutDays: Math.max(1, Math.round(qty * 1.2)),
    };
  }

  return {
    status,
    label: `In Stock (${qty} pcs)`,
    shortLabel: 'In Stock',
    healthLabel: 'Healthy Stock',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60',
    dotClass: 'bg-emerald-500',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    progressBarColor: 'bg-emerald-500',
    runoutDays: Math.max(7, Math.round(qty * 1.8)),
  };
}
