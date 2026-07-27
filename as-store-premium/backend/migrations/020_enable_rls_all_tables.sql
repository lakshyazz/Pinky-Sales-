-- Migration 020: Enable RLS across all public schema tables dynamically
-- Protects Supabase from unauthenticated/anonymous REST API access while allowing Express backend access.

DO $$ 
DECLARE 
    tbl RECORD;
BEGIN
    FOR tbl IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
    END LOOP;
END $$;
