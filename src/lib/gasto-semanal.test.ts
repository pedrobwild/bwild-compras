import { describe, expect, it } from "vitest";
import { agruparPorSemana, colunaDaData, colunaPendente, inicioSemana, previstoNoMes, type SolicitacaoGasto } from "./gasto-semanal";

// Sexta-feira, 27/11/2026. Semana atual: segunda 23/11 a domingo 29/11.
const HOJE = "2026-11-27";

describe("Semanas de segunda a domingo", () => {
  it("começa na segunda-feira", () => {
    expect(inicioSemana("2026-11-27")).toBe("2026-11-23");
    expect(inicioSemana("2026-11-29")).toBe("2026-11-23"); // domingo ainda é desta semana
    expect(inicioSemana("2026-11-30")).toBe("2026-11-30"); // segunda abre a próxima
  });
  it("distribui nas colunas e manda o resto para Depois", () => {
    expect(colunaDaData("2026-11-29", HOJE)).toBe("s0");
    expect(colunaDaData("2026-11-30", HOJE)).toBe("s1");
    expect(colunaDaData("2026-12-07", HOJE)).toBe("s2");
    expect(colunaDaData("2026-12-20", HOJE)).toBe("s3");
    expect(colunaDaData("2026-12-21", HOJE)).toBe("depois");
    expect(colunaDaData("2026-11-22", HOJE)).toBeNull(); // semana passada fica fora do bloco
  });
  it("Atrasado é o prazo de compra vencido", () => {
    expect(colunaPendente("2026-11-26", HOJE)).toBe("atrasado");
    expect(colunaPendente("2026-11-27", HOJE)).toBe("s0");
    expect(colunaPendente(null, HOJE)).toBeNull();
  });
});

describe("Agrupamento do gasto", () => {
  const sol = (p: Partial<SolicitacaoGasto> & { id: string }): SolicitacaoGasto => ({ status: "em_cotacao", qtd_compras: 0, ...p });

  it("compra registrada conta pela data da compra, sem somar a cotação escolhida de novo", () => {
    const { colunas } = agruparPorSemana(
      [sol({ id: "a", status: "comprada", qtd_compras: 1, prazo_compra: "2026-12-01", valor_exibicao: 500 })],
      [{ solicitacao_id: "a", valor_total: 500, data_compra: "2026-11-24" }],
      HOJE,
    );
    expect(colunas.s0.comprado).toBe(500);
    expect(colunas.s0.total).toBe(500);
    expect(colunas.s1.total).toBe(0);
  });

  it("separa Em pagamento de A comprar e ignora canceladas", () => {
    const { colunas } = agruparPorSemana(
      [
        sol({ id: "p", status: "solicitacao_pagamento", prazo_compra: "2026-11-30", valor_exibicao: 200 }),
        sol({ id: "c", status: "em_cotacao", prazo_compra: "2026-12-02", valor_exibicao: 100 }),
        sol({ id: "x", status: "cancelada", prazo_compra: "2026-12-02", valor_exibicao: 999 }),
      ],
      [{ solicitacao_id: "x", valor_total: 50, data_compra: "2026-11-24" }],
      HOJE,
    );
    expect(colunas.s1).toMatchObject({ pagamento: 200, aComprar: 100, total: 300, semValor: 0 });
    expect(colunas.s0.total).toBe(0);
  });

  it("conta quem está sem valor e põe o vencido em Atrasado", () => {
    const { colunas, semPrazo } = agruparPorSemana(
      [
        sol({ id: "v", prazo_compra: "2026-11-20", valor_exibicao: 80 }),
        sol({ id: "s", prazo_compra: "2026-11-20", valor_exibicao: null }),
        sol({ id: "n", prazo_compra: null, valor_exibicao: 10 }),
      ],
      [],
      HOJE,
    );
    expect(colunas.atrasado).toMatchObject({ aComprar: 80, total: 80, semValor: 1 });
    expect([...colunas.atrasado.ids].sort()).toEqual(["s", "v"]);
    expect(semPrazo).toBe(1);
  });

  it("Previsto para o mês soma só o que falta comprar com prazo no mês", () => {
    const linhas = [
      sol({ id: "1", prazo_compra: "2026-11-03", valor_exibicao: 100 }),
      sol({ id: "2", prazo_compra: "2026-11-30", valor_exibicao: 50 }),
      sol({ id: "3", prazo_compra: "2026-12-01", valor_exibicao: 70 }),
      sol({ id: "4", status: "comprada", qtd_compras: 1, prazo_compra: "2026-11-10", valor_exibicao: 999 }),
    ];
    expect(previstoNoMes(linhas, HOJE)).toBe(150);
  });
});
