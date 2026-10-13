import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, Clock, ShoppingCart, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePainel } from "@/hooks/usePainel";
import { LoadingList, EmptyState, ErrorState } from "@/components/States";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtBRL, fmtDate } from "@/lib/format";
import { agruparFornecedores, type CompraLite, type CotacaoLite } from "@/lib/fornecedores";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores — Bwild Compras" },
      { name: "description", content: "Histórico de orçamentos e compras por fornecedor para escolher com confiança." },
      { property: "og:title", content: "Fornecedores — Bwild Compras" },
      { property: "og:description", content: "Orçamentos, compras e pontualidade de cada fornecedor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FornecedoresPage,
});

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function FornecedoresPage() {
  const painel = usePainel();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const dados = useQuery({
    queryKey: ["fornecedores-historico"],
    queryFn: async () => {
      const [cot, com] = await Promise.all([
        supabase.from("cotacoes").select("id,solicitacao_id,fornecedor,fornecedor_contato,valor_total,prazo_entrega_dias,escolhida,created_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("compras").select("id,solicitacao_id,fornecedor,fornecedor_contato,valor_total,data_compra,previsao_entrega,data_entrega_real").order("data_compra", { ascending: false }).limit(1000),
      ]);
      if (com.error) throw com.error;
      // Cotações podem não existir ainda no banco: segue só com compras.
      return { cotacoes: (cot.error ? [] : cot.data) as CotacaoLite[], compras: com.data as CompraLite[] };
    },
  });

  const solic = useMemo(() => new Map((painel.data ?? []).map((r: any) => [r.id, r])), [painel.data]);
  const lista = useMemo(() => {
    if (!dados.data) return [];
    const q = busca.trim().toLowerCase();
    return agruparFornecedores(dados.data.cotacoes, dados.data.compras).filter((f) => !q || f.nome.toLowerCase().includes(q));
  }, [dados.data, busca]);
  const ativo = lista.find((f) => f.chave === sel) ?? lista[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Fornecedores</h1>
        <p className="text-sm text-muted-foreground">Histórico de orçamentos e compras de cada fornecedor, com pontualidade nas entregas.</p>
      </div>
      {dados.isLoading ? <LoadingList /> : dados.isError ? <ErrorState message="Não foi possível carregar os fornecedores." /> : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="space-y-2 p-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {lista.length === 0 ? <EmptyState title="Nenhum fornecedor com orçamento ou compra registrada." /> : (
              <div className="max-h-[70vh] space-y-1 overflow-y-auto">
                {lista.map((f) => (
                  <button key={f.chave} onClick={() => setSel(f.chave)}
                    className={cn("w-full rounded-md border p-2.5 text-left text-sm hover:bg-muted", ativo?.chave === f.chave && "border-accent bg-accent/10")}>
                    <p className="font-medium">{f.nome}</p>
                    <p className="text-xs text-muted-foreground">{f.cotacoes.length} orçamentos · {f.compras.length} compras · {fmtBRL(f.totalComprado)}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          {ativo && (
            <div className="min-w-0 space-y-4">
              <Card className="p-4">
                <h2 className="text-lg font-semibold">{ativo.nome}</h2>
                {ativo.contato && <p className="text-sm text-muted-foreground">{ativo.contato}</p>}
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Kpi icon={ShoppingCart} label="Total comprado" value={fmtBRL(ativo.totalComprado)} />
                  <Kpi icon={Star} label="Escolhido nas cotações" value={`${ativo.vezesEscolhido} de ${ativo.cotacoes.length} (${pct(ativo.taxaEscolha)})`} />
                  <Kpi icon={Clock} label="Entregas no prazo" value={ativo.pontualidade == null ? "Sem entregas" : `${pct(ativo.pontualidade)}`} />
                  <Kpi icon={FileText} label="Última atividade" value={fmtDate(ativo.ultimaAtividade)} />
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="mb-2 font-semibold">Compras</h3>
                {ativo.compras.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p> : (
                  <ul className="divide-y text-sm">
                    {ativo.compras.map((c) => {
                      const s: any = solic.get(c.solicitacao_id);
                      const atrasou = c.data_entrega_real && c.previsao_entrega && c.data_entrega_real > c.previsao_entrega;
                      return (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <Link to="/solicitacoes/$id" params={{ id: c.solicitacao_id }} className="font-medium hover:underline">{s ? `${s.codigo} · ${s.titulo ?? ""}` : "Ver solicitação"}</Link>
                            <p className="text-xs text-muted-foreground">Compra {fmtDate(c.data_compra)} · previsão {fmtDate(c.previsao_entrega)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.data_entrega_real ? <Badge variant={atrasou ? "destructive" : "secondary"}>{atrasou ? "Entregue com atraso" : "Entregue no prazo"}</Badge> : <Badge variant="outline">Aguardando entrega</Badge>}
                            <span className="font-medium tabular-nums">{fmtBRL(c.valor_total)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card className="p-4">
                <h3 className="mb-2 font-semibold">Orçamentos</h3>
                {ativo.cotacoes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum orçamento registrado.</p> : (
                  <ul className="divide-y text-sm">
                    {ativo.cotacoes.map((c) => {
                      const s: any = solic.get(c.solicitacao_id);
                      return (
                        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <Link to="/solicitacoes/$id" params={{ id: c.solicitacao_id }} className="font-medium hover:underline">{s ? `${s.codigo} · ${s.titulo ?? ""}` : "Ver solicitação"}</Link>
                            <p className="text-xs text-muted-foreground">{fmtDate(c.created_at)}{c.prazo_entrega_dias != null && ` · prazo ${c.prazo_entrega_dias} dias`}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.escolhida && <Badge>Escolhido</Badge>}
                            <span className="font-medium tabular-nums">{fmtBRL(c.valor_total)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
