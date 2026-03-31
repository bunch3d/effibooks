/**
 * EFFIBOOKS — Gemini Insight Engine
 * src/lib/gemini.js
 *
 * PURPOSE: Takes the product and order data, sends it to Google's Gemini AI,
 * and gets back a plain-English business briefing.
 *
 * COMMON ERRORS:
 *   404 "model not found"  → The model name in GEMINI_API_URL is wrong or deprecated
 *   429 "quota exceeded"   → You've hit the free daily limit — wait 24hrs or upgrade
 *   400 "API key invalid"  → Your GEMINI_API_KEY in .env.local is wrong
 *
 * HOW TO GET A FREE API KEY:
 *   1. Go to https://aistudio.google.com/app/apikey
 *   2. Click "Create API key"
 *   3. Copy it into .env.local as: GEMINI_API_KEY=AIza...
 *   4. Restart the dev server (Ctrl+C then npm run dev)
 */

// The full URL of the Gemini API endpoint we're calling
// v1beta = the API version (required for newer models)
// gemini-3-flash-preview = the specific model (fast + high free quota)
// generateContent = the action (generate text from a prompt)
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';


// ─────────────────────────────────────────────────────────────────────────────
// generateBriefing
//
// Main function — call this with products + orders to get an AI briefing.
//
// PARAMETERS:
//   products  — array of Shopify product objects (from products.json API)
//   orders    — array of Shopify order objects (from getOrders() in orders.js)
//   shopName  — store name string, shown in the prompt so AI knows the context
//   currency  — currency code e.g. 'KES', 'USD'
//   stats     — pre-calculated stats object from calculateOrderStats()
//   alerts   — NEW in Sprint 4: from calculateAlerts() in alerts.js
//
// RETURNS: { text: "Your briefing text here...", error: null }
//   If something goes wrong: { text: "user-friendly message", error: "technical detail" }
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBriefing(
  products,
  orders = [],
  { shopName, currency = 'USD', stats = {}, alerts = {} } = {}
) {

  // Get the API key from environment variables
  // This is set in your .env.local file as GEMINI_API_KEY=AIza...
  const apiKey = process.env.GEMINI_API_KEY;

  // If no API key is set, return a helpful message instead of crashing
  if (!apiKey) {
    console.warn('[Gemini] No GEMINI_API_KEY found in .env.local');
    return {
      text:  'AI briefing unavailable — add GEMINI_API_KEY to your .env.local to enable this.',
      error: 'missing_api_key',
    };
  }

  // Build a compact text summary of the business data to send to Gemini
  // We summarize instead of sending raw JSON to keep token usage (and cost) low
  const dataSummary = buildDataSummary(products, orders, stats, currency);

  // Write the prompt — this is the instruction we give to the AI
  const prompt = `
You are the automated CFO for a small e-commerce business called "${shopName}".
Write a plain-English daily briefing for the store owner.
The owner is NOT a data analyst — they just want to know if their business is healthy.

Here is today's business data:

${dataSummary}

Write exactly 4 sentences:
1. Revenue today and this week vs the 30-day average.
2. Which product is driving the most revenue right now.
3. The most urgent alert: out-of-stock items, slow movers, or refund spike.
4. One specific action the owner can take today.

End with exactly: "Business Health: [Good / Needs Attention / Critical]"

Rules:
- Plain sentences only. No bullet points, no markdown, no headers.
- Be specific — use the actual numbers from the data.
- Keep total response under 120 words.
- Friendly tone, like a trusted advisor.
`;

  try {
    // Call the Gemini API
    const response = await fetch(
      `${GEMINI_API_URL}?key=${apiKey}`, // API key goes in the URL as a query param
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          // The prompt wrapped in Gemini's required format
          contents: [{ parts: [{ text: prompt }] }],

          // Controls how the AI generates text
          generationConfig: {
            temperature:      0.4,  // Lower = more consistent, factual output (0=robotic, 1=creative)
            maxOutputTokens:  3000,  // Max length of response (~300 words). Increase if briefing cuts off.
            topP:             0.8,  // Focuses the AI on likely words — keeps it on-topic
          },
        }),
      }
    );

    // If Gemini returned a non-200 HTTP status, read the error and throw
    if (!response.ok) {
      const errorText = await response.text(); // Read the error response body
      throw new Error(`Gemini API ${response.status}: ${errorText}`);
      // Common status codes:
      //   400 = bad request (wrong model name or malformed prompt)
      //   401/403 = invalid API key
      //   404 = model not found (model name is wrong or deprecated)
      //   429 = quota exceeded (hit daily free limit)
    }

    // Parse the JSON response from Gemini
    const data = await response.json();

    // Navigate the nested Gemini response structure to get the actual text
    // Structure: data.candidates[0].content.parts[0].text
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    // If text is empty (shouldn't happen but safety check), throw an error
    if (!text) {
      throw new Error('Gemini returned a response but with no text content');
    }

    // Return the briefing text
    return {
      text:  text.trim(), // Remove any leading/trailing whitespace
      error: null,        // No error
    };

  } catch (err) {
    // Log the full technical error to the terminal for debugging
    console.error('[Gemini] Briefing generation failed:', err.message);

    // Return a user-friendly message based on the error type
    // We don't want to show the raw technical error to users
    return {
      text: err.message?.includes('429')
        ? 'Your daily AI briefing is being prepared. Check back in a few hours.' // Quota exceeded
        : err.message?.includes('404')
        ? 'AI briefing unavailable — model not found. Check GEMINI_API_URL in gemini.js.' // Wrong model
        : err.message?.includes('401') || err.message?.includes('400')
        ? 'AI briefing unavailable — check your GEMINI_API_KEY in .env.local.' // Bad key
        : `Unable to generate briefing: ${err.message}`, // Any other error
      error: err.message, // Keep the technical error for terminal logging
    };
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// buildDataSummary (private helper function)
//
// Converts the raw products and orders arrays into a compact text summary
// that we send to Gemini. This keeps the prompt short and token-efficient.
//
// We NEVER send the full JSON arrays to Gemini — they're too large and
// would cost more tokens. We extract just the key business signals.
// ─────────────────────────────────────────────────────────────────────────────
function buildDataSummary(products, orders, stats, alerts, currency) {

  // Currency formatter — e.g. fmt(1234.5) → "KES 1,234.50"
  const fmt = (n) =>
    `${currency} ${Number(n || 0).toLocaleString('en', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;

  // ── Revenue section ──────────────────────────────────────────────────
  const revenueLines = [
    '── REVENUE ──',
    `Today:       ${fmt(stats.todayRevenue)} (${stats.todayOrders || 0} orders)`,
    `This week:   ${fmt(stats.weekRevenue)}`,
    `Last 30 days:${fmt(stats.totalRevenue)} (${stats.totalOrders || 0} orders total)`,
    `Avg order:   ${fmt(stats.averageOrderValue)}`,
    `Refunds:     ${fmt(stats.totalRefunds)}`,
  ];

  // ── Top sellers section ──────────────────────────────────────────────
  const topSellerLines = [
    '',
    '── TOP SELLERS (30 days) ──',
    ...(stats.topProducts?.length > 0
      ? stats.topProducts.map((p, i) =>
          `${i + 1}. ${p.title} — ${p.quantity} sold, ${fmt(p.revenue)}`
        )
      : ['No sales yet']
    ),
  ];

  // ── Stock alerts section — NEW in Sprint 4 ───────────────────────────
  // We now include specific product names so Gemini can reference them
  const alertLines = [
    '',
    '── STOCK ALERTS ──',
  ];

  if (alerts.outOfStock?.length > 0) {
    const names = alerts.outOfStock.map(p => p.title).join(', ');
    alertLines.push(`OUT OF STOCK (${alerts.outOfStock.length}): ${names}`);
  } else {
    alertLines.push('Out of stock: none');
  }

  if (alerts.criticalStock?.length > 0) {
    const items = alerts.criticalStock
      .map(p => `${p.title} (${p.totalQty} left)`)
      .join(', ');
    alertLines.push(`CRITICAL ≤3 units (${alerts.criticalStock.length}): ${items}`);
  }

  if (alerts.lowStock?.length > 0) {
    const items = alerts.lowStock
      .map(p => `${p.title} (${p.totalQty} left)`)
      .join(', ');
    alertLines.push(`LOW 4-10 units (${alerts.lowStock.length}): ${items}`);
  }

  // ── Inventory summary ────────────────────────────────────────────────
  const inventoryLines = [
    '',
    '── INVENTORY ──',
    `Total products: ${products.length}`,
  ];

  // Combine all sections into one string
  return [
    ...revenueLines,
    ...topSellerLines,
    ...alertLines,
    ...inventoryLines,
  ].join('\n');
}
