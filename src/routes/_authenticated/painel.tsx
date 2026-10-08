import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { addDays, endOfMonth, format, isSameMonth, parseISO, startOfMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { usePainel } from "@/hooks/usePainel";
import { useAuth } from "@/hooks/useAuth";
import { useRecursosBanco } from "@/hooks/useRecursos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, PrioridadeBadge } from "@/components/badges";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { fmtBRL, fmtDate, STATUS, statusDisponiveis, type PainelRow, type Status } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel de compras — Bwild Compras" },
      { name: "description", content: "Acompanhe todas as solicitações de compras das obras." },
      { property: "og:title", content: "Painel de compras — Bwild Compras" },
      { property: "og:description", content: "Acompanhe todas as solicitações de compras das obras." },
    ],
  }),
  component: Painel,
});

function Painel() {
  const { data, isLoading, error } = usePainel();
  const comprasResumo = useQuery({
    queryKey: ["painel", "compras-resumo"],
    queryFn: async () => {
      const hoje = new Date();
      const ini = format(startOfMonth(hoje), "yyyy-MM-dd");
      const fim = format(endOfMonth(hoje), "yyyy-MM-dd");
      const h = format(hoje, "yyyy-MM-dd");
      const h7 = format(addDays(hoje, 7), "yyyy-MM-dd");
      let custoMes = 0;
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("compras").select("id, valor_total")
          .gte("data_compra", ini).lte("data_compra", fim)
          .order("id").range(from, from + 999);
        if (error) throw error;
        custoMes += (data ?? []).reduce((a, c) => a + Number(c.valor_total ?? 0), 0);
        if (!data || data.length < 1000) break;
      }
      const { count, error } = await supabase
        .from("compras").select("id", { count: "exact", head: true })
        .gte("previsao_entrega", h).lte("previsao_entrega", h7).is("data_entrega_real", null);
      if (error) throw error;
      return { custoMes, entregas7: count ?? 0 };
    },
  });
  const { user } = useAuth();
  const recursos = useRecursosBanco();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [prio, setPrio] = useState("todas");
  const [cliente, setCliente] = useState("todos");
  const [minhas, setMinhas] = useState(false);

  const rows = useMemo(() => data ?? [], [data]);
  const now = new Date();
  const resumo = useMemo(() => {
    const inMonth = (d: string) => isSameMonth(parseISO(d), now);
    return {
      novas: rows.filter((r) => r.status === "nova").length,
      cotacao: rows.filter((r) => r.status === "em_cotacao").length,
      compradas: rows.filter((r) => r.status === "comprada" || r.status === "entregue_parcial").length,
      entreguesMes: rows.filter((r) => r.status === "entregue" && inMonth(r.updated_at)).length,
      atrasadas: rows.filter((r) => r.atrasada).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const clientes = useMemo(() => [...new Set(rows.map((r) => r.cliente).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (t && ![r.codigo, r.cliente, r.titulo, r.fornecedores, r.empreendimento].some((v) => v?.toLowerCase().includes(t))) return false;
        if (statuses.length && !statuses.includes(r.status)) return false;
        if (prio !== "todas" && r.prioridade !== prio) return false;
        if (cliente !== "todos" && r.cliente !== cliente) return false;
        if (minhas && r.solicitante_id !== user?.id && r.responsavel_compras_id !== user?.id) return false;
        return true;
      })
      .sort((a, b) => {
        const w = (r: PainelRow) => (r.atrasada ? 2 : 0) + (r.prioridade === "urgente" && !["entregue", "cancelada"].includes(r.status) ? 1 : 0);
        return w(b) - w(a) || b.created_at.localeCompare(a.created_at);
      });
  }, [rows, q, statuses, prio, cliente, minhas, user?.id]);

  const cards = [
    { label: "Novas", value: resumo.novas, cls: "text-status-nova" },
    { label: "Em cotação", value: resumo.cotacao, cls: "text-status-cotacao" },
    { label: "Aguardando entrega", value: resumo.compradas, cls: "text-status-comprada" },
    { label: "Entregues no mês", value: resumo.entreguesMes, cls: "text-status-entregue" },
    { label: "Atrasadas", value: resumo.atrasadas, cls: "text-destructive" },
    { label: "Entregas próx. 7 dias", value: comprasResumo.data ? comprasResumo.data.entregas7 : "—", cls: "text-status-parcial" },
    { label: "Custo do mês", value: comprasResumo.data ? fmtBRL(comprasResumo.data.custoMes) : "—", cls: "text-foreground" },
  ];

  const go = (id: string) => navigate({ to: "/solicitacoes/$id", params: { id } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel de compras</h1>
          <p className="text-sm text-muted-foreground">Todas as solicitações das obras, em tempo real.</p>
        </div>
        <Button asChild>
          <Link to="/solicitacoes/nova"><Plus className="h-4 w-4" /> Nova solicitação</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", c.cls)}>{isLoading ? "—" : c.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar código, cliente, título, fornecedor…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={prio} onValueChange={setPrio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as prioridades</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
          <Select value={cliente} onValueChange={setCliente}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os clientes/obras</SelectItem>
              {clientes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="minhas" checked={minhas} onCheckedChange={setMinhas} />
            <Label htmlFor="minhas" className="whitespace-nowrap">Somente minhas</Label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusDisponiveis(recursos.cronograma).map((s) => {
            const on = statuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => setStatuses(on ? statuses.filter((x) => x !== s) : [...statuses, s])}
                className={cn("rounded-full border px-3 py-1 text-xs transition-colors", on ? STATUS[s].cls + " font-medium" : "bg-background text-muted-foreground hover:bg-muted")}
              >
                {STATUS[s].label}
              </button>
            );
          })}
          {statuses.length > 0 && (
            <button onClick={() => setStatuses([])} className="px-2 text-xs text-muted-foreground underline">Limpar</button>
          )}
        </div>
      </div>

      {isLoading ? (
        <LoadingList />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhuma solicitação ainda — crie a primeira" action={<Button asChild size="sm"><Link to="/solicitacoes/nova">Nova solicitação</Link></Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma solicitação encontrada com esses filtros." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border bg-card lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente / Obra</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Necessário até</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fornecedor(es)</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead>Previsão</TableHead>
                  <TableHead>Local</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} onClick={() => go(r.id)} className={cn("cursor-pointer", r.atrasada && "bg-destructive/5 hover:bg-destructive/10")}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1">
                        {r.atrasada && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Atrasada" />}
                        {r.codigo}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{r.cliente}</p>
                      <p className="text-xs text-muted-foreground">{[r.empreendimento, r.unidade].filter(Boolean).join(" · ") || "—"}</p>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">{r.titulo}{r.via_projeto_executivo && <span className="ml-1.5 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">Projeto</span>}</TableCell>
                    <TableCell><PrioridadeBadge prioridade={r.prioridade} /></TableCell>
                    <TableCell className={cn(r.atrasada && "font-medium text-destructive")}>{fmtDate(r.data_necessaria)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm">{r.fornecedores || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.custo_total ? fmtBRL(r.custo_total) : "—"}</TableCell>
                    <TableCell>{fmtDate(r.proxima_entrega)}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-sm">{r.locais_entrega || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 lg:hidden">
            {filtered.map((r) => (
              <Link
                key={r.id}
                to="/solicitacoes/$id"
                params={{ id: r.id }}
                className={cn("block rounded-lg border bg-card p-4", r.atrasada && "border-destructive/50 bg-destructive/5")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{r.codigo}{r.atrasada && <span className="ml-2 text-destructive">• Atrasada</span>}</p>
                    <p className="truncate font-medium">{r.titulo}{r.via_projeto_executivo && <span className="ml-1.5 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">Projeto</span>}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.cliente}{r.empreendimento ? ` · ${r.empreendimento}` : ""}{r.unidade ? ` · ${r.unidade}` : ""}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <PrioridadeBadge prioridade={r.prioridade} />
                  <span>Até {fmtDate(r.data_necessaria)}</span>
                  {r.custo_total ? <span className="font-medium text-foreground">{fmtBRL(r.custo_total)}</span> : null}
                  {r.proxima_entrega && <span>Entrega {fmtDate(r.proxima_entrega)}</span>}
                  {r.fornecedores && <span className="truncate">{r.fornecedores}</span>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
