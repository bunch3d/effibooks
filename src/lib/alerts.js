/**
 * EFFIBOOKS — Stock Alerts Library
 * src/lib/alerts.js
 *
 * PURPOSE: Scans all products and classifies them by stock urgency.
 * Powers the AlertBanner, the red zone section in the inventory list,
 * and gives Gemini specific products to mention in the briefing.
 *
 * THREE ALERT LEVELS:
 *   outOfStock    — 0 units across all variants. Selling is impossible.
 *   criticalStock — 1-3 units left. Will sell out in days.
 *   lowStock      — 4-10 units left. Worth watching.
 *
 * These thresholds (3, 10) are chosen for small DTC stores.
 * A store doing 50+ orders/day would need higher thresholds.
 * We can make them configurable in Sprint 5 via store settings.
 */


// ─────────────────────────────────────────────────────────────────────────────
// calculateAlerts
//
// Takes the products array from the Shopify API and returns a structured
// alert object that every Sprint 4 component uses.
//
// PARAMETERS:
//   products — array of Shopify product objects (from /products.json API)
//
// RETURNS:
//   {
//     outOfStock:    [{ id, title, totalQty, variants }],  // 0 units
//     criticalStock: [{ id, title, totalQty, variants }],  // 1-3 units
//     lowStock:      [{ id, title, totalQty, variants }],  // 4-10 units
//     redZoneCount:  number,  // outOfStock + criticalStock count combined
//     hasAlerts:     boolean  // true if ANY alert exists
//   }
// ─────────────────────────────────────────────────────────────────────────────
export function calculateAlerts(products) {

  // Safety check: if products is empty or undefined, return empty alerts
  if (!products || products.length === 0) {
    return {
      outOfStock:    [],
      criticalStock: [],
      lowStock:      [],
      redZoneCount:  0,
      hasAlerts:     false,
    };
  }

  const outOfStock    = []; // 0 units — can't sell at all
  const criticalStock = []; // 1-3 units — will sell out very soon
  const lowStock      = []; // 4-10 units — needs restocking soon

  for (const product of products) {
    // Calculate total units across ALL variants of this product
    // e.g. if a t-shirt has sizes S/M/L and each has 2 units = 6 total
    const totalQty = product.variants?.reduce(
      (sum, variant) => sum + (parseInt(variant.inventory_quantity) || 0),
      0
    ) || 0;

    // Build a simplified product object with just what we need
    const alertItem = {
      id:       product.id,
      title:    product.title,
      totalQty, // Total units across all variants
      // Which specific variants are low — useful for showing "Size M: 1 left"
      variants: product.variants?.map(v => ({
        id:       v.id,
        title:    v.title,      // e.g. "Large / Blue"
        quantity: v.inventory_quantity || 0,
      })) || [],
    };

    // Classify into the right bucket based on total quantity
    if (totalQty <= 0) {
      outOfStock.push(alertItem);      // 0 units = out of stock
    } else if (totalQty <= 3) {
      criticalStock.push(alertItem);   // 1-3 units = critical
    } else if (totalQty <= 10) {
      lowStock.push(alertItem);        // 4-10 units = low
    }
    // More than 10 units = healthy, don't include in alerts
  }

  // Sort each array by quantity ascending (most urgent first)
  // So the product with 0 stock appears before the one with 1 unit
  outOfStock.sort((a, b)    => a.totalQty - b.totalQty);
  criticalStock.sort((a, b) => a.totalQty - b.totalQty);
  lowStock.sort((a, b)      => a.totalQty - b.totalQty);

  // Red zone = out of stock + critical stock combined
  // This is the number shown in the stat card and alert banner
  const redZoneCount = outOfStock.length + criticalStock.length;

  return {
    outOfStock,
    criticalStock,
    lowStock,
    redZoneCount,
    hasAlerts: redZoneCount > 0 || lowStock.length > 0,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// getAlertSummaryText
//
// Returns a plain text summary of alerts for use in the Gemini prompt.
// e.g. "3 out of stock: Gift Card, Out of Stock Snowboard, ..."
//      "2 critical (≤3 units): Selling Plans Ski Wax (2 left), ..."
//
// PARAMETERS:
//   alerts — the object returned by calculateAlerts()
//
// RETURNS: multi-line string for the Gemini prompt
// ─────────────────────────────────────────────────────────────────────────────
export function getAlertSummaryText(alerts) {
  if (!alerts || !alerts.hasAlerts) return 'No stock alerts.';

  const lines = [];

  if (alerts.outOfStock.length > 0) {
    const names = alerts.outOfStock.slice(0, 3).map(p => p.title).join(', ');
    lines.push(`Out of stock (${alerts.outOfStock.length}): ${names}`);
  }

  if (alerts.criticalStock.length > 0) {
    const items = alerts.criticalStock.slice(0, 3)
      .map(p => `${p.title} (${p.totalQty} left)`)
      .join(', ');
    lines.push(`Critical stock ≤3 units (${alerts.criticalStock.length}): ${items}`);
  }

  if (alerts.lowStock.length > 0) {
    const items = alerts.lowStock.slice(0, 3)
      .map(p => `${p.title} (${p.totalQty} left)`)
      .join(', ');
    lines.push(`Low stock 4-10 units (${alerts.lowStock.length}): ${items}`);
  }

  return lines.join('\n');
}
