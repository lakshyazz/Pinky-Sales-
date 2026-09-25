import { allRecords } from '../database.js';

async function check() {
  const bills = await allRecords('SELECT * FROM purchase_bills ORDER BY id DESC LIMIT 5');
  console.log('BILLS:', JSON.stringify(bills, null, 2));

  const items = await allRecords('SELECT * FROM purchase_bill_items ORDER BY id DESC LIMIT 10');
  console.log('ITEMS:', JSON.stringify(items, null, 2));

  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
