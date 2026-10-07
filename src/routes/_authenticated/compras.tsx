import { createFileRoute, Link } from "@tanstack/react-router";
import { differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { AlertTriangle, UserX } from "lucide-react";
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
  { key: "comprada", dot: "bg-status-comprada" },
  { key: "entregue_parcial", dot: "bg-status-parcial" },
  { key: "entregue", dot: "bg-status-entregue" },
];

function Fila() {
  const { isCompras, loading } = useRole();
  const { data, isLoading, error } = usePainel();

  if (!loading && !isCompras) return <EmptyState title="Esta área é exclusiva da equipe de Compras." />;
  if (isLoading) return <LoadingList />;
  if (error) return <ErrorState message={(error as Error).message} />;

  const limite = subDays(new Date(), 30);
  const rows = (data ?? []).filter((r) => r.status !== "cancelada" && (r.status !== "entregue" || parseISO(r.updated_at) >= limite));
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLS.map((c) => {
          const list = rows
            .filter((r) => r.status === c.key)
            .sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || Number(b.prioridade === "urgente") - Number(a.prioridade === "urgente") || a.created_at.localeCompare(b.created_at));
          return (
            <div key={c.key} className="flex flex-col rounded-lg bg-muted/60 p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={cn("h-2.5 w-2.5 rounded-full", c.dot)} />
                <h2 className="text-sm font-semibold">{STATUS[c.key].label}</h2>
                <span className="ml-auto text-xs text-muted-foreground">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">Vazio</p>}
                {list.map((r) => <KCard key={r.id} r={r} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KCard({ r }: { r: PainelRow }) {
  const dias = differenceInCalendarDays(new Date(), parseISO(r.created_at));
  return (
    <Link
      to="/solicitacoes/$id"
      params={{ id: r.id }}
      className={cn("block rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow-md", r.atrasada && "border-destructive/60")}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{r.codigo}</span>
        <span className="text-muted-foreground">{dias}d em aberto</span>
      </div>
      <p className="mt-1 text-sm font-medium leading-snug">{r.titulo}</p>
      <p className="truncate text-xs text-muted-foreground">{r.cliente}</p>
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
