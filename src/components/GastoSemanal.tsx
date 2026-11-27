import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtBRL, fmtDate } from "@/lib/format";
import { COLUNAS_SEMANA, LINHAS_GASTO, inicioSemana, type ColunaSemana, type GastoSemanal as Gasto } from "@/lib/gasto-semanal";
import { somarDias } from "@/lib/prazos";
import { cn } from "@/lib/utils";

/** Período de cada coluna, para o título. */
function periodo(id: ColunaSemana, hoje: string) {
  const seg = inicioSemana(hoje);
  if (id === "atrasado") return "prazo vencido";
  if (id === "depois") return `a partir de ${fmtDate(somarDias(seg, 28), "dd/MM")}`;
  const k = Number(id.slice(1));
  return `${fmtDate(somarDias(seg, k * 7), "dd/MM")}–${fmtDate(somarDias(seg, k * 7 + 6), "dd/MM")}`;
}

const SemValor = ({ n }: { n: number }) =>
  n > 0 ? <span className="text-[11px] text-status-cotacao">{n} sem valor</span> : <span className="text-[11px] text-muted-foreground">—</span>;

export function GastoSemanal({ colunas, semPrazo, hoje, selecionada, onSelecionar }: {
  colunas: Gasto;
  semPrazo: number;
  hoje: string;
  selecionada: ColunaSemana | null;
  onSelecionar: (c: ColunaSemana | null) => void;
}) {
  const [aberta, setAberta] = useState<ColunaSemana | null>(null);
  const alternar = (c: ColunaSemana) => onSelecionar(selecionada === c ? null : c);
  return (
    <section className="rounded-lg border bg-card" aria-labelledby="gasto-semanal-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 id="gasto-semanal-titulo" className="font-semibold">Gasto por semana</h2>
          <p className="text-xs text-muted-foreground">
            Semanas de segunda a domingo. Compra registrada pela data da compra; o resto pelo “Comprar até”. Valores que não são compra são previsão.
          </p>
        </div>
        {selecionada && (
          <Button variant="ghost" size="sm" onClick={() => onSelecionar(null)}>
            <X className="h-4 w-4" /> Limpar semana
          </Button>
        )}
      </div>

      {/* Desktop: tabela com uma coluna por semana; clicar na semana filtra a lista. */}
      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup><col className="w-[16%]" />{COLUNAS_SEMANA.map((c) => <col key={c.id} className="w-[14%]" />)}</colgroup>
          <thead>
            <tr className="border-b">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground" scope="col"><span className="sr-only">Linha</span></th>
              {COLUNAS_SEMANA.map((c) => (
                <th key={c.id} scope="col" className="p-1 text-right">
                  <button
                    type="button"
                    onClick={() => alternar(c.id)}
                    aria-pressed={selecionada === c.id}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-right transition-colors hover:bg-muted",
                      selecionada === c.id && "bg-primary/10 ring-1 ring-primary/40",
                    )}
                  >
                    <span className={cn("block whitespace-nowrap text-xs font-semibold", c.id === "atrasado" && "text-destructive")}>{c.label}</span>
                    <span className="block whitespace-nowrap text-[11px] font-normal text-muted-foreground">{periodo(c.id, hoje)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {LINHAS_GASTO.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">{l.label}</th>
                {COLUNAS_SEMANA.map((c) => (
                  <td key={c.id} className={cn("whitespace-nowrap px-3 py-1.5 text-right", selecionada === c.id && "bg-primary/5")}>
                    {colunas[c.id][l.id] ? fmtBRL(colunas[c.id][l.id]) : <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t bg-muted/30">
              <th scope="row" className="px-3 py-1.5 text-left text-xs font-semibold">Total</th>
              {COLUNAS_SEMANA.map((c) => (
                <td key={c.id} className={cn("whitespace-nowrap px-3 py-1.5 text-right font-semibold", c.id === "atrasado" && colunas[c.id].total > 0 && "text-destructive", selecionada === c.id && "bg-primary/10")}>
                  {fmtBRL(colunas[c.id].total)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Sem valor</th>
              {COLUNAS_SEMANA.map((c) => (
                <td key={c.id} className={cn("whitespace-nowrap px-3 py-1.5 text-right", selecionada === c.id && "bg-primary/5")}><SemValor n={colunas[c.id].semValor} /></td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Celular: lista de semanas com o total; tocar mostra o detalhe. */}
      <ul className="divide-y md:hidden">
        {COLUNAS_SEMANA.map((c) => {
          const cel = colunas[c.id];
          const open = aberta === c.id;
          return (
            <li key={c.id} className={cn(selecionada === c.id && "bg-primary/5")}>
              <button
                type="button"
                className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-4 py-2 text-left"
                aria-expanded={open}
                onClick={() => setAberta(open ? null : c.id)}
              >
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm font-medium", c.id === "atrasado" && "text-destructive")}>{c.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{periodo(c.id, hoje)}{cel.semValor > 0 ? ` · ${cel.semValor} sem valor` : ""}</span>
                </span>
                <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{fmtBRL(cel.total)}</span>
                {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
              {open && (
                <div className="space-y-1 px-4 pb-3 text-sm">
                  {LINHAS_GASTO.map((l) => (
                    <div key={l.id} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{l.label}</span>
                      <span className="whitespace-nowrap tabular-nums">{cel[l.id] ? fmtBRL(cel[l.id]) : "—"}</span>
                    </div>
                  ))}
                  <Button variant={selecionada === c.id ? "secondary" : "outline"} size="sm" className="mt-2 w-full" onClick={() => alternar(c.id)}>
                    {selecionada === c.id ? "Mostrar todas as semanas" : "Ver estas solicitações na lista"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {semPrazo > 0 && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          {semPrazo} {semPrazo === 1 ? "solicitação ainda não comprada está" : "solicitações ainda não compradas estão"} sem “Comprar até” e {semPrazo === 1 ? "fica" : "ficam"} fora do bloco.
        </p>
      )}
    </section>
  );
}
