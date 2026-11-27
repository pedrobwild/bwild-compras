import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { salvarPagamentosSchema, type DadosPagamento } from "@/lib/pagamentos";

export const consultarPagamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(d))
  .handler(async ({ data, context }): Promise<DadosPagamento[]> => {
    if (!data.ids.length) return [];
    const db = context.supabase;
    const sol = await db.from("solicitacoes").select("id,status,updated_at").in("id", data.ids).order("id").limit(100);
    if (sol.error) throw new Error("Não foi possível consultar os pagamentos. Tente novamente.");
    const pagamentos: import("@/integrations/supabase/types").Database["public"]["Tables"]["solicitacao_pagamentos"]["Row"][] = [];
    const itens: (import("@/lib/pagamentos").ItemPagamento & { solicitacao_id: string })[] = [];
    const boletos: (import("@/lib/pagamentos").BoletoPagamento & { pagamento_id: string | null; solicitacao_id: string })[] = [];
    for (let from = 0; ; from += 1000) {
      const res = await db.from("solicitacao_pagamentos").select("*").in("solicitacao_id", data.ids).order("created_at").order("id").range(from, from + 999);
      if (res.error) throw new Error("Não foi possível consultar os pagamentos.");
      pagamentos.push(...(res.data ?? [])); if ((res.data?.length ?? 0) < 1000) break;
    }
    for (let from = 0; ; from += 1000) {
      const res = await db.from("solicitacao_itens").select("id,solicitacao_id,descricao,quantidade,unidade,pagamento_id").in("solicitacao_id", data.ids).order("id").range(from, from + 999);
      if (res.error) throw new Error("Não foi possível consultar os itens.");
      itens.push(...(res.data ?? [])); if ((res.data?.length ?? 0) < 1000) break;
    }
    for (let from = 0; ; from += 1000) {
      const res = await db.from("solicitacao_anexos").select("id,solicitacao_id,pagamento_id,nome_arquivo,storage_path,tamanho_bytes,tipo_mime").in("solicitacao_id", data.ids).eq("finalidade", "pagamento").order("id").range(from, from + 999);
      if (res.error) throw new Error("Não foi possível consultar os boletos.");
      boletos.push(...(res.data ?? [])); if ((res.data?.length ?? 0) < 1000) break;
    }
    return (sol.data ?? []).map((s) => ({ ...s, itens: itens.filter((i) => i.solicitacao_id === s.id), pagamentos: pagamentos.filter((p) => p.solicitacao_id === s.id).map((p) => ({ ...p, boletos: boletos.filter((b) => b.pagamento_id === p.id), itens: itens.filter((i) => i.pagamento_id === p.id) })) }));
  });

export const gravarPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => salvarPagamentosSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("salvar_pagamentos", { p_solicitacao_id: data.id, p_pagamentos: data.pagamentos, p_solicitar: data.solicitar, p_versao: data.versao });
    return error ? { ok: false, erro: error.message } : { ok: true, erro: null };
  });
