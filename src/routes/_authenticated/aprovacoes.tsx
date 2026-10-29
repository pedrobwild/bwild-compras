import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePainel } from "@/hooks/usePainel";
import { useRole } from "@/hooks/useAuth";
import { useRecursosBanco } from "@/hooks/useRecursos";
import { LoadingList, EmptyState, ErrorState } from "@/components/States";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS, statusDisponiveis, fmtBRL, fmtDate, type PainelRow, type Status } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/aprovacoes")({
  head: () => ({
    meta: [
      { title: "Aprovações — Bwild Compras" },
      { name: "description", content: "Aprove solicitações de compra, atualize o status e consulte o histórico." },
      { property: "og:title", content: "Aprovações — Bwild Compras" },
      { property: "og:description", content: "Fila de aprovação de compras com histórico de cada solicitação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AprovacoesPage,
});

const FILTROS: { key: string; label: string; status: Status[] }[] = [
  { key: "aprovacao", label: "Aguardando aprovação", status: ["aguardando_aprovacao"] },
  { key: "aprovadas", label: "Aprovadas", status: ["aprovada", "solicitacao_pagamento"] },
  { key: "cotacao", label: "Em cotação", status: ["em_cotacao"] },
];

function AprovacoesPage() {
  const { isCompras, isAdmin } = useRole();
  const painel = usePainel();
  const [filtro, setFiltro] = useState("aprovacao");
  const [sel, setSel] = useState<string | null>(null);

  const lista = useMemo(() => {
    const st = FILTROS.find((f) => f.key === filtro)!.status;
    return (painel.data ?? []).filter((r) => st.includes(r.status));
  }, [painel.data, filtro]);
  const ativo = lista.find((r) => r.id === sel) ?? lista[0] ?? null;

  if (!isCompras) return <div className="p-6"><EmptyState title="Apenas Compras e Admin acessam esta tela." /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Aprovações</h1>
        <p className="text-sm text-muted-foreground">Aprove compras, atualize o status e consulte o histórico de cada solicitação.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const n = (painel.data ?? []).filter((r) => f.status.includes(r.status)).length;
          return (
            <Button key={f.key} size="sm" variant={filtro === f.key ? "default" : "outline"} onClick={() => { setFiltro(f.key); setSel(null); }}>
              {f.label} ({n})
            </Button>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="space-y-2 p-3">
          {painel.isLoading ? <LoadingList rows={4} /> : painel.isError ? <ErrorState /> : lista.length === 0 ? (
            <EmptyState title="Nenhuma solicitação nesta etapa." />
          ) : lista.map((r) => (
            <button key={r.id} onClick={() => setSel(r.id)}
              className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${ativo?.id === r.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
              <div className="flex justify-between gap-2"><span className="font-medium">{r.codigo}</span><span className="text-muted-foreground">{fmtBRL(r.custo_total)}</span></div>
              <div className="truncate">{r.titulo}</div>
              <div className="truncate text-xs text-muted-foreground">{r.cliente}</div>
            </button>
          ))}
        </Card>
        {ativo ? <Detalhe key={ativo.id} r={ativo} isAdmin={isAdmin} /> : <EmptyState title="Selecione uma solicitação." />}
      </div>
    </div>
  );
}

function Detalhe({ r, isAdmin }: { r: PainelRow; isAdmin: boolean }) {
  const qc = useQueryClient();
  const recursos = useRecursosBanco();
  const [salvando, setSalvando] = useState(false);

  const cot = useQuery({
    queryKey: ["aprov-cotacao", r.id],
    queryFn: async () => {
      const { data } = await supabase.from("cotacoes").select("fornecedor, valor_total, prazo_entrega_dias, condicao_pagamento").eq("solicitacao_id", r.id).eq("escolhida", true).maybeSingle();
      return data as { fornecedor: string; valor_total: number | null; prazo_entrega_dias: number | null; condicao_pagamento: string | null } | null;
    },
  });
  const hist = useQuery({
    queryKey: ["aprov-historico", r.id, r.updated_at],
    queryFn: async () => {
      const { data, error } = await supabase.from("solicitacao_eventos").select("*").eq("solicitacao_id", r.id).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; tipo: string; descricao: string | null; created_at: string }[];
    },
  });

  const mudar = async (status: Status, msg: string) => {
    setSalvando(true);
    const { error } = await supabase.from("solicitacoes").update({ status }).eq("id", r.id);
    setSalvando(false);
    if (error) return toast.error(/aprova/i.test(error.message) ? "Só o Admin pode aprovar ou tirar da etapa Aprovação." : error.message);
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["painel"] });
    qc.invalidateQueries({ queryKey: ["aprov-historico", r.id] });
  };

  const emAprovacao = r.status === "aguardando_aprovacao";
  const opcoes = statusDisponiveis(recursos.cronograma, r.status).filter((k) => k !== "cancelada" && (isAdmin || (!emAprovacao && k !== "aprovada")));

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{r.codigo} · {r.cliente}</div>
          <h2 className="text-lg font-semibold">{r.titulo}</h2>
          <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/solicitacoes/$id" params={{ id: r.id }}><ExternalLink className="mr-1 h-4 w-4" />Abrir</Link></Button>
      </div>

      <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
        <div><span className="text-muted-foreground">Fornecedor escolhido: </span>{cot.data?.fornecedor ?? "—"}</div>
        <div><span className="text-muted-foreground">Valor: </span>{cot.data?.valor_total != null ? fmtBRL(cot.data.valor_total) : "—"}</div>
        <div><span className="text-muted-foreground">Prazo do fornecedor: </span>{cot.data?.prazo_entrega_dias != null ? `${cot.data.prazo_entrega_dias} dias` : "—"}</div>
        <div><span className="text-muted-foreground">Precisa na obra: </span>{fmtDate(r.data_necessaria)}</div>
        <div><span className="text-muted-foreground">Responsável: </span>{r.responsavel_nome ?? "—"}</div>
        <div><span className="text-muted-foreground">Solicitante: </span>{r.solicitante_nome ?? "—"}</div>
      </div>

      {emAprovacao && (
        isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button disabled={salvando} onClick={() => mudar("aprovada", "Compra aprovada")}><CheckCircle2 className="mr-1 h-4 w-4" />Aprovar</Button>
            <Button disabled={salvando} variant="outline" onClick={() => mudar("em_cotacao", "Devolvido para cotação")}><Undo2 className="mr-1 h-4 w-4" />Devolver para cotação</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">Aguardando o Admin aprovar esta compra.</p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Atualizar status:</span>
        <Select value={r.status} disabled={salvando || (emAprovacao && !isAdmin)} onValueChange={(v) => mudar(v as Status, "Status atualizado")}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            {opcoes.map((k) => <SelectItem key={k} value={k}>{STATUS[k].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
        {hist.isLoading ? <LoadingList rows={3} /> : hist.isError ? <ErrorState /> : !hist.data?.length ? <EmptyState title="Sem registros ainda." /> : (
          <ol className="space-y-2 border-l pl-4">
            {hist.data.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="text-xs text-muted-foreground">{fmtDate(e.created_at, "dd/MM/yyyy HH:mm")}</div>
                <div>{e.descricao ?? e.tipo}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}
