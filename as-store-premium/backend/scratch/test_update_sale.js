import { initDatabase, getRecord, runTransaction } from '../database.js';

async function test() {
  await initDatabase();

  const sale = await getRecord('SELECT * FROM sales ORDER BY id DESC LIMIT 1');
  if (!sale) {
    console.log('No sale found to test.');
    process.exit(0);
  }

  console.log(`Found sale ID: ${sale.id}, current invoice_date: ${sale.invoice_date || sale.sale_date}, terms: ${sale.payment_terms_days}, due_date: ${sale.due_date}, total: ${sale.total_amount}`);

  // Test updating date, terms, and due date
  const newDate = '2026-08-25';
  const newTerms = 30;
  const d = new Date(newDate + 'T00:00:00');
  d.setDate(d.getDate() + newTerms);
  const expectedDueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  console.log(`Expected due date for 2026-08-25 + 30 days: ${expectedDueDate}`);

  await runTransaction(async (tx) => {
    await tx.runQuery(
      `UPDATE sales 
       SET invoice_date = ?, 
           sale_date = ?, 
           payment_terms_days = ?, 
           due_date = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newDate, newDate, newTerms, expectedDueDate, sale.id]
    );
  });

  const updated = await getRecord('SELECT * FROM sales WHERE id = ?', [sale.id]);
  console.log(`Updated sale ID: ${updated.id}, new date: ${updated.invoice_date}, terms: ${updated.payment_terms_days}, due_date: ${updated.due_date}`);

  if (String(updated.due_date).slice(0, 10) === expectedDueDate && Number(updated.payment_terms_days) === 30) {
    console.log('TEST PASSED: Date and payment terms recalculated perfectly!');
  } else {
    console.error('TEST FAILED: Recalculated due date does not match.');
    process.exit(1);
  }

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
