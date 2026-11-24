import { z } from "zod";

export const MENSAGEM_DOMINIO_CADASTRO = "Use um e-mail @bwild.com.br ou @bewild.com.br.";

export function dominioCadastroPermitido(email: string): boolean {
  const partes = email.trim().toLowerCase().split("@");
  return partes.length === 2 && (partes[1] === "bwild.com.br" || partes[1] === "bewild.com.br");
}

export const novoUsuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(100),
  email: z.string().trim().email("E-mail inválido").max(255).refine(dominioCadastroPermitido, MENSAGEM_DOMINIO_CADASTRO),
  password: z.string().min(6, "Mínimo de 6 caracteres").max(100),
});

export function mensagemErroCadastro(mensagem: string): string {
  // O Auth pode ocultar a exceção do gatilho em uma mensagem genérica.
  if (/Cadastro permitido apenas para e-mails|Database error saving new user/i.test(mensagem)) {
    return MENSAGEM_DOMINIO_CADASTRO;
  }
  if (/already|registered|exists/i.test(mensagem)) return "Já existe um usuário com este e-mail.";
  return mensagem;
}