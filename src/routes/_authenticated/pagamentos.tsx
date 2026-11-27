import { Fragment, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarIcon, ChevronDown, ChevronRight, RefreshCw, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { usePainel } from "@/hooks/usePainel";
import { useRecursosBanco } from "@/hooks/useRecursos";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { PagamentosDetalhes } from "@/components/PagamentosDetalhes";
import { consultarPagamentos } from "@/lib/pagamentos.functions";
import { ordenarFilaPagamentos, totalPagamentos, type DadosPagamento } from "@/lib/pagamentos";
import { fmtBRL, fmtDate, type PainelRow } from "@/lib/format";
import { nomeCanal } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({ meta: [
    { title: "Pagamentos — Bwild Compras" },
    { name: "description", content: "Pagamentos por fornecedor e item, com links, códigos e boletos organizados pelo prazo na obra." },
    { property: "og:title", content: "Pagamentos — Bwild Compras" },
    { property: "og:description", content: "Fila de pagamentos por solicitação e dia de entrega na obra." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: PagamentosPage,
});

function PagamentosPage() {
  const painel = usePainel();
  const recursos = useRecursosBanco();
  const consultar = useServerFn(consultarPagamentos);
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState<DateRange | undefined>();
  const rows = ordenarFilaPagamentos(painel.data ?? [], periodo);
  const ids = rows.map((r) => r.id);
  const idsKey = ids.join(",");
  const q = useQuery({
    queryKey: ["painel", "pagamentos-fila", idsKey, rows.map((r) => r.updated_at).join(",")], enabled: recursos.pagamentos && !painel.isLoading,
    queryFn: async () => { const dados: DadosPagamento[] = []; for (let i = 0; i < ids.length; i += 100) dados.push(...await consultar({ data: { ids: ids.slice(i, i + 100) } })); return dados; },
  });
  useEffect(() => {
    if (!recursos.pagamentos || !idsKey) return;
    const atuais = idsKey.split(",");
    const channels: ReturnType<typeof supabase.channel>[] = [];
    for (let i = 0; i < atuais.length; i += 100) {
      const filter = `solicitacao_id=in.(${atuais.slice(i, i + 100).join(",")})`;
      const refresh = () => { void qc.invalidateQueries({ queryKey: ["painel"] }); };
      channels.push(supabase.channel(nomeCanal("pagamentos"))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "solicitacao_eventos", filter }, refresh).subscribe());
    }
    return () => { for (const ch of channels) void supabase.removeChannel(ch); };
  }, [idsKey, qc, recursos.pagamentos]);
  const retry = () => { void painel.refetch(); void q.refetch(); };
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Pagamentos</h1><p className="text-sm text-muted-foreground">{rows.length} solicitações de pagamento</p></div><Button variant="outline" size="icon" className="h-11 w-11" aria-label="Atualizar pagamentos" title="Atualizar pagamentos" onClick={retry}><RefreshCw className="h-4 w-4" /></Button></div>
    {recursos.pagamentos && <div className="flex flex-wrap items-center gap-2"><Popover><PopoverTrigger asChild><Button variant="outline" className="min-h-11 max-w-full whitespace-normal text-left"><CalendarIcon className="h-4 w-4 shrink-0" /><span>Na obra até{periodo?.from ? `: ${format(periodo.from, "dd/MM/yyyy")}${periodo.to ? ` — ${format(periodo.to, "dd/MM/yyyy")}` : ""}` : ""}</span></Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="range" selected={periodo} onSelect={setPeriodo} locale={ptBR} numberOfMonths={1} className="pointer-events-auto p-3" /></PopoverContent></Popover>{periodo && <Button variant="ghost" size="icon" className="h-11 w-11" title="Limpar período" aria-label="Limpar período" onClick={() => setPeriodo(undefined)}><X className="h-4 w-4" /></Button>}</div>}
    {painel.isError || q.isError ? <><ErrorState /><Button variant="outline" onClick={retry}>Tentar novamente</Button></> : painel.isLoading ? <LoadingList /> : !recursos.pagamentos ? <EmptyState title="Pagamentos ainda não está disponível." /> : q.isLoading ? <LoadingList /> : !rows.length ? <EmptyState title={periodo ? "Nenhum pagamento neste período." : "Nenhuma solicitação de pagamento."} /> : <PagamentosLista rows={rows} dados={q.data ?? []} />}
  </div>;
}

export function PagamentosLista({ rows, dados }: { rows: PainelRow[]; dados: DadosPagamento[] }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const porId = new Map(dados.map((d) => [d.id, d]));
  const toggle = (id: string) => setAbertos((prev) => { const novo = new Set(prev); if (novo.has(id)) novo.delete(id); else novo.add(id); return novo; });
  const expandir = (r: PainelRow) => <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`${abertos.has(r.id) ? "Recolher" : "Expandir"} pagamentos ${r.codigo}`} title={abertos.has(r.id) ? "Recolher pagamentos" : "Expandir pagamentos"} aria-expanded={abertos.has(r.id)} onClick={() => toggle(r.id)}>{abertos.has(r.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</Button>;
  const soma = (r: PainelRow) => { const total = totalPagamentos(porId.get(r.id)?.pagamentos ?? []); return total == null ? "—" : fmtBRL(total); };
  const atraso = (r: PainelRow) => r.atrasada && (r.dias_atraso ?? 0) > 0 ? `${r.dias_atraso}d` : "—";
  return <>
    <div className="hidden overflow-hidden border xl:block"><table className="data-table pagamentos-table w-full table-fixed">
      <colgroup>{[6, 10, 20, 23, 9, 14, 12, 6].map((n, i) => <col key={i} width={`${n}%`} />)}</colgroup>
      <thead><tr>{["", "Código", "Cliente/obra", "Título", "Pagamentos", "Valores informados", "Na obra até", "Atraso"].map((c, i) => <th key={i} className="text-left">{c}</th>)}</tr></thead>
      <tbody>{rows.map((r) => {
        const obra = [r.cliente, r.empreendimento, r.unidade].filter(Boolean).join(" · ");
        return <Fragment key={r.id}><tr className={cn("border-t", r.atrasada && "bg-destructive/5")}>
          <td>{expandir(r)}</td><td><Link to="/solicitacoes/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.codigo}</Link></td>
          <td title={obra}>{obra}</td><td title={r.titulo}>{r.titulo}</td><td className="whitespace-nowrap tabular-nums">{porId.get(r.id)?.pagamentos.length ?? 0}</td>
          <td className="whitespace-nowrap tabular-nums" title={soma(r)}>{soma(r)}</td><td className="whitespace-nowrap tabular-nums">{fmtDate(r.data_necessaria)}</td><td className="whitespace-nowrap tabular-nums text-destructive">{atraso(r)}</td>
        </tr>{abertos.has(r.id) && <tr><td colSpan={8} className="pagamentos-detalhes"><PagamentosDetalhes pagamentos={porId.get(r.id)?.pagamentos ?? []} /></td></tr>}</Fragment>;
      })}</tbody>
    </table></div>
    <div className="grid gap-3 xl:hidden">{rows.map((r) => <article key={r.id} className={cn("min-w-0 rounded-md border p-4", r.atrasada && "border-destructive/40 bg-destructive/5")}>
      <div className="flex items-center justify-between"><Link to="/solicitacoes/$id" params={{ id: r.id }} className="text-sm font-medium text-primary">{r.codigo}</Link>{expandir(r)}</div>
      <h2 className="break-words font-semibold">{r.titulo}</h2><p className="mt-1 break-words text-sm text-muted-foreground">{[r.cliente, r.empreendimento, r.unidade].filter(Boolean).join(" · ")}</p>
      <dl className="my-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Pagamentos</dt><dd className="tabular-nums">{porId.get(r.id)?.pagamentos.length ?? 0}</dd></div><div><dt className="text-xs text-muted-foreground">Valores informados</dt><dd className="whitespace-nowrap tabular-nums">{soma(r)}</dd></div><div><dt className="text-xs text-muted-foreground">Na obra até</dt><dd className="whitespace-nowrap tabular-nums">{fmtDate(r.data_necessaria)}</dd></div>{r.atrasada && (r.dias_atraso ?? 0) > 0 && <div className="whitespace-nowrap text-destructive">{r.dias_atraso} {r.dias_atraso === 1 ? "dia" : "dias"} de atraso</div>}</dl>
      {abertos.has(r.id) && <PagamentosDetalhes pagamentos={porId.get(r.id)?.pagamentos ?? []} />}
    </article>)}</div>
  </>;
}
