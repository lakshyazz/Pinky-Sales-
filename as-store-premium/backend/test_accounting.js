/**
 * test_accounting.js — Phase A accounting engine unit tests
 *
 * Run: node test_accounting.js
 * From: as-store-premium/backend/
 *
 * These tests verify the logic of the Phase A bug fixes without requiring
 * a live database connection. All assertions are plain Node.js assert/strict.
 */

import assert from 'node:assert/strict';

// ─── A1: money() rounding ────────────────────────────────────────────────────
// Replicate the fixed money() function exactly as it appears in server.js
const money = (value) => Math.round(Number(value || 0) * 100) / 100;

console.log('\n── TEST GROUP A1: money() floating-point rounding ──');

// Classic IEEE-754 pitfall
assert.strictEqual(money(0.1 + 0.2), 0.30, 'A1.1  0.1 + 0.2 should round to 0.30');
assert.strictEqual(money(0.2 + 0.7), 0.90, 'A1.2  0.2 + 0.7 should round to 0.90');

// Half-up rounding
assert.strictEqual(money(1234.565), 1234.57, 'A1.3  1234.565 rounds up to 1234.57');
assert.strictEqual(money(1234.564), 1234.56, 'A1.4  1234.564 rounds down to 1234.56');
assert.strictEqual(money(0.005),    0.01,    'A1.5  0.005 rounds up to 0.01');

// Null / undefined safety
assert.strictEqual(money(null),      0.00, 'A1.6  null -> 0.00');
assert.strictEqual(money(undefined), 0.00, 'A1.7  undefined -> 0.00');
assert.strictEqual(money(''),        0.00, 'A1.8  empty string -> 0.00');
assert.strictEqual(money('500.50'),  500.50, 'A1.9  string "500.50" -> 500.50');

// Large values
assert.strictEqual(money(748343.005), 748343.01, 'A1.10 large value with rounding');

// Multi-item invoice sum simulation (the main bug scenario)
const items = [
  { qty: 3, price: 33.33 },
  { qty: 2, price: 16.67 },
  { qty: 1, price:  0.01 },
];
const rawSum = items.reduce((s, i) => s + i.qty * i.price, 0);
const moneySum = items.reduce((s, i) => s + money(money(i.qty) * money(i.price)), 0);
assert.strictEqual(money(moneySum), money(rawSum), 'A1.11 multi-item sum consistent after rounding');

console.log('  All A1 tests passed');

// ─── A4: Payment settlement base (net_payable_amount vs total_amount) ─────────
console.log('\n── TEST GROUP A4: payment settlement uses net_payable_amount ──');

function simulatePayment(sale, paymentAmount) {
  const allocated = Math.min(paymentAmount, money(sale.pending_amount));
  const newPaid = money(money(sale.paid_amount) + allocated);
  const settlementBase = money(sale.net_payable_amount) > 0
    ? money(sale.net_payable_amount)
    : money(sale.total_amount);
  const newPending = Math.max(money(settlementBase - newPaid), 0);
  return { newPaid, newPending };
}

// Invoice with advance applied at creation: total=1000, net_payable=600, paid=200, pending=400
const saleWithAdvance = { total_amount: 1000, net_payable_amount: 600, paid_amount: 200, pending_amount: 400 };
const r1 = simulatePayment(saleWithAdvance, 400);
assert.strictEqual(r1.newPaid,    600, 'A4.1  paying 400 brings paid to 600');
assert.strictEqual(r1.newPending,   0, 'A4.2  pending clears to 0 using net_payable base');

// Standard invoice without advance
const standardSale = { total_amount: 500, net_payable_amount: 0, paid_amount: 0, pending_amount: 500 };
const r2 = simulatePayment(standardSale, 300);
assert.strictEqual(r2.newPaid,    300, 'A4.3  partial payment on standard sale');
assert.strictEqual(r2.newPending, 200, 'A4.4  remaining pending correct');

const r3 = simulatePayment({ ...standardSale, paid_amount: 300, pending_amount: 200 }, 200);
assert.strictEqual(r3.newPaid,    500, 'A4.5  second payment closes invoice');
assert.strictEqual(r3.newPending,   0, 'A4.6  pending is 0 after full settlement');

console.log('  All A4 tests passed');

// ─── A5: opening_balance must not be mutated ───────────────────────────────────
console.log('\n── TEST GROUP A5: opening_balance immutability ──');

function legacyMutateOpeningBalance(previousBalance, existingSalesPending) {
  return Math.max(0, money(previousBalance - existingSalesPending));
}

// Old code zeroed opening_balance when outstanding matches it exactly
const bugResult = legacyMutateOpeningBalance(50000, 50000);
assert.strictEqual(bugResult, 0, 'A5.1  OLD code zeroed opening_balance (BUG confirmed)');

function readOpeningBalance(customer) {
  return money(customer.opening_balance || 0);
}
assert.strictEqual(readOpeningBalance({ opening_balance: 748343.00 }), 748343.00, 'A5.2  opening_balance read correctly');
assert.strictEqual(readOpeningBalance({}), 0.00, 'A5.3  missing opening_balance defaults to 0');

console.log('  All A5 tests passed');

// ─── A6: advance_balance reversal on sale delete ──────────────────────────────
console.log('\n── TEST GROUP A6: sale delete reverses advance_applied ──');

function simulateDeleteAdvanceReversal(customer, sale) {
  const advanceApplied = money(sale.advance_applied || 0);
  if (advanceApplied > 0) {
    return money((customer.advance_balance || 0) + advanceApplied);
  }
  return money(customer.advance_balance || 0);
}

const cust = { advance_balance: 200.00 };
assert.strictEqual(simulateDeleteAdvanceReversal(cust, { advance_applied: 500 }), 700.00, 'A6.1  advance restored after delete');
assert.strictEqual(simulateDeleteAdvanceReversal(cust, { advance_applied: 0 }),   200.00, 'A6.2  unchanged when no advance');

console.log('  All A6 tests passed');

// ─── A7: customer balance — no double-count of credit notes ───────────────────
console.log('\n── TEST GROUP A7: customer balance double-count fix ──');

function calcOutstandingOLD(invoiceOutstanding, openingBalance, availableCredits) {
  return Math.max(0, money((invoiceOutstanding + openingBalance) - availableCredits));
}

function calcOutstandingNEW(invoiceOutstanding, openingBalance) {
  return money(invoiceOutstanding + openingBalance);
}

const invoiceOutstanding = 10000;
const openingBalance = 0;
const availableCredits = 500;

const oldResult = calcOutstandingOLD(invoiceOutstanding, openingBalance, availableCredits);
const newResult = calcOutstandingNEW(invoiceOutstanding, openingBalance);

assert.strictEqual(oldResult, 9500,  'A7.1  OLD showed 9500 (double-deducted 500 credit)');
assert.strictEqual(newResult, 10000, 'A7.2  NEW shows correct 10000 outstanding');
assert.notStrictEqual(oldResult, newResult, 'A7.3  OLD and NEW differ (bug is real)');
assert.strictEqual(calcOutstandingOLD(5000, 0, 8000), 0,    'A7.4  OLD hid balance when credits > outstanding');
assert.strictEqual(calcOutstandingNEW(5000, 0),       5000, 'A7.5  NEW shows true outstanding');

console.log('  All A7 tests passed');

// ─── Credit note reversal safety ──────────────────────────────────────────────
console.log('\n── TEST GROUP: credit note reversal safety ──');

function reverseCreditNote(cn, amountToReverse) {
  const newUsed    = Math.max(0, money(money(cn.used_amount) - amountToReverse));
  const newBalance = money(money(cn.balance_amount) + amountToReverse);
  const newStatus  = newBalance >= cn.amount ? 'active' : 'partially_used';
  return { newUsed, newBalance, newStatus };
}

const cn = { amount: 1000, used_amount: 500, balance_amount: 500 };
const r = reverseCreditNote(cn, 500);
assert.strictEqual(r.newUsed,    0,        'CN.1  used_amount returns to 0 after full reversal');
assert.strictEqual(r.newBalance, 1000,     'CN.2  balance_amount returns to full amount');
assert.strictEqual(r.newStatus,  'active', 'CN.3  status returns to active');

const cnR2 = reverseCreditNote(cn, 700);
assert.strictEqual(cnR2.newUsed, 0, 'CN.4  used_amount floored at 0 (no negative)');

console.log('  All credit note safety tests passed');

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n==================================================');
console.log('  ALL PHASE A TESTS PASSED');
console.log('==================================================\n');
