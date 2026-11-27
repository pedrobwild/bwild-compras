import { describe, expect, it } from "vitest";
import { calcularComprarAte, devePerguntarPrazo, diferencaDias, hojeSP, lerPrazoDias, prazoVencido } from "./prazos";

describe("Comprar até = data na obra − prazo do fornecedor (dias corridos)", () => {
  it("subtrai os dias corridos, atravessando mês e ano", () => {
    expect(calcularComprarAte("2026-12-10", 15)).toBe("2026-11-25");
    expect(calcularComprarAte("2027-01-05", 10)).toBe("2026-12-26");
    expect(calcularComprarAte("2028-03-01", 1)).toBe("2028-02-29");
  });
  it("prazo zero compra no próprio dia da obra", () => {
    expect(calcularComprarAte("2026-12-10", 0)).toBe("2026-12-10");
  });
  it("sem data na obra ou sem prazo não calcula", () => {
    expect(calcularComprarAte(null, 10)).toBeNull();
    expect(calcularComprarAte("2026-12-10", null)).toBeNull();
  });
  it("solicitações antigas: prazo do fornecedor é a diferença entre as duas datas", () => {
    const dias = diferencaDias("2026-11-18", "2026-11-25");
    expect(dias).toBe(7);
    expect(calcularComprarAte("2026-11-25", dias)).toBe("2026-11-18");
  });
});

describe("Prazo do fornecedor digitado", () => {
  it("aceita inteiros de 0 a 365", () => {
    expect(lerPrazoDias("0")).toBe(0);
    expect(lerPrazoDias(" 30 ")).toBe(30);
    expect(lerPrazoDias("365")).toBe(365);
  });
  it("recusa vazio, fração, negativo e acima de 365", () => {
    for (const t of ["", "2,5", "-3", "366", "abc"]) expect(lerPrazoDias(t)).toBeNull();
  });
});

describe("Aviso de prazo vencido", () => {
  it("avisa só quando a data já passou", () => {
    expect(prazoVencido("2026-11-26", "2026-11-27")).toBe(true);
    expect(prazoVencido("2026-11-27", "2026-11-27")).toBe(false);
    expect(prazoVencido(null, "2026-11-27")).toBe(false);
  });
  it("hoje segue o fuso de São Paulo", () => {
    // 01:30 UTC do dia 28 ainda é dia 27 em São Paulo (UTC−3)
    expect(hojeSP(new Date("2026-11-28T01:30:00Z"))).toBe("2026-11-27");
    expect(hojeSP(new Date("2026-11-28T03:30:00Z"))).toBe("2026-11-28");
  });
});

describe("Cotação escolhida com outro prazo", () => {
  it("pergunta quando o prazo da cotação é diferente do informado", () => {
    expect(devePerguntarPrazo(10, 15)).toBe(true);
    expect(devePerguntarPrazo(null, 7)).toBe(true);
  });
  it("não pergunta quando é igual ou a cotação não tem prazo", () => {
    expect(devePerguntarPrazo(10, 10)).toBe(false);
    expect(devePerguntarPrazo(10, null)).toBe(false);
    expect(devePerguntarPrazo(10, 400)).toBe(false);
  });
});
