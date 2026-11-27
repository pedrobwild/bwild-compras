import { PagamentoAcoes } from "@/components/PagamentoAcoes";
import { fmtBRL } from "@/lib/format";
import type { Pagamento } from "@/lib/pagamentos";

export function PagamentosDetalhes({ pagamentos }: { pagamentos: Pagamento[] }) {
  if (!pagamentos.length) return <p className="py-3 text-sm text-muted-foreground">Dados de pagamento pendentes.</p>;
  return <div className="divide-y">{pagamentos.map((p) => <section key={p.id} aria-label={`Pagamento em ${p.onde_comprado}`} className="min-w-0 space-y-2 py-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{p.onde_comprado}</h3><span className="whitespace-nowrap tabular-nums">{p.valor == null ? "Valor não informado" : fmtBRL(p.valor)}</span></div>
    <div className="text-sm"><span className="text-muted-foreground">Itens cobertos: </span>{p.itens.length ? <ul className="mt-1 space-y-1">{p.itens.map((i) => <li key={i.id} className="break-words">{i.descricao} <span className="whitespace-nowrap text-muted-foreground tabular-nums">· {i.quantidade.toLocaleString("pt-BR")} {i.unidade}</span></li>)}</ul> : <span>Sem itens vinculados</span>}</div>
    {p.observacao && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{p.observacao}</p>}
    {p.codigo && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">Código Pix ou linha digitável</summary><p className="whitespace-pre-wrap break-all font-mono text-xs">{p.codigo}</p></details>}
    <PagamentoAcoes link={p.link} codigo={p.codigo} boletos={p.boletos} />
  </section>)}</div>;
}