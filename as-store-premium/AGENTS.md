# System Architectural Guidelines & Invariants

## Party Ledger & Credit Notes Integrity Rules

### 1. Credit Notes in Customer Party Ledger
- **Primary Source**: Customer Credit Notes must ALWAYS be queried directly from `credit_notes cn WHERE cn.customer_id = ? AND cn.status != 'cancelled'`.
- **Never Query `credit_note_redemptions` for Ledger Rows**: `credit_note_redemptions` only tracks redemptions during new sale checkout, NOT the issuance of credit notes. Querying redemptions excludes all sales return credit notes.
- **Deduction Payments Exclusion**: Any internal payment log inserted into `payments` with `payment_mode = 'credit_note'` (e.g. from sales return deductions against pending invoices) MUST be excluded (`WHERE COALESCE(payment_mode, '') != 'credit_note'`) when fetching ledger rows. The Credit Note itself (`CN-xxxxxx`) is the source document that provides the credit in the ledger. Including both would double-credit the customer.
- **Sales Debit Amount**: Sales invoices in the ledger must debit `COALESCE(NULLIF(s.current_invoice_total, 0), s.total_amount)`. If a credit note was applied during checkout, the invoice debits the full gross amount, and the credit note provides the credit, ensuring exact balance reconciliation.
- **Normalized Date Keys**: All transaction rows and date comparisons (`fromDate`, `toDate`) must use normalized `YYYY-MM-DD` string keys (`toDateKey`) to avoid JavaScript `Date` vs `string` comparison errors.

### 2. Standing Automated Test Suite
- Any change to the ledger engine or payment allocations MUST pass all test groups in `backend/test_fifo_ledger.js`, including Test Group 11 (Credit Notes verification and balance reconciliation).
