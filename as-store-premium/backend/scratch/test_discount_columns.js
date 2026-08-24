import { allRecords } from '../database.js';

async function test() {
  const cols = await allRecords(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'sales' 
      AND column_name IN ('original_amount', 'discount_amount', 'discount_percentage')
  `);
  console.log('Columns verified in database:', cols);
  process.exit(0);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
