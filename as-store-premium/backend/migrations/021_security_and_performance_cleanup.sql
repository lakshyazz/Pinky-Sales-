-- Migration 021: Clean up remaining Supabase Advisor warnings (Extension in Public, Duplicate Indexes)

-- 1. Move extensions out of public schema to extensions schema (best practice)
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_extension 
        WHERE extname = 'pg_trgm' 
        AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN
        BEGIN
            ALTER EXTENSION pg_trgm SET SCHEMA extensions;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not move pg_trgm extension schema: %', SQLERRM;
        END;
    END IF;
END $$;

-- 2. Consolidate & remove duplicate/overlapping indexes on inventory_batches if present
DO $$
BEGIN
    -- Drop duplicate index if both exist
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'inventory_batches' AND indexname = 'inventory_batches_shop_product_idx')
       AND EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'inventory_batches' AND indexname = 'idx_inventory_batches_shop_product') THEN
        DROP INDEX IF EXISTS public.idx_inventory_batches_shop_product;
    END IF;
END $$;
