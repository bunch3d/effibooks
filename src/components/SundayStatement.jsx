'use client';
/**
 * EFFIBOOKS — SundayStatement Component
 * src/components/SundayStatement.jsx
 *
 * PURPOSE: The weekly "how did my business actually do?" breakdown.
 * Shows top sellers vs slow movers, and a P&L (profit & loss) estimate.
 *
 * Named after the "Sunday Night Founder" — the store owner who spends
 * Sunday evenings manually reconciling numbers. This replaces that.
 *
 * PROPS:
 *   orders   — array of Shopify order objects from getOrders()
 *   currency — currency code e.g. 'KES', 'USD'
 *
 * If orders is empty, returns null (renders nothing — no empty card).
 */

export default function SundayStatement({ orders, currency = 'USD' }) {

  // Don't render anything if there are no orders — keeps dashboard clean
  if (!orders || orders.length === 0) return null;

  // Helper to format numbers as currency with 2 decimal places
  // e.g. fmt(1234.5) → "KES 1,234.50"
  const fmt = (n) => new Intl.NumberFormat('en', {
    style:              'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n || 0);

  // ── Build product sales data from line items ───────────────────────────
  // We loop through every order and every line item to tally up product sales
  const productMap = {}; // key: product_id, value: { title, quantity, revenue }

  for (const order of orders) {
    // Skip voided orders — no money changed hands
    if (order.financial_status === 'voided') continue;

    for (const item of order.line_items || []) {
      // Use product_id as the key, fall back to title if no ID
      const key = item.product_id || item.title;
      if (!key) continue; // Skip items with no identifier

      // Create entry for new products we haven't seen yet
      if (!productMap[key]) {
        productMap[key] = {
          title:    item.title,  // Product name
          quantity: 0,            // Total units sold
          revenue:  0,            // Total revenue from this product
        };
      }

      // Add this line item to the product totals
      productMap[key].quantity += item.quantity || 0;
      productMap[key].revenue  += parseFloat(item.price || 0) * (item.quantity || 0);
    }
  }

  // Sort products by revenue to get top sellers first
  const sorted     = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
  const topSellers = sorted.slice(0, 5); // Top 5 by revenue

  // Slow movers: sold 2 or fewer units AND had at least some revenue
  const slowMovers = sorted
    .filter(p => p.quantity <= 2 && p.revenue > 0)
    .slice(0, 5);

  // ── P&L Calculation ───────────────────────────────────────────────────
  // This is the "what you actually kept" calculation

  // Gross revenue: sum all non-voided order totals
  const grossRevenue = orders
    .filter(o => o.financial_status !== 'voided')
    .reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);

  // Total refunds: loop through all refund transactions
  let totalRefunds = 0;
  for (const order of orders) {
    for (const refund of order.refunds || []) {
      for (const transaction of refund.transactions || []) {
        if (transaction.kind === 'refund') {
          totalRefunds += parseFloat(transaction.amount || 0);
        }
      }
    }
  }

  // Count valid orders for the fee calculation
  const validOrderCount = orders.filter(o => o.financial_status !== 'voided').length;

  // Estimate Shopify/Stripe fees: 2.9% of revenue + $0.30 per order
  // NOTE: This is an ESTIMATE. Actual fees vary by payment method and plan.
  // Phase 2 will connect to Stripe for exact numbers.
  const estimatedFees = (grossRevenue - totalRefunds) * 0.029 + validOrderCount * 0.30;

  // Net = what the owner actually kept
  const netRevenue = grossRevenue - totalRefunds - estimatedFees;

  // Format the date range label e.g. "Feb 23 – Mar 23, 2026"
  const weekLabel = (() => {
    const now     = new Date();
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);
    return `${monthAgo.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  })();

  return (
    <div className="mb-6 bg-white border border-[#DDD6CE] rounded-xl shadow-sm overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-[#DDD6CE] flex items-center justify-between bg-[#F7F3ED]">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Sunday Statement</h2>
          <p className="text-xs text-gray-400 mt-0.5">{weekLabel} · Auto-generated</p>
        </div>
        {/* Badge showing total valid orders */}
        <span className="bg-[#D8F3DC] text-[#1B4332] text-xs px-3 py-1 rounded-full font-semibold">
          ✓ {validOrderCount} orders
        </span>
      </div>

      {/* ── Two column layout: Top Sellers | Slow Movers ────────────────── */}
      <div className="grid grid-cols-2 divide-x divide-[#DDD6CE]">

        {/* Left column: Top Sellers */}
        <div className="p-5">
          <div className="text-xs text-[#1B4332] font-semibold uppercase tracking-wide mb-3">
            🏆 Top Sellers
          </div>
          {topSellers.length > 0 ? (
            <div className="space-y-3">
              {topSellers.map((p, i) => {
                // Calculate bar width as % of the top seller's revenue
                const widthPct = topSellers[0].revenue > 0
                  ? (p.revenue / topSellers[0].revenue) * 100
                  : 0;

                return (
                  <div key={p.title}>
                    {/* Product name + revenue */}
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-800 truncate max-w-[160px]">
                        <span className="text-gray-400 mr-1">#{i + 1}</span>
                        {p.title}
                      </span>
                      <div className="text-right flex-shrink-0 ml-2">
                        <span className="text-sm font-bold text-[#1B4332]">{fmt(p.revenue)}</span>
                        <span className="text-xs text-gray-400 ml-1">({p.quantity} sold)</span>
                      </div>
                    </div>
                    {/* Revenue bar — width proportional to top seller */}
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1B4332] rounded-full"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No sales data yet.</p>
          )}
        </div>

        {/* Right column: Slow Movers */}
        <div className="p-5">
          <div className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-3">
            🐌 Slow Movers
          </div>
          {slowMovers.length > 0 ? (
            <div className="space-y-2">
              {slowMovers.map((p) => (
                <div
                  key={p.title}
                  className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0"
                >
                  <span className="text-sm text-gray-700 truncate max-w-[160px]">{p.title}</span>
                  <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2">
                    {p.quantity} sold
                  </span>
                </div>
              ))}
            </div>
          ) : (
            // If no slow movers, show a positive message
            <p className="text-sm text-green-600 font-medium">All products moving well 🎉</p>
          )}
        </div>

      </div>

      {/* ── P&L Breakdown ─────────────────────────────────────────────── */}
      <div className="border-t border-[#DDD6CE]">

        {/* Line items: gross, refunds, fees */}
        <div className="divide-y divide-[#DDD6CE]">
          {[
            {
              label: 'Gross revenue',
              value: fmt(grossRevenue),
              muted: false,
              red:   false,
            },
            {
              // Show how many orders had refunds in the label
              label: `Refunds (${orders.filter(o => (o.refunds?.length || 0) > 0).length} orders)`,
              value: `−${fmt(totalRefunds)}`,
              muted: true,
              red:   totalRefunds > 0,  // Turn red if there are refunds
            },
            {
              label: 'Estimated Shopify fees (2.9% + $0.30/order)',
              value: `−${fmt(estimatedFees)}`,
              muted: true,
              red:   false,
            },
          ].map(({ label, value, muted, red }) => (
            <div key={label} className="flex justify-between items-center px-6 py-3">
              <span className={`text-sm ${muted ? 'text-gray-400' : 'text-gray-700 font-medium'}`}>
                {label}
              </span>
              <span className={`text-sm font-mono font-semibold ${
                red ? 'text-red-500' : muted ? 'text-gray-400' : 'text-gray-800'
              }`}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Net total — the most important number */}
        <div className="flex justify-between items-center px-6 py-4 bg-[#1B4332]">
          <span className="text-sm font-bold text-[#D8F3DC]">Estimated Cash-in-Hand</span>
          <span className="font-mono text-xl font-bold text-[#C9952A]">{fmt(netRevenue)}</span>
        </div>

      </div>
    </div>
  );
}
