import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LinkReferenciaItem } from "@/components/LinkReferenciaItem";

const db = vi.hoisted(() => ({
  update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(), from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));

const props = { itemId: "item-mari", solicitacaoId: "sol-mari", descricao: "Torneira", link: null, editavel: true, onSaved: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  const query = { update: db.update, eq: db.eq, select: db.select, single: db.single };
  db.from.mockReturnValue(query);
  db.update.mockReturnValue(query);
  db.eq.mockReturnValue(query);
  db.select.mockReturnValue(query);
  db.single.mockResolvedValue({ data: { id: props.itemId }, error: null });
});

async function editar(valor: string) {
  fireEvent.click(screen.getByRole("button", { name: /(?:Adicionar|Editar) link de Torneira/ }));
  fireEvent.change(screen.getByLabelText("Link de referência"), { target: { value: valor } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Salvar link" })); });
}

describe("Links de itens existentes", () => {
  it("adiciona o mesmo link de referência sem alterar outros campos", async () => {
    render(<LinkReferenciaItem {...props} />);
    await editar("  https://loja.example/pagamento  ");
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(db.from).toHaveBeenCalledWith("solicitacao_itens");
    expect(db.update).toHaveBeenCalledExactlyOnceWith({ link_referencia: "https://loja.example/pagamento" });
    expect(db.eq.mock.calls).toEqual([["id", "item-mari"], ["solicitacao_id", "sol-mari"]]);
  });

  it("substitui um link que já foi cadastrado", async () => {
    render(<LinkReferenciaItem {...props} link="https://loja.example/antigo" />);
    await editar("https://loja.example/novo");
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(db.update).toHaveBeenCalledWith({ link_referencia: "https://loja.example/novo" });
  });

  it("permite remover o link sem excluir o item", async () => {
    render(<LinkReferenciaItem {...props} link="https://loja.example/antigo" />);
    await editar("");
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    expect(db.update).toHaveBeenCalledWith({ link_referencia: null });
  });

  it("não grava links executáveis", async () => {
    render(<LinkReferenciaItem {...props} />);
    await editar("javascript:alert(1)");
    expect(db.update).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("mantém o formulário aberto e não confirma quando o banco recusa", async () => {
    db.single.mockResolvedValue({ data: null, error: { message: "Sem permissão" } });
    render(<LinkReferenciaItem {...props} />);
    await editar("https://loja.example/pagamento");
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Link de referência")).toHaveValue("https://loja.example/pagamento");
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("não oferece edição quando a solicitação não é editável", () => {
    render(<LinkReferenciaItem {...props} editavel={false} />);
    expect(screen.queryByRole("button", { name: "Adicionar link de Torneira" })).not.toBeInTheDocument();
    expect(db.update).not.toHaveBeenCalled();
  });
});