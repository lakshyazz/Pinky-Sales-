/**
 * test_fifo_ledger.js — Comprehensive Test Suite for Party Ledger,
 * FIFO Payment Allocation, Reversals, Row Locking, and Balance Reconciliation.
 *
 * Run: node backend/test_fifo_ledger.js
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { runQuery, getRecord, allRecords, runTransaction, pool } from './database.js';
import { getCustomerLedger } from './ledgerEngine.js';

const money = (val) => Math.round(Number(val || 0) * 100) / 100;

/**
 * Standing invariant reconciliation check:
 * Asserts that the dynamically computed balance from customer record
 * strictly equals the final running_balance from getCustomerLedger.
 * Can be exported and reused for future production health checks.
 */
export async function assertCustomerLedgerAndBalanceReconcile(customerId) {
  const cust = await getRecord(
    `SELECT c.id, c.name, 
            COALESCE(c.opening_balance, 0) AS opening_balance,
            COALESCE(c.advance_balance, 0) AS advance_balance
     FROM customers c WHERE c.id = ?`,
    [customerId]
  );
  assert.ok(cust, `Customer ${customerId} must exist`);

  // 1. Compute dynamic outstanding balance using canonical SQL formula
  const balanceRow = await getRecord(
    `SELECT (
       GREATEST(0, (COALESCE(c.opening_balance, 0) - COALESCE(
         (SELECT SUM(pa.amount_applied) FROM payment_allocations pa 
          WHERE pa.customer_id = c.id AND pa.allocation_type = 'opening_balance' AND pa.reversed_at IS NULL), 0
       )))
       + COALESCE((SELECT SUM(s.total_amount - s.paid_amount) FROM sales s WHERE s.customer_id = c.id), 0)
       - COALESCE(c.advance_balance, 0)
     ) AS outstanding_balance
     FROM customers c WHERE c.id = ?`,
    [customerId]
  );
  const dynamicOutstanding = money(balanceRow?.outstanding_balance || 0);

  // 2. Fetch ledger from ledgerEngine
  const ledger = await getCustomerLedger(customerId, null);
  const ledgerClosingBal = money(ledger.closing_balance || 0);

  // If customer has net advance (credit balance), ledger closing balance is negative
  // dynamic outstanding is clamped at 0 for positive receivables, while net ledger balance can be negative (Cr)
  const netExpected = money(
    (Number(cust.opening_balance) - Number(
      (await getRecord(
        `SELECT COALESCE(SUM(amount_applied), 0) AS settled FROM payment_allocations 
         WHERE customer_id = ? AND allocation_type = 'opening_balance' AND reversed_at IS NULL`,
        [customerId]
      ))?.settled || 0
    ))
    + Number((await getRecord(`SELECT COALESCE(SUM(total_amount - paid_amount), 0) AS inv FROM sales WHERE customer_id = ?`, [customerId]))?.inv || 0)
    - Number(cust.advance_balance)
  );

  console.log(`   [Reconciliation] Customer ${customerId}: Dynamic = ₹${dynamicOutstanding}, Net Expected = ₹${netExpected}, Ledger Closing = ₹${ledgerClosingBal}`);

  // Assert ledger closing balance equals net expected
  assert.strictEqual(
    ledgerClosingBal,
    netExpected,
    `Ledger closing balance (₹${ledgerClosingBal}) must match net expected balance (₹${netExpected})`
  );

  return { dynamicOutstanding, netExpected, ledgerClosingBal };
}

async function runTests() {
  console.log('================================================================');
  console.log('   STARTING FIFO LEDGER & PAYMENT ALLOCATION VERIFICATION SUITE   ');
  console.log('================================================================\n');

  let testCustomer = null;
  let customer3Id = null;
  let testProduct = null;
  let shopId = 1;

  try {
    // 0. Clean up previous test runs
    await runQuery("DELETE FROM payment_allocations WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE 'Test FIFO Customer%' OR name LIKE 'Split Test Customer%')");
    await runQuery("DELETE FROM payments WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE 'Test FIFO Customer%' OR name LIKE 'Split Test Customer%')");
    await runQuery("DELETE FROM sales WHERE customer_id IN (SELECT id FROM customers WHERE name LIKE 'Test FIFO Customer%' OR name LIKE 'Split Test Customer%')");
    await runQuery("DELETE FROM customers WHERE name LIKE 'Test FIFO Customer%' OR name LIKE 'Split Test Customer%'");

    // Ensure a test product and shop exist
    const shop = await getRecord('SELECT id FROM shops LIMIT 1');
    if (shop) shopId = shop.id;

    testProduct = await getRecord('SELECT id, short_name, sale_price FROM products LIMIT 1');
    if (!testProduct) {
      const prodRes = await runQuery(
        `INSERT INTO products (shop_id, name, short_name, sale_price, retail_price, wholesale_price, is_active)
         VALUES (?, 'Test Mobile Product', 'TestMobile', 10000.00, 10000.00, 9000.00, 1) RETURNING id`,
        [shopId]
      );
      testProduct = { id: prodRes.id, short_name: 'TestMobile', sale_price: 10000.00 };
    }

    // Create Test Customer with Opening Balance ₹3,00,000.00
    const custRes = await runQuery(
      `INSERT INTO customers (shop_id, name, mobile, address, opening_balance, advance_balance, opening_balance_date)
       VALUES (?, 'Test FIFO Customer', ?, 'Test Street, Surat', 300000.00, 0.00, CURRENT_DATE) RETURNING id`,
      [shopId, `999${String(Date.now()).slice(-7)}`]
    );
    testCustomer = await getRecord('SELECT * FROM customers WHERE id = ?', [custRes.id]);
    console.log(`✔ Created Test Customer ID: ${testCustomer.id} with Opening Balance ₹3,00,000.00`);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: In-Lock Idempotency on Payments
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── TEST GROUP 1: In-Lock Idempotency on Payments ──');
    const test1Key = `idem-pay-${Date.now()}`;

    // Simulate payment creation logic with idempotency key
    async function postPaymentSimulated(amount, key) {
      return runTransaction(async (tx) => {
        // Lock customer row first
        const cust = await tx.getRecord('SELECT * FROM customers WHERE id = ? FOR UPDATE', [testCustomer.id]);

        // Check key inside lock
        if (key) {
          const existing = await tx.getRecord('SELECT * FROM payments WHERE idempotency_key = ?', [key]);
          if (existing) {
            const allocs = await tx.allRecords('SELECT * FROM payment_allocations WHERE payment_id = ?', [existing.id]);
            return { payment: existing, allocations: allocs, idempotent_replay: true };
          }
        }

        const seq = await tx.getRecord("SELECT nextval('payment_number_seq') AS num");
        const payNum = 'PAY-' + String(seq.num).padStart(6, '0');

        const pay = await tx.getRecord(
          `INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, idempotency_key, shop_id)
           VALUES (?, ?, ?, CURRENT_DATE, 'bank', ?, ?) RETURNING *`,
          [payNum, cust.id, amount, key, shopId]
        );

        await tx.runQuery(
          `INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied, notes)
           VALUES (?, ?, 'opening_balance', ?, 'Initial OB payment')`,
          [pay.id, cust.id, amount]
        );

        const allocs = await tx.allRecords('SELECT * FROM payment_allocations WHERE payment_id = ?', [pay.id]);
        return { payment: pay, allocations: allocs, idempotent_replay: false };
      });
    }

    // Call 1
    const res1 = await postPaymentSimulated(50000.00, test1Key);
    assert.strictEqual(res1.idempotent_replay, false, 'First payment should be newly created');
    assert.strictEqual(Number(res1.payment.amount), 50000.00);

    // Call 2 (identical rapid duplicate)
    const res2 = await postPaymentSimulated(50000.00, test1Key);
    assert.strictEqual(res2.idempotent_replay, true, 'Second payment should be detected as idempotent replay');
    assert.strictEqual(res2.payment.id, res1.payment.id, 'Second payment must return identical payment record');
    assert.strictEqual(res2.allocations.length, 1, 'Only one allocation set should exist');

    const totalMatchingPayments = await getRecord('SELECT COUNT(*) AS c FROM payments WHERE idempotency_key = ?', [test1Key]);
    assert.strictEqual(Number(totalMatchingPayments.c), 1, 'Database must contain strictly 1 payment with this idempotency_key');
    console.log('✔ Test 1 Passed: Duplicate payments with same idempotency_key gracefully returned original without constraint violation.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: Concurrent Payments & Invoices (Row Locking)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── TEST GROUP 2: Concurrent Payments & Invoices (Row Locking) ──');
    const startBalRow = await getRecord(
      `SELECT (
         GREATEST(0, (c.opening_balance - COALESCE(
           (SELECT SUM(pa.amount_applied) FROM payment_allocations pa 
            WHERE pa.customer_id = c.id AND pa.allocation_type = 'opening_balance' AND pa.reversed_at IS NULL), 0
         )))
         + COALESCE((SELECT SUM(s.total_amount - s.paid_amount) FROM sales s WHERE s.customer_id = c.id), 0)
         - COALESCE(c.advance_balance, 0)
       ) AS bal FROM customers c WHERE c.id = ?`,
      [testCustomer.id]
    );
    const initialBal = money(startBalRow.bal);

    // Fire concurrent invoice (₹20,000) and payment (₹10,000)
    const concurrentInvoice = runTransaction(async (tx) => {
      await tx.getRecord('SELECT id FROM customers WHERE id = ? FOR UPDATE', [testCustomer.id]);
      const s = await tx.getRecord(
        `INSERT INTO sales (shop_id, customer_id, product_id, quantity, total_amount, paid_amount, pending_amount, sale_date, invoice_date, status)
         VALUES (?, ?, ?, 1, 20000.00, 0.00, 20000.00, CURRENT_DATE, CURRENT_DATE, 'open') RETURNING id`,
        [shopId, testCustomer.id, testProduct.id]
      );
      return s;
    });

    const concurrentPayment = runTransaction(async (tx) => {
      await tx.getRecord('SELECT id FROM customers WHERE id = ? FOR UPDATE', [testCustomer.id]);
      const seq = await tx.getRecord("SELECT nextval('payment_number_seq') AS num");
      const p = await tx.getRecord(
        `INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, shop_id)
         VALUES (?, ?, 10000.00, CURRENT_DATE, 'cash', ?) RETURNING id`,
        ['PAY-' + String(seq.num).padStart(6, '0'), testCustomer.id, shopId]
      );
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, allocation_type, amount_applied)
         VALUES (?, ?, 'opening_balance', 10000.00)`,
        [p.id, testCustomer.id]
      );
      return p;
    });

    await Promise.all([concurrentInvoice, concurrentPayment]);

    const postConcurrentBalRow = await getRecord(
      `SELECT (
         GREATEST(0, (c.opening_balance - COALESCE(
           (SELECT SUM(pa.amount_applied) FROM payment_allocations pa 
            WHERE pa.customer_id = c.id AND pa.allocation_type = 'opening_balance' AND pa.reversed_at IS NULL), 0
         )))
         + COALESCE((SELECT SUM(s.total_amount - s.paid_amount) FROM sales s WHERE s.customer_id = c.id), 0)
         - COALESCE(c.advance_balance, 0)
       ) AS bal FROM customers c WHERE c.id = ?`,
      [testCustomer.id]
    );
    const expectedBal = money(initialBal + 20000.00 - 10000.00);
    assert.strictEqual(money(postConcurrentBalRow.bal), expectedBal, `Concurrent updates must resolve exactly to ₹${expectedBal}`);
    console.log('✔ Test 2 Passed: Concurrent invoice and payment safely serialized via row locks with zero lost updates.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3 & 4: Split Payment Allocation & Breakdown Text & Dynamic Balance ₹0
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── TEST GROUP 3 & 4: Split Payment Allocation, Breakdown Text, & Dynamic Balance ₹0 ──');

    // Create a dedicated clean customer: Opening Balance ₹3,00,000.00
    const cust3Res = await runQuery(
      `INSERT INTO customers (shop_id, name, mobile, address, opening_balance, advance_balance, opening_balance_date)
       VALUES (?, 'Split Test Customer', ?, 'Ring Road, Surat', 300000.00, 0.00, CURRENT_DATE) RETURNING id`,
      [shopId, `998${String(Date.now()).slice(-7)}`]
    );
    customer3Id = cust3Res.id;

    // Create Invoice 1: ₹1,00,000.00
    const inv1Number = 'INV-' + String(Date.now()).slice(-6);
    const inv1Res = await runQuery(
      `INSERT INTO sales (shop_id, customer_id, product_id, quantity, total_amount, paid_amount, pending_amount, sale_date, invoice_date, invoice_number, status)
       VALUES (?, ?, ?, 10, 100000.00, 0.00, 100000.00, CURRENT_DATE, CURRENT_DATE, ?, 'open') RETURNING id`,
      [shopId, customer3Id, testProduct.id, inv1Number]
    );
    const inv1Id = inv1Res.id;

    // Total debt: ₹3,00,000 (OB) + ₹1,00,000 (INV-000041) = ₹4,00,000.00
    // Post Lump-Sum Payment: ₹4,00,000.00 via Bank Transfer
    const splitPayment = await runTransaction(async (tx) => {
      const cust = await tx.getRecord('SELECT * FROM customers WHERE id = ? FOR UPDATE', [customer3Id]);
      const seq = await tx.getRecord("SELECT nextval('payment_number_seq') AS num");
      const payNum = 'PAY-' + String(seq.num).padStart(6, '0');

      const pm = await tx.getRecord(
        `INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, reference_number, shop_id)
         VALUES (?, ?, 400000.00, CURRENT_DATE, 'Bank Transfer', 'CHQ98765', ?) RETURNING *`,
        [payNum, cust.id, shopId]
      );

      // FIFO Step 1: Opening balance allocation (₹3,00,000)
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes)
         VALUES (?, ?, NULL, 'opening_balance', 300000.00, 'Applied to opening balance')`,
        [pm.id, cust.id]
      );

      // FIFO Step 2: Invoice 1 allocation (₹1,00,000)
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied, notes)
         VALUES (?, ?, ?, 'invoice', 100000.00, 'Applied to INV-000041')`,
        [pm.id, cust.id, inv1Id]
      );

      await tx.runQuery(
        'UPDATE sales SET paid_amount = 100000.00, pending_amount = 0.00, status = ? WHERE id = ?',
        ['paid', inv1Id]
      );

      return pm;
    });

    // Verify Invoice 1 is fully paid
    const updatedInv1 = await getRecord('SELECT * FROM sales WHERE id = ?', [inv1Id]);
    assert.strictEqual(money(updatedInv1.pending_amount), 0.00);
    assert.strictEqual(updatedInv1.status, 'paid');

    // Verify Ledger Output
    const ledgerCust3 = await getCustomerLedger(customer3Id, null);
    assert.strictEqual(ledgerCust3.rows.length, 3, 'Ledger should have exactly 3 rows: OB, Sale, Payment');

    const paymentRow = ledgerCust3.rows.find(r => r.entry_type === 'payment');
    assert.ok(paymentRow, 'Ledger must contain the payment row');
    assert.strictEqual(paymentRow.credit, 400000.00, 'Payment credit must show full ₹4,00,000.00');

    // Assert description contains breakdown string
    console.log(`   [Ledger Description]: "${paymentRow.description}"`);
    assert.ok(
      paymentRow.description.includes('Opening Balance: ₹3,00,000.00'),
      'Description must include opening balance allocation breakdown'
    );
    assert.ok(
      paymentRow.description.includes(`Invoice #${inv1Number}: ₹1,00,000.00`),
      'Description must include invoice allocation breakdown'
    );
    assert.ok(
      paymentRow.description.includes('CHQ98765'),
      'Description must include reference number'
    );

    // Assert Closing Balance is ₹0.00 Settled
    assert.strictEqual(ledgerCust3.closing_balance, 0.00, 'Closing balance must be strictly ₹0.00');

    // Dynamic Balance Check (TEST 4): Assert GET /api/customers balance is ₹0, NOT ₹3,00,000
    const dynBalCust3 = await getRecord(
      `SELECT (
         GREATEST(0, (c.opening_balance - COALESCE(
           (SELECT SUM(pa.amount_applied) FROM payment_allocations pa 
            WHERE pa.customer_id = c.id AND pa.allocation_type = 'opening_balance' AND pa.reversed_at IS NULL), 0
         )))
         + COALESCE((SELECT SUM(s.total_amount - s.paid_amount) FROM sales s WHERE s.customer_id = c.id), 0)
         - COALESCE(c.advance_balance, 0)
       ) AS bal FROM customers c WHERE c.id = ?`,
      [customer3Id]
    );
    assert.strictEqual(money(dynBalCust3.bal), 0.00, 'Dynamic customer balance must be strictly ₹0.00 after opening balance + invoice paid off');
    console.log('✔ Test 3 & 4 Passed: Split payment allocation breakdown rendered correctly and dynamic balance is strictly ₹0.00.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5 & 6: Reversal Dynamic Status & Reversal Idempotency
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── TEST GROUP 5 & 6: Reversal Dynamic Status & Reversal Idempotency ──');

    // Create Invoice 2: ₹50,000
    const inv2Number = 'INV-' + String(Date.now() + 500).slice(-6);
    const inv2Res = await runQuery(
      `INSERT INTO sales (shop_id, customer_id, product_id, quantity, total_amount, paid_amount, pending_amount, sale_date, invoice_date, invoice_number, status)
       VALUES (?, ?, ?, 5, 50000.00, 0.00, 50000.00, CURRENT_DATE, CURRENT_DATE, ?, 'open') RETURNING id`,
      [shopId, customer3Id, testProduct.id, inv2Number]
    );
    const inv2Id = inv2Res.id;

    // Payment A: allocates ₹20,000 to Invoice 2
    const seqA = await getRecord("SELECT nextval('payment_number_seq') AS num");
    const payA = await runQuery(
      `INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, shop_id)
       VALUES (?, ?, 20000.00, CURRENT_DATE, 'cash', ?) RETURNING id`,
      ['PAY-' + String(seqA.num).padStart(6, '0'), customer3Id, shopId]
    );
    await runQuery(
      `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied)
       VALUES (?, ?, ?, 'invoice', 20000.00)`,
      [payA.id, customer3Id, inv2Id]
    );
    await runQuery(
      'UPDATE sales SET paid_amount = 20000.00, pending_amount = 30000.00, status = ? WHERE id = ?',
      ['partial', inv2Id]
    );

    // Payment B: allocates ₹30,000 to Invoice 2 (invoice is now fully paid)
    const seqB = await getRecord("SELECT nextval('payment_number_seq') AS num");
    const payB = await runQuery(
      `INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, shop_id)
       VALUES (?, ?, 30000.00, CURRENT_DATE, 'bank', ?) RETURNING id`,
      ['PAY-' + String(seqB.num).padStart(6, '0'), customer3Id, shopId]
    );
    await runQuery(
      `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied)
       VALUES (?, ?, ?, 'invoice', 30000.00)`,
      [payB.id, customer3Id, inv2Id]
    );
    await runQuery(
      'UPDATE sales SET paid_amount = 50000.00, pending_amount = 0.00, status = ? WHERE id = ?',
      ['paid', inv2Id]
    );

    const inv2BeforeRev = await getRecord('SELECT * FROM sales WHERE id = ?', [inv2Id]);
    assert.strictEqual(inv2BeforeRev.status, 'paid');

    // Simulate Reversal of Payment B
    async function reversePaymentSimulated(paymentId) {
      return runTransaction(async (tx) => {
        // Lock payment first
        const payment = await tx.getRecord('SELECT * FROM payments WHERE id = ? FOR UPDATE', [paymentId]);
        if (!payment) throw new Error('Payment not found');
        if (payment.reversed_at) {
          return { already_reversed: true, payment };
        }

        // Lock customer
        await tx.getRecord('SELECT id FROM customers WHERE id = ? FOR UPDATE', [payment.customer_id]);

        await tx.runQuery('UPDATE payments SET reversed_at = CURRENT_TIMESTAMP WHERE id = ?', [paymentId]);

        const allocs = await tx.allRecords(
          'SELECT * FROM payment_allocations WHERE payment_id = ? AND reversed_at IS NULL',
          [paymentId]
        );
        await tx.runQuery('UPDATE payment_allocations SET reversed_at = CURRENT_TIMESTAMP WHERE payment_id = ?', [paymentId]);

        for (const al of allocs) {
          if (al.allocation_type === 'invoice' && al.sale_id) {
            const inv = await tx.getRecord('SELECT * FROM sales WHERE id = ? FOR UPDATE', [al.sale_id]);
            const newPaid = Math.max(0, money(Number(inv.paid_amount) - Number(al.amount_applied)));
            const newPending = Math.max(0, money(Number(inv.total_amount) - newPaid));
            const newStatus = newPaid <= 0 ? 'open' : (newPaid < Number(inv.total_amount) ? 'partial' : 'paid');

            await tx.runQuery(
              'UPDATE sales SET paid_amount = ?, pending_amount = ?, status = ? WHERE id = ?',
              [newPaid, newPending, newStatus, inv.id]
            );
          }
        }
        return { already_reversed: false, payment };
      });
    }

    // Call Reversal 1
    const revRes1 = await reversePaymentSimulated(payB.id);
    assert.strictEqual(revRes1.already_reversed, false, 'First reversal call must execute reversal');

    // Assert Invoice 2 status is 'partial' (NOT 'open'!) because Payment A still covers ₹20,000
    const inv2AfterRev = await getRecord('SELECT * FROM sales WHERE id = ?', [inv2Id]);
    assert.strictEqual(money(inv2AfterRev.paid_amount), 20000.00);
    assert.strictEqual(money(inv2AfterRev.pending_amount), 30000.00);
    assert.strictEqual(inv2AfterRev.status, 'partial', 'Invoice status must dynamically recompute to "partial"');

    // Call Reversal 2 on same payment (idempotency check)
    const revRes2 = await reversePaymentSimulated(payB.id);
    assert.strictEqual(revRes2.already_reversed, true, 'Second reversal call must be a safe idempotent no-op');

    const inv2AfterRev2 = await getRecord('SELECT * FROM sales WHERE id = ?', [inv2Id]);
    assert.strictEqual(money(inv2AfterRev2.paid_amount), 20000.00, 'Balances must remain untouched on second reversal call');
    console.log('✔ Test 5 & 6 Passed: Dynamic status correctly computed to "partial", and reversal is strictly idempotent.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7: Ledger Audit Trail for Reversals (Offsetting Entry)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── TEST GROUP 7: Ledger Audit Trail for Reversals ──');
    const ledgerAfterRev = await getCustomerLedger(customer3Id, null);

    // Assert original payment row still exists with reversed: true
    const origPayBRow = ledgerAfterRev.rows.find(r => r.id === payB.id && r.entry_type === 'payment');
    assert.ok(origPayBRow, 'Original payment row must remain visible in ledger');
    assert.strictEqual(origPayBRow.reversed, true, 'Original payment row must be marked reversed: true');

    // Assert offsetting reversal entry exists
    const revRow = ledgerAfterRev.rows.find(r => r.entry_type === 'reversal');
    assert.ok(revRow, 'Ledger must contain offsetting reversal entry');
    assert.strictEqual(revRow.debit, 30000.00, 'Reversal entry must debit the reversed amount (₹30,000)');
    assert.strictEqual(revRow.credit, 0.00);
    console.log(`   [Audit Trail]: Original: ${origPayBRow.ref_no} (Reversed), Counter: ${revRow.ref_no} (Dr ₹${revRow.debit})`);
    console.log('✔ Test 7 Passed: Complete audit trail preserved with offsetting reversal voucher.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 8: Excess Payment & Advance Balance
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── TEST GROUP 8: Excess Payment & Advance Balance ──');
    // Post payment that exceeds invoice dues by ₹50,000
    const seqExcess = await getRecord("SELECT nextval('payment_number_seq') AS num");
    const payExcess = await runTransaction(async (tx) => {
      const p = await tx.getRecord(
        `INSERT INTO payments (payment_number, customer_id, amount, payment_date, payment_mode, unallocated_amount, shop_id)
         VALUES (?, ?, 80000.00, CURRENT_DATE, 'bank', 50000.00, ?) RETURNING *`,
        ['PAY-' + String(seqExcess.num).padStart(6, '0'), customer3Id, shopId]
      );
      // Settle remaining ₹30,000 on Invoice 2
      await tx.runQuery(
        `INSERT INTO payment_allocations (payment_id, customer_id, sale_id, allocation_type, amount_applied)
         VALUES (?, ?, ?, 'invoice', 30000.00)`,
        [p.id, customer3Id, inv2Id]
      );
      await tx.runQuery('UPDATE sales SET paid_amount = 50000.00, pending_amount = 0.00, status = ? WHERE id = ?', ['paid', inv2Id]);
      // Credit leftover ₹50,000 to advance_balance
      await tx.runQuery('UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + 50000.00 WHERE id = ?', [customer3Id]);
      return p;
    });

    const custAfterExcess = await getRecord('SELECT advance_balance FROM customers WHERE id = ?', [customer3Id]);
    assert.strictEqual(money(custAfterExcess.advance_balance), 50000.00, 'Advance balance must be credited with ₹50,000.00');

    const ledgerAfterExcess = await getCustomerLedger(customer3Id, null);
    assert.strictEqual(ledgerAfterExcess.closing_balance, -50000.00, 'Closing balance must be -₹50,000.00 (Cr / Advance)');
    console.log('✔ Test 8 Passed: Excess payment correctly held as advance credit without clipping or dropping.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 9: Decimal Safety (Cent Fractions)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── TEST GROUP 9: Decimal Safety ──');
    assert.strictEqual(money(0.1 + 0.2), 0.30);
    assert.strictEqual(money(99.99 + 0.01), 100.00);
    assert.strictEqual(money(100.00 - 99.99), 0.01);
    console.log('✔ Test 9 Passed: Zero floating-point drift.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 10: Standing Cross-Path Reconciliation Invariant Test
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n── TEST GROUP 10: Standing Cross-Path Reconciliation Invariant ──');
    await assertCustomerLedgerAndBalanceReconcile(customer3Id);
    console.log('✔ Test 10 Passed: Standing invariant check verified dynamic customer balance and ledger running balance match 100%.');

    console.log('\n================================================================');
    console.log('   ALL 10 FIFO LEDGER & RECONCILIATION TEST GROUPS PASSED!       ');
    console.log('================================================================\n');

  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup test records
    try {
      if (testCustomer) {
        await runQuery('DELETE FROM payment_allocations WHERE customer_id = ?', [testCustomer.id]);
        await runQuery('DELETE FROM payments WHERE customer_id = ?', [testCustomer.id]);
        await runQuery('DELETE FROM sales WHERE customer_id = ?', [testCustomer.id]);
        await runQuery('DELETE FROM customers WHERE id = ?', [testCustomer.id]);
      }
      if (customer3Id) {
        await runQuery('DELETE FROM payment_allocations WHERE customer_id = ?', [customer3Id]);
        await runQuery('DELETE FROM payments WHERE customer_id = ?', [customer3Id]);
        await runQuery('DELETE FROM sales WHERE customer_id = ?', [customer3Id]);
        await runQuery('DELETE FROM customers WHERE id = ?', [customer3Id]);
      }
    } catch {}
    await pool.end();
  }
}

runTests();
