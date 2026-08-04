import pg from 'pg';

const { Pool } = pg;

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
});

async function test() {
  console.log('Testing connection to Supabase pooler...');
  try {
    const res = await pool.query('SELECT current_database(), current_user');
    console.log('SUCCESS with 6543:', res.rows);
  } catch (err) {
    console.error('FAILED with 6543:', err.message);
  }

  const pool5432 = new Pool({
    connectionString: 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    const res = await pool5432.query('SELECT current_database(), current_user');
    console.log('SUCCESS with 5432:', res.rows);
  } catch (err) {
    console.error('FAILED with 5432:', err.message);
  }

  const poolDirect = new Pool({
    connectionString: 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@db.hnntlrycgywhstbqqmfo.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    const res = await poolDirect.query('SELECT current_database(), current_user');
    console.log('SUCCESS with Direct db.hnntlrycgywhstbqqmfo.supabase.co:', res.rows);
  } catch (err) {
    console.error('FAILED with Direct db.hnntlrycgywhstbqqmfo.supabase.co:', err.message);
  }

  process.exit(0);
}

test();
