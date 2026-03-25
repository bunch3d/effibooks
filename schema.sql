-- ============================================================================
-- EFFIBOOKS — Database Schema
-- schema.sql
--
-- Run this once to initialize your database.
-- Compatible with PostgreSQL 14+ (Supabase, Neon, Railway, AWS RDS).
--
-- Apply with: psql $DATABASE_URL -f schema.sql
-- ============================================================================

-- Enable UUID generation (built into Postgres 13+, explicit for older versions)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================================
-- TABLE: merchants
-- Core table. One row per connected Shopify store.
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchants (

  -- Primary key — use UUID (not serial int) so IDs are safe to expose in URLs
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The shop's .myshopify.com domain — our primary identifier for a store.
  -- UNIQUE constraint ensures one merchant record per store (handles re-installs).
  shopify_domain      VARCHAR(255)  NOT NULL UNIQUE,

  -- AES-256-GCM encrypted access token.
  -- Format stored: "iv_hex:auth_tag_hex:ciphertext_hex"
  -- NEVER store plaintext. See lib/db.js for encrypt/decrypt functions.
  access_token        TEXT          NOT NULL,

  -- Human-readable store name (e.g., "Sunday Best Apparel")
  -- Pulled from /admin/api/shop.json after OAuth completes.
  shop_name           VARCHAR(255),

  -- Primary contact email for the store
  shop_email          VARCHAR(255),

  -- Store's default currency (e.g., "USD", "GBP", "EUR")
  currency            VARCHAR(10)   DEFAULT 'USD',

  -- Tracks where the merchant is in the onboarding funnel.
  -- Drives the UI: which step to show next (Stripe, Ads, etc.)
  onboarding_status   VARCHAR(50)   NOT NULL DEFAULT 'SHOPIFY_CONNECTED'
                      CHECK (onboarding_status IN (
                        'SHOPIFY_CONNECTED',  -- ← OAuth done, Stripe not yet connected
                        'STRIPE_PENDING',     -- ← Stripe flow started but not complete
                        'STRIPE_CONNECTED',   -- ← Stripe done, Ads not yet connected
                        'ADS_PENDING',
                        'ADS_CONNECTED',
                        'ONBOARDING_COMPLETE' -- ← All integrations done, briefing active
                      )),

  -- When this record was first created (first install)
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Last update time — useful for debugging and cache invalidation
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()

);

-- Index on shopify_domain for fast lookups during OAuth callbacks
CREATE INDEX IF NOT EXISTS idx_merchants_shopify_domain
  ON merchants (shopify_domain);

-- Index on onboarding_status for filtering in admin dashboards
CREATE INDEX IF NOT EXISTS idx_merchants_onboarding_status
  ON merchants (onboarding_status);


-- ============================================================================
-- TABLE: sync_jobs
-- Tracks each data sync run for a merchant.
-- Allows retry logic and prevents duplicate syncs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_jobs (

  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- What type of sync this is
  job_type        VARCHAR(50)   NOT NULL
                  CHECK (job_type IN (
                    'initial_30d',     -- First sync after OAuth — pulls 30 days
                    'daily_refresh',   -- Nightly incremental sync
                    'manual_refresh'   -- User-triggered re-sync
                  )),

  status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'complete', 'failed')),

  -- How many orders were processed in this sync
  orders_synced   INTEGER       DEFAULT 0,

  -- Store any error message if the job fails (for retry logic)
  error_message   TEXT,

  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()

);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_merchant_id
  ON sync_jobs (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_status
  ON sync_jobs (status) WHERE status IN ('pending', 'running');


-- ============================================================================
-- TABLE: order_snapshots
-- Stores a summarized snapshot of each Shopify order.
-- We do NOT store every line item — just the financial fields we need
-- for the Sunday Statement reconciliation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_snapshots (

  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id           UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- Shopify's internal order ID (bigint)
  shopify_order_id      BIGINT        NOT NULL,

  -- Human-readable order number (e.g., "#1042")
  order_name            VARCHAR(50),

  -- Financial status from Shopify
  financial_status      VARCHAR(50),

  -- Core financial fields (all stored in store's currency)
  gross_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  refund_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Shopify Payments transaction fee (if available from payout data)
  platform_fee          NUMERIC(12,2),

  -- The Stripe/Shopify payout ID this order was included in (if known)
  payout_id             VARCHAR(255),

  order_created_at      TIMESTAMPTZ   NOT NULL,
  synced_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Prevent duplicate inserts on re-sync
  UNIQUE (merchant_id, shopify_order_id)

);

CREATE INDEX IF NOT EXISTS idx_order_snapshots_merchant_date
  ON order_snapshots (merchant_id, order_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_snapshots_payout
  ON order_snapshots (merchant_id, payout_id) WHERE payout_id IS NOT NULL;


-- ============================================================================
-- TABLE: daily_briefings
-- Stores each generated briefing for a merchant.
-- Allows re-sending, auditing, and building briefing history.
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_briefings (

  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  briefing_date   DATE          NOT NULL,

  -- The plain-English briefing text generated by Gemini
  briefing_text   TEXT          NOT NULL,

  -- Key financial metrics for that day (stored for display in the dashboard)
  revenue         NUMERIC(12,2),
  real_profit     NUMERIC(12,2),
  ad_spend        NUMERIC(12,2),
  order_count     INTEGER,

  -- Delivery tracking
  sent_at         TIMESTAMPTZ,
  delivery_method VARCHAR(20)   CHECK (delivery_method IN ('email', 'sms', 'both')),

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (merchant_id, briefing_date)

);

CREATE INDEX IF NOT EXISTS idx_daily_briefings_merchant_date
  ON daily_briefings (merchant_id, briefing_date DESC);


-- ============================================================================
-- TABLE: waitlist
-- Beta waitlist signups from the landing page.
-- Simple — just email and source.
-- ============================================================================

CREATE TABLE IF NOT EXISTS waitlist (

  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255)  NOT NULL UNIQUE,
  store_url   VARCHAR(255),
  source      VARCHAR(100)  DEFAULT 'landing_page',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()

);


-- ============================================================================
-- TRIGGER: auto-update updated_at on merchants
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- VERIFICATION QUERY — run after applying to confirm everything created
-- ============================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
