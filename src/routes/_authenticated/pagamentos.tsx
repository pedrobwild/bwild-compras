import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePainel } from "@/hooks/usePainel";
import { useRecursosBanco } from "@/hooks/useRecursos";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { PagamentoAcoes } from "@/components/PagamentoAcoes";
import { consultarPagamentos } from "@/lib/pagamentos.functions";
import { ordenarFilaPagamentos, temMeioPagamento, type DadosPagamento } from "@/lib/pagamentos";
import { fmtBRL, fmtDate, type PainelRow } from "@/lib/format";
import { nomeCanal } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({ meta: [
    { title: "Pagamentos — Bwild Compras" },
    { name: "description", content: "Fila de pagamentos das obras, com links, instruções e boletos para a diretoria." },
    { property: "og:title", content: "Pagamentos — Bwild Compras" },
    { property: "og:description", content: "Solicitações de pagamento organizadas pelo prazo na obra." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PagamentosPage,
});

function PagamentosPage() {
  const painel = usePainel();
  const recursos = useRecursosBanco();
  const consultar = useServerFn(consultarPagamentos);
  const qc = useQueryClient();
  const rows = ordenarFilaPagamentos(painel.data ?? []);
  const ids = rows.map((r) => r.id);
  const idsKey = ids.join(",");
  const q = useQuery({
    queryKey: ["painel", "pagamentos-fila", idsKey, rows.map((r) => r.updated_at).join(",")],
    enabled: recursos.pagamentos && !painel.isLoading,
    queryFn: async () => {
      const dados: DadosPagamento[] = [];
      for (let i = 0; i < ids.length; i += 100) dados.push(...await consultar({ data: { ids: ids.slice(i, i + 100) } }));
      return dados;
    },
  });
  useEffect(() => {
    if (!recursos.pagamentos || !idsKey) return;
    const atuais = idsKey.split(",");
    const channels: ReturnType<typeof supabase.channel>[] = [];
    for (let i = 0; i < atuais.length; i += 100) {
      const filter = `solicitacao_id=in.(${atuais.slice(i, i + 100).join(",")})`;
      const refresh = () => { void qc.invalidateQueries({ queryKey: ["painel"] }); };
      channels.push(supabase.channel(nomeCanal("pagamentos"))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "solicitacao_eventos", filter }, refresh)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "cotacoes", filter }, refresh)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cotacoes", filter }, refresh).subscribe());
    }
    return () => { for (const ch of channels) void supabase.removeChannel(ch); };
  }, [idsKey, qc, recursos.pagamentos]);

  const retry = () => { void painel.refetch(); void q.refetch(); };
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Pagamentos</h1><p className="text-sm text-muted-foreground">{rows.length} solicitações de pagamento</p></div><Button variant="outline" size="icon" className="h-11 w-11" aria-label="Atualizar pagamentos" title="Atualizar pagamentos" onClick={retry}><RefreshCw className="h-4 w-4" /></Button></div>
    {painel.isError || q.isError ? <><ErrorState /><Button variant="outline" onClick={retry}>Tentar novamente</Button></> : painel.isLoading ? <LoadingList /> : !recursos.pagamentos ? <EmptyState title="Pagamentos ainda não está disponível." /> : q.isLoading ? <LoadingList /> : !rows.length ? <EmptyState title="Nenhuma solicitação de pagamento." /> : <PagamentosLista rows={rows} dados={q.data ?? []} />}
  </div>;
}

export function PagamentosLista({ rows, dados }: { rows: PainelRow[]; dados: DadosPagamento[] }) {
  const porId = new Map(dados.map((d) => [d.id, d]));
  const acoes = (r: PainelRow) => {
    const d = porId.get(r.id);
    return d && temMeioPagamento(d.pagamento_link, d.pagamento_instrucoes, d.boletos.length)
      ? <PagamentoAcoes link={d.pagamento_link} instrucoes={d.pagamento_instrucoes} boletos={d.boletos} compact />
      : <span className="text-xs text-muted-foreground">Dados pendentes</span>;
  };
  return <>
    <div className="hidden overflow-hidden border xl:block">
      <table className="data-table pagamentos-table w-full table-fixed">
        <colgroup>{[8, 13, 14, 12, 10, 10, 10, 7, 16].map((n, i) => <col key={i} width={`${n}%`} />)}</colgroup>
        <thead><tr>{["Código", "Cliente/obra", "Título", "Fornecedor", "Valor", "Condição", "Na obra até", "Atraso", "Pagamento"].map((c) => <th key={c} className="text-left">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r) => {
          const d = porId.get(r.id);
          const obra = [r.cliente, r.empreendimento, r.unidade].filter(Boolean).join(" · ");
          return <tr key={r.id} className={cn("border-t", r.atrasada && "bg-destructive/5")}>
            <td><Link to="/solicitacoes/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.codigo}</Link></td>
            <td title={obra}>{obra}</td><td title={r.titulo}>{r.titulo}</td>
            <td title={d?.cotacao?.fornecedor}>{d?.cotacao?.fornecedor ?? "—"}</td>
            <td className="whitespace-nowrap tabular-nums">{d?.cotacao?.valor_total == null ? "—" : fmtBRL(d.cotacao.valor_total)}</td>
            <td title={d?.cotacao?.condicao_pagamento ?? undefined}>{d?.cotacao?.condicao_pagamento ?? "—"}</td>
            <td className="whitespace-nowrap tabular-nums">{fmtDate(r.data_necessaria)}</td>
            <td className="whitespace-nowrap tabular-nums text-destructive">{r.atrasada && (r.dias_atraso ?? 0) > 0 ? `${r.dias_atraso}d` : "—"}</td>
            <td>{acoes(r)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="grid gap-3 xl:hidden">{rows.map((r) => {
      const d = porId.get(r.id);
      return <article key={r.id} className={cn("min-w-0 rounded-md border p-4", r.atrasada && "border-destructive/40 bg-destructive/5")}>
        <Link to="/solicitacoes/$id" params={{ id: r.id }} className="text-sm font-medium text-primary">{r.codigo}</Link>
        <h2 className="mt-1 break-words font-semibold">{r.titulo}</h2>
        <p className="mt-1 break-words text-sm text-muted-foreground">{[r.cliente, r.empreendimento, r.unidade].filter(Boolean).join(" · ")}</p>
        <dl className="my-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Fornecedor escolhido</dt><dd className="break-words">{d?.cotacao?.fornecedor ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Valor</dt><dd className="whitespace-nowrap tabular-nums">{d?.cotacao?.valor_total == null ? "—" : fmtBRL(d.cotacao.valor_total)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Condição de pagamento</dt><dd className="break-words">{d?.cotacao?.condicao_pagamento ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Na obra até</dt><dd className="whitespace-nowrap tabular-nums">{fmtDate(r.data_necessaria)}</dd></div>
          {r.atrasada && (r.dias_atraso ?? 0) > 0 && <div className="whitespace-nowrap text-destructive">{r.dias_atraso} dias de atraso</div>}
        </dl>
        {d && temMeioPagamento(d.pagamento_link, d.pagamento_instrucoes, d.boletos.length) ? <PagamentoAcoes link={d.pagamento_link} instrucoes={d.pagamento_instrucoes} boletos={d.boletos} /> : <p className="text-sm text-muted-foreground">Dados de pagamento pendentes.</p>}
      </article>;
    })}</div>
  </>;
}