import { allRecords, getRecord } from './database.js';

async function checkStorage() {
  try {
    const dbSizeRes = await getRecord(`
      SELECT 
        pg_database_size(current_database()) as size_bytes,
        pg_size_pretty(pg_database_size(current_database())) as size_pretty
    `);
    
    console.log('--- DATABASE STORAGE METRICS ---');
    console.log('Current DB Name: postgres (Supabase Cloud)');
    console.log('Total Database Size Used:', dbSizeRes.size_pretty, `(${Number(dbSizeRes.size_bytes).toLocaleString()} bytes)`);

    const tableSizes = await allRecords(`
      SELECT 
        relname AS table_name,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
        pg_total_relation_size(c.oid) AS size_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `);

    console.log('\n--- TOP TABLES SIZE & ROW COUNTS ---');
    for (const t of tableSizes) {
      const countRes = await getRecord(`SELECT COUNT(*) as count FROM ${t.table_name}`);
      console.log(`- ${t.table_name}: ${t.total_size} (${Number(countRes.count).toLocaleString()} rows)`);
    }

    const bytesUsed = Number(dbSizeRes.size_bytes);
    const freeTierCap = 500 * 1024 * 1024; // 500 MB for Supabase Free Tier
    const remainingFreeBytes = freeTierCap - bytesUsed;
    const remainingFreeMB = (remainingFreeBytes / (1024 * 1024)).toFixed(2);
    const percentUsed = ((bytesUsed / freeTierCap) * 100).toFixed(2);

    console.log('\n--- STORAGE CAPACITY SUMMARY ---');
    console.log(`Used: ${dbSizeRes.size_pretty} (${percentUsed}% of 500 MB Supabase Free Quota)`);
    console.log(`Available / Remaining Space (Free Tier): ${remainingFreeMB} MB (~${(500 - (bytesUsed / (1024 * 1024))).toFixed(1)} MB free)`);
    console.log(`Pro Tier Max Capable: Up to 8 GB+ (auto-scaling on demand)`);
    process.exit(0);
  } catch (err) {
    console.error('Error fetching storage metrics:', err);
    process.exit(1);
  }
}

checkStorage();
