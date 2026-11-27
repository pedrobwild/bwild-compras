import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dadosPagamentoSchema, type DadosPagamento, type BoletoPagamento, type CotacaoPagamento, validarBoleto } from "@/lib/pagamentos";

export const consultarPagamentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(d))
  .handler(async ({ data, context }): Promise<DadosPagamento[]> => {
    if (!data.ids.length) return [];
    const db = context.supabase;
    const [sol, cot] = await Promise.all([
      db.from("solicitacoes").select("id,status,pagamento_link,pagamento_instrucoes").in("id", data.ids).order("id"),
      db.from("cotacoes").select("solicitacao_id,fornecedor,valor_total,condicao_pagamento").in("solicitacao_id", data.ids).eq("escolhida", true).order("id"),
    ]);
    if (sol.error || cot.error) throw new Error("Não foi possível consultar os pagamentos. Tente novamente.");
    const anexos: (BoletoPagamento & { solicitacao_id: string })[] = [];
    for (let from = 0; ; from += 1000) {
      const res = await db.from("solicitacao_anexos").select("id,solicitacao_id,nome_arquivo,storage_path,tamanho_bytes,tipo_mime")
        .in("solicitacao_id", data.ids).eq("finalidade", "pagamento").order("id").range(from, from + 999);
      if (res.error) throw new Error("Não foi possível consultar os boletos. Tente novamente.");
      anexos.push(...(res.data ?? []));
      if (!res.data || res.data.length < 1000) break;
    }
    return (sol.data ?? []).map((s) => ({ ...s,
      cotacao: (cot.data ?? []).find((c) => c.solicitacao_id === s.id) as CotacaoPagamento | undefined ?? null,
      boletos: anexos.filter((a) => a.solicitacao_id === s.id),
    }));
  });

export const gravarPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dadosPagamentoSchema.extend({ id: z.string().uuid(), solicitar: z.boolean(), remover: z.array(z.string().uuid()).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("salvar_pagamento", {
      p_solicitacao_id: data.id, p_link: data.link, p_instrucoes: data.instrucoes,
      p_solicitar: data.solicitar, p_remover_anexos: data.remover,
    });
    return error ? { ok: false, erro: error.message } : { ok: true, erro: null };
  });

export const registrarBoleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), path: z.string().max(1500), name: z.string().max(500), size: z.number(), type: z.string() }).parse(d))
  .handler(async ({ data, context }): Promise<BoletoPagamento> => {
    if (!validarBoleto(data) || !data.path.startsWith(`${data.id}/pagamentos/`)) throw new Error("Anexe um boleto PDF, PNG, JPG ou JPEG de até 50 MB.");
    const { data: anexo, error } = await context.supabase.from("solicitacao_anexos").insert({
      solicitacao_id: data.id, storage_path: data.path, nome_arquivo: data.name, tamanho_bytes: data.size,
      tipo_mime: data.type, finalidade: "pagamento", enviado_por: context.userId,
    }).select("id,nome_arquivo,storage_path,tamanho_bytes,tipo_mime").single();
    if (error || !anexo) throw new Error(error?.message ?? "Não foi possível registrar o boleto.");
    return anexo;
  });