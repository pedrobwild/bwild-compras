import { useState } from "react";
import { Sparkles, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { revisarSolicitacaoIA, type RevisaoIA as Revisao } from "@/lib/revisao-ia.functions";

type Item = {
  descricao: string;
  quantidade?: number | null;
  unidade?: string | null;
  categoria?: string | null;
  ambiente?: string | null;
  especificacao?: string | null;
  link_referencia?: string | null;
};

const GRAV: Record<string, { label: string; cls: string }> = {
  alta: { label: "Bloqueia cotação", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  media: { label: "Importante", cls: "bg-status-cotacao/15 text-foreground border-status-cotacao/40" },
  baixa: { label: "Sugestão", cls: "bg-muted text-muted-foreground" },
};

export function RevisaoIA({ titulo, descricao, itens }: { titulo: string; descricao: string; itens: Item[] }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rev, setRev] = useState<Revisao | null>(null);

  async function analisar() {
    setLoading(true); setErro(null);
    try {
      const r = await revisarSolicitacaoIA({
        data: {
          titulo, descricao,
          itens: itens.slice(0, 150).map((i) => ({
            descricao: (i.descricao || "").slice(0, 500),
            quantidade: i.quantidade == null ? null : Number(i.quantidade),
            unidade: i.unidade ?? null, categoria: i.categoria ?? null, ambiente: i.ambiente ?? null,
            especificacao: i.especificacao ? i.especificacao.slice(0, 2000) : null,
            link_referencia: i.link_referencia ?? null,
          })),
        },
      });
      if (r.ok) setRev(r.revisao); else setErro(r.erro);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na análise.");
    } finally { setLoading(false); }
  }

  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-accent" /> Revisão antes da cotação</p>
          <p className="text-sm text-muted-foreground">A IA aponta especificações e dados que faltam para o fornecedor cotar.</p>
        </div>
        <Button size="sm" onClick={analisar} disabled={loading || itens.length === 0}>
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando…</> : <><Sparkles className="h-4 w-4" /> {rev ? "Analisar de novo" : "Analisar com IA"}</>}
        </Button>
      </div>

      {erro && <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{erro}</p>}

      {rev && (
        <div className="mt-4 space-y-3">
          <div className={`flex items-start gap-2 rounded-md p-3 text-sm ${rev.pronto_para_cotacao ? "bg-status-entregue/10" : "bg-status-cotacao/15"}`}>
            {rev.pronto_para_cotacao ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              <p className="font-medium">{rev.pronto_para_cotacao ? "Pronto para cotação" : "Faltam dados antes de cotar"}</p>
              <p>{rev.resumo}</p>
            </div>
          </div>
          {rev.gerais.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Pendências gerais</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">{rev.gerais.map((g, i) => <li key={i}>{g}</li>)}</ul>
            </div>
          )}
          {rev.itens.length > 0 && (
            <ul className="space-y-2">
              {rev.itens.map((it, i) => (
                <li key={i} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{it.indice}. {it.descricao}</span>
                    <Badge variant="outline" className={GRAV[it.gravidade]?.cls}>{GRAV[it.gravidade]?.label ?? it.gravidade}</Badge>
                  </div>
                  {it.faltantes.length > 0 && <ul className="mt-1 list-disc pl-5">{it.faltantes.map((f, j) => <li key={j}>{f}</li>)}</ul>}
                  {it.sugestao && <p className="mt-1 text-muted-foreground">{it.sugestao}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
