import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PagamentoAcoes } from "@/components/PagamentoAcoes";
import { consultarPagamentos } from "@/lib/pagamentos.functions";
import { temMeioPagamento } from "@/lib/pagamentos";
import { LoadingList, ErrorState } from "@/components/States";

export function PagamentoResumo({ id, editavel, onEdit }: { id: string; editavel: boolean; onEdit: () => void }) {
  const consultar = useServerFn(consultarPagamentos);
  const q = useQuery({ queryKey: ["painel", "pagamento", id], queryFn: () => consultar({ data: { ids: [id] } }) });
  if (q.isLoading) return <LoadingList rows={1} />;
  if (q.isError) return <><ErrorState message="Não foi possível consultar o pagamento." /><Button variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button></>;
  const d = q.data?.[0];
  if (!d) return null;
  return <section className="space-y-3 border-y py-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Pagamento</h2>{editavel && <Button variant="outline" className="min-h-11" onClick={onEdit}><Pencil className="h-4 w-4" />Editar pagamento</Button>}</div>
    {d.pagamento_link && <p className="break-all text-sm text-primary">{d.pagamento_link}</p>}
    {d.pagamento_instrucoes && <p className="whitespace-pre-wrap break-words text-sm">{d.pagamento_instrucoes}</p>}
    {!temMeioPagamento(d.pagamento_link, d.pagamento_instrucoes, d.boletos.length) && <p className="text-sm text-muted-foreground">Dados de pagamento pendentes.</p>}
    <PagamentoAcoes link={d.pagamento_link} instrucoes={d.pagamento_instrucoes} boletos={d.boletos} />
  </section>;
}