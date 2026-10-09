import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft, Download, ExternalLink, FileText, Hand, Plus, ShoppingCart, Split, Trash2, Truck, Pencil, XCircle, MessageSquare, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CotacoesTab } from "@/components/CotacoesTab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, PrioridadeBadge } from "@/components/badges";
import { ErrorState, EmptyState } from "@/components/States";
import { FileDropzone, type PendingFile } from "@/components/FileDropzone";
import { CompraDialog, RecebimentoDialog, type Compra } from "@/components/CompraDialogs";
import { abrirArquivo, signedUrl, uploadAnexo } from "@/lib/upload";
import { AMBIENTES, CATEGORIAS, UNIDADES, STATUS, statusDisponiveis, fmtBRL, fmtBytes, fmtDate, type Prioridade, type Status, diasAtrasoEntrega, fmtDias } from "@/lib/format";
import { cn } from "@/lib/utils";
import { nomeCanal } from "@/lib/realtime";
import { useRecursosBanco } from "@/hooks/useRecursos";
import { useLeituraProjeto, type ValidacaoAplicada } from "@/components/ValidacaoProjeto";
import { FileSearch, Send, ShieldCheck } from "lucide-react";

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
  titulo: string; descricao: string | null; prioridade: Prioridade; data_necessaria: string | null; prazo_compra?: string | null; data_compra_efetiva?: string | null; status: Status;
  solicitante_id: string; responsavel_compras_id: string | null; motivo_cancelamento: string | null; created_at: string;
  area_m2?: number | null; prazo_obra?: string | null; extracao_id?: string | null;
}
interface Item { id: string; descricao: string; quantidade: number; unidade: string; ambiente: string | null; referencia_projeto: string | null; observacao: string | null; categoria?: string | null; especificacao?: string | null; link_referencia?: string | null; origem?: string | null }
interface Anexo { id: string; nome_arquivo: string; storage_path: string; tamanho_bytes: number | null; tipo_mime?: string | null; created_at: string }
interface Evento { id: string; tipo: string; descricao: string | null; usuario_id: string | null; created_at: string }

const STEPS: { key: Status; label: string }[] = [
  { key: "nova", label: "Nova" },
  { key: "cronograma_confirmado", label: "Cronograma confirmado" },
  { key: "em_cotacao", label: "Em cotação" },
  { key: "aguardando_aprovacao", label: "Aprovação" },
  { key: "aprovada", label: "Aprovado" },
  { key: "comprada", label: "Comprada" },
  { key: "entregue", label: "Entregue" },
];
/** Posição na barra de progresso; "entregue parcial" fica entre Comprada e Entregue. */
const stepIndex = (passos: typeof STEPS, s: Status) =>
  s === "entregue_parcial" ? passos.findIndex((x) => x.key === "comprada") + 0.5 : passos.findIndex((x) => x.key === s);

function Detalhe() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const { isCompras, isAdmin } = useRole();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const recursos = useRecursosBanco();
  const [dividindo, setDividindo] = useState(false);

  const escolhidaQ = useQuery({
    queryKey: ["cotacoes", id, "escolhida"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cotacoes").select("fornecedor, fornecedor_contato, valor_total, condicao_pagamento, prazo_entrega_dias").eq("solicitacao_id", id).eq("escolhida", true).maybeSingle();
      if (error) return null;
      return data as { fornecedor: string; fornecedor_contato: string | null; valor_total: number | null; condicao_pagamento: string | null; prazo_entrega_dias: number | null } | null;
    },
  });

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
      .channel(nomeCanal(`sol-${id}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitacoes", filter: `id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "compras", filter: `solicitacao_id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "cotacoes", filter: `solicitacao_id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ["cotacoes", id] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitacao_eventos", filter: `solicitacao_id=eq.${id}` }, () => refresh())
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

  // Mesmo objeto entre renderizações: senão o formulário de compra era reiniciado a cada atualização da tela.
  const escolhida = escolhidaQ.data ?? null;
  const sugestao = useMemo(
    () =>
      escolhida
        ? ({ fornecedor: escolhida.fornecedor, fornecedor_contato: escolhida.fornecedor_contato, valor_total: escolhida.valor_total ?? undefined, forma_pagamento: escolhida.condicao_pagamento } as Partial<Compra>)
        : null,
    [escolhida],
  );

  // Todos os hooks ficam acima destes retornos: chamar hook depois de um return derrubava a tela
  // ("Rendered more hooks than during the previous render") na primeira vez que o detalhe abria.
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  if (q.error) return <ErrorState message={(q.error as Error).message} />;
  const d = q.data!;
  if (!d.sol) return <EmptyState title="Solicitação não encontrada." action={<Button asChild size="sm"><Link to="/painel">Voltar ao painel</Link></Button>} />;
  const s = d.sol;
  const isOwnerEditable = s.solicitante_id === user?.id && s.status === "nova";
  const podeStatus = (k: Status) => {
    if (k === s.status) return true;
    if (isAdmin) return true;
    if (k === "aprovada" || s.status === "aguardando_aprovacao") return false;
    if (["comprada", "entregue_parcial", "entregue"].includes(k)) return ["aprovada", "comprada", "entregue_parcial", "entregue"].includes(s.status);
    return true;
  };
  const total = d.compras.reduce((a, c) => a + Number(c.valor_total ?? 0), 0);
  // A coluna data_compra_efetiva não existe no banco: usa a data da primeira compra registrada.
  const compraRealizadaEm = s.data_compra_efetiva ?? (d.compras.map((c) => c.data_compra).filter(Boolean).sort()[0] || null);

  /** Grava na solicitação. Devolve false quando não salvou (erro ou sem permissão). */
  const update = async (patch: Partial<Solicitacao>, msg: string): Promise<boolean> => {
    const novoStatus = patch.status ?? s.status;
    const novaData = "data_necessaria" in patch ? patch.data_necessaria : s.data_necessaria;
    if (novoStatus === "cronograma_confirmado" && !novaData) {
      if (patch.status === "cronograma_confirmado") {
        toast.error("Preencha o prazo para o item chegar na obra antes de confirmar o cronograma.");
        return false;
      }
      patch = { ...patch, status: "nova" };
      msg += " — card voltou para Nova (sem prazo de chegada)";
    }
    const { data: salvas, error } = await supabase.from("solicitacoes").update(patch).eq("id", id).select("id");
    if (error) {
      toast.error("Não foi possível atualizar: " + error.message);
      return false;
    }
    // Sem permissão o banco não altera nada e também não devolve erro: não mostrar "salvo" à toa.
    if (!salvas?.length) {
      toast.error("Não foi possível atualizar: você não pode alterar esta solicitação nesta etapa.");
      refresh();
      return false;
    }
    toast.success(msg);
    refresh();
    return true;
  };

  const passos = recursos.cronograma ? STEPS : STEPS.filter((x) => x.key !== "cronograma_confirmado");
  const idx = stepIndex(passos, s.status);

  const excluirCard = async () => {
    if (!window.confirm(`Excluir o card ${s.codigo}? Itens e anexos serão removidos. Essa ação não pode ser desfeita.`)) return;
    const { data: excluidas, error } = await supabase.from("solicitacoes").delete().eq("id", id).select("id");
    if (error) return toast.error("Não foi possível excluir: " + error.message);
    // Sem permissão o banco não exclui nada e também não devolve erro.
    if (!excluidas?.length) return toast.error("Não foi possível excluir: somente o admin pode excluir cards.");
    toast.success(`Card ${s.codigo} excluído`);
    qc.invalidateQueries({ queryKey: ["painel"] });
    navigate({ to: "/compras" });
  };

  const dividir = async () => {
    if (!window.confirm(`Dividir ${s.codigo} em ${d.itens.length} cards (1 item por card)? O card original será ${isAdmin ? "excluído" : "cancelado"}.`)) return;
    setDividindo(true);
    const criadas: { id: string; codigo: string }[] = [];
    try {
      // Os cards novos mantêm a etapa, o responsável e os dados da obra do card original.
      const base = {
        cliente: s.cliente, empreendimento: s.empreendimento, unidade: s.unidade, endereco_obra: s.endereco_obra,
        descricao: s.descricao, prioridade: s.prioridade, data_necessaria: s.data_necessaria,
        status: s.status, responsavel_compras_id: s.responsavel_compras_id,
        area_m2: s.area_m2 ?? null, prazo_obra: s.prazo_obra ?? null, extracao_id: s.extracao_id ?? null,
        ...(recursos.prazoCompra ? { prazo_compra: s.prazo_compra ?? null } : {}),
      };
      for (const it of d.itens) {
        const { data: sol, error: eSol } = await supabase.from("solicitacoes")
          .insert({ ...base, titulo: `${it.descricao} — ${s.empreendimento || s.cliente}${s.unidade ? ` ${s.unidade}` : ""}`.slice(0, 200) })
          .select("id, codigo").single();
        if (eSol) throw eSol;
        criadas.push(sol as { id: string; codigo: string });
        const { error: eIt } = await supabase.from("solicitacao_itens").insert({
          solicitacao_id: sol.id, descricao: it.descricao, quantidade: it.quantidade, unidade: it.unidade,
          ambiente: it.ambiente, referencia_projeto: it.referencia_projeto, observacao: it.observacao,
          categoria: it.categoria ?? null, especificacao: it.especificacao ?? null,
          link_referencia: it.link_referencia ?? null, origem: it.origem ?? "projeto_executivo",
        });
        if (eIt) throw eIt;
      }
      let anexosCopiados = true;
      if (d.anexos.length) {
        const { error: eAn } = await supabase.from("solicitacao_anexos").insert(
          criadas.flatMap((c) => d.anexos.map((a) => ({ solicitacao_id: c.id, nome_arquivo: a.nome_arquivo, storage_path: a.storage_path, tamanho_bytes: a.tamanho_bytes, tipo_mime: a.tipo_mime ?? null }))),
        );
        if (eAn) {
          anexosCopiados = false;
          toast.error("Cards criados, mas os anexos não foram copiados — eles continuam no card original: " + eAn.message);
        }
      }
      const codigos = criadas.map((c) => c.codigo).join(", ");
      // Excluir o original apagaria os anexos dele: se a cópia falhou, ele é só cancelado.
      const { data: excluidas, error: eDel } = anexosCopiados
        ? await supabase.from("solicitacoes").delete().eq("id", id).select("id")
        : { data: [], error: null };
      if (!eDel && excluidas?.length) {
        toast.success(`${criadas.length} cards criados (1 item por card)`);
      } else {
        // Só o admin exclui cards. Para Compras, o original é cancelado para não ficar em dobro na fila.
        const { error: eCan } = await supabase.from("solicitacoes")
          .update({ status: "cancelada", motivo_cancelamento: `Dividido em ${criadas.length} cards: ${codigos}`.slice(0, 500) })
          .eq("id", id);
        if (eCan) toast.error(`Cards criados (${codigos}), mas o card original continua ativo: ${eCan.message}`);
        else toast.success(`${criadas.length} cards criados (1 item por card). O card original foi cancelado.`);
      }
      qc.invalidateQueries({ queryKey: ["painel"] });
      navigate({ to: "/compras" });
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "erro desconhecido";
      if (criadas.length) {
        toast.error(`Divisão interrompida: ${criadas.length} card(s) já criado(s) (${criadas.map((c) => c.codigo).join(", ")}) e o original continua ativo. ${msg}`);
        qc.invalidateQueries({ queryKey: ["painel"] });
      } else {
        toast.error("Não foi possível dividir: " + msg);
      }
    } finally {
      setDividindo(false);
    }
  };

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
            {isCompras && (s.status === "nova" || s.status === "em_cotacao") && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!escolhida) return void toast.error("Escolha um fornecedor na aba Cotações antes de enviar para aprovação.");
                  update({ status: "aguardando_aprovacao" }, `Enviado para aprovação (${escolhida.fornecedor})`);
                }}
              >
                <Send className="h-4 w-4" /> Enviar para aprovação
              </Button>
            )}
            {isAdmin && s.status === "aguardando_aprovacao" && (
              <>
                <Button onClick={() => update({ status: "aprovada" }, "Compra aprovada")}>
                  <ShieldCheck className="h-4 w-4" /> Aprovar
                </Button>
                <Button variant="outline" onClick={() => update({ status: "em_cotacao" }, "Devolvido para cotação")}>
                  Devolver para cotação
                </Button>
              </>
            )}
            {isCompras && s.status === "aprovada" && (
              <Button onClick={() => { setEditCompra(null); setCompraOpen(true); }}>
                <ShoppingCart className="h-4 w-4" /> Efetivar pedido
              </Button>
            )}
            {isCompras && ["comprada", "entregue_parcial", "entregue"].includes(s.status) && (
              <Button variant="outline" onClick={() => { setEditCompra(null); setCompraOpen(true); }}>
                <ShoppingCart className="h-4 w-4" /> Registrar outra compra
              </Button>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
          <Info label="Cliente" value={s.cliente} />
          <Info label="Empreendimento / Unidade" value={[s.empreendimento, s.unidade].filter(Boolean).join(" · ") || "—"} />
          <Info label="Solicitante" value={d.nomes[s.solicitante_id] ?? "—"} />
          {recursos.prazoCompra && (
            <PrazoInfo label="Prazo para efetivar compra" value={s.prazo_compra ?? null} editavel={isCompras || isOwnerEditable} onSave={(v) => update({ prazo_compra: v }, "Prazo de compra atualizado")} concluido={["comprada", "entregue_parcial", "entregue", "cancelada"].includes(s.status)} />
          )}
          <PrazoInfo label="Prazo para o item chegar" value={s.data_necessaria} editavel={isCompras || isOwnerEditable} onSave={(v) => update({ data_necessaria: v }, "Prazo de chegada atualizado")} concluido={["entregue", "cancelada"].includes(s.status)} />
          <Info label="Compra realizada em" value={fmtDate(compraRealizadaEm)} />
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
              {passos.map((st, i) => {
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
                    {i < passos.length - 1 && <div className={cn("mx-1 mb-5 h-0.5 flex-1", idx > i ? "bg-accent" : "bg-border")} />}
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
                  <SelectContent>{statusDisponiveis(recursos.cronograma, s.status).filter(podeStatus).map((k) => <SelectItem key={k} value={k}>{STATUS[k].label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {isCompras && d.itens.length > 1 && (s.status === "nova" || s.status === "em_cotacao") && (
              <Button variant="outline" size="sm" onClick={dividir} disabled={dividindo} title="Cria um card para cada item e exclui este card" aria-label="Dividir em um card por item">
                <Split className="h-4 w-4" /> {dividindo ? "Dividindo…" : `Dividir em ${d.itens.length} cards (1 item por card)`}
              </Button>
            )}
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setCancelOpen(true)}>
              <XCircle className="h-4 w-4" /> Cancelar solicitação
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" className="text-destructive" onClick={excluirCard} title="Excluir este card definitivamente" aria-label="Excluir card">
                <Trash2 className="h-4 w-4" /> Excluir card
              </Button>
            )}
          </div>
        )}
        {isAdmin && s.status === "cancelada" && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="outline" size="sm" className="text-destructive" onClick={excluirCard} title="Excluir este card definitivamente" aria-label="Excluir card">
              <Trash2 className="h-4 w-4" /> Excluir card
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="itens">
        <TabsList className="grid w-full grid-cols-5 md:inline-flex md:w-auto">
          <TabsTrigger value="itens">Itens ({d.itens.length})</TabsTrigger>
          <TabsTrigger value="anexos">Anexos ({d.anexos.length})</TabsTrigger>
          <TabsTrigger value="cotacoes">Cotações</TabsTrigger>
          <TabsTrigger value="compras">Compras ({d.compras.length})</TabsTrigger>
          <TabsTrigger value="timeline">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="itens"><ItensTab itens={d.itens} editable={isOwnerEditable} solicitacaoId={id} onChange={refresh} /></TabsContent>
        <TabsContent value="anexos"><AnexosTab anexos={d.anexos} solicitacaoId={id} onChange={refresh} podeImportar={(isCompras || isOwnerEditable) && s.status !== "cancelada"} /></TabsContent>
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
                      {diasAtrasoEntrega(c) > 0 && (
                        <div className="col-span-2 rounded-md bg-destructive/10 p-2 font-medium text-destructive">
                          {c.data_entrega_real ? `Entregue com ${fmtDias(diasAtrasoEntrega(c))} de atraso` : `Entrega atrasada há ${fmtDias(diasAtrasoEntrega(c))}`}
                        </div>
                      )}
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
        <TabsContent value="cotacoes"><CotacoesTab solicitacaoId={id} podeEditar={isCompras && s.status !== "cancelada"} /></TabsContent>
        <TabsContent value="timeline"><Timeline eventos={d.eventos} nomes={d.nomes} solicitacaoId={id} onChange={refresh} /></TabsContent>
      </Tabs>

      <CompraDialog
        open={compraOpen}
        onOpenChange={setCompraOpen}
        solicitacaoId={id}
        enderecoObra={s.endereco_obra}
        compra={editCompra}
        sugestao={sugestao}
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

  const gm = new Map<string, Item[]>();
  for (const i of itens) { const c = i.categoria || "Sem categoria"; gm.set(c, [...(gm.get(c) ?? []), i]); }
  const ordem = (c: string) => (c === "Sem categoria" ? 999 : CATEGORIAS.indexOf(c));
  const grupos = [...gm.entries()].sort((a, b) => ordem(a[0]) - ordem(b[0]));
  return (
    <div className="space-y-3">
      {itens.length === 0 ? <EmptyState title="Nenhum item." /> : (
        <>
          {grupos.map(([cat, list]) => (
            <div key={cat} className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-sm font-semibold">{cat}</h3>
                <span className="text-xs text-muted-foreground">{list.length} {list.length === 1 ? "item" : "itens"}</span>
              </div>
              <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Descrição</TableHead><TableHead>Especificação</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead>Un.</TableHead>
                    <TableHead>Ambiente</TableHead><TableHead>Referência</TableHead><TableHead>Obs.</TableHead>{editable && <TableHead />}
                  </TableRow></TableHeader>
                  <TableBody>
                    {list.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.descricao}<OrigemBadge i={i} /></TableCell>
                        <TableCell className="max-w-[260px] text-sm"><Espec i={i} /></TableCell>
                        <TableCell className="text-right tabular-nums">{i.quantidade != null ? Number(i.quantidade).toLocaleString("pt-BR") : "—"}</TableCell>
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
                {list.map((i) => (
                  <div key={i.id} className="rounded-lg border bg-card p-3">
                    <div className="flex justify-between gap-2">
                      <p className="font-medium">{i.descricao}<OrigemBadge i={i} /></p>
                      <span className="whitespace-nowrap text-sm tabular-nums">{i.quantidade != null ? Number(i.quantidade).toLocaleString("pt-BR") : "—"} {i.unidade}</span>
                    </div>
                    {(i.especificacao || i.link_referencia) && <div className="mt-1 text-sm"><Espec i={i} /></div>}
                    <p className="mt-1 text-xs text-muted-foreground">{[i.ambiente, i.referencia_projeto, i.observacao].filter(Boolean).join(" · ") || "—"}</p>
                    {editable && <button onClick={() => del(i.id)} className="mt-2 min-h-9 text-xs text-destructive">Remover</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
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

function OrigemBadge({ i }: { i: Item }) {
  return i.origem === "projeto_executivo" ? <span className="ml-1.5 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">do projeto</span> : null;
}
function Espec({ i }: { i: Item }) {
  if (!i.especificacao && !i.link_referencia) return <>—</>;
  return (
    <span className="whitespace-pre-wrap break-words">
      {i.especificacao}
      {i.link_referencia && /^https?:\/\//i.test(i.link_referencia) && (
        <a href={i.link_referencia} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"><ExternalLink className="h-3 w-3" /> link</a>
      )}
    </span>
  );
}

function AnexosTab({ anexos, solicitacaoId, onChange, podeImportar }: { anexos: Anexo[]; solicitacaoId: string; onChange: () => void; podeImportar: boolean }) {
  const { user } = useAuth();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const leitura = useLeituraProjeto(async (v: ValidacaoAplicada) => {
    const { error } = await supabase.from("solicitacao_itens").insert(v.itens.map((i) => ({
      solicitacao_id: solicitacaoId, descricao: i.descricao.trim().slice(0, 500), quantidade: i.quantidade, unidade: i.unidade || "un",
      ambiente: i.ambiente || null, referencia_projeto: i.referencia_projeto || null, observacao: i.observacao || null,
      categoria: i.categoria || null, especificacao: i.especificacao.trim() || null, link_referencia: i.link_referencia.trim() || null, origem: "projeto_executivo",
    })));
    if (error) { toast.error("Não foi possível importar: " + error.message); throw error; }
    await supabase.from("extracoes_projeto").update({ solicitacao_id: solicitacaoId }).eq("id", v.extracao_id);
    await supabase.from("solicitacao_eventos").insert({ solicitacao_id: solicitacaoId, tipo: "comentario", descricao: `Itens importados do projeto executivo: ${v.itens.length} itens`, usuario_id: user!.id });
    toast.success(`${v.itens.length} itens importados`);
    onChange();
  }, { exigirQuantidade: true }); // os itens vão direto para o banco, onde a quantidade é obrigatória
  const importar = async (a: Anexo) => {
    try {
      const url = await signedUrl(a.storage_path);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("falha ao baixar o arquivo");
      await leitura.ler(await resp.blob(), a.nome_arquivo);
    } catch (e) {
      toast.error("Não foi possível baixar o PDF: " + (e as Error).message);
    }
  };
  const [busy, setBusy] = useState(false);
  const open = async (a: Anexo, download: boolean) => {
    try {
      await abrirArquivo(a.storage_path, download ? a.nome_arquivo : undefined);
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
              {podeImportar && /\.pdf$/i.test(a.nome_arquivo) && (
                <Button size="sm" variant="outline" disabled={leitura.ocupado} onClick={() => importar(a)}><FileSearch className="h-4 w-4" /><span className="hidden sm:inline">Importar itens deste projeto</span></Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => open(a, false)}><ExternalLink className="h-4 w-4" /><span className="hidden sm:inline">Abrir</span></Button>
              <Button size="sm" variant="outline" onClick={() => open(a, true)}><Download className="h-4 w-4" /><span className="hidden sm:inline">Baixar</span></Button>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Anexar mais arquivos</p>
        <FileDropzone files={files} onChange={setFiles} disabled={busy} />
        {leitura.element}
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

/** Data completa com ano de 4 dígitos (enquanto o ano é digitado o campo passa por 0002, 0020, 0202…). */
const dataCompleta = (v: string) => /^(19|20)\d{2}-\d{2}-\d{2}$/.test(v);

function PrazoInfo({ label, value, editavel, onSave, concluido = false }: { label: string; value: string | null; editavel: boolean; onSave: (v: string | null) => Promise<boolean>; concluido?: boolean }) {
  const [v, setV] = useState(value ?? "");
  const enviado = useRef(value ?? ""); // o que o banco tem
  const editando = useRef(false); // a pessoa mudou o campo e ainda não salvou
  const pendente = useRef<string | null>(null); // valor esperando o debounce
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Acompanha o valor do banco (tempo real, outro usuário), sem atropelar o que está sendo digitado.
  useEffect(() => {
    enviado.current = value ?? "";
    if (!editando.current) setV(value ?? "");
  }, [value]);
  const salvar = async (novo: string) => {
    clearTimeout(timer.current);
    pendente.current = null;
    if (novo && !dataCompleta(novo)) return;
    editando.current = false;
    if (novo === enviado.current) return;
    enviado.current = novo;
    if (!(await onSave(novo || null))) {
      enviado.current = value ?? "";
      setV(value ?? "");
    }
  };
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;
  // Saiu da tela logo depois de escolher a data: salva em vez de descartar.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pendente.current !== null) void salvarRef.current(pendente.current);
    },
    [],
  );
  const hojeStr = format(new Date(), "yyyy-MM-dd");
  const atrasado = !!value && value < hojeStr && !concluido;
  const diasVencido = atrasado && value ? diasAtrasoEntrega({ previsao_entrega: value, data_entrega_real: null }, hojeStr) : 0;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {editavel ? (
        <dd className="mt-1">
          <Input
            type="date"
            className={cn("h-9", !v && "border-destructive/60 text-destructive")}
            value={v}
            aria-label={label}
            title={v ? undefined : "Preencher"}
            onChange={(e) => {
              // Antes salvava a cada tecla (inclusive anos incompletos). Agora espera a data ficar completa.
              const novo = e.target.value;
              setV(novo);
              editando.current = true;
              clearTimeout(timer.current);
              pendente.current = null;
              // Data pela metade (um campo apagado): o navegador informa "" — não é "limpar a data".
              if (e.target.validity.badInput) return;
              if (!novo || dataCompleta(novo)) {
                pendente.current = novo;
                timer.current = setTimeout(() => void salvarRef.current(novo), 800);
              }
            }}
            onBlur={(e) => {
              if (e.target.validity.badInput) {
                // Saiu com a data pela metade: volta para a que está salva.
                editando.current = false;
                setV(enviado.current);
                return;
              }
              if (editando.current) void salvar(e.target.value);
            }}
          />
        </dd>
      ) : (
        <dd className={cn("font-medium", !value && "text-destructive")}>
          {value ? fmtDate(value) : "Preencher"}
        </dd>
      )}
      {atrasado && diasVencido > 0 && (
        <p className="mt-1 text-xs font-medium text-destructive">Vencido há {fmtDias(diasVencido)}</p>
      )}
    </div>
  );
}
