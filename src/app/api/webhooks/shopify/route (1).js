/**
 * EFFIBOOKS — Shopify Webhook Handler
 * src/app/api/webhooks/shopify/route.js
 *
 * PURPOSE: Receives real-time events from Shopify.
 * When a customer places an order, Shopify immediately calls this URL.
 * We save the order to Supabase so the dashboard updates without refreshing.
 *
 * HOW WEBHOOKS WORK:
 *   1. Customer buys something on Shopify
 *   2. Shopify sends a POST request to this URL with order data
 *   3. We verify the request came from Shopify (HMAC check)
 *   4. We save the order to order_snapshots table in Supabase
 *   5. Next dashboard refresh shows the new order
 *
 * HOW TO REGISTER THIS WEBHOOK (run this once in terminal):
 *   Replace YOUR_TOKEN with your shpat_ token from Supabase
 *   Replace YOUR_NGROK_URL with your ngrok URL (for local testing)
 *
 *   curl -X POST https://effibooks-test-shop.myshopify.com/admin/api/2024-01/webhooks.json \
 *     -H "X-Shopify-Access-Token: YOUR_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"webhook":{"topic":"orders/create","address":"https://YOUR_NGROK_URL/api/webhooks/shopify","format":"json"}}'
 *
 * COMMON ERRORS:
 *   401 Unauthorized → HMAC check failed (request didn't come from Shopify)
 *   500 Internal Server Error → Check terminal for the actual error message
 */

import { NextResponse } from 'next/server';
import crypto           from 'crypto';
import { createClient } from '@/utils/supabase';


// ─────────────────────────────────────────────────────────────────────────────
// verifyShopifyWebhook (private security function)
//
// Shopify signs every webhook with your API secret using SHA-256 HMAC.
// We verify this signature to confirm the request actually came from Shopify
// and not from someone trying to fake data.
//
// PARAMETERS:
//   rawBody    — the raw request body text (must be read BEFORE parsing JSON)
//   hmacHeader — the "x-shopify-hmac-sha256" header value from the request
//
// RETURNS: true if valid, false if not
// ─────────────────────────────────────────────────────────────────────────────
function verifyShopifyWebhook(rawBody, hmacHeader) {
  // If there's no HMAC header, reject immediately
  if (!hmacHeader) {
    console.warn('[Webhook] No HMAC header found — rejecting request');
    return false;
  }

  // Compute what the HMAC should be using our API secret
  // SHOPIFY_API_SECRET must be set in .env.local
  const expectedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')    // Hash the raw request body
    .digest('base64');           // Output as base64 string

  // Use timingSafeEqual to prevent timing attacks
  // (regular === comparison leaks info about how many characters match)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader),    // What Shopify sent
      Buffer.from(expectedHmac)   // What we calculated
    );
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// POST handler — called by Shopify for every webhook event
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request) {

  // Read the raw body text FIRST — we need this for HMAC verification
  // IMPORTANT: must be read before any other parsing
  const rawBody = await request.text();

  // Read the Shopify webhook headers
  const hmac  = request.headers.get('x-shopify-hmac-sha256');  // Security signature
  const topic = request.headers.get('x-shopify-topic');         // Event type e.g. "orders/create"
  const shop  = request.headers.get('x-shopify-shop-domain');   // Store domain

  // ── Security check ────────────────────────────────────────────────────
  // Reject any request that doesn't have a valid Shopify signature
  if (!verifyShopifyWebhook(rawBody, hmac)) {
    console.error('[Webhook] HMAC verification FAILED — request rejected from:', shop);
    // Return 401 so Shopify knows the verification failed
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse the JSON payload ────────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(rawBody); // Now it's safe to parse the verified body
  } catch {
    console.error('[Webhook] Failed to parse JSON body');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.info(`[Webhook] ✓ Received: ${topic} from ${shop}`);

  // Create Supabase client to save the data
  const supabase = await createClient();

  // ── Route to the right handler based on event topic ──────────────────
  try {
    switch (topic) {

      case 'orders/create':
        // New order placed — save to order_snapshots
        await handleOrderCreated(supabase, shop, payload);
        break;

      case 'orders/paid':
        //Order's payment was confirmed- same as create
        await handleOrderCreated(supabase, shop, payload);  
        break;

      case 'orders/updated':
        // Order was modified (e.g. refund added) — update our record
        await handleOrderUpdated(supabase, shop, payload);
        break;

      case 'app/uninstalled':
        // Merchant removed the app from their Shopify store
        await handleAppUninstalled(supabase, shop);
        break;

      default:
        // We received a topic we don't handle — log it but don't error
        console.info(`[Webhook] Unhandled topic: ${topic} — ignoring`);
    }

  } catch (err) {
    // Log the error but ALWAYS return 200 to Shopify
    // If we return a non-200, Shopify will retry the webhook many times
    console.error(`[Webhook] Handler threw an error for ${topic}:`, err.message);
  }

  // Always return 200 within 5 seconds — Shopify requires this
  return NextResponse.json({ received: true }, { status: 200 });
}


// ─────────────────────────────────────────────────────────────────────────────
// handleOrderCreated — saves a new order to Supabase
// Called when topic is "orders/create" or "orders/paid"
// ─────────────────────────────────────────────────────────────────────────────
async function handleOrderCreated(supabase, shop, order) {
  const { error } = await supabase
    .from('order_snapshots')  // The table created in Sch.sql 
    .upsert(
      {
        shop_domain:       shop,                                // e.g. "effibooks-test-shop.myshopify.com"
        shopify_order_id:  order.id,                           // Shopify's numeric order ID
        order_name:        order.name,                         // Human readable e.g. "#1042"
        financial_status:  order.financial_status,             // "paid", "pending", etc.
        gross_amount:      parseFloat(order.total_price || 0), // Total charged to customer
        discount_amount:   parseFloat(order.total_discounts || 0),
        refund_amount:     0,                                  // Starts at 0, updated by handleOrderUpdated
        currency:          order.currency,                     // e.g. "KES"
        order_created_at:  order.created_at,                   // When the order was placed on Shopify
        synced_at:         new Date().toISOString(),            // When we received this webhook
      },
      {
        onConflict: 'shop_domain,shopify_order_id', // If order already exists, update it
      }
    );

  if (error) {
    console.error('[Webhook] Failed to save order to order_snapshots:', error.message);
    // HOW TO FIX: Make sure order_snapshots table exists — run SCHEMA.sql Block 3
    throw error; // Re-throw so the error is caught by the main handler
  }
  // Common causes:
    //   "relation order_snapshots does not exist" → run SCHEMA.sql Block 3
    //   "null value in column" → a NOT NULL column has a null value, check the upsert above


  console.info(`[Webhook] ✓ Order ${order.name} saved for ${shop}`);

  //Also log to sync_logs so LiveSyncBadge can show "Synced just now"
  await supabase.from('sync_logs').insert({
    shop_domain: shop,
    sync_type:      'webhook_order',  // Different from 'products' so we can distinguish
    records_synced: 1,
    status:         'success',
    error_message:  null,
    synced_at:   new Date().toISOString(),
  }).catch(e => console.warn('[Webhook] Failed to log sync in sync_logs:', e.message));
  // Using .catch() instead of try /catch because this log is non-critical
}


// ─────────────────────────────────────────────────────────────────────────────
// handleOrderUpdated — updates an existing order record
// Called when a refund is added or financial status changes
// ─────────────────────────────────────────────────────────────────────────────
async function handleOrderUpdated(supabase, shop, order) {
  // Calculate the total refund amount from all refund transactions on this order
  let refundAmount = 0;
  for (const refund of order.refunds || []) {
    for (const transaction of refund.transactions || []) {
      if (transaction.kind === 'refund') {  // Only count actual refunds
        refundAmount += parseFloat(transaction.amount || 0);
      }
    }
  }

  // Update the existing order record in Supabase
  const { error } = await supabase
    .from('order_snapshots')
    .update({
      financial_status: order.financial_status,   // May have changed (e.g. now "refunded")
      refund_amount:    refundAmount,              // Updated refund total
      synced_at:        new Date().toISOString(),  // Record when we last updated this
    })
    .eq('shop_domain',      shop)       // Only update this shop's orders
    .eq('shopify_order_id', order.id);  // Only update this specific order

  if (error) {
    console.error('[Webhook] Failed to update order:', error.message);
    throw error;
  }

  console.info(`[Webhook] ✓ Order ${order.name} updated — refund: ${refundAmount}`); //for ${shop} removed it but will run it then see if needed
}


// ─────────────────────────────────────────────────────────────────────────────
// handleAppUninstalled — clears the access token when merchant uninstalls
// This prevents the dashboard from trying to use an invalid token
// ─────────────────────────────────────────────────────────────────────────────
async function handleAppUninstalled(supabase, shop) {
  console.info(`[Webhook] App uninstalled by ${shop} — clearing access token`);

  const { error } = await supabase
    .from('shops')
    .update({
      access_token:      null,              // Clear the token so we can't make API calls
      onboarding_status: 'UNINSTALLED',     // Mark as uninstalled
      updated_at:        new Date().toISOString(),
    })
    .eq('shop_domain', shop);

  if (error) {
    console.error('[Webhook] Failed to clear access token for uninstalled shop:', error.message);
  }
}
