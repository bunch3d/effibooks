'use client';
/**
 * EFFIBOOKS — ExportButton Component
 * src/components/ExportButton.jsx
 *
 * PURPOSE: Generates and downloads a CSV file of the last 30 days of orders.
 * The merchant can hand this CSV to their accountant instead of manually
 * exporting from Shopify, Meta Ads, and Stripe separately.
 *
 * HOW CSV EXPORT WORKS (no server needed):
 *   1. We already have the orders array in memory (fetched in page.js)
 *   2. When the button is clicked, we build a CSV string in JavaScript
 *   3. We create a temporary "blob" (in-memory file) with that string
 *   4. We create a fake <a> link pointing to the blob and click it
 *   5. The browser downloads the file — no server round-trip needed
 *
 * PROPS:
 *   orders   — array of Shopify order objects from getOrders()
 *   stats    — the stats object from calculateOrderStats()
 *   currency — currency code e.g. 'KES'
 *   shopName — store name for the filename
 */

export default function ExportButton({ orders, stats, currency = 'USD', shopName = 'store' }) {

  // handleExport — called when the button is clicked
  const handleExport = () => {

    // ── Build the CSV content ──────────────────────────────────────────
    // A CSV is just text where:
    //   - Each ROW is a line (separated by \n)
    //   - Each COLUMN in a row is separated by a comma
    //   - Values with commas inside them are wrapped in quotes

    // Helper: wrap a value in quotes if it contains commas or quotes
    // This prevents the CSV from breaking when product names have commas
    const escape = (val) => {
      const str = String(val ?? ''); // Convert to string, treat null/undefined as empty
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` // Wrap in quotes, escape any existing quotes
        : str;
    };

    // Row 1: Headers — these become the column names in Excel/Google Sheets
    const headers = [
      'Order Number',
      'Date',
      'Financial Status',
      'Gross Amount',
      'Discount',
      'Refund',
      'Net Amount',
      'Currency',
      'Products',
    ];

    // Build one row per order
    const rows = (orders || []).map(order => {
      // Calculate refund total for this order
      let refundAmount = 0;
      for (const refund of order.refunds || []) {
        for (const tx of refund.transactions || []) {
          if (tx.kind === 'refund') refundAmount += parseFloat(tx.amount || 0);
        }
      }

      const grossAmount    = parseFloat(order.total_price    || 0);
      const discountAmount = parseFloat(order.total_discounts || 0);
      const netAmount      = grossAmount - refundAmount; // What was actually kept

      // Format the order date as YYYY-MM-DD (international standard, works in all spreadsheets)
      const date = new Date(order.created_at).toISOString().split('T')[0];

      // Build a comma-separated list of products in this order
      // e.g. "The Collection Snowboard: Oxygen x1, Gift Card x2"
      const productList = (order.line_items || [])
        .map(item => `${item.title} x${item.quantity}`)
        .join(' | '); // Use | instead of comma to avoid breaking the CSV

      // Return an array of values — one per column header
      return [
        order.name,                // e.g. "#1042"
        date,                      // e.g. "2026-03-26"
        order.financial_status,    // e.g. "paid"
        grossAmount.toFixed(2),    // e.g. "2560.90"
        discountAmount.toFixed(2), // e.g. "0.00"
        refundAmount.toFixed(2),   // e.g. "0.00"
        netAmount.toFixed(2),      // e.g. "2560.90"
        order.currency || currency,// e.g. "KES"
        productList,               // e.g. "Snowboard x1 | Gift Card x2"
      ].map(escape); // Escape any values that contain commas
    });

    // Add a summary section at the bottom of the CSV
    // This gives the accountant totals without needing to use a SUM formula
    const summaryRows = [
      [], // Blank row for spacing
      ['SUMMARY'],
      ['Total Orders',     stats?.totalOrders      || 0],
      ['Gross Revenue',    (stats?.totalRevenue     || 0).toFixed(2)],
      ['Total Refunds',    (stats?.totalRefunds     || 0).toFixed(2)],
      ['Net Revenue',      ((stats?.totalRevenue || 0) - (stats?.totalRefunds || 0)).toFixed(2)],
      ['Est. Shopify Fees',((stats?.totalRevenue || 0) * 0.029).toFixed(2)],
      ['Period',           'Last 30 days'],
      ['Currency',         currency],
      ['Generated',        new Date().toLocaleDateString('en', { dateStyle: 'full' })],
    ];

    // Combine headers + data rows + summary into one CSV string
    const csvContent = [
      headers.join(','),            // Header row
      ...rows.map(r => r.join(',')), // Data rows
      ...summaryRows.map(r => r.map(escape).join(',')), // Summary rows
    ].join('\n'); // Join all rows with newlines


    // ── Trigger the browser download ──────────────────────────────────
    // This creates a temporary in-memory file and downloads it
    const blob = new Blob(
      [csvContent],
      { type: 'text/csv;charset=utf-8;' } // Tell browser this is a CSV file
    );

    // Create a URL pointing to the in-memory blob
    const url = URL.createObjectURL(blob);

    // Create a hidden <a> element and click it to trigger the download
    const link = document.createElement('a');
    link.href     = url;
    link.download = `effibooks-${shopName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`;
    // filename example: "effibooks-effibooks-test-shop-2026-03-26.csv"

    document.body.appendChild(link);  // Must be in DOM to click
    link.click();                      // Triggers the download dialog
    document.body.removeChild(link);   // Clean up the temporary element
    URL.revokeObjectURL(url);          // Free the memory used by the blob
  };


  return (
    <button
      onClick={handleExport}
      disabled={!orders || orders.length === 0} // Disable if no orders to export
      className="flex items-center gap-2 px-4 py-2 bg-white bg-opacity-10 hover:bg-opacity-20 border border-white border-opacity-20 rounded-lg text-white text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      title={orders?.length === 0 ? 'No orders to export' : `Export ${orders?.length} orders as CSV`}
    >
      {/* Download arrow icon (SVG, no external library needed) */}
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Export CSV
    </button>
  );
}
