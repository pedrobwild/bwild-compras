import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://wrpqayrqaiekdycknhsp.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6G5ofSFjjQ31J0KsOv9RJg_qegO2L5D";

const isBrowser = typeof window !== "undefined";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    storage: isBrowser ? window.localStorage : undefined,
  },
});

export const BUCKET = "projetos-executivos";
