import { createClient as supabaseCreateClient } from '@supabase/supabase-js';

// This function is what your page.js and route.js are looking for
export async function createClient() {
  return supabaseCreateClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for server-side auth
  );
}