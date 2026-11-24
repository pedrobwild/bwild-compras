import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  isAdmin: true,
  signUp: vi.fn(),
  signIn: vi.fn(),
  resetPassword: vi.fn(),
  erroToast: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signUp: estado.signUp } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  SUPABASE_URL: "http://localhost",
  SUPABASE_PUBLISHABLE_KEY: "chave-publica-de-teste",
  supabase: {
    auth: { signInWithPassword: estado.signIn, resetPasswordForEmail: estado.resetPassword },
    from: () => {
      const q = { select: () => q, order: () => q, limit: () => Promise.resolve({ data: [], error: null }) };
      return q;
    },
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin-teste" }, session: null }),
  useRole: () => ({ isAdmin: estado.isAdmin, loading: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: estado.erroToast, success: vi.fn() } }));

import { Route as UsuariosRoute } from "@/routes/_authenticated/admin.usuarios";
import { Route as LoginRoute } from "@/routes/login";

function abrirPagina(tipo: "usuarios" | "login") {
  const Pagina = (tipo === "usuarios" ? UsuariosRoute : LoginRoute).options.component;
  if (!Pagina) throw new Error("Página não encontrada");
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Pagina />
  </QueryClientProvider>);
}

async function preencherNovoUsuario(email: string) {
  abrirPagina("usuarios");
  fireEvent.click(screen.getByRole("button", { name: "Novo usuário" }));
  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Equipe Teste" } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Senha temporária"), { target: { value: "senha-de-teste" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Criar usuário" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.isAdmin = true;
  estado.signUp.mockResolvedValue({ data: { user: { identities: [{ id: "nova-identidade" }] }, session: null }, error: null });
  estado.signIn.mockResolvedValue({ error: null });
  estado.resetPassword.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Cadastro pelo administrador", () => {
  it("não envia um cadastro de domínio externo ao Auth", async () => {
    await preencherNovoUsuario("equipe@gmail.com");
    expect(estado.signUp).not.toHaveBeenCalled();
  });

  it.each(["equipe@bwild.com.br", "equipe@bewild.com.br"])("envia o cadastro corporativo %s", async (email) => {
    await preencherNovoUsuario(email);
    await waitFor(() => expect(estado.signUp).toHaveBeenCalledWith({
      email, password: "senha-de-teste",
      options: { data: { nome: "Equipe Teste" }, emailRedirectTo: window.location.origin },
    }));
  });

  it("trata a recusa do banco sem disparar outro cadastro", async () => {
    estado.signUp.mockResolvedValue({ data: {}, error: { message: "Database error saving new user" } });
    await preencherNovoUsuario("equipe@bwild.com.br");
    await waitFor(() => expect(estado.erroToast).toHaveBeenCalledTimes(1));
    expect(estado.signUp).toHaveBeenCalledTimes(1);
    expect(estado.erroToast.mock.calls[0]?.[0]).toBe("Use um e-mail @bwild.com.br ou @bewild.com.br.");
  });
});

describe("Acesso existente", () => {
  it("continua enviando o login de usuários existentes de outro domínio", async () => {
    abrirPagina("login");
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "existente@outro.com.br" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-de-teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(estado.signIn).toHaveBeenCalledWith({ email: "existente@outro.com.br", password: "senha-de-teste" }));
  });

  it("preserva a recuperação de senha e o endereço de retorno", async () => {
    abrirPagina("login");
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "existente@outro.com.br" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));
    await waitFor(() => expect(estado.resetPassword).toHaveBeenCalledWith("existente@outro.com.br", { redirectTo: `${window.location.origin}/reset-password` }));
  });
});