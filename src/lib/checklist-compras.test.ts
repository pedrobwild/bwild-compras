import { describe, expect, it } from "vitest";
import { montarChecklist, filtrarChecklist } from "@/lib/checklist-compras";
import type { PainelRow, Status } from "@/lib/format";

const row = (id: string, status: Status, extras: Partial<PainelRow> = {}) => ({ id, status, prioridade: "normal", atrasada: false, titulo: "Item", codigo: id, ...extras }) as PainelRow;
const item = (id: string) => ({ id, solicitacao_id: id, descricao: "Luminária", quantidade: 2, unidade: "un" });

describe("Checklist por cliente", () => {
  it.each(["comprada", "entregue_parcial", "entregue"] as const)("marca %s como comprado", (status) => {
    expect(montarChecklist([item("1")], [row("1", status)])[0].comprado).toBe(true);
  });
  it("mantém solicitação de pagamento como não comprado", () => {
    expect(montarChecklist([item("1")], [row("1", "solicitacao_pagamento")])[0].comprado).toBe(false);
  });
  it("exclui cancelados e itens de outros clientes", () => {
    expect(montarChecklist([item("1"), item("2")], [row("1", "cancelada")])).toEqual([]);
  });
  it("prioriza pendentes urgentes e filtra urgência sem incluir comprados", () => {
    const linhas = montarChecklist([item("1"), item("2"), item("3")], [row("1", "comprada", { prioridade: "urgente" }), row("2", "nova"), row("3", "em_cotacao", { atrasada: true })]);
    expect(linhas.map((l) => l.id)).toEqual(["3", "2", "1"]);
    expect(filtrarChecklist(linhas, "urgentes", "luminaria").map((l) => l.id)).toEqual(["3"]);
    expect(filtrarChecklist(linhas, "pendentes", "").map((l) => l.id)).toEqual(["3", "2"]);
  });
});