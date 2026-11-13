import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingList } from "@/components/States";
import { STATUS, fmtDate, type PainelRow } from "@/lib/format";
import { montarChecklist, filtrarChecklist, type ItemChecklist, type FiltroChecklist } from "@/lib/checklist-compras";
import { cn } from "@/lib/utils";
import { OrdenacaoSelect } from "@/components/OrdenacaoSelect";
import { ordenarRegistros, type Ordenacao } from "@/lib/ordenacao";

export function ChecklistCompras({ solicitacoes }: { solicitacoes: PainelRow[] }) {
  const [filtro, setFiltro] = useState<FiltroChecklist>("todos");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordenacao>("padrao");
  const ids = solicitacoes.map((r) => r.id).sort();
  const itens = useQuery({
    queryKey: ["painel", "checklist-itens", ids],
    queryFn: async () => {
      const rows: ItemChecklist[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from("solicitacao_itens")
            .select("id,solicitacao_id,descricao,quantidade,unidade")
            .in("solicitacao_id", ids.slice(i, i + 100)).order("id").range(from, from + 999);
          if (error) throw error;
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
      }
      return rows;
    },
  });
  const linhas = montarChecklist(itens.data ?? [], solicitacoes);
  const comprados = linhas.filter((l) => l.comprado).length;
  const urgentes = linhas.filter((l) => l.urgente).length;
  const visiveis = ordenarRegistros(filtrarChecklist(linhas, filtro, busca), ordem, {
    nome: (l) => l.descricao, data: (l) => l.solicitacao.created_at, id: (l) => l.id,
    necessario: (l) => l.solicitacao.data_necessaria, previsao: (l) => l.solicitacao.proxima_entrega,
  });
  const filtros: { key: FiltroChecklist; label: string; total: number }[] = [
    { key: "todos", label: "Todos", total: linhas.length },
    { key: "pendentes", label: "Não comprados", total: linhas.length - comprados },
    { key: "comprados", label: "Comprados", total: comprados },
    { key: "urgentes", label: "Urgentes", total: urgentes },
  ];

  return <section className="min-w-0 space-y-3" aria-label="Checklist de compras">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">Checklist de itens</h2>
      {!itens.isLoading && !itens.isError && <span className="text-sm tabular-nums text-muted-foreground">{comprados} de {linhas.length} comprados</span>}
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Filtrar situação de compra">
      {filtros.map((f) => <Button key={f.key} variant={filtro === f.key ? "default" : "outline"} className="min-h-11 gap-2" aria-pressed={filtro === f.key} onClick={() => setFiltro(f.key)}>
        {f.key === "urgentes" && <AlertTriangle className="h-4 w-4" />}{f.label} <span className="tabular-nums">{f.total}</span>
      </Button>)}
    </div>
    <div className="flex flex-wrap gap-3">
      <div className="relative min-w-0 flex-1 basis-56"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="min-h-11 pl-9" aria-label="Buscar item no checklist" placeholder="Buscar item ou código" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      <OrdenacaoSelect value={ordem} onChange={setOrdem} />
    </div>
    {itens.isLoading ? <LoadingList /> : itens.isError ? <div className="space-y-2"><ErrorState message="Não foi possível carregar os itens desta obra." /><Button variant="outline" onClick={() => itens.refetch()}>Tentar novamente</Button></div> : visiveis.length === 0 ? <EmptyState title="Nenhum item encontrado." /> : <div className="overflow-hidden rounded-md border">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Itens por situação da solicitação: comprado ou não comprado</caption>
        <thead className="border-b bg-muted text-xs text-muted-foreground"><tr>
          <th className="w-14 px-2 py-3 text-center" title="Comprado conforme a etapa da solicitação"><Check className="mx-auto h-4 w-4" aria-label="Comprado" /></th>
          <th className="px-2 py-3">Item</th><th className="w-20 px-2 py-3 text-right">Qtd.</th>
          <th className="hidden w-36 px-2 py-3 xl:table-cell">Etapa</th><th className="hidden w-28 px-2 py-3 xl:table-cell">Na obra até</th>
        </tr></thead>
        <tbody>{visiveis.map((l) => <tr key={l.id} className="border-b last:border-0 hover:bg-muted/40">
          <td className="px-2 py-3 text-center"><span role="img" aria-label={l.comprado ? "Comprado" : "Não comprado"} title={l.comprado ? "Comprado" : "Não comprado"} className={cn("mx-auto grid h-6 w-6 place-items-center rounded border", l.comprado ? "border-status-comprada bg-status-comprada/10 text-status-comprada" : "border-border text-muted-foreground")}>
            {l.comprado ? <Check className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
          </span></td>
          <td className="min-w-0 px-2 py-3"><Link className="block min-h-11 break-words font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to="/solicitacoes/$id" params={{ id: l.solicitacao_id }}>{l.descricao}<span className="mt-1 block text-xs font-normal text-muted-foreground">{l.solicitacao.codigo} · {l.comprado ? "Comprado" : "Não comprado"}</span></Link>
            {l.urgente && <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" />Urgente</span>}
            <span className="mt-1 block break-words text-xs text-muted-foreground xl:hidden">{STATUS[l.solicitacao.status].label}{l.solicitacao.data_necessaria ? ` · Na obra até ${fmtDate(l.solicitacao.data_necessaria)}` : ""}</span>
          </td>
          <td className="break-words px-2 py-3 text-right tabular-nums">{l.quantidade == null ? "—" : Number(l.quantidade).toLocaleString("pt-BR")}<span className="block text-xs text-muted-foreground">{l.unidade}</span></td>
          <td className="hidden break-words px-2 py-3 text-xs xl:table-cell">{STATUS[l.solicitacao.status].label}</td>
          <td className="hidden px-2 py-3 text-xs tabular-nums xl:table-cell">{fmtDate(l.solicitacao.data_necessaria)}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}