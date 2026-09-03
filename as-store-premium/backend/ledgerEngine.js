/**
 * ledgerEngine.js — Party ledger + AR/AP aging query engine
 *
 * No GST. All amounts are net (quantity * unit_price - discount_amount).
 *
 * Functions return plain arrays/objects — they never touch res/req.
 * Import and call inside route handlers.
 *
 * Usage:
 *   import { getCustomerLedger, getARAgingReport } from './ledgerEngine.js';
 */

import { allRecords, getRecord } from './database.js';

// ─── Internal helper ──────────────────────────────────────────────────────────

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

function isoDate(d) {
  if (!d) return null;
  const s = String(d).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// ─── Customer Party Ledger ────────────────────────────────────────────────────

/**
 * Returns a date-filtered customer party ledger as an array of transaction rows
 * with a running balance computed in the database via a window function.
 *
 * The ledger is built from three sources (no live journal_entries dependency —
 * works even before backfill):
 *   1. Opening balance (seed row)
 *   2. Sales (invoices) — positive debit entries
 *   3. Payments — negative credit entries
 *   4. Credit note redemptions — negative credit entries
 *
 * @param {number} customerId
 * @param {number|null} shopId
 * @param {{ from?: string, to?: string }} options  - ISO date strings
 * @returns {Promise<{ opening_balance: number, rows: LedgerRow[], closing_balance: number }>}
 */
export async function getCustomerLedger(customerId, shopId, { from, to } = {}) {
  const fromDate = isoDate(from);
  const toDate   = isoDate(to);

  // Fetch customer
  const customer = await getRecord(
    'SELECT id, name, mobile, COALESCE(opening_balance, 0) AS opening_balance FROM customers WHERE id = ?',
    [customerId]
  );
  if (!customer) throw Object.assign(new Error('Customer not found.'), { status: 404 });

  const openingBal = money(customer.opening_balance);

  // Build unified ledger via UNION ALL in SQL (runs in a single round-trip)
  // Each source row has: entry_date, ref_no, type, description, debit, credit
  const shopFilter   = shopId ? 'AND s.shop_id = $6'              : '';
  const fromFilter   = fromDate ? 'AND entry_date >= $7::date'    : '';
  const toFilter     = toDate   ? 'AND entry_date <= $8::date'    : '';

  // We use plain parameterised SQL here (PostgreSQL syntax directly, not the ? shim,
  // because this query has complex CTEs and positional params are cleaner).
  const params = [customerId];
  let paramIdx = 2;

  const shopParam  = shopId   ? `$${paramIdx++}` : 'NULL';
  const fromParam  = fromDate ? `$${paramIdx++}` : 'NULL';
  const toParam    = toDate   ? `$${paramIdx++}` : 'NULL';

  if (shopId)   params.push(shopId);
  if (fromDate) params.push(fromDate);
  if (toDate)   params.push(toDate);

  const shopCond = shopId   ? `AND s.shop_id = ${shopParam}` : '';
  const fromCond = fromDate ? `AND entry_date >= ${fromParam}::date` : '';
  const toCond   = toDate   ? `AND entry_date <= ${toParam}::date`   : '';

  const sql = `
    WITH ledger_rows AS (
      -- Opening balance (always shown, date = epoch)
      SELECT
        '1900-01-01'::date                   AS entry_date,
        'OPEN-BAL'                           AS ref_no,
        'opening_balance'                    AS entry_type,
        'Opening Balance'                    AS description,
        $1::numeric                          AS debit_amount,
        0::numeric                           AS credit_amount
      WHERE $1 > 0

      UNION ALL

      -- Sales invoices
      SELECT
        COALESCE(s.invoice_date, s.created_at::date) AS entry_date,
        COALESCE(s.invoice_number, 'INV-' || LPAD(s.id::TEXT, 6, '0')) AS ref_no,
        'sale'                               AS entry_type,
        COALESCE(
          'Invoice: ' || p.short_name,
          'Invoice'
        )                                    AS description,
        s.total_amount                       AS debit_amount,
        0::numeric                           AS credit_amount
      FROM sales s
      LEFT JOIN products p ON p.id = s.product_id
      WHERE s.customer_id = $1
        ${shopCond}

      UNION ALL

      -- Payments received
      SELECT
        pm.payment_date::date                AS entry_date,
        COALESCE(s.invoice_number, 'INV-' || LPAD(pm.sale_id::TEXT, 6, '0')) AS ref_no,
        'payment'                            AS entry_type,
        COALESCE('Payment via ' || pm.payment_mode, 'Payment') AS description,
        0::numeric                           AS debit_amount,
        pm.amount                            AS credit_amount
      FROM payments pm
      JOIN sales s ON s.id = pm.sale_id
      WHERE s.customer_id = $1
        ${shopCond}

      UNION ALL

      -- Credit note redemptions (reduce what customer owes)
      SELECT
        cnr.created_at::date                 AS entry_date,
        cn.credit_note_number                AS ref_no,
        'credit_note'                        AS entry_type,
        'Credit Note Applied: ' || cn.credit_note_number AS description,
        0::numeric                           AS debit_amount,
        cnr.amount                           AS credit_amount
      FROM credit_note_redemptions cnr
      JOIN credit_notes cn ON cn.id = cnr.credit_note_id
      JOIN sales s ON s.id = cnr.sale_id
      WHERE cn.customer_id = $1
        ${shopCond}
    ),
    filtered AS (
      SELECT * FROM ledger_rows
      WHERE (entry_date = '1900-01-01' OR (
        (${fromDate ? `entry_date >= ${fromParam}::date` : 'TRUE'})
        AND
        (${toDate ? `entry_date <= ${toParam}::date` : 'TRUE'})
      ))
    ),
    with_balance AS (
      SELECT
        entry_date,
        ref_no,
        entry_type,
        description,
        ROUND(debit_amount::numeric, 2)       AS debit,
        ROUND(credit_amount::numeric, 2)      AS credit,
        ROUND(
          SUM(debit_amount - credit_amount) OVER (
            ORDER BY entry_date ASC, entry_type DESC, ref_no ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )::numeric,
          2
        )                                     AS running_balance
      FROM filtered
    )
    SELECT * FROM with_balance
    ORDER BY entry_date ASC, entry_type DESC, ref_no ASC
  `;

  const { Pool } = await import('pg');
  // Re-use the pool exported from database.js by importing the module directly
  const { allRecords: dbAll } = await import('./database.js');

  // We need raw pg query for positional params; use allRecords fallback approach
  // by substituting params into the SQL string (safe — all are numbers/dates)
  // Build a ? version for the convertSql shim in database.js
  const safeRows = await runRawLedgerQuery(customerId, shopId, fromDate, toDate);

  const rows = safeRows.map(r => ({
    entry_date:      r.entry_date,
    ref_no:          r.ref_no,
    entry_type:      r.entry_type,
    description:     r.description,
    debit:           money(r.debit),
    credit:          money(r.credit),
    running_balance: money(r.running_balance),
  }));

  const closingBalance = rows.length ? money(rows[rows.length - 1].running_balance) : openingBal;

  return { customer, opening_balance: openingBal, rows, closing_balance: closingBalance };
}

// Use allRecords from database.js (which uses the ? shim → $N conversion)
async function runRawLedgerQuery(customerId, shopId, fromDate, toDate) {
  const shopCond = shopId   ? 'AND s.shop_id = ?'                    : '';
  const fromCond = fromDate ? "AND entry_date >= ?::date"             : '';
  const toCond   = toDate   ? "AND entry_date <= ?::date"             : '';

  // Params for all ? placeholders in order
  // opening_balance placeholder uses customerId twice (once for $1 amount lookup)
  const params = [];

  // We embed the opening balance lookup as a subselect to keep the ? param order clean
  const sqlQuery = `
    WITH customer_ob AS (
      SELECT COALESCE(opening_balance, 0) AS ob FROM customers WHERE id = ?
    ),
    ledger_rows AS (
      SELECT
        '1900-01-01'::date         AS entry_date,
        'OPEN-BAL'                 AS ref_no,
        'opening_balance'          AS entry_type,
        'Opening Balance'          AS description,
        ob                         AS debit_amount,
        0.00::numeric              AS credit_amount
      FROM customer_ob WHERE ob > 0

      UNION ALL

      SELECT
        COALESCE(s.invoice_date, s.created_at::date) AS entry_date,
        COALESCE(s.invoice_number, 'INV-' || LPAD(s.id::TEXT, 6, '0')) AS ref_no,
        'sale'                    AS entry_type,
        COALESCE('Invoice: ' || p.short_name, 'Invoice') AS description,
        s.total_amount            AS debit_amount,
        0.00::numeric             AS credit_amount
      FROM sales s
      LEFT JOIN products p ON p.id = s.product_id
      WHERE s.customer_id = ? ${shopId ? 'AND s.shop_id = ?' : ''}

      UNION ALL

      SELECT
        pm.payment_date::date     AS entry_date,
        COALESCE(s.invoice_number, 'INV-' || LPAD(pm.sale_id::TEXT, 6, '0')) AS ref_no,
        'payment'                 AS entry_type,
        COALESCE('Payment via ' || pm.payment_mode, 'Payment') AS description,
        0.00::numeric             AS debit_amount,
        pm.amount                 AS credit_amount
      FROM payments pm
      JOIN sales s ON s.id = pm.sale_id
      WHERE s.customer_id = ? ${shopId ? 'AND s.shop_id = ?' : ''}

      UNION ALL

      SELECT
        cnr.created_at::date      AS entry_date,
        cn.credit_note_number     AS ref_no,
        'credit_note'             AS entry_type,
        'Credit Note: ' || cn.credit_note_number AS description,
        0.00::numeric             AS debit_amount,
        cnr.amount                AS credit_amount
      FROM credit_note_redemptions cnr
      JOIN credit_notes cn ON cn.id = cnr.credit_note_id
      JOIN sales s ON s.id = cnr.sale_id
      WHERE cn.customer_id = ? ${shopId ? 'AND s.shop_id = ?' : ''}
    ),
    filtered AS (
      SELECT * FROM ledger_rows
      WHERE (
        entry_date = '1900-01-01'
        OR (
          ${fromDate ? 'entry_date >= ?::date AND' : ''}
          ${toDate   ? 'entry_date <= ?::date AND' : ''}
          TRUE
        )
      )
    ),
    with_balance AS (
      SELECT
        entry_date,
        ref_no,
        entry_type,
        description,
        ROUND(debit_amount::numeric, 2)  AS debit,
        ROUND(credit_amount::numeric, 2) AS credit,
        ROUND(
          SUM(debit_amount - credit_amount) OVER (
            ORDER BY entry_date ASC, entry_type DESC, ref_no ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )::numeric,
          2
        )                                AS running_balance
      FROM filtered
    )
    SELECT * FROM with_balance
    ORDER BY entry_date ASC, entry_type DESC, ref_no ASC
  `;

  // Build params array matching the ? placeholders in order
  params.push(customerId);         // customer_ob
  params.push(customerId);         // sales WHERE customer_id
  if (shopId) params.push(shopId); // sales shop_id
  params.push(customerId);         // payments via sales
  if (shopId) params.push(shopId); // payments shop_id
  params.push(customerId);         // credit notes
  if (shopId) params.push(shopId); // credit notes shop_id
  if (fromDate) params.push(fromDate);
  if (toDate)   params.push(toDate);

  return allRecords(sqlQuery, params);
}

// ─── Vendor Party Ledger ──────────────────────────────────────────────────────

/**
 * Returns a date-filtered vendor party ledger.
 * Sources: purchase_bills (debit = we owe), payments to vendor (credit), debit notes (credit).
 *
 * @param {number} supplierId
 * @param {number|null} shopId
 * @param {{ from?: string, to?: string }} options
 */
export async function getVendorLedger(supplierId, shopId, { from, to } = {}) {
  const fromDate = isoDate(from);
  const toDate   = isoDate(to);

  const supplier = await getRecord(
    'SELECT id, name FROM suppliers WHERE id = ?',
    [supplierId]
  );
  if (!supplier) throw Object.assign(new Error('Supplier not found.'), { status: 404 });

  const shopCond = shopId ? 'AND pb.shop_id = ?' : '';
  const shopCondDn = shopId ? 'AND dn.shop_id = ?' : '';

  const sqlQuery = `
    WITH ledger_rows AS (
      SELECT
        pb.bill_date              AS entry_date,
        pb.bill_number            AS ref_no,
        'purchase_bill'           AS entry_type,
        'Purchase Bill'           AS description,
        pb.total_amount           AS debit_amount,
        0.00::numeric             AS credit_amount
      FROM purchase_bills pb
      WHERE pb.supplier_id = ? ${shopCond}

      UNION ALL

      SELECT
        pb.bill_date              AS entry_date,
        pb.bill_number            AS ref_no,
        'bill_payment'            AS entry_type,
        'Payment to Vendor'       AS description,
        0.00::numeric             AS debit_amount,
        pb.paid_amount            AS credit_amount
      FROM purchase_bills pb
      WHERE pb.supplier_id = ? AND pb.paid_amount > 0 ${shopCond}

      UNION ALL

      SELECT
        dn.return_date            AS entry_date,
        dn.debit_note_number      AS ref_no,
        'debit_note'              AS entry_type,
        COALESCE('Debit Note: ' || dn.reason, 'Debit Note') AS description,
        0.00::numeric             AS debit_amount,
        dn.amount                 AS credit_amount
      FROM debit_notes dn
      WHERE dn.supplier_id = ? ${shopCondDn}
    ),
    filtered AS (
      SELECT * FROM ledger_rows
      WHERE (
        ${fromDate ? 'entry_date >= ?::date AND' : ''}
        ${toDate   ? 'entry_date <= ?::date AND' : ''}
        TRUE
      )
    ),
    with_balance AS (
      SELECT
        entry_date, ref_no, entry_type, description,
        ROUND(debit_amount::numeric, 2)  AS debit,
        ROUND(credit_amount::numeric, 2) AS credit,
        ROUND(
          SUM(debit_amount - credit_amount) OVER (
            ORDER BY entry_date ASC, ref_no ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )::numeric,
          2
        )                                AS running_balance
      FROM filtered
    )
    SELECT * FROM with_balance ORDER BY entry_date ASC, ref_no ASC
  `;

  const params = [];
  params.push(supplierId); if (shopId) params.push(shopId);  // purchase_bills
  params.push(supplierId); if (shopId) params.push(shopId);  // bill_payments
  params.push(supplierId); if (shopId) params.push(shopId);  // debit_notes
  if (fromDate) params.push(fromDate);
  if (toDate)   params.push(toDate);

  const rows = (await allRecords(sqlQuery, params)).map(r => ({
    entry_date:      r.entry_date,
    ref_no:          r.ref_no,
    entry_type:      r.entry_type,
    description:     r.description,
    debit:           money(r.debit),
    credit:          money(r.credit),
    running_balance: money(r.running_balance),
  }));

  const closingBalance = rows.length ? money(rows[rows.length - 1].running_balance) : 0;
  return { supplier, rows, closing_balance: closingBalance };
}

// ─── AR Aging Report ──────────────────────────────────────────────────────────

/**
 * Accounts Receivable aging report.
 * Buckets invoices by (asOfDate - due_date):
 *   current (not yet due), 1-30, 31-60, 61-90, 90+ days overdue.
 *
 * @param {number|null} shopId
 * @param {string} asOfDate  - ISO date string (defaults to today)
 * @returns {Promise<{ rows: AgingRow[], summary: AgingSummary }>}
 */
export async function getARAgingReport(shopId, asOfDate) {
  const asOf = isoDate(asOfDate) || new Date().toISOString().slice(0, 10);
  const shopCond = shopId ? 'AND s.shop_id = ?' : '';
  const params = [asOf, asOf, asOf, asOf, asOf];
  if (shopId) { params.push(shopId); }

  const sql = `
    SELECT
      c.id                                                           AS customer_id,
      c.name                                                         AS customer_name,
      c.mobile,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date > ?::date THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                 AS current_bucket,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date BETWEEN ?::date - 30 AND ?::date THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                 AS d1_30,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date BETWEEN ?::date - 60 AND ?::date - 31 THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                 AS d31_60,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date BETWEEN ?::date - 90 AND ?::date - 61 THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                 AS d61_90,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date < ?::date - 90 THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                 AS d90_plus,
      ROUND(COALESCE(SUM(s.pending_amount), 0)::numeric, 2)          AS total_outstanding
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.pending_amount > 0 ${shopCond}
    GROUP BY c.id, c.name, c.mobile
    HAVING SUM(s.pending_amount) > 0
    ORDER BY total_outstanding DESC
  `;

  // Inject the asOf date for each CASE expression — 8 placeholders in the SQL above
  const fullParams = [asOf, asOf, asOf, asOf, asOf, asOf, asOf, asOf];
  if (shopId) fullParams.push(shopId);

  const rows = await allRecords(sql, fullParams);

  const summary = rows.reduce(
    (acc, r) => {
      acc.current_bucket += money(r.current_bucket);
      acc.d1_30          += money(r.d1_30);
      acc.d31_60         += money(r.d31_60);
      acc.d61_90         += money(r.d61_90);
      acc.d90_plus       += money(r.d90_plus);
      acc.total          += money(r.total_outstanding);
      return acc;
    },
    { current_bucket: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 }
  );

  return {
    as_of_date: asOf,
    rows: rows.map(r => ({
      customer_id:      r.customer_id,
      customer_name:    r.customer_name,
      mobile:           r.mobile,
      current_bucket:   money(r.current_bucket),
      d1_30:            money(r.d1_30),
      d31_60:           money(r.d31_60),
      d61_90:           money(r.d61_90),
      d90_plus:         money(r.d90_plus),
      total_outstanding: money(r.total_outstanding),
    })),
    summary,
  };
}

// ─── AP Aging Report ──────────────────────────────────────────────────────────

/**
 * Accounts Payable aging report — mirrors AR aging but for purchase_bills.
 *
 * @param {number|null} shopId
 * @param {string} asOfDate
 */
export async function getAPAgingReport(shopId, asOfDate) {
  const asOf = isoDate(asOfDate) || new Date().toISOString().slice(0, 10);
  const shopCond = shopId ? 'AND pb.shop_id = ?' : '';

  const sql = `
    SELECT
      s.id                                                            AS supplier_id,
      s.name                                                          AS supplier_name,
      ROUND(COALESCE(SUM(CASE
        WHEN pb.due_date::date > ?::date THEN pb.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                  AS current_bucket,
      ROUND(COALESCE(SUM(CASE
        WHEN pb.due_date::date BETWEEN ?::date - 30 AND ?::date THEN pb.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                  AS d1_30,
      ROUND(COALESCE(SUM(CASE
        WHEN pb.due_date::date BETWEEN ?::date - 60 AND ?::date - 31 THEN pb.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                  AS d31_60,
      ROUND(COALESCE(SUM(CASE
        WHEN pb.due_date::date BETWEEN ?::date - 90 AND ?::date - 61 THEN pb.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                  AS d61_90,
      ROUND(COALESCE(SUM(CASE
        WHEN pb.due_date::date < ?::date - 90 THEN pb.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                  AS d90_plus,
      ROUND(COALESCE(SUM(pb.pending_amount), 0)::numeric, 2)          AS total_outstanding
    FROM purchase_bills pb
    JOIN suppliers s ON s.id = pb.supplier_id
    WHERE pb.pending_amount > 0 ${shopCond}
    GROUP BY s.id, s.name
    HAVING SUM(pb.pending_amount) > 0
    ORDER BY total_outstanding DESC
  `;

  const fullParams = [asOf, asOf, asOf, asOf, asOf, asOf, asOf, asOf];
  if (shopId) fullParams.push(shopId);

  const rows = await allRecords(sql, fullParams);

  const summary = rows.reduce(
    (acc, r) => {
      acc.current_bucket += money(r.current_bucket);
      acc.d1_30          += money(r.d1_30);
      acc.d31_60         += money(r.d31_60);
      acc.d61_90         += money(r.d61_90);
      acc.d90_plus       += money(r.d90_plus);
      acc.total          += money(r.total_outstanding);
      return acc;
    },
    { current_bucket: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 }
  );

  return {
    as_of_date: asOf,
    rows: rows.map(r => ({
      supplier_id:      r.supplier_id,
      supplier_name:    r.supplier_name,
      current_bucket:   money(r.current_bucket),
      d1_30:            money(r.d1_30),
      d31_60:           money(r.d31_60),
      d61_90:           money(r.d61_90),
      d90_plus:         money(r.d90_plus),
      total_outstanding: money(r.total_outstanding),
    })),
    summary,
  };
}
