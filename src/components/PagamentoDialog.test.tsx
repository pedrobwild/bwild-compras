import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PagamentoDialog } from "@/components/PagamentoDialog";

const mocks = vi.hoisted(() => ({ consultar: vi.fn(), gravar: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/pagamentos.functions", () => ({ consultarPagamentos: mocks.consultar, gravarPagamento: mocks.gravar }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) } } }));
vi.mock("@/lib/supabase-config", () => ({ BUCKET: "projetos-executivos" }));
const id = "00000000-0000-4000-8000-000000000001";
const onSaved = vi.fn(); const onClose = vi.fn();
const updated_at = "2026-11-27T12:00:00Z";
beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  mocks.consultar.mockResolvedValue([{ id, status: "aprovada", updated_at, pagamentos: [], itens: [] }]);
  mocks.gravar.mockResolvedValue({ ok: true, erro: null }); mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
});
async function abrir(solicitar = true) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PagamentoDialog id={id} solicitar={solicitar} onClose={onClose} onSaved={onSaved} /></QueryClientProvider>);
  await screen.findByLabelText("Link de pagamento");
  await waitFor(() => expect(screen.getByRole("button", { name: solicitar ? "Solicitar pagamento" : "Salvar pagamentos" })).not.toBeDisabled());
}
async function salvar() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Solicitar pagamento" })); }); }
function loja() { fireEvent.change(screen.getByLabelText("Onde foi comprado *"), { target: { value: "Loja A" } }); }

describe("Passagem para pagamentos múltiplos", () => {
  it("não muda a etapa sem meio válido", async () => { await abrir(); loja(); await salvar(); expect(mocks.gravar).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled(); });
  it("salva a lista sem alterar dados do produto", async () => {
    await abrir(); loja(); fireEvent.change(screen.getByLabelText("Link de pagamento"), { target: { value: "https://pagamento.example/pedido" } }); await salvar();
    expect(mocks.gravar).toHaveBeenCalledWith({ data: { id, solicitar: true, versao: updated_at, pagamentos: [expect.objectContaining({ onde_comprado: "Loja A", valor: null, link: "https://pagamento.example/pedido", codigo: "", observacao: "", itens: [], boletos: [] })] } });
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it("salva dois pagamentos na mesma solicitação", async () => {
    await abrir(); loja(); fireEvent.change(screen.getByLabelText("Código Pix ou linha digitável"), { target: { value: "pix-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar pagamento" }));
    const locais = screen.getAllByLabelText("Onde foi comprado *"); const codigos = screen.getAllByLabelText("Código Pix ou linha digitável");
    const local = locais[1]; const codigo = codigos[1]; if (!local || !codigo) throw new Error("Segundo pagamento ausente");
    fireEvent.change(local, { target: { value: "Loja B" } }); fireEvent.change(codigo, { target: { value: "pix-2" } }); await salvar();
    expect(mocks.gravar.mock.calls[0]?.[0].data.pagamentos).toHaveLength(2);
    expect(mocks.gravar.mock.calls[0]?.[0].data.pagamentos.map((p: { onde_comprado: string }) => p.onde_comprado)).toEqual(["Loja A", "Loja B"]);
  });
  it("não muda a etapa quando o upload falha", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "rede" } }); await abrir(); loja();
    fireEvent.change(screen.getByLabelText("Boletos"), { target: { files: [new File(["pdf"], "boleto.pdf", { type: "application/pdf" })] } }); await salvar();
    expect(mocks.gravar).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
  });
  it("envia o boleto antes de registrar tudo na transação", async () => {
    await abrir(); loja(); fireEvent.change(screen.getByLabelText("Boletos"), { target: { files: [new File(["pdf"], "boleto.pdf", { type: "application/pdf" })] } }); await salvar();
    expect(mocks.upload).toHaveBeenCalledOnce(); expect(mocks.gravar).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.gravar.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.gravar.mock.calls[0]?.[0].data.pagamentos[0].boletos[0].nome_arquivo).toBe("boleto.pdf");
  });
  it("impede remover o último pagamento durante a etapa", async () => { await abrir(false); expect(screen.getByRole("button", { name: "Remover pagamento 1" })).toBeDisabled(); });
  it("permite salvar mesmo com itens sem vínculo", async () => {
    mocks.consultar.mockResolvedValue([{ id, status: "aprovada", updated_at, pagamentos: [], itens: [{ id: "00000000-0000-4000-8000-000000000010", descricao: "Tinta", quantidade: 1, unidade: "un", pagamento_id: null }] }]);
    await abrir(); loja(); fireEvent.change(screen.getByLabelText("Código Pix ou linha digitável"), { target: { value: "pix" } }); await salvar(); expect(onSaved).toHaveBeenCalledOnce();
  });
  it("não confirma se o banco recusar", async () => { mocks.gravar.mockResolvedValue({ ok: false, erro: "A etapa mudou" }); await abrir(); loja(); fireEvent.change(screen.getByLabelText("Código Pix ou linha digitável"), { target: { value: "pix" } }); await salvar(); expect(onSaved).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled(); });
  it("cancelar não grava nem altera status", async () => { await abrir(); fireEvent.click(screen.getByRole("button", { name: "Cancelar" })); expect(mocks.gravar).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledOnce(); });
});
