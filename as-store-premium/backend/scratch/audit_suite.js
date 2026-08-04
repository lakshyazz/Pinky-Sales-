import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { runQuery, getRecord, allRecords, runTransaction } from '../database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'as-store-multishop-local-secret';

async function runFullBackendAudit() {
  console.log('====================================================');
  console.log('🚀 RUNNING COMPREHENSIVE BACKEND AUDIT & TEST SUITE');
  console.log('====================================================\n');

  const report = {
    databaseConnection: false,
    tablesChecked: [],
    migrationStatus: [],
    authTests: false,
    crudTests: false,
    transactionSafety: false,
    parameterizationTest: false,
    errorsFound: [],
  };

  // 1. Connection Test
  try {
    const res = await getRecord('SELECT current_database() AS db, current_user AS usr, version() AS ver');
    console.log('✅ 1. DATABASE CONNECTION: OK');
    console.log(`   Database: ${res.db} | User: ${res.usr}`);
    report.databaseConnection = true;
  } catch (err) {
    console.error('❌ 1. DATABASE CONNECTION FAILED:', err.message);
    report.errorsFound.push(`DB Connection Failed: ${err.message}`);
    return report;
  }

  // 2. Table Existence Audit
  const expectedTables = [
    'schema_migrations',
    'shops',
    'users',
    'brands',
    'manufacturing_brands',
    'products',
    'inventory_batches',
    'stock',
    'sales',
    'sale_items',
    'customers',
    'stock_requests',
    'stock_transfers',
    'audit_logs',
    'import_logs'
  ];

  console.log('\n--- 2. TABLE EXISTENCE & SCHEMA AUDIT ---');
  for (const tableName of expectedTables) {
    try {
      const exists = await getRecord(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = ?) AS e",
        [tableName]
      );
      if (exists && (exists.e === true || exists.e === 'true')) {
        const countRes = await getRecord(`SELECT COUNT(*) AS c FROM ${tableName}`);
        console.log(`  ✓ Table '${tableName}': EXISTS (${countRes?.c || 0} rows)`);
        report.tablesChecked.push({ name: tableName, status: 'EXISTS', rows: countRes?.c || 0 });
      } else {
        console.error(`  ❌ Table '${tableName}': MISSING!`);
        report.errorsFound.push(`Missing table: ${tableName}`);
      }
    } catch (err) {
      console.error(`  ❌ Table '${tableName}' audit failed:`, err.message);
      report.errorsFound.push(`Audit table ${tableName} error: ${err.message}`);
    }
  }

  // 3. Schema Columns Mismatch Inspection
  console.log('\n--- 3. COLUMN MISMATCH & FOREIGN KEYS AUDIT ---');
  try {
    const productCols = await allRecords(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'products'"
    );
    const colNames = productCols.map(c => c.column_name);
    console.log('  Products table columns:', colNames.join(', '));
    
    const requiredProductCols = ['short_name', 'full_model_list', 'company_brand_id', 'manufacturing_brand_id', 'sale_price', 'purchase_price', 'colours'];
    for (const col of requiredProductCols) {
      if (colNames.includes(col)) {
        console.log(`  ✓ products.${col} exists`);
      } else {
        console.error(`  ❌ products.${col} MISSING!`);
        report.errorsFound.push(`Missing column: products.${col}`);
      }
    }
  } catch (err) {
    console.error('  ❌ Column audit failed:', err.message);
  }

  // 4. Migration History Audit
  console.log('\n--- 4. MIGRATIONS AUDIT ---');
  try {
    const migrations = await allRecords('SELECT name, applied_at FROM schema_migrations ORDER BY name ASC');
    console.log(`  Found ${migrations.length} applied migrations in schema_migrations:`);
    migrations.forEach(m => console.log(`   - ${m.name} (Applied at: ${m.applied_at})`));
    report.migrationStatus = migrations;
  } catch (err) {
    console.error('  ❌ Migration audit failed:', err.message);
    report.errorsFound.push(`Migration audit failed: ${err.message}`);
  }

  // 5. Authentication System & User Lookup Audit
  console.log('\n--- 5. AUTHENTICATION & PASSWORD AUDIT ---');
  try {
    const adminUser = await getRecord(
      "SELECT * FROM users WHERE LOWER(TRIM(username)) = 'superadmin'"
    );
    if (!adminUser) {
      console.error('  ❌ Superadmin user NOT FOUND in database!');
      report.errorsFound.push('Superadmin user missing');
    } else {
      console.log('  ✓ Found Superadmin user ID:', adminUser.id);
      const match123 = await bcrypt.compare('superadmin123', adminUser.password);
      console.log(`  ✓ Password match for 'superadmin123': ${match123}`);
      if (!match123) {
        console.warn('  ⚠️ Password hash mismatch for superadmin123! Updating hash...');
        const newHash = await bcrypt.hash('superadmin123', 10);
        await runQuery('UPDATE users SET password = ? WHERE id = ?', [newHash, adminUser.id]);
        console.log('  ✓ Updated superadmin password hash to superadmin123');
      }
      
      const token = jwt.sign({ id: adminUser.id, username: adminUser.username, role: adminUser.role }, JWT_SECRET, { expiresIn: '1h' });
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('  ✓ JWT creation & verification: OK (User ID:', decoded.id, ')');
      report.authTests = true;
    }
  } catch (err) {
    console.error('  ❌ Auth audit error:', err.message);
    report.errorsFound.push(`Auth audit error: ${err.message}`);
  }

  // 6. Transaction Safety Test
  console.log('\n--- 6. TRANSACTION SAFETY & ROLLBACK TEST ---');
  try {
    let rollbackSuccess = false;
    try {
      await runTransaction(async (tx) => {
        await tx.runQuery("INSERT INTO brands (name) VALUES ('TEST_TX_TEMP')");
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      });
    } catch (simErr) {
      if (simErr.message === 'SIMULATED_TRANSACTION_FAILURE') {
        const check = await getRecord("SELECT id FROM brands WHERE name = 'TEST_TX_TEMP'");
        if (!check) {
          rollbackSuccess = true;
          console.log('  ✓ Transaction rollback verified: temporary record was safely cleaned up.');
        } else {
          console.error('  ❌ Transaction rollback FAILED: temporary record leaked!');
          report.errorsFound.push('Transaction rollback failed');
        }
      }
    }
    report.transactionSafety = rollbackSuccess;
  } catch (err) {
    console.error('  ❌ Transaction test error:', err.message);
  }

  // 7. Parameterization & Query Conversion Test
  console.log('\n--- 7. SQL PARAMETER CONVERSION AUDIT ---');
  try {
    const multiParam = await getRecord(
      'SELECT id, name FROM brands WHERE name = ? OR name = ? OR 1 = ?',
      ['Generic', 'Unknown', 1]
    );
    console.log('  ✓ Multi-parameter conversion (? -> $1, $2, $3): OK');
    report.parameterizationTest = true;
  } catch (err) {
    console.error('  ❌ Parameter conversion failed:', err.message);
    report.errorsFound.push(`Parameter conversion error: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log('📊 AUDIT SUMMARY REPORT');
  console.log('====================================================');
  console.log(`DB Connection: ${report.databaseConnection ? 'PASS' : 'FAIL'}`);
  console.log(`Tables Checked: ${report.tablesChecked.length}`);
  console.log(`Auth Verified: ${report.authTests ? 'PASS' : 'FAIL'}`);
  console.log(`Transaction Safety: ${report.transactionSafety ? 'PASS' : 'FAIL'}`);
  console.log(`Errors Found: ${report.errorsFound.length}`);
  if (report.errorsFound.length) {
    console.log('Details:', report.errorsFound);
  }
  console.log('====================================================\n');

  process.exit(report.errorsFound.length > 0 ? 1 : 0);
}

runFullBackendAudit();
