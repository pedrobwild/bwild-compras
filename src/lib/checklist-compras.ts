import type { PainelRow } from "@/lib/format";
import { cardPosCompra } from "@/lib/kanban-card";

export type FiltroChecklist = "todos" | "pendentes" | "comprados" | "urgentes";
export type ItemChecklist = { id: string; solicitacao_id: string; descricao: string; quantidade: number | null; unidade: string | null };
export type LinhaChecklist = ItemChecklist & { solicitacao: PainelRow; comprado: boolean; urgente: boolean };

export function montarChecklist(itens: ItemChecklist[], solicitacoes: PainelRow[]): LinhaChecklist[] {
  const porId = new Map(solicitacoes.map((r) => [r.id, r]));
  return itens.flatMap((item) => {
    const solicitacao = porId.get(item.solicitacao_id);
    if (!solicitacao || solicitacao.status === "cancelada") return [];
    const comprado = cardPosCompra(solicitacao.status);
    const urgente = !comprado && (solicitacao.prioridade === "urgente" || solicitacao.atrasada || solicitacao.situacao_prazo === "vence_hoje" || solicitacao.situacao_prazo === "vence_em_breve");
    return [{ ...item, solicitacao, comprado, urgente }];
  }).sort((a, b) => Number(a.comprado) - Number(b.comprado) || Number(b.urgente) - Number(a.urgente) || a.descricao.localeCompare(b.descricao, "pt-BR") || a.id.localeCompare(b.id));
}

export function filtrarChecklist(linhas: LinhaChecklist[], filtro: FiltroChecklist, busca: string) {
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const palavras = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  return linhas.filter((l) => (filtro === "todos" || (filtro === "pendentes" && !l.comprado) || (filtro === "comprados" && l.comprado) || (filtro === "urgentes" && l.urgente)) && palavras.every((p) => normalizar(`${l.descricao} ${l.solicitacao.codigo} ${l.solicitacao.titulo}`).includes(p)));
}