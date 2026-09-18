/**
 * sync_invoice_cogs.js — Recalculate & Repair Corrupted Invoice Line Item COGS
 *
 * Usage:
 *   node backend/scripts/sync_invoice_cogs.js               (Dry-run preview mode)
 *   node backend/scripts/sync_invoice_cogs.js --commit     (Commit changes to database)
 *   node backend/scripts/sync_invoice_cogs.js --saleId=132 (Check specific sale)
 *   node backend/scripts/sync_invoice_cogs.js --fromDate=2024-10-01 --toDate=2025-03-31
 *   node backend/scripts/sync_invoice_cogs.js --forceAll   (Sync all non-matching line item costs to master)
 */

import 'dotenv/config';
import { pool, allRecords, runTransaction } from '../database.js';

const money = (val) => Math.round(Number(val || 0) * 100) / 100;
const formatCurrency = (val) => `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Parse CLI flags
const args = process.argv.slice(2);
const isCommit = args.includes('--commit');
const forceAll = args.includes('--forceAll');
const saleIdArg = args.find((a) => a.startsWith('--saleId='))?.split('=')[1];
const fromDateArg = args.find((a) => a.startsWith('--fromDate='))?.split('=')[1];
const toDateArg = args.find((a) => a.startsWith('--toDate='))?.split('=')[1];
const thresholdArg = args.find((a) => a.startsWith('--threshold='))?.split('=')[1];
const threshold = thresholdArg ? parseFloat(thresholdArg) : 2.0;

async function run() {
  console.log('================================================================');
  console.log(`🔧 INVOICE COGS REPAIR & RE-SYNC TOOL`);
  console.log(`Mode: ${isCommit ? '🔴 COMMIT (Writing changes to database)' : '🟡 DRY RUN (Preview only, no changes written)'}`);
  if (saleIdArg) console.log(`Filter Sale ID: ${saleIdArg}`);
  if (fromDateArg || toDateArg) console.log(`Date Range: ${fromDateArg || 'Start'} -> ${toDateArg || 'End'}`);
  console.log(`Threshold: ${forceAll ? 'Force All Mismatches' : `Cost > Master x ${threshold} OR (Cost > Price & Master <= Price)`}`);
  console.log('================================================================\n');

  try {
    // 1. Fetch Candidate Sale Items
    const whereClauses = ['p.purchase_price > 0'];
    const params = [];

    if (saleIdArg) {
      whereClauses.push('si.sale_id = ?');
      params.push(Number(saleIdArg));
    }
    if (fromDateArg) {
      whereClauses.push('COALESCE(s.invoice_date::TEXT, s.sale_date) >= ?');
      params.push(fromDateArg);
    }
    if (toDateArg) {
      whereClauses.push('COALESCE(s.invoice_date::TEXT, s.sale_date) <= ?');
      params.push(toDateArg);
    }

    const query = `
      SELECT
        si.id AS item_id,
        si.sale_id,
        s.invoice_number,
        COALESCE(s.invoice_date::TEXT, s.sale_date) AS sale_date,
        s.total_amount AS invoice_total,
        c.name AS customer_name,
        p.id AS product_id,
        COALESCE(si.custom_product_name, p.short_name, p.name) AS product_name,
        COALESCE(p.model, '') AS model,
        si.quantity,
        si.unit_price,
        si.total_price,
        si.purchase_price AS old_unit_cost,
        p.purchase_price AS master_unit_cost
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY si.sale_id ASC, si.id ASC
    `;

    const allItems = await allRecords(query, params);

    // Filter discrepant items
    const corruptedItems = allItems.filter((item) => {
      const oldCost = Number(item.old_unit_cost || 0);
      const masterCost = Number(item.master_unit_cost || 0);
      const unitPrice = Number(item.unit_price || 0);

      if (forceAll) {
        return Math.abs(oldCost - masterCost) > 0.01;
      }

      // Check 1: Exceeds threshold multiple of master cost (e.g. 6333 vs 633)
      if (masterCost > 0 && oldCost >= masterCost * threshold) {
        return true;
      }

      // Check 2: Cost exceeds selling price, while master cost is <= selling price
      if (unitPrice > 0 && oldCost > unitPrice && masterCost <= unitPrice) {
        return true;
      }

      return false;
    });

    // 2. Fetch Corrupted Batches in inventory_batches
    const corruptedBatches = await allRecords(`
      SELECT
        ib.id AS batch_id,
        ib.product_id,
        p.name AS product_name,
        ib.purchase_price AS old_batch_cost,
        p.purchase_price AS master_cost,
        ib.quantity_remaining
      FROM inventory_batches ib
      JOIN products p ON p.id = ib.product_id
      WHERE ib.purchase_price >= p.purchase_price * 2.5 AND p.purchase_price > 0
      ORDER BY ib.id ASC
    `);

    console.log(`🔍 Scanned ${allItems.length} invoice items.`);
    console.log(`⚠️  Found ${corruptedItems.length} corrupted/discrepant invoice line items.`);
    console.log(`⚠️  Found ${corruptedBatches.length} corrupted inventory batches.\n`);

    if (corruptedItems.length === 0 && corruptedBatches.length === 0) {
      console.log('✅ All invoice line items and inventory batches have normal COGS! No repairs needed.');
      return;
    }

    // 3. Display Detailed Discrepancy Breakdown
    let totalProfitDelta = 0;
    const invoiceSummary = new Map();

    console.log('--- AFFECTED INVOICE LINE ITEMS ---');
    for (const it of corruptedItems) {
      const qty = Number(it.quantity || 0);
      const unitPrice = Number(it.unit_price || 0);
      const lineTotal = Number(it.total_price || (unitPrice * qty));
      const oldCost = Number(it.old_unit_cost || 0);
      const newCost = Number(it.master_unit_cost || 0);

      const oldLineCost = oldCost * qty;
      const newLineCost = newCost * qty;

      const oldLineProfit = lineTotal - oldLineCost;
      const newLineProfit = lineTotal - newLineCost;
      const delta = newLineProfit - oldLineProfit;
      totalProfitDelta += delta;

      if (!invoiceSummary.has(it.sale_id)) {
        invoiceSummary.set(it.sale_id, {
          sale_id: it.sale_id,
          invoice_number: it.invoice_number,
          sale_date: it.sale_date,
          customer_name: it.customer_name,
          items_count: 0,
          total_delta: 0,
        });
      }
      const inv = invoiceSummary.get(it.sale_id);
      inv.items_count += 1;
      inv.total_delta += delta;

      console.log(
        `[${it.invoice_number || `Sale #${it.sale_id}`}] (${it.sale_date}) Item #${it.item_id} - ${it.product_name} (${it.model}):\n` +
        `   Qty: ${qty} | Unit Price: ${formatCurrency(unitPrice)}\n` +
        `   Unit Cost:  ${formatCurrency(oldCost)} ➔ ${formatCurrency(newCost)}\n` +
        `   Line Profit: ${formatCurrency(oldLineProfit)} ➔ ${formatCurrency(newLineProfit)} (Gain: +${formatCurrency(delta)})\n`
      );
    }

    if (corruptedBatches.length > 0) {
      console.log('\n--- CORRUPTED INVENTORY BATCHES ---');
      for (const b of corruptedBatches) {
        console.log(
          `Batch #${b.batch_id} for Product ${b.product_name} (ID: ${b.product_id}):\n` +
          `   Cost: ${formatCurrency(b.old_batch_cost)} ➔ ${formatCurrency(b.master_cost)} (Stock Rem: ${b.quantity_remaining})\n`
        );
      }
    }

    console.log('================================================================');
    console.log(`📊 SUMMARY OF IMPACT:`);
    console.log(`Total Affected Invoices:   ${invoiceSummary.size}`);
    console.log(`Total Affected Line Items:  ${corruptedItems.length}`);
    console.log(`Total Affected Batches:     ${corruptedBatches.length}`);
    console.log(`Total Net Profit Recovered: +${formatCurrency(totalProfitDelta)}`);
    console.log('================================================================\n');

    // 4. If --commit flag is provided, execute database transaction
    if (isCommit) {
      console.log('⏳ Committing updates to PostgreSQL within transaction...');

      await runTransaction(async (tx) => {
        // Update sale_items
        for (const it of corruptedItems) {
          await tx.runQuery(
            'UPDATE sale_items SET purchase_price = ? WHERE id = ?',
            [it.master_unit_cost, it.item_id]
          );
        }

        // Update inventory_batches
        for (const b of corruptedBatches) {
          await tx.runQuery(
            'UPDATE inventory_batches SET purchase_price = ? WHERE id = ?',
            [b.master_cost, b.batch_id]
          );
        }
      });

      console.log('✅ SUCCESS! All database changes committed safely.');
      console.log(`   - ${corruptedItems.length} invoice items updated.`);
      console.log(`   - ${corruptedBatches.length} batches updated.`);
      console.log(`   - Profit ledger now accurately reflects true product margins.`);
    } else {
      console.log('💡 This was a DRY RUN preview. No data was modified.');
      console.log('   To apply these corrections to the database, run:');
      console.log('   node backend/scripts/sync_invoice_cogs.js --commit\n');
    }
  } catch (err) {
    console.error('❌ Error executing COGS sync:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
