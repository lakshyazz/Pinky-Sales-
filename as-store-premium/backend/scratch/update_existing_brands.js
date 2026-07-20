import pg from '../../backend/node_modules/pg/lib/index.js';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const detectBrandFromProductText = (value) => {
  const text = String(value || '').toLowerCase();
  if (/1\+|one\s*plus|oneplus/.test(text)) return 'OnePlus';
  if (/iphone|ipad|apple|i\s*phone/.test(text)) return 'Apple';
  if (/redmi/.test(text)) return 'Redmi';
  if (/xiaomi|\bmi\b|\bmi\d|\bmi\s/.test(text)) return 'Xiaomi';
  if (/pixel|google/.test(text)) return 'Google Pixel';
  if (/poco/.test(text)) return 'Poco';
  if (/samsung|galaxy|\bsam\b/.test(text)) return 'Samsung';
  if (/vivo/.test(text)) return 'Vivo';
  if (/oppo/.test(text)) return 'Oppo';
  if (/realme/.test(text)) return 'Realme';
  if (/nothing/.test(text)) return 'Nothing';
  if (/motorola|moto/.test(text)) return 'Motorola';
  if (/huawei/.test(text)) return 'Huawei';
  if (/honor/.test(text)) return 'Honor';
  if (/nokia/.test(text)) return 'Nokia';
  if (/infinix/.test(text)) return 'Infinix';
  if (/tecno/.test(text)) return 'Tecno';
  if (/lava/.test(text)) return 'Lava';
  if (/micromax/.test(text)) return 'Micromax';
  if (/iqoo/.test(text)) return 'IQOO';
  if (/asus/.test(text)) return 'Asus';
  if (/sony/.test(text)) return 'Sony';
  if (/lenovo/.test(text)) return 'Lenovo';
  return '';
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Fetch all active products that are currently branded as 'Universal' or 'Generic'
    const res = await client.query(`
      SELECT id, name, short_name, brand, full_model_list 
      FROM products 
      WHERE is_active = 1 AND (LOWER(brand) = 'universal' OR LOWER(brand) = 'generic')
    `);
    
    console.log(`Found ${res.rows.length} products branded as 'Universal' or 'Generic'.`);
    
    let updatedCount = 0;
    
    for (const prod of res.rows) {
      const searchText = `${prod.name} ${prod.short_name} ${prod.full_model_list}`;
      const detected = detectBrandFromProductText(searchText);
      
      if (detected && detected !== prod.brand) {
        console.log(`Product ID ${prod.id} ("${prod.short_name}") -> Detected Brand: "${detected}" (was "${prod.brand}")`);
        
        // 1. Ensure brand exists in reference table
        await client.query(
          "INSERT INTO brands (name) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM brands WHERE LOWER(TRIM(name)) = LOWER(TRIM($2)))",
          [detected, detected]
        );
        
        // 2. Update product brand
        await client.query(
          "UPDATE products SET brand = $1 WHERE id = $2",
          [detected, prod.id]
        );
        
        updatedCount++;
      }
    }
    
    await client.query('COMMIT');
    console.log(`\nSuccessfully updated ${updatedCount} products to their correct detected brands!`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during brand updates:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
