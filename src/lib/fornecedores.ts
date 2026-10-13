// Agrupa cotações e compras por fornecedor (nome livre, normalizado).
export const normFornecedor = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

export interface CotacaoLite { id: string; solicitacao_id: string; fornecedor: string; fornecedor_contato?: string | null; valor_total: number | null; prazo_entrega_dias: number | null; escolhida: boolean | null; created_at: string }
export interface CompraLite { id: string; solicitacao_id: string; fornecedor: string; fornecedor_contato?: string | null; valor_total: number | null; data_compra: string | null; previsao_entrega: string | null; data_entrega_real: string | null }

export interface FornecedorResumo {
  chave: string; nome: string; contato: string | null;
  cotacoes: CotacaoLite[]; compras: CompraLite[];
  totalComprado: number; vezesEscolhido: number; taxaEscolha: number | null;
  entregues: number; entreguesNoPrazo: number; pontualidade: number | null;
  ultimaAtividade: string | null;
}

export function agruparFornecedores(cotacoes: CotacaoLite[], compras: CompraLite[]): FornecedorResumo[] {
  const map = new Map<string, FornecedorResumo>();
  const get = (nome: string, contato?: string | null) => {
    const chave = normFornecedor(nome);
    let f = map.get(chave);
    if (!f) {
      f = { chave, nome: nome.trim(), contato: null, cotacoes: [], compras: [], totalComprado: 0, vezesEscolhido: 0, taxaEscolha: null, entregues: 0, entreguesNoPrazo: 0, pontualidade: null, ultimaAtividade: null };
      map.set(chave, f);
    }
    if (!f.contato && contato) f.contato = contato;
    return f;
  };
  for (const c of cotacoes) { if (normFornecedor(c.fornecedor)) get(c.fornecedor, c.fornecedor_contato).cotacoes.push(c); }
  for (const c of compras) { if (normFornecedor(c.fornecedor)) get(c.fornecedor, c.fornecedor_contato).compras.push(c); }
  for (const f of map.values()) {
    f.totalComprado = f.compras.reduce((s, c) => s + Number(c.valor_total ?? 0), 0);
    f.vezesEscolhido = f.cotacoes.filter((c) => c.escolhida).length;
    f.taxaEscolha = f.cotacoes.length ? f.vezesEscolhido / f.cotacoes.length : null;
    const comPrev = f.compras.filter((c) => c.data_entrega_real && c.previsao_entrega);
    f.entregues = f.compras.filter((c) => c.data_entrega_real).length;
    f.entreguesNoPrazo = comPrev.filter((c) => c.data_entrega_real! <= c.previsao_entrega!).length;
    f.pontualidade = comPrev.length ? f.entreguesNoPrazo / comPrev.length : null;
    const datas = [...f.cotacoes.map((c) => c.created_at?.slice(0, 10)), ...f.compras.map((c) => c.data_compra)].filter(Boolean) as string[];
    f.ultimaAtividade = datas.sort().at(-1) ?? null;
  }
  return [...map.values()].sort((a, b) => b.totalComprado - a.totalComprado || b.cotacoes.length - a.cotacoes.length);
}
