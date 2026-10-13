import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Timer, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingList, EmptyState, ErrorState } from "@/components/States";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS, type Status } from "@/lib/format";
import { calcularTempoPorStatus, fmtDiasMedia, type EventoStatus, type SolicBasica } from "@/lib/tempo-status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tempo")({
  head: () => ({
    meta: [
      { title: "Tempo por etapa — Bwild Compras" },
      { name: "description", content: "Tempo médio dos cards em cada etapa para identificar gargalos." },
      { property: "og:title", content: "Tempo por etapa — Bwild Compras" },
      { property: "og:description", content: "Tempo médio dos cards em cada etapa para identificar gargalos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TempoPage,
});

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).order("created_at").range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

function TempoPage() {
  const dados = useQuery({
    queryKey: ["tempo-status"],
    queryFn: async () => {
      const [sols, evs] = await Promise.all([
        fetchAll<SolicBasica>("solicitacoes", "id,status,created_at"),
        fetchAll<EventoStatus>("solicitacao_eventos", "solicitacao_id,descricao,created_at"),
      ]);
      return { sols, evs: evs.filter((e) => e.descricao?.toLowerCase().includes("status")) };
    },
  });

  const linhas = useMemo(
    () => (dados.data ? calcularTempoPorStatus(dados.data.evs, dados.data.sols) : []),
    [dados.data],
  );
  // Gargalo: etapa com maior tempo médio dos cards que estão nela agora.
  const gargalo = useMemo(() => {
    const comDados = linhas.filter((l) => l.qtdAgora > 0 && l.mediaDiasAgora != null && l.status !== "entregue" && l.status !== "cancelada");
    if (!comDados.length) return null;
    return comDados.reduce((a, b) => ((b.mediaDiasAgora ?? 0) > (a.mediaDiasAgora ?? 0) ? b : a)).status;
  }, [linhas]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Timer className="h-6 w-6 text-accent" /> Tempo por etapa
        </h1>
        <p className="text-sm text-muted-foreground">
          Quanto tempo os cards ficam em cada etapa, em média. A etapa onde os cards envelhecem mais é o gargalo.
        </p>
      </div>

      {dados.isLoading ? (
        <LoadingList rows={4} />
      ) : dados.isError ? (
        <ErrorState message="Não foi possível carregar o histórico de status." />
      ) : linhas.every((l) => l.qtdAgora === 0) ? (
        <EmptyState title="Nenhuma solicitação registrada ainda." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {linhas.map((l) => {
            const ehGargalo = l.status === gargalo;
            return (
              <Card key={l.status} className={cn("space-y-3 p-4", ehGargalo && "border-destructive/50 bg-destructive/5")}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={STATUS[l.status as Status].cls}>
                    {STATUS[l.status as Status].label}
                  </Badge>
                  {ehGargalo && (
                    <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Gargalo
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{l.qtdAgora}</p>
                    <p className="text-[11px] text-muted-foreground">cards agora</p>
                  </div>
                  <div>
                    <p className={cn("text-lg font-semibold tabular-nums", ehGargalo && "text-destructive")}>
                      {fmtDiasMedia(l.mediaDiasAgora)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">tempo médio atual</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{fmtDiasMedia(l.mediaDiasHistorico)}</p>
                    <p className="text-[11px] text-muted-foreground">média ao sair</p>
                  </div>
                </div>
                {l.maxDiasAgora != null && l.qtdAgora > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Card mais antigo na etapa: {fmtDiasMedia(l.maxDiasAgora)}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        O cálculo usa a linha do tempo de cada solicitação. Cards antigos sem histórico de mudanças contam o tempo todo na etapa atual.
      </p>
    </div>
  );
}
