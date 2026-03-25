'use client';
/**
 * EFFIBOOKS — RevenueStrip Component
 * src/components/RevenueStrip.jsx
 *
 * PURPOSE: Shows the top-of-page revenue summary with 4 metric tiles
 * and a 7-day bar chart. This is the first thing the owner sees.
 *
 * PROPS:
 *   stats    — the stats object from calculateOrderStats() in orders.js
 *   currency — currency code e.g. 'KES', 'USD'
 *
 * If stats.totalOrders is 0 (no orders in 30 days), shows a placeholder message.
 */

export default function RevenueStrip({ stats, currency = 'USD' }) {

  // If no orders exist yet, show a friendly placeholder instead of zeros
  if (!stats || stats.totalOrders === 0) {
    return (
      <div className="mb-6 bg-white border border-[#DDD6CE] rounded-xl p-5 text-center text-gray-400 italic text-sm">
        No orders in the last 30 days. Revenue data will appear here once orders come in.
      </div>
    );
  }

  // Helper function to format numbers as currency
  // e.g. fmt(1234.5) → "KES 1,235" (no decimals for large numbers in the tiles)
  const fmt = (n) => new Intl.NumberFormat('en', {
    style:              'currency',
    currency,
    maximumFractionDigits: 0, // Round to whole number
  }).format(n || 0); // Default to 0 if n is null/undefined

  // The 4 metric tiles to show across the top
  const metrics = [
    {
      label:     'Today',
      value:     fmt(stats.todayRevenue),
      sub:       `${stats.todayOrders} orders`,  // Subtitle shows order count
      highlight: true,  // Today's tile gets a darker background to stand out
    },
    {
      label:     'This week',
      value:     fmt(stats.weekRevenue),
      sub:       'last 7 days',
      highlight: false,
    },
    {
      label:     'Last 30 days',
      value:     fmt(stats.totalRevenue),
      sub:       `${stats.totalOrders} orders`,
      highlight: false,
    },
    {
      label:     'Avg order',
      value:     fmt(stats.averageOrderValue),
      sub:       'per transaction',
      highlight: false,
    },
  ];

  // Find the highest day's revenue — used to scale the bar chart heights
  // Math.max with spread operator gets the biggest value from the array
  const maxRevenue = Math.max(
    ...(stats.revenueByDay?.map(d => d.revenue) || [0]),
    1 // Minimum of 1 to avoid dividing by zero when calculating bar heights
  );

  return (
    <div className="mb-6 bg-[#1B4332] rounded-xl overflow-hidden shadow-sm">

      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#C9952A] text-sm">$</span>
          <span className="text-[#D8F3DC] text-xs font-semibold uppercase tracking-widest">
            Revenue Overview
          </span>
        </div>
        <span className="text-[#2D6A4F] text-xs">Last 30 days</span>
      </div>

      {/* ── 4 metric tiles ──────────────────────────────────────────────── */}
      {/* grid-cols-4 puts all 4 tiles in a row */}
      <div className="grid grid-cols-4 gap-0 border-b border-[#2D6A4F]">
        {metrics.map(({ label, value, sub, highlight }) => (
          <div
            key={label}
            // Highlighted tile (Today) gets slightly darker background
            className={`px-6 py-4 border-r border-[#2D6A4F] last:border-r-0 ${highlight ? 'bg-[#2D6A4F]' : ''}`}
          >
            <div className="text-xs text-[#86efac] mb-1 uppercase tracking-wide">{label}</div>
            <div className="text-xl font-bold text-white mb-0.5">{value}</div>
            <div className="text-xs text-[#6EE7B7]">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── 7-day sparkline bar chart ─────────────────────────────────── */}
      {stats.revenueByDay?.length > 0 && (
        <div className="px-6 py-4">
          <div className="text-xs text-[#2D6A4F] mb-3 uppercase tracking-wide">7-day trend</div>

          {/* Bar chart container — h-12 = 48px tall */}
          <div className="flex items-end gap-1.5 h-12">
            {stats.revenueByDay.map((day) => {
              // Calculate bar height as percentage of the tallest bar
              const heightPct = (day.revenue / maxRevenue) * 100;

              // Check if this bar is for today
              const isToday = day.date === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center gap-1 flex-1"
                  title={`${day.label}: ${fmt(day.revenue)}`} // Tooltip on hover
                >
                  {/* The bar itself */}
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height:     `${Math.max(heightPct, 4)}%`, // Min 4% so bar is always visible
                      minHeight:  3,                             // Always at least 3px tall
                      // Today = amber/gold, has revenue = green, no revenue = dark green
                      background: isToday
                        ? '#C9952A'
                        : day.revenue > 0
                          ? '#86efac'
                          : '#2D6A4F',
                    }}
                  />
                  {/* Day label below bar e.g. "Mon" */}
                  <span className="text-[9px] text-[#2D6A4F]">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Refund warning (only shows if refunds exist) ─────────────────── */}
      {stats.totalRefunds > 0 && (
        <div className="px-6 pb-4">
          <span className="text-xs text-amber-300">
            ⚠️ {new Intl.NumberFormat('en', { style: 'currency', currency }).format(stats.totalRefunds)} refunded in the last 30 days
          </span>
        </div>
      )}

    </div>
  );
}
