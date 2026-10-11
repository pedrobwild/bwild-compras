import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ItemSchema = z.object({
  descricao: z.string().max(500),
  quantidade: z.number().nullable().optional(),
  unidade: z.string().max(20).nullable().optional(),
  categoria: z.string().max(60).nullable().optional(),
  ambiente: z.string().max(60).nullable().optional(),
  especificacao: z.string().max(2000).nullable().optional(),
  link_referencia: z.string().max(500).nullable().optional(),
});

const InputSchema = z.object({
  titulo: z.string().max(300).optional().default(""),
  descricao: z.string().max(5000).optional().default(""),
  itens: z.array(ItemSchema).min(1).max(150),
});

export type RevisaoIA = {
  resumo: string;
  pronto_para_cotacao: boolean;
  gerais: string[];
  itens: { indice: number; descricao: string; gravidade: "alta" | "media" | "baixa"; faltantes: string[]; sugestao: string }[];
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "pronto_para_cotacao", "gerais", "itens"],
  properties: {
    resumo: { type: "string" },
    pronto_para_cotacao: { type: "boolean" },
    gerais: { type: "array", items: { type: "string" } },
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["indice", "descricao", "gravidade", "faltantes", "sugestao"],
        properties: {
          indice: { type: "integer" },
          descricao: { type: "string" },
          gravidade: { type: "string", enum: ["alta", "media", "baixa"] },
          faltantes: { type: "array", items: { type: "string" } },
          sugestao: { type: "string" },
        },
      },
    },
  },
};

const INSTRUCOES = `Você é um comprador sênior de obras de reforma de apartamentos (Bwild). Analise a solicitação de compra e aponte, ANTES da cotação, o que falta para um fornecedor conseguir cotar sem dúvidas: medidas/dimensões, cor/acabamento, marca/modelo ou referência, material, voltagem/potência, quantidade ou unidade incoerente, padrão (ex.: tomada 10A/20A), linha/coleção de revestimento, espessura, sentido de abertura, ambiente, etc.
Regras: escreva em português do Brasil, frases curtas e objetivas. Só liste itens que realmente tenham pendências (indice = posição do item começando em 1). Não invente dados nem preços. "gerais" = pendências da solicitação como um todo (endereço de entrega, prazo, observações). "pronto_para_cotacao" = true só se não houver pendência de gravidade alta.`;

export const revisarSolicitacaoIA = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; revisao: RevisaoIA } | { ok: false; erro: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, erro: "Chave da IA não configurada." };

    const texto = [
      `Título: ${data.titulo || "(vazio)"}`,
      `Descrição: ${data.descricao || "(vazia)"}`,
      "Itens:",
      ...data.itens.map((it, i) =>
        `${i + 1}. ${it.descricao} | qtd: ${it.quantidade ?? "não informada"} ${it.unidade ?? ""} | categoria: ${it.categoria ?? "-"} | ambiente: ${it.ambiente ?? "-"} | especificação: ${it.especificacao || "-"} | link: ${it.link_referencia || "-"}`,
      ),
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: INSTRUCOES,
        input: [{ role: "user", content: texto }],
        reasoning: { effort: "low" },
        store: false,
        stream: true,
        text: { format: { type: "json_schema", name: "revisao", strict: true, schema } },
      }),
    });

    if (!res.ok || !res.body) {
      let msg = "";
      try { const j = await res.json(); msg = j?.message || j?.error?.message || j?.error || ""; } catch { /* sem corpo */ }
      if (res.status === 429) return { ok: false, erro: "Muitas análises seguidas. Aguarde um pouco e tente de novo." };
      if (res.status === 402) return { ok: false, erro: msg || "Créditos de IA esgotados. Adicione créditos em Configurações → Planos." };
      return { ok: false, erro: msg || `Falha na análise (erro ${res.status}).` };
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let out = "";
    let erroStream = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
          else if (ev.type === "response.failed" || ev.type === "error")
            erroStream = ev.response?.error?.message || ev.message || "Falha na análise.";
        } catch { /* linha parcial */ }
      }
    }
    if (erroStream) return { ok: false, erro: erroStream };
    if (!out.trim()) return { ok: false, erro: "A IA não retornou resposta." };
    try {
      return { ok: true, revisao: JSON.parse(out) as RevisaoIA };
    } catch {
      return { ok: false, erro: "Resposta da IA em formato inesperado." };
    }
  });
