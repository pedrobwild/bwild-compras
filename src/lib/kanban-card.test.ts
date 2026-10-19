import { describe, expect, it } from "vitest";
import { cardPosCompra, previsaoChegada } from "./kanban-card";

describe("cards finais do Kanban", () => {
  it.each(["comprada", "entregue_parcial", "entregue"] as const)("usa apresentação limpa em %s", (status) => {
    expect(cardPosCompra(status)).toBe(true);
  });
  it.each(["nova", "cronograma_confirmado", "em_cotacao", "aguardando_aprovacao", "aprovada", "solicitacao_pagamento", "cancelada"] as const)("preserva sinalizações em %s", (status) => {
    expect(cardPosCompra(status)).toBe(false);
  });
  it("prioriza a próxima entrega informada pela view", () => {
    expect(previsaoChegada("2026-10-25", [{ previsao_entrega: "2026-10-20" }])).toBe("2026-10-25");
  });
  it("usa a previsão registrada na compra quando não há próxima entrega", () => {
    expect(previsaoChegada(null, [{ previsao_entrega: null }, { previsao_entrega: "2026-10-25" }, { previsao_entrega: "2026-10-20" }])).toBe("2026-10-20");
  });
  it("não inventa uma data quando não existe previsão", () => {
    expect(previsaoChegada(null)).toBeNull();
  });
});