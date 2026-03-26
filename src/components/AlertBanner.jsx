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
    <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl overflow-hidden">

      {/* ── Header bar ──────────────────────────────────────────────── */}
      <div className="px-5 py-3 bg-red-100 border-b border-red-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Pulsing red dot — signals urgency */}
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
          <span className="text-red-800 text-sm font-semibold">
            {alerts.redZoneCount} product{alerts.redZoneCount !== 1 ? 's' : ''} need immediate attention
          </span>
        </div>
        {/* Dismiss button — hides the banner without refreshing the page */}
        <button
          onClick={() => setDismissed(true)}
          className="text-red-400 hover:text-red-600 text-lg leading-none"
          aria-label="Dismiss alert"
        >
          ✕
        </button>
      </div>

      {/* ── Alert sections ────────────────────────────────────────── */}
      <div className="px-5 py-4 flex flex-col gap-3">

        {/* Out of stock section */}
        {alerts.outOfStock.length > 0 && (
          <div className="flex items-start gap-3">
            {/* Badge showing count */}
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5">
              {alerts.outOfStock.length} OUT OF STOCK
            </span>
            {/* Product names */}
            <div className="text-sm text-red-800">
              {alerts.outOfStock.map((p, i) => (
                <span key={p.id}>
                  <strong>{p.title}</strong>
                  {/* Add comma between items but not after the last one */}
                  {i < alerts.outOfStock.length - 1 ? ', ' : ''}
                </span>
              ))}
              <span className="text-red-500 ml-1">— customers cannot purchase these</span>
            </div>
          </div>
        )}

        {/* Critical stock section (1-3 units) */}
        {alerts.criticalStock.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5">
              {alerts.criticalStock.length} CRITICAL
            </span>
            <div className="text-sm text-red-800">
              {alerts.criticalStock.map((p, i) => (
                <span key={p.id}>
                  <strong>{p.title}</strong>
                  {/* Show exact unit count so merchant knows how urgent it is */}
                  <span className="text-orange-600 ml-1">({p.totalQty} left)</span>
                  {i < alerts.criticalStock.length - 1 ? ', ' : ''}
                </span>
              ))}
              <span className="text-red-500 ml-1">— reorder today</span>
            </div>
          </div>
        )}

        {/* Low stock section (4-10 units) — shown if it exists */}
        {alerts.lowStock.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5">
              {alerts.lowStock.length} LOW STOCK
            </span>
            <div className="text-sm text-amber-800">
              {alerts.lowStock.map((p, i) => (
                <span key={p.id}>
                  <strong>{p.title}</strong>
                  <span className="text-amber-600 ml-1">({p.totalQty} left)</span>
                  {i < alerts.lowStock.length - 1 ? ', ' : ''}
                </span>
              ))}
              <span className="text-amber-600 ml-1">— monitor this week</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
