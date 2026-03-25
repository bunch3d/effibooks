/**
 * EFFIBOOKS — Shopify OAuth Initiation
 * Route: GET /api/auth/shopify?shop={shop}.myshopify.com
 *
 * Step 1: Validates the shop param
 * Step 2: Builds the Shopify authorization URL with required scopes
 * Step 3: Stores a nonce (state) in a secure cookie to prevent CSRF
 * Step 4: Redirects the merchant to Shopify's OAuth consent screen
 */

import { NextResponse } from "next/server";
import crypto from "crypto";

// Scopes required by Effibooks Phase 1 (orders, products, discounts)
const SHOPIFY_SCOPES = [
  "read_orders",
  "read_products",
  "read_discounts",
].join(",");

// Validates that the shop param is a legitimate .myshopify.com domain
// Prevents open-redirect attacks and malformed inputs
function isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");

  // ── Guard: shop param is required ──────────────────────────────────────────
  if (!shop) {
    return NextResponse.json(
      { error: "Missing required parameter: shop" },
      { status: 400 }
    );
  }

  // ── Guard: validate shop domain format ─────────────────────────────────────
  if (!isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: "Invalid shop domain. Must be a valid .myshopify.com address." },
      { status: 400 }
    );
  }

  // ── Security: generate a cryptographically random nonce (state param) ──────
  // This prevents CSRF attacks. We store it in a secure httpOnly cookie,
  // then verify it matches when Shopify redirects back.
  const nonce = crypto.randomBytes(16).toString("hex");

  // ── Build the Shopify authorization URL ────────────────────────────────────
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id", process.env.SHOPIFY_API_KEY);
  authUrl.searchParams.set("scope", SHOPIFY_SCOPES);
  authUrl.searchParams.set("redirect_uri", process.env.SHOPIFY_REDIRECT_URI);
  authUrl.searchParams.set("state", nonce);
  // "per-user" token type means each merchant gets their own access token
  authUrl.searchParams.set("grant_options[]", "per-user");

  // ── Redirect to Shopify with the nonce stored in a secure cookie ────────────
  const response = NextResponse.redirect(authUrl.toString());

  response.cookies.set("shopify_oauth_state", nonce, {
    httpOnly: true,       // Not accessible via JS (XSS protection)
    secure: true,         // HTTPS only
    sameSite: "lax",      // Allows redirect back from Shopify
    maxAge: 60 * 10,      // 10 minutes — OAuth should complete well within this
    path: "/",
  });

  return response;
}
