/**
 * reconcile_customer_balances.js
 *
 * Standalone, idempotent database reconciliation script to recompute and synchronize:
 * 1. Customer balances: current_balance and advance_balance based on historical sales vs payments vs credit notes
 * 2. Sales invoices: paid_amount, pending_amount, and status in exact FIFO allocation
 * 3. Opening balance settlement allocations
 *
 * Usage:
 *   node backend/scripts/reconcile_customer_balances.js
 */

import 'dotenv/config';
import { pool, runTransaction, allRecords } from '../database.js';

const money = (val) => Math.round(Number(val || 0) * 100) / 100;

async function reconcile() {
  console.log('================================================================');
  console.log('   STARTING CUSTOMER BALANCES & LEDGER RECONCILIATION SCRIPT   ');
  console.log('================================================================\n');

  try {
    const customers = await allRecords('SELECT id, name, COALESCE(opening_balance, 0) AS opening_balance, COALESCE(advance_balance, 0) AS advance_balance FROM customers ORDER BY id ASC');
    console.log(`Found ${customers.length} customers to audit and reconcile.\n`);

    let adjustedCount = 0;

    await runTransaction(async (tx) => {
      for (const cust of customers) {
        const custId = cust.id;
        const ob = money(cust.opening_balance);

        // 1. Fetch all sales for this customer
        const sales = await tx.allRecords(
          `SELECT id, invoice_number, 
                  COALESCE(NULLIF(current_invoice_total, 0), total_amount) AS invoice_total,
                  total_amount, paid_amount, pending_amount, status,
                  COALESCE(applied_credit_amount, 0) AS applied_credit_amount,
                  COALESCE(advance_applied, 0) AS advance_applied
           FROM sales 
           WHERE customer_id = ?
           ORDER BY COALESCE(invoice_date, sale_date::date, created_at::date) ASC, id ASC`,
          [custId]
        );

        // 2. Fetch all valid payments (excluding credit_note internal deduction records)
        const payments = await tx.allRecords(
          `SELECT id, payment_number, amount, payment_mode, payment_date
           FROM payments
           WHERE customer_id = ? AND reversed_at IS NULL AND COALESCE(payment_mode, '') != 'credit_note'
           ORDER BY payment_date ASC, id ASC`,
          [custId]
        );

        // 3. Fetch active credit notes
        const creditNotes = await tx.allRecords(
          `SELECT id, credit_note_number, amount
           FROM credit_notes
           WHERE customer_id = ? AND status != 'cancelled'
           ORDER BY return_date ASC, id ASC`,
          [custId]
        );

        const totalInvoiced = sales.reduce((sum, s) => sum + money(s.invoice_total), 0);
        const totalPayments = payments.reduce((sum, p) => sum + money(p.amount), 0);
        const totalCreditNotes = creditNotes.reduce((sum, cn) => sum + money(cn.amount), 0);

        // Canonical Mathematical Balance:
        // New Customer Balance = (Opening Balance + New Sale Total) - Paid Amount - Credit Notes
        const trueNetBalance = money(ob + totalInvoiced - totalPayments - totalCreditNotes);
        const trueAdvanceBalance = trueNetBalance < 0 ? Math.abs(trueNetBalance) : 0.00;

        // Reset existing payment allocations for this customer so they can be re-allocated in strict FIFO order
        await tx.runQuery(
          `DELETE FROM payment_allocations 
           WHERE customer_id = ? AND reversed_at IS NULL`,
          [custId]
        );

        // In-memory payment pool tracking for high performance
        const paymentPool = payments.map(p => ({
          id: p.id,
          total: money(p.amount),
          remaining: money(p.amount),
        }));

        const allocationsToInsert = [];

        // Helper to take funds from payment pool
        const allocateFunds = (targetAmount, saleId, type, notes) => {
          let needed = targetAmount;
          let allocated = 0;
          for (const pm of paymentPool) {
            if (needed <= 0) break;
            if (pm.remaining <= 0) continue;
            const take = Math.min(needed, pm.remaining);
            pm.remaining = money(pm.remaining - take);
            needed = money(needed - take);
            allocated = money(allocated + take);

            allocationsToInsert.push({
              payment_id: pm.id,
              customer_id: custId,
              sale_id: saleId,
              allocation_type: type,
              amount_applied: take,
              notes
            });
          }
          return allocated;
        };

        // Step A: Allocate towards Opening Balance first
        if (ob > 0) {
          allocateFunds(ob, null, 'opening_balance', 'Reconciled opening balance allocation');
        }

        // Step B: Allocate to sales in FIFO order
        for (const sale of sales) {
          const invTotal = money(sale.invoice_total);
          const creditApplied = money(sale.applied_credit_amount);
          const netInvoiceDue = Math.max(0, money(invTotal - creditApplied));

          const paidForSale = allocateFunds(netInvoiceDue, sale.id, 'invoice', `Reconciled allocation to Invoice #${sale.invoice_number || sale.id}`);
          const newPending = Math.max(0, money(netInvoiceDue - paidForSale));
          const newStatus = newPending <= 0 ? 'paid' : (paidForSale > 0 ? 'partial' : 'open');

          await tx.runQuery(
            `UPDATE sales 
             SET total_amount = ?, paid_amount = ?, pending_amount = ?, status = ?
             WHERE id = ?`,
            [netInvoiceDue, paidForSale, newPending, newStatus, sale.id]
          );
        }

        // Batch insert allocations
        for (const alloc of allocationsToInsert) {
          await tx.runQuery(
            `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [alloc.payment_id, alloc.customer_id, alloc.sale_id, alloc.allocation_type, alloc.amount_applied, alloc.notes]
          );
        }

        // Update payment unallocated amounts
        for (const pm of paymentPool) {
          await tx.runQuery(
            'UPDATE payments SET unallocated_amount = ? WHERE id = ?',
            [pm.remaining, pm.id]
          );
        }

        // Check if customer balance changed
        const currentBalDiff = Math.abs(Number(cust.current_balance || 0) - trueNetBalance);
        const advDiff = Math.abs(Number(cust.advance_balance || 0) - trueAdvanceBalance);

        if (currentBalDiff > 0.01 || advDiff > 0.01) {
          adjustedCount++;
          console.log(
            `✔ Customer #${custId} (${cust.name}): Balance adjusted from ₹${cust.current_balance || 0} to ₹${trueNetBalance}` +
            (trueAdvanceBalance > 0 ? ` (Advance: ₹${trueAdvanceBalance})` : '')
          );
        }

        // Update customer current_balance and advance_balance
        await tx.runQuery(
          `UPDATE customers 
           SET current_balance = ?, advance_balance = ? 
           WHERE id = ?`,
          [trueNetBalance, trueAdvanceBalance, custId]
        );
      }
    });

    console.log(`\nReconciliation completed successfully! Total customers adjusted: ${adjustedCount}`);
    console.log('================================================================\n');
  } catch (err) {
    console.error('Reconciliation error:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

reconcile();
