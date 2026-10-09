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
