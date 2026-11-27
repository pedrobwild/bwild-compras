import { z } from "zod";
import { ordenarRegistros } from "@/lib/ordenacao";
import { noPeriodo } from "@/lib/periodo";
import type { DateRange } from "react-day-picker";

export function linkPagamentoValido(valor: string): boolean {
  try { const url = new URL(valor); return ["http:", "https:"].includes(url.protocol) && valor.length <= 1000 && /^https?:\/\/\S+$/i.test(valor); } catch { return false; }
}
export const dadosPagamentoSchema = z.object({
  onde_comprado: z.string().trim().min(1, "Informe onde foi comprado.").max(200, "Onde foi comprado deve ter até 200 caracteres."),
  valor: z.number().finite().nonnegative("O valor não pode ser negativo.").nullable(),
  link: z.string().trim().max(1000).refine((v) => !v || linkPagamentoValido(v), "Informe um link HTTP/HTTPS de até 1.000 caracteres."),
  codigo: z.string().max(1000, "O código deve ter até 1.000 caracteres."),
  observacao: z.string().max(300, "A observação deve ter até 300 caracteres."),
});
export const boletoSchema = z.object({ id: z.string().uuid(), nome_arquivo: z.string().max(500), storage_path: z.string().max(1500), tamanho_bytes: z.number().positive().max(50 * 1024 * 1024).nullable(), tipo_mime: z.string().nullable() });
export const pagamentoSalvarSchema = dadosPagamentoSchema.extend({ id: z.string().uuid(), itens: z.array(z.string().uuid()).max(10000), boletos: z.array(boletoSchema).max(100) }).refine((p) => temMeioPagamento(p.link, p.codigo, p.boletos.length), "Cada pagamento precisa de link, código ou boleto.");
export const salvarPagamentosSchema = z.object({ id: z.string().uuid(), solicitar: z.boolean(), versao: z.string().datetime({ offset: true }), pagamentos: z.array(pagamentoSalvarSchema).min(1, "Informe pelo menos um pagamento válido.").max(100) }).superRefine((d, ctx) => {
  const itens = d.pagamentos.flatMap((p) => p.itens);
  if (new Set(itens).size !== itens.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Um item não pode estar em dois pagamentos." });
  if (new Set(d.pagamentos.map((p) => p.id)).size !== d.pagamentos.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pagamento repetido." });
});
export type PagamentoSalvar = z.infer<typeof pagamentoSalvarSchema>;
export function temMeioPagamento(link: string | null | undefined, codigo: string | null | undefined, boletos: number): boolean {
  return Boolean((link?.trim() && linkPagamentoValido(link.trim())) || codigo?.trim() || boletos > 0);
}
export function ordenarFilaPagamentos<T extends { id: string; status: string; data_necessaria: string | null }>(rows: T[], periodo?: DateRange): T[] {
  return ordenarRegistros(rows.filter((r) => r.status === "solicitacao_pagamento" && noPeriodo(r.data_necessaria, periodo)), "necessario_proximo", { nome: (r) => r.id, data: () => null, necessario: (r) => r.data_necessaria, id: (r) => r.id });
}
export interface BoletoPagamento { id: string; nome_arquivo: string; storage_path: string; tamanho_bytes: number | null; tipo_mime: string | null }
export interface ItemPagamento { id: string; descricao: string; quantidade: number; unidade: string; pagamento_id: string | null }
export interface Pagamento { id: string; onde_comprado: string; valor: number | null; link: string | null; codigo: string | null; observacao: string | null; boletos: BoletoPagamento[]; itens: ItemPagamento[] }
export interface DadosPagamento { id: string; status: string; updated_at: string; pagamentos: Pagamento[]; itens: ItemPagamento[] }
export function totalPagamentos(pagamentos: Pick<Pagamento, "valor">[]): number | null {
  const valores = pagamentos.flatMap((p) => p.valor == null ? [] : [p.valor]);
  return valores.length ? valores.reduce((s, n) => s + n, 0) : null;
}
export function valorPagamento(texto: string): number | null {
  const limpo = texto.trim();
  return !limpo ? null : Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
}
export function itensSemPagamento(itens: Pick<ItemPagamento, "id">[], pagamentos: { itens: string[] }[]): number {
  const cobertos = new Set(pagamentos.flatMap((p) => p.itens));
  return itens.filter((i) => !cobertos.has(i.id)).length;
}
export const MIME_BOLETOS = ["application/pdf", "image/png", "image/jpeg"];
export function validarBoleto(file: { name: string; size: number; type: string }): boolean {
  return /\.(pdf|png|jpe?g)$/i.test(file.name) && MIME_BOLETOS.includes(file.type) && file.size > 0 && file.size <= 50 * 1024 * 1024;
}
