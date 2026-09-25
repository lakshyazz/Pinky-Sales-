const pool = require('./db');

async function check() {
  try {
    const res = await pool.query('SELECT id, debit_note_number, amount, reason FROM debit_notes ORDER BY id DESC LIMIT 5');
    console.log('Recent debit notes in database:', res.rows);
    process.exit(0);
  } catch (err) {
    console.error('DB query error:', err.message);
    process.exit(1);
  }
}

check();
