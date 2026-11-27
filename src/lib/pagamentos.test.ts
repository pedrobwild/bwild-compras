import { describe, expect, it } from "vitest";
import { dadosPagamentoSchema, linkPagamentoValido, ordenarFilaPagamentos, temMeioPagamento, validarBoleto } from "@/lib/pagamentos";

describe("Dados de pagamento", () => {
  it.each(["https://pagamento.example/boleto", "http://pagamento.example/pix"])("aceita %s", (url) => {
    expect(linkPagamentoValido(url)).toBe(true);
  });
  it.each(["javascript:alert(1)", "data:text/plain,pix", "ftp://pagamento.example", "pagamento.example", "https://", "https://site.example/a b"])("recusa protocolo ou endereço inválido %s", (url) => {
    expect(linkPagamentoValido(url)).toBe(false);
  });
  it("aceita até 1.000 caracteres no link e recusa 1.001", () => {
    const base = "https://pagamento.example/";
    expect(linkPagamentoValido(base + "a".repeat(1000 - base.length))).toBe(true);
    expect(linkPagamentoValido(base + "a".repeat(1001 - base.length))).toBe(false);
  });
  it("aceita instruções de 500 caracteres e recusa 501", () => {
    expect(dadosPagamentoSchema.safeParse({ link: "", instrucoes: "x".repeat(500) }).success).toBe(true);
    expect(dadosPagamentoSchema.safeParse({ link: "", instrucoes: "x".repeat(501) }).success).toBe(false);
  });
  it("bloqueia a passagem sem dados, inclusive espaços em branco", () => {
    expect(temMeioPagamento(" ", " \n ", 0)).toBe(false);
  });
  it("aceita somente um link válido como meio de pagamento", () => {
    expect(temMeioPagamento("https://pagamento.example", null, 0)).toBe(true);
    expect(temMeioPagamento("javascript:alert(1)", null, 0)).toBe(false);
  });
  it("aceita somente instruções como meio de pagamento", () => {
    expect(temMeioPagamento(null, "Pix: pedido 123", 0)).toBe(true);
  });
  it("aceita somente boleto registrado, não arquivo apenas selecionado", () => {
    expect(temMeioPagamento(null, null, 1)).toBe(true);
    expect(temMeioPagamento(null, null, 0)).toBe(false);
  });
  it.each([
    ["boleto.pdf", "application/pdf"], ["boleto.PNG", "image/png"], ["boleto.jpg", "image/jpeg"], ["boleto.jpeg", "image/jpeg"],
  ])("aceita boleto %s", (name, type) => {
    expect(validarBoleto({ name, type, size: 1024 })).toBe(true);
  });
  it("mantém limite de 50 MB e bloqueia arquivos vazios ou de outro tipo", () => {
    expect(validarBoleto({ name: "boleto.pdf", type: "application/pdf", size: 50 * 1024 * 1024 })).toBe(true);
    expect(validarBoleto({ name: "boleto.pdf", type: "application/pdf", size: 50 * 1024 * 1024 + 1 })).toBe(false);
    expect(validarBoleto({ name: "boleto.pdf", type: "application/pdf", size: 0 })).toBe(false);
    expect(validarBoleto({ name: "boleto.exe", type: "application/pdf", size: 1024 })).toBe(false);
  });
});

describe("Fila Pagamentos", () => {
  const rows = [
    { id: "4", status: "solicitacao_pagamento", data_necessaria: null },
    { id: "3", status: "solicitacao_pagamento", data_necessaria: "2026-12-02" },
    { id: "2", status: "solicitacao_pagamento", data_necessaria: "2026-11-28" },
    { id: "1", status: "solicitacao_pagamento", data_necessaria: "2026-11-28" },
    { id: "5", status: "comprada", data_necessaria: "2026-11-01" },
  ];
  it("ordena pelo prazo mais próximo e deixa sem data no final, sem alterar a origem", () => {
    expect(ordenarFilaPagamentos(rows).map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
    expect(rows.map((r) => r.id)).toEqual(["4", "3", "2", "1", "5"]);
  });
  it("mostra somente Solicitação de pagamento", () => {
    expect(ordenarFilaPagamentos(rows).some((r) => r.status === "comprada")).toBe(false);
    expect(ordenarFilaPagamentos(rows)).toHaveLength(4);
  });
});