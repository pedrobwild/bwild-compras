/**
 * Gasto por semana do painel. Semanas de segunda a domingo, datas no fuso de São Paulo.
 * Compra registrada conta pela data da compra; o resto pelo prazo de compra.
 * Seguro para navegador e servidor.
 */
import { dataValida, diferencaDias, somarDias } from "./prazos";

export type ColunaSemana = "atrasado" | "s0" | "s1" | "s2" | "s3" | "depois";
export type LinhaGasto = "comprado" | "pagamento" | "aComprar";

export const COLUNAS_SEMANA: { id: ColunaSemana; label: string }[] = [
  { id: "atrasado", label: "Atrasado" },
  { id: "s0", label: "Esta semana" },
  { id: "s1", label: "Próxima semana" },
  { id: "s2", label: "Em 2 semanas" },
  { id: "s3", label: "Em 3 semanas" },
  { id: "depois", label: "Depois" },
];
export const LINHAS_GASTO: { id: LinhaGasto; label: string }[] = [
  { id: "comprado", label: "Já comprado" },
  { id: "pagamento", label: "Em pagamento" },
  { id: "aComprar", label: "A comprar" },
];

/** Etapas antes da compra que entram em "A comprar" (cancelada fica de fora). */
export const ETAPAS_A_COMPRAR = ["nova", "cronograma_confirmado", "em_cotacao", "aguardando_aprovacao", "aprovada"] as const;

/** Segunda-feira da semana da data. */
export function inicioSemana(iso: string) {
  const dia = new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = domingo
  return somarDias(iso, -((dia + 6) % 7));
}

/** Coluna de uma data a partir desta semana; antes desta semana não entra no bloco. */
export function colunaDaData(data: string | null | undefined, hoje: string): Exclude<ColunaSemana, "atrasado"> | null {
  if (!dataValida(data)) return null;
  const semanas = diferencaDias(inicioSemana(hoje), inicioSemana(data)) / 7;
  if (semanas < 0) return null;
  if (semanas > 3) return "depois";
  return `s${semanas}` as "s0" | "s1" | "s2" | "s3";
}

/** O que ainda não foi comprado: prazo vencido vai para Atrasado. */
export function colunaPendente(prazoCompra: string | null | undefined, hoje: string): ColunaSemana | null {
  if (!dataValida(prazoCompra)) return null;
  return prazoCompra < hoje ? "atrasado" : colunaDaData(prazoCompra, hoje);
}

export interface SolicitacaoGasto {
  id: string;
  status: string;
  prazo_compra?: string | null;
  qtd_compras?: number | null;
  /** valor já resolvido no banco pela ordem compra > cotação escolhida > estimado (painel_solicitacoes.valor_exibicao) */
  valor_exibicao?: number | null;
}
export interface CompraGasto {
  solicitacao_id: string;
  valor_total: number | null;
  data_compra: string | null;
}

export interface CelulaGasto { comprado: number; pagamento: number; aComprar: number; total: number; semValor: number; ids: Set<string> }
export type GastoSemanal = Record<ColunaSemana, CelulaGasto>;

const celulaVazia = (): CelulaGasto => ({ comprado: 0, pagamento: 0, aComprar: 0, total: 0, semValor: 0, ids: new Set() });

/** Linha de uma solicitação ainda sem compra registrada (null = não entra no bloco). */
export function linhaPendente(s: SolicitacaoGasto): Exclude<LinhaGasto, "comprado"> | null {
  if ((s.qtd_compras ?? 0) > 0) return null; // já conta pelas compras, sem somar a cotação de novo
  if (s.status === "solicitacao_pagamento") return "pagamento";
  return (ETAPAS_A_COMPRAR as readonly string[]).includes(s.status) ? "aComprar" : null;
}

export function agruparPorSemana(solicitacoes: SolicitacaoGasto[], compras: CompraGasto[], hoje: string) {
  const g = Object.fromEntries(COLUNAS_SEMANA.map((c) => [c.id, celulaVazia()])) as GastoSemanal;
  const canceladas = new Set(solicitacoes.filter((s) => s.status === "cancelada").map((s) => s.id));
  let semPrazo = 0;
  for (const c of compras) {
    if (canceladas.has(c.solicitacao_id)) continue;
    const col = colunaDaData(c.data_compra, hoje);
    if (!col) continue;
    const v = Number(c.valor_total ?? 0);
    g[col].comprado += v;
    g[col].total += v;
    g[col].ids.add(c.solicitacao_id);
  }
  for (const s of solicitacoes) {
    const linha = linhaPendente(s);
    if (!linha) continue;
    const col = colunaPendente(s.prazo_compra, hoje);
    if (!col) { semPrazo++; continue; }
    const cel = g[col];
    cel.ids.add(s.id);
    if (s.valor_exibicao == null) { cel.semValor++; continue; }
    const v = Number(s.valor_exibicao);
    cel[linha] += v;
    cel.total += v;
  }
  return { colunas: g, semPrazo };
}

/** "Previsto para o mês": o que falta comprar com prazo de compra no mês de `hoje`. */
export function previstoNoMes(solicitacoes: SolicitacaoGasto[], hoje: string) {
  const mes = hoje.slice(0, 7);
  return solicitacoes.reduce((t, s) => (linhaPendente(s) && s.prazo_compra?.slice(0, 7) === mes ? t + Number(s.valor_exibicao ?? 0) : t), 0);
}
