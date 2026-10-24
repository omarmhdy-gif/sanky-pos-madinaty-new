import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_PLATFORM_SUPABASE_PUBLISHABLE_KEY;

/** Separate Supabase project for platform administration; it never uses the shop database client. */
export const platformSupabase = url && publishableKey
  ? createClient(url, publishableKey)
  : null;
