import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;

const connectionString = 
  process.env.DATABASE_URL || 
  process.env.POSTGRES_URL || 
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.STORAGE_URL ||
  process.env.STORAGE_POSTGRES_URL ||
  process.env.STORAGE_POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_POSTGRES_URL ||
  process.env.SUPABASE_URL;

if (!connectionString) {
  throw new Error('Database connection URL is missing. Set DATABASE_URL or POSTGRES_URL in environment variables.');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10_000,
  query_timeout: 30_000,
});

try {
  const files = (await readdir(new URL('./migrations/', import.meta.url)))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const migrationTableExists = await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Existing installations predate migration tracking. Their first six
  // migrations are already represented by the live schema.
  if (!migrationTableExists.rows[0]?.table_name) {
    const baseline = files.filter((file) => /^00[1-6]_/.test(file));
    for (const file of baseline) {
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      console.log(`[Migration] Baselined ${file}`);
    }
  }

  for (const file of files) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (applied.rowCount) continue;
    const sql = await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[Migration] Applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
