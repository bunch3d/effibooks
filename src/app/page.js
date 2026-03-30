/**
 * EFFIBOOKS — Main Dashboard Page
 * src/app/page.js
 *
 * PURPOSE: This is the main page users see at localhost:3000
 * It fetches all the data (products + orders), calculates stats,
 * generates the AI briefing, and renders the full dashboard.
 *
 * DATA FLOW:
 *   1. Get shop credentials from Supabase (access_token, shop_domain)
 *   2. Fetch products AND orders from Shopify API in parallel
 *   3. Calculate revenue stats from orders
 *   4. Generate AI briefing using Gemini
 *   5. Render everything
 *
 * COMMON ERROR: "Invalid API key or access token"
 *   → The access_token in your Supabase shops table is expired or wrong.
 *   → Fix: Go to Supabase → Table Editor → shops → update access_token
 *   → The correct token starts with "shpat_"
 */

// Next.js and Supabase imports
import { createClient } from '@/utils/supabase';

// Our custom components (each in src/components/)
import ProductCard      from '@/components/ProductCard';
import SearchBar        from '@/components/SearchBar';
import BriefingCard     from '@/components/BriefingCard';
import RevenueStrip     from '@/components/RevenueStrip';
import SundayStatement  from '@/components/SundayStatement';
import AlertBanner from '@/components/AlertBanner';
import LiveSyncBadge from '@/components/LiveSyncBadge';
import ExportButton from '@/components/ExportButton';

// Our library functions (each in src/lib/)
import { generateBriefing }                   from '@/lib/gemini';
import { logSync, logBriefing }               from '@/lib/analytics';
import { getOrders, calculateOrderStats }     from '@/lib/orders';
import { calculateAlerts }                      from '@/lib/alerts';



// ─────────────────────────────────────────────────────────────────────────────
// HomePage — the main page component
// This is an async Server Component — it runs on the server, not the browser.
// That's why we can call databases and APIs directly without useEffect.
// ─────────────────────────────────────────────────────────────────────────────
export default async function HomePage() {

  // Create a Supabase client to query the database
  const supabase = await createClient();

  // ── Step 1: Get shop credentials from Supabase ──────────────────────────
  // We fetch the first shop in the database (since we only have one in beta)
  const { data: shopData, error: dbError } = await supabase
    .from('shops')                                    // The shops table
    .select('access_token, shop_domain, shop_name, currency') // Only get the columns we need
    .limit(1)                                         // Only get 1 row (the first shop)
    .single();                                        // Return object instead of array

  // If database query failed or access_token is missing, show error
  if (dbError || !shopData?.access_token) {
    console.error('[Dashboard] Could not load shop from Supabase:', dbError?.message);
    // This renders an error message instead of the full dashboard
    return (
      <div className="p-8 text-red-600 font-sans bg-red-50 rounded-lg max-w-xl mx-auto mt-10">
        <strong>Database error:</strong> {dbError?.message || 'No shop found in database.'}
        <p className="mt-2 text-sm text-red-500">
          Fix: Check your Supabase shops table has a row with a valid access_token starting with "shpat_"
        </p>
      </div>
    );
  }

  // Destructure the shop data into individual variables for easier use
  const {
    access_token: token,    // The Shopify API token — if this is wrong, ALL Shopify calls fail
    shop_domain:  domain,   // e.g. "effibooks-test-shop.myshopify.com"
    shop_name,              // e.g. "Effibooks Test Shop" (may be null)
    currency = 'USD',       // Default to USD if not set in database
  } = shopData;


  // ── Step 2: Fetch products AND orders at the same time ──────────────────
  // Promise.allSettled runs both fetches in parallel — cuts load time in half
  // "allSettled" means even if one fails, the other still runs
  let products   = [];  // Will hold Shopify product objects
  let orders     = [];  // Will hold Shopify order objects
  let fetchError = null; // Will hold any error message to show the user

  const [productsResult, ordersResult] = await Promise.allSettled([

    // Fetch products from Shopify
    fetch(
      `https://${domain}/admin/api/2024-01/products.json?limit=50`,
      {
        headers: { 'X-Shopify-Access-Token': token }, // Send the auth token
        cache:   'no-store',                           // Always fresh data
      }
    ).then(r => r.json()), // Parse response to JSON

    // Fetch orders from our orders library (handles URL building)
    getOrders(domain, token, { daysBack: 30 }),
  ]);

  // Process products result
  if (productsResult.status === 'fulfilled') {
    // "fulfilled" means the fetch succeeded
    if (productsResult.value.errors) {
      // Shopify returned an error inside the JSON (e.g. bad access token)
      fetchError = JSON.stringify(productsResult.value.errors);
      console.error('[Dashboard] Shopify products error:', fetchError);
      // HOW TO FIX: Update access_token in Supabase shops table
    } else {
      products = productsResult.value.products || [];
      console.info(`[Dashboard] Loaded ${products.length} products for ${domain}`);
    }
  } else {
    // "rejected" means a network error occurred
    fetchError = productsResult.reason?.message || 'Failed to fetch products';
    console.error('[Dashboard] Products fetch rejected:', fetchError);
  }

  // Process orders result
  if (ordersResult.status === 'fulfilled') {
    orders = ordersResult.value; // getOrders() already returns [] on error, so this is safe
    console.info(`[Dashboard] Loaded ${orders.length} orders for ${domain}`);
  } else {
    console.warn('[Dashboard] Orders fetch rejected:', ordersResult.reason?.message);
    // Don't set fetchError for orders failure — dashboard still works with products only
  }


  // ── Step 3: Log this sync to Supabase (fire and forget) ─────────────────
  // We don't await this — it runs in the background so it doesn't slow the page
  // If it fails, the console warning is logged but the page still loads
  logSync(supabase, domain, products.length, fetchError).catch(console.warn);


  // ── Step 4: Calculate revenue statistics from orders ────────────────────
  // This converts the raw orders array into usable numbers
  const stats = calculateOrderStats(orders, currency);

  //calculateAlerts() scans every product for stock problems
  // Returns: { outOfStock: [], criticalStock: [], lowStock: [], redZoneCount: number }
  const alerts = calculateAlerts(products);

  // ── Step 5: Generate the AI briefing using Gemini ───────────────────────
  // We await this because the briefing needs to be ready before we render
  // Gemini Flash typically takes 1-2 seconds
  const briefing = await generateBriefing(products, orders, {
    shopName: shop_name || domain, // Use store name if available, otherwise domain
    currency,
    stats,
    alerts, //Pass alert data so Gemini can mention specific products in danger.
  });

  // Log the briefing to Supabase for history tracking (fire and forget)
  if (briefing.text && !briefing.error) {
    logBriefing(supabase, domain, briefing.text).catch(console.warn);
  }


  // ── Step 6: Calculate inventory stats ───────────────────────────────────
  // Calculate total inventory value (price × quantity for each product)
  const totalInventoryValue = products.reduce((sum, p) => {
    const price = parseFloat(p.variants?.[0]?.price || 0);  // Price of first variant
    const qty   = p.variants?.reduce(
      (q, v) => q + (v.inventory_quantity || 0), 0           // Sum all variant quantities
    ) || 0;
    return sum + price * qty;  // Add this product's value to running total
  }, 0);

  // Format inventory value as currency string e.g. "KES 561,131"
  const formattedInventoryValue = new Intl.NumberFormat('en', {
    style:              'currency',
    currency,
    maximumFractionDigits: 0, // No decimal places for large numbers
  }).format(totalInventoryValue);

    // Separate products into red zone vs normal for the inventory list
  // Red zone = out of stock OR critically low (≤3 units)
  const redZoneProducts = products.filter(p => {
    const qty = p.variants?.reduce((q, v) => q + (v.inventory_quantity || 0), 0) || 0;
    return qty <= 3; // 0, 1, 2, or 3 units = red zone
  });

  const healthyProducts = products.filter(p => {
    const qty = p.variants?.reduce((q, v) => q + (v.inventory_quantity || 0), 0) || 0;
    return qty > 3;
  });


  // ── Step 7: Render the dashboard ────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F3ED] font-sans">

      {/* ── Navigation bar ──────────────────────────────────────────────── */}
      <header className="bg-[#1B4332] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Logo circle */}
          <div className="w-8 h-8 bg-[#C9952A] rounded-lg flex items-center justify-center font-bold text-white text-sm">
            E
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Effibooks</span>
          {/* LiveSyncBadge shows when the last webhook event arrived */}
          <LiveSyncBadge domain={domain} />
        </div>
        <div className="flex items-center gap-4">
          {/* ExportButton — downloads a CSV of orders for the accountant */}
          <ExportButton orders={orders} stats={stats} currency={currency} shopName={shop_name || domain} />
          <div className="text-right">
            <p className="text-white text-sm font-medium">{shop_name || domain}</p>
            <p className="text-green-300 text-xs">{domain}</p>
          </div>
        </div>
      </header>


      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Error banner ──────────────────────────────────────────────── */}
        {/* Only shows if fetchError is set (i.e. Shopify API returned an error) */}
        {fetchError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <strong>Sync error:</strong> {fetchError}
            <p className="mt-1 text-xs text-red-400">
              Fix: Update access_token in Supabase shops table (must start with "shpat_")
            </p>
          </div>
        )}

                {/* ── Alert Banner ───────────────────────────────── */}
        {/* Only renders if there are products in the red zone */}
        {alerts.redZoneCount > 0 && (
          <AlertBanner alerts={alerts} />
        )}

        {/* Revenue overview */}
        <RevenueStrip stats={stats} currency={currency} />

        {/* Inventory stat cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Products',        value: products.length,              icon: '📦', alert: false },
            {
              label: 'Red Zone',
              value: alerts.redZoneCount,      // NEW: uses alerts count instead of just outOfStock
              icon:  '🚨',
              alert: alerts.redZoneCount > 0,
            },
            { label: 'Inventory Value', value: formattedInventoryValue,      icon: '💰', alert: false },
          ].map(({ label, value, icon, alert }) => (
            <div key={label} className="bg-white border border-[#DDD6CE] rounded-xl p-5 shadow-sm">
              <div className="text-2xl mb-2">{icon}</div>
              <div className={`text-2xl font-bold mb-1 ${alert ? 'text-red-600' : 'text-[#1B4332]'}`}>
                {value}
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>


        {/* ── AI Morning Brief ──────────────────────────────────────────── */}
        {/* Gemini-generated plain English summary */}
        <BriefingCard briefing={briefing} shopName={shop_name || domain} />

        {/* ── Sunday Statement (Sprint 3 — new) ────────────────────────── */}
        {/* Top sellers vs slow movers + P&L breakdown */}
        <SundayStatement orders={orders} currency={currency} />

        {/* ── Inventory table red zone items are shown first ───────────────────────────────────────────── */}
        <div className="bg-white border border-[#DDD6CE] rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#DDD6CE] flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              Inventory
              <span className="text-sm font-normal text-gray-400 ml-2">({products.length})</span>
            </h2>
            {/* Client-side search — filters the list without a page reload */}
            <SearchBar />
          </div>

    
          {/* Red zone section — shown at the top if any products are critical */}
          {redZoneProducts.length > 0 && (
            <div className="border-b-2 border-red-200 bg-red-50">
              <div className="px-6 py-2 flex items-center gap-2">
                <span className="text-red-600 text-xs font-semibold uppercase tracking-wide">
                  🚨 Red Zone — Needs immediate attention ({redZoneProducts.length})
                </span>
              </div>
              <ul>
                {redZoneProducts.map(p => (
                  <ProductCard key={p.id} product={p} currency={currency} isRedZone={true} />
                ))}
              </ul>
            </div>
          )}

          {/* Healthy products below the red zone */}
          {healthyProducts.length > 0 ? (
            <ul id="product-list" className="divide-y divide-gray-100">
              {healthyProducts.map(p => (
                <ProductCard key={p.id} product={p} currency={currency} />
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-gray-400 italic">No products found.</p>
          )}
        </div>

      </main>
    </div>
  );
}
      
