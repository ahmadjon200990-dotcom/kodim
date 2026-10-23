import { createClient } from "@supabase/supabase-js";
import { SUPABASE_DEFAULTS, type Database } from "@exam-ide/shared";

// Panel Supabase klienti: sessiya localStorage'da (supabase-js standarti), Google OAuth PKCE bilan qaytadi.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || SUPABASE_DEFAULTS.url;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || SUPABASE_DEFAULTS.publishableKey;

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});
