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
function formatIndianCurrency(val) {
  const num = Number(val || 0);
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Returns a date-filtered customer party ledger as an array of transaction rows
 * with a running balance computed dynamically.
 *
 * Sources:
 *   1. Immutable Opening Balance seed row (with real customer opening_balance_date)
 *   2. Sales Invoices (debit: customer owes more)
 *   3. Customer Payments (credit: customer paid, showing allocation breakdown)
 *   4. Payment Reversals (debit: offset reversed payment, maintaining full audit trail)
 *   5. Credit Note Redemptions (credit: reduces debt)
 *
 * @param {number} customerId
 * @param {number|null} shopId
 * @param {{ from?: string, to?: string }} options
 * @returns {Promise<{ customer: object, opening_balance: number, rows: LedgerRow[], closing_balance: number, advance_balance: number }>}
 */
export async function getCustomerLedger(customerId, shopId, { from, to } = {}) {
  const fromDate = isoDate(from);
  const toDate   = isoDate(to);

  // Fetch customer
  const customer = await getRecord(
    `SELECT id, name, mobile, address, 
            COALESCE(opening_balance, 0) AS opening_balance,
            COALESCE(opening_balance_date, created_at::date, CURRENT_DATE) AS opening_balance_date,
            COALESCE(advance_balance, 0) AS advance_balance
     FROM customers WHERE id = ?`,
    [customerId]
  );
  if (!customer) throw Object.assign(new Error('Customer not found.'), { status: 404 });

  const openingBal = money(customer.opening_balance);

  // Fetch all transactions for this customer
  const rawRows = await fetchCustomerLedgerTransactions(customerId, shopId);

  // Compute running balance across all chronological transactions
  let currentBal = 0;
  const processedRows = [];

  for (const r of rawRows) {
    const dr = money(r.debit_amount);
    const cr = money(r.credit_amount);
    currentBal = money(currentBal + dr - cr);

    processedRows.push({
      id:              r.id,
      entry_date:      r.entry_date,
      created_at:      r.created_at,
      ref_no:          r.ref_no,
      entry_type:      r.entry_type,
      description:     r.description,
      allocation_breakdown: r.allocation_breakdown || null,
      debit:           dr,
      credit:          cr,
      running_balance: currentBal,
      reversed:        Boolean(r.reversed),
      reversed_at:     r.reversed_at || null,
    });
  }

  // Handle date filters: if fromDate or toDate specified
  let displayRows = processedRows;
  if (fromDate || toDate) {
    let preBalance = 0;
    const filtered = [];

    for (const row of processedRows) {
      const d = row.entry_date;
      if (fromDate && d < fromDate) {
        preBalance = row.running_balance;
      } else if (toDate && d > toDate) {
        // Excluded after toDate
      } else {
        filtered.push(row);
      }
    }

    if (fromDate && preBalance !== 0) {
      displayRows = [
        {
          id: 'b-fwd',
          entry_date: fromDate,
          created_at: fromDate + 'T00:00:00Z',
          ref_no: 'BAL-FWD',
          entry_type: 'opening_balance',
          description: `Balance Brought Forward as of ${fromDate}`,
          debit: preBalance > 0 ? preBalance : 0.00,
          credit: preBalance < 0 ? Math.abs(preBalance) : 0.00,
          running_balance: preBalance,
          reversed: false,
        },
        ...filtered,
      ];
    } else {
      displayRows = filtered;
    }
  }

  const closingBalance = processedRows.length
    ? money(processedRows[processedRows.length - 1].running_balance)
    : openingBal;

  return {
    customer,
    opening_balance: openingBal,
    advance_balance: money(customer.advance_balance),
    rows: displayRows,
    closing_balance: closingBalance,
  };
}

/**
 * Fetches all ledger component rows for a customer, including allocation breakdown strings
 * and reversal entries.
 */
async function fetchCustomerLedgerTransactions(customerId, shopId) {
  const shopCondSales = shopId ? 'AND s.shop_id = ?' : '';
  const shopCondPayments = shopId ? 'AND pm.shop_id = ?' : '';
  const shopCondCn = shopId ? 'AND s.shop_id = ?' : '';

  // 1. Immutable Opening Balance seed row
  const cust = await getRecord(
    `SELECT id, COALESCE(opening_balance, 0) AS ob, 
            COALESCE(opening_balance_date, created_at::date, CURRENT_DATE) AS ob_date,
            created_at
     FROM customers WHERE id = ?`,
    [customerId]
  );

  const obRows = [];
  if (cust && Number(cust.ob) > 0) {
    // Ensure Opening Balance date precedes or equals the earliest transaction date
    const earliestTx = await getRecord(
      `SELECT MIN(LEAST(
         COALESCE(s.invoice_date::date, s.sale_date::date, s.created_at::date),
         COALESCE((SELECT MIN(pm.payment_date::date) FROM payments pm WHERE pm.customer_id = ?), CURRENT_DATE)
       )) AS earliest_date FROM sales s WHERE s.customer_id = ?`,
      [customerId, customerId]
    );

    let effectiveObDate = cust.ob_date;
    if (earliestTx?.earliest_date) {
      const edStr = new Date(earliestTx.earliest_date).toISOString().slice(0, 10);
      const obStr = new Date(cust.ob_date).toISOString().slice(0, 10);
      if (edStr < obStr) {
        effectiveObDate = edStr;
      }
    }

    obRows.push({
      id: cust.id,
      entry_date: effectiveObDate,
      created_at: '1970-01-01T00:00:00Z', // Guarantees opening balance precedes same-day tx
      ref_no: 'OB-' + String(cust.id).padStart(6, '0'),
      entry_type: 'opening_balance',
      description: 'Opening Balance',
      allocation_breakdown: null,
      debit_amount: money(cust.ob),
      credit_amount: 0.00,
      reversed: false,
      reversed_at: null,
    });
  }

  // 2. Sales Invoices
  const salesParams = [customerId];
  if (shopId) salesParams.push(shopId);

  const salesRecords = await allRecords(
    `SELECT s.id,
            COALESCE(s.invoice_date, s.sale_date::date, s.created_at::date) AS entry_date,
            s.created_at,
            COALESCE(s.invoice_number, 'INV-' || LPAD(s.id::text, 6, '0')) AS ref_no,
            'sale' AS entry_type,
            COALESCE('Invoice #' || COALESCE(s.invoice_number, 'INV-' || LPAD(s.id::text, 6, '0')) || ' (' || p.short_name || ')', 'Invoice #' || COALESCE(s.invoice_number, 'INV-' || LPAD(s.id::text, 6, '0'))) AS description,
            s.total_amount AS debit_amount,
            0.00::numeric AS credit_amount
     FROM sales s
     LEFT JOIN products p ON p.id = s.product_id
     WHERE s.customer_id = ? ${shopCondSales}`,
    salesParams
  );

  const saleRows = salesRecords.map(s => ({
    id: s.id,
    entry_date: s.entry_date,
    created_at: s.created_at,
    ref_no: s.ref_no,
    entry_type: 'sale',
    description: s.description,
    allocation_breakdown: null,
    debit_amount: money(s.debit_amount),
    credit_amount: 0.00,
    reversed: false,
    reversed_at: null,
  }));

  // 3. Customer Payments & Allocation Breakdowns
  const paymentParams = [customerId];
  if (shopId) paymentParams.push(shopId);

  const paymentRecords = await allRecords(
    `SELECT pm.id,
            pm.payment_date::date AS entry_date,
            pm.created_at,
            COALESCE(pm.payment_number, 'PAY-' || LPAD(pm.id::text, 6, '0')) AS ref_no,
            pm.amount,
            pm.payment_mode,
            pm.reference_number,
            pm.unallocated_amount,
            pm.reversed_at
     FROM payments pm
     WHERE pm.customer_id = ? ${shopCondPayments}`,
    paymentParams
  );

  // Fetch allocations for all payments of this customer
  const allocations = await allRecords(
    `SELECT pa.payment_id,
            pa.allocation_type,
            pa.amount_applied,
            pa.sale_id,
            COALESCE(s.invoice_number, 'INV-' || LPAD(s.id::text, 6, '0')) AS invoice_number
     FROM payment_allocations pa
     LEFT JOIN sales s ON s.id = pa.sale_id
     WHERE pa.customer_id = ? AND pa.reversed_at IS NULL
     ORDER BY pa.id ASC`,
    [customerId]
  );

  const allocMap = new Map();
  for (const a of allocations) {
    if (!allocMap.has(a.payment_id)) allocMap.set(a.payment_id, []);
    allocMap.get(a.payment_id).push(a);
  }

  const paymentRows = [];
  const reversalRows = [];

  for (const pm of paymentRecords) {
    const pAllocs = allocMap.get(pm.id) || [];
    const breakdownParts = [];

    for (const pa of pAllocs) {
      if (pa.allocation_type === 'opening_balance') {
        breakdownParts.push(`Opening Balance: ${formatIndianCurrency(pa.amount_applied)}`);
      } else if (pa.allocation_type === 'invoice') {
        breakdownParts.push(`Invoice #${pa.invoice_number}: ${formatIndianCurrency(pa.amount_applied)}`);
      } else if (pa.allocation_type === 'advance') {
        breakdownParts.push(`Advance Credit: ${formatIndianCurrency(pa.amount_applied)}`);
      }
    }

    if (Number(pm.unallocated_amount) > 0 && !pAllocs.some(a => a.allocation_type === 'advance')) {
      breakdownParts.push(`Advance Credit: ${formatIndianCurrency(pm.unallocated_amount)}`);
    }

    const breakdownStr = breakdownParts.join(', ');

    let desc = `Payment received via ${pm.payment_mode || 'Payment'}`;
    if (pm.reference_number) desc += ` [Ref: ${pm.reference_number}]`;
    if (breakdownStr) desc += ` → ${breakdownStr}`;

    const isReversed = pm.reversed_at !== null;
    if (isReversed) {
      desc += ' [REVERSED]';
    }

    // Original payment row (always visible)
    paymentRows.push({
      id: pm.id,
      entry_date: pm.entry_date,
      created_at: pm.created_at,
      ref_no: pm.ref_no,
      entry_type: 'payment',
      description: desc,
      allocation_breakdown: breakdownStr || null,
      debit_amount: 0.00,
      credit_amount: money(pm.amount),
      reversed: isReversed,
      reversed_at: pm.reversed_at,
    });

    // If reversed, insert offsetting reversal row dated at reversal timestamp
    if (isReversed) {
      const revDate = new Date(pm.reversed_at).toISOString().slice(0, 10);
      let revDesc = `Reversal of Payment ${pm.ref_no}`;
      if (pm.reference_number) revDesc += ` [Ref: ${pm.reference_number}]`;

      reversalRows.push({
        id: pm.id + 9000000,
        entry_date: revDate,
        created_at: pm.reversed_at,
        ref_no: 'REV-' + pm.ref_no,
        entry_type: 'reversal',
        description: revDesc,
        allocation_breakdown: null,
        debit_amount: money(pm.amount), // Offsets original credit
        credit_amount: 0.00,
        reversed: false,
        reversed_at: null,
      });
    }
  }

  // 4. Credit Note Redemptions
  const cnParams = [customerId];
  if (shopId) cnParams.push(shopId);

  const cnRecords = await allRecords(
    `SELECT cnr.id,
            cnr.created_at::date AS entry_date,
            cnr.created_at,
            cn.credit_note_number AS ref_no,
            'credit_note' AS entry_type,
            'Credit Note: ' || cn.credit_note_number AS description,
            0.00::numeric AS debit_amount,
            cnr.amount AS credit_amount
     FROM credit_note_redemptions cnr
     JOIN credit_notes cn ON cn.id = cnr.credit_note_id
     JOIN sales s ON s.id = cnr.sale_id
     WHERE cn.customer_id = ? ${shopCondCn}`,
    cnParams
  );

  const cnRows = cnRecords.map(c => ({
    id: c.id,
    entry_date: c.entry_date,
    created_at: c.created_at,
    ref_no: c.ref_no,
    entry_type: 'credit_note',
    description: c.description,
    allocation_breakdown: null,
    debit_amount: 0.00,
    credit_amount: money(c.credit_amount),
    reversed: false,
    reversed_at: null,
  }));

  // Combine and sort chronologically
  const allRows = [
    ...obRows,
    ...saleRows,
    ...paymentRows,
    ...reversalRows,
    ...cnRows,
  ];

  allRows.sort((a, b) => {
    // 1. Entry date ASC
    if (a.entry_date < b.entry_date) return -1;
    if (a.entry_date > b.entry_date) return 1;

    // 2. Opening balance always precedes any same-day transactions
    if (a.entry_type === 'opening_balance' && b.entry_type !== 'opening_balance') return -1;
    if (b.entry_type === 'opening_balance' && a.entry_type !== 'opening_balance') return 1;

    // 3. Created at ASC
    if (a.created_at && b.created_at) {
      if (a.created_at < b.created_at) return -1;
      if (a.created_at > b.created_at) return 1;
    }

    // 4. Fallback to ID
    return Number(a.id || 0) - Number(b.id || 0);
  });

  return allRows;
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
  const shopCondC = shopId ? 'AND c2.shop_id = ?' : '';

  const sql = `
    WITH cust_unsettled_ob AS (
      SELECT 
        c_sub.id,
        GREATEST(0, COALESCE(c_sub.opening_balance, 0) - COALESCE(
          (SELECT SUM(pa.amount_applied) 
           FROM payment_allocations pa 
           WHERE pa.customer_id = c_sub.id 
             AND pa.allocation_type = 'opening_balance' 
             AND pa.reversed_at IS NULL), 0
        )) AS unsettled_ob
      FROM customers c_sub
    )
    SELECT
      c.id                                                                       AS customer_id,
      c.name                                                                     AS customer_name,
      c.mobile,
      -- unsettled opening_balance is added to the current bucket (no due date association)
      ROUND((COALESCE(SUM(CASE
        WHEN s.due_date::date > ?::date THEN s.pending_amount
        ELSE 0 END), 0) + COALESCE(MAX(uob.unsettled_ob), 0))::numeric, 2)       AS current_bucket,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date BETWEEN ?::date - 30 AND ?::date THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                             AS d1_30,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date BETWEEN ?::date - 60 AND ?::date - 31 THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                             AS d31_60,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date BETWEEN ?::date - 90 AND ?::date - 61 THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                             AS d61_90,
      ROUND(COALESCE(SUM(CASE
        WHEN s.due_date::date < ?::date - 90 THEN s.pending_amount
        ELSE 0 END), 0)::numeric, 2)                                             AS d90_plus,
      -- total = sum of all pending sales + unsettled opening_balance
      ROUND((COALESCE(SUM(s.pending_amount), 0) + COALESCE(MAX(uob.unsettled_ob), 0))::numeric, 2)
                                                                                 AS total_outstanding
    FROM customers c
    JOIN cust_unsettled_ob uob ON uob.id = c.id
    LEFT JOIN sales s ON s.customer_id = c.id AND s.pending_amount > 0 ${shopCond}
    WHERE (s.id IS NOT NULL OR uob.unsettled_ob > 0)
      AND c.id IN (
        SELECT DISTINCT c2.id FROM customers c2
        JOIN cust_unsettled_ob uob2 ON uob2.id = c2.id
        LEFT JOIN sales s2 ON s2.customer_id = c2.id AND s2.pending_amount > 0 ${shopCondC}
        WHERE s2.id IS NOT NULL OR uob2.unsettled_ob > 0
      )
    GROUP BY c.id, c.name, c.mobile
    HAVING (COALESCE(SUM(s.pending_amount), 0) + COALESCE(MAX(uob.unsettled_ob), 0)) > 0
    ORDER BY total_outstanding DESC
  `;

  // Placeholders: 5 asOf for CASE buckets (current uses 1, then 1-30, 31-60, 61-90, 90+)
  // + shopId (if any) for the LEFT JOIN condition
  // + shopId (if any) for the subquery
  const fullParams = [asOf, asOf, asOf, asOf, asOf, asOf, asOf, asOf];
  if (shopId) fullParams.push(shopId);
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
