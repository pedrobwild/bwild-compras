/** Regras de registro de compra; seguro para navegador e servidor. */
export interface CompraResumo { fornecedor: string | null; valor_total: number | null; data_compra?: string | null }

const normalizar = (t: string | null | undefined) => (t ?? "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
const centavos = (v: number | null | undefined) => Math.round(Number(v ?? 0) * 100);

/** Compra já registrada com o mesmo fornecedor e o mesmo valor (provável registro em dobro). */
export function compraRepetida(existentes: CompraResumo[], nova: CompraResumo) {
  return existentes.find((c) => normalizar(c.fornecedor) === normalizar(nova.fornecedor) && centavos(c.valor_total) === centavos(nova.valor_total)) ?? null;
}
