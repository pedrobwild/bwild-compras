import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePainel } from "@/hooks/usePainel";
import { useRole } from "@/hooks/useAuth";
import { CotacoesTab } from "@/components/CotacoesTab";
import { RevisaoIA } from "@/components/RevisaoIA";
import { LoadingList, EmptyState, ErrorState } from "@/components/States";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/cotacoes")({
  head: () => ({
    meta: [
      { title: "Cotações — Bwild Compras" },
      { name: "description", content: "Registre orçamentos de fornecedores e compare com a revisão da IA antes de cotar." },
      { property: "og:title", content: "Cotações — Bwild Compras" },
      { property: "og:description", content: "Orçamentos de fornecedores lado a lado com a revisão antes da cotação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CotacoesPage,
});

const STATUS_COTACAO = ["nova", "cronograma_confirmado", "em_cotacao", "aguardando_aprovacao"];

function CotacoesPage() {
  const { isCompras } = useRole();
  const painel = usePainel();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (painel.data ?? [])
      .filter((r: any) => STATUS_COTACAO.includes(r.status))
      .filter((r: any) => !q || `${r.codigo} ${r.titulo ?? ""} ${r.cliente ?? ""}`.toLowerCase().includes(q));
  }, [painel.data, busca]);

  const ativo = sel ?? (lista[0] as any)?.id ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Cotações</h1>
        <p className="text-sm text-muted-foreground">Registre os orçamentos dos fornecedores e confira as pendências apontadas pela revisão antes de cotar.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="space-y-2 p-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar solicitação" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          {painel.isLoading ? <LoadingList rows={4} /> : painel.isError ? <ErrorState message="Não foi possível carregar as solicitações." /> : lista.length === 0 ? (
            <EmptyState title="Nenhuma solicitação em cotação." />
          ) : (
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
              {lista.map((r: any) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSel(r.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${ativo === r.id ? "border-accent bg-accent/10" : "border-transparent hover:bg-muted"}`}
                  >
                    <span className="font-medium">{r.codigo}</span> · <span className="text-muted-foreground">{r.cliente ?? "—"}</span>
                    <p className="truncate">{r.titulo}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {ativo ? <Detalhe id={ativo} podeEditar={isCompras} /> : null}
      </div>
    </div>
  );
}

function Detalhe({ id, podeEditar }: { id: string; podeEditar: boolean }) {
  const q = useQuery({
    queryKey: ["cotacoes-tela", id],
    queryFn: async () => {
      const [s, it] = await Promise.all([
        supabase.from("solicitacoes").select("id, codigo, titulo, descricao, status").eq("id", id).single(),
        supabase.from("solicitacao_itens").select("*").eq("solicitacao_id", id).order("id"),
      ]);
      if (s.error) throw s.error;
      return { sol: s.data as any, itens: (it.data ?? []) as any[] };
    },
  });
  if (q.isLoading) return <Skeleton className="h-96 w-full" />;
  if (q.isError || !q.data) return <ErrorState message="Não foi possível carregar a solicitação." />;
  const { sol, itens } = q.data;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{sol.codigo} — {sol.titulo}</h2>
        <Link to="/solicitacoes/$id" params={{ id }} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
          Abrir solicitação <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0 p-4">
          <h3 className="mb-3 font-medium">Orçamentos dos fornecedores</h3>
          <CotacoesTab key={id} solicitacaoId={id} podeEditar={podeEditar && sol.status !== "cancelada"} />
        </Card>
        <Card className="min-w-0 p-4">
          <h3 className="mb-1 font-medium">Revisão antes da cotação</h3>
          <p className="mb-3 text-xs text-muted-foreground">Confira se os orçamentos cobrem as especificações que a IA apontou como faltantes. {itens.length} itens na solicitação.</p>
          <RevisaoIA key={id} titulo={sol.titulo ?? ""} descricao={sol.descricao ?? ""} itens={itens} />
        </Card>
      </div>
    </div>
  );
}
