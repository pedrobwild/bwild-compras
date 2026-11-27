import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PagamentosDetalhes } from "@/components/PagamentosDetalhes";
import { consultarPagamentos } from "@/lib/pagamentos.functions";
import { totalPagamentos } from "@/lib/pagamentos";
import { fmtBRL } from "@/lib/format";
import { LoadingList, ErrorState } from "@/components/States";

export function PagamentoResumo({ id, editavel, onEdit }: { id: string; editavel: boolean; onEdit: () => void }) {
  const consultar = useServerFn(consultarPagamentos);
  const q = useQuery({ queryKey: ["painel", "pagamento", id], queryFn: () => consultar({ data: { ids: [id] } }) });
  if (q.isLoading) return <LoadingList rows={1} />;
  if (q.isError) return <><ErrorState message="Não foi possível consultar os pagamentos." /><Button variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button></>;
  const d = q.data?.[0]; if (!d) return null;
  const total = totalPagamentos(d.pagamentos);
  return <section className="space-y-3 border-y py-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Pagamentos ({d.pagamentos.length})</h2>{editavel && <Button variant="outline" className="min-h-11" onClick={onEdit}><Pencil className="h-4 w-4" />Editar pagamentos</Button>}</div>
    <p className="whitespace-nowrap text-sm tabular-nums">Valores informados: {total == null ? "—" : fmtBRL(total)}</p>
    <PagamentosDetalhes pagamentos={d.pagamentos} />
  </section>;
}
