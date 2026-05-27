-- PayPal captures without a matching WooCommerce order (manual recovery queue).
-- Apply in Supabase SQL Editor for project xmqxnwhszgsijmhdtrhg.

CREATE TABLE IF NOT EXISTS paypal_orphan_orders (
  id BIGSERIAL PRIMARY KEY,
  paypal_order_id TEXT NOT NULL UNIQUE,
  capture_id TEXT,
  amount_eur NUMERIC(10, 2),
  customer_email TEXT,
  raw_body JSONB,
  error_reason TEXT NOT NULL,
  error_details JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_wc_order_id INT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_paypal_orphan_unresolved
  ON paypal_orphan_orders (resolved)
  WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_paypal_orphan_email
  ON paypal_orphan_orders (customer_email);

ALTER TABLE paypal_orphan_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON paypal_orphan_orders
  FOR ALL
  USING (auth.role() = 'service_role');
