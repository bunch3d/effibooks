/**
 * EFFIBOOKS — Database Helper Library
 * lib/db.js
 *
 * Handles all database operations for the Merchants table.
 * Uses pg (node-postgres) with a connection pool.
 *
 * CRITICAL SECURITY: access_tokens are encrypted at rest using AES-256-GCM
 * before being written to the database. Even if the DB is compromised,
 * tokens are useless without the ENCRYPTION_KEY environment variable.
 */

import { Pool } from "pg";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Connection Pool
// Reuse connections across requests (critical for serverless performance)
// ─────────────────────────────────────────────────────────────────────────────
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,              // Max 10 simultaneous DB connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: true }
          : false,
    });

    pool.on("error", (err) => {
      console.error("[DB Pool] Unexpected error on idle client:", err);
    });
  }
  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Encryption Helpers (AES-256-GCM)
// Never store a Shopify access_token in plaintext.
// ─────────────────────────────────────────────────────────────────────────────
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(key, "hex");
}

export function encryptToken(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Store as: iv:authTag:ciphertext (all hex-encoded)
  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptToken(ciphertext) {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":");

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertMerchant
// Inserts a new merchant or updates an existing one (on re-install).
// Returns the full merchant record.
// ─────────────────────────────────────────────────────────────────────────────
export async function upsertMerchant({
  shopifyDomain,
  accessToken,
  shopName,
  shopEmail,
  currency,
  onboardingStatus = "SHOPIFY_CONNECTED",
}) {
  const db = getPool();

  // Encrypt before writing — access_token never touches the DB in plaintext
  const encryptedToken = encryptToken(accessToken);

  const result = await db.query(
    `
    INSERT INTO merchants (
      shopify_domain,
      access_token,
      shop_name,
      shop_email,
      currency,
      onboarding_status,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    ON CONFLICT (shopify_domain) DO UPDATE SET
      access_token       = EXCLUDED.access_token,
      shop_name          = EXCLUDED.shop_name,
      shop_email         = EXCLUDED.shop_email,
      currency           = EXCLUDED.currency,
      onboarding_status  = EXCLUDED.onboarding_status,
      updated_at         = NOW()
    RETURNING id, shopify_domain, shop_name, onboarding_status, created_at
    `,
    [
      shopifyDomain,
      encryptedToken,
      shopName,
      shopEmail,
      currency,
      onboardingStatus,
    ]
  );

  return result.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// getMerchantByDomain — with decrypted token
// Used by background jobs and the briefing engine.
// ─────────────────────────────────────────────────────────────────────────────
export async function getMerchantByDomain(shopifyDomain) {
  const db = getPool();

  const result = await db.query(
    `SELECT id, shopify_domain, access_token, shop_name, shop_email,
            currency, onboarding_status, created_at, updated_at
     FROM merchants
     WHERE shopify_domain = $1`,
    [shopifyDomain]
  );

  if (result.rows.length === 0) return null;

  const merchant = result.rows[0];
  // Decrypt token before returning — never expose the encrypted form
  merchant.access_token = decryptToken(merchant.access_token);

  return merchant;
}

// ─────────────────────────────────────────────────────────────────────────────
// updateOnboardingStatus
// Advances the merchant through the onboarding funnel:
// SHOPIFY_CONNECTED → STRIPE_CONNECTED → ONBOARDING_COMPLETE
// ─────────────────────────────────────────────────────────────────────────────
export async function updateOnboardingStatus(merchantId, status) {
  const db = getPool();

  const validStatuses = [
    "SHOPIFY_CONNECTED",
    "STRIPE_PENDING",
    "STRIPE_CONNECTED",
    "ADS_PENDING",
    "ADS_CONNECTED",
    "ONBOARDING_COMPLETE",
  ];

  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid onboarding status: ${status}`);
  }

  const result = await db.query(
    `UPDATE merchants
     SET onboarding_status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, onboarding_status`,
    [status, merchantId]
  );

  return result.rows[0];
}
