import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, allRecords, getRecord, runQuery } from '../database.js';
import { getCustomerLedger, getCustomerTotalOutstanding } from '../ledgerEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Root workspace directory: c:\Users\D-1\Downloads\Pinky-Sales--main
const workspaceRoot = path.resolve(__dirname, '../../../../');

const money = (val) => Math.round(Number(val || 0) * 100) / 100;
const fmt = (val) => '₹' + Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function inspectCustomerJagdish() {
  console.log('================================================================');
  console.log('   AUDIT & RESEARCH: CUSTOMER JAGDISHBHAI ACCOUNTING');
  console.log('================================================================\n');

  const report = {
    generated_at: new Date().toISOString(),
    query_target: 'jagdish',
    customers_found: [],
    all_customers: [],
  };

  const textLines = [];
  const log = (msg = '') => {
    console.log(msg);
    textLines.push(msg);
  };

  log(`Audit Generated: ${new Date().toLocaleString()}`);
  log('Searching across database for "jagdish"...');

  // Search in customers table
  let directMatches = [];
  try {
    directMatches = await allRecords(`
      SELECT id, name, mobile, address, notes, opening_balance, opening_balance_date,
             current_balance, advance_balance, shop_id, created_at
      FROM customers
      WHERE LOWER(name) LIKE '%jagdish%' 
         OR mobile LIKE '%jagdish%'
         OR LOWER(COALESCE(notes, '')) LIKE '%jagdish%'
      ORDER BY id ASC
    `);
  } catch (err) {
    log(`Warning querying direct customer matches: ${err.message}`);
  }

  // Search in sales notes
  let salesMatches = [];
  try {
    salesMatches = await allRecords(`
      SELECT DISTINCT customer_id
      FROM sales
      WHERE customer_id IS NOT NULL 
        AND LOWER(COALESCE(notes, '')) LIKE '%jagdish%'
    `);
  } catch (err) {
    log(`Warning querying sales notes matches: ${err.message}`);
  }

  // Search in payments notes
  let paymentsMatches = [];
  try {
    paymentsMatches = await allRecords(`
      SELECT DISTINCT customer_id
      FROM payments
      WHERE customer_id IS NOT NULL 
        AND LOWER(COALESCE(notes, '')) LIKE '%jagdish%'
    `);
  } catch (err) {
    log(`Warning querying payments notes matches: ${err.message}`);
  }

  const matchedCustomerIds = new Set();
  directMatches.forEach(c => matchedCustomerIds.add(c.id));
  salesMatches.forEach(s => matchedCustomerIds.add(s.customer_id));
  paymentsMatches.forEach(p => matchedCustomerIds.add(p.customer_id));

  // If still no matches, search for 'jag'
  if (matchedCustomerIds.size === 0) {
    log('No exact "jagdish" found. Broadening search to "jag"...');
    try {
      const jagMatches = await allRecords(`
        SELECT id FROM customers WHERE LOWER(name) LIKE '%jag%'
      `);
      jagMatches.forEach(j => matchedCustomerIds.add(j.id));
    } catch (err) {
      log(`Warning querying 'jag' matches: ${err.message}`);
    }
  }

  let customersToAudit = [];
  if (matchedCustomerIds.size > 0) {
    const idList = Array.from(matchedCustomerIds).join(',');
    try {
      customersToAudit = await allRecords(`
        SELECT id, name, mobile, address, notes, opening_balance, opening_balance_date,
               current_balance, advance_balance, shop_id, created_at
        FROM customers
        WHERE id IN (${idList})
        ORDER BY id ASC
      `);
      log(`Found ${customersToAudit.length} customer(s) associated with "jagdish":\n`);
    } catch (err) {
      log(`Error fetching customer records: ${err.message}`);
    }
  } else {
    log('⚠️ No customer directly matched "jagdish" or "jag". Auditing all customers below.');
  }

  // Also fetch ALL customers summary to ensure 100% visibility
  let allCust = [];
  try {
    allCust = await allRecords(`
      SELECT c.id, c.name, c.mobile, c.opening_balance, c.current_balance, c.advance_balance,
             (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id) AS sales_count,
             (SELECT COUNT(*) FROM payments p WHERE p.customer_id = c.id) AS payments_count
      FROM customers c
      ORDER BY c.id ASC
    `);
    report.all_customers = allCust;
  } catch (err) {
    log(`Warning fetching all customers list: ${err.message}`);
  }

  for (const c of customersToAudit) {
    const custData = {
      customer: c,
      sales: [],
      payments: [],
      payment_allocations: [],
      credit_notes: [],
      sales_returns: [],
      ledger_entries: [],
      ledgerEngine_ledger: null,
      ledgerEngine_outstanding: null,
      discrepancies: [],
    };

    log('================================================================');
    log(`AUDIT FOR CUSTOMER [ID ${c.id}]: ${c.name}`);
    log(`Mobile: ${c.mobile || 'None'} | Notes: ${c.notes || 'None'}`);
    log(`Opening Balance: ${fmt(c.opening_balance)} (Date: ${c.opening_balance_date || 'None'})`);
    log(`Current Balance: ${fmt(c.current_balance)} | Advance Balance: ${fmt(c.advance_balance)}`);
    log('================================================================\n');

    // 1. Sales
    let sales = [];
    try {
      sales = await allRecords(`
        SELECT s.*, 
               (SELECT json_agg(si.*) FROM sale_items si WHERE si.sale_id = s.id) AS items
        FROM sales s
        WHERE s.customer_id = ?
        ORDER BY COALESCE(s.invoice_date, s.sale_date::date, s.created_at::date) ASC, s.id ASC
      `, [c.id]);
    } catch (err) {
      log(`Error fetching sales: ${err.message}`);
    }
    custData.sales = sales;

    log(`--- SALES INVOICES (${sales.length}) ---`);
    let sumInvoiced = 0;
    let sumPaidOnSales = 0;
    let sumPendingOnSales = 0;

    sales.forEach(s => {
      const invTotal = money(s.current_invoice_total || s.total_amount);
      const paid = money(s.paid_amount);
      const pending = money(s.pending_amount);
      sumInvoiced += invTotal;
      sumPaidOnSales += paid;
      sumPendingOnSales += pending;

      log(`• Invoice #${s.invoice_number || s.id} (${s.invoice_date || s.sale_date || s.created_at})`);
      log(`  Total: ${fmt(invTotal)} (orig: ${fmt(s.total_amount)}, curr: ${fmt(s.current_invoice_total)}) | Paid: ${fmt(paid)} | Pending: ${fmt(pending)} | Status: ${s.status} | Mode: ${s.payment_mode}`);
      if (s.applied_credit_amount > 0 || s.advance_applied > 0) {
        log(`  Applied CN: ${fmt(s.applied_credit_amount)} | Advance Applied: ${fmt(s.advance_applied)}`);
      }
      if (s.notes) log(`  Invoice Notes: ${s.notes}`);

      // Check item sum vs total
      if (s.items && Array.isArray(s.items) && s.items.length > 0) {
        const itemSum = s.items.reduce((acc, item) => acc + money(item.total_price || (item.quantity * item.unit_price)), 0);
        if (Math.abs(itemSum - invTotal) > 1) {
          const disc = `Sale #${s.invoice_number}: Line items sum (${fmt(itemSum)}) does not match invoice total (${fmt(invTotal)})`;
          log(`  ⚠️ ${disc}`);
          custData.discrepancies.push(disc);
        }
      }

      // Check paid + pending vs invoice total
      if (Math.abs(money(paid + pending) - invTotal) > 0.05) {
        const disc = `Sale #${s.invoice_number}: Paid (${fmt(paid)}) + Pending (${fmt(pending)}) = ${fmt(paid + pending)} != Total (${fmt(invTotal)})`;
        log(`  ⚠️ ${disc}`);
        custData.discrepancies.push(disc);
      }
    });
    log(`Summary -> Total Invoiced: ${fmt(sumInvoiced)} | Paid on Sales: ${fmt(sumPaidOnSales)} | Pending on Sales: ${fmt(sumPendingOnSales)}\n`);

    // 2. Payments
    let payments = [];
    try {
      payments = await allRecords(`
        SELECT * FROM payments 
        WHERE customer_id = ?
        ORDER BY payment_date ASC, id ASC
      `, [c.id]);
    } catch (err) {
      log(`Error fetching payments: ${err.message}`);
    }
    custData.payments = payments;

    log(`--- PAYMENTS RECEIVED (${payments.length}) ---`);
    let sumPaymentsTotal = 0;
    let sumValidPayments = 0;

    payments.forEach(p => {
      const amt = money(p.amount);
      sumPaymentsTotal += amt;
      const isReversed = p.reversed_at !== null;
      const isCreditNoteMode = (p.payment_mode || '').toLowerCase() === 'credit_note';
      if (!isReversed && !isCreditNoteMode) {
        sumValidPayments += amt;
      }

      log(`• Payment #${p.payment_number || p.id} (${p.payment_date}) | Amount: ${fmt(amt)} | Mode: ${p.payment_mode}`);
      log(`  Unallocated: ${fmt(p.unallocated_amount)} | Sale ID: ${p.sale_id || 'None'} | Ref: ${p.reference_number || 'None'}`);
      if (isReversed) log(`  ⚠️ STATUS: REVERSED at ${p.reversed_at}`);
      if (isCreditNoteMode) log(`  ℹ️ Internal credit_note mode payment voucher`);
      if (p.notes) log(`  Notes: ${p.notes}`);
    });
    log(`Summary -> Total Logged: ${fmt(sumPaymentsTotal)} | Real Valid External Payments: ${fmt(sumValidPayments)}\n`);

    // 3. Payment Allocations
    let allocations = [];
    try {
      allocations = await allRecords(`
        SELECT pa.*, s.invoice_number, s.total_amount AS invoice_total
        FROM payment_allocations pa
        LEFT JOIN sales s ON s.id = pa.sale_id
        WHERE pa.customer_id = ?
        ORDER BY pa.id ASC
      `, [c.id]);
    } catch (err) {
      log(`Error fetching payment allocations: ${err.message}`);
    }
    custData.payment_allocations = allocations;

    log(`--- PAYMENT ALLOCATIONS (${allocations.length}) ---`);
    let sumAllocatedOB = 0;
    let sumAllocatedInvoices = 0;
    let sumAllocatedAdvance = 0;

    allocations.forEach(pa => {
      const amt = money(pa.amount_applied);
      if (!pa.reversed_at) {
        if (pa.allocation_type === 'opening_balance') sumAllocatedOB += amt;
        else if (pa.allocation_type === 'invoice') sumAllocatedInvoices += amt;
        else if (pa.allocation_type === 'advance') sumAllocatedAdvance += amt;
      }
      log(`• Alloc #${pa.id} (from Payment #${pa.payment_id}) -> Type: ${pa.allocation_type} | Applied: ${fmt(amt)} | Target: ${pa.invoice_number || 'Opening Balance'} ${pa.reversed_at ? '[REVERSED]' : ''}`);
    });
    log(`Summary -> Towards OB: ${fmt(sumAllocatedOB)} | Towards Invoices: ${fmt(sumAllocatedInvoices)} | Advance: ${fmt(sumAllocatedAdvance)}\n`);

    // 4. Credit Notes
    let creditNotes = [];
    try {
      creditNotes = await allRecords(`
        SELECT * FROM credit_notes
        WHERE customer_id = ?
        ORDER BY return_date ASC, id ASC
      `, [c.id]);
    } catch (err) {
      log(`Error fetching credit notes: ${err.message}`);
    }
    custData.credit_notes = creditNotes;

    log(`--- CREDIT NOTES (${creditNotes.length}) ---`);
    let sumValidCN = 0;
    creditNotes.forEach(cn => {
      const amt = money(cn.amount);
      const isCancelled = cn.status === 'cancelled';
      if (!isCancelled) sumValidCN += amt;
      log(`• Credit Note #${cn.credit_note_number || cn.id} (${cn.return_date || cn.created_at}) | Amount: ${fmt(amt)} | Balance: ${fmt(cn.balance_amount)} | Status: ${cn.status}`);
      if (cn.reason) log(`  Reason: ${cn.reason}`);
    });
    log(`Summary -> Active Credit Notes: ${fmt(sumValidCN)}\n`);

    // 5. Sales Returns
    let returns = [];
    try {
      returns = await allRecords(`
        SELECT * FROM sales_returns
        WHERE customer_id = ?
        ORDER BY created_at ASC, id ASC
      `, [c.id]);
    } catch (err) {
      log(`Error fetching sales returns: ${err.message}`);
    }
    custData.sales_returns = returns;
    if (returns.length > 0) {
      log(`--- SALES RETURNS (${returns.length}) ---`);
      returns.forEach(r => {
        log(`• Return #${r.id} (${r.created_at}) | Total: ${fmt(r.total_amount)} | Reason: ${r.return_reason || 'N/A'}`);
      });
      log('');
    }

    // 6. Ledger Entries Table
    let ledgerEntries = [];
    try {
      ledgerEntries = await allRecords(`
        SELECT * FROM ledger_entries
        WHERE customer_id = ?
        ORDER BY entry_date ASC, id ASC
      `, [c.id]);
    } catch (err) {
      log(`Error fetching ledger entries: ${err.message}`);
    }
    custData.ledger_entries = ledgerEntries;
    log(`--- PERSISTED LEDGER_ENTRIES (${ledgerEntries.length}) ---`);
    ledgerEntries.forEach(le => {
      log(`• LE #${le.id} | Ref: ${le.ref_no} | Date: ${le.entry_date} | Type: ${le.entry_type} | DR: ${fmt(le.debit)} | CR: ${fmt(le.credit)} | Desc: ${le.description}`);
    });
    log('');

    // 7. Dynamic Engine Calculations
    let dynOutstanding = null;
    let dynLedger = null;
    try {
      dynOutstanding = await getCustomerTotalOutstanding(c.id);
      dynLedger = await getCustomerLedger(c.id);
      custData.ledgerEngine_outstanding = dynOutstanding;
      custData.ledgerEngine_ledger = {
        opening_balance: dynLedger.opening_balance,
        closing_balance: dynLedger.closing_balance,
        rows_count: dynLedger.rows?.length || 0,
      };
    } catch (err) {
      log(`⚠️ ledgerEngine calculation error: ${err.message}`);
    }

    // 8. Reconciliation & Balance Comparisons
    const ob = money(c.opening_balance);
    const mathNet = money(ob + sumInvoiced - sumValidPayments - sumValidCN);
    const mathOutstanding = Math.max(0, mathNet);

    log('================================================================');
    log(`ACCOUNTING RECONCILIATION FOR ${c.name}:`);
    log('================================================================');
    log(`(+) Opening Balance:              ${fmt(ob)}`);
    log(`(+) Total Invoiced:               ${fmt(sumInvoiced)}`);
    log(`(-) Real Payments Received:       ${fmt(sumValidPayments)}`);
    log(`(-) Active Credit Notes:          ${fmt(sumValidCN)}`);
    log('----------------------------------------------------------------');
    log(`(=) MATHEMATICAL NET DUE:         ${fmt(mathNet)} (${mathNet >= 0 ? 'Customer Owes Us' : 'Advance Credit'})`);
    log(`DB customers.current_balance:     ${fmt(c.current_balance)}`);
    log(`DB customers.advance_balance:     ${fmt(c.advance_balance)}`);
    if (dynOutstanding) {
      log(`Engine Net Balance:               ${fmt(dynOutstanding.net_balance)}`);
      log(`Engine Total Outstanding:         ${fmt(dynOutstanding.total_outstanding)}`);
      log(`Engine Settled Opening Balance:   ${fmt(dynOutstanding.settled_opening_balance)}`);
      log(`Engine Invoices Pending:          ${fmt(dynOutstanding.invoices_pending)}`);
    }
    if (dynLedger) {
      log(`Engine Ledger Closing Balance:    ${fmt(dynLedger.closing_balance)}`);
    }

    // Check 1: DB current_balance vs Math Net
    if (Math.abs(money(c.current_balance) - mathNet) > 0.05) {
      const disc = `DISCREPANCY 1: Database current_balance (${fmt(c.current_balance)}) != Mathematical Net Due (${fmt(mathNet)})! Diff = ${fmt(c.current_balance - mathNet)}`;
      log(`❌ ${disc}`);
      custData.discrepancies.push(disc);
    } else {
      log(`✅ DB current_balance matches Mathematical Net Due.`);
    }

    // Check 2: Ledger closing balance vs Math Net
    if (dynLedger && Math.abs(money(dynLedger.closing_balance) - mathNet) > 0.05) {
      const disc = `DISCREPANCY 2: Ledger Report closing balance (${fmt(dynLedger.closing_balance)}) != Mathematical Net Due (${fmt(mathNet)})! Diff = ${fmt(dynLedger.closing_balance - mathNet)}`;
      log(`❌ ${disc}`);
      custData.discrepancies.push(disc);
    } else if (dynLedger) {
      log(`✅ Ledger closing balance matches Mathematical Net Due.`);
    }

    // Check 3: Sum of unpaid invoices + remaining OB vs Total Due
    const remainingOB = Math.max(0, money(ob - sumAllocatedOB));
    const expectedUnpaid = money(remainingOB + sumPendingOnSales);
    log(`Remaining Opening Balance:        ${fmt(remainingOB)}`);
    log(`Sum of Unpaid Invoices:           ${fmt(sumPendingOnSales)}`);
    log(`Total Unsettled Dues:             ${fmt(expectedUnpaid)}`);

    if (Math.abs(expectedUnpaid - mathOutstanding) > 0.05) {
      const disc = `DISCREPANCY 3: Pending Invoices (${fmt(sumPendingOnSales)}) + Remaining OB (${fmt(remainingOB)}) = ${fmt(expectedUnpaid)} != Total Outstanding (${fmt(mathOutstanding)})! Diff = ${fmt(expectedUnpaid - mathOutstanding)}`;
      log(`⚠️ ${disc}`);
      custData.discrepancies.push(disc);
    } else {
      log(`✅ Pending invoices + Remaining OB matches Total Outstanding.`);
    }

    // Check 4: Potential duplicate payments
    const paymentMap = new Map();
    payments.forEach(p => {
      const key = `${p.payment_date}_${p.amount}_${p.payment_mode}`;
      if (paymentMap.has(key)) {
        const prev = paymentMap.get(key);
        const disc = `DISCREPANCY 4 (Duplicate Payment?): Payment #${p.payment_number || p.id} and #${prev.payment_number || prev.id} share date (${p.payment_date}), amount (${fmt(p.amount)}), and mode (${p.payment_mode})`;
        log(`⚠️ ${disc}`);
        custData.discrepancies.push(disc);
      } else {
        paymentMap.set(key, p);
      }
    });

    log('================================================================\n');
    report.customers_found.push(custData);
  }

  // Print all customers directory
  if (allCust.length > 0) {
    log('================================================================');
    log(`FULL CUSTOMER DIRECTORY (${allCust.length} TOTAL CUSTOMERS IN DATABASE)`);
    log('================================================================');
    allCust.forEach(c => {
      log(`ID ${String(c.id).padEnd(4)} | Name: ${c.name.padEnd(35)} | Mobile: ${(c.mobile || '-').padEnd(12)} | OB: ${fmt(c.opening_balance).padEnd(14)} | CurrBal: ${fmt(c.current_balance).padEnd(14)} | Sales: ${c.sales_count} | Payments: ${c.payments_count}`);
    });
    log('================================================================\n');
  }

  // Save report files
  const jsonPath = path.join(workspaceRoot, 'jagdish_inspection_report.json');
  const txtPath = path.join(workspaceRoot, 'jagdish_inspection_report.txt');

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(txtPath, textLines.join('\n'), 'utf-8');

  console.log(`\n✔ Full JSON report written to: ${jsonPath}`);
  console.log(`✔ Full Text report written to: ${txtPath}\n`);

  await pool.end();
}

inspectCustomerJagdish().catch(err => {
  console.error('Fatal error during customer inspection:', err);
  process.exit(1);
});
