-- Migration 056: Create email logs and alerts audit table + customer email support
CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  recipient TEXT NOT NULL,
  email_type TEXT NOT NULL,
  reference_id TEXT,
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_logs_type_ref_created 
  ON email_logs (email_type, reference_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_created_at 
  ON email_logs (created_at DESC);

-- Ensure customers table has an email column for invoice dispatch
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(255);
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email);
