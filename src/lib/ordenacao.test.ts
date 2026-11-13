import { describe, expect, it } from "vitest";
import { ordenarRegistros } from "@/lib/ordenacao";

const rows = [
  { id: "2", nome: "Zíper", data: "2026-11-12T10:00:00Z" },
  { id: "1", nome: "Ármario", data: "2026-11-01T10:00:00Z" },
  { id: "3", nome: "Bancada", data: null },
];
const campos = { nome: (r: typeof rows[number]) => r.nome, data: (r: typeof rows[number]) => r.data, id: (r: typeof rows[number]) => r.id };
describe("Ordenação das solicitações e itens", () => {
  it.each([
    ["recentes", ["2", "1", "3"]],
    ["antigas", ["1", "2", "3"]],
    ["az", ["1", "3", "2"]],
    ["za", ["2", "3", "1"]],
    ["padrao", ["2", "1", "3"]],
  ] as const)("ordena por %s sem alterar os dados originais", (ordem, esperado) => {
    expect(ordenarRegistros(rows, ordem, campos).map((r) => r.id)).toEqual(esperado);
    expect(rows.map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
  it("desempata nomes iguais pelo identificador", () => {
    expect(ordenarRegistros([{ ...rows[0], nome: "Armário" }, rows[1]], "az", campos).map((r) => r.id)).toEqual(["1", "2"]);
  });
  it.each([
    ["necessario_proximo", ["1", "2", "3"]],
    ["necessario_distante", ["2", "1", "3"]],
    ["previsao_proxima", ["2", "1", "3"]],
    ["previsao_distante", ["1", "2", "3"]],
  ] as const)("ordena por %s usando a data correspondente e deixa vazios no fim", (ordem, esperado) => {
    const datas = {
      ...campos,
      necessario: (r: typeof rows[number]) => r.id === "1" ? "2026-11-15" : r.id === "2" ? "2026-11-20" : null,
      previsao: (r: typeof rows[number]) => r.id === "1" ? "2026-11-25" : r.id === "2" ? "2026-11-18" : null,
    };
    expect(ordenarRegistros(rows, ordem, datas).map((r) => r.id)).toEqual(esperado);
  });
});