import pg from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function seed() {
  try {
    const hash = await bcrypt.hash('superadmin123', 10);
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', ['superadmin']);
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (username, password, role, name, contact) VALUES ($1, $2, $3, $4, $5)',
        ['superadmin', hash, 'superadmin', 'Super Admin', '9999999999']
      );
      console.log('✅ Created superadmin user.');
    } else {
      await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hash, 'superadmin']);
      console.log('✅ Updated superadmin password.');
    }

    const res = await pool.query('SELECT id, username, role FROM users');
    console.log('Current users in DB:', res.rows);
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await pool.end();
  }
}

seed();
