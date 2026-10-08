import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/* Banco falso que imita o Supabase de hoje: sem prazo_compra / data_compra_efetiva,
   sem o status cronograma_confirmado e sem a tabela cotacao_anexos. */
const db = vi.hoisted(() => {
  const state = { bancoCompleto: false, updates: [] as { table: string; patch: unknown }[] };
  const tabelas: Record<string, Record<string, unknown>[]> = {
    solicitacoes: [
      {
        id: "sol-1", codigo: "SC-0001", numero: 1, cliente: "Cliente X", empreendimento: "Edifício Y", unidade: "101",
        endereco_obra: "Rua Z, 10", titulo: "Tinta para a sala", descricao: null, prioridade: "normal", data_necessaria: null,
        status: "nova", solicitante_id: "u1", responsavel_compras_id: null, motivo_cancelamento: null,
        created_at: "2026-10-08T12:00:00Z", updated_at: "2026-10-08T12:00:00Z", area_m2: null, prazo_obra: null, extracao_id: null,
      },
    ],
    solicitacao_itens: [{ id: "i1", solicitacao_id: "sol-1", descricao: "Tinta acrílica fosca", quantidade: 2, unidade: "un", ambiente: null, referencia_projeto: null, observacao: null }],
    solicitacao_anexos: [],
    compras: [],
    solicitacao_eventos: [],
    cotacoes: [],
    profiles: [{ id: "u1", nome: "Pedro", email: "pedro@exemplo.com" }],
  };
  const erroDoBanco = (tabela: string, colunas: string, filtros: [string, unknown][]) => {
    if (state.bancoCompleto) return null;
    if (tabela === "cotacao_anexos") return { code: "PGRST205", message: "Could not find the table 'public.cotacao_anexos' in the schema cache" };
    if (tabela === "solicitacoes" && /prazo_compra|data_compra_efetiva/.test(colunas)) return { code: "42703", message: `column solicitacoes.${colunas} does not exist` };
    if (filtros.some(([c, v]) => c === "status" && v === "cronograma_confirmado"))
      return { code: "22P02", message: 'invalid input value for enum status_solicitacao: "cronograma_confirmado"' };
    return null;
  };
  const from = (tabela: string) => {
    let colunas = "*";
    let patch: unknown;
    const filtros: [string, unknown][] = [];
    const resultado = () => {
      const error = erroDoBanco(tabela, colunas, filtros);
      if (error) return { data: null, error };
      if (patch !== undefined) state.updates.push({ table: tabela, patch });
      const linhas = (tabelas[tabela] ?? []).filter((r) => filtros.every(([c, v]) => r[c] === v));
      return { data: linhas, error: null };
    };
    const q: Record<string, unknown> = {};
    const mesmo = () => q;
    Object.assign(q, {
      select: (c?: string) => {
        if (c && patch === undefined) colunas = c;
        return q;
      },
      eq: (c: string, v: unknown) => {
        filtros.push([c, v]);
        return q;
      },
      update: (p: unknown) => {
        patch = p;
        return q;
      },
      neq: mesmo, in: mesmo, order: mesmo, limit: mesmo, range: mesmo, is: mesmo, gte: mesmo, lte: mesmo,
      maybeSingle: () => {
        const r = resultado();
        return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
      },
      then: (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, err),
    });
    return q;
  };
  const canais: string[] = [];
  const canal: Record<string, unknown> = {};
  Object.assign(canal, { on: () => canal, subscribe: () => canal });
  const supabase = {
    from,
    channel: (nome: string) => {
      canais.push(nome);
      return canal;
    },
    removeChannel: () => Promise.resolve("ok"),
    storage: { from: () => ({ remove: () => Promise.resolve({ data: [], error: null }) }) },
  };
  return { state, supabase, canais };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: db.supabase,
  BUCKET: "projetos-executivos",
  SUPABASE_URL: "http://localhost",
  SUPABASE_PUBLISHABLE_KEY: "chave",
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: {}, nome: "Pedro", roles: ["admin"], loading: false }),
  useRole: () => ({ roles: ["admin"], isAdmin: true, isCompras: true, label: "Admin", loading: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opcoes: Record<string, unknown>) => ({ options: opcoes, useParams: () => ({ id: "sol-1" }) }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));

// Radix usa ResizeObserver, que o jsdom não tem.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import { Route as DetalheRoute } from "@/routes/_authenticated/solicitacoes.$id";
import { CompraDialog } from "@/components/CompraDialogs";

function renderDetalhe() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Detalhe = DetalheRoute.options.component as () => ReactNode;
  render(
    <QueryClientProvider client={qc}>
      <Detalhe />
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  db.state.bancoCompleto = false;
  db.state.updates.length = 0;
});

describe("Detalhe da solicitação", () => {
  it("abre sem quebrar quando os dados chegam (hooks antes dos returns)", async () => {
    renderDetalhe();
    expect(await screen.findByText("Tinta para a sala")).toBeInTheDocument();
    expect(screen.getAllByText("Tinta acrílica fosca").length).toBeGreaterThan(0); // tabela (desktop) + card (celular)
  });

  it("esconde o que o banco ainda não tem", async () => {
    const qc = renderDetalhe();
    await screen.findByText("Tinta para a sala");
    await waitFor(() => expect(qc.getQueryData(["recursos-banco"])).toBeDefined());
    expect(qc.getQueryData(["recursos-banco"])).toEqual({ prazoCompra: false, cronograma: false, anexosCotacao: false });
    expect(screen.queryByText("Prazo para efetivar compra")).not.toBeInTheDocument();
    expect(screen.queryByText("Cronograma confirmado")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Prazo para o item chegar")).toBeInTheDocument();
  });

  it("mostra os campos quando o banco tem os recursos", async () => {
    db.state.bancoCompleto = true;
    renderDetalhe();
    expect(await screen.findByText("Prazo para efetivar compra")).toBeInTheDocument();
    expect(screen.getByText("Cronograma confirmado")).toBeInTheDocument();
  });

  it("só salva o prazo quando a data está completa (antes salvava a cada tecla do ano)", async () => {
    renderDetalhe();
    const campo = await screen.findByLabelText("Prazo para o item chegar");
    for (const v of ["0002-10-20", "0020-10-20", "0202-10-20", "2026-10-20"]) fireEvent.change(campo, { target: { value: v } });
    await waitFor(() => expect(db.state.updates).toHaveLength(1), { timeout: 3000 });
    expect(db.state.updates[0]).toEqual({ table: "solicitacoes", patch: { data_necessaria: "2026-10-20" } });
  });

  it("usa um canal de tempo real novo a cada abertura", async () => {
    db.canais.length = 0;
    renderDetalhe();
    await screen.findByText("Tinta para a sala");
    renderDetalhe();
    await waitFor(() => expect(db.canais.filter((c) => c.startsWith("sol-sol-1")).length).toBe(2));
    const [a, b] = db.canais.filter((c) => c.startsWith("sol-sol-1"));
    expect(a).not.toBe(b);
  });
});

describe("Registrar compra", () => {
  it("não apaga o que foi digitado quando a tela atualiza", () => {
    const props = { open: true, onOpenChange: () => {}, solicitacaoId: "sol-1", enderecoObra: "Rua Z, 10", compra: null, onSaved: () => {} };
    const { rerender } = render(<CompraDialog {...props} sugestao={{ fornecedor: "Loja A" }} />);
    fireEvent.change(screen.getByDisplayValue("Loja A"), { target: { value: "Loja B" } });
    // Tempo real / voltar para a aba: a tela redesenha com uma sugestão "nova" (mesmo conteúdo).
    rerender(<CompraDialog {...props} sugestao={{ fornecedor: "Loja A" }} />);
    expect(screen.getByDisplayValue("Loja B")).toBeInTheDocument();
  });

  it("mostra a condição de pagamento vinda da cotação", () => {
    const props = { open: true, onOpenChange: () => {}, solicitacaoId: "sol-1", enderecoObra: null, compra: null, onSaved: () => {} };
    render(<CompraDialog {...props} sugestao={{ fornecedor: "Loja A", forma_pagamento: "30/60 boleto" }} />);
    expect(screen.getAllByText("30/60 boleto").length).toBeGreaterThan(0);
  });
});
