/**
 * accountingEngine.js — Double-entry journal trigger functions
 *
 * No GST. Line totals are: quantity * unit_price - discount_amount
 *
 * All functions accept a transaction object (tx) so they run inside
 * the caller's existing database transaction (atomicity guaranteed).
 *
 * COA account IDs are resolved by their stable code strings so that
 * auto-incremented IDs in different environments don't matter.
 *
 * Usage:
 *   import { postSaleJournal, reverseJournal } from './accountingEngine.js';
 *   // Inside a runTransaction() callback:
 *   await postSaleJournal(tx, saleId, shopId, customerId, amount, paymentMode, createdBy);
 */

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Resolve a chart_of_accounts id by its code (e.g. '1020').
 * Cached per process lifetime to avoid repeated DB round-trips.
 */
const _accountCodeCache = new Map();

async function getAccountId(tx, code) {
  if (_accountCodeCache.has(code)) return _accountCodeCache.get(code);
  const row = await tx.getRecord(
    'SELECT id FROM chart_of_accounts WHERE code = ? AND is_active = TRUE',
    [code]
  );
  if (!row) throw new Error(`Chart of Accounts entry not found for code "${code}". Run migration 052.`);
  _accountCodeCache.set(code, row.id);
  return row.id;
}

/**
 * Insert a journal entry header and return its id.
 */
async function insertJournalEntry(tx, { shopId, entryDate, narration, refType, refId, createdBy }) {
  const result = await tx.runQuery(
    `INSERT INTO journal_entries (shop_id, entry_date, narration, ref_type, ref_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [shopId, entryDate, narration, refType, refId, createdBy || null]
  );
  return result.id;
}

/**
 * Insert a single journal entry line (debit or credit side).
 * Exactly one of debit / credit must be > 0.
 */
async function insertJournalLine(tx, { journalEntryId, accountId, debit = 0, credit = 0, entityType, entityId, narration }) {
  const d = Math.round(Number(debit  || 0) * 100) / 100;
  const c = Math.round(Number(credit || 0) * 100) / 100;
  if ((d > 0 && c > 0) || (d === 0 && c === 0)) {
    throw new Error('Journal line must have exactly one of debit or credit > 0');
  }
  await tx.runQuery(
    `INSERT INTO journal_entry_lines
       (journal_entry_id, account_id, debit, credit, entity_type, entity_id, narration)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [journalEntryId, accountId, d, c, entityType || null, entityId || null, narration || null]
  );
}

// ─── Exported journal trigger functions ──────────────────────────────────────

/**
 * A2: Post journal entries for a completed sale.
 *
 * Cash/UPI/card sale:
 *   DR  Cash/Bank (1000/1010)     = amount
 *   CR  Sales Revenue (4000)      = amount
 *
 * Credit sale (payment_mode = 'credit' | 'pending'):
 *   DR  Accounts Receivable (1020) = amount
 *   CR  Sales Revenue (4000)       = amount
 *
 * @param {object} tx           - transaction object from runTransaction()
 * @param {number} saleId
 * @param {number} shopId
 * @param {number} customerId
 * @param {number} amount       - net invoice amount (total after discount, no tax)
 * @param {string} paymentMode  - 'cash'|'upi'|'card'|'bank'|'credit'|'pending'|'store_credit'
 * @param {number} entryDate    - ISO date string
 * @param {number} [createdBy]
 */
export async function postSaleJournal(tx, saleId, shopId, customerId, amount, paymentMode, entryDate, createdBy) {
  if (amount <= 0) return; // zero-amount invoices produce no journal entries

  const isCash = !['credit', 'pending'].includes(String(paymentMode).toLowerCase());
  const debitCode = isCash ? '1000' : '1020'; // Cash or AR
  const debitLabel = isCash ? 'Cash / Payment Received' : 'Accounts Receivable';

  const [debitAccountId, creditAccountId] = await Promise.all([
    getAccountId(tx, debitCode),
    getAccountId(tx, '4000'),
  ]);

  const jeId = await insertJournalEntry(tx, {
    shopId, entryDate, createdBy,
    narration: `Sale recorded — ${isCash ? paymentMode : 'credit'} — INV-${String(saleId).padStart(6, '0')}`,
    refType: 'sale',
    refId: saleId,
  });

  await insertJournalLine(tx, { journalEntryId: jeId, accountId: debitAccountId,  debit: amount, entityType: 'sale', entityId: saleId, narration: debitLabel });
  await insertJournalLine(tx, { journalEntryId: jeId, accountId: creditAccountId, credit: amount, entityType: 'sale', entityId: saleId, narration: 'Sales Revenue' });
}

/**
 * Post journal entries for a payment received against a sale.
 *
 * DR  Cash/Bank (1000/1010)      = amount
 * CR  Accounts Receivable (1020) = amount
 *
 * @param {object} tx
 * @param {number} paymentId
 * @param {number} saleId
 * @param {number} shopId
 * @param {number} amount
 * @param {string} paymentMode
 * @param {string} entryDate
 * @param {number} [createdBy]
 */
export async function postPaymentJournal(tx, paymentId, saleId, shopId, amount, paymentMode, entryDate, createdBy) {
  if (amount <= 0) return;

  const [debitAccountId, creditAccountId] = await Promise.all([
    getAccountId(tx, '1000'),  // Cash
    getAccountId(tx, '1020'),  // AR
  ]);

  const jeId = await insertJournalEntry(tx, {
    shopId, entryDate, createdBy,
    narration: `Payment received — ${paymentMode} — INV-${String(saleId).padStart(6, '0')}`,
    refType: 'payment',
    refId: paymentId,
  });

  await insertJournalLine(tx, { journalEntryId: jeId, accountId: debitAccountId,  debit: amount, entityType: 'payment', entityId: paymentId, narration: `Payment via ${paymentMode}` });
  await insertJournalLine(tx, { journalEntryId: jeId, accountId: creditAccountId, credit: amount, entityType: 'sale',    entityId: saleId,    narration: 'Accounts Receivable settled' });
}

/**
 * Post journal entries when a credit note is issued.
 *
 * DR  Sales Returns (5020)        = amount  ← reduces revenue
 * CR  Accounts Receivable (1020)  = amount  (or Credit Notes Payable 2010 if store credit)
 *
 * @param {object} tx
 * @param {number} creditNoteId
 * @param {number} shopId
 * @param {number} customerId
 * @param {number} amount
 * @param {string} entryDate
 * @param {number} [createdBy]
 */
export async function postCreditNoteJournal(tx, creditNoteId, shopId, customerId, amount, entryDate, createdBy) {
  if (amount <= 0) return;

  const [debitAccountId, creditAccountId] = await Promise.all([
    getAccountId(tx, '5020'),  // Sales Returns
    getAccountId(tx, '1020'),  // AR (reduces AR — customer owes less)
  ]);

  const cnNum = `CN-${String(creditNoteId).padStart(6, '0')}`;
  const jeId = await insertJournalEntry(tx, {
    shopId, entryDate, createdBy,
    narration: `Credit note issued — ${cnNum}`,
    refType: 'credit_note',
    refId: creditNoteId,
  });

  await insertJournalLine(tx, { journalEntryId: jeId, accountId: debitAccountId,  debit: amount, entityType: 'credit_note', entityId: creditNoteId, narration: 'Sales Returns' });
  await insertJournalLine(tx, { journalEntryId: jeId, accountId: creditAccountId, credit: amount, entityType: 'credit_note', entityId: creditNoteId, narration: 'Accounts Receivable reduced' });
}

/**
 * Post journal entries when a purchase bill is recorded (vendor payable).
 *
 * DR  Inventory / COGS (1030 or 5000) = amount
 * CR  Accounts Payable (2000)          = amount
 *
 * @param {object} tx
 * @param {number} billId
 * @param {number} shopId
 * @param {number} supplierId
 * @param {number} amount
 * @param {string} billDate
 * @param {number} [createdBy]
 */
export async function postPurchaseBillJournal(tx, billId, shopId, supplierId, amount, billDate, createdBy) {
  if (amount <= 0) return;

  const [debitAccountId, creditAccountId] = await Promise.all([
    getAccountId(tx, '1030'),  // Inventory
    getAccountId(tx, '2000'),  // Accounts Payable
  ]);

  const billNum = `BILL-${String(billId).padStart(6, '0')}`;
  const jeId = await insertJournalEntry(tx, {
    shopId, entryDate: billDate, createdBy,
    narration: `Purchase bill recorded — ${billNum}`,
    refType: 'purchase_bill',
    refId: billId,
  });

  await insertJournalLine(tx, { journalEntryId: jeId, accountId: debitAccountId,  debit: amount, entityType: 'purchase_bill', entityId: billId, narration: 'Inventory / Stock purchased' });
  await insertJournalLine(tx, { journalEntryId: jeId, accountId: creditAccountId, credit: amount, entityType: 'purchase_bill', entityId: billId, narration: 'Accounts Payable — vendor' });
}

/**
 * Post journal entries when a debit note is issued (purchase return).
 *
 * DR  Accounts Payable (2000)    = amount  ← reduces what we owe vendor
 * CR  Purchase Returns (5010)    = amount  ← reduces COGS / inventory cost
 *
 * @param {object} tx
 * @param {number} debitNoteId
 * @param {number} shopId
 * @param {number} supplierId
 * @param {number} amount
 * @param {string} returnDate
 * @param {number} [createdBy]
 */
export async function postDebitNoteJournal(tx, debitNoteId, shopId, supplierId, amount, returnDate, createdBy) {
  if (amount <= 0) return;

  const [debitAccountId, creditAccountId] = await Promise.all([
    getAccountId(tx, '2000'),  // AP — we owe vendor less now
    getAccountId(tx, '5010'),  // Purchase Returns
  ]);

  const dnNum = `DN-${String(debitNoteId).padStart(6, '0')}`;
  const jeId = await insertJournalEntry(tx, {
    shopId, entryDate: returnDate, createdBy,
    narration: `Debit note issued — ${dnNum}`,
    refType: 'debit_note',
    refId: debitNoteId,
  });

  await insertJournalLine(tx, { journalEntryId: jeId, accountId: debitAccountId,  debit: amount, entityType: 'debit_note', entityId: debitNoteId, narration: 'Accounts Payable reduced (purchase return)' });
  await insertJournalLine(tx, { journalEntryId: jeId, accountId: creditAccountId, credit: amount, entityType: 'debit_note', entityId: debitNoteId, narration: 'Purchase Returns' });
}

/**
 * Reverse all journal entries for a given reference (e.g. when a sale is deleted).
 * Creates mirror entries (debits become credits and vice versa) and marks originals
 * as is_reversed = TRUE.
 *
 * @param {object} tx
 * @param {string} refType   - 'sale' | 'payment' | 'credit_note' | etc.
 * @param {number} refId
 * @param {number} shopId
 * @param {string} entryDate
 * @param {number} [createdBy]
 */
export async function reverseJournal(tx, refType, refId, shopId, entryDate, createdBy) {
  // Find all non-reversed journal entries for this reference
  const entries = await tx.allRecords(
    `SELECT id FROM journal_entries
     WHERE ref_type = ? AND ref_id = ? AND is_reversed = FALSE`,
    [refType, refId]
  );
  if (!entries.length) return;

  for (const entry of entries) {
    // Create a reversal journal entry header
    const reversalJeId = await insertJournalEntry(tx, {
      shopId, entryDate, createdBy,
      narration: `Reversal of journal entry #${entry.id} (${refType} ${refId} deleted/cancelled)`,
      refType: `${refType}_reversal`,
      refId: refId,
    });

    // Fetch original lines
    const lines = await tx.allRecords(
      'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?',
      [entry.id]
    );

    // Mirror each line (swap debit/credit)
    for (const line of lines) {
      await insertJournalLine(tx, {
        journalEntryId: reversalJeId,
        accountId: line.account_id,
        debit:  Number(line.credit || 0),   // original credit becomes debit
        credit: Number(line.debit  || 0),   // original debit becomes credit
        entityType: line.entity_type,
        entityId:   line.entity_id,
        narration: `Reversal: ${line.narration || ''}`,
      });
    }

    // Mark original entry as reversed
    await tx.runQuery(
      'UPDATE journal_entries SET is_reversed = TRUE, reversed_by = ? WHERE id = ?',
      [reversalJeId, entry.id]
    );
  }
}
