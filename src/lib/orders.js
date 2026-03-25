/**
 * EFFIBOOKS — Orders Library
 * src/lib/orders.js
 *
 * PURPOSE: Fetches the last 30 days of orders from Shopify and calculates
 * all the revenue numbers the dashboard needs.
 *
 * COMMON ERROR: "Invalid API key or access token"
 * This means the access_token stored in your Supabase shops table is wrong
 * or has expired. HOW TO FIX:
 *   1. Go to Supabase Table Editor → shops table
 *   2. Check the access_token column — it should start with "shpat_"
 *   3. If it's blank or wrong, re-run the Shopify OAuth install flow
 *   4. The new token will start with "shpat_" e.g. "shpat_abc123..."
 */


// ─────────────────────────────────────────────────────────────────────────────
// getOrders
//
// Calls the Shopify Orders API and returns an array of order objects.
// Each order contains: id, name, total_price, line_items, refunds, etc.
//
// PARAMETERS:
//   shop        — the store domain e.g. "effibooks-test-shop.myshopify.com"
//   accessToken — the shpat_ token from Supabase shops table
//   daysBack    — how far back to fetch (default: 30 days)
//
// RETURNS: Array of order objects, or empty array [] if anything goes wrong.
//
// DEBUGGING: If you get "Invalid API key", check the accessToken value.
//   Log it like this to see what's being sent:
//   console.log('[Orders] Using token:', accessToken?.slice(0, 10) + '...')
// ─────────────────────────────────────────────────────────────────────────────
export async function getOrders(shop, accessToken, { daysBack = 30 } = {}) {

  // Calculate the date 30 days ago — Shopify only returns orders after this date
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);  // Go back 30 days from today

  // Build the Shopify API URL with query parameters
  // "fields" tells Shopify which fields to return — keeps the response small and fast
  const url =
    `https://${shop}/admin/api/2024-01/orders.json?` +
    `status=any` +                                      // Get all orders (paid, pending, cancelled)
    `&limit=250` +                                      // Max 250 per request (Shopify's limit)
    `&created_at_min=${sinceDate.toISOString()}` +      // Only orders from last 30 days
    `&fields=id,name,created_at,financial_status,` +    // Order ID, number like "#1042", date, status
    `total_price,subtotal_price,total_discounts,` +     // Money fields
    `line_items,refunds,currency`;                      // Products in order + any refunds

  try {
    // Make the API call to Shopify
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,  // THIS is the token from your Supabase shops table
        // If this token is wrong, Shopify returns: "Invalid API key or access token"
      },
      cache: 'no-store', // Always fetch fresh data, never use browser/server cache
    });

    // Parse the JSON response body
    const data = await response.json();

    // Check if Shopify returned an error inside the JSON body
    // This is different from an HTTP error — Shopify sometimes returns 200 with errors inside
    if (data.errors) {
      // data.errors is usually a string like "[API] Invalid API key or access token"
      console.error('[Orders] Shopify returned an error:', JSON.stringify(data.errors));
      // HOW TO FIX: This almost always means your access_token in Supabase is expired.
      // Go to Supabase → shops table → check access_token starts with "shpat_"
      return []; // Return empty array so the dashboard still loads (just with no orders)
    }

    // Return the orders array — could be empty [] if no orders in last 30 days
    return data.orders || [];

  } catch (err) {
    // This catches network failures — e.g. no internet, or Shopify is down
    console.error('[Orders] Network error when fetching orders:', err.message);
    return []; // Return empty array so dashboard still loads
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// calculateOrderStats
//
// Takes the raw orders array from getOrders() and calculates all the numbers
// the dashboard needs: today's revenue, weekly revenue, top sellers, etc.
//
// PARAMETERS:
//   orders   — array of order objects from getOrders()
//   currency — store currency code e.g. 'KES', 'USD'
//
// RETURNS: An object with all calculated stats. If orders is empty,
//   returns zeroed-out stats so the dashboard doesn't crash.
// ─────────────────────────────────────────────────────────────────────────────
export function calculateOrderStats(orders, currency = 'USD') {

  // Guard: if no orders came back, return safe zero values
  // This prevents "cannot read property of undefined" crashes
  if (!orders || orders.length === 0) {
    return {
      totalRevenue:     0,    // 30-day gross revenue
      todayRevenue:     0,    // Revenue just from today
      weekRevenue:      0,    // Revenue from last 7 days
      totalOrders:      0,    // Total order count (30 days)
      todayOrders:      0,    // Orders placed today
      averageOrderValue: 0,   // totalRevenue / totalOrders
      totalRefunds:     0,    // Total refunded amount
      topProducts:      [],   // Top 5 products by revenue
      slowMovers:       [],   // Products with ≤2 sales
      revenueByDay:     [],   // 7 days of daily revenue for the chart
      currency,               // Pass currency through so components can format numbers
    };
  }

  // Set up date boundaries for filtering
  const now = new Date();                         // Right now

  const todayStart = new Date(now);               // Start of today (midnight)
  todayStart.setHours(0, 0, 0, 0);               // Set to 00:00:00.000

  const weekStart = new Date(now);                // 7 days ago
  weekStart.setDate(weekStart.getDate() - 7);    // Subtract 7 days

  // Running totals — we'll add to these as we loop through orders
  let totalRevenue  = 0;   // All revenue in 30 days
  let todayRevenue  = 0;   // Revenue from today only
  let weekRevenue   = 0;   // Revenue from last 7 days
  let totalOrders   = 0;   // Count of valid orders
  let todayOrders   = 0;   // Count of orders placed today
  let totalRefunds  = 0;   // Total refunded amount

  // Objects to track per-product sales — keyed by product_id
  // e.g. { "12345": { title: "Snowboard", quantity: 10, revenue: 6299.50 } }
  const productSales = {};

  // Object to track revenue per day — keyed by date string
  // e.g. { "2026-03-23": 1500, "2026-03-22": 2300 }
  const revenueByDay = {};

  // Loop through every order and calculate stats
  for (const order of orders) {

    // Skip voided orders — they were cancelled before any money changed hands
    if (order.financial_status === 'voided') continue;

    const orderDate = new Date(order.created_at);         // When the order was placed
    const amount    = parseFloat(order.total_price || 0); // How much the order was for
    const dayKey    = orderDate.toISOString().split('T')[0]; // Date string e.g. "2026-03-23"

    // Add to 30-day totals
    totalRevenue += amount;
    totalOrders++;

    // Add to daily revenue tracker (for the bar chart)
    revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + amount;

    // Check if this order was placed today
    if (orderDate >= todayStart) {
      todayRevenue += amount;
      todayOrders++;
    }

    // Check if this order was placed in the last 7 days
    if (orderDate >= weekStart) {
      weekRevenue += amount;
    }

    // Add up refunds from this order
    // Shopify stores refunds as an array on each order
    for (const refund of order.refunds || []) {
      for (const transaction of refund.transactions || []) {
        if (transaction.kind === 'refund') {  // Only count actual refunds, not captures
          totalRefunds += parseFloat(transaction.amount || 0);
        }
      }
    }

    // Track which products were in this order (for top sellers / slow movers)
    for (const item of order.line_items || []) {
      const key = item.product_id || item.title; // Use product_id as key, fall back to title
      if (!key) continue; // Skip if no product ID (shouldn't happen but safety check)

      // Create entry for this product if we haven't seen it before
      if (!productSales[key]) {
        productSales[key] = {
          productId: key,
          title:     item.title,   // Product name e.g. "The Complete Snowboard"
          quantity:  0,             // Total units sold across all orders
          revenue:   0,             // Total revenue from this product
        };
      }

      // Add this line item's numbers to the product totals
      productSales[key].quantity += item.quantity || 0;
      productSales[key].revenue  += parseFloat(item.price || 0) * (item.quantity || 0);
    }
  }

  // Sort products by revenue (highest first) to get top sellers
  const sortedProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue);

  const topProducts = sortedProducts.slice(0, 5);  // Top 5 revenue earners

  // Slow movers: products that sold 2 or fewer units in 30 days
  const slowMovers = sortedProducts
    .filter(p => p.quantity <= 2)
    .slice(0, 5);

  // Build exactly 7 days of revenue data for the bar chart
  // We do this by iterating the last 7 days and looking up each date
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);                              // Go back i days
    const key   = d.toISOString().split('T')[0];             // e.g. "2026-03-23"
    const label = d.toLocaleDateString('en', { weekday: 'short' }); // e.g. "Mon"

    last7Days.push({
      date:    key,
      label:   label,
      revenue: Math.round((revenueByDay[key] || 0) * 100) / 100, // 0 if no orders that day
    });
  }

  // Return all calculated stats — used by page.js, RevenueStrip, SundayStatement, and Gemini
  return {
    totalRevenue:      Math.round(totalRevenue  * 100) / 100,   // Round to 2 decimal places
    todayRevenue:      Math.round(todayRevenue  * 100) / 100,
    weekRevenue:       Math.round(weekRevenue   * 100) / 100,
    totalOrders,
    todayOrders,
    averageOrderValue: totalOrders > 0
      ? Math.round((totalRevenue / totalOrders) * 100) / 100    // Avoid dividing by zero
      : 0,
    totalRefunds:      Math.round(totalRefunds  * 100) / 100,
    topProducts,
    slowMovers,
    revenueByDay:      last7Days,
    currency,
  };
}
