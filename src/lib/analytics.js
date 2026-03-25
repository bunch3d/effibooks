/**
 * EFFIBOOKS — Analytics & Sync Logging
 * src/lib/analytics.js
 *
 * PURPOSE: Every time we fetch data from Shopify, we log it to the sync_logs
 * table so we can see what happened and debug problems.
 *
 * COMMON ERROR: "Could not find column X in schema cache"
 * This means the column name in this file doesn't match what's in Supabase.
 * The insert object below MUST exactly match the sync_logs table columns.
 *
 * sync_logs columns this file uses:
 *   - shop_domain    (VARCHAR 255)
 *   - sync_type      (VARCHAR 50)
 *   - records_synced (INTEGER)
 *   - status         (VARCHAR 20) — only 'success' or 'error'
 *   - error_message  (TEXT)
 *   - synced_at      (TIMESTAMPTZ)
 */

// ─────────────────────────────────────────────────────────────────────────────
// logSync
//
// Call this after every Shopify data fetch to record what happened.
// It's "fire and forget" — we don't await it, so it never slows the page down.
//
// USAGE EXAMPLE:
//   logSync(supabase, 'my-store.myshopify.com', 17, null).catch(console.warn)
//                                                  ↑     ↑
//                                          products  no error
//
// HOW TO DEBUG: If you see "[Analytics] sync_logs insert failed" in the terminal,
// it means one of the field names below doesn't match a column in your Supabase
// sync_logs table. Check SCHEMA.sql Block 2 to see all valid column names.
// ─────────────────────────────────────────────────────────────────────────────
export async function logSync(supabase, shopDomain, recordCount, error = null) {
  try {
    // Build the record to insert — every key here MUST exist as a column in sync_logs
    const record = {
      shop_domain:     shopDomain,              // Which store triggered this sync
      sync_type:       'products',              // What we synced (hardcoded for now, Sprint 4 will vary this)
      records_synced:  recordCount,             // How many products/orders came back from Shopify
      status:          error ? 'error' : 'success', // 'success' if no error, 'error' if something went wrong
      error_message:   error || null,           // The actual error text, or null if everything was fine
      synced_at:       new Date().toISOString() // Current timestamp in ISO format e.g. "2026-03-23T10:00:00Z"
    };

    // Insert into Supabase — if this fails, the error goes to the catch block below
    const { error: insertError } = await supabase
      .from('sync_logs')  // Table name — must match exactly in Supabase
      .insert(record);

    // If Supabase returned an error (e.g. missing column), log it but don't crash the app
    if (insertError) {
      console.warn('[Analytics] sync_logs insert failed:', insertError.message);
      // HOW TO FIX: Check that all keys in `record` above match column names in your
      // Supabase sync_logs table. Run Block 2 of SCHEMA.sql if the table is missing columns.
    }

  } catch (err) {
    // This catches network errors or unexpected crashes — safe to ignore
    console.warn('[Analytics] logSync threw an unexpected error:', err.message);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// logBriefing
//
// Called after Gemini generates a briefing. Stores a preview so you can
// see the AI's output history in Supabase Table Editor.
//
// USAGE EXAMPLE:
//   logBriefing(supabase, 'my-store.myshopify.com', 'Your revenue today...').catch(console.warn)
// ─────────────────────────────────────────────────────────────────────────────
export async function logBriefing(supabase, shopDomain, briefingText) {
  try {
    const { error } = await supabase
      .from('briefing_logs')  // Must exist — created in SCHEMA.sql Block 4
      .insert({
        shop_domain:      shopDomain,
        briefing_preview: briefingText?.slice(0, 200), // Only store first 200 chars to keep DB small
        generated_at:     new Date().toISOString()
      });

    if (error) {
      console.warn('[Analytics] briefing_logs insert failed:', error.message);
      // HOW TO FIX: Run Block 4 of SCHEMA.sql to create the briefing_logs table
    }
  } catch (err) {
    console.warn('[Analytics] logBriefing threw:', err.message);
  }
}
