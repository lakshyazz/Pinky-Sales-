import { allRecords, getRecord } from '../database.js';

async function test() {
  try {
    const warehouse = await getRecord("SELECT id FROM shops WHERE location_type = 'warehouse' LIMIT 1");
    const warehouseId = warehouse?.id || null;

    const requests = await allRecords(`
      SELECT 
        sr.id, sr.request_number, sr.shop_id, sr.product_id, sr.model_name, sr.quantity,
        sr.total_items, sr.total_quantity, sr.message, sr.notes, sr.rejection_reason,
        sr.created_by, sr.status, sr.approved_by, sr.approved_at, sr.created_at, sr.updated_at,
        sr.resolved_at,
        sh.name AS shop_name, sh.area AS shop_area,
        u.name AS created_by_name,
        approver.name AS approved_by_name
      FROM stock_requests sr
      JOIN shops sh ON sh.id = sr.shop_id
      LEFT JOIN users u ON u.id = sr.created_by
      LEFT JOIN users approver ON approver.id = sr.approved_by
      ORDER BY sr.id DESC
    `);

    console.log('Stock requests count:', requests.length);

    if (requests.length > 0) {
      const requestIds = requests.map(r => r.id);
      const items = await allRecords(`
        SELECT 
          sri.*,
          p.short_name AS product_short_name,
          p.image_url,
          p.sale_price,
          p.wholesale_price,
          COALESCE((SELECT SUM(ib.quantity_remaining) FROM inventory_batches ib WHERE ib.product_id = sri.product_id AND ib.shop_id = ?), 0) AS warehouse_stock
        FROM stock_request_items sri
        LEFT JOIN products p ON p.id = sri.product_id
        WHERE sri.request_id IN (${requestIds.map(() => '?').join(', ')})
        ORDER BY sri.id ASC
      `, [warehouseId, ...requestIds]);

      console.log('Items loaded count:', items.length);
    }
  } catch (err) {
    console.error('Test requests error:', err);
  }
  process.exit(0);
}

test();
