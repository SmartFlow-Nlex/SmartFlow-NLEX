import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/* The Supabase admin client, for one job only: creating a password-reset code and link without Supabase
   emailing them, so Navie can send its own email instead (19 Oct 2026; routes/auth.routes.ts). It holds the
   service-role key, which bypasses row security, so it never leaves this server and is used nowhere else. */
let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  admin ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
