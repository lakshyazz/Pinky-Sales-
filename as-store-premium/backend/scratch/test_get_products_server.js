import pg from '../../backend/node_modules/pg/lib/index.js';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const appendSearchFilter = (where, params, query, columns) => {
  if (!query) return;
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return;
  terms.forEach((term) => {
    where.push(`(${columns.map((column) => `${column} ILIKE ?`).join(' OR ')})`);
    columns.forEach(() => params.push(`%${term}%`));
  });
};

const appendExactFilter = (where, params, value, sql) => {
  if (!value) return; // hasQueryValue
  where.push(sql);
  params.push(String(value).trim());
};

async function main() {
  try {
    const columns = '*';
    const query = {}; // Simulate empty query
    const params = [];
    const where = ['is_active = 1', 'name IS NOT NULL'];
    
    // Check if query.search is passed
    console.log('Query search:', query.search);
    
    appendSearchFilter(where, params, query.search, [
      'name',
      "COALESCE(short_name, '')",
      "COALESCE(full_model_list, '')",
      "COALESCE(brand, '')",
      "COALESCE(category, '')",
      "COALESCE(model, '')",
      "COALESCE(description, '')",
      "COALESCE(array_to_string(colours, ','), '')",
    ]);

    const whereSql = where.join(' AND ').replace(/\?/g, (_, i) => `$${params.indexOf(params[i]) + 1 || params.push(params[i])}`);
    // Wait, let's do standard pg parameter replacement ($1, $2)
    let pgWhereSql = where.join(' AND ');
    let paramIndex = 1;
    while (pgWhereSql.includes('?')) {
      pgWhereSql = pgWhereSql.replace('?', `$${paramIndex++}`);
    }

    const dataSql = `SELECT ${columns} FROM products WHERE ${pgWhereSql} ORDER BY brand, COALESCE(short_name, name) LIMIT 50 OFFSET 0`;
    console.log('Executing SQL:', dataSql);
    console.log('Params:', params);

    const res = await pool.query(dataSql, params);
    console.log('Result count:', res.rows.length);
    if (res.rows.length > 0) {
      console.log('First 5 rows:', res.rows.slice(0, 5).map(r => ({ id: r.id, name: r.name, brand: r.brand, category: r.category })));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
