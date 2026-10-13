import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePainel } from "@/hooks/usePainel";
import { LoadingList, EmptyState, ErrorState } from "@/components/States";
import { StatusBadge } from "@/components/badges";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { fmtBRL, fmtDate, type PainelRow } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/obras")({
  head: () => ({
    meta: [
      { title: "Custos por obra — Bwild Compras" },
      { name: "description", content: "Solicitações e compras de cada cliente/obra, com o total pago." },
      { property: "og:title", content: "Custos por obra — Bwild Compras" },
      { property: "og:description", content: "Quanto cada obra já pagou em compras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ObrasPage,
});

type Compra = { id: string; solicitacao_id: string; fornecedor: string | null; valor_total: number | null; data_compra: string | null; data_entrega_real: string | null };
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

function ObrasPage() {
  const painel = usePainel();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const compras = useQuery({
    queryKey: ["obras-compras"],
    queryFn: async () => {
      const out: Compra[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("compras")
          .select("id,solicitacao_id,fornecedor,valor_total,data_compra,data_entrega_real")
          .order("data_compra", { ascending: false }).order("id").range(de, de + 999);
        if (error) throw error;
        out.push(...(data as Compra[]));
        if (data.length < 1000) break;
      }
      return out;
    },
  });

  const obras = useMemo(() => {
    const rows = (painel.data ?? []) as PainelRow[];
    const porSolic = new Map<string, Compra[]>();
    for (const c of compras.data ?? []) porSolic.set(c.solicitacao_id, [...(porSolic.get(c.solicitacao_id) ?? []), c]);
    const map = new Map<string, { chave: string; cliente: string; obra: string; solic: PainelRow[]; compras: (Compra & { codigo: string })[]; total: number; abertas: number }>();
    for (const r of rows) {
      const chave = [norm(r.cliente), norm(r.empreendimento), norm(r.unidade)].join("|");
      let o = map.get(chave);
      if (!o) {
        o = { chave, cliente: r.cliente, obra: [r.empreendimento, r.unidade].filter(Boolean).join(" ") || "—", solic: [], compras: [], total: 0, abertas: 0 };
        map.set(chave, o);
      }
      o.solic.push(r);
      if (!["entregue", "cancelada"].includes(r.status)) o.abertas++;
      for (const c of porSolic.get(r.id) ?? []) { o.compras.push({ ...c, codigo: r.codigo }); o.total += Number(c.valor_total ?? 0); }
    }
    const q = norm(busca);
    return [...map.values()]
      .filter((o) => !q || q.split(" ").every((p) => norm(`${o.cliente} ${o.obra}`).includes(p)))
      .sort((a, b) => b.total - a.total);
  }, [painel.data, compras.data, busca]);

  const ativo = obras.find((o) => o.chave === sel) ?? obras[0];
  const totalGeral = obras.reduce((s, o) => s + o.total, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Custos por obra</h1>
        <p className="text-sm text-muted-foreground">Solicitações e compras de cada cliente/obra · total {fmtBRL(totalGeral)}</p>
      </div>
      {painel.isLoading || compras.isLoading ? <LoadingList /> : painel.isError || compras.isError ? <ErrorState message="Não foi possível carregar as obras." /> : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="space-y-2 p-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar cliente ou obra" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {obras.length === 0 ? <EmptyState title="Nenhuma obra encontrada." /> : (
              <div className="max-h-[70vh] space-y-1 overflow-y-auto">
                {obras.map((o) => (
                  <button key={o.chave} onClick={() => setSel(o.chave)}
                    className={cn("w-full rounded-md border p-2.5 text-left text-sm hover:bg-muted", ativo?.chave === o.chave && "border-accent bg-accent/10")}>
                    <p className="font-medium">{o.cliente}</p>
                    <p className="text-xs text-muted-foreground">{o.obra}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{o.solic.length} solicitações · {fmtBRL(o.total)}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>
          {ativo && (
            <div className="min-w-0 space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[["Total pago", fmtBRL(ativo.total)], ["Compras", String(ativo.compras.length)], ["Solicitações", String(ativo.solic.length)], ["Em aberto", String(ativo.abertas)]].map(([l, v]) => (
                  <Card key={l} className="p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-semibold tabular-nums">{v}</p></Card>
                ))}
              </div>
              <Card className="p-3">
                <h2 className="mb-2 font-medium">Compras</h2>
                {ativo.compras.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p> : (
                  <div className="divide-y text-sm">
                    {ativo.compras.map((c) => (
                      <Link key={c.id} to="/solicitacoes/$id" params={{ id: c.solicitacao_id }} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-muted">
                        <span><span className="font-mono text-xs text-muted-foreground">{c.codigo}</span> {c.fornecedor ?? "—"}</span>
                        <span className="text-muted-foreground">{fmtDate(c.data_compra)}{c.data_entrega_real ? " · entregue" : ""}</span>
                        <span className="font-medium tabular-nums">{fmtBRL(c.valor_total)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <Card className="p-3">
                <h2 className="mb-2 font-medium">Solicitações</h2>
                <div className="divide-y text-sm">
                  {ativo.solic.map((r) => (
                    <Link key={r.id} to="/solicitacoes/$id" params={{ id: r.id }} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-muted">
                      <span className="min-w-0"><span className="font-mono text-xs text-muted-foreground">{r.codigo}</span> {r.titulo}</span>
                      <span className="flex items-center gap-2"><StatusBadge status={r.status} /><span className="tabular-nums">{fmtBRL(r.custo_total)}</span></span>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
