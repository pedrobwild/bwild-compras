import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ResponsavelCompra } from "./ResponsavelCompra";

const banco = vi.hoisted(() => ({ filtro: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (tabela: string) => {
    const q = {
      select: () => q, order: () => q, range: () => q,
      in: (coluna: string, valores: string[]) => { banco.filtro(tabela, coluna, valores); return q; },
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null, data: tabela === "user_roles"
        ? [{ user_id: "compradora-2", role: "compras" }]
        : [{ id: "compradora-2", nome: "Compradora", email: null }] }).then(resolve),
    };
    return q;
  },
} }));

// Seletor nativo para exercitar a gravação sem depender dos eventos de ponteiro do Radix no jsdom.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: { children: ReactNode; value: string; onValueChange: (v: string) => void; disabled: boolean }) =>
    <select aria-label="responsavel" value={value} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

describe("Responsável pela compra", () => {
  it("salva o usuário selecionado, não o usuário que está atribuindo", async () => {
    const salvar = vi.fn().mockResolvedValue(true);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ResponsavelCompra valor={null} onSave={salvar} />
    </QueryClientProvider>);
    await waitFor(() => expect(screen.getByLabelText("responsavel")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("responsavel"), { target: { value: "compradora-2" } });
    await waitFor(() => expect(salvar).toHaveBeenCalledWith("compradora-2"));
    expect(banco.filtro).toHaveBeenCalledWith("user_roles", "role", ["compras", "admin"]);
  });
});