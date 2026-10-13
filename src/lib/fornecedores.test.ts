import { describe, it, expect } from "vitest";
import { agruparFornecedores } from "./fornecedores";

describe("agruparFornecedores", () => {
  it("junta nomes com acento/caixa diferentes e calcula pontualidade", () => {
    const r = agruparFornecedores(
      [{ id: "1", solicitacao_id: "s", fornecedor: "Leroy  Merlin", valor_total: 10, prazo_entrega_dias: 5, escolhida: true, created_at: "2026-10-01" },
       { id: "2", solicitacao_id: "s", fornecedor: "leroy merlin", valor_total: 12, prazo_entrega_dias: 5, escolhida: false, created_at: "2026-10-02" }],
      [{ id: "c", solicitacao_id: "s", fornecedor: "LEROY MERLIN", valor_total: 100, data_compra: "2026-10-03", previsao_entrega: "2026-10-05", data_entrega_real: "2026-10-04" },
       { id: "d", solicitacao_id: "s", fornecedor: "Leroy Merlin", valor_total: 50, data_compra: "2026-10-03", previsao_entrega: "2026-10-05", data_entrega_real: "2026-10-07" }],
    );
    expect(r).toHaveLength(1);
    expect(r[0].totalComprado).toBe(150);
    expect(r[0].taxaEscolha).toBe(0.5);
    expect(r[0].pontualidade).toBe(0.5);
  });
});
