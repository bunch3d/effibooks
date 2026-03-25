import { createClient } from '@/utils/supabase';
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  // 1. Extract params sent back by Shopify
  const shop = searchParams.get("shop");
  const hmac = searchParams.get("hmac");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // 2. Security Check: Verify the "state" matches our cookie
  const cookieStore = request.cookies;
  const storedNonce = cookieStore.get("shopify_oauth_state")?.value;

  if (!state || state !== storedNonce) {
    return NextResponse.json({ error: "Security state mismatch" }, { status: 403 });
  }

  // 3. Security Check: Verify HMAC (ensures the request actually came from Shopify)
  const map = new Map(searchParams);
  map.delete("hmac");
  const message = Array.from(map.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("&");

  const generatedHmac = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  if (generatedHmac !== hmac) {
    return NextResponse.json({ error: "HMAC validation failed" }, { status: 401 });
  }

  // 4. Exchange the temporary 'code' for a permanent 'access_token'
  try {
    const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    const { access_token, scope } = await accessTokenResponse.json();

    console.log(`Success! Access Token for ${shop}:`, access_token);

    // TODO: Save access_token and shop to your Supabase database here!
// ... existing imports

// 4. Save the access_token and shop to your Supabase database
    const supabase = await createClient(); 

    const { error } = await supabase
      .from('shops')
      .upsert({
        shop_domain: shop,
        access_token: access_token, // Ensure this matches your variable name on Line 51
        installed_at: new Date().toISOString()
      }, { onConflict: 'shop_domain' });

    if (error) {
      console.error("Error saving to Supabase:", error.message);
      // We still redirect to success for now, but in production, you'd handle this error
    }

    // 5. Success! Redirect to your onboarding page
    return NextResponse.redirect(new URL("/onboarding/success", request.url));
  } catch (error) {
    console.error("Token exchange failed:", error);
    return NextResponse.json({ error: "Failed to exchange token" }, { status: 500 });
  }
  
}
