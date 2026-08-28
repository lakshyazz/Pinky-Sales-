import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const rawConnectionString = 
  process.env.DATABASE_URL || 
  process.env.POSTGRES_URL || 
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.STORAGE_POSTGRES_URL ||
  process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
  process.env.STORAGE_POSTGRES_PRISMA_URL ||
  process.env.STORAGE_URL ||
  process.env.STORAGE_PRISMA_URL ||
  process.env.SUPABASE_POSTGRES_URL ||
  process.env.SUPABASE_URL ||
  'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

let connectionString = rawConnectionString ? rawConnectionString.replace(/([?&])sslmode=[^&]*(&?)/gi, '$1').replace(/\?$/, '') : '';
if (connectionString.includes('pooler.supabase.com:5432')) {
  connectionString = connectionString.replace('pooler.supabase.com:5432', 'pooler.supabase.com:6543');
}

if (!connectionString) {
  throw new Error('Database connection URL is missing. Set DATABASE_URL or POSTGRES_URL in environment variables.');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || (process.env.VERCEL === '1' ? 3 : 10)),
  idleTimeoutMillis: 10_000,          // Prune idle connections after 10s to avoid stale socket drops
  connectionTimeoutMillis: 30_000,    // Allow up to 30s for cross-region handshake & cold starts
  query_timeout: 30_000,              // Query execution limit of 30s
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on('error', (err) => {
  console.warn('[Database Pool Warning] Idle client connection issue caught:', err?.message || err);
});

// Convert SQLite parameter placeholders (?) to PostgreSQL ($1, $2, ...)
// and append "RETURNING id" for INSERT queries if not already present
function convertSql(sql) {
  let index = 1;
  let converted = sql.replace(/\?/g, () => `$${index++}`);
  
  // Append RETURNING id to INSERT statements to fetch new row IDs
  if (converted.trim().toUpperCase().startsWith('INSERT') && !converted.toUpperCase().includes('RETURNING') && !converted.toUpperCase().includes('SCHEMA_MIGRATIONS')) {
    converted += ' RETURNING id';
  }
  return converted;
}

const isTransientDbError = (error) => {
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`;
  return /connection terminated|connection timeout|timeout|ECONNRESET|ETIMEDOUT|closed unexpectedly/i.test(message)
    || ['08003', '08006', '57P01', '53300'].includes(String(error?.code || ''));
};

const executeWithRetry = async (fn, retries = 1) => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && isTransientDbError(error)) {
      console.warn(`[Database] Retrying query after transient connection issue: ${error.message}`);
      return await fn();
    }
    throw error;
  }
};

export const runQuery = async (sql, params = []) => {
  const pgSql = convertSql(sql);
  return executeWithRetry(async () => {
    const res = await pool.query(pgSql, params);
    const id = res.rows && res.rows[0] ? res.rows[0].id : null;
    return { id, changes: res.rowCount };
  });
};

export const getRecord = async (sql, params = []) => {
  const pgSql = convertSql(sql);
  return executeWithRetry(async () => {
    const res = await pool.query(pgSql, params);
    return res.rows[0] || null;
  });
};

export const allRecords = async (sql, params = []) => {
  const pgSql = convertSql(sql);
  return executeWithRetry(async () => {
    const res = await pool.query(pgSql, params);
    return res.rows;
  });
};

export const runTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      runQuery: async (sql, params = []) => {
        const pgSql = convertSql(sql);
        const res = await client.query(pgSql, params);
        const id = res.rows && res.rows[0] ? res.rows[0].id : null;
        return { id, changes: res.rowCount };
      },
      getRecord: async (sql, params = []) => {
        const pgSql = convertSql(sql);
        const res = await client.query(pgSql, params);
        return res.rows[0] || null;
      },
      allRecords: async (sql, params = []) => {
        const pgSql = convertSql(sql);
        const res = await client.query(pgSql, params);
        return res.rows;
      }
    };
    const result = await callback(tx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const executeTransaction = runTransaction;

const seedUser = async ({ username, password, role, name, contact = '', shopId = null, permissions = '{}' }) => {
  const existing = await getRecord('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) return existing.id;
  const hash = await bcrypt.hash(password, 10);
  const result = await runQuery(
    'INSERT INTO users (username, password, role, name, contact, shop_id, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [username, hash, role, name, contact, shopId, permissions]
  );
  return result.id;
};

export const initDatabase = async () => {
  console.log('[Database] Connecting to PostgreSQL database on Supabase...');
  await pool.query('SELECT 1');

  if (process.env.VERCEL === '1') {
    return;
  }

  // Run schema migrations automatically on startup!
  try {
    const fs = await import('node:fs/promises');
    const migrationsUrl = new URL('./migrations/', import.meta.url);
    const files = (await fs.readdir(migrationsUrl))
      .filter((file) => file.endsWith('.sql'))
      .sort();
      
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    for (const file of files) {
      const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (applied.rowCount) continue;
      
      const sql = await fs.readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        await client.query('COMMIT');
        console.log(`[Migration] Applied ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.warn(`[Migration] Warning on ${file}: ${error.message}`);
        await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      } finally {
        client.release();
      }
    }
  } catch (migErr) {
    console.error('[Migration] Migration error on startup:', migErr);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_requests (
        id SERIAL PRIMARY KEY,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        model_name TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        message TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id SERIAL PRIMARY KEY,
        from_shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        to_shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        transfer_date TEXT NOT NULL,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE stock_requests ENABLE ROW LEVEL SECURITY;
      ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
      CREATE INDEX IF NOT EXISTS stock_requests_shop_id_status_idx ON stock_requests (shop_id, status);

      -- Ensure columns from baseline migrations exist in target database
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'cash';
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT 'retail';
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS model TEXT;

      ALTER TABLE products ADD COLUMN IF NOT EXISTS short_name TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS full_model_list TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12, 2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12, 2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12, 2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price NUMERIC(12, 2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS colours TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES shops(id) ON DELETE SET NULL;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'GLOBAL';
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES shops(id) ON DELETE CASCADE;
      ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_name_key;
      CREATE UNIQUE INDEX IF NOT EXISTS suppliers_shop_name_unique_idx ON suppliers (COALESCE(shop_id, 0), LOWER(TRIM(name)));
      CREATE INDEX IF NOT EXISTS suppliers_shop_id_idx ON suppliers (shop_id);
      ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
      DROP INDEX IF EXISTS idx_products_full_composite_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_full_composite_unique 
      ON products (
        COALESCE(shop_id, 0),
        company_brand_id, 
        LOWER(TRIM(model)), 
        part_category_id, 
        COALESCE(product_variant_id, -1),
        COALESCE(manufacturing_brand_id, -1),
        COALESCE(supplier_id, -1)
      ) 
      WHERE is_active = 1;
      UPDATE products
      SET
        full_model_list = COALESCE(NULLIF(full_model_list, ''), name),
        short_name = COALESCE(NULLIF(short_name, ''), CASE WHEN LENGTH(name) > 60 THEN TRIM(SPLIT_PART(name, '/', 1)) ELSE name END),
        sale_price = COALESCE(sale_price, official_price),
        retail_price = COALESCE(retail_price, official_price)
      WHERE full_model_list IS NULL OR short_name IS NULL OR sale_price IS NULL OR retail_price IS NULL;
      UPDATE products SET short_name = LEFT(short_name, 57) || '...' WHERE LENGTH(short_name) > 60;
      CREATE INDEX IF NOT EXISTS products_short_name_idx ON products (short_name);
      CREATE INDEX IF NOT EXISTS idx_products_shop_scope ON products (COALESCE(shop_id, 0), is_active);

      -- Ensure Invoice Date, Payment Terms, and Extra Expenses columns exist
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 15;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS products_total NUMERIC(12, 2) DEFAULT 0.00;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS extra_expenses_total NUMERIC(12, 2) DEFAULT 0.00;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS default_payment_terms_days INTEGER DEFAULT 15;
      CREATE TABLE IF NOT EXISTS sale_expenses (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
        expense_type VARCHAR(50) NOT NULL DEFAULT 'custom',
        expense_name VARCHAR(255) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sale_expenses_sale_id ON sale_expenses(sale_id);
    `);
  } catch (ddlErr) {
    console.warn('[Database] Non-fatal init DDL notice:', ddlErr.message);
  }

  if (process.env.SEED_DEFAULT_ADMIN === 'true') {
    try {
      await seedUser({ username: 'superadmin', password: 'superadmin123', role: 'superadmin', name: 'Super Admin', contact: '9999999999' });
      await runQuery("UPDATE users SET name = 'Super Admin' WHERE username = 'superadmin' AND name = 'Father - Super Admin';");
    } catch (seedErr) {
      console.warn('[Database] Non-fatal seed notice:', seedErr.message);
    }
  }
  
  console.log('[Database] PostgreSQL database connection ready.');
};
