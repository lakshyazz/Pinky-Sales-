import { runTransaction, allRecords, getRecord } from '../database.js';

async function consolidateNeerajbhaiInvoices() {
  console.log('=== Starting Option B Consolidation for NEERAJBHAI ===');

  const result = await runTransaction(async (tx) => {
    // 1. Fetch all 7 legacy sales rows for Neerajbhai
    const salesRows = await tx.allRecords(`
      SELECT sa.*, p.name AS product_name, p.sale_price AS prod_sale_price
      FROM sales sa
      LEFT JOIN products p ON p.id = sa.product_id
      WHERE sa.customer_id = 3 OR sa.id IN (3, 4, 5, 6, 7, 8, 9)
      ORDER BY sa.id ASC
    `);

    console.log(`Found ${salesRows.length} legacy sales rows to consolidate.`);

    if (salesRows.length === 0) {
      console.log('No legacy rows found.');
      return;
    }

    const masterSale = salesRows[0]; // ID 3
    const masterSaleId = masterSale.id;
    console.log(`Master Sale ID: ${masterSaleId} (${masterSale.invoice_number || 'INV-000003'})`);

    // Calculate aggregated totals
    let totalQty = 0;
    let grandTotal = 0;
    let totalPaid = 0;

    // Clear any existing sale_items for masterSaleId just in case
    await tx.runQuery('DELETE FROM sale_items WHERE sale_id = ?', [masterSaleId]);

    // 2. Insert each product as a row in sale_items linked to masterSaleId
    for (const row of salesRows) {
      const qty = Number(row.quantity || 1);
      const rowTotal = Number(row.total_amount || 0);
      const unitPrice = qty > 0 ? (rowTotal / qty) : rowTotal;
      const rowPaid = Number(row.paid_amount || 0);

      totalQty += qty;
      grandTotal += rowTotal;
      totalPaid += rowPaid;

      await tx.runQuery(`
        INSERT INTO sale_items (
          sale_id, product_id, quantity, unit_price, total_price, price_type, colour
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        masterSaleId,
        row.product_id,
        qty,
        unitPrice,
        rowTotal,
        row.price_type || 'retail',
        row.colour || null
      ]);

      console.log(`Inserted into sale_items: ${row.product_name || 'Product ' + row.product_id} | Qty: ${qty} | Total: Rs. ${rowTotal}`);
    }

    const totalPending = Math.max(0, grandTotal - totalPaid);

    // 3. Migrate any payments from duplicate sales (4..9) to masterSaleId
    const otherSaleIds = salesRows.slice(1).map(s => s.id);
    if (otherSaleIds.length > 0) {
      const placeholders = otherSaleIds.map(() => '?').join(', ');
      await tx.runQuery(`UPDATE payments SET sale_id = ? WHERE sale_id IN (${placeholders})`, [masterSaleId, ...otherSaleIds]);
      await tx.runQuery(`UPDATE sale_batch_allocations SET sale_id = ? WHERE sale_id IN (${placeholders})`, [masterSaleId, ...otherSaleIds]);
      await tx.runQuery(`UPDATE sale_expenses SET sale_id = ? WHERE sale_id IN (${placeholders})`, [masterSaleId, ...otherSaleIds]);

      // 4. Delete the duplicate header rows
      await tx.runQuery(`DELETE FROM sales WHERE id IN (${placeholders})`, otherSaleIds);
      console.log(`Deleted redundant duplicate header rows: ${otherSaleIds.join(', ')}`);
    }

    // 5. Update masterSale header with consolidated totals
    await tx.runQuery(`
      UPDATE sales SET
        quantity = ?,
        total_amount = ?,
        paid_amount = ?,
        pending_amount = ?,
        products_total = ?,
        original_amount = ?,
        status = ?,
        invoice_date = '2026-08-27'
      WHERE id = ?
    `, [
      totalQty,
      grandTotal,
      totalPaid,
      totalPending,
      grandTotal,
      grandTotal,
      totalPending > 0 ? 'open' : 'paid',
      masterSaleId
    ]);

    console.log(`Updated Master Sale ${masterSaleId}: Total = Rs. ${grandTotal}, Paid = Rs. ${totalPaid}, Pending = Rs. ${totalPending}, Total Qty = ${totalQty}`);
    return { masterSaleId, grandTotal, totalPaid, totalPending, totalQty };
  });

  console.log('=== Migration Complete ===', result);
  process.exit(0);
}

consolidateNeerajbhaiInvoices().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
