import { allRecords } from '../database.js';

async function check() {
  const madhav = await allRecords("SELECT id, name, opening_balance, advance_balance FROM customers WHERE LOWER(name) LIKE '%madhav%'");
  console.log('Madhav details:', madhav);
  const sample = await allRecords("SELECT id, name, opening_balance FROM customers WHERE id IN (240, 26, 15, 11) LIMIT 10");
  console.log('Sample customers:', sample);
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
