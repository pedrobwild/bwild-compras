import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { differenceInCalendarDays, isWithinInterval, parseISO, startOfDay, subDays } from "date-fns";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Calendar as CalendarIcon, UserX, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePainel } from "@/hooks/usePainel";
import { useRole } from "@/hooks/useAuth";
import { PrioridadeBadge } from "@/components/badges";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { fmtDate, STATUS, type PainelRow, type Status } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({
    meta: [
      { title: "Fila de Compras — Bwild Compras" },
      { name: "description", content: "Kanban das solicitações por etapa de compra." },
      { property: "og:title", content: "Fila de Compras — Bwild Compras" },
      { property: "og:description", content: "Kanban das solicitações por etapa de compra." },
    ],
  }),
  component: Fila,
});

const COLS: { key: Status; dot: string }[] = [
  { key: "nova", dot: "bg-status-nova" },
  { key: "em_cotacao", dot: "bg-status-cotacao" },
  { key: "aguardando_aprovacao", dot: "bg-status-aprovacao" },
  { key: "aprovada", dot: "bg-status-aprovada" },
  { key: "comprada", dot: "bg-status-comprada" },
  { key: "entregue_parcial", dot: "bg-status-parcial" },
  { key: "entregue", dot: "bg-status-entregue" },
];

function Fila() {
  const { isCompras, isAdmin, loading } = useRole();
  const { data, isLoading, error } = usePainel();
  const qc = useQueryClient();
  const [visao, setVisao] = useState<"status" | "cliente">("status");
  const [cliente, setCliente] = useState("todos");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [compraRange, setCompraRange] = useState<DateRange | undefined>();
  const [entregaRange, setEntregaRange] = useState<DateRange | undefined>();

  // Datas de compra/entrega vêm direto da tabela compras (a view não expõe data_compra)
  const { data: comprasDatas } = useQuery({
    queryKey: ["compras-datas-fila"],
    queryFn: async () => {
      const { data, error } = await supabase.from("compras").select("solicitacao_id, data_compra, previsao_entrega");
      if (error) throw error;
      return (data ?? []) as { solicitacao_id: string; data_compra: string | null; previsao_entrega: string | null }[];
    },
  });

  const moverPara = async (id: string, status: Status) => {
    const row = (data ?? []).find((r) => r.id === id);
    if (!row || row.status === status) return;
    if ((status === "aprovada" || row.status === "aguardando_aprovacao") && !isAdmin)
      return void toast.error("Somente o admin pode aprovar ou tirar uma solicitação da etapa Aprovação.");
    if (status === "aprovada" && row.status !== "aguardando_aprovacao")
      return void toast.error("Só é possível aprovar uma solicitação que está em Aprovação.");
    if (["comprada", "entregue_parcial", "entregue"].includes(status) && row.status !== "aprovada" && !["comprada", "entregue_parcial", "entregue"].includes(row.status))
      return void toast.error("A compra só pode ser efetivada depois de Aprovado. Abra a solicitação e use \"Efetivar pedido\".");
    const { error: err } = await supabase.from("solicitacoes").update({ status }).eq("id", id);
    if (err) {
      toast.error(`Não foi possível mover: ${err.message}`);
      return;
    }
    toast.success(`${row.codigo} movido para ${STATUS[status].label}`);
    qc.invalidateQueries({ queryKey: ["painel"] });
  };

  if (!loading && !isCompras) return <EmptyState title="Esta área é exclusiva da equipe de Compras." />;
  if (isLoading) return <LoadingList />;
  if (error) return <ErrorState message={(error as Error).message} />;

  const limite = subDays(new Date(), 30);
  const base = (data ?? []).filter((r) => r.status !== "cancelada" && (r.status !== "entregue" || parseISO(r.updated_at) >= limite));
  const clientes = Array.from(new Set(base.map((r) => r.cliente))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const comprasPorSolic = useMemo(() => {
    const map = new Map<string, { data_compra: string | null; previsao_entrega: string | null }[]>();
    (comprasDatas ?? []).forEach((c) => {
      const list = map.get(c.solicitacao_id) ?? [];
      list.push(c);
      map.set(c.solicitacao_id, list);
    });
    return map;
  }, [comprasDatas]);
  const bateNoPeriodo = (id: string, range: DateRange | undefined, campo: "data_compra" | "previsao_entrega") => {
    if (!range?.from) return true;
    const start = startOfDay(range.from);
    const end = startOfDay(range.to ?? range.from);
    const datas = comprasPorSolic.get(id) ?? [];
    return datas.some((c) => {
      const d = c[campo];
      if (!d) return false;
      const date = d.length === 10 ? parseISO(d + "T12:00:00") : parseISO(d);
      return isWithinInterval(date, { start, end });
    });
  };
  const rows = base
    .filter((r) => cliente === "todos" || r.cliente === cliente)
    .filter((r) => bateNoPeriodo(r.id, compraRange, "data_compra"))
    .filter((r) => bateNoPeriodo(r.id, entregaRange, "previsao_entrega"));
  const ordenar = (a: PainelRow, b: PainelRow) => Number(b.atrasada) - Number(a.atrasada) || Number(b.prioridade === "urgente") - Number(a.prioridade === "urgente") || a.created_at.localeCompare(b.created_at);
  const colunas = visao === "status"
    ? COLS.map((c) => ({ key: c.key, titulo: STATUS[c.key].label, dot: c.dot, list: rows.filter((r) => r.status === c.key).sort(ordenar) }))
    : Array.from(new Set(rows.map((r) => r.cliente))).sort((a, b) => a.localeCompare(b, "pt-BR")).map((cl) => ({ key: cl, titulo: cl, dot: "bg-accent", list: rows.filter((r) => r.cliente === cl).sort(ordenar) }));
  const semResp = rows.filter((r) => !r.responsavel_compras_id && r.status !== "entregue").length;
  const atrasadas = rows.filter((r) => r.atrasada).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fila de Compras</h1>
        <p className="text-sm text-muted-foreground">Entregues: últimos 30 dias.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-2 rounded-md border border-status-cotacao/40 bg-status-cotacao/10 px-3 py-1.5 text-sm"><UserX className="h-4 w-4 text-status-cotacao" /> {semResp} sem responsável</span>
        <span className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive"><AlertTriangle className="h-4 w-4" /> {atrasadas} atrasada(s)</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border bg-card p-1">
          {(["status", "cliente"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVisao(v)} className={cn("min-h-9 rounded px-3 text-sm font-medium", visao === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {v === "status" ? "Por status" : "Por cliente"}
            </button>
          ))}
        </div>
        <Select value={cliente} onValueChange={setCliente}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os clientes</SelectItem>
            {clientes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <RangePicker label="Data de compra" value={compraRange} onChange={setCompraRange} />
        <RangePicker label="Data de entrega" value={entregaRange} onChange={setEntregaRange} />
        {(compraRange || entregaRange) && (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-9 text-muted-foreground"
            onClick={() => { setCompraRange(undefined); setEntregaRange(undefined); }}
          >
            <X className="h-4 w-4" /> Limpar datas
          </Button>
        )}
      </div>
      {colunas.length === 0 && <EmptyState title="Nenhuma solicitação na fila." />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {colunas.map((c) => {
          const list = c.list;
          const dropAtivo = visao === "status";
          return (
            <div
              key={c.key}
              onDragOver={dropAtivo ? (e) => { e.preventDefault(); setOverCol(c.key); } : undefined}
              onDragLeave={dropAtivo ? () => setOverCol((o) => (o === c.key ? null : o)) : undefined}
              onDrop={dropAtivo ? (e) => { e.preventDefault(); setOverCol(null); if (dragId) moverPara(dragId, c.key as Status); setDragId(null); } : undefined}
              className={cn("flex flex-col rounded-lg bg-muted/60 p-3 transition-colors", dropAtivo && overCol === c.key && "ring-2 ring-accent bg-accent/10")}
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
                <h2 className="truncate text-sm font-semibold">{c.titulo}</h2>
                <span className="ml-auto text-xs text-muted-foreground">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Vazio</p>}
                {list.map((r) => (
                  <KCard key={r.id} r={r} porCliente={visao === "cliente"} draggable={dropAtivo} dragging={dragId === r.id} onDragStart={() => setDragId(r.id)} onDragEnd={() => { setDragId(null); setOverCol(null); }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KCard({ r, porCliente, draggable, dragging, onDragStart, onDragEnd }: { r: PainelRow; porCliente?: boolean; draggable?: boolean; dragging?: boolean; onDragStart?: () => void; onDragEnd?: () => void }) {
  const dias = differenceInCalendarDays(new Date(), parseISO(r.created_at));
  return (
    <Link
      to="/solicitacoes/$id"
      params={{ id: r.id }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn("block rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow-md", r.atrasada && "border-destructive/60", draggable && "cursor-grab active:cursor-grabbing", dragging && "opacity-40")}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{r.codigo}</span>
        <span className="text-muted-foreground">{dias}d em aberto</span>
      </div>
      <p className="mt-1 text-sm font-medium leading-snug">{r.titulo}</p>
      <p className="truncate text-xs text-muted-foreground">{porCliente ? `${STATUS[r.status].label}${r.empreendimento ? " · " + r.empreendimento : ""}` : r.cliente}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <PrioridadeBadge prioridade={r.prioridade} />
        {r.data_necessaria && <span className={cn("text-xs", r.atrasada ? "font-medium text-destructive" : "text-muted-foreground")}>até {fmtDate(r.data_necessaria)}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {!r.responsavel_compras_id && r.status !== "entregue" && <span className="rounded bg-status-cotacao/15 px-1.5 py-0.5 text-[11px] font-medium text-status-cotacao">Sem responsável</span>}
        {r.atrasada && <span className="rounded bg-destructive/12 px-1.5 py-0.5 text-[11px] font-medium text-destructive">Atrasada</span>}
        {r.responsavel_nome && <span className="text-[11px] text-muted-foreground">{r.responsavel_nome}</span>}
      </div>
    </Link>
  );
}
