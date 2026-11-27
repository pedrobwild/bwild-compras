import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PagamentoDialog } from "@/components/PagamentoDialog";

const mocks = vi.hoisted(() => ({ consultar: vi.fn(), gravar: vi.fn(), registrar: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/pagamentos.functions", () => ({ consultarPagamentos: mocks.consultar, gravarPagamento: mocks.gravar, registrarBoleto: mocks.registrar }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) } } }));
vi.mock("@/lib/supabase-config", () => ({ BUCKET: "projetos-executivos" }));

const id = "00000000-0000-4000-8000-000000000001";
const onSaved = vi.fn();
const onClose = vi.fn();
const boleto = { id: "00000000-0000-4000-8000-000000000002", nome_arquivo: "boleto.pdf", storage_path: `${id}/pagamentos/boleto.pdf`, tamanho_bytes: 10, tipo_mime: "application/pdf" };
beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  mocks.consultar.mockResolvedValue([{ id, status: "aprovada", pagamento_link: null, pagamento_instrucoes: null, boletos: [], cotacao: null }]);
  mocks.gravar.mockResolvedValue({ ok: true, erro: null }); mocks.registrar.mockResolvedValue(boleto); mocks.upload.mockResolvedValue({ error: null }); mocks.remove.mockResolvedValue({ error: null });
});
async function abrir() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PagamentoDialog id={id} solicitar onClose={onClose} onSaved={onSaved} /></QueryClientProvider>);
  await screen.findByLabelText("Link de pagamento");
  await waitFor(() => expect(screen.getByRole("button", { name: "Solicitar pagamento" })).not.toBeDisabled());
}
async function salvar() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Solicitar pagamento" })); }); }

describe("Passagem para pagamento", () => {
  it("não muda a etapa sem link, instruções ou boleto", async () => {
    await abrir(); await salvar();
    expect(mocks.gravar).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
  });
  it("grava os dados e solicita pagamento sem alterar dados de produto", async () => {
    await abrir(); fireEvent.change(screen.getByLabelText("Link de pagamento"), { target: { value: "https://pagamento.example/pedido" } }); await salvar();
    expect(mocks.gravar).toHaveBeenCalledWith({ data: { id, link: "https://pagamento.example/pedido", instrucoes: "", solicitar: true, remover: [] } });
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it("mantém a etapa anterior quando o upload falha", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "rede" } });
    await abrir(); fireEvent.change(screen.getByLabelText("Boletos"), { target: { files: [new File(["pdf"], "boleto.pdf", { type: "application/pdf" })] } }); await salvar();
    expect(mocks.gravar).not.toHaveBeenCalled(); expect(onSaved).not.toHaveBeenCalled();
  });
  it("só solicita após o boleto ser enviado e registrado", async () => {
    await abrir(); fireEvent.change(screen.getByLabelText("Boletos"), { target: { files: [new File(["pdf"], "boleto.pdf", { type: "application/pdf" })] } }); await salvar();
    expect(mocks.upload).toHaveBeenCalledOnce(); expect(mocks.registrar).toHaveBeenCalledOnce(); expect(mocks.gravar).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.registrar.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.registrar.mock.invocationCallOrder[0]).toBeLessThan(mocks.gravar.mock.invocationCallOrder[0] ?? 0);
  });
  it("não confirma se o banco recusar a passagem", async () => {
    mocks.gravar.mockResolvedValue({ ok: false, erro: "A etapa mudou" }); await abrir();
    fireEvent.change(screen.getByLabelText("Instruções de pagamento"), { target: { value: "Pix pedido 123" } }); await salvar();
    expect(onSaved).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });
  it("cancelar não grava nem altera status", async () => {
    await abrir(); fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mocks.gravar).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledOnce();
  });
});