import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, ChevronDown, ChevronRight, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRole } from "@/hooks/useAuth";
import { uploadAnexo } from "@/lib/upload";
import { useLeituraProjeto, type ValidacaoAplicada } from "@/components/ValidacaoProjeto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes e obras — Bwild Compras" },
      { name: "description", content: "Cadastro de clientes e obras das reformas." },
      { property: "og:title", content: "Clientes e obras — Bwild Compras" },
      { property: "og:description", content: "Cadastro de clientes e obras das reformas." },
    ],
  }),
  component: ClientesPage,
});

type Cliente = {
  id: string;
  nome: string;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
};

type Obra = {
  id: string;
  cliente_id: string;
  empreendimento: string;
  unidade: string | null;
  endereco: string | null;
};

const clienteSchema = z.object({
  nome: z.string().min(2, "Informe o nome").max(120),
  contato: z.string().max(120).optional(),
  telefone: z.string().max(30).optional(),
  email: z.string().email("E-mail inválido").max(120).optional().or(z.literal("")),
  observacao: z.string().max(500).optional(),
});
type ClienteForm = z.infer<typeof clienteSchema>;

const obraSchema = z.object({
  empreendimento: z.string().min(2, "Informe o empreendimento").max(120),
  unidade: z.string().max(60).optional(),
  endereco: z.string().max(200).optional(),
});
type ObraForm = z.infer<typeof obraSchema>;

const isMissingTable = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "42P01";

function ClientesPage() {
  const { isCompras } = useRole();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [clienteDialog, setClienteDialog] = useState<{ open: boolean; cliente?: Cliente }>({ open: false });
  const [obraDialog, setObraDialog] = useState<{ open: boolean; clienteId?: string; obra?: Obra }>({ open: false });

  const clientesQ = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  const obrasQ = useQuery({
    queryKey: ["obras"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("*").order("empreendimento");
      if (error) throw error;
      return (data ?? []) as Obra[];
    },
    enabled: clientesQ.isSuccess,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: ["obras"] });
  };

  const salvarCliente = useMutation({
    mutationFn: async (v: ClienteForm & { id?: string }) => {
      const payload = {
        nome: v.nome.trim(),
        contato: v.contato?.trim() || null,
        telefone: v.telefone?.trim() || null,
        email: v.email?.trim() || null,
        observacao: v.observacao?.trim() || null,
      };
      const { error } = v.id
        ? await supabase.from("clientes").update(payload).eq("id", v.id)
        : await supabase.from("clientes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente salvo");
      setClienteDialog({ open: false });
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar o cliente"),
  });

  const excluirCliente = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente excluído");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir o cliente"),
  });

  const salvarObra = useMutation({
    mutationFn: async (v: ObraForm & { id?: string; cliente_id: string }) => {
      const payload = {
        cliente_id: v.cliente_id,
        empreendimento: v.empreendimento.trim(),
        unidade: v.unidade?.trim() || null,
        endereco: v.endereco?.trim() || null,
      };
      const { error } = v.id
        ? await supabase.from("obras").update(payload).eq("id", v.id)
        : await supabase.from("obras").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obra salva");
      setObraDialog({ open: false });
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar a obra"),
  });

  const excluirObra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obra excluída");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir a obra"),
  });

  if (clientesQ.isLoading) return <LoadingList />;
  if (clientesQ.isError) {
    if (isMissingTable(clientesQ.error)) {
      return (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">Cadastro de clientes ainda não ativado no banco</p>
          <p className="mt-2">
            Rode o script <code className="rounded bg-amber-100 px-1">clientes_obras.sql</code> no SQL Editor do
            Supabase para criar as tabelas de clientes e obras. Depois disso esta tela passa a funcionar.
          </p>
        </div>
      );
    }
    return <ErrorState message="Não foi possível carregar os clientes" />;
  }

  const clientes = clientesQ.data ?? [];
  const obras = obrasQ.data ?? [];
  const obrasPorCliente = new Map<string, Obra[]>();
  for (const o of obras) {
    const list = obrasPorCliente.get(o.cliente_id) ?? [];
    list.push(o);
    obrasPorCliente.set(o.cliente_id, list);
  }

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? clientes.filter(
        (c) =>
          c.nome.toLowerCase().includes(termo) ||
          (obrasPorCliente.get(c.id) ?? []).some(
            (o) =>
              o.empreendimento.toLowerCase().includes(termo) ||
              (o.unidade ?? "").toLowerCase().includes(termo),
          ),
      )
    : clientes;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Clientes e obras</h1>
          <p className="text-sm text-muted-foreground">Cadastro dos clientes e dos empreendimentos/unidades.</p>
        </div>
        {isCompras && (
          <Button onClick={() => setClienteDialog({ open: true })}>
            <Plus className="mr-1 h-4 w-4" /> Novo cliente
          </Button>
        )}
      </div>

      <Input
        placeholder="Buscar por cliente, empreendimento ou unidade…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-md"
        aria-label="Buscar cliente ou obra"
      />

      {filtrados.length === 0 ? (
        <EmptyState
          title={
            termo
              ? "Nenhum cliente encontrado — tente outra busca."
              : isCompras
                ? "Nenhum cliente cadastrado — cadastre o primeiro."
                : "Nenhum cliente cadastrado — aguarde o time de Compras cadastrar."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtrados.map((c) => {
            const lista = obrasPorCliente.get(c.id) ?? [];
            const aberto = abertos[c.id] ?? false;
            return (
              <div key={c.id} className="rounded-lg border bg-card">
                <div className="flex items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setAbertos((s) => ({ ...s, [c.id]: !aberto }))}
                    className="flex min-h-11 flex-1 items-center gap-2 text-left"
                    aria-label={aberto ? `Recolher obras de ${c.nome}` : `Ver obras de ${c.nome}`}
                    aria-expanded={aberto}
                  >
                    {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="font-medium">{c.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {lista.length} {lista.length === 1 ? "obra" : "obras"}
                    </span>
                  </button>
                  {isCompras && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={`Editar ${c.nome}`}
                        aria-label={`Editar ${c.nome}`}
                        onClick={() => setClienteDialog({ open: true, cliente: c })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={`Excluir ${c.nome}`}
                        aria-label={`Excluir ${c.nome}`}
                        onClick={() => {
                          if (window.confirm(`Excluir o cliente "${c.nome}" e todas as suas obras?`))
                            excluirCliente.mutate(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {(c.contato || c.telefone || c.email) && (
                  <p className="px-4 pb-2 text-xs text-muted-foreground">
                    {[c.contato, c.telefone, c.email].filter(Boolean).join(" · ")}
                  </p>
                )}

                {aberto && (
                  <div className="border-t px-4 py-3">
                    {lista.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma obra cadastrada.</p>
                    ) : (
                      <ul className="space-y-2">
                        {lista.map((o) => (
                          <li key={o.id} className="flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                            <div className="flex items-start gap-2">
                              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">
                                  {o.empreendimento}
                                  {o.unidade ? ` — ${o.unidade}` : ""}
                                </p>
                                {o.endereco && <p className="text-xs text-muted-foreground">{o.endereco}</p>}
                              </div>
                            </div>
                            {isCompras && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={`Editar obra ${o.empreendimento}`}
                                  aria-label={`Editar obra ${o.empreendimento}`}
                                  onClick={() => setObraDialog({ open: true, clienteId: c.id, obra: o })}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={`Excluir obra ${o.empreendimento}`}
                                  aria-label={`Excluir obra ${o.empreendimento}`}
                                  onClick={() => {
                                    if (window.confirm(`Excluir a obra "${o.empreendimento}${o.unidade ? ` — ${o.unidade}` : ""}"?`))
                                      excluirObra.mutate(o.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {isCompras && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setObraDialog({ open: true, clienteId: c.id })}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Nova obra
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ClienteDialog
        state={clienteDialog}
        onClose={() => setClienteDialog({ open: false })}
        onSave={(v) => salvarCliente.mutate(v)}
        saving={salvarCliente.isPending}
      />
      <ObraDialog
        state={obraDialog}
        onClose={() => setObraDialog({ open: false })}
        onSave={(v) => salvarObra.mutate(v)}
        saving={salvarObra.isPending}
      />
    </div>
  );
}

function ClienteDialog({
  state,
  onClose,
  onSave,
  saving,
}: {
  state: { open: boolean; cliente?: Cliente };
  onClose: () => void;
  onSave: (v: ClienteForm & { id?: string }) => void;
  saving: boolean;
}) {
  const form = useForm<ClienteForm>({
    resolver: zodResolver(clienteSchema),
    values: {
      nome: state.cliente?.nome ?? "",
      contato: state.cliente?.contato ?? "",
      telefone: state.cliente?.telefone ?? "",
      email: state.cliente?.email ?? "",
      observacao: state.cliente?.observacao ?? "",
    },
  });
  const err = form.formState.errors;

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.cliente ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={form.handleSubmit((v) => onSave({ ...v, id: state.cliente?.id }))}
        >
          <div>
            <Label htmlFor="cli-nome">Nome *</Label>
            <Input id="cli-nome" {...form.register("nome")} />
            {err.nome && <p className="mt-1 text-xs text-destructive">{err.nome.message}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cli-contato">Contato</Label>
              <Input id="cli-contato" {...form.register("contato")} />
            </div>
            <div>
              <Label htmlFor="cli-tel">Telefone</Label>
              <Input id="cli-tel" {...form.register("telefone")} />
            </div>
          </div>
          <div>
            <Label htmlFor="cli-email">E-mail</Label>
            <Input id="cli-email" type="email" {...form.register("email")} />
            {err.email && <p className="mt-1 text-xs text-destructive">{err.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="cli-obs">Observação</Label>
            <Textarea id="cli-obs" rows={2} {...form.register("observacao")} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ObraDialog({
  state,
  onClose,
  onSave,
  saving,
}: {
  state: { open: boolean; clienteId?: string; obra?: Obra };
  onClose: () => void;
  onSave: (v: ObraForm & { id?: string; cliente_id: string }) => void;
  saving: boolean;
}) {
  const form = useForm<ObraForm>({
    resolver: zodResolver(obraSchema),
    values: {
      empreendimento: state.obra?.empreendimento ?? "",
      unidade: state.obra?.unidade ?? "",
      endereco: state.obra?.endereco ?? "",
    },
  });
  const err = form.formState.errors;

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.obra ? "Editar obra" : "Nova obra"}</DialogTitle>
        </DialogHeader>
        <form
          className={cn("space-y-3")}
          onSubmit={form.handleSubmit((v) => {
            if (!state.clienteId) return;
            onSave({ ...v, id: state.obra?.id, cliente_id: state.clienteId });
          })}
        >
          <div>
            <Label htmlFor="obra-emp">Empreendimento *</Label>
            <Input id="obra-emp" {...form.register("empreendimento")} placeholder="Ex.: Ed. Horizonte" />
            {err.empreendimento && <p className="mt-1 text-xs text-destructive">{err.empreendimento.message}</p>}
          </div>
          <div>
            <Label htmlFor="obra-un">Unidade</Label>
            <Input id="obra-un" {...form.register("unidade")} placeholder="Ex.: Apto 1204" />
          </div>
          <div>
            <Label htmlFor="obra-end">Endereço da obra</Label>
            <Input id="obra-end" {...form.register("endereco")} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
