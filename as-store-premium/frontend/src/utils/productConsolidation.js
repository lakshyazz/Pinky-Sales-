/**
 * Product Consolidation & Weighted Average Cost Price Utilities
 * Consolidates identical products from different suppliers into a unified representation.
 */

/**
 * Computes unique key for product grouping.
 * Key matches: Brand + Part Category + Model (normalized) + Quality Variant (+ Manufacturing Brand if present)
 */
export function getProductGroupKey(product) {
  if (!product) return '';
  const brand = String(product.brand || product.company_brand_name || '').trim().toLowerCase();
  const cat = String(product.part_category || product.category || product.part_category_name || '').trim().toLowerCase();
  const model = String(product.model || product.display_model || product.full_model_list || product.short_name || '').trim().toLowerCase();
  const variant = String(product.quality_variant || product.product_variant_name || '').trim().toLowerCase();
  const mfg = String(product.manufacturing_brand_id || product.manufacturing_brand_name || '').trim().toLowerCase();
  return `${brand}___${cat}___${model}___${variant}___${mfg}`;
}

/**
 * Calculates weighted average cost price and supplier breakdown for a product or group of products.
 * 
 * Formula:
 * Avg Cost = Sum(Supplier Cost Price * Supplier Stock Quantity) / Total Combined Stock
 */
export function calculateConsolidatedProduct(products) {
  const group = Array.isArray(products) ? products : [products];
  if (!group.length || !group[0]) return null;

  const primary = group[0];

  // Consolidate supplier batches from all products in the group
  let allBatches = [];
  let totalStock = 0;
  let warehouseStock = 0;
  let colourStock = {};

  group.forEach((prod) => {
    const prodStock = Number(prod.warehouse_stock ?? prod.available_stock ?? prod.stock_quantity ?? prod.quantity ?? prod.stock ?? 0);
    totalStock += prodStock;
    warehouseStock += Number(prod.warehouse_stock || prodStock);

    // Merge colour stock
    if (prod.colour_stock && typeof prod.colour_stock === 'object') {
      Object.entries(prod.colour_stock).forEach(([col, q]) => {
        colourStock[col] = (colourStock[col] || 0) + Number(q || 0);
      });
    }

    // Extract supplier batches
    if (Array.isArray(prod.supplier_batches) && prod.supplier_batches.length > 0) {
      prod.supplier_batches.forEach((batch) => {
        allBatches.push({
          batch_id: batch.batch_id || batch.id,
          supplier_id: batch.supplier_id || prod.supplier_id,
          supplier_name: batch.supplier_name || prod.supplier_name || 'Direct Intake',
          purchase_price: Number(batch.purchase_price ?? prod.purchase_price ?? 0),
          quantity: Number(batch.quantity ?? batch.quantity_remaining ?? 0),
          quantity_received: Number(batch.quantity_received ?? 0),
          received_date: batch.received_date || prod.updated_at || null,
          notes: batch.notes || null,
          colour: batch.colour || null,
        });
      });
    } else {
      // Create a virtual batch for the product if it has a supplier or stock
      const purchasePrice = Number(prod.purchase_price || prod.cost_price || 0);
      const supplierName = prod.supplier_name || (prod.supplier_id ? `Supplier #${prod.supplier_id}` : 'Direct Stock');
      allBatches.push({
        batch_id: prod.id,
        supplier_id: prod.supplier_id,
        supplier_name: supplierName,
        purchase_price: purchasePrice,
        quantity: prodStock,
        quantity_received: prodStock,
        received_date: prod.updated_at || prod.created_at || null,
        notes: prod.description || null,
      });
    }
  });

  // Group and aggregate batches by supplier & purchase_price
  const supplierSummaryMap = new Map();
  let totalWeightedCostValue = 0;
  let totalStockWithCost = 0;
  let directPriceSum = 0;
  let directPriceCount = 0;

  allBatches.forEach((batch) => {
    const cost = Number(batch.purchase_price || 0);
    const qty = Number(batch.quantity || 0);
    const supName = String(batch.supplier_name || 'Direct Stock').trim();
    const supKey = `${supName}___${cost}`;

    if (qty > 0 && cost > 0) {
      totalWeightedCostValue += cost * qty;
      totalStockWithCost += qty;
    }
    if (cost > 0) {
      directPriceSum += cost;
      directPriceCount++;
    }

    if (supplierSummaryMap.has(supKey)) {
      const existing = supplierSummaryMap.get(supKey);
      existing.quantity += qty;
      if (batch.received_date && (!existing.received_date || new Date(batch.received_date) > new Date(existing.received_date))) {
        existing.received_date = batch.received_date;
      }
    } else {
      supplierSummaryMap.set(supKey, {
        supplier_id: batch.supplier_id,
        supplier_name: supName,
        purchase_price: cost,
        quantity: qty,
        received_date: batch.received_date,
        notes: batch.notes,
      });
    }
  });

  const supplierBreakdown = Array.from(supplierSummaryMap.values()).sort((a, b) => b.quantity - a.quantity);

  // Weighted Average Cost Price Calculation:
  // Avg Cost = Sum(Supplier Cost Price * Supplier Stock Quantity) / Total Combined Stock
  let avgCostPrice = 0;
  let calculationMode = 'weighted';
  if (totalStockWithCost > 0) {
    avgCostPrice = totalWeightedCostValue / totalStockWithCost;
    calculationMode = 'weighted';
  } else if (directPriceCount > 0) {
    avgCostPrice = directPriceSum / directPriceCount;
    calculationMode = 'simple_average';
  } else {
    avgCostPrice = Number(primary.purchase_price || primary.avg_cost_price || 0);
    calculationMode = 'fallback';
  }

  avgCostPrice = Math.round(avgCostPrice * 100) / 100;

  const retailPrice = Number(primary.sale_price || primary.retail_price || 0);
  const wholesalePrice = Number(primary.wholesale_price || 0);
  const profitAmount = avgCostPrice > 0 && retailPrice > avgCostPrice ? retailPrice - avgCostPrice : 0;
  const profitMargin = avgCostPrice > 0 && retailPrice > avgCostPrice
    ? Math.round(((retailPrice - avgCostPrice) / avgCostPrice) * 100)
    : null;

  // Extract unique supplier names
  const associatedSuppliers = Array.from(
    new Set(
      supplierBreakdown
        .map((s) => s.supplier_name)
        .filter((name) => name && name !== 'Direct Stock' && name !== 'Direct Intake')
    )
  );

  return {
    ...primary,
    _is_consolidated: group.length > 1,
    _consolidated_product_ids: group.map((p) => p.id),
    _consolidated_count: group.length,
    available_stock: totalStock,
    warehouse_stock: warehouseStock,
    quantity: totalStock,
    stock_quantity: totalStock,
    stock: totalStock,
    total_stock: totalStock,
    colour_stock: colourStock,
    avg_cost_price: avgCostPrice,
    purchase_price: avgCostPrice, // Use weighted average cost price across cards & tables
    profit_amount: profitAmount,
    profit_margin: profitMargin,
    supplier_batches: allBatches,
    supplier_breakdown: supplierBreakdown,
    associated_suppliers: associatedSuppliers,
    cost_calculation_mode: calculationMode,
    total_cost_value: totalWeightedCostValue,
    total_stock_with_cost: totalStockWithCost,
  };
}

/**
 * Consolidates an array of products by matching Brand, Part Category, Model, and Quality Variant.
 */
export function consolidateProductList(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const groups = new Map();

  items.forEach((item) => {
    const key = getProductGroupKey(item);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  });

  return Array.from(groups.values()).map((group) => calculateConsolidatedProduct(group));
}
