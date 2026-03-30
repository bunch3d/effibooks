'use client';
/**
 * EFFIBOOKS — LiveSyncBadge Component
 * src/components/LiveSyncBadge.jsx
 *
 * PURPOSE: Shows a small badge in the nav bar indicating when the last
 * real-time webhook sync happened. This replaces the static "● Live" text
 * with something meaningful — "Synced 2 min ago" or "Synced just now".
 *
 * HOW IT WORKS:
 *   - On mount, queries Supabase sync_logs for the most recent entry
 *   - Converts the timestamp to a human-readable "X ago" string
 *   - Refreshes every 60 seconds so the time stays accurate
 *
 * PROPS:
 *   supabase — the Supabase client (passed from page.js)
 *   domain   — the shop domain to filter sync logs by
 *
 * NOTE: This is a client component ('use client') because it uses
 * useState and useEffect for the live-updating time display.
 */
import { createClient } from '@/utils/supabase';


import { useState, useEffect } from 'react';
export default function LiveSyncBadge({ supabase, domain }) {

  // lastSynced: stores the ISO timestamp string of the last sync
  // null = we haven't loaded it yet
  const [lastSynced, setLastSynced] = useState(null);

  // timeAgo: human-readable string like "2 min ago" or "just now"
  const [timeAgo, setTimeAgo] = useState('Live');

  // fetchLastSync — queries sync_logs for the most recent entry for this shop
  const fetchLastSync = async () => {
    try {
      const supabase = createClient(); // Create client inside the function
      const { data, error } = await supabase
        .from('sync_logs')              // The sync_logs table from SCHEMA.sql Block 2
        .select('synced_at')            // Only need the timestamp
        .eq('shop_domain', domain)      // Only this shop's syncs
        .order('synced_at', { ascending: false }) // Most recent first
        .limit(1)                       // Only need the latest one
        .single();                      // Return object not array

      if (!error && data?.synced_at) {
        setLastSynced(data.synced_at); // Store the ISO timestamp
      }
    } catch (err) {
      // Non-fatal — badge just shows "Live" if this fails
      console.warn('[LiveSyncBadge] Could not fetch last sync time:', err.message);
    }
  };

  // formatTimeAgo — converts an ISO timestamp to "X ago" string
  // e.g. "2026-03-26T10:00:00Z" → "2 min ago"
  const formatTimeAgo = (isoString) => {
    if (!isoString) return 'Live';

    const diffMs      = Date.now() - new Date(isoString).getTime(); // Milliseconds since last sync
    const diffSeconds = Math.floor(diffMs / 1000);                   // Convert to seconds
    const diffMinutes = Math.floor(diffSeconds / 60);                // Convert to minutes
    const diffHours   = Math.floor(diffMinutes / 60);                // Convert to hours

    if (diffSeconds < 10)  return 'just now';                        // Less than 10 seconds
    if (diffSeconds < 60)  return `${diffSeconds}s ago`;             // Less than 1 minute
    if (diffMinutes < 60)  return `${diffMinutes} min ago`;          // Less than 1 hour
    if (diffHours < 24)    return `${diffHours}h ago`;               // Less than 1 day
    return 'over a day ago';                                          // More than 24 hours
  };

  // On component mount: fetch the last sync time
  useEffect(() => {
    fetchLastSync();

    // Refresh every 60 seconds so "2 min ago" becomes "3 min ago" etc.
    const interval = setInterval(fetchLastSync, 60000);

    // Cleanup: stop the interval when the component unmounts
    return () => clearInterval(interval);
  }, [domain]); // Re-run if the domain changes (won't happen in current app but good practice)

  // When lastSynced changes, recalculate the timeAgo string
  useEffect(() => {
    if (lastSynced) {
      setTimeAgo(formatTimeAgo(lastSynced));
    }
  }, [lastSynced]);

  return (
    <div className="flex items-center gap-1.5 ml-1">
      {/* Pulsing green dot — visual indicator that sync is active */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
      </span>
      {/* Human-readable time since last sync */}
      <span className="text-green-300 text-xs">{timeAgo}</span>
    </div>
  );
}
