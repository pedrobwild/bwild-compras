import { describe, expect, it } from "vitest";
import { noPeriodo } from "@/lib/periodo";

describe("Filtro por data de criação da solicitação", () => {
  const periodo = { from: new Date(2026, 10, 12), to: new Date(2026, 10, 18) };

  it("inclui solicitações criadas em ambos os limites do período", () => {
    expect(noPeriodo("2026-11-12T00:00:00", periodo)).toBe(true);
    expect(noPeriodo("2026-11-18T23:59:59.999", periodo)).toBe(true);
  });

  it("exclui solicitações criadas fora do período", () => {
    expect(noPeriodo("2026-11-11T23:59:59", periodo)).toBe(false);
    expect(noPeriodo("2026-11-19T00:00:00", periodo)).toBe(false);
  });

  it("inclui o dia inteiro quando apenas a data inicial foi selecionada", () => {
    const dia = { from: new Date(2026, 10, 18) };
    expect(noPeriodo("2026-11-18T19:52:00", dia)).toBe(true);
    expect(noPeriodo("2026-11-19T00:00:00", dia)).toBe(false);
  });

  it("não restringe as solicitações ao limpar o filtro", () => {
    expect(noPeriodo("2026-10-01T12:00:00", undefined)).toBe(true);
    expect(noPeriodo(null, undefined)).toBe(true);
  });

  it("não inclui datas ausentes ou inválidas em um período selecionado", () => {
    expect(noPeriodo(null, periodo)).toBe(false);
    expect(noPeriodo("inválida", periodo)).toBe(false);
  });
});