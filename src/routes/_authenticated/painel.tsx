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
import { fmtBRL, fmtDate, origemPrevista, STATUS, statusDisponiveis, textoAtraso, textoVencimento, type OrigemInfo, type PainelRow, type Status } from "@/lib/format";
import { GastoSemanal } from "@/components/GastoSemanal";
import { agruparPorSemana, COLUNAS_SEMANA, inicioSemana, previstoNoMes, type ColunaSemana, type CompraGasto } from "@/lib/gasto-semanal";
import { hojeSP } from "@/lib/prazos";
import { cn } from "@/lib/utils";
import { OrdenacaoSelect } from "@/components/OrdenacaoSelect";
import { ordenarRegistros, type Ordenacao } from "@/lib/ordenacao";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel de compras — Bwild Compras" },
      { name: "description", content: "Acompanhe todas as solicitações de compras das obras." },
      { property: "og:title", content: "Painel de compras — Bwild Compras" },
      { property: "og:description", content: "Acompanhe todas as solicitações de compras das obras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
      const seg = inicioSemana(hojeSP());
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
      // Compras desta semana em diante, para o bloco "Gasto por semana".
      const comprasSemana: CompraGasto[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("compras").select("id, solicitacao_id, valor_total, data_compra")
          .gte("data_compra", seg)
          .order("id").range(from, from + 999);
        if (error) throw error;
        comprasSemana.push(...((data ?? []) as CompraGasto[]));
        if (!data || data.length < 1000) break;
      }
      const { count, error } = await supabase
        .from("compras").select("id", { count: "exact", head: true })
        .gte("previsao_entrega", h).lte("previsao_entrega", h7).is("data_entrega_real", null);
      if (error) throw error;
      return { custoMes, entregas7: count ?? 0, comprasSemana };
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
  const [ordem, setOrdem] = useState<Ordenacao>("padrao");
  const [semana, setSemana] = useState<ColunaSemana | null>(null);

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

  const hoje = hojeSP();
  // Bloco semanal só quando o banco já traz os valores previstos (script 20261127_prazo_fornecedor_previstos.sql).
  const gasto = useMemo(
    () => (recursos.previstos && comprasResumo.data ? agruparPorSemana(rows, comprasResumo.data.comprasSemana, hoje) : null),
    [recursos.previstos, rows, comprasResumo.data, hoje],
  );
  const previstoMes = useMemo(() => (recursos.previstos ? previstoNoMes(rows, hoje) : null), [recursos.previstos, rows, hoje]);
  const idsSemana = semana && gasto ? gasto.colunas[semana].ids : null;

  const clientes = useMemo(() => [...new Set(rows.map((r) => r.cliente).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const selecionadas = rows
      .filter((r) => {
        if (t && ![r.codigo, r.cliente, r.titulo, r.fornecedores, r.fornecedor_exibicao, r.empreendimento].some((v) => v?.toLowerCase().includes(t))) return false;
        if (idsSemana && !idsSemana.has(r.id)) return false;
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
    return ordenarRegistros(selecionadas, ordem, { nome: (r) => r.titulo, data: (r) => r.created_at, necessario: (r) => r.data_necessaria, previsao: (r) => r.previsao_exibicao ?? r.proxima_entrega, id: (r) => r.id });
  }, [rows, q, statuses, prio, cliente, minhas, user?.id, ordem, idsSemana]);

  const cards = [
    { label: "Novas", value: resumo.novas, cls: "text-status-nova" },
    { label: "Em cotação", value: resumo.cotacao, cls: "text-status-cotacao" },
    { label: "Aguardando entrega", value: resumo.compradas, cls: "text-status-comprada" },
    { label: "Entregues no mês", value: resumo.entreguesMes, cls: "text-status-entregue" },
    { label: "Atrasadas", value: resumo.atrasadas, cls: "text-destructive" },
    { label: "Entregas próx. 7 dias", value: comprasResumo.data ? comprasResumo.data.entregas7 : "—", cls: "text-status-parcial" },
    { label: "Comprado no mês", value: comprasResumo.data ? fmtBRL(comprasResumo.data.custoMes) : "—", cls: "text-foreground" },
    ...(previstoMes != null ? [{ label: "Previsto para o mês", value: fmtBRL(previstoMes), cls: "text-muted-foreground" }] : []),
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

      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", cards.length > 7 ? "2xl:grid-cols-8" : "xl:grid-cols-7")}>
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={cn("mt-1 whitespace-nowrap text-xl font-semibold tabular-nums", c.cls)}>{isLoading ? "—" : c.value}</p>
          </div>
        ))}
      </div>

      {gasto && <GastoSemanal colunas={gasto.colunas} semPrazo={gasto.semPrazo} hoje={hoje} selecionada={semana} onSelecionar={setSemana} />}

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
          <OrdenacaoSelect value={ordem} onChange={setOrdem} />
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
          {semana && (
            <button onClick={() => setSemana(null)} className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Semana: {COLUNAS_SEMANA.find((c) => c.id === semana)?.label} ✕
            </button>
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
          <div className="hidden overflow-hidden rounded-lg border bg-card xl:block">
            <Table className="data-table spreadsheet-table">
              <colgroup>
                <col className="w-[8%]" /><col className="w-[12%]" /><col className="w-[11%]" />
                <col className="w-[8%]" /><col className="w-[11%]" /><col className="w-[11%]" />
                <col className="w-[9%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[8%]" />
              </colgroup>
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
                  <TableRow key={r.id} onClick={() => go(r.id)} title={`${r.codigo} · ${r.cliente} · ${r.titulo}`} className={cn("cursor-pointer", r.atrasada && "bg-destructive/5 hover:bg-destructive/10")}>
                    <TableCell className="whitespace-nowrap font-medium">
                      <span className="flex items-center gap-1">
                        {r.atrasada && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label={textoAtraso(r) ?? "Atrasada"} />}
                        {r.codigo}
                      </span>
                      {r.atrasada && <span className="block text-[11px] font-medium text-destructive" title={textoAtraso(r) ?? undefined}>{textoAtraso(r, "mini")}</span>}
                      {!r.atrasada && textoVencimento(r) && <span className="block text-[11px] font-medium text-status-cotacao">{textoVencimento(r)}</span>}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{r.cliente}</p>
                      <p className="text-xs text-muted-foreground">{[r.empreendimento, r.unidade].filter(Boolean).join(" · ") || "—"}</p>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">{r.titulo}{r.via_projeto_executivo && <span className="ml-1.5 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">Projeto</span>}</TableCell>
                    <TableCell><PrioridadeBadge prioridade={r.prioridade} /></TableCell>
                    <TableCell className={cn(((r.dias_atraso_chegada ?? 0) > 0 || (r.dias_atraso == null && r.atrasada)) && "font-medium text-destructive")}>{fmtDate(r.data_necessaria)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-sm"><Valor texto={fornecedorDe(r)} origem={r.fornecedor_origem} /></TableCell>
                    <TableCell className="text-right tabular-nums"><Valor texto={valorDe(r)} origem={r.valor_origem} /></TableCell>
                    <TableCell className="tabular-nums"><Valor texto={previsaoDe(r)} origem={r.previsao_origem} /></TableCell>
                    <TableCell className="text-sm"><Valor texto={localDe(r)} origem={r.local_origem} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 xl:hidden">
            {filtered.map((r) => (
              <Link
                key={r.id}
                to="/solicitacoes/$id"
                params={{ id: r.id }}
                className={cn("block rounded-lg border bg-card p-4", r.atrasada && "border-destructive/50 bg-destructive/5")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{r.codigo}{r.atrasada && <span className="ml-2 text-destructive">• {textoAtraso(r)}</span>}{!r.atrasada && textoVencimento(r) && <span className="ml-2 text-status-cotacao">• {textoVencimento(r)}</span>}</p>
                    <p className="truncate font-medium">{r.titulo}{r.via_projeto_executivo && <span className="ml-1.5 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">Projeto</span>}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.cliente}{r.empreendimento ? ` · ${r.empreendimento}` : ""}{r.unidade ? ` · ${r.unidade}` : ""}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <PrioridadeBadge prioridade={r.prioridade} />
                  <span>Até {fmtDate(r.data_necessaria)}</span>
                  {valorDe(r) && <span className="whitespace-nowrap font-medium text-foreground">{valorDe(r)}{origemPrevista(r.valor_origem) && <MarcaPrevisto />}</span>}
                  {previsaoDe(r) && <span className="whitespace-nowrap">Entrega {previsaoDe(r)}{origemPrevista(r.previsao_origem) && <MarcaPrevisto />}</span>}
                  {fornecedorDe(r) && <span className="truncate">{fornecedorDe(r)}{origemPrevista(r.fornecedor_origem) && <MarcaPrevisto />}</span>}
                  {localDe(r) && <span className="truncate">{localDe(r)}{origemPrevista(r.local_origem) && <MarcaPrevisto />}</span>}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* Melhor informação disponível (compra > cotação escolhida > solicitação); sem o script novo, usa só as compras. */
const fornecedorDe = (r: PainelRow) => (r.fornecedor_exibicao !== undefined ? r.fornecedor_exibicao : r.fornecedores) || null;
const valorDe = (r: PainelRow) => {
  const v = r.valor_exibicao !== undefined ? r.valor_exibicao : r.custo_total || null;
  return v == null ? null : fmtBRL(v);
};
const previsaoDe = (r: PainelRow) => {
  const d = r.previsao_exibicao !== undefined ? r.previsao_exibicao : r.proxima_entrega;
  return d ? fmtDate(d) : null;
};
const localDe = (r: PainelRow) => (r.local_exibicao !== undefined ? r.local_exibicao : r.locais_entrega) || null;

const MarcaPrevisto = () => <span className="ml-1 rounded border border-dashed px-1 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">previsto</span>;

/** Valor da célula numa linha; o que ainda é previsão ganha a etiqueta “previsto” logo abaixo. */
function Valor({ texto, origem }: { texto: string | null; origem?: OrigemInfo | null }) {
  const ajuda = origemPrevista(origem);
  return (
    <span className="block min-w-0" title={ajuda ?? undefined}>
      <span className={cn("block truncate whitespace-nowrap", ajuda && "text-muted-foreground")}>{texto ?? "—"}</span>
      {texto && ajuda && <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/80">previsto</span>}
    </span>
  );
}
