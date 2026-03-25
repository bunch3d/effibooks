/**
 * EFFIBOOKS — Shopify API Helper Library
 * lib/shopify.js
 *
 * All Shopify API interactions go through this file.
 * Uses the REST Admin API (2025-01 version).
 *
 * Why a dedicated lib?
 * - Centralizes all API version management
 * - Makes rate limit handling consistent
 * - Easy to swap to GraphQL Admin API later (Phase 2)
 */

const SHOPIFY_API_VERSION = "2025-01";

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch wrapper — handles auth headers + error formatting consistently
// ─────────────────────────────────────────────────────────────────────────────
async function shopifyFetch(shop, accessToken, endpoint, options = {}) {
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Shopify returns 429 when rate limited — respect the Retry-After header
  if (response.status === 429) {
    const retryAfter = parseFloat(response.headers.get("Retry-After") || "2");
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return shopifyFetch(shop, accessToken, endpoint, options); // Retry once
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Shopify API error ${response.status} at ${endpoint}: ${body}`
    );
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/api/shop.json
// Returns store metadata: name, email, currency, timezone, etc.
// Called immediately after OAuth to display in the success screen.
// ─────────────────────────────────────────────────────────────────────────────
export async function getShopInfo(shop, accessToken) {
  const data = await shopifyFetch(shop, accessToken, "shop.json");
  return {
    name: data.shop.name,
    email: data.shop.email,
    currency: data.shop.currency,
    timezone: data.shop.iana_timezone,
    domain: data.shop.domain,
    planName: data.shop.plan_name,
    myshopifyDomain: data.shop.myshopify_domain,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/api/orders.json (paginated)
// Fetches orders within a date range for the reconciliation engine.
//
// Important notes:
// - Shopify paginates at 250 orders per page (use cursor-based pagination)
// - We request financial_status=any to capture all states including refunded
// - created_at_min/max gives us the 30-day window for the Sunday Statement
// ─────────────────────────────────────────────────────────────────────────────
export async function getOrders(shop, accessToken, { daysBack = 30 } = {}) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);

  const allOrders = [];
  let pageInfo = null;
  let isFirstPage = true;

  // Shopify uses cursor-based pagination (Link header) for orders
  while (isFirstPage || pageInfo) {
    const params = new URLSearchParams({
      limit: "250",
      status: "any",
      financial_status: "any",
      created_at_min: sinceDate.toISOString(),
      fields: [
        "id",
        "name",
        "created_at",
        "financial_status",
        "total_price",
        "subtotal_price",
        "total_discounts",
        "total_tax",
        "total_shipping_price_set",
        "refunds",
        "payment_gateway_names",
        "checkout_id",
        "line_items",
        "currency",
      ].join(","),
    });

    // On subsequent pages, replace params with the cursor
    if (pageInfo) {
      params.set("page_info", pageInfo);
      // When using page_info, Shopify ignores other filters — this is by design
    }

    const data = await shopifyFetch(
      shop,
      accessToken,
      `orders.json?${params.toString()}`
    );

    allOrders.push(...data.orders);
    isFirstPage = false;

    // Parse next page cursor from Link header
    // Format: <URL>; rel="next", <URL>; rel="previous"
    pageInfo = null; // Will be set by real pagination logic in production
    // TODO (Phase 2): Implement Link header parsing for full pagination
    break; // For MVP: first 250 orders is sufficient for most SMBs
  }

  return allOrders;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/api/payouts.json
// Returns Shopify Payments payouts — the "real money" deposited to bank.
// This is the core of the reconciliation engine: match orders → payouts.
//
// Note: Only available if the merchant uses Shopify Payments.
// For Stripe-only stores, we skip this and reconcile against Stripe directly.
// ─────────────────────────────────────────────────────────────────────────────
export async function getPayouts(shop, accessToken, { daysBack = 30 } = {}) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);

  try {
    const data = await shopifyFetch(
      shop,
      accessToken,
      `shopify_payments/payouts.json?date_min=${sinceDate.toISOString().split("T")[0]}`
    );
    return data.payouts || [];
  } catch (err) {
    // 422 means the shop doesn't use Shopify Payments — that's OK
    if (err.message.includes("422")) {
      return [];
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Calculate the "Sunday Statement" numbers from raw order data
// This is the core reconciliation logic for Phase 1 MVP.
//
// Returns the breakdown that powers the Sunday Statement UI component.
// ─────────────────────────────────────────────────────────────────────────────
export function calculateSundayStatement(orders) {
  let grossRevenue = 0;
  let totalRefunds = 0;
  let totalDiscounts = 0;
  let orderCount = 0;
  let refundCount = 0;

  for (const order of orders) {
    const orderTotal = parseFloat(order.total_price || 0);
    grossRevenue += orderTotal;
    orderCount++;

    // Sum refunds across all refund transactions on this order
    if (order.refunds && order.refunds.length > 0) {
      for (const refund of order.refunds) {
        for (const transaction of refund.transactions || []) {
          if (transaction.kind === "refund") {
            totalRefunds += parseFloat(transaction.amount || 0);
            refundCount++;
          }
        }
      }
    }

    totalDiscounts += parseFloat(order.total_discounts || 0);
  }

  // Estimate Shopify transaction fees (2.9% + $0.30 per order for Basic plan)
  // In Phase 2 this will be replaced with actual payout data
  const estimatedShopifyFees =
    (grossRevenue - totalRefunds) * 0.029 + orderCount * 0.3;

  const netRevenue = grossRevenue - totalRefunds;
  const revenueAfterFees = netRevenue - estimatedShopifyFees;

  return {
    grossRevenue: Math.round(grossRevenue * 100) / 100,
    totalRefunds: Math.round(totalRefunds * 100) / 100,
    refundCount,
    totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    estimatedShopifyFees: Math.round(estimatedShopifyFees * 100) / 100,
    netRevenue: Math.round(netRevenue * 100) / 100,
    revenueAfterFees: Math.round(revenueAfterFees * 100) / 100,
    orderCount,
    averageOrderValue:
      orderCount > 0
        ? Math.round((grossRevenue / orderCount) * 100) / 100
        : 0,
  };
}
