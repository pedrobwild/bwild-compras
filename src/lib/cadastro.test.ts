import { describe, expect, it } from "vitest";
import { dominioCadastroPermitido, mensagemErroCadastro, novoUsuarioSchema } from "./cadastro";

describe("Domínios de novos cadastros", () => {
  it("aceita bwild.com.br", () => {
    expect(novoUsuarioSchema.safeParse({ nome: "Equipe", email: "equipe@bwild.com.br", password: "senha-de-teste" }).success).toBe(true);
  });

  it("aceita bewild.com.br", () => {
    expect(novoUsuarioSchema.safeParse({ nome: "Equipe", email: "equipe@bewild.com.br", password: "senha-de-teste" }).success).toBe(true);
  });

  it("não diferencia maiúsculas e minúsculas", () => {
    expect(dominioCadastroPermitido("EQUIPE@BWILD.COM.BR")).toBe(true);
    expect(dominioCadastroPermitido("EQUIPE@BEWILD.COM.BR")).toBe(true);
  });

  it.each([
    "equipe@gmail.com", "equipe@outro.com.br", "equipe@sub.bwild.com.br",
    "equipe@bwild.com.br.exemplo.com", "equipe@bwild.com", "equipe@bewild.com.br.exemplo.com",
    "equipe@sub.bewild.com.br", "equipe@bewild.com", "equipe@", "equipe", "equipe@bwild.com.br@outro.com",
  ])("recusa domínio não autorizado: %s", (email) => {
    expect(novoUsuarioSchema.safeParse({ nome: "Equipe", email, password: "senha-de-teste" }).success).toBe(false);
  });

  it("mantém a validação de endereço e normaliza espaços externos", () => {
    expect(novoUsuarioSchema.safeParse({ nome: "Equipe", email: "@bwild.com.br", password: "senha-de-teste" }).success).toBe(false);
    const resultado = novoUsuarioSchema.parse({ nome: "Equipe", email: " equipe@bwild.com.br ", password: "senha-de-teste" });
    expect(resultado.email).toBe("equipe@bwild.com.br");
  });
});

describe("Erros de cadastro", () => {
  it("reconhece a recusa explícita do gatilho", () => {
    expect(mensagemErroCadastro("Cadastro permitido apenas para e-mails @bwild.com.br ou @bewild.com.br")).toBe("Use um e-mail @bwild.com.br ou @bewild.com.br.");
  });

  it("reconhece a recusa mascarada pelo Auth", () => {
    expect(mensagemErroCadastro("Database error saving new user")).toBe("Use um e-mail @bwild.com.br ou @bewild.com.br.");
  });

  it("não mascara falhas sem relação com o gatilho", () => {
    expect(mensagemErroCadastro("Email rate limit exceeded")).toBe("Email rate limit exceeded");
  });
});