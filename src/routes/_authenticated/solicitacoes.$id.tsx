import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Download, ExternalLink, FileText, Hand, Plus, ShoppingCart, Trash2, Truck, Pencil, XCircle, MessageSquare, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PrioridadeBadge } from "@/components/badges";
import { ErrorState, EmptyState } from "@/components/States";
import { FileDropzone, type PendingFile } from "@/components/FileDropzone";
import { CompraDialog, RecebimentoDialog, type Compra } from "@/components/CompraDialogs";
import { signedUrl, uploadAnexo } from "@/lib/upload";
import { AMBIENTES, UNIDADES, STATUS, STATUS_KEYS, fmtBRL, fmtBytes, fmtDate, type Prioridade, type Status } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/solicitacoes/$id")({
  head: () => ({
    meta: [
      { title: "Solicitação — Bwild Compras" },
      { name: "description", content: "Detalhes, compras e linha do tempo da solicitação." },
      { property: "og:title", content: "Solicitação — Bwild Compras" },
      { property: "og:description", content: "Detalhes, compras e linha do tempo da solicitação." },
    ],
  }),
  component: Detalhe,
});

interface Solicitacao {
  id: string; codigo: string; cliente: string; empreendimento: string | null; unidade: string | null; endereco_obra: string | null;
  titulo: string; descricao: string | null; prioridade: Prioridade; data_necessaria: string | null; status: Status;
  solicitante_id: string; responsavel_compras_id: string | null; motivo_cancelamento: string | null; created_at: string;
}
interface Item { id: string; descricao: string; quantidade: number; unidade: string; ambiente: string | null; referencia_projeto: string | null; observacao: string | null }
interface Anexo { id: string; nome_arquivo: string; storage_path: string; tamanho_bytes: number | null; created_at: string }
interface Evento { id: string; tipo: string; descricao: string | null; usuario_id: string | null; created_at: string }

const STEPS: { key: Status; label: string }[] = [
  { key: "nova", label: "Nova" },
  { key: "em_cotacao", label: "Em cotação" },
  { key: "comprada", label: "Comprada" },
  { key: "entregue", label: "Entregue" },
];
const stepIndex = (s: Status) => (s === "entregue_parcial" ? 2.5 : STEPS.findIndex((x) => x.key === s));

function Detalhe() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { isCompras } = useRole();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["solicitacao", id],
    queryFn: async () => {
      const [s, it, an, co, ev] = await Promise.all([
        supabase.from("solicitacoes").select("*").eq("id", id).maybeSingle(),
        supabase.from("solicitacao_itens").select("*").eq("solicitacao_id", id).order("id"),
        supabase.from("solicitacao_anexos").select("*").eq("solicitacao_id", id).order("created_at"),
        supabase.from("compras").select("*").eq("solicitacao_id", id).order("data_compra"),
        supabase.from("solicitacao_eventos").select("*").eq("solicitacao_id", id).order("created_at"),
      ]);
      for (const r of [s, it, an, co, ev]) if (r.error) throw r.error;
      const sol = s.data as Solicitacao | null;
      const eventos = (ev.data ?? []) as Evento[];
      const ids = [...new Set([sol?.solicitante_id, sol?.responsavel_compras_id, ...eventos.map((e) => e.usuario_id)].filter(Boolean))] as string[];
      const nomes: Record<string, string> = {};
      if (ids.length) {
        const { data } = await supabase.from("profiles").select("id, nome, email").in("id", ids);
        for (const p of (data ?? []) as { id: string; nome: string | null; email: string | null }[]) nomes[p.id] = p.nome || p.email || "Usuário";
      }
      return { sol, itens: (it.data ?? []) as Item[], anexos: (an.data ?? []) as Anexo[], compras: (co.data ?? []) as Compra[], eventos, nomes };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`sol-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitacoes", filter: `id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "compras", filter: `solicitacao_id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "solicitacao_eventos", filter: `solicitacao_id=eq.${id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["solicitacao", id] });
    qc.invalidateQueries({ queryKey: ["painel"] });
  };

  const [compraOpen, setCompraOpen] = useState(false);
  const [editCompra, setEditCompra] = useState<Compra | null>(null);
  const [recCompra, setRecCompra] = useState<Compra | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  if (q.error) return <ErrorState message={(q.error as Error).message} />;
  const d = q.data!;
  if (!d.sol) return <EmptyState title="Solicitação não encontrada." action={<Button asChild size="sm"><Link to="/painel">Voltar ao painel</Link></Button>} />;
  const s = d.sol;
  const isOwnerEditable = s.solicitante_id === user?.id && s.status === "nova";
  const total = d.compras.reduce((a, c) => a + Number(c.valor_total ?? 0), 0);

  const update = async (patch: Partial<Solicitacao>, msg: string) => {
    const { error } = await supabase.from("solicitacoes").update(patch).eq("id", id);
    if (error) return toast.error("Não foi possível atualizar: " + error.message);
    toast.success(msg);
    refresh();
  };

  const idx = stepIndex(s.status);

  return (
    <div className="space-y-5">
      <Link to="/painel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Painel
      </Link>

      <div className="rounded-lg border bg-card p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{s.codigo}</p>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{s.titulo}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={s.status} />
              <PrioridadeBadge prioridade={s.prioridade} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isCompras && !s.responsavel_compras_id && s.status !== "cancelada" && (
              <Button onClick={() => update({ responsavel_compras_id: user!.id, status: s.status === "nova" ? "em_cotacao" : s.status }, "Demanda assumida")}>
                <Hand className="h-4 w-4" /> Assumir demanda
              </Button>
            )}
            {isCompras && s.status !== "cancelada" && (
              <Button variant={s.responsavel_compras_id ? "default" : "outline"} onClick={() => { setEditCompra(null); setCompraOpen(true); }}>
                <ShoppingCart className="h-4 w-4" /> Registrar compra
              </Button>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
          <Info label="Cliente" value={s.cliente} />
          <Info label="Empreendimento / Unidade" value={[s.empreendimento, s.unidade].filter(Boolean).join(" · ") || "—"} />
          <Info label="Solicitante" value={d.nomes[s.solicitante_id] ?? "—"} />
          <Info label="Necessário até" value={fmtDate(s.data_necessaria)} />
          <Info label="Responsável de compras" value={s.responsavel_compras_id ? d.nomes[s.responsavel_compras_id] ?? "—" : "Sem responsável"} />
          <Info label="Endereço da obra" value={s.endereco_obra || "—"} />
          <Info label="Aberta em" value={fmtDate(s.created_at)} />
          <Info label="Custo total" value={fmtBRL(total)} strong />
        </dl>
        {s.descricao && <p className="mt-4 whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">{s.descricao}</p>}
        {s.status === "cancelada" && s.motivo_cancelamento && (
          <p className="mt-4 rounded-md border border-border bg-muted p-3 text-sm"><strong>Motivo do cancelamento:</strong> {s.motivo_cancelamento}</p>
        )}

        {s.status !== "cancelada" && (
          <div className="mt-6">
            <div className="flex items-center">
              {STEPS.map((st, i) => {
                const done = idx >= i;
                return (
                  <div key={st.key} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1">
                      <div className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold", done ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background text-muted-foreground")}>
                        {done ? <Check className="h-4 w-4" /> : i + 1}
                      </div>
                      <span className={cn("text-[11px] md:text-xs", done ? "font-medium" : "text-muted-foreground")}>
                        {st.key === "entregue" && s.status === "entregue_parcial" ? "Parcial" : st.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && <div className={cn("mx-1 mb-5 h-0.5 flex-1", idx > i ? "bg-accent" : "bg-border")} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(isCompras || isOwnerEditable) && s.status !== "cancelada" && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
            {isCompras && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Alterar status</Label>
                <Select value={s.status} onValueChange={(v) => v === "cancelada" ? setCancelOpen(true) : update({ status: v as Status }, "Status atualizado")}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_KEYS.map((k) => <SelectItem key={k} value={k}>{STATUS[k].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4" /> Cancelar solicitação
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="itens">
        <TabsList className="grid w-full grid-cols-4 md:inline-flex md:w-auto">
          <TabsTrigger value="itens">Itens ({d.itens.length})</TabsTrigger>
          <TabsTrigger value="anexos">Anexos ({d.anexos.length})</TabsTrigger>
          <TabsTrigger value="compras">Compras ({d.compras.length})</TabsTrigger>
          <TabsTrigger value="timeline">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="itens"><ItensTab itens={d.itens} editable={isOwnerEditable} solicitacaoId={id} onChange={refresh} /></TabsContent>
        <TabsContent value="anexos"><AnexosTab anexos={d.anexos} solicitacaoId={id} onChange={refresh} /></TabsContent>
        <TabsContent value="compras">
          {d.compras.length === 0 ? (
            <EmptyState title="Nenhuma compra registrada ainda." />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {d.compras.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{c.fornecedor}</p>
                        {c.fornecedor_contato && <p className="text-xs text-muted-foreground">{c.fornecedor_contato}</p>}
                      </div>
                      <p className="text-lg font-semibold tabular-nums">{fmtBRL(c.valor_total)}</p>
                    </div>
                    {c.descricao_itens && <p className="mt-2 whitespace-pre-wrap text-sm">{c.descricao_itens}</p>}
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Info label="Pedido / NF" value={c.numero_pedido || "—"} />
                      <Info label="Pagamento" value={c.forma_pagamento || "—"} />
                      <Info label="Data da compra" value={fmtDate(c.data_compra)} />
                      <Info label="Previsão de entrega" value={fmtDate(c.previsao_entrega)} />
                      <Info label="Local" value={c.local_entrega || "—"} />
                      <Info label="Endereço" value={c.endereco_entrega || "—"} />
                    </dl>
                    {c.data_entrega_real ? (
                      <p className="mt-3 rounded-md bg-status-entregue/10 p-2 text-xs text-status-entregue">
                        <Truck className="mr-1 inline h-3.5 w-3.5" /> Entregue em {fmtDate(c.data_entrega_real)}{c.recebido_por ? ` · recebido por ${c.recebido_por}` : ""}
                      </p>
                    ) : null}
                    {c.observacao && <p className="mt-2 text-xs text-muted-foreground">{c.observacao}</p>}
                    {isCompras && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setEditCompra(c); setCompraOpen(true); }}><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                        <Button size="sm" variant={c.data_entrega_real ? "ghost" : "default"} onClick={() => setRecCompra(c)}><Truck className="h-3.5 w-3.5" /> {c.data_entrega_real ? "Ajustar recebimento" : "Confirmar recebimento"}</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end rounded-lg border bg-card p-4 text-sm">
                Custo total das compras: <strong className="ml-2 tabular-nums">{fmtBRL(total)}</strong>
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="timeline"><Timeline eventos={d.eventos} nomes={d.nomes} solicitacaoId={id} onChange={refresh} /></TabsContent>
      </Tabs>

      <CompraDialog
        open={compraOpen}
        onOpenChange={setCompraOpen}
        solicitacaoId={id}
        enderecoObra={s.endereco_obra}
        compra={editCompra}
        onSaved={refresh}
      />
      <RecebimentoDialog compra={recCompra} onOpenChange={(o) => !o && setRecCompra(null)} onSaved={refresh} />
      <CancelDialog open={cancelOpen} onOpenChange={setCancelOpen} onConfirm={(motivo) => { setCancelOpen(false); update({ status: "cancelada", motivo_cancelamento: motivo }, "Solicitação cancelada"); }} />
    </div>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("break-words", strong && "font-semibold tabular-nums")}>{value}</dd>
    </div>
  );
}

function CancelDialog({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (m: string) => void }) {
  const [motivo, setMotivo] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Cancelar solicitação</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>Motivo *</Label>
          <Textarea rows={3} value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button variant="destructive" onClick={() => motivo.trim() ? onConfirm(motivo.trim()) : toast.error("Informe o motivo")}>Cancelar solicitação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItensTab({ itens, editable, solicitacaoId, onChange }: { itens: Item[]; editable: boolean; solicitacaoId: string; onChange: () => void }) {
  const blank = { descricao: "", quantidade: "1", unidade: "un", ambiente: "", referencia_projeto: "", observacao: "" };
  const [novo, setNovo] = useState(blank);
  const add = async () => {
    const qtd = Number(novo.quantidade.replace(",", "."));
    if (!novo.descricao.trim()) return toast.error("Descreva o item");
    if (!(qtd > 0)) return toast.error("Quantidade inválida");
    const { error } = await supabase.from("solicitacao_itens").insert({
      solicitacao_id: solicitacaoId, descricao: novo.descricao.trim().slice(0, 500), quantidade: qtd, unidade: novo.unidade,
      ambiente: novo.ambiente || null, referencia_projeto: novo.referencia_projeto.trim() || null, observacao: novo.observacao.trim() || null,
    });
    if (error) return toast.error(error.message);
    setNovo(blank);
    onChange();
  };
  const del = async (itemId: string) => {
    if (itens.length <= 1) return toast.error("A solicitação precisa de pelo menos 1 item");
    const { error } = await supabase.from("solicitacao_itens").delete().eq("id", itemId);
    if (error) return toast.error(error.message);
    onChange();
  };

  return (
    <div className="space-y-3">
      {itens.length === 0 ? <EmptyState title="Nenhum item." /> : (
        <>
          <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Descrição</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Un.</TableHead>
                <TableHead>Ambiente</TableHead><TableHead>Referência</TableHead><TableHead>Obs.</TableHead>{editable && <TableHead />}
              </TableRow></TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.descricao}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(i.quantidade).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{i.unidade}</TableCell>
                    <TableCell>{i.ambiente || "—"}</TableCell>
                    <TableCell className="text-sm">{i.referencia_projeto || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{i.observacao || "—"}</TableCell>
                    {editable && <TableCell><button aria-label="Remover" onClick={() => del(i.id)} className="rounded p-1 hover:text-destructive"><Trash2 className="h-4 w-4" /></button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-2 md:hidden">
            {itens.map((i) => (
              <div key={i.id} className="rounded-lg border bg-card p-3">
                <div className="flex justify-between gap-2">
                  <p className="font-medium">{i.descricao}</p>
                  <span className="whitespace-nowrap text-sm tabular-nums">{Number(i.quantidade).toLocaleString("pt-BR")} {i.unidade}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{[i.ambiente, i.referencia_projeto, i.observacao].filter(Boolean).join(" · ") || "—"}</p>
                {editable && <button onClick={() => del(i.id)} className="mt-2 text-xs text-destructive">Remover</button>}
              </div>
            ))}
          </div>
        </>
      )}
      {editable && (
        <div className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-12">
          <Input className="md:col-span-4" placeholder="Descrição do novo item" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          <Input className="md:col-span-1" inputMode="decimal" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
          <Select value={novo.unidade} onValueChange={(v) => setNovo({ ...novo, unidade: v })}>
            <SelectTrigger className="md:col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>{UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={novo.ambiente || undefined} onValueChange={(v) => setNovo({ ...novo, ambiente: v })}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Ambiente" /></SelectTrigger>
            <SelectContent>{AMBIENTES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="md:col-span-3" placeholder="Folha do projeto" value={novo.referencia_projeto} onChange={(e) => setNovo({ ...novo, referencia_projeto: e.target.value })} />
          <Input className="md:col-span-9" placeholder="Observação" value={novo.observacao} onChange={(e) => setNovo({ ...novo, observacao: e.target.value })} />
          <Button className="md:col-span-3" onClick={add}><Plus className="h-4 w-4" /> Adicionar item</Button>
        </div>
      )}
    </div>
  );
}

function AnexosTab({ anexos, solicitacaoId, onChange }: { anexos: Anexo[]; solicitacaoId: string; onChange: () => void }) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const open = async (a: Anexo, download: boolean) => {
    try {
      const url = await signedUrl(a.storage_path, download ? a.nome_arquivo : undefined);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error("Não foi possível abrir o arquivo: " + (e as Error).message);
    }
  };
  const send = async () => {
    setBusy(true);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      try {
        await uploadAnexo(solicitacaoId, files[i].file, (p) => setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, progress: p } : f))));
        ok++;
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setBusy(false);
    setFiles([]);
    if (ok) toast.success(`${ok} arquivo(s) anexado(s)`);
    onChange();
  };
  return (
    <div className="space-y-4">
      {anexos.length === 0 ? <EmptyState title="Nenhum anexo. Anexe o projeto executivo abaixo." /> : (
        <ul className="divide-y rounded-lg border bg-card">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-3">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.nome_arquivo}</p>
                <p className="text-xs text-muted-foreground">{fmtBytes(a.tamanho_bytes)} · {fmtDate(a.created_at)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => open(a, false)}><ExternalLink className="h-4 w-4" /><span className="hidden sm:inline">Abrir</span></Button>
              <Button size="sm" variant="outline" onClick={() => open(a, true)}><Download className="h-4 w-4" /><span className="hidden sm:inline">Baixar</span></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Anexar mais arquivos</p>
        <FileDropzone files={files} onChange={setFiles} disabled={busy} />
        {files.length > 0 && <Button className="mt-3" onClick={send} disabled={busy}>{busy ? "Enviando…" : `Enviar ${files.length} arquivo(s)`}</Button>}
      </div>
    </div>
  );
}

function Timeline({ eventos, nomes, solicitacaoId, onChange }: { eventos: Evento[]; nomes: Record<string, string>; solicitacaoId: string; onChange: () => void }) {
  const { user } = useAuth();
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const t = txt.trim();
    if (!t) return;
    setBusy(true);
    const { error } = await supabase.from("solicitacao_eventos").insert({ solicitacao_id: solicitacaoId, tipo: "comentario", descricao: t.slice(0, 2000), usuario_id: user!.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setTxt("");
    onChange();
  };
  const dot: Record<string, string> = {
    criada: "bg-status-nova", status: "bg-status-cotacao", compra: "bg-status-comprada", entrega: "bg-status-entregue", comentario: "bg-accent",
  };
  return (
    <div className="space-y-4">
      {eventos.length === 0 ? <EmptyState title="Sem eventos ainda." /> : (
        <ol className="relative space-y-4 rounded-lg border bg-card p-4 pl-8">
          <span className="absolute bottom-6 left-[1.15rem] top-6 w-px bg-border" />
          {eventos.map((e) => (
            <li key={e.id} className="relative">
              <span className={cn("absolute -left-[1.05rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card", dot[e.tipo] ?? "bg-muted-foreground")} />
              <p className="text-xs text-muted-foreground">
                {fmtDate(e.created_at, "dd/MM/yyyy HH:mm")} · {e.usuario_id ? nomes[e.usuario_id] ?? "Usuário" : "Sistema"}
              </p>
              <p className={cn("text-sm", e.tipo === "comentario" && "mt-1 rounded-md bg-muted/60 p-2")}>
                {e.tipo === "comentario" && <MessageSquare className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />}
                {e.descricao}
              </p>
            </li>
          ))}
        </ol>
      )}
      <div className="space-y-2 rounded-lg border bg-card p-4">
        <Label>Adicionar comentário</Label>
        <Textarea rows={2} value={txt} maxLength={2000} onChange={(e) => setTxt(e.target.value)} placeholder="Escreva uma atualização para a equipe…" />
        <Button onClick={send} disabled={busy || !txt.trim()}>Comentar</Button>
      </div>
    </div>
  );
}
