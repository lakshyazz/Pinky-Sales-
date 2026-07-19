import pg from 'pg';

const connectionString = 'postgres://postgres.hnntlrycgywhstbqqmfo:J3H14Vo7XVbdXPNx@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function initAll() {
  try {
    console.log('[Supabase Init] Creating all missing tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS colours (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS brands (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS inventory_batches (
        id SERIAL PRIMARY KEY,
        shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        purchase_price NUMERIC(12, 2),
        wholesale_price NUMERIC(12, 2),
        official_price NUMERIC(12, 2),
        retail_price NUMERIC(12, 2),
        colour TEXT,
        quantity_received INTEGER NOT NULL CHECK (quantity_received >= 0),
        quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
        received_date DATE NOT NULL DEFAULT CURRENT_DATE,
        notes TEXT,
        source_key TEXT UNIQUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sale_batch_allocations (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        batch_id INTEGER NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        purchase_price NUMERIC(12, 2),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS other_product_categories (
        id SERIAL PRIMARY KEY,
        product_category VARCHAR(255) NOT NULL,
        other_if_needed TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS other_products (
        id SERIAL PRIMARY KEY,
        product_name VARCHAR(255) NOT NULL,
        product_company VARCHAR(255),
        price NUMERIC(10, 2) DEFAULT 0,
        product_category_id INTEGER REFERENCES other_product_categories(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS import_logs (
        id SERIAL PRIMARY KEY,
        file_name TEXT NOT NULL,
        imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        total_rows INTEGER NOT NULL DEFAULT 0,
        created_products INTEGER NOT NULL DEFAULT 0,
        total_quantity INTEGER NOT NULL DEFAULT 0,
        total_valuation NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        destination_shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,
        import_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO categories (name) VALUES
        ('Display'), ('OCA GLASS & TOUCH'), ('TOOLS'), ('Flex'), ('IC'), ('BACK GLASS'),
        ('BATTERY'), ('MIDDLE/FRAME'), ('CAMERA GLASS/LENS'), ('BGA Rework Station'),
        ('MULTIMETER'), ('SOLDERING IRON'), ('DC POWER SUPPLY'), ('MICROSCOPE'),
        ('HOT AIR GUN'), ('SEPARATING MACHINE'), ('STENCIL'), ('PASTE & FLUX'),
        ('SCREWDRIVER SET'), ('DESOLDERING WIRE'), ('TAPE & ADHESIVE'), ('UV LAMP'),
        ('BLADE & CUTTER'), ('TWEEZERS'), ('CLEANING SOLVENT & WIPES'), ('OPENING TOOLS'),
        ('CHARGING CONNECTOR & FLEX'), ('POWER & VOLUME FLEX'), ('SPEAKER & RINGER'),
        ('EARPIECE'), ('MICROPHONE'), ('SIM TRAY & JACK'), ('FINGERPRINT SENSOR'),
        ('MAIN BOARD FLEX'), ('ANTENNA CABLE')
      ON CONFLICT (name) DO NOTHING;

      INSERT INTO brands (name) VALUES
        ('Universal'), ('Apple'), ('Samsung'), ('Xiaomi'), ('Vivo'), ('Oppo'), ('Realme'),
        ('OnePlus'), ('Motorola'), ('Poco'), ('Infinix'), ('Tecno'), ('IQOO'), ('Nokia'),
        ('RELIFE'), ('SUNSHINE'), ('MECHANIC'), ('KAISI'), ('QUICK'), ('ATTEN'), ('SUGON'),
        ('BAKON'), ('JAKEMY'), ('AMTECH'), ('BEST'), ('MAANT'), ('RF4'), ('SANWA')
      ON CONFLICT (name) DO NOTHING;
    `);

    console.log('✅ Successfully created all tables, categories, and brands in Supabase!');
  } catch (err) {
    console.error('Init Error:', err);
  } finally {
    await pool.end();
  }
}

initAll();
