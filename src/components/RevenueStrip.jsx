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

  if (!stats || stats.totalOrders === 0) {
    return (
      <div style={{
        marginBottom: '24px',
        background: '#FFFFFF',
        border: '1px solid #DDD6CE',
        borderRadius: '12px',
        padding: '20px',
        textAlign: 'center',
        color: '#9CA3AF',
        fontStyle: 'italic',
        fontSize: '14px',
      }}>
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
    { label: 'Today',         value: fmt(stats.todayRevenue),      sub: `${stats.todayOrders} order${stats.todayOrders !== 1 ? 's' : ''}`, highlight: true  },
    { label: 'This week',     value: fmt(stats.weekRevenue),       sub: 'last 7 days',                                                      highlight: false },
    { label: 'Last 30 days',  value: fmt(stats.totalRevenue),      sub: `${stats.totalOrders} orders`,                                      highlight: false },
    { label: 'Avg order',     value: fmt(stats.averageOrderValue), sub: 'per transaction',                                                   highlight: false },
  ];

  const maxRevenue = Math.max(...(stats.revenueByDay?.map(d => d.revenue) || [0]), 1);

  return (
    <div style={{
      marginBottom: '24px',
      background: '#1B4332',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 24px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#C9952A', fontSize: '15px' }}>$</span>
          <span style={{
            color: '#D8F3DC',
            fontSize: '11px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            Revenue Overview
          </span>
        </div>
        <span style={{ color: '#4ADE80', fontSize: '11px' }}>Last 30 days</span>
      </div>

      {/* ── 4 metric tiles ──────────────────────────────────────────── */}
      {/* Using inline CSS grid — Tailwind grid classes were being purged */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        borderTop: '1px solid #2D6A4F',
        borderBottom: '1px solid #2D6A4F',
      }}>
        {metrics.map(({ label, value, sub, highlight }, i) => (
          <div
            key={label}
            style={{
              padding: '16px 20px',
              background: highlight ? '#2D6A4F' : 'transparent',
              borderRight: i < 3 ? '1px solid #2D6A4F' : 'none',
            }}
          >
            {/* Label — e.g. "TODAY" — was invisible before fix */}
            <div style={{
              color: '#86EFAC',       // Bright green — visible on dark background
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '6px',
            }}>
              {label}
            </div>
            {/* Main value — e.g. "KES 2,561" */}
            <div style={{
              color: '#FFFFFF',
              fontSize: '20px',
              fontWeight: '700',
              marginBottom: '4px',
              letterSpacing: '-0.02em',
            }}>
              {value}
            </div>
            {/* Subtitle — e.g. "1 order" */}
            <div style={{
              color: '#6EE7B7',   // Lighter green — still readable
              fontSize: '12px',
            }}>
              {sub}
            </div>
          </div>
        ))}
      </div>

      {/* ── 7-day bar chart ─────────────────────────────────────────── */}
      {stats.revenueByDay?.length > 0 && (
        <div style={{ padding: '16px 24px' }}>
          <div style={{
            color: '#4ADE80',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '10px',
          }}>
            7-day trend
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '6px',
            height: '48px',
          }}>
            {stats.revenueByDay.map((day) => {
              const heightPct = (day.revenue / maxRevenue) * 100;
              const isToday   = day.date === new Date().toISOString().split('T')[0];
              return (
                <div
                  key={day.date}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}
                  title={`${day.label}: ${fmt(day.revenue)}`}
                >
                  <div style={{
                    width:      '100%',
                    height:     `${Math.max(heightPct, 5)}%`,
                    minHeight:  '3px',
                    background: isToday ? '#C9952A' : day.revenue > 0 ? '#86EFAC' : '#2D6A4F',
                    borderRadius: '2px',
                  }} />
                  {/* Day label — e.g. "Mon" */}
                  <span style={{ fontSize: '10px', color: '#4ADE80' }}>{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Refund warning ──────────────────────────────────────────── */}
      {stats.totalRefunds > 0 && (
        <div style={{ padding: '0 24px 14px' }}>
          <span style={{ fontSize: '12px', color: '#FCD34D' }}>
            ⚠️ {new Intl.NumberFormat('en', { style: 'currency', currency }).format(stats.totalRefunds)} refunded in the last 30 days
          </span>
        </div>
      )}
    </div>
  );
}
