import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Valores públicos do Supabase usados fora do cliente gerado (upload com progresso e criação de usuários).
export const SUPABASE_URL = "https://wrpqayrqaiekdycknhsp.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6G5ofSFjjQ31J0KsOv9RJg_qegO2L5D";
export const BUCKET = "projetos-executivos";

/**
 * Cliente sem tipagem do esquema, para colunas e funções opcionais que o app detecta em tempo de
 * execução (useRecursos) e que podem ainda não existir no banco. Mesma sessão e mesmo RLS do cliente gerado.
 */
export const supabaseLivre = supabase as unknown as SupabaseClient;
