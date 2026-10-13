import { describe, expect, it } from "vitest";
import { calcularTempoPorStatus, statusDoEvento, fmtDiasMedia } from "./tempo-status";

const DIA = 86400000;
const agora = new Date("2026-10-13T12:00:00Z").getTime();
const iso = (diasAtras: number) => new Date(agora - diasAtras * DIA).toISOString();

describe("statusDoEvento", () => {
  it("reconhece o rótulo do status na descrição", () => {
    expect(statusDoEvento("Status alterado para Em cotação")).toBe("em_cotacao");
    expect(statusDoEvento("Status alterado para Entregue parcial")).toBe("entregue_parcial");
    expect(statusDoEvento("Status alterado para Entregue")).toBe("entregue");
  });
  it("ignora descrições sem status", () => {
    expect(statusDoEvento("Compra registrada")).toBeNull();
    expect(statusDoEvento(null)).toBeNull();
  });
});

describe("calcularTempoPorStatus", () => {
  it("card sem eventos conta o tempo todo no status atual", () => {
    const r = calcularTempoPorStatus([], [{ id: "a", status: "em_cotacao", created_at: iso(10) }], agora);
    const cot = r.find((x) => x.status === "em_cotacao")!;
    expect(cot.qtdAgora).toBe(1);
    expect(cot.mediaDiasAgora).toBeCloseTo(10);
  });

  it("divide o tempo entre as etapas pelos eventos", () => {
    const eventos = [
      { solicitacao_id: "a", descricao: "Status alterado para Em cotação", created_at: iso(8) },
      { solicitacao_id: "a", descricao: "Status alterado para Aprovado", created_at: iso(3) },
    ];
    const r = calcularTempoPorStatus(eventos, [{ id: "a", status: "aprovada", created_at: iso(13) }], agora);
    expect(r.find((x) => x.status === "nova")!.mediaDiasHistorico).toBeCloseTo(5);
    expect(r.find((x) => x.status === "em_cotacao")!.mediaDiasHistorico).toBeCloseTo(5);
    const apr = r.find((x) => x.status === "aprovada")!;
    expect(apr.qtdAgora).toBe(1);
    expect(apr.mediaDiasAgora).toBeCloseTo(3);
  });

  it("faz a média entre vários cards", () => {
    const r = calcularTempoPorStatus(
      [],
      [
        { id: "a", status: "nova", created_at: iso(2) },
        { id: "b", status: "nova", created_at: iso(6) },
      ],
      agora,
    );
    const nova = r.find((x) => x.status === "nova")!;
    expect(nova.qtdAgora).toBe(2);
    expect(nova.mediaDiasAgora).toBeCloseTo(4);
    expect(nova.maxDiasAgora).toBeCloseTo(6);
  });
});

describe("fmtDiasMedia", () => {
  it("formata horas, dias e vazio", () => {
    expect(fmtDiasMedia(null)).toBe("—");
    expect(fmtDiasMedia(0.5)).toBe("12 h");
    expect(fmtDiasMedia(2.5)).toBe("2,5 dias");
  });
});
