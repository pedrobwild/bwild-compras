import { describe, expect, it } from "vitest";
import { dadosPagamentoSchema, linkPagamentoValido, ordenarFilaPagamentos, temMeioPagamento, validarBoleto, salvarPagamentosSchema, totalPagamentos, itensSemPagamento } from "@/lib/pagamentos";

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
  it("aceita código de 1.000 caracteres e recusa 1.001", () => {
    expect(dadosPagamentoSchema.safeParse({ onde_comprado: "Loja", valor: null, link: "", codigo: "x".repeat(1000), observacao: "" }).success).toBe(true);
    expect(dadosPagamentoSchema.safeParse({ onde_comprado: "Loja", valor: null, link: "", codigo: "x".repeat(1001), observacao: "" }).success).toBe(false);
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

describe("Pagamentos múltiplos", () => {
  const item = "00000000-0000-4000-8000-000000000010";
  const p = { id: "00000000-0000-4000-8000-000000000001", onde_comprado: "Loja A", valor: 120.5, link: "", codigo: "Pix copia e cola", observacao: "", itens: [item], boletos: [] };
  const base = { id: "00000000-0000-4000-8000-000000000003", solicitar: true, versao: "2026-11-27T12:00:00Z" };
  it("aceita pagamentos diferentes na mesma solicitação", () => {
    expect(salvarPagamentosSchema.safeParse({ ...base, pagamentos: [p, { ...p, id: "00000000-0000-4000-8000-000000000002", itens: [] }] }).success).toBe(true);
  });
  it("recusa item em dois pagamentos", () => {
    expect(salvarPagamentosSchema.safeParse({ ...base, pagamentos: [p, { ...p, id: "00000000-0000-4000-8000-000000000002" }] }).success).toBe(false);
  });
  it("recusa lista vazia e pagamento sem meio válido", () => {
    expect(salvarPagamentosSchema.safeParse({ ...base, pagamentos: [] }).success).toBe(false);
    expect(salvarPagamentosSchema.safeParse({ ...base, pagamentos: [{ ...p, codigo: " " }] }).success).toBe(false);
  });
  it("exige local da compra e aceita observação até 300 caracteres", () => {
    expect(salvarPagamentosSchema.safeParse({ ...base, pagamentos: [{ ...p, onde_comprado: " " }] }).success).toBe(false);
    expect(salvarPagamentosSchema.safeParse({ ...base, pagamentos: [{ ...p, observacao: "x".repeat(300) }] }).success).toBe(true);
    expect(salvarPagamentosSchema.safeParse({ ...base, pagamentos: [{ ...p, observacao: "x".repeat(301) }] }).success).toBe(false);
  });
  it("soma apenas valores informados e distingue zero de não informado", () => {
    expect(totalPagamentos([{ valor: 120.5 }, { valor: null }, { valor: 79.5 }])).toBe(200);
    expect(totalPagamentos([{ valor: null }])).toBeNull();
    expect(totalPagamentos([{ valor: 0 }])).toBe(0);
  });
  it("avisa itens sem vínculo sem exigir vínculo para salvar", () => {
    expect(itensSemPagamento([{ id: item }, { id: "outro" }], [p])).toBe(1);
    expect(salvarPagamentosSchema.safeParse({ ...base, pagamentos: [{ ...p, itens: [] }] }).success).toBe(true);
  });
  it("filtra um dia e intervalo inclusivo pela data Na obra até", () => {
    const rows = [{ id: "a", status: "solicitacao_pagamento", data_necessaria: "2026-11-27" }, { id: "b", status: "solicitacao_pagamento", data_necessaria: "2026-11-28" }, { id: "c", status: "solicitacao_pagamento", data_necessaria: null }];
    expect(ordenarFilaPagamentos(rows, { from: new Date(2026, 10, 27) }).map((r) => r.id)).toEqual(["a"]);
    expect(ordenarFilaPagamentos(rows, { from: new Date(2026, 10, 27), to: new Date(2026, 10, 28) }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(ordenarFilaPagamentos(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
