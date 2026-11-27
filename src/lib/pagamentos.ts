import { z } from "zod";
import { ordenarRegistros } from "@/lib/ordenacao";

export function linkPagamentoValido(valor: string): boolean {
  try {
    const url = new URL(valor);
    return ["http:", "https:"].includes(url.protocol) && valor.length <= 1000 && /^https?:\/\/\S+$/i.test(valor);
  } catch { return false; }
}

export const dadosPagamentoSchema = z.object({
  link: z.string().trim().max(1000).refine((v) => !v || linkPagamentoValido(v), "Informe um link completo com http:// ou https://, de até 1.000 caracteres."),
  instrucoes: z.string().trim().max(500, "As instruções devem ter até 500 caracteres."),
});

export function temMeioPagamento(link: string | null | undefined, instrucoes: string | null | undefined, boletosRegistrados: number): boolean {
  return Boolean((link?.trim() && linkPagamentoValido(link.trim())) || instrucoes?.trim() || boletosRegistrados > 0);
}

export function ordenarFilaPagamentos<T extends { id: string; status: string; data_necessaria: string | null }>(rows: T[]): T[] {
  return ordenarRegistros(rows.filter((r) => r.status === "solicitacao_pagamento"), "necessario_proximo", {
    nome: (r) => r.id, data: () => null, necessario: (r) => r.data_necessaria, id: (r) => r.id,
  });
}

export interface BoletoPagamento {
  id: string; nome_arquivo: string; storage_path: string; tamanho_bytes: number | null; tipo_mime: string | null;
}
export interface CotacaoPagamento { fornecedor: string; valor_total: number | null; condicao_pagamento: string | null }
export interface DadosPagamento {
  id: string; status: string; pagamento_link: string | null; pagamento_instrucoes: string | null;
  boletos: BoletoPagamento[]; cotacao: CotacaoPagamento | null;
}
export const MIME_BOLETOS = ["application/pdf", "image/png", "image/jpeg"];
export function validarBoleto(file: { name: string; size: number; type: string }): boolean {
  return /\.(pdf|png|jpe?g)$/i.test(file.name) && MIME_BOLETOS.includes(file.type) && file.size > 0 && file.size <= 50 * 1024 * 1024;
}