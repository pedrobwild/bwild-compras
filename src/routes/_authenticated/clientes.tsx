import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, FileUp, Pencil, Plus, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes / obras — Bwild Compras" },
      { name: "description", content: "Cadastro de clientes/obras das reformas." },
      { property: "og:title", content: "Clientes / obras — Bwild Compras" },
      { property: "og:description", content: "Cadastro de clientes/obras das reformas." },
    ],
  }),
  component: ClientesPage,
});

type ClienteObra = {
  id: string;
  nome: string;
  empreendimento: string | null;
  unidade: string | null;
  endereco: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
};

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o cliente").max(120),
  empreendimento: z.string().max(120).optional(),
  unidade: z.string().max(60).optional(),
  endereco: z.string().max(200).optional(),
  contato: z.string().max(120).optional(),
  telefone: z.string().max(30).optional(),
  email: z.string().email("E-mail inválido").max(120).optional().or(z.literal("")),
  observacao: z.string().max(500).optional(),
});
type Form = z.infer<typeof schema>;

const TABELA = "clientes_obras";
const tabelaFalta = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return x?.code === "42P01" || x?.code === "PGRST205" || /schema cache|does not exist/i.test(x?.message ?? "");
};
const nomeObra = (c: ClienteObra) => [c.empreendimento, c.unidade].filter(Boolean).join(" — ");

function ClientesPage() {
  const { isCompras } = useRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; item?: ClienteObra }>({ open: false });
  const [alvo, setAlvo] = useState<{ item: ClienteObra; file: File } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const alvoRef = useRef<ClienteObra | null>(null);

  const leitura = useLeituraProjeto(async (v: ValidacaoAplicada) => {
    const c = alvoRef.current;
    const file = alvo?.file;
    if (!c || !file || !user) return;
    const emp = v.obra.empreendimento.trim() || c.empreendimento || "";
    const un = v.obra.unidade.trim() || c.unidade || "";
    const avisos = v.avisos.length ? `Avisos do projeto:\n${v.avisos.map((a) => `- ${a}`).join("\n")}` : "";
    if (!v.itens.length) { toast.error("Nenhum item para criar."); return; }
    // Um card (solicitação) por item do projeto.
    const base = {
      cliente: v.obra.cliente.trim() || c.nome,
      empreendimento: emp || null,
      unidade: un || null,
      endereco_obra: v.obra.endereco.trim() || c.endereco || null,
      descricao: avisos || null,
      prioridade: "normal" as const,
      area_m2: v.area_m2,
      prazo_obra: v.prazo_obra,
      extracao_id: v.extracao_id,
    };
    const criadas: { id: string; codigo: string }[] = [];
    for (const i of v.itens) {
      const desc = i.descricao.trim();
      const { data: sol, error: eSol } = await supabase
        .from("solicitacoes")
        .insert({ ...base, titulo: `${desc} — ${emp || c.nome}${un ? ` ${un}` : ""}`.slice(0, 200) })
        .select("id, codigo")
        .single();
      if (eSol) { toast.error(`Parou em "${desc}": ` + eSol.message); throw eSol; }
      const { error: eIt } = await supabase.from("solicitacao_itens").insert({
        solicitacao_id: sol.id, descricao: desc.slice(0, 500), quantidade: i.quantidade,
        unidade: i.unidade || "un", ambiente: i.ambiente || null, referencia_projeto: i.referencia_projeto || null,
        observacao: i.observacao || null, categoria: i.categoria || null,
        especificacao: i.especificacao.trim() || null, link_referencia: i.link_referencia.trim() || null,
        origem: "projeto_executivo",
      });
      if (eIt) { toast.error(`Card ${sol.codigo} criado, mas o item falhou: ` + eIt.message); throw eIt; }
      criadas.push(sol);
    }
    await supabase.from("extracoes_projeto").update({ solicitacao_id: criadas[0].id }).eq("id", v.extracao_id);
    // PDF enviado uma vez e vinculado a todos os cards.
    try {
      await uploadAnexo(criadas[0].id, file, () => {});
      const { data: an } = await supabase.from("solicitacao_anexos").select("nome_arquivo, storage_path, tamanho_bytes, tipo_mime")
        .eq("solicitacao_id", criadas[0].id).order("created_at", { ascending: false }).limit(1).single();
      if (an && criadas.length > 1) {
        await supabase.from("solicitacao_anexos").insert(criadas.slice(1).map((s) => ({ ...an, solicitacao_id: s.id })));
      }
    } catch { toast.error("Cards criados, mas o PDF não foi anexado."); }
    toast.success(`${criadas.length} cards criados (1 item por card)`);
    setAlvo(null);
    navigate({ to: "/compras" });
  });

  const q = useQuery({
    queryKey: ["clientes"],
    retry: (n, e) => !tabelaFalta(e) && n < 2,
    queryFn: async () => {
      const { data, error } = await supabase.from(TABELA).select("*").order("nome");
      if (error) throw error;
      return (data ?? []) as ClienteObra[];
    },
  });

  const salvar = useMutation({
    mutationFn: async (v: Form & { id?: string }) => {
      const t = (s?: string) => s?.trim() || null;
      const payload = {
        nome: v.nome.trim(), empreendimento: t(v.empreendimento), unidade: t(v.unidade), endereco: t(v.endereco),
        contato: t(v.contato), telefone: t(v.telefone), email: t(v.email), observacao: t(v.observacao),
      };
      const { error } = v.id
        ? await supabase.from(TABELA).update(payload).eq("id", v.id)
        : await supabase.from(TABELA).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente/obra salvo"); setDialog({ open: false }); qc.invalidateQueries({ queryKey: ["clientes"] }); },
    onError: (e) => toast.error("Não foi possível salvar: " + ((e as { message?: string }).message ?? "erro desconhecido")),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABELA).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente/obra excluído"); qc.invalidateQueries({ queryKey: ["clientes"] }); },
    onError: (e) => toast.error("Não foi possível excluir: " + ((e as { message?: string }).message ?? "erro desconhecido")),
  });

  if (q.isLoading) return <LoadingList />;
  if (q.isError) {
    if (tabelaFalta(q.error)) {
      return (
        <div className="rounded-lg border border-status-cotacao/40 bg-status-cotacao/10 p-6 text-sm">
          <p className="font-semibold">Cadastro de clientes/obras ainda não ativado no banco</p>
          <p className="mt-2 text-muted-foreground">
            Rode o script <strong>clientes_obras.sql</strong> no SQL Editor do Supabase. Depois disso esta tela passa a funcionar.
          </p>
        </div>
      );
    }
    return <ErrorState message={"Não foi possível carregar os clientes/obras: " + ((q.error as { message?: string }).message ?? "")} />;
  }

  const lista = q.data ?? [];
  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? lista.filter((c) => [c.nome, c.empreendimento, c.unidade, c.endereco].some((x) => (x ?? "").toLowerCase().includes(termo)))
    : lista;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Clientes / obras</h1>
          <p className="text-sm text-muted-foreground">Cada cadastro é um cliente com a sua obra (empreendimento e unidade).</p>
        </div>
        {isCompras && (
          <Button onClick={() => setDialog({ open: true })}>
            <Plus className="mr-1 h-4 w-4" /> Novo cliente/obra
          </Button>
        )}
      </div>

      <Input placeholder="Buscar por cliente, empreendimento, unidade ou endereço…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" aria-label="Buscar cliente/obra" />

      {filtrados.length === 0 ? (
        <EmptyState
          title={termo ? "Nada encontrado — tente outra busca." : isCompras ? "Nenhum cliente/obra cadastrado — cadastre o primeiro." : "Nenhum cliente/obra cadastrado ainda."}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {filtrados.map((c) => (
            <div key={c.id} className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.nome}</p>
                {nomeObra(c) && <p className="text-sm">{nomeObra(c)}</p>}
                {c.endereco && <p className="text-xs text-muted-foreground">{c.endereco}</p>}
                {(c.contato || c.telefone || c.email) && (
                  <p className="mt-1 text-xs text-muted-foreground">{[c.contato, c.telefone, c.email].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              {isCompras && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" title="Anexar projeto executivo e gerar a lista de compras" aria-label={`Anexar projeto executivo de ${c.nome}`}
                    onClick={() => { alvoRef.current = c; fileRef.current?.click(); }}>
                    <FileUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title={`Editar ${c.nome}`} aria-label={`Editar ${c.nome}`} onClick={() => setDialog({ open: true, item: c })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title={`Excluir ${c.nome}`} aria-label={`Excluir ${c.nome}`}
                    onClick={() => { if (window.confirm(`Excluir "${c.nome}${nomeObra(c) ? ` — ${nomeObra(c)}` : ""}"?`)) excluir.mutate(c.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ClienteObraDialog
        open={dialog.open}
        item={dialog.item}
        onClose={() => setDialog({ open: false })}
        onSubmit={(v) => salvar.mutate({ ...v, id: dialog.item?.id })}
        saving={salvar.isPending}
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-label="Selecionar PDF do projeto executivo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !alvoRef.current) return;
          setAlvo({ item: alvoRef.current, file: f });
          void leitura.ler(f, f.name);
        }}
      />
      {leitura.element}
    </div>
  );
}

function ClienteObraDialog({ open, item, onClose, onSubmit, saving }: {
  open: boolean; item?: ClienteObra; onClose: () => void; onSubmit: (v: Form) => void; saving: boolean;
}) {
  const form = useForm<Form>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (!open) return;
    form.reset({
      nome: item?.nome ?? "", empreendimento: item?.empreendimento ?? "", unidade: item?.unidade ?? "",
      endereco: item?.endereco ?? "", contato: item?.contato ?? "", telefone: item?.telefone ?? "",
      email: item?.email ?? "", observacao: item?.observacao ?? "",
    });
  }, [open, item, form]);
  const e = form.formState.errors;
  const campo = (name: keyof Form, label: string, extra?: { type?: string; ph?: string }) => (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={extra?.type} placeholder={extra?.ph} {...form.register(name)} />
      {e[name] && <p className="text-xs text-destructive">{e[name]?.message}</p>}
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Editar cliente/obra" : "Novo cliente/obra"}</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {campo("nome", "Cliente *")}
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("empreendimento", "Empreendimento")}
            {campo("unidade", "Unidade")}
          </div>
          {campo("endereco", "Endereço da obra")}
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("contato", "Contato")}
            {campo("telefone", "Telefone")}
          </div>
          {campo("email", "E-mail", { type: "email" })}
          <div className="space-y-1">
            <Label htmlFor="observacao">Observação</Label>
            <Textarea id="observacao" rows={2} {...form.register("observacao")} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
