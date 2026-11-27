import { createMiddleware } from "@tanstack/react-start";

// Adiciona o bearer só no cliente; o servidor sempre revalida via requireSupabaseAuth.
export const attachPagamentoAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});