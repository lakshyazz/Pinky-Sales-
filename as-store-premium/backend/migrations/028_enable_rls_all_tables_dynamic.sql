-- Migration 028: Enable RLS across all public schema tables dynamically
-- This covers any tables created after migration 020 (like manufacturing_brands, suppliers, or extension-created tables)

DO $$ 
DECLARE 
    tbl RECORD;
BEGIN
    FOR tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
    END LOOP;
END $$;
