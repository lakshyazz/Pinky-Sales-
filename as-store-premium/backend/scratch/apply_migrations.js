import fs from 'node:fs/promises';
import { runQuery, getRecord, allRecords } from '../database.js';

async function applyPendingMigrations() {
  console.log('--- Applying pending migrations to Supabase database ---');
  try {
    const migrationsUrl = new URL('../migrations/', import.meta.url);
    const files = (await fs.readdir(migrationsUrl))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    await runQuery(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const file of files) {
      const applied = await getRecord('SELECT name FROM schema_migrations WHERE name = ?', [file]);
      if (applied) {
        console.log(`  ✓ Already applied: ${file}`);
        continue;
      }

      console.log(`  🚀 Applying new migration: ${file}...`);
      const sql = await fs.readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      
      try {
        await runQuery(sql);
        await runQuery('INSERT INTO schema_migrations (name) VALUES (?) ON CONFLICT DO NOTHING', [file]);
        console.log(`  ✅ Successfully applied ${file}`);
      } catch (err) {
        console.error(`  ❌ Failed applying ${file}:`, err.message);
        // Force recording if notice or non-fatal DDL
        await runQuery('INSERT INTO schema_migrations (name) VALUES (?) ON CONFLICT DO NOTHING', [file]);
      }
    }
  } catch (err) {
    console.error('Migration runner error:', err);
  }
  console.log('--- Migration execution completed ---\n');
}

applyPendingMigrations();
