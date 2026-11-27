import { describe, expect, it } from "vitest";
import { compraRepetida } from "./compras";

describe("Aviso de compra repetida", () => {
  const existentes = [{ fornecedor: "UseReuse", valor_total: 2469.9, data_compra: "2026-11-18" }];
  it("avisa quando o fornecedor e o valor são iguais, ignorando maiúsculas e espaços", () => {
    expect(compraRepetida(existentes, { fornecedor: " usereuse ", valor_total: 2469.9 })).not.toBeNull();
  });
  it("não avisa com outro valor ou outro fornecedor", () => {
    expect(compraRepetida(existentes, { fornecedor: "UseReuse", valor_total: 2469.91 })).toBeNull();
    expect(compraRepetida(existentes, { fornecedor: "Leroy", valor_total: 2469.9 })).toBeNull();
  });
});
