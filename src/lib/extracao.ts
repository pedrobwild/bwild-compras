import { supabase } from "@/integrations/supabase/client";
import type { PaginaTexto } from "@/lib/pdfText";

export type Confianca = "alta" | "media" | "baixa";

export interface ObraExtraida {
  cliente: string | null;
  empreendimento: string | null;
  unidade: string | null;
  endereco: string | null;
  area_m2: number | null;
  prazo_obra: string | null;
  data_projeto: string | null;
  revisao: string | null;
  arquiteto: string | null;
}

export interface ItemExtraido {
  descricao: string;
  categoria: string | null;
  quantidade: number | null;
  unidade: string | null;
  ambiente: string | null;
  especificacao: string | null;
  referencia_projeto: string | null;
  link_referencia: string | null;
  observacao: string | null;
  confianca: Confianca;
}

export interface ResultadoExtracao {
  extracao_id: string;
  modelo: string;
  paginas: number;
  resultado: {
    obra: ObraExtraida;
    itens: ItemExtraido[];
    nao_comprar: { descricao: string; motivo: string | null; referencia_projeto: string | null }[];
    avisos: string[];
  };
}

export async function extrairProjeto(nome_arquivo: string, paginas: PaginaTexto[]): Promise<ResultadoExtracao> {
  const { data, error } = await supabase.functions.invoke("extrair-projeto-executivo", { body: { nome_arquivo, paginas } });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (ctx?.json) {
      try {
        const j = await ctx.json();
        if (j?.error) msg = j.error;
      } catch {
        /* mantém mensagem padrão */
      }
    }
    throw new Error(msg);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  const r = data as ResultadoExtracao;
  r.resultado = {
    obra: r.resultado?.obra ?? ({} as ObraExtraida),
    itens: r.resultado?.itens ?? [],
    nao_comprar: r.resultado?.nao_comprar ?? [],
    avisos: r.resultado?.avisos ?? [],
  };
  return r;
}
