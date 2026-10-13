import { describe, expect, it } from "vitest";
import { normalizar, sugerirCliente } from "./clientes";

const lista = [
  { id: "1", nome: "Eric Fernandes", empreendimento: "Ed. Aurora", unidade: "101", endereco: null },
  { id: "2", nome: "Eric Fernandes", empreendimento: "Ed. Sol", unidade: "202", endereco: null },
  { id: "3", nome: "Ana Lúcia", empreendimento: null, unidade: null, endereco: null },
];

describe("clientes", () => {
  it("nomes com acento, maiúsculas e espaços extras são o mesmo cliente", () => {
    expect(normalizar("  ANA   lucia ")).toBe(normalizar("Ana Lúcia"));
  });
  it("sugere a obra certa do cliente pelo empreendimento", () => {
    expect(sugerirCliente(lista, { cliente: "eric fernandes", empreendimento: "Ed. Sol" })?.id).toBe("2");
  });
  it("não sugere nada quando o nome não bate", () => {
    expect(sugerirCliente(lista, { cliente: "Carlos Souza" })).toBeNull();
  });
});

import { bateBusca, mesclarClientes } from "./clientes";

describe("lista de clientes", () => {
  it("busca por palavras em qualquer ordem", () => {
    expect(bateBusca("Eric Fernandes — Ed. Aurora 101", "aurora eric")).toBe(true);
    expect(bateBusca("Eric Fernandes — Ed. Aurora 101", "aurora carlos")).toBe(false);
  });
  it("cliente que só existe em solicitação entra na lista, sem duplicar o cadastro", () => {
    const r = mesclarClientes(lista, [
      { cliente: "ERIC fernandes", empreendimento: "ed. aurora", unidade: "101", endereco_obra: null },
      { cliente: "Marta Dias", empreendimento: "Ed. Lua", unidade: "5", endereco_obra: "Rua A" },
      { cliente: "Marta Dias", empreendimento: "Ed. Lua", unidade: "5", endereco_obra: "Rua A" },
    ]);
    expect(r).toHaveLength(4);
    expect(r.find((c) => c.nome === "Marta Dias")?.semCadastro).toBe(true);
  });
});
