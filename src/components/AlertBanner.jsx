'use client';
/**
 * EFFIBOOKS — AlertBanner Component
 * src/components/AlertBanner.jsx
 *
 * PURPOSE: A dismissible red banner at the top of the dashboard that
 * tells the merchant exactly which products need urgent attention.
 *
 * PROPS:
 *   alerts — the object returned by calculateAlerts() in alerts.js
 *            { outOfStock: [], criticalStock: [], lowStock: [], redZoneCount: number }
 *
 * BEHAVIOUR:
 *   - Shows a count badge for each alert level
 *   - Lists product names inline so the merchant knows exactly what's affected
 *   - Has a dismiss button (X) that hides the banner for the current session
 *   - Only renders if redZoneCount > 0 (page.js checks this before rendering)
 */

import { useState } from 'react';

export default function AlertBanner({ alerts }) {

  // dismissed state — when true, the banner hides itself
  // useState(false) = not dismissed initially
  const [dismissed, setDismissed] = useState(false);

  // If the user clicked X, render nothing
  if (dismissed) return null;

  return (
    <div className="mb-6 rounded-xl overflow-hidden border border-red-200" style={{ background: '#FFF5F5' }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#FEE2E2', borderBottom: '1px solid #FECACA' }}>
        <div className="flex items-center gap-2">
          {/* Pulsing red dot */}
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#EF4444' }}></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: '#EF4444' }}></span>
          </span>
          <span className="text-sm font-semibold" style={{ color: '#991B1B' }}>
            {alerts.redZoneCount} product{alerts.redZoneCount !== 1 ? 's' : ''} need immediate attention
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-lg leading-none ml-4 flex-shrink-0"
          style={{ color: '#F87171' }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* ── Alert rows — each on its own line for readability ─────── */}
      <div className="px-5 py-4 flex flex-col gap-4">

        {/* Out of stock */}
        {alerts.outOfStock.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ background: '#DC2626', color: '#FFFFFF' }}
              >
                {alerts.outOfStock.length} OUT OF STOCK
              </span>
              <span className="text-xs" style={{ color: '#7F1D1D' }}>
                Customers cannot purchase these
              </span>
            </div>
            {/* Product names on their own line, clearly visible */}
            <div className="flex flex-wrap gap-2 ml-1">
              {alerts.outOfStock.map(p => (
                <span
                  key={p.id}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}
                >
                  {p.title}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Critical stock (1–3 units) */}
        {alerts.criticalStock.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ background: '#EA580C', color: '#FFFFFF' }}
              >
                {alerts.criticalStock.length} CRITICAL
              </span>
              <span className="text-xs" style={{ color: '#7C2D12' }}>
                Reorder today before you run out
              </span>
            </div>
            <div className="flex flex-wrap gap-2 ml-1">
              {alerts.criticalStock.map(p => (
                <span
                  key={p.id}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: '#FFF7ED', color: '#9A3412', border: '1px solid #FED7AA' }}
                >
                  {p.title}
                  <span className="font-normal ml-1" style={{ color: '#EA580C' }}>
                    ({p.totalQty} left)
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Low stock (4–10 units) */}
        {alerts.lowStock.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                style={{ background: '#D97706', color: '#FFFFFF' }}
              >
                {alerts.lowStock.length} LOW STOCK
              </span>
              <span className="text-xs" style={{ color: '#78350F' }}>
                Monitor this week
              </span>
            </div>
            <div className="flex flex-wrap gap-2 ml-1">
              {alerts.lowStock.map(p => (
                <span
                  key={p.id}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}
                >
                  {p.title}
                  <span className="font-normal ml-1" style={{ color: '#D97706' }}>
                    ({p.totalQty} left)
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}