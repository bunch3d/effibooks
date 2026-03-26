-- ============================================================================
-- EFFIBOOKS — COMPLETE DATABASE SCHEMA (Sprint 3)
-- Run each block ONE AT A TIME in Supabase SQL Editor.
-- Copy one block, paste it, click RUN, wait for "Success", then do the next.
-- ============================================================================


-- ============================================================================
-- BLOCK 1: The shops table
-- This stores one row per connected Shopify store.
-- The access_token is what lets us call the Shopify API.
-- If this token is wrong or expired, you get "Invalid API key" errors.
-- ============================================================================
CREATE TABLE IF NOT EXISTS shops (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),  -- Unique ID for each shop
  shop_domain         VARCHAR(255)  NOT NULL UNIQUE,                        -- e.g. "effibooks-test-shop.myshopify.com"
  access_token        TEXT,                                                  -- The Shopify API token (from OAuth)
  shop_name           VARCHAR(255),                                          -- Human readable store name
  currency            VARCHAR(10)   DEFAULT 'USD',                          -- Store currency e.g. "KES", "USD"
  onboarding_status   VARCHAR(50)   DEFAULT 'SHOPIFY_CONNECTED',            -- Where they are in setup
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),                  -- When they first installed
  updated_at          TIMESTAMPTZ   DEFAULT NOW()                            -- Last time their record changed
);


-- ============================================================================
-- BLOCK 2: The sync_logs table
-- Every time we fetch data from Shopify, we log it here.
-- This is what the analytics.js file writes to.
-- ALL columns that analytics.js uses MUST exist here or you get schema errors.
-- Current columns analytics.js needs: shop_domain, sync_type, records_synced,
--   status, error_message, synced_at
-- ============================================================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),  -- Unique ID for each sync event
  shop_domain     VARCHAR(255)  NOT NULL,                               -- Which store this sync was for
  sync_type       VARCHAR(50)   NOT NULL DEFAULT 'products',            -- What we synced: 'products' or 'orders'
  records_synced  INTEGER       DEFAULT 0,                              -- How many records came back
  status          VARCHAR(20)   NOT NULL DEFAULT 'success',             -- 'success' or 'error'
  error_message   TEXT,                                                  -- If status='error', the error goes here
  synced_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()                  -- When this sync happened
);


-- ============================================================================
-- BLOCK 3: The order_snapshots table
-- Every Shopify order gets stored here.
-- This powers the Revenue Strip and Sunday Statement on the dashboard.
-- Also updated by the webhook when a new order comes in live.
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_snapshots (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),  -- Unique ID
  shop_domain         VARCHAR(255)  NOT NULL,                               -- Which store this order belongs to
  shopify_order_id    BIGINT        NOT NULL,                               -- Shopify's own order ID number
  order_name          VARCHAR(50),                                           -- e.g. "#1042" — human readable
  financial_status    VARCHAR(50),                                           -- 'paid', 'refunded', 'voided' etc
  gross_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,                     -- Total charged to customer
  discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,                     -- Any discounts applied
  refund_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,                     -- Amount refunded back
  currency            VARCHAR(10)   DEFAULT 'USD',                          -- Currency of this order
  order_created_at    TIMESTAMPTZ   NOT NULL,                               -- When the order was placed
  synced_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),                  -- When we last synced this order
  UNIQUE (shop_domain, shopify_order_id)                                    -- Prevent duplicate orders
);


-- ============================================================================
-- BLOCK 4: The briefing_logs table
-- Every time Gemini generates a briefing, we store a preview here.
-- Useful for debugging if the AI starts giving wrong answers.
-- ============================================================================
CREATE TABLE IF NOT EXISTS briefing_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),  -- Unique ID
  shop_domain      VARCHAR(255)  NOT NULL,                               -- Which store got this briefing
  briefing_preview TEXT,                                                  -- First 200 characters of the briefing
  generated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()                  -- When Gemini generated it
);


-- ============================================================================
-- BLOCK 5: Indexes — these make database queries faster
-- Without indexes, every query scans the whole table (slow for large datasets).
-- ============================================================================

-- Makes looking up sync logs by shop fast
CREATE INDEX IF NOT EXISTS idx_sync_logs_shop
  ON sync_logs (shop_domain, synced_at DESC);

-- Makes looking up orders by shop and date fast (used by dashboard)
CREATE INDEX IF NOT EXISTS idx_order_snapshots_shop_date
  ON order_snapshots (shop_domain, order_created_at DESC);

-- Makes looking up briefings by shop fast
CREATE INDEX IF NOT EXISTS idx_briefing_logs_shop
  ON briefing_logs (shop_domain, generated_at DESC);


-- ============================================================================
-- BLOCK 6: Verification — run this last to confirm all tables exist
-- You should see: briefing_logs, order_snapshots, shops, sync_logs
-- ============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;


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

